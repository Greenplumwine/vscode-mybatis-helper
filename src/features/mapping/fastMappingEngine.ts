/**
 * 高性能 Mapper 映射引擎
 * 
 * 核心优化：
 * 1. 完整的双向索引体系，O(1) 查找
 * 2. namespace 作为主键，符合 MyBatis 设计
 * 3. 多级缓存策略
 * 4. 延迟加载和按需扫描
 */

import { EventEmitter } from 'events';
import { MapperMapping, MethodMapping, JavaMapperInfo, XmlMapperInfo, Position } from './types';
import { Logger } from '../../utils/logger';
import { JavaParameter } from '../../services/types';
import { EnhancedJavaMethodParser } from '../../services/parsing/javaMethodParser';

/**
 * 映射索引结构
 */
interface MappingIndex {
  namespace: string;
  javaPath: string;
  xmlPath?: string;
  className: string;
  simpleClassName: string;
  packageName: string;
  methods: Map<string, MethodMapping>;
  methodParameters?: Map<string, JavaParameter[]>;  // methodName -> parameters
  lastUpdated: number;
}

/**
 * 文件系统缓存
 */
interface FileSystemCache {
  xmlFiles: Map<string, { namespace: string; mtime: number }>;
  javaFiles: Map<string, { className: string; mtime: number }>;
  lastScanTime: number;
}

export class FastMappingEngine extends EventEmitter {
  private static instance: FastMappingEngine;
  
  // ========== 核心索引 ==========
  
  /** 主索引：namespace -> mapping */
  private namespaceIndex: Map<string, MappingIndex> = new Map();
  
  /** 反向索引：javaPath -> namespace */
  private javaPathIndex: Map<string, string> = new Map();
  
  /** 反向索引：xmlPath -> namespace */
  private xmlPathIndex: Map<string, string> = new Map();
  
  /** 类名索引：simpleClassName -> Set<namespace> */
  private classNameIndex: Map<string, Set<string>> = new Map();
  
  /** 包名索引：packagePrefix -> Set<namespace>（用于快速过滤） */
  private packageIndex: Map<string, Set<string>> = new Map();
  
  // ========== 缓存 ==========
  
  private fsCache: FileSystemCache = {
    xmlFiles: new Map(),
    javaFiles: new Map(),
    lastScanTime: 0
  };

  private logger!: Logger;

  // ========== 定时清理 ==========
  private cleanupInterval: NodeJS.Timeout | null = null;
  private readonly DEFAULT_CLEANUP_INTERVAL = 30 * 60 * 1000; // 30 minutes

  // ========== 统计 ==========
  private stats = {
    totalMappings: 0,
    withXml: 0,
    totalMethods: 0,
    cacheHits: 0,
    cacheMisses: 0
  };

  // ========== 参数解析器 ==========
  private javaParser?: EnhancedJavaMethodParser;

  private constructor() {
    super();
  }

  public static getInstance(): FastMappingEngine {
    if (!FastMappingEngine.instance) {
      FastMappingEngine.instance = new FastMappingEngine();
    }
    return FastMappingEngine.instance;
  }

  public async initialize(): Promise<void> {
    const { Logger } = await import('../../utils/logger.js');
    this.logger = Logger.getInstance();
    this.javaParser = EnhancedJavaMethodParser.getInstance();
    this.startCleanupTimer();
  }

  /**
   * Start scheduled cleanup timer
   */
  public startCleanupTimer(intervalMs: number = this.DEFAULT_CLEANUP_INTERVAL): void {
    if (this.cleanupInterval) {
      clearInterval(this.cleanupInterval);
    }
    this.cleanupInterval = setInterval(() => {
      this.cleanupStaleEntries();
    }, intervalMs);
    this.logger?.debug(`Started cleanup timer with ${intervalMs}ms interval`);
  }

  /**
   * Stop cleanup timer
   */
  public stopCleanupTimer(): void {
    if (this.cleanupInterval) {
      clearInterval(this.cleanupInterval);
      this.cleanupInterval = null;
      this.logger?.debug('Stopped cleanup timer');
    }
  }

