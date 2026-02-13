/**
 * 高性能 Mapper 扫描器
 * 
 * 核心优化：
 * 1. 分层扫描策略（配置优先）
 * 2. 并行扫描 + 实时匹配
 * 3. 增量解析，避免重复I/O
 * 4. 智能缓存文件系统结构
 */

import * as vscode from 'vscode';
import { EventEmitter } from 'events';
import { FastMappingEngine } from './fastMappingEngine';
import { MyBatisXmlParser } from './xmlParser';
import { EnhancedJavaAPI } from './enhancedJavaAPI';
import { XmlLocationResolver } from './xmlLocationResolver';
import { JavaMapperInfo, XmlMapperInfo, MapperScanConfig, ScanProgressEvent, Position } from './types';

interface ScanConfig {
  maxXmlFiles: number;
  maxJavaFiles: number;
  batchSize: number;
  parallelLimit: number;
}

const DEFAULT_CONFIG: ScanConfig = {
  maxXmlFiles: 2000,
  maxJavaFiles: 5000,
  batchSize: 50,
  parallelLimit: 10
};

export class FastScanner extends EventEmitter {
  private static instance: FastScanner;
  private mappingEngine: FastMappingEngine;
  private xmlParser: MyBatisXmlParser;
  private javaAPI: EnhancedJavaAPI;
  private locationResolver: XmlLocationResolver;
  private logger: any;
  private config: ScanConfig;
  private isScanning: boolean = false;

  private constructor(config: Partial<ScanConfig> = {}) {
    super();
    this.config = { ...DEFAULT_CONFIG, ...config };
    this.mappingEngine = FastMappingEngine.getInstance();
    this.xmlParser = MyBatisXmlParser.getInstance();
    this.javaAPI = EnhancedJavaAPI.getInstance();
    this.locationResolver = XmlLocationResolver.getInstance();
  }

  public static getInstance(config?: Partial<ScanConfig>): FastScanner {
    if (!FastScanner.instance) {
      FastScanner.instance = new FastScanner(config);
    }
    return FastScanner.instance;
  }

  public async initialize(): Promise<void> {
    const { Logger } = await import('../../utils/logger.js');
    this.logger = Logger.getInstance();
    
    await this.mappingEngine.initialize();
    await this.xmlParser.initialize();
    await this.javaAPI.initialize();
    await this.locationResolver.initialize();
  }

  // ========== 主扫描入口 ==========

  /**
   * 执行快速扫描
   * 
   * 策略：
   * 1. 先获取配置（@MapperScan, mybatis-config.xml, application.yml）
   * 2. 基于配置并行扫描 XML 和 Java
   * 3. 实时匹配建立映射
   */
  public async scan(): Promise<void> {
    if (this.isScanning) {
      this.logger?.warn('Scan already in progress');
      return;
    }

    this.isScanning = true;
    this.emit('scanStarted');
    const startTime = Date.now();

    try {
      this.logger?.info('Starting fast mapper scan...');
      this.mappingEngine.clear();

      // Phase 1: 获取所有配置（并行）
      const [mapperScanConfigs, xmlLocations] = await Promise.all([
        this.getMapperScanConfigsFast(),
        this.locationResolver.resolveXmlLocations()
      ]);

      this.logger?.info(`Found ${mapperScanConfigs.length} @MapperScan configs, ${xmlLocations.length} XML locations`);

      // Phase 2: 基于配置的并行扫描
      if (mapperScanConfigs.length > 0 || xmlLocations.length > 0) {
        await this.scanWithConfig(mapperScanConfigs, xmlLocations);
      } else {
        // 没有配置时，使用启发式扫描
        await this.scanHeuristic();
      }

      const duration = Date.now() - startTime;
      const stats = this.mappingEngine.getStats();
      
      this.logger?.info(`Scan completed in ${duration}ms: ${stats.total} mappings, ${stats.withXml} with XML, ${stats.totalMethods} methods`);
      this.emit('scanCompleted', { duration, ...stats });

    } catch (error) {
      this.logger?.error('Scan failed:', error as Error);
      this.emit('scanError', error);
    } finally {
      this.isScanning = false;
    }
  }

