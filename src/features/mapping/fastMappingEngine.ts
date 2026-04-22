/**
 * 高性能 Mapper 映射引擎
 *
 * 核心优化：
 * 1. 完整的双向索引体系，O(1) 查找
 * 2. namespace 作为主键，符合 MyBatis 设计
 * 3. 多级缓存策略
 * 4. 延迟加载和按需扫描
 */

import { EventEmitter } from "events";
import {
  MapperMapping,
  MethodMapping,
  JavaMapperInfo,
  XmlMapperInfo,
  Position,
  QueryContext,
} from "./types";
import { Logger } from "../../utils/logger";
import { JavaParameter } from "../../services/types";
import { EnhancedJavaMethodParser } from "../../services/parsing/javaMethodParser";

/**
 * 映射索引结构
 */
interface MappingIndex {
  namespace: string;
  moduleId: string;  // 新增：模块标识
  javaPath: string;
  xmlPath?: string;
  className: string;
  simpleClassName: string;
  packageName: string;
  methods: Map<string, MethodMapping>;
  methodParameters?: Map<string, JavaParameter[]>; // methodName -> parameters
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

  /** 主索引：compositeKey(moduleId::namespace) -> MappingIndex (O(1)) */
  private moduleNamespaceIndex: Map<string, MappingIndex> = new Map();

  /** 反向索引：namespace -> moduleId[]（用于无模块上下文时的 fallback） */
  private namespaceToModules: Map<string, string[]> = new Map();

  /** 反向索引：javaPath -> compositeKey */
  private javaPathIndex: Map<string, string> = new Map();

  /** 反向索引：xmlPath -> compositeKey */
  private xmlPathIndex: Map<string, string> = new Map();

  /** 类名索引：simpleClassName -> Set<compositeKey> */
  private classNameIndex: Map<string, Set<string>> = new Map();

  /** 包名索引：packagePrefix -> Set<compositeKey>（用于快速过滤） */
  private packageIndex: Map<string, Set<string>> = new Map();

  // ========== 缓存 ==========

  private fsCache: FileSystemCache = {
    xmlFiles: new Map(),
    javaFiles: new Map(),
    lastScanTime: 0,
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
    cacheMisses: 0,
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

  private getCompositeKey(moduleId: string, namespace: string): string {
    return `${moduleId}::${namespace}`;
  }

  public async initialize(): Promise<void> {
    const { Logger } = await import("../../utils/logger.js");
    this.logger = Logger.getInstance();
    this.javaParser = EnhancedJavaMethodParser.getInstance();
    this.startCleanupTimer();
  }

  /**
   * Start scheduled cleanup timer
   */
  public startCleanupTimer(
    intervalMs: number = this.DEFAULT_CLEANUP_INTERVAL,
  ): void {
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
      this.logger?.debug("Stopped cleanup timer");
    }
  }