  /**
   * Remove entries for files that no longer exist or have been modified
   */
  private async cleanupStaleEntries(): Promise<number> {
    let removed = 0;
    const fs = await import('fs/promises');

    for (const [namespace, index] of this.namespaceIndex) {
      try {
        // Check if Java file still exists
        if (index.javaPath) {
          await fs.access(index.javaPath);
        }
        // Check if XML file still exists
        if (index.xmlPath) {
          await fs.access(index.xmlPath);
        }
      } catch {
        // File no longer exists, remove from indexes
        this.removeMapping(namespace);
        removed++;
      }
    }

    if (removed > 0) {
      this.logger?.info(`Cleaned up ${removed} stale mappings`);
    }

    // Log current stats
    this.logger?.debug(`Cache stats: ${this.namespaceIndex.size} namespaces, ${this.stats.totalMethods} methods`);

    return removed;
  }

  /**
   * Clean up resources when extension deactivates
   */
  public dispose(): void {
    this.stopCleanupTimer();
    this.removeAllListeners();
  }

  // ========== 核心操作：建立映射 ==========

  /**
   * 建立 Java 和 XML 的映射关系
   * 这是核心方法，负责维护所有索引
   * 
   * 新设计：
   * - 从 XML 中提取 SQL id 建立方法映射
   * - Java 方法位置不在扫描时确定（由 CodeLens 阶段用 Java API 动态获取）
   * - 这样支持任意格式的方法定义（多行参数等）
   */
  public buildMapping(javaInfo: JavaMapperInfo, xmlInfo?: XmlMapperInfo): MappingIndex {
    const namespace = xmlInfo?.namespace || javaInfo.className;
    const simpleClassName = javaInfo.className.substring(javaInfo.className.lastIndexOf('.') + 1);
    
    // 构建方法映射：从 XML 的 SQL 语句建立
    // 这样即使 Java 方法格式不标准（多行参数等）也能正确处理
    const methods = new Map<string, MethodMapping>();
    
    if (xmlInfo?.statements) {
      for (const [sqlId, statement] of xmlInfo.statements) {
        const methodMapping: MethodMapping = {
          methodName: sqlId,
          sqlId: sqlId,
          javaPosition: { line: 0, column: 0 },  // 将在 CodeLens 阶段用 Java API 获取
          xmlPosition: { line: statement.line, column: statement.column }
        };
        methods.set(sqlId, methodMapping);
      }
    }

    const mapping: MappingIndex = {
      namespace,
      javaPath: javaInfo.filePath,
      xmlPath: xmlInfo?.filePath,
      className: javaInfo.className,
      simpleClassName,
      packageName: javaInfo.packageName,
      methods,
      methodParameters: new Map(),
      lastUpdated: Date.now()
    };

    // 更新所有索引
    this.updateIndexes(mapping);

    // 异步解析方法参数（不阻塞映射构建）
    this.parseMethodParametersAsync(mapping, javaInfo);
    
    this.emit('mappingBuilt', this.toMapperMapping(mapping));
    this.logger?.debug(`Built mapping: ${namespace} -> Java: ${javaInfo.filePath}, XML: ${xmlInfo?.filePath || 'none'}, Methods: ${methods.size}`);
    
    return mapping;
  }

  /**
   * 批量建立映射（用于初始化时）
   */
  public buildMappings(pairs: Array<{ java: JavaMapperInfo; xml?: XmlMapperInfo }>): void {
    const startTime = Date.now();
    
    for (const { java, xml } of pairs) {
      this.buildMapping(java, xml);
    }
    
    this.logger?.info(`Built ${pairs.length} mappings in ${Date.now() - startTime}ms`);
    this.emit('mappingsBatchBuilt', pairs.length);
  }

  // ========== O(1) 快速查找 ==========

  /**
   * 通过 namespace 获取映射 - O(1)
   */
  public getByNamespace(namespace: string): MapperMapping | undefined {
    const mapping = this.namespaceIndex.get(namespace);
    return mapping ? this.toMapperMapping(mapping) : undefined;
  }