  // ========== 配置获取（优化版）==========

  /**
   * 快速获取 @MapperScan 配置
   * 
   * 策略：
   * 1. 优先搜索配置类文件（Config, Application, Mybatis）
   * 2. 搜索特定目录（config, configuration）
   * 3. 全局搜索所有包含 @MapperScan 的 Java 文件
   */
  private async getMapperScanConfigsFast(): Promise<MapperScanConfig[]> {
    const startTime = Date.now();
    const configs: MapperScanConfig[] = [];
    const checkedFiles = new Set<string>();

    try {
      // ========== 策略1: 优先搜索配置类文件（最常见的模式）==========
      const configPatterns = [
        '**/*Config*.java',
        '**/*Configuration*.java',
        '**/*Application*.java',
        '**/*Mybatis*.java',
        '**/*Mapper*.java',
        '**/config/**/*.java',
        '**/configuration/**/*.java',
        '**/spring/**/*.java',
        '**/boot/**/*.java'
      ];

      for (const pattern of configPatterns) {
        const files = await vscode.workspace.findFiles(
          pattern,
          '**/{node_modules,.git,target,build,out}/**',
          50  // 增加限制以获取更多候选文件
        );

        for (const file of files) {
          if (checkedFiles.has(file.fsPath)) continue;
          checkedFiles.add(file.fsPath);

          const config = await this.parseMapperScanFromFile(file.fsPath);
          if (config) {
            configs.push(config);
            this.logger?.info(`Found @MapperScan in ${file.fsPath}: ${config.basePackages.join(', ')}`);
          }
        }

        // 如果已经找到足够多的配置，提前返回
        if (configs.length >= 3) {
          this.logger?.debug(`Found ${configs.length} @MapperScan configs early in phase 1`);
          return configs;
        }
      }

      // 如果策略1找到了一些配置，直接返回
      if (configs.length > 0) {
        this.logger?.debug(`Found ${configs.length} @MapperScan configs in phase 1`);
        return configs;
      }

      // ========== 策略2: 全局文本搜索（更彻底但较慢）==========
      this.logger?.info('Phase 1 found no @MapperScan, trying global text search...');
      
      const allJavaFiles = await vscode.workspace.findFiles(
        '**/*.java',
        '**/{node_modules,.git,target,build,out}/**',
        500  // 搜索更多文件
      );

      // 分批处理，避免阻塞
      const batchSize = 50;
      for (let i = 0; i < allJavaFiles.length && configs.length === 0; i += batchSize) {
        const batch = allJavaFiles.slice(i, i + batchSize);
        
        const batchResults = await Promise.all(
          batch.map(async (file) => {
            if (checkedFiles.has(file.fsPath)) return null;
            checkedFiles.add(file.fsPath);
            
            // 快速检查：文件是否包含 @MapperScan（不打开文档）
            try {
              const content = await vscode.workspace.fs.readFile(file);
              const text = Buffer.from(content).toString('utf-8');
              if (text.includes('@MapperScan')) {
                return this.parseMapperScanFromContent(text, file.fsPath);
              }
            } catch (e) {
              // 忽略读取错误
            }
            return null;
          })
        );

        for (const config of batchResults) {
          if (config) {
            configs.push(config);
            this.logger?.info(`Found @MapperScan via global search in ${config.sourceFile}: ${config.basePackages.join(', ')}`);
          }
        }

        // 每处理100个文件报告一次进度
        if (i % 100 === 0) {
          this.logger?.debug(`Checked ${Math.min(i + batchSize, allJavaFiles.length)}/${allJavaFiles.length} files...`);
        }
      }

      if (configs.length === 0) {
        this.logger?.info('No @MapperScan configuration found in the project');
      }

      this.logger?.debug(`Found ${configs.length} @MapperScan configs in ${Date.now() - startTime}ms`);
      return configs;

    } catch (error) {
      this.logger?.debug('Failed to get @MapperScan configs:', error);
      return configs;  // 返回已找到的配置
    }
  }

