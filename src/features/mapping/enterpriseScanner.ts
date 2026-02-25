/**
 * 企业级扫描器
 * 
 * 支持场景：
 * - 微服务/多模块项目
 * - 云原生/容器化环境
 * - Jar包内配置
 * - 自动化配置（Spring Boot Starter）
 */

import * as vscode from 'vscode';
import { EventEmitter } from 'events';
import { FastMappingEngine } from './fastMappingEngine';
import { EnterpriseConfigResolver } from './enterpriseConfigResolver';
import { MyBatisXmlParser } from './xmlParser';
import { XmlLocationResolver } from './xmlLocationResolver';
import { JavaMapperInfo, XmlMapperInfo, MapperScanConfig, ScanProgressEvent } from './types';
import { Logger } from '../../utils/logger';
import { SCAN_LIMITS } from '../../utils/constants';

interface EnterpriseScanConfig {
  enableLayer1: boolean;  // 当前项目源码
  enableLayer2: boolean;  // 子模块
  enableLayer3: boolean;  // Source jars
  enableLayer4: boolean;  // 编译后的class
  enableLayer5: boolean;  // 运行时配置
  enableLayer6: boolean;  // 环境变量
  maxXmlFiles: number;
  maxJavaFiles: number;
  batchSize: number;
}

const DEFAULT_CONFIG: EnterpriseScanConfig = {
  enableLayer1: true,
  enableLayer2: true,
  enableLayer3: true,
  enableLayer4: false,  // 默认关闭，因为较慢
  enableLayer5: true,
  enableLayer6: true,
  maxXmlFiles: SCAN_LIMITS.ENTERPRISE_MAX_XML_FILES,
  maxJavaFiles: SCAN_LIMITS.ENTERPRISE_MAX_JAVA_FILES,
  batchSize: SCAN_LIMITS.BATCH_SIZE
};

export class EnterpriseScanner extends EventEmitter {
  private static instance: EnterpriseScanner;
  private mappingEngine: FastMappingEngine;
  private configResolver: EnterpriseConfigResolver;
  private xmlParser: MyBatisXmlParser;
  private locationResolver: XmlLocationResolver;
  private logger!: Logger;
  private config: EnterpriseScanConfig;
  private isScanning: boolean = false;

  private constructor(config?: Partial<EnterpriseScanConfig>) {
    super();
    this.config = { ...DEFAULT_CONFIG, ...config };
    this.mappingEngine = FastMappingEngine.getInstance();
    this.configResolver = EnterpriseConfigResolver.getInstance();
    this.xmlParser = MyBatisXmlParser.getInstance();
    this.locationResolver = XmlLocationResolver.getInstance();
  }

  public static getInstance(config?: Partial<EnterpriseScanConfig>): EnterpriseScanner {
    if (!EnterpriseScanner.instance) {
      EnterpriseScanner.instance = new EnterpriseScanner(config);
    }
    return EnterpriseScanner.instance;
  }

  public async initialize(): Promise<void> {
    const { Logger } = await import('../../utils/logger.js');
    this.logger = Logger.getInstance();
    
    await this.mappingEngine.initialize();
    await this.configResolver.initialize();
    await this.xmlParser.initialize();
    await this.locationResolver.initialize();
  }