  /**
   * 通过 Java 文件路径获取映射 - O(1)
   * 
   * 注意：在 macOS/Windows 上文件系统不区分大小写，所以使用小写路径作为 key
   * 同时处理 Unicode 规范化（NFC/NFD）
   */
  public getByJavaPath(javaPath: string): MapperMapping | undefined {
    const normalizedPath = javaPath.normalize('NFC').toLowerCase();
    const namespace = this.javaPathIndex.get(normalizedPath);
    if (!namespace) return undefined;
    const mapping = this.namespaceIndex.get(namespace);
    return mapping ? this.toMapperMapping(mapping) : undefined;
  }

  /**
   * 通过 XML 文件路径获取映射 - O(1)
   * 
   * 注意：在 macOS/Windows 上文件系统不区分大小写，所以使用小写路径作为 key
   * 同时处理 Unicode 规范化（NFC/NFD）
   */
  public getByXmlPath(xmlPath: string): MapperMapping | undefined {
    const normalizedPath = xmlPath.normalize('NFC').toLowerCase();
    const namespace = this.xmlPathIndex.get(normalizedPath);
    if (!namespace) return undefined;
    const mapping = this.namespaceIndex.get(namespace);
    return mapping ? this.toMapperMapping(mapping) : undefined;
  }

  /**
   * 通过类名获取映射
   * 支持全限定类名和简单类名
   */
  public getByClassName(className: string): MapperMapping | undefined {
    // 1. 尝试作为全限定类名直接匹配 namespace - O(1)
    const byNamespace = this.namespaceIndex.get(className);
    if (byNamespace) {
      return this.toMapperMapping(byNamespace);
    }

    // 2. 尝试作为简单类名查找 - O(1) 索引 + O(k) k为同名类数量
    const namespaces = this.classNameIndex.get(className);
    if (namespaces && namespaces.size > 0) {
      // 如果有多个，返回第一个（通常用户会通过 Java 文件路径精确定位）
      const firstNamespace = namespaces.values().next().value;
      if (firstNamespace) {
        const mapping = this.namespaceIndex.get(firstNamespace);
        if (mapping) {
          return this.toMapperMapping(mapping);
        }
      }
    }

    return undefined;
  }

  /**
   * 通过包前缀查找映射
   */
  public findByPackagePrefix(packagePrefix: string): MapperMapping[] {
    const namespaces = this.packageIndex.get(packagePrefix);
    if (!namespaces) return [];
    
    const results: MapperMapping[] = [];
    for (const namespace of namespaces) {
      const mapping = this.namespaceIndex.get(namespace);
      if (mapping) {
        results.push(this.toMapperMapping(mapping));
      }
    }
    return results;
  }

  /**
   * 获取方法映射
   */
  public getMethodMapping(javaPath: string, methodName: string): MethodMapping | undefined {
    const namespace = this.javaPathIndex.get(javaPath.normalize('NFC').toLowerCase());
    if (!namespace) return undefined;
    
    const mapping = this.namespaceIndex.get(namespace);
    return mapping?.methods.get(methodName);
  }

  /**
   * 检查指定 namespace 和方法名是否有 SQL 映射
   * 
   * 用于 Java CodeLens 判断方法是否有对应的 SQL
   * 
   * 注意：Java 符号 API 返回的方法名可能带参数（如 "getA00s(String)"）
   * 但 XML 中存储的 SQL id 不带参数（如 "getA00s"）
   * 所以需要做适配匹配
   */
  public hasSqlForMethod(namespace: string, methodName: string): boolean {
    const mapping = this.namespaceIndex.get(namespace);
    if (!mapping) return false;

    // 1. 首先尝试完全匹配（带参数）
    const methodWithParams = mapping.methods.get(methodName);
    if (methodWithParams && methodWithParams.xmlPosition !== undefined) {
      return true;
    }

    // 2. 如果失败，尝试去掉参数部分匹配
    // Java 符号 API 返回："getA00s(String)" 或 "getPersonInfoByImport(List, String, String)"
    // XML 存储："getA00s" 或 "getPersonInfoByImport"
    const methodNameWithoutParams = methodName.split('(')[0];
    const methodWithoutParams = mapping.methods.get(methodNameWithoutParams);
    if (methodWithoutParams && methodWithoutParams.xmlPosition !== undefined) {
      return true;
    }

    return false;
  }