  /**
   * 从文件解析 @MapperScan（使用缓存避免重复读取）
   */
  private async parseMapperScanFromFile(filePath: string): Promise<MapperScanConfig | null> {
    try {
      const document = await vscode.workspace.openTextDocument(filePath);
      const content = document.getText();
      return this.parseMapperScanFromContent(content, filePath);
    } catch (error) {
      return null;
    }
  }

  /**
   * 从内容解析 @MapperScan（用于全局搜索时避免重复打开文档）
   */
  private parseMapperScanFromContent(content: string, filePath: string): MapperScanConfig | null {
    // 快速检查：不包含 @MapperScan 的直接返回
    if (!content.includes('@MapperScan')) {
      return null;
    }

    // 解析包名
    const packageMatch = content.match(/package\s+([^;]+);/);
    const packageName = packageMatch ? packageMatch[1] : '';

    // 改进的 @MapperScan 匹配正则，支持多种形式：
    // 1. @MapperScan("com.example.mapper")
    // 2. @MapperScan({"pkg1", "pkg2"})
    // 3. @MapperScan(basePackages = "pkg")
    // 4. @MapperScan(basePackages = {"pkg1", "pkg2"})
    const mapperScanRegex = /@MapperScan\s*\(\s*(?:(?:value|basePackages)\s*=\s*)?([\s\S]*?)\s*\)/;
    const match = content.match(mapperScanRegex);

    if (!match) return null;

    const value = match[1].trim();
    const packages = this.extractPackageNames(value);

    if (packages.length > 0) {
      return {
        basePackages: packages,
        sourceFile: filePath
      };
    }

    return null;
  }

  private extractPackageNames(value: string): string[] {
    const packages: string[] = [];

    // 数组格式
    if (value.startsWith('{') && value.endsWith('}')) {
      const matches = value.matchAll(/["']([^"']+)["']/g);
      for (const match of matches) {
        if (match[1] && this.isValidPackageName(match[1])) {
          packages.push(match[1]);
        }
      }
    } else {
      // 单个值
      const match = value.match(/["']([^"']+)["']/);
      if (match && match[1] && this.isValidPackageName(match[1])) {
        packages.push(match[1]);
      }
    }

    return packages;
  }

  private isValidPackageName(name: string): boolean {
    return /^[a-zA-Z][a-zA-Z0-9_]*(\.[a-zA-Z][a-zA-Z0-9_]*)+$/.test(name);
  }

  // ========== 基于配置的扫描 ==========

  /**
   * 使用配置信息进行并行扫描
   */
  private async scanWithConfig(
    mapperScanConfigs: MapperScanConfig[],
    xmlLocations: string[]
  ): Promise<void> {
    const startTime = Date.now();
    
    // 并行扫描 XML 和 Java
    const [xmlMappers, javaMappers] = await Promise.all([
      this.scanXmlWithLocations(xmlLocations),
      this.scanJavaWithConfigs(mapperScanConfigs)
    ]);

    this.logger?.info(`Scanned ${xmlMappers.length} XML mappers, ${javaMappers.length} Java mappers in ${Date.now() - startTime}ms`);

    // 建立映射（使用 namespace 作为 key）
    this.buildMappingsFromResults(javaMappers, xmlMappers);
  }

  /**
   * 根据配置位置扫描 XML
   */
  private async scanXmlWithLocations(locations: string[]): Promise<XmlMapperInfo[]> {
    const mappers: XmlMapperInfo[] = [];
    const scannedPaths = new Set<string>();

    for (const pattern of locations) {
      try {
        const files = await vscode.workspace.findFiles(
          pattern,
          '**/{node_modules,.git,target,build,out}/**',
          this.config.maxXmlFiles - mappers.length
        );

        for (const file of files) {
          if (scannedPaths.has(file.fsPath)) continue;
          if (mappers.length >= this.config.maxXmlFiles) break;

          scannedPaths.add(file.fsPath);
          
          const mapper = await this.xmlParser.parseXmlMapper(file.fsPath);
          if (mapper && mapper.namespace) {
            mappers.push(mapper);
            this.emit('xmlFound', mapper);
          }
        }
      } catch (error) {
        this.logger?.debug(`Failed to scan XML pattern ${pattern}:`, error);
      }
    }

    return mappers;
  }