  /**
   * 执行企业级扫描
   */
  public async scan(): Promise<void> {
    if (this.isScanning) {
      this.logger?.warn('Enterprise scan already in progress');
      return;
    }

    this.isScanning = true;
    this.emit('scanStarted');
    const startTime = Date.now();

    try {
      this.logger?.info('Starting enterprise mapper scan...');
      this.mappingEngine.clear();

      // ========== Phase 1: 全面配置发现 ==========
      const { configs: mapperScanConfigs, sources, stats } = await this.configResolver.resolveAllConfigs();
      
      this.logger?.info(`Configuration discovery completed:`);
      this.logger?.info(`  - Found ${mapperScanConfigs.length} @MapperScan configs`);
      this.logger?.info(`  - Sources: ${sources.map(s => s.type).join(', ')}`);
      this.logger?.info(`  - Layers searched: ${stats.totalLayers}`);

      // ========== Phase 2: 获取XML位置 ==========
      const xmlLocations = await this.locationResolver.resolveXmlLocations();
      this.logger?.info(`Resolved ${xmlLocations.length} XML location patterns`);

      // ========== Phase 3: 执行扫描 ==========
      if (mapperScanConfigs.length > 0 || xmlLocations.length > 0) {
        await this.scanWithConfig(mapperScanConfigs, xmlLocations);
      } else {
        this.logger?.warn('No configuration found, falling back to heuristic scan');
        await this.scanHeuristic();
      }

      const duration = Date.now() - startTime;
      const engineStats = this.mappingEngine.getStats();
      
      this.logger?.info(`Enterprise scan completed in ${duration}ms:`);
      this.logger?.info(`  - Total mappings: ${engineStats.total}`);
      this.logger?.info(`  - With XML: ${engineStats.withXml}`);
      this.logger?.info(`  - Total methods: ${engineStats.totalMethods}`);
      
      this.emit('scanCompleted', { 
        duration, 
        ...engineStats,
        configSources: sources 
      });

    } catch (error) {
      this.logger?.error('Enterprise scan failed:', error as Error);
      this.emit('scanError', error);
    } finally {
      this.isScanning = false;
    }
  }

  /**
   * 使用配置进行扫描
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

    // 建立映射
    this.buildMappingsFromResults(javaMappers, xmlMappers);
  }

  /**
   * 扫描XML文件
   */
  private async scanXmlWithLocations(locations: string[]): Promise<XmlMapperInfo[]> {
    const mappers: XmlMapperInfo[] = [];
    const scannedPaths = new Set<string>();

    // 合并配置的包路径到XML搜索
    const searchPatterns = [...locations];
    
    // 添加常见的XML路径模式
    const commonPatterns = [
      '**/mapper/**/*.xml',
      '**/mappers/**/*.xml',
      '**/resources/**/*Mapper.xml',
      '**/resources/**/*Dao.xml',
      '**/*.mapper.xml',
      '**/*Mapper.xml'
    ];

    for (const pattern of [...searchPatterns, ...commonPatterns]) {
      if (mappers.length >= this.config.maxXmlFiles) break;

      try {
        const files = await vscode.workspace.findFiles(
          pattern,
          '**/{node_modules,.git,target,build,out,dist}/**',
          this.config.maxXmlFiles - mappers.length
        );

        for (const file of files) {
          if (scannedPaths.has(file.fsPath)) continue;
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

    // 如果找到的XML很少，尝试更广泛的搜索
    if (mappers.length < 10) {
      this.logger?.info('Found few XML mappers, trying broader search...');
      const broadFiles = await vscode.workspace.findFiles(
        '**/*.xml',
        '**/{node_modules,.git,target,build,out,dist,node}/**',
        200
      );

      for (const file of broadFiles) {
        if (scannedPaths.has(file.fsPath)) continue;
        if (mappers.length >= this.config.maxXmlFiles) break;

        // 快速检查文件内容是否像MyBatis Mapper
        try {
          const content = await vscode.workspace.fs.readFile(file);
          const text = Buffer.from(content).toString('utf-8', 0, 500); // 只读前500字节
          
          if (text.includes('namespace') && text.includes('mapper')) {
            scannedPaths.add(file.fsPath);
            const mapper = await this.xmlParser.parseXmlMapper(file.fsPath);
            if (mapper && mapper.namespace) {
              mappers.push(mapper);
              this.emit('xmlFound', mapper);
            }
          }
        } catch (e) {
          // 忽略错误
        }
      }
    }

    return mappers;
  }

  /**
   * 根据配置扫描Java Mapper
   */
  private async scanJavaWithConfigs(configs: MapperScanConfig[]): Promise<JavaMapperInfo[]> {
    // 收集所有包路径
    const allPackages = new Set<string>();
    configs.forEach(c => c.basePackages.forEach(p => allPackages.add(p)));

    if (allPackages.size === 0) {
      return this.scanAllJavaMappers();
    }

    this.logger?.info(`Scanning ${allPackages.size} packages from @MapperScan configs`);

    const mappers: JavaMapperInfo[] = [];
    const scannedPaths = new Set<string>();

    // 为每个包路径生成搜索模式
    const packagePatterns: string[] = [];
    for (const pkg of allPackages) {
      const pkgPath = pkg.replace(/\./g, '/');
      packagePatterns.push(`**/${pkgPath}/**/*.java`);
    }

    // 并行搜索所有包
    const filePromises = packagePatterns.map(async (pattern) => {
      try {
        return await vscode.workspace.findFiles(
          pattern,
          '**/{node_modules,.git,target,build,out}/**'
        );
      } catch (error) {
        return [];
      }
    });

    const fileArrays = await Promise.all(filePromises);
    const allFiles = fileArrays.flat();

    // 去重
    const uniqueFiles = allFiles.filter(f => {
      if (scannedPaths.has(f.fsPath)) return false;
      scannedPaths.add(f.fsPath);
      return true;
    });

    this.logger?.info(`Found ${uniqueFiles.length} Java files in configured packages`);

    // 批量解析
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
        currentFile: `Scanning Java files (${mappers.length} mappers found)`
      } as ScanProgressEvent);
    }

    return mappers;
  }