  /**
   * 手动添加方法映射（用于生成 XML 方法后立即更新）
   *
   * @param javaPath - Java 文件路径
   * @param methodName - 方法名
   * @returns 是否添加成功
   */
  public addMethodMapping(javaPath: string, methodName: string): boolean {
    const normalizedPath = javaPath.normalize('NFC').toLowerCase();
    const namespace = this.javaPathIndex.get(normalizedPath);
    if (!namespace) return false;

    const mapping = this.namespaceIndex.get(namespace);
    if (!mapping) return false;

    // 如果方法已存在，不需要添加
    if (mapping.methods.has(methodName)) {
      return true;
    }

    // 添加新方法映射
    const methodMapping: MethodMapping = {
      methodName: methodName,
      sqlId: methodName,
      javaPosition: { line: 0, column: 0 },
      xmlPosition: { line: 0, column: 0 }
    };

    mapping.methods.set(methodName, methodMapping);
    mapping.lastUpdated = Date.now();

    // 更新统计
    this.stats.totalMethods++;

    this.logger?.debug(`[FastMappingEngine] Added method mapping: ${namespace}.${methodName}`);
    this.emit('mappingUpdated', this.toMapperMapping(mapping));

    return true;
  }

  // ========== 智能匹配 ==========

  /**
   * 智能查找 XML 对应的 Java Mapper
   * 用于当 XML 变更时，快速找到对应的 Java 文件
   */
  public findJavaForXml(xmlPath: string, namespace: string): MapperMapping | undefined {
    // 1. 已经有映射 - O(1)
    const existing = this.getByXmlPath(xmlPath);
    if (existing) return existing;

    // 2. 通过 namespace 查找 - O(1)
    const byNamespace = this.getByNamespace(namespace);
    if (byNamespace) {
      // 更新 XML 路径
      this.updateXmlPath(byNamespace.javaPath, xmlPath);
      return this.getByJavaPath(byNamespace.javaPath);
    }

    // 3. 尝试通过简单类名匹配
    const simpleClassName = namespace.substring(namespace.lastIndexOf('.') + 1);
    const candidates = this.classNameIndex.get(simpleClassName);
    if (candidates && candidates.size === 1) {
      const candidateNamespace = candidates.values().next().value;
      if (candidateNamespace) {
        const mapping = this.namespaceIndex.get(candidateNamespace);
        if (mapping) {
          this.updateXmlPath(mapping.javaPath, xmlPath);
          return this.getByJavaPath(mapping.javaPath);
        }
      }
    }

    return undefined;
  }

  /**
   * 模糊搜索映射
   */
  public searchMappings(query: string): MapperMapping[] {
    const results: MapperMapping[] = [];
    const lowerQuery = query.toLowerCase();
    
    for (const mapping of this.namespaceIndex.values()) {
      if (
        mapping.namespace.toLowerCase().includes(lowerQuery) ||
        mapping.simpleClassName.toLowerCase().includes(lowerQuery) ||
        mapping.javaPath.toLowerCase().includes(lowerQuery) ||
        (mapping.xmlPath?.toLowerCase().includes(lowerQuery))
      ) {
        results.push(this.toMapperMapping(mapping));
      }
    }
    
    return results;
  }

  // ========== 更新操作 ==========