  /**
   * 根据 @MapperScan 配置扫描 Java
   */
  private async scanJavaWithConfigs(configs: MapperScanConfig[]): Promise<JavaMapperInfo[]> {
    const allPackages = configs.flatMap(c => c.basePackages);
    if (allPackages.length === 0) {
      return this.scanAllJavaMappers();
    }

    const mappers: JavaMapperInfo[] = [];
    const scannedPaths = new Set<string>();

    // 并行扫描所有包
    const packagePromises = allPackages.map(async (pkg) => {
      const pkgPath = pkg.replace(/\./g, '/');
      const pattern = `**/${pkgPath}/**/*.java`;
      
      try {
        const files = await vscode.workspace.findFiles(
          pattern,
          '**/{node_modules,.git,target,build,out}/**'
        );
        return files;
      } catch (error) {
        return [];
      }
    });

    const fileArrays = await Promise.all(packagePromises);
    const allFiles = fileArrays.flat();

    // 批量解析
    const uniqueFiles = allFiles.filter(f => {
      if (scannedPaths.has(f.fsPath)) return false;
      scannedPaths.add(f.fsPath);
      return true;
    });

    // 并行解析，控制并发数
    for (let i = 0; i < uniqueFiles.length; i += this.config.batchSize) {
      const batch = uniqueFiles.slice(i, i + this.config.batchSize);
      const results = await Promise.all(
        batch.map(file => this.parseJavaMapperFast(file.fsPath))
      );
      
      for (const result of results) {
        if (result) {
          mappers.push(result);
          this.emit('javaFound', result);
        }
      }

      // 进度报告
      this.emit('progress', {
        total: uniqueFiles.length,
        processed: Math.min(i + this.config.batchSize, uniqueFiles.length),
        phase: 'java'
      } as ScanProgressEvent);
    }

    return mappers;
  }

  // ========== 启发式扫描（无配置时）==========

  /**
   * 启发式扫描：只扫描常见路径
   */
  private async scanHeuristic(): Promise<void> {
    this.logger?.info('Using heuristic scan (no config found)...');

    // 并行扫描常见路径
    const xmlPatterns = [
      '**/mapper/**/*.xml',
      '**/mappers/**/*.xml',
      '**/resources/**/*Mapper.xml',
      '**/resources/**/*Dao.xml'
    ];

    const javaPatterns = [
      '**/*Mapper.java',
      '**/*Dao.java'
    ];

    const [xmlFiles, javaFiles] = await Promise.all([
      this.findFilesWithLimit(xmlPatterns, this.config.maxXmlFiles),
      this.findFilesWithLimit(javaPatterns, this.config.maxJavaFiles)
    ]);

    // 并行解析
    const [xmlMappers, javaMappers] = await Promise.all([
      this.parseXmlBatch(xmlFiles),
      this.parseJavaBatch(javaFiles)
    ]);

    this.buildMappingsFromResults(javaMappers, xmlMappers);
  }

  private async findFilesWithLimit(patterns: string[], limit: number): Promise<vscode.Uri[]> {
    const allFiles: vscode.Uri[] = [];
    const seen = new Set<string>();

    for (const pattern of patterns) {
      if (allFiles.length >= limit) break;

      const files = await vscode.workspace.findFiles(
        pattern,
        '**/{node_modules,.git,target,build,out}/**',
        limit - allFiles.length
      );

      for (const file of files) {
        if (!seen.has(file.fsPath)) {
          seen.add(file.fsPath);
          allFiles.push(file);
        }
      }
    }

    return allFiles;
  }

  // ========== 批量解析 ==========

  private async parseXmlBatch(files: vscode.Uri[]): Promise<XmlMapperInfo[]> {
    const mappers: XmlMapperInfo[] = [];

    for (let i = 0; i < files.length; i += this.config.batchSize) {
      const batch = files.slice(i, i + this.config.batchSize);
      const results = await Promise.all(
        batch.map(file => this.xmlParser.parseXmlMapper(file.fsPath))
      );
      
      for (const result of results) {
        if (result && result.namespace) {
          mappers.push(result);
        }
      }
    }

    return mappers;
  }