  /**
   * 启发式扫描（无配置时）
   */
  private async scanHeuristic(): Promise<void> {
    this.logger?.info('Using heuristic scan...');

    const [xmlFiles, javaFiles] = await Promise.all([
      vscode.workspace.findFiles(
        '**/*.xml',
        '**/{node_modules,.git,target,build,out,dist}/**',
        this.config.maxXmlFiles
      ),
      vscode.workspace.findFiles(
        '**/*.java',
        '**/{node_modules,.git,target,build,out}/**',
        this.config.maxJavaFiles
      )
    ]);

    // 筛选可能的Mapper XML
    const xmlMappers: XmlMapperInfo[] = [];
    for (const file of xmlFiles) {
      try {
        const mapper = await this.xmlParser.parseXmlMapper(file.fsPath);
        if (mapper && mapper.namespace) {
          xmlMappers.push(mapper);
        }
      } catch (e) {
        // 忽略解析错误
      }
    }

    // 筛选可能的Java Mapper
    const javaMappers: JavaMapperInfo[] = [];
    for (let i = 0; i < javaFiles.length; i += this.config.batchSize) {
      const batch = javaFiles.slice(i, i + this.config.batchSize);
      const results = await Promise.all(
        batch.map(file => this.parseJavaMapperFast(file.fsPath))
      );
      javaMappers.push(...results.filter((m): m is JavaMapperInfo => m !== null));
    }

    this.buildMappingsFromResults(javaMappers, xmlMappers);
  }

  /**
   * 快速解析Java Mapper
   */
  private async parseJavaMapperFast(filePath: string): Promise<JavaMapperInfo | null> {
    try {
      const document = await vscode.workspace.openTextDocument(filePath);
      const content = document.getText();

      // 快速过滤：必须是接口
      if (!/interface\s+\w+/.test(content)) {
        return null;
      }

      // 检查是否是MyBatis Mapper
      const hasMapperAnnotation = /@Mapper\b/.test(content);
      const hasMyBatisImport = /import\s+org\.apache\.ibatis|import\s+org\.mybatis/.test(content);
      const hasMapperXml = content.includes('Mapper'); // 简单启发式
      
      if (!hasMapperAnnotation && !hasMyBatisImport && !hasMapperXml) {
        return null;
      }

      // 解析包名和类名
      const packageMatch = content.match(/package\s+([^;]+);/);
      const packageName = packageMatch ? packageMatch[1] : '';

      const classMatch = content.match(/interface\s+(\w+)/);
      if (!classMatch) return null;

      const simpleClassName = classMatch[1];
      const className = packageName ? `${packageName}.${simpleClassName}` : simpleClassName;

      // 提取方法
      const methods = this.extractMethodsFromContent(content);

      return {
        filePath,
        className,
        packageName,
        methods
      };

    } catch (error) {
      return null;
    }
  }