  /**
   * 更新 XML 路径（用于文件移动或新发现）
   */
  public updateXmlPath(javaPath: string, xmlPath: string): boolean {
    const namespace = this.javaPathIndex.get(javaPath.normalize('NFC').toLowerCase());
    if (!namespace) return false;

    const mapping = this.namespaceIndex.get(namespace);
    if (!mapping) return false;

    // 移除旧的 xmlPath 索引
    if (mapping.xmlPath) {
      this.xmlPathIndex.delete(mapping.xmlPath.normalize('NFC').toLowerCase());
    }

    // 更新映射
    mapping.xmlPath = xmlPath;
    mapping.lastUpdated = Date.now();

    // 添加新的 xmlPath 索引
    this.xmlPathIndex.set(xmlPath.normalize('NFC').toLowerCase(), namespace);

    this.emit('mappingUpdated', this.toMapperMapping(mapping));
    return true;
  }

  /**
   * 同步 XML 方法列表（用于 XML 文件变更时）
   * 会添加新方法、更新现有方法位置、删除已不存在的方法
   */
  public syncXmlMethods(javaPath: string, xmlStatements: Map<string, Position>): boolean {
    const namespace = this.javaPathIndex.get(javaPath.normalize('NFC').toLowerCase());
    if (!namespace) return false;

    const mapping = this.namespaceIndex.get(namespace);
    if (!mapping) return false;

    // 1. 收集 XML 中存在的方法名
    const xmlMethodNames = new Set(xmlStatements.keys());

    // 2. 删除 XML 中已不存在的方法映射
    for (const [methodName, methodMapping] of mapping.methods.entries()) {
      if (!xmlMethodNames.has(methodName)) {
        // 这个方法在 XML 中已不存在，清除其 xmlPosition
        methodMapping.xmlPosition = undefined;
      }
    }

    // 3. 更新或添加方法
    for (const [methodName, xmlPosition] of xmlStatements.entries()) {
      const methodMapping = mapping.methods.get(methodName);
      if (methodMapping) {
        // 更新现有方法的位置
        methodMapping.xmlPosition = xmlPosition;
      } else {
        // 添加新方法映射
        mapping.methods.set(methodName, {
          methodName: methodName,
          sqlId: methodName,
          javaPosition: { line: 0, column: 0 },
          xmlPosition: xmlPosition
        });
      }
    }

    mapping.lastUpdated = Date.now();
    this.emit('mappingUpdated', this.toMapperMapping(mapping));
    return true;
  }

  /**
   * 更新方法位置（用于增量更新）
   * @deprecated 使用 syncXmlMethods 替代
   */
  public updateMethodPositions(javaPath: string, xmlStatements: Map<string, Position>): boolean {
    return this.syncXmlMethods(javaPath, xmlStatements);
  }

  /**
   * 移除映射
   */
  public removeMapping(javaPath: string): boolean {
    const normalizedPath = javaPath.normalize('NFC').toLowerCase();
    const namespace = this.javaPathIndex.get(normalizedPath);
    if (!namespace) return false;

    const mapping = this.namespaceIndex.get(namespace);
    if (!mapping) return false;

    // 清理所有索引
    this.namespaceIndex.delete(namespace);
    this.javaPathIndex.delete(normalizedPath);
    if (mapping.xmlPath) {
      this.xmlPathIndex.delete(mapping.xmlPath.normalize('NFC').toLowerCase());
    }

    // 清理类名索引
    const classNames = this.classNameIndex.get(mapping.simpleClassName);
    if (classNames) {
      classNames.delete(namespace);
      if (classNames.size === 0) {
        this.classNameIndex.delete(mapping.simpleClassName);
      }
    }

    // 清理包名索引
    this.removeFromPackageIndex(namespace, mapping.packageName);

    this.emit('mappingRemoved', javaPath);
    return true;
  }

  /**
   * 移除 XML 映射（当 XML 文件被删除时）
   */
  public removeXmlMapping(xmlPath: string): boolean {
    const namespace = this.xmlPathIndex.get(xmlPath);
    if (!namespace) return false;

    const mapping = this.namespaceIndex.get(namespace);
    if (!mapping) return false;

    this.xmlPathIndex.delete(xmlPath);
    mapping.xmlPath = undefined;
    
    // 清除所有方法的 xmlPosition
    for (const methodMapping of mapping.methods.values()) {
      methodMapping.xmlPosition = undefined;
    }

    mapping.lastUpdated = Date.now();
    this.emit('mappingUpdated', this.toMapperMapping(mapping));
    return true;
  }