  private async parseJavaBatch(files: vscode.Uri[]): Promise<JavaMapperInfo[]> {
    const mappers: JavaMapperInfo[] = [];

    for (let i = 0; i < files.length; i += this.config.batchSize) {
      const batch = files.slice(i, i + this.config.batchSize);
      const results = await Promise.all(
        batch.map(file => this.parseJavaMapperFast(file.fsPath))
      );
      
      for (const result of results) {
        if (result) {
          mappers.push(result);
        }
      }
    }

    return mappers;
  }

  /**
   * 快速解析 Java Mapper（使用轻量级检查）
   * 
   * 注意：只识别文件是否是 Mapper，不提取方法
   * 方法将在 CodeLens 阶段用 Java API 动态获取
   */
  private async parseJavaMapperFast(filePath: string): Promise<JavaMapperInfo | null> {
    try {
      const document = await vscode.workspace.openTextDocument(filePath);
      const content = document.getText();

      // 快速过滤：必须是接口
      if (!/interface\s+\w+/.test(content)) {
        return null;
      }

      // 检查是否是 MyBatis Mapper
      const hasMapperAnnotation = /@Mapper\b/.test(content);
      const hasMyBatisImport = /import\s+org\.apache\.ibatis|import\s+org\.mybatis/.test(content);
      
      if (!hasMapperAnnotation && !hasMyBatisImport) {
        return null;
      }

      // 解析包名和类名
      const packageMatch = content.match(/package\s+([^;]+);/);
      const packageName = packageMatch ? packageMatch[1] : '';

      const classMatch = content.match(/interface\s+(\w+)/);
      if (!classMatch) return null;

      const simpleClassName = classMatch[1];
      const className = packageName ? `${packageName}.${simpleClassName}` : simpleClassName;

      // 不在这里提取方法！方法将由 CodeLens 阶段用 Java API 动态获取
      // 返回空的方法列表，mappingEngine 会用 XML 中的 SQL id 来建立方法映射
      return {
        filePath,
        className,
        packageName,
        methods: []  // 空列表，方法映射由 XML 解析建立
      };

    } catch (error) {
      return null;
    }
  }


  /**
   * 扫描所有 Java Mapper（无配置时 fallback）
   */
  private async scanAllJavaMappers(): Promise<JavaMapperInfo[]> {
    const files = await vscode.workspace.findFiles(
      '**/*.java',
      '**/{node_modules,.git,target,build,out}/**',
      this.config.maxJavaFiles
    );
    return this.parseJavaBatch(files);
  }

  // ========== 映射建立 ==========

  /**
   * 基于扫描结果建立映射
   * 
   * 策略：
   * 1. 先建立 XML namespace 索引
   * 2. 遍历 Java Mapper，通过 namespace 匹配
   * 3. 未匹配的通过文件名智能匹配
   */
  private buildMappingsFromResults(
    javaMappers: JavaMapperInfo[],
    xmlMappers: XmlMapperInfo[]
  ): void {
    const startTime = Date.now();

    // 1. 建立 XML namespace 快速查找表
    const xmlByNamespace = new Map<string, XmlMapperInfo>();
    const xmlBySimpleName = new Map<string, XmlMapperInfo[]>();

    for (const xml of xmlMappers) {
      xmlByNamespace.set(xml.namespace, xml);
      
      const simpleName = xml.namespace.substring(xml.namespace.lastIndexOf('.') + 1);
      const existing = xmlBySimpleName.get(simpleName);
      if (existing) {
        existing.push(xml);
      } else {
        xmlBySimpleName.set(simpleName, [xml]);
      }
    }

    // 2. 匹配 Java 和 XML
    const matchedPairs: Array<{ java: JavaMapperInfo; xml?: XmlMapperInfo }> = [];
    const unmatchedJava: JavaMapperInfo[] = [];

    for (const java of javaMappers) {
      // 策略1: namespace 直接匹配
      let xml = xmlByNamespace.get(java.className);

      // 策略2: 简单类名匹配（如果有多个，选择文件名最相似的）
      if (!xml) {
        const simpleName = java.className.substring(java.className.lastIndexOf('.') + 1);
        const candidates = xmlBySimpleName.get(simpleName);
        if (candidates && candidates.length === 1) {
          xml = candidates[0];
        } else if (candidates && candidates.length > 1) {
          // 选择文件名最匹配的
          xml = this.findBestMatchByFileName(java, candidates);
        }
      }

      matchedPairs.push({ java, xml });
      
      if (xml) {
        // 从待匹配列表中移除
        xmlByNamespace.delete(java.className);
      }
    }

    // 3. 批量建立映射
    this.mappingEngine.buildMappings(matchedPairs);

    this.logger?.debug(`Built mappings in ${Date.now() - startTime}ms`);
  }