  /**
   * 从内容提取方法
   */
  private extractMethodsFromContent(content: string): Array<{ name: string; position: { line: number; column: number } }> {
    const methods: Array<{ name: string; position: { line: number; column: number } }> = [];
    const lines = content.split('\n');

    // 方法定义正则
    const methodRegex = /^(?:\s*)(?:public|private|protected)?\s*(?:static|final|abstract)?\s*[\w<>,\s]+\s+(\w+)\s*\([^)]*\)\s*(?:throws\s+[\w,\s]+)?\s*[;{]/;

    for (let i = 0; i < lines.length; i++) {
      const match = methodRegex.exec(lines[i]);
      if (match) {
        methods.push({
          name: match[1],
          position: { line: i, column: lines[i].indexOf(match[1]) }
        });
      }
    }

    return methods;
  }

  /**
   * 建立映射关系
   */
  private buildMappingsFromResults(
    javaMappers: JavaMapperInfo[],
    xmlMappers: XmlMapperInfo[]
  ): void {
    const startTime = Date.now();

    // 建立XML索引
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

    // 匹配Java和XML
    const matchedPairs: Array<{ java: JavaMapperInfo; xml?: XmlMapperInfo }> = [];

    for (const java of javaMappers) {
      // 策略1: namespace直接匹配
      let xml = xmlByNamespace.get(java.className);

      // 策略2: 简单类名匹配
      if (!xml) {
        const simpleName = java.className.substring(java.className.lastIndexOf('.') + 1);
        const candidates = xmlBySimpleName.get(simpleName);
        if (candidates && candidates.length === 1) {
          xml = candidates[0];
        }
      }

      matchedPairs.push({ java, xml });
    }

    // 批量建立映射
    this.mappingEngine.buildMappings(matchedPairs);

    this.logger?.debug(`Built ${matchedPairs.length} mappings in ${Date.now() - startTime}ms`);
  }

  /**
   * 扫描所有Java文件（fallback）
   */
  private async scanAllJavaMappers(): Promise<JavaMapperInfo[]> {
    const files = await vscode.workspace.findFiles(
      '**/*.java',
      '**/{node_modules,.git,target,build,out}/**',
      this.config.maxJavaFiles
    );

    const mappers: JavaMapperInfo[] = [];
    for (let i = 0; i < files.length; i += this.config.batchSize) {
      const batch = files.slice(i, i + this.config.batchSize);
      const results = await Promise.all(
        batch.map(file => this.parseJavaMapperFast(file.fsPath))
      );
      mappers.push(...results.filter((m): m is JavaMapperInfo => m !== null));
    }

    return mappers;
  }

  /**
   * 重新扫描单个Java文件
   */
  public async rescanJavaFile(filePath: string): Promise<void> {
    try {
      const mapper = await this.parseJavaMapperFast(filePath);
      if (mapper) {
        const existingMapping = this.mappingEngine.getByJavaPath(filePath);
        let xml: XmlMapperInfo | undefined;
        
        if (existingMapping?.xmlPath) {
          xml = await this.xmlParser.parseXmlMapper(existingMapping.xmlPath) || undefined;
        }

        this.mappingEngine.buildMapping(mapper, xml);
        this.emit('javaUpdated', mapper);
      } else {
        this.mappingEngine.removeMapping(filePath);
        this.emit('javaRemoved', filePath);
      }
    } catch (error) {
      this.logger?.debug(`Failed to rescan Java file ${filePath}:`, error);
    }
  }

  /**
   * 重新扫描单个XML文件
   */
  public async rescanXmlFile(filePath: string): Promise<void> {
    try {
      const mapper = await this.xmlParser.parseXmlMapper(filePath);
      if (mapper && mapper.namespace) {
        const existingMapping = this.mappingEngine.getByNamespace(mapper.namespace);
        
        if (existingMapping) {
          this.mappingEngine.updateXmlPath(existingMapping.javaPath, filePath);
          this.mappingEngine.updateMethodPositions(existingMapping.javaPath, mapper.statements);
          this.emit('xmlUpdated', mapper);
        }
      }
    } catch (error) {
      this.logger?.debug(`Failed to rescan XML file ${filePath}:`, error);
    }
  }

  /**
   * 获取扫描状态
   */
  public getScanningState(): boolean {
    return this.isScanning;
  }

  /**
   * 获取映射引擎
   */
  public getMappingEngine(): FastMappingEngine {
    return this.mappingEngine;
  }

  /**
   * 获取配置解析器
   */
  public getConfigResolver(): EnterpriseConfigResolver {
    return this.configResolver;
  }
}