  // ========== 索引维护 ==========

  private updateIndexes(mapping: MappingIndex): void {
    const { namespace, javaPath, xmlPath, simpleClassName, packageName } = mapping;

    // 主索引
    this.namespaceIndex.set(namespace, mapping);

    // 反向索引（使用规范化+小写路径以支持各种文件系统）
    // normalize('NFC') 处理 macOS HFS+ 的 NFD 编码问题
    this.javaPathIndex.set(javaPath.normalize('NFC').toLowerCase(), namespace);
    if (xmlPath) {
      this.xmlPathIndex.set(xmlPath.normalize('NFC').toLowerCase(), namespace);
    }

    // 类名索引
    const existingClasses = this.classNameIndex.get(simpleClassName);
    if (existingClasses) {
      existingClasses.add(namespace);
    } else {
      this.classNameIndex.set(simpleClassName, new Set([namespace]));
    }

    // 包名索引（支持前缀查找）
    this.addToPackageIndex(namespace, packageName);
  }

  private addToPackageIndex(namespace: string, packageName: string): void {
    const parts = packageName.split('.');
    let prefix = '';
    
    for (let i = 0; i < parts.length; i++) {
      prefix = prefix ? `${prefix}.${parts[i]}` : parts[i];
      const existing = this.packageIndex.get(prefix);
      if (existing) {
        existing.add(namespace);
      } else {
        this.packageIndex.set(prefix, new Set([namespace]));
      }
    }
  }

  private removeFromPackageIndex(namespace: string, packageName: string): void {
    const parts = packageName.split('.');
    let prefix = '';
    
    for (let i = 0; i < parts.length; i++) {
      prefix = prefix ? `${prefix}.${parts[i]}` : parts[i];
      const existing = this.packageIndex.get(prefix);
      if (existing) {
        existing.delete(namespace);
        if (existing.size === 0) {
          this.packageIndex.delete(prefix);
        }
      }
    }
  }

  // ========== 缓存管理 ==========

  /**
   * 更新文件系统缓存
   */
  public updateFsCache(filePath: string, info: { isXml: boolean; namespace?: string; className?: string; mtime: number }): void {
    if (info.isXml && info.namespace) {
      this.fsCache.xmlFiles.set(filePath, { namespace: info.namespace, mtime: info.mtime });
    } else if (!info.isXml && info.className) {
      this.fsCache.javaFiles.set(filePath, { className: info.className, mtime: info.mtime });
    }
  }

  /**
   * 从缓存获取 namespace
   */
  public getNamespaceFromCache(xmlPath: string): string | undefined {
    return this.fsCache.xmlFiles.get(xmlPath)?.namespace;
  }

  // ========== 工具方法 ==========

  private toMapperMapping(index: MappingIndex): MapperMapping {
    return {
      className: index.className,
      javaPath: index.javaPath,
      xmlPath: index.xmlPath,
      namespace: index.namespace,
      methods: index.methods,
      lastUpdated: index.lastUpdated
    };
  }

  // ========== 参数缓存管理 ==========

  /**
   * 异步解析方法参数
   * 不阻塞映射构建，在后台解析参数信息
   */
  private async parseMethodParametersAsync(mapping: MappingIndex, javaInfo: JavaMapperInfo): Promise<void> {
    if (!this.javaParser) {
      return;
    }

    try {
      // 读取 Java 文件内容
      const fs = await import('fs/promises');
      const content = await fs.readFile(javaInfo.filePath, 'utf-8');

      // 为每个方法解析参数
      for (const methodName of mapping.methods.keys()) {
        try {
          // 从文件内容中提取方法签名
          const methodSignature = this.extractMethodSignature(content, methodName);
          if (methodSignature) {
            const parameters = this.javaParser!.parseMethodParameters(methodSignature);
            if (parameters.length > 0) {
              mapping.methodParameters?.set(methodName, parameters);
            }
          }
        } catch (error) {
          this.logger?.debug(`Failed to parse parameters for ${methodName}:`, error);
        }
      }

      this.logger?.debug(`Parsed parameters for ${mapping.namespace}: ${mapping.methodParameters?.size || 0} methods`);
    } catch (error) {
      this.logger?.debug(`Failed to parse method parameters for ${javaInfo.filePath}:`, error);
    }
  }