  /**
   * Remove entries for files that no longer exist or have been modified
   */
  private async cleanupStaleEntries(): Promise<number> {
    let removed = 0;
    const fs = await import("fs/promises");

    for (const mapping of this.moduleNamespaceIndex.values()) {
      try {
        if (mapping.javaPath) {
          await fs.access(mapping.javaPath);
        }
        if (mapping.xmlPath) {
          await fs.access(mapping.xmlPath);
        }
      } catch {
        this.removeMapping(mapping.javaPath);
        removed++;
      }
    }

    if (removed > 0) {
      this.logger?.info(`Cleaned up ${removed} stale mappings`);
    }

    this.logger?.debug(
      `Cache stats: ${this.moduleNamespaceIndex.size} mappings, ${this.stats.totalMethods} methods`,
    );

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
  public buildMapping(
    javaInfo: JavaMapperInfo,
    xmlInfo?: XmlMapperInfo,
    moduleId: string = "default",
  ): MappingIndex {
    const namespace = xmlInfo?.namespace || javaInfo.className;
    const simpleClassName = javaInfo.className.substring(
      javaInfo.className.lastIndexOf(".") + 1,
    );

    // 构建方法映射：从 XML 的 SQL 语句建立
    // 这样即使 Java 方法格式不标准（多行参数等）也能正确处理
    const methods = new Map<string, MethodMapping>();

    if (xmlInfo?.statements) {
      for (const [sqlId, statement] of xmlInfo.statements) {
        const methodMapping: MethodMapping = {
          methodName: sqlId,
          sqlId: sqlId,
          javaPosition: { line: 0, column: 0 }, // 将在 CodeLens 阶段用 Java API 获取
          xmlPosition: { line: statement.line, column: statement.column },
        };
        methods.set(sqlId, methodMapping);
      }
    }

    const mapping: MappingIndex = {
      namespace,
      moduleId,
      javaPath: javaInfo.filePath,
      xmlPath: xmlInfo?.filePath,
      className: javaInfo.className,
      simpleClassName,
      packageName: javaInfo.packageName,
      methods,
      methodParameters: new Map(),
      lastUpdated: Date.now(),
    };

    // 更新所有索引
    this.updateIndexes(mapping);

    // 异步解析方法参数（不阻塞映射构建）
    this.parseMethodParametersAsync(mapping, javaInfo);

    this.emit("mappingBuilt", this.toMapperMapping(mapping));
    this.logger?.debug(
      `Built mapping: ${namespace} -> Java: ${javaInfo.filePath}, XML: ${xmlInfo?.filePath || "none"}, Methods: ${methods.size}`,
    );

    return mapping;
  }

  /**
   * 批量建立映射（用于初始化时）
   */
  public buildMappings(
    pairs: Array<{ java: JavaMapperInfo; xml?: XmlMapperInfo; moduleId?: string }>,
  ): void {
    const startTime = Date.now();

    for (const { java, xml, moduleId } of pairs) {
      this.buildMapping(java, xml, moduleId || "default");
    }

    this.logger?.info(
      `Built ${pairs.length} mappings in ${Date.now() - startTime}ms`,
    );
    this.emit("mappingsBatchBuilt", pairs.length);
  }

  // ========== O(1) 快速查找 ==========

  /**
   * 通过 namespace 获取映射 - O(1) ~ O(n)
   *
   * @param namespace - namespace
   * @param referencePath - 可选的参考路径，用于在多个相同 namespace 的映射中选择最佳匹配
   */
  public getByNamespace(
    namespace: string,
    context?: QueryContext,
  ): MapperMapping | undefined {
    // 优先使用模块上下文（O(1)）
    if (context?.moduleId) {
      const key = this.getCompositeKey(context.moduleId, namespace);
      const mapping = this.moduleNamespaceIndex.get(key);
      if (mapping) {
        return this.toMapperMapping(mapping);
      }
    }

    // Fallback: 使用 referencePath 进行路径相似度匹配
    if (context?.referencePath) {
      const modules = this.namespaceToModules.get(namespace);
      if (modules && modules.length > 0) {
        const candidates = modules
          .map((m) => this.moduleNamespaceIndex.get(this.getCompositeKey(m, namespace)))
          .filter((m): m is MappingIndex => !!m);
        const bestMatch = this.findBestMatchByPath(candidates, context.referencePath);
        if (bestMatch) {
          return this.toMapperMapping(bestMatch);
        }
      }
    }

    // 最后的 fallback: 返回第一个（仅单模块场景）
    const modules = this.namespaceToModules.get(namespace);
    if (modules && modules.length > 0) {
      const first = this.moduleNamespaceIndex.get(this.getCompositeKey(modules[0], namespace));
      if (first) {
        return this.toMapperMapping(first);
      }
    }

    return undefined;
  }

  /**
   * 通过 Java 文件路径获取映射 - O(1)
   *
   * 注意：在 macOS/Windows 上文件系统不区分大小写，所以使用小写路径作为 key
   * 同时处理 Unicode 规范化（NFC/NFD）
   */
  public getByJavaPath(javaPath: string): MapperMapping | undefined {
    const normalizedPath = javaPath.normalize("NFC").toLowerCase();
    const compositeKey = this.javaPathIndex.get(normalizedPath);
    if (!compositeKey) {
      return undefined;
    }
    const mapping = this.moduleNamespaceIndex.get(compositeKey);
    return mapping ? this.toMapperMapping(mapping) : undefined;
  }

  /**
   * 通过 XML 文件路径获取映射 - O(1)
   *
   * 注意：在 macOS/Windows 上文件系统不区分大小写，所以使用小写路径作为 key
   * 同时处理 Unicode 规范化（NFC/NFD）
   */
  public getByXmlPath(xmlPath: string): MapperMapping | undefined {
    const normalizedPath = xmlPath.normalize("NFC").toLowerCase();
    const compositeKey = this.xmlPathIndex.get(normalizedPath);
    if (!compositeKey) {
      return undefined;
    }
    const mapping = this.moduleNamespaceIndex.get(compositeKey);
    return mapping ? this.toMapperMapping(mapping) : undefined;
  }

  /**
   * 通过类名获取映射
   * 支持全限定类名和简单类名
   *
   * @param className - 类名（全限定或简单类名）
   * @param referencePath - 可选的参考路径，用于路径相似度匹配
   */
  public getByClassName(
    className: string,
    context?: QueryContext,
  ): MapperMapping | undefined {
    // 1. 尝试作为全限定类名直接匹配 namespace
    const modules = this.namespaceToModules.get(className);
    if (modules && modules.length > 0) {
      if (modules.length === 1) {
        const key = this.getCompositeKey(modules[0], className);
        const mapping = this.moduleNamespaceIndex.get(key);
        if (mapping) {
          return this.toMapperMapping(mapping);
        }
      }

      // 有多个模块，尝试用 context 选择
      if (context?.moduleId) {
        const key = this.getCompositeKey(context.moduleId, className);
        const mapping = this.moduleNamespaceIndex.get(key);
        if (mapping) {
          return this.toMapperMapping(mapping);
        }
      }

      if (context?.referencePath) {
        const candidates = modules
          .map((m) => this.moduleNamespaceIndex.get(this.getCompositeKey(m, className)))
          .filter((m): m is MappingIndex => !!m);
        const bestMatch = this.findBestMatchByPath(candidates, context.referencePath);
        if (bestMatch) {
          return this.toMapperMapping(bestMatch);
        }
      }

      // 无上下文，返回第一个
      const key = this.getCompositeKey(modules[0], className);
      const mapping = this.moduleNamespaceIndex.get(key);
      if (mapping) {
        return this.toMapperMapping(mapping);
      }
    }

    // 2. 尝试作为简单类名查找
    const compositeKeys = this.classNameIndex.get(className);
    if (compositeKeys && compositeKeys.size > 0) {
      const candidates: MappingIndex[] = [];
      for (const key of compositeKeys) {
        const mapping = this.moduleNamespaceIndex.get(key);
        if (mapping) {
          candidates.push(mapping);
        }
      }

      if (candidates.length === 1) {
        return this.toMapperMapping(candidates[0]);
      }

      if (context?.referencePath && candidates.length > 1) {
        const bestMatch = this.findBestMatchByPath(candidates, context.referencePath);
        if (bestMatch) {
          return this.toMapperMapping(bestMatch);
        }
      }

      return this.toMapperMapping(candidates[0]);
    }

    return undefined;
  }

  /**
   * 通过路径相似度找到最佳匹配的映射
   * 用于多模块项目中同名 Mapper 的区分
   */
  private findBestMatchByPath(
    mappings: MappingIndex[],
    referencePath: string,
  ): MappingIndex | undefined {
    const normalizedRefPath = referencePath
      .normalize("NFC")
      .toLowerCase()
      .replace(/\\/g, "/");
    const refParts = normalizedRefPath.split("/");

    let bestMatch: MappingIndex | undefined;
    let bestScore = -1;

    for (const mapping of mappings) {
      // 计算 Java 路径相似度
      const javaPathScore = this.calculatePathScore(
        mapping.javaPath,
        refParts,
      );

      // 如果存在 XML 路径，也计算 XML 路径相似度
      let xmlPathScore = 0;
      if (mapping.xmlPath) {
        xmlPathScore = this.calculatePathScore(mapping.xmlPath, refParts);
      }

      // 总得分 = Java 路径得分 + XML 路径得分（如果有）
      const totalScore = javaPathScore + xmlPathScore * 0.5;

      if (totalScore > bestScore) {
        bestScore = totalScore;
        bestMatch = mapping;
      }
    }

    this.logger?.debug(
      `Best match by path for ${referencePath}: ${bestMatch?.className || "none"} (score: ${bestScore})`,
    );

    return bestMatch;
  }

  /**
   * 计算路径相似度得分
   */
  private calculatePathScore(path: string, refParts: string[]): number {
    const normalizedPath = path.normalize("NFC").toLowerCase().replace(/\\/g, "/");
    const pathParts = normalizedPath.split("/");

    let score = 0;

    // 1. 检查模块/服务名匹配
    const refModuleIndex = refParts.findIndex(
      (p) => p === "src" || p === "main" || p === "java" || p === "resources",
    );
    const pathModuleIndex = pathParts.findIndex(
      (p) => p === "src" || p === "main" || p === "java" || p === "resources",
    );

    if (refModuleIndex > 0 && pathModuleIndex > 0) {
      const refModule = refParts[refModuleIndex - 1];
      const pathModule = pathParts[pathModuleIndex - 1];
      if (refModule === pathModule) {
        score += 100; // 同模块匹配，高分奖励
      }
    }

    // 2. 查找共同路径段
    const minLen = Math.min(pathParts.length, refParts.length);
    for (let i = 0; i < minLen; i++) {
      if (pathParts[i] === refParts[i]) {
        score += 5;
      }
    }

    // 3. 距离惩罚
    const pathDiff = Math.abs(pathParts.length - refParts.length);
    score -= pathDiff * 2;

    return score;
  }

  /**
   * 通过包前缀查找映射
   */
  public findByPackagePrefix(packagePrefix: string): MapperMapping[] {
    const compositeKeys = this.packageIndex.get(packagePrefix);
    if (!compositeKeys) {
      return [];
    }

    const results: MapperMapping[] = [];
    for (const key of compositeKeys) {
      const mapping = this.moduleNamespaceIndex.get(key);
      if (mapping) {
        results.push(this.toMapperMapping(mapping));
      }
    }
    return results;
  }

  /**
   * 获取方法映射
   */
  public getMethodMapping(
    javaPath: string,
    methodName: string,
  ): MethodMapping | undefined {
    const normalizedPath = javaPath.normalize("NFC").toLowerCase();
    const compositeKey = this.javaPathIndex.get(normalizedPath);
    if (!compositeKey) {
      return undefined;
    }
    const mapping = this.moduleNamespaceIndex.get(compositeKey);
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
    const modules = this.namespaceToModules.get(namespace);
    if (!modules || modules.length === 0) {
      return false;
    }
    // 遍历所有相同 namespace 的映射
    for (const moduleId of modules) {
      const key = this.getCompositeKey(moduleId, namespace);
      const mapping = this.moduleNamespaceIndex.get(key);
      if (mapping) {
        // 检查方法是否有 SQL
        const methodWithParams = mapping.methods.get(methodName);
        if (methodWithParams && methodWithParams.xmlPosition !== undefined) {
          return true;
        }
        const methodNameWithoutParams = methodName.split("(")[0];
        const methodWithoutParams = mapping.methods.get(methodNameWithoutParams);
        if (methodWithoutParams && methodWithoutParams.xmlPosition !== undefined) {
          return true;
        }
      }
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
    const normalizedPath = javaPath.normalize("NFC").toLowerCase();
    const compositeKey = this.javaPathIndex.get(normalizedPath);
    if (!compositeKey) {
      return false;
    }
    const mapping = this.moduleNamespaceIndex.get(compositeKey);
    if (!mapping) {
      return false;
    }

    // 如果方法已存在，不需要添加
    if (mapping.methods.has(methodName)) {
      return true;
    }

    // 添加新方法映射
    const methodMapping: MethodMapping = {
      methodName: methodName,
      sqlId: methodName,
      javaPosition: { line: 0, column: 0 },
      xmlPosition: { line: 0, column: 0 },
    };

    mapping.methods.set(methodName, methodMapping);
    mapping.lastUpdated = Date.now();

    // 更新统计
    this.stats.totalMethods++;

    this.logger?.debug(
      `[FastMappingEngine] Added method mapping: ${mapping.namespace}.${methodName}`,
    );
    this.emit("mappingUpdated", this.toMapperMapping(mapping));

    return true;
  }

  // ========== 智能匹配 ==========

  /**
   * 智能查找 XML 对应的 Java Mapper
   * 用于当 XML 变更时，快速找到对应的 Java 文件
   *
   * @param xmlPath - XML 文件路径
   * @param namespace - XML namespace
   * @returns MapperMapping | undefined
   */
  public findJavaForXml(
    xmlPath: string,
    namespace: string,
  ): MapperMapping | undefined {
    // 1. 已经有映射 - O(1)
    const existing = this.getByXmlPath(xmlPath);
    if (existing) {
      return existing;
    }

    // 2. 通过 namespace 查找，传入 xmlPath 作为参考路径
    const byNamespace = this.getByNamespace(namespace, { referencePath: xmlPath });
    if (byNamespace) {
      this.updateXmlPath(byNamespace.javaPath, xmlPath);
      return this.getByJavaPath(byNamespace.javaPath);
    }

    // 3. 尝试通过简单类名匹配
    const simpleClassName = namespace.substring(namespace.lastIndexOf(".") + 1);
    const candidateKeys = this.classNameIndex.get(simpleClassName);
    if (candidateKeys && candidateKeys.size > 0) {
      const candidates: MappingIndex[] = [];
      for (const key of candidateKeys) {
        const mapping = this.moduleNamespaceIndex.get(key);
        if (mapping) {
          candidates.push(mapping);
        }
      }

      if (candidates.length === 1) {
        this.updateXmlPath(candidates[0].javaPath, xmlPath);
        return this.getByJavaPath(candidates[0].javaPath);
      } else if (candidates.length > 1) {
        const bestMatch = this.findBestMatchByPath(candidates, xmlPath);
        if (bestMatch) {
          this.updateXmlPath(bestMatch.javaPath, xmlPath);
          return this.getByJavaPath(bestMatch.javaPath);
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

    for (const mapping of this.moduleNamespaceIndex.values()) {
      if (
        mapping.namespace.toLowerCase().includes(lowerQuery) ||
        mapping.simpleClassName.toLowerCase().includes(lowerQuery) ||
        mapping.javaPath.toLowerCase().includes(lowerQuery) ||
        mapping.xmlPath?.toLowerCase().includes(lowerQuery)
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
    const normalizedPath = javaPath.normalize("NFC").toLowerCase();
    const compositeKey = this.javaPathIndex.get(normalizedPath);
    if (!compositeKey) {
      return false;
    }

    const mapping = this.moduleNamespaceIndex.get(compositeKey);
    if (!mapping) {
      return false;
    }

    // 移除旧的 xmlPath 索引
    if (mapping.xmlPath) {
      this.xmlPathIndex.delete(mapping.xmlPath.normalize("NFC").toLowerCase());
    }

    // 更新映射
    mapping.xmlPath = xmlPath;
    mapping.lastUpdated = Date.now();

    // 添加新的 xmlPath 索引
    this.xmlPathIndex.set(xmlPath.normalize("NFC").toLowerCase(), compositeKey);

    this.emit("mappingUpdated", this.toMapperMapping(mapping));
    return true;
  }

  /**
   * 同步 XML 方法列表（用于 XML 文件变更时）
   * 会添加新方法、更新现有方法位置、删除已不存在的方法
   */
  public syncXmlMethods(
    javaPath: string,
    xmlStatements: Map<string, Position>,
  ): boolean {
    const normalizedPath = javaPath.normalize("NFC").toLowerCase();
    const compositeKey = this.javaPathIndex.get(normalizedPath);
    if (!compositeKey) {
      return false;
    }

    const mapping = this.moduleNamespaceIndex.get(compositeKey);
    if (!mapping) {
      return false;
    }

    // 1. 收集 XML 中存在的方法名
    const xmlMethodNames = new Set(xmlStatements.keys());

    // 2. 删除 XML 中已不存在的方法映射
    for (const [methodName, methodMapping] of mapping.methods.entries()) {
      if (!xmlMethodNames.has(methodName)) {
        methodMapping.xmlPosition = undefined;
      }
    }

    // 3. 更新或添加方法
    for (const [methodName, xmlPosition] of xmlStatements.entries()) {
      const methodMapping = mapping.methods.get(methodName);
      if (methodMapping) {
        methodMapping.xmlPosition = xmlPosition;
      } else {
        mapping.methods.set(methodName, {
          methodName: methodName,
          sqlId: methodName,
          javaPosition: { line: 0, column: 0 },
          xmlPosition: xmlPosition,
        });
      }
    }

    mapping.lastUpdated = Date.now();
    this.emit("mappingUpdated", this.toMapperMapping(mapping));
    return true;
  }

  /**
   * 更新方法位置（用于增量更新）
   * @deprecated 使用 syncXmlMethods 替代
   */
  public updateMethodPositions(
    javaPath: string,
    xmlStatements: Map<string, Position>,
  ): boolean {
    return this.syncXmlMethods(javaPath, xmlStatements);
  }

  /**
   * 移除映射
   */
  public removeMapping(javaPath: string): boolean {
    const normalizedPath = javaPath.normalize("NFC").toLowerCase();
    const compositeKey = this.javaPathIndex.get(normalizedPath);
    if (!compositeKey) {
      return false;
    }

    const mapping = this.moduleNamespaceIndex.get(compositeKey);
    if (!mapping) {
      return false;
    }

    // 从主索引移除
    this.moduleNamespaceIndex.delete(compositeKey);

    // 从 namespaceToModules 移除
    const modules = this.namespaceToModules.get(mapping.namespace);
    if (modules) {
      const idx = modules.indexOf(mapping.moduleId);
      if (idx >= 0) {
        modules.splice(idx, 1);
        if (modules.length === 0) {
          this.namespaceToModules.delete(mapping.namespace);
        }
      }
    }

    // 清理其他索引
    this.javaPathIndex.delete(normalizedPath);
    if (mapping.xmlPath) {
      this.xmlPathIndex.delete(mapping.xmlPath.normalize("NFC").toLowerCase());
    }

    // 清理类名索引
    const classNames = this.classNameIndex.get(mapping.simpleClassName);
    if (classNames) {
      classNames.delete(compositeKey);
      if (classNames.size === 0) {
        this.classNameIndex.delete(mapping.simpleClassName);
      }
    }

    // 清理包名索引
    this.removeFromPackageIndex(compositeKey, mapping.packageName);

    this.emit("mappingRemoved", javaPath);
    return true;
  }

  /**
   * 移除 XML 映射（当 XML 文件被删除时）
   */
  public removeXmlMapping(xmlPath: string): boolean {
    const normalizedPath = xmlPath.normalize("NFC").toLowerCase();
    const compositeKey = this.xmlPathIndex.get(normalizedPath);
    if (!compositeKey) {
      return false;
    }

    const mapping = this.moduleNamespaceIndex.get(compositeKey);
    if (!mapping) {
      return false;
    }

    this.xmlPathIndex.delete(normalizedPath);
    mapping.xmlPath = undefined;

    // 清除所有方法的 xmlPosition
    for (const methodMapping of mapping.methods.values()) {
      methodMapping.xmlPosition = undefined;
    }

    mapping.lastUpdated = Date.now();
    this.emit("mappingUpdated", this.toMapperMapping(mapping));
    return true;
  }

  // ========== 索引维护 ==========

  private updateIndexes(mapping: MappingIndex): void {
    const { namespace, moduleId, javaPath, xmlPath, simpleClassName, packageName } = mapping;
    const compositeKey = this.getCompositeKey(moduleId, namespace);

    // 主索引 - O(1) 直接存储
    this.moduleNamespaceIndex.set(compositeKey, mapping);

    // namespace -> modules 反向索引
    const existingModules = this.namespaceToModules.get(namespace);
    if (existingModules) {
      if (!existingModules.includes(moduleId)) {
        existingModules.push(moduleId);
      }
    } else {
      this.namespaceToModules.set(namespace, [moduleId]);
    }

    // 反向索引
    this.javaPathIndex.set(javaPath.normalize("NFC").toLowerCase(), compositeKey);
    if (xmlPath) {
      this.xmlPathIndex.set(xmlPath.normalize("NFC").toLowerCase(), compositeKey);
    }

    // 类名索引 - 存储 compositeKey
    const existingClasses = this.classNameIndex.get(simpleClassName);
    if (existingClasses) {
      existingClasses.add(compositeKey);
    } else {
      this.classNameIndex.set(simpleClassName, new Set([compositeKey]));
    }

    // 包名索引
    this.addToPackageIndex(compositeKey, packageName);
  }

  private addToPackageIndex(compositeKey: string, packageName: string): void {
    const parts = packageName.split(".");
    let prefix = "";

    for (let i = 0; i < parts.length; i++) {
      prefix = prefix ? `${prefix}.${parts[i]}` : parts[i];
      const existing = this.packageIndex.get(prefix);
      if (existing) {
        existing.add(compositeKey);
      } else {
        this.packageIndex.set(prefix, new Set([compositeKey]));
      }
    }
  }

  private removeFromPackageIndex(compositeKey: string, packageName: string): void {
    const parts = packageName.split(".");
    let prefix = "";

    for (let i = 0; i < parts.length; i++) {
      prefix = prefix ? `${prefix}.${parts[i]}` : parts[i];
      const existing = this.packageIndex.get(prefix);
      if (existing) {
        existing.delete(compositeKey);
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
  public updateFsCache(
    filePath: string,
    info: {
      isXml: boolean;
      namespace?: string;
      className?: string;
      mtime: number;
    },
  ): void {
    if (info.isXml && info.namespace) {
      this.fsCache.xmlFiles.set(filePath, {
        namespace: info.namespace,
        mtime: info.mtime,
      });
    } else if (!info.isXml && info.className) {
      this.fsCache.javaFiles.set(filePath, {
        className: info.className,
        mtime: info.mtime,
      });
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
      lastUpdated: index.lastUpdated,
    };
  }

  // ========== 参数缓存管理 ==========

  /**
   * 异步解析方法参数
   * 不阻塞映射构建，在后台解析参数信息
   */
  private async parseMethodParametersAsync(
    mapping: MappingIndex,
    javaInfo: JavaMapperInfo,
  ): Promise<void> {
    if (!this.javaParser) {
      return;
    }

    try {
      // 读取 Java 文件内容
      const fs = await import("fs/promises");
      const content = await fs.readFile(javaInfo.filePath, "utf-8");

      // 为每个方法解析参数
      for (const methodName of mapping.methods.keys()) {
        try {
          // 从文件内容中提取方法签名
          const methodSignature = this.extractMethodSignature(
            content,
            methodName,
          );
          if (methodSignature) {
            const parameters =
              this.javaParser!.parseMethodParameters(methodSignature);
            if (parameters.length > 0) {
              mapping.methodParameters?.set(methodName, parameters);
            }
          }
        } catch (error) {
          this.logger?.debug(
            `Failed to parse parameters for ${methodName}:`,
            error,
          );
        }
      }

      this.logger?.debug(
        `Parsed parameters for ${mapping.namespace}: ${mapping.methodParameters?.size || 0} methods`,
      );
    } catch (error) {
      this.logger?.debug(
        `Failed to parse method parameters for ${javaInfo.filePath}:`,
        error,
      );
    }
  }

  /**
   * 从文件内容中提取方法签名
   */
  private extractMethodSignature(
    content: string,
    methodName: string,
  ): string | null {
    // 匹配方法签名，支持多行
    const methodPattern = new RegExp(
      `(?:public|private|protected)?\\s*(?:static|final|abstract)?\\s*([\\w<>,\\s\\[\\]]+?)\\s+${methodName}\\s*\\((.*?)\\)\\s*(?:throws\\s+[\\w,\\s]+)?\\s*[;{]`,
      "s",
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
  public getMethodParameters(
    javaPath: string,
    methodName: string,
  ): JavaParameter[] | undefined {
    const normalizedPath = javaPath.normalize("NFC").toLowerCase();
    const compositeKey = this.javaPathIndex.get(normalizedPath);
    if (!compositeKey) {
      return undefined;
    }
    const mapping = this.moduleNamespaceIndex.get(compositeKey);
    return mapping?.methodParameters?.get(methodName);
  }

  /**
   * 更新方法参数缓存（用于增量更新）
   */
  public updateMethodParameters(
    javaPath: string,
    methodName: string,
    parameters: JavaParameter[],
  ): boolean {
    const normalizedPath = javaPath.normalize("NFC").toLowerCase();
    const compositeKey = this.javaPathIndex.get(normalizedPath);
    if (!compositeKey) {
      return false;
    }
    const mapping = this.moduleNamespaceIndex.get(compositeKey);
    if (!mapping) {
      return false;
    }

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
    const results: MapperMapping[] = [];
    for (const mapping of this.moduleNamespaceIndex.values()) {
      results.push(this.toMapperMapping(mapping));
    }
    return results;
  }

  public hasMapping(javaPath: string): boolean {
    return this.javaPathIndex.has(javaPath.normalize("NFC").toLowerCase());
  }

  public hasXmlMapping(xmlPath: string): boolean {
    return this.xmlPathIndex.has(xmlPath.normalize("NFC").toLowerCase());
  }

  public getStats() {
    let withXml = 0;
    let totalMethods = 0;

    for (const mapping of this.moduleNamespaceIndex.values()) {
      if (mapping.xmlPath) {
        withXml++;
      }
      totalMethods += mapping.methods.size;
    }

    return {
      total: this.moduleNamespaceIndex.size,
      withXml,
      totalMethods,
      uniqueClassNames: this.classNameIndex.size,
      cacheHits: this.stats.cacheHits,
      cacheMisses: this.stats.cacheMisses,
    };
  }

  public clear(): void {
    this.moduleNamespaceIndex.clear();
    this.namespaceToModules.clear();
    this.javaPathIndex.clear();
    this.xmlPathIndex.clear();
    this.classNameIndex.clear();
    this.packageIndex.clear();
    this.fsCache.xmlFiles.clear();
    this.fsCache.javaFiles.clear();
    this.emit("mappingsCleared");
  }

  /**
   * 获取诊断信息
   */
  public getDiagnostics(): object {
    return {
      indexSizes: {
        moduleNamespace: this.moduleNamespaceIndex.size,
        namespaceToModules: this.namespaceToModules.size,
        javaPath: this.javaPathIndex.size,
        xmlPath: this.xmlPathIndex.size,
        className: this.classNameIndex.size,
        package: this.packageIndex.size,
      },
      cacheSizes: {
        xmlFiles: this.fsCache.xmlFiles.size,
        javaFiles: this.fsCache.javaFiles.size,
      },
      stats: this.getStats(),
    };
  }
}