  /**
   * 通过文件名相似度找到最佳匹配
   */
  private findBestMatchByFileName(javaInfo: JavaMapperInfo, xmlCandidates: XmlMapperInfo[]): XmlMapperInfo | undefined {
    const javaFileName = javaInfo.filePath.substring(javaInfo.filePath.lastIndexOf('/') + 1).toLowerCase();
    
    let bestMatch: XmlMapperInfo | undefined;
    let bestScore = -1;

    for (const xml of xmlCandidates) {
      const xmlFileName = xml.filePath.substring(xml.filePath.lastIndexOf('/') + 1).toLowerCase();
      
      // 简单相似度计算：共同子串长度
      let score = 0;
      for (let i = 0; i < Math.min(javaFileName.length, xmlFileName.length); i++) {
        if (javaFileName[i] === xmlFileName[i]) {
          score++;
        } else {
          break;
        }
      }

      if (score > bestScore) {
        bestScore = score;
        bestMatch = xml;
      }
    }

    return bestMatch;
  }

  // ========== 增量更新 ==========

  /**
   * 重新扫描单个 Java 文件
   */
  public async rescanJavaFile(filePath: string): Promise<void> {
    try {
      const mapper = await this.parseJavaMapperFast(filePath);
      if (mapper) {
        // 查找是否已有对应的 XML
        const existingMapping = this.mappingEngine.getByJavaPath(filePath);
        let xml: XmlMapperInfo | undefined;
        
        if (existingMapping?.xmlPath) {
          const parsedXml = await this.xmlParser.parseXmlMapper(existingMapping.xmlPath);
          xml = parsedXml ?? undefined;
        }

        this.mappingEngine.buildMapping(mapper, xml);
        this.emit('javaUpdated', mapper);
      } else {
        // 不再是 Mapper，移除映射
        this.mappingEngine.removeMapping(filePath);
        this.emit('javaRemoved', filePath);
      }
    } catch (error) {
      this.logger?.debug(`Failed to rescan Java file ${filePath}:`, error);
    }
  }

  /**
   * 重新扫描单个 XML 文件
   */
  public async rescanXmlFile(filePath: string): Promise<void> {
    try {
      const mapper = await this.xmlParser.parseXmlMapper(filePath);
      if (mapper && mapper.namespace) {
        // 查找是否已有对应的 Java
        const existingMapping = this.mappingEngine.getByNamespace(mapper.namespace);
        
        if (existingMapping) {
          // 更新 XML 路径
          this.mappingEngine.updateXmlPath(existingMapping.javaPath, filePath);
          // 更新方法位置
          this.mappingEngine.updateMethodPositions(existingMapping.javaPath, mapper.statements);
          this.emit('xmlUpdated', mapper);
        } else {
          // 尝试找到对应的 Java
          const javaMapping = this.mappingEngine.getByClassName(mapper.namespace);
          if (javaMapping) {
            const javaMapper = await this.parseJavaMapperFast(javaMapping.javaPath);
            if (javaMapper) {
              this.mappingEngine.buildMapping(javaMapper, mapper);
              this.emit('xmlUpdated', mapper);
            }
          }
        }
      }
    } catch (error) {
      this.logger?.debug(`Failed to rescan XML file ${filePath}:`, error);
    }
  }

  // ========== 状态查询 ==========

  public getScanningState(): boolean {
    return this.isScanning;
  }

  public getEngine(): FastMappingEngine {
    return this.mappingEngine;
  }
}