  /**
   * 从文件内容中提取方法签名
   */
  private extractMethodSignature(content: string, methodName: string): string | null {
    // 匹配方法签名，支持多行
    const methodPattern = new RegExp(
      `(?:public|private|protected)?\\s*(?:static|final|abstract)?\\s*([\\w<>,\\s\\[\\]]+?)\\s+${methodName}\\s*\\((.*?)\\)\\s*(?:throws\\s+[\\w,\\s]+)?\\s*[;{]`,
      's'
    );

    const match = methodPattern.exec(content);
    if (match) {
      return `${methodName}(${match[2]})`;
    }

    return null;
  }

  /**
   * 获取方法参数列表
   *
   * @param javaPath - Java 文件路径
   * @param methodName - 方法名
   * @returns JavaParameter 数组，未找到返回 undefined
   */
  public getMethodParameters(javaPath: string, methodName: string): JavaParameter[] | undefined {
    const namespace = this.javaPathIndex.get(javaPath.normalize('NFC').toLowerCase());
    if (!namespace) return undefined;

    const mapping = this.namespaceIndex.get(namespace);
    return mapping?.methodParameters?.get(methodName);
  }

  /**
   * 更新方法参数缓存（用于增量更新）
   */
  public updateMethodParameters(javaPath: string, methodName: string, parameters: JavaParameter[]): boolean {
    const namespace = this.javaPathIndex.get(javaPath.normalize('NFC').toLowerCase());
    if (!namespace) return false;

    const mapping = this.namespaceIndex.get(namespace);
    if (!mapping) return false;

    if (!mapping.methodParameters) {
      mapping.methodParameters = new Map();
    }

    mapping.methodParameters.set(methodName, parameters);
    mapping.lastUpdated = Date.now();

    // 使相关类型缓存失效
    for (const param of parameters) {
      this.javaParser?.invalidateCache(param.type);
    }

    return true;
  }

  // ========== 查询统计 ==========

  public getAllMappings(): MapperMapping[] {
    return Array.from(this.namespaceIndex.values()).map(m => this.toMapperMapping(m));
  }

  public hasMapping(javaPath: string): boolean {
    return this.javaPathIndex.has(javaPath.normalize('NFC').toLowerCase());
  }

  public hasXmlMapping(xmlPath: string): boolean {
    return this.xmlPathIndex.has(xmlPath.normalize('NFC').toLowerCase());
  }

  public getStats() {
    let withXml = 0;
    let totalMethods = 0;

    for (const mapping of this.namespaceIndex.values()) {
      if (mapping.xmlPath) withXml++;
      totalMethods += mapping.methods.size;
    }

    return {
      total: this.namespaceIndex.size,
      withXml,
      totalMethods,
      uniqueClassNames: this.classNameIndex.size,
      cacheHits: this.stats.cacheHits,
      cacheMisses: this.stats.cacheMisses
    };
  }

  public clear(): void {
    this.namespaceIndex.clear();
    this.javaPathIndex.clear();
    this.xmlPathIndex.clear();
    this.classNameIndex.clear();
    this.packageIndex.clear();
    this.fsCache.xmlFiles.clear();
    this.fsCache.javaFiles.clear();
    this.emit('mappingsCleared');
  }

  /**
   * 获取诊断信息
   */
  public getDiagnostics(): object {
    return {
      indexSizes: {
        namespace: this.namespaceIndex.size,
        javaPath: this.javaPathIndex.size,
        xmlPath: this.xmlPathIndex.size,
        className: this.classNameIndex.size,
        package: this.packageIndex.size
      },
      cacheSizes: {
        xmlFiles: this.fsCache.xmlFiles.size,
        javaFiles: this.fsCache.javaFiles.size
      },
      stats: this.getStats()
    };
  }
}
