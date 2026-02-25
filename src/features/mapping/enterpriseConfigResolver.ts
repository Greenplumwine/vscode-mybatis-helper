/**
 * 企业级配置解析器
 * 
 * 支持场景：
 * 1. 微服务/多模块项目 - 扫描所有子模块
 * 2. 云原生/容器化 - 读取运行时配置
 * 3. Jar包内配置 - 解析依赖jar中的注解
 * 4. 自动化配置 - Spring Boot Starter
 * 
 * 策略：分层级配置发现
 * Layer 1: 当前项目源码（最快）
 * Layer 2: 子模块源码（多模块项目）
 * Layer 3: 依赖源码（source jar）
 * Layer 4: 编译后的class/jar（解析字节码）
 * Layer 5: 运行时配置（如果应用运行中）
 */

import * as fs from 'fs/promises';
import * as path from 'path';
import * as vscode from 'vscode';
import { MapperScanConfig } from './types';
import { Logger } from '../../utils/logger';
import { TIME, SCAN_LIMITS } from '../../utils/constants';

interface ConfigSource {
  type: 'source' | 'jar' | 'runtime' | 'environment';
  location: string;
  priority: number;
}

interface MultiModuleInfo {
  rootPath: string;
  modulePaths: string[];
  buildTool: 'maven' | 'gradle' | 'unknown';
}

export class EnterpriseConfigResolver {
  private static instance: EnterpriseConfigResolver;
  private logger!: Logger;
  private configCache: Map<string, { configs: MapperScanConfig[]; timestamp: number }> = new Map();
  private readonly CACHE_TTL = TIME.FIVE_MINUTES;

  // 运行时配置缓存
  private runtimeConfigs: Map<string, string[]> = new Map();
  
  // 索引缓存管理器
  private indexCache!: import('./indexCache').IndexCacheManager;
  
  // Worker 线程支持
  private useWorkerThreads: boolean = true;
  private workerPoolSize: number = 4;

  private constructor() {}

  public static getInstance(): EnterpriseConfigResolver {
    if (!EnterpriseConfigResolver.instance) {
      EnterpriseConfigResolver.instance = new EnterpriseConfigResolver();
    }
    return EnterpriseConfigResolver.instance;
  }

  public async initialize(): Promise<void> {
    const { Logger } = await import('../../utils/logger.js');
    this.logger = Logger.getInstance();
    
    // 初始化索引缓存
    const { indexCacheManager } = await import('./indexCache.js');
    this.indexCache = indexCacheManager;
    
    // 检查 Worker Threads 支持
    try {
      const { Worker } = await import('worker_threads');
      this.useWorkerThreads = true;
      this.logger?.info('Worker Threads enabled for class parsing');
    } catch (error) {
      this.useWorkerThreads = false;
      this.logger?.info('Worker Threads not available, using main thread');
    }
  }
  
  /**
   * 初始化项目索引缓存
   */
  public async initializeIndexCache(projectRoot: string): Promise<void> {
    await this.indexCache.initialize(projectRoot);
    
    const stats = this.indexCache.getStats();
    this.logger?.info(`Index cache: ${stats.total} entries, ${stats.withMapperScan} with @MapperScan`);
  }

  /**
   * 主入口：全面配置发现
   * 
   * 按优先级分层获取配置，合并所有来源
   */
  public async resolveAllConfigs(): Promise<{
    configs: MapperScanConfig[];
    sources: ConfigSource[];
    stats: {
      totalLayers: number;
      sourceConfigs: number;
      jarConfigs: number;
      runtimeConfigs: number;
    }
  }> {
    const startTime = Date.now();
    const allConfigs: MapperScanConfig[] = [];
    const sources: ConfigSource[] = [];
    const stats = {
      totalLayers: 0,
      sourceConfigs: 0,
      jarConfigs: 0,
      runtimeConfigs: 0
    };

    this.logger?.info('Starting enterprise config resolution (smart)...');

    // 先检测多模块信息（Layer 2 需要）
    const multiModuleInfo = await this.detectMultiModuleProject();

    // ========== 阶段1: 扫描源码层（Layer 1-2，最高优先级）==========
    this.logger?.info('Phase 1: Scanning source code layers...');
    
    const sourceLayerPromises = [
      // Layer 1: 当前项目源码
      this.resolveFromCurrentProject().then(configs => ({
        layer: 1,
        name: 'current project',
        type: 'source' as const,
        location: 'current-project',
        configs
      })),
      
      // Layer 2: 多模块项目子模块
      multiModuleInfo.modulePaths.length > 0 
        ? this.resolveFromSubModules(multiModuleInfo).then(configs => ({
            layer: 2,
            name: `sub-modules (${multiModuleInfo.modulePaths.length})`,
            type: 'source' as const,
            location: 'sub-modules',
            configs
          }))
        : Promise.resolve(null)
    ];
    
    // 等待源码层完成
    const sourceResults = await Promise.allSettled(sourceLayerPromises);
    let foundInSource = false;
    
    // 先收集源码层的结果
    for (const result of sourceResults) {
      if (result.status === 'fulfilled' && result.value) {
        const { layer, name, type, location, configs } = result.value;
        stats.totalLayers++;
        
        if (configs.length > 0) {
          foundInSource = true;
          allConfigs.push(...configs);
          sources.push({ type, location, priority: layer });
          
          if (type === 'source') {
            stats.sourceConfigs += configs.length;
          }
          
          this.logger?.info(`Layer ${layer} (${name}): Found ${configs.length} configs`);
        }
      }
    }
    
    // ========== 阶段2: 根据源码扫描结果决定后续策略 ==========
    const layerPromises: Promise<any>[] = [];
    
    // Layer 3: 依赖源码（source jar）- 总是执行
    layerPromises.push(
      this.resolveFromSourceJars().then(configs => ({
        layer: 3,
        name: 'source jars',
        type: 'jar' as const,
        location: 'source-jars',
        configs
      }))
    );
    
    // Layer 4: 编译后的class - 仅在源码中没找到时执行
    if (foundInSource) {
      this.logger?.info('Found @MapperScan in source code, skipping compiled class scanning');
      // 仍然执行，但优先使用缓存
      layerPromises.push(
        this.resolveFromCompiledClasses(true).then(configs => ({
          layer: 4,
          name: 'compiled classes (cached only)',
          type: 'jar' as const,
          location: 'compiled-classes',
          configs
        }))
      );
    } else {
      this.logger?.info('No @MapperScan found in source, scanning compiled classes...');
      layerPromises.push(
        this.resolveFromCompiledClasses(false).then(configs => ({
          layer: 4,
          name: 'compiled classes',
          type: 'jar' as const,
          location: 'compiled-classes',
          configs
        }))
      );
    }
    
    // Layer 5: 运行时配置
    layerPromises.push(
      this.resolveFromRuntime().then(configs => ({
        layer: 5,
        name: 'runtime',
        type: 'runtime' as const,
        location: 'runtime-environment',
        configs
      }))
    );
    
    // Layer 6: 环境变量
    layerPromises.push(
      this.resolveFromEnvironment().then(configs => ({
        layer: 6,
        name: 'environment',
        type: 'environment' as const,
        location: 'env-vars',
        configs
      }))
    );

    // 等待其他层完成
    const results = await Promise.allSettled(layerPromises);
    
    // 收集其他层的配置
    for (const result of results) {
      if (result.status === 'fulfilled' && result.value) {
        const { layer, name, type, location, configs } = result.value;
        stats.totalLayers++;
        
        if (configs.length > 0) {
          allConfigs.push(...configs);
          sources.push({ type, location, priority: layer });
          
          if (type === 'jar') {
            stats.jarConfigs += configs.length;
          } else {
            stats.runtimeConfigs += configs.length;
          }
          
          this.logger?.info(`Layer ${layer} (${name}): Found ${configs.length} configs`);
        }
      }
    }

    // 去重和合并
    const uniqueConfigs = this.deduplicateConfigs(allConfigs);
    
    const duration = Date.now() - startTime;
    this.logger?.info(`Enterprise config resolution completed in ${duration}ms:`);
    this.logger?.info(`  - Total unique configs: ${uniqueConfigs.length}`);
    this.logger?.info(`  - Sources: ${sources.map(s => s.location).join(', ') || 'none'}`);

    return {
      configs: uniqueConfigs,
      sources,
      stats
    };
  }

  // ========== Layer 1: 当前项目源码 ==========
  private async resolveFromCurrentProject(): Promise<MapperScanConfig[]> {
    const configs: MapperScanConfig[] = [];
    
    try {
      // 使用增强的搜索策略
      const searchPatterns = [
        '**/*Config*.java',
        '**/*Configuration*.java',
        '**/*Application*.java',
        '**/*Mybatis*.java',
        '**/config/**/*.java',
        '**/configuration/**/*.java',
      ];

      const checkedFiles = new Set<string>();
      let totalScanned = 0;

      for (const pattern of searchPatterns) {
        const files = await vscode.workspace.findFiles(
          pattern,
          '**/{node_modules,.git,target,build,out,dist}/**',
          100
        );

        this.logger?.debug(`Layer 1 pattern "${pattern}": found ${files.length} files`);

        for (const file of files) {
          if (checkedFiles.has(file.fsPath)) continue;
          checkedFiles.add(file.fsPath);
          totalScanned++;

          // 调试：打印扫描到的文件
          if (file.fsPath.includes('ApplicationConfig') || file.fsPath.includes('MapperScan')) {
            this.logger?.debug(`Layer 1 scanning: ${file.fsPath}`);
          }

          const config = await this.parseMapperScanFromFile(file.fsPath);
          if (config) {
            this.logger?.info(`Layer 1 found @MapperScan in: ${file.fsPath}`);
            configs.push(config);
          }
        }

        // 如果找到足够多的配置，提前返回
        if (configs.length >= 5) break;
      }

      this.logger?.debug(`Layer 1 total scanned: ${totalScanned}, found: ${configs.length} configs`);
    } catch (error) {
      this.logger?.debug('Error resolving from current project:', error);
    }

    return configs;
  }

  // ========== Layer 2: 多模块项目 ==========
  private async detectMultiModuleProject(): Promise<MultiModuleInfo> {
    const result: MultiModuleInfo = {
      rootPath: '',
      modulePaths: [],
      buildTool: 'unknown'
    };

    try {
      const workspaceFolders = vscode.workspace.workspaceFolders;
      if (!workspaceFolders) return result;

      for (const folder of workspaceFolders) {
        // 检测 Maven 多模块
        const pomPath = path.join(folder.uri.fsPath, 'pom.xml');
        try {
          await fs.access(pomPath);
          const pomContent = await fs.readFile(pomPath, 'utf-8');
          
          if (pomContent.includes('<modules>')) {
            result.buildTool = 'maven';
            result.rootPath = folder.uri.fsPath;
            
            // 解析子模块
            const moduleMatches = pomContent.matchAll(/<module>([^<]+)<\/module>/g);
            for (const match of moduleMatches) {
              const modulePath = path.join(folder.uri.fsPath, match[1]);
              result.modulePaths.push(modulePath);
            }
          }
        } catch (e) {
          // 不是Maven项目或无法读取
        }

        // 检测 Gradle 多模块
        const settingsPath = path.join(folder.uri.fsPath, 'settings.gradle');
        const settingsKtsPath = path.join(folder.uri.fsPath, 'settings.gradle.kts');
        
        try {
          const settingsFile = await fs.access(settingsPath).then(() => settingsPath)
            .catch(() => fs.access(settingsKtsPath).then(() => settingsKtsPath).catch(() => null));
          
          if (settingsFile) {
            const settingsContent = await fs.readFile(settingsFile, 'utf-8');
            
            if (settingsContent.includes('include')) {
              result.buildTool = 'gradle';
              result.rootPath = folder.uri.fsPath;
              
              // 解析 include 语句
              const includeMatches = settingsContent.matchAll(/include\s*['"]([^'"]+)['"]/g);
              for (const match of includeMatches) {
                const modulePath = path.join(folder.uri.fsPath, match[1]);
                result.modulePaths.push(modulePath);
              }
            }
          }
        } catch (e) {
          // 不是Gradle项目或无法读取
        }
      }
    } catch (error) {
      this.logger?.debug('Error detecting multi-module project:', error);
    }

    return result;
  }

  private async resolveFromSubModules(multiModuleInfo: MultiModuleInfo): Promise<MapperScanConfig[]> {
    const configs: MapperScanConfig[] = [];

    this.logger?.debug(`Layer 2: Scanning ${multiModuleInfo.modulePaths.length} sub-modules`);

    for (const modulePath of multiModuleInfo.modulePaths) {
      try {
        // 在子模块中搜索配置类
        const pattern = new vscode.RelativePattern(modulePath, '**/*{Config,Configuration,Application,Mybatis}*.java');
        const files = await vscode.workspace.findFiles(pattern, '**/{node_modules,.git,target,build,out}/**', 20);

        this.logger?.debug(`Layer 2 module "${path.basename(modulePath)}": found ${files.length} files`);

        for (const file of files) {
          // 调试：打印关键文件
          if (file.fsPath.includes('ApplicationConfig')) {
            this.logger?.debug(`Layer 2 scanning: ${file.fsPath}`);
          }

          const config = await this.parseMapperScanFromFile(file.fsPath);
          if (config) {
            this.logger?.info(`Layer 2 found @MapperScan in: ${file.fsPath}`);
            configs.push(config);
          }
        }
      } catch (error) {
        this.logger?.debug(`Error scanning module ${modulePath}:`, error);
      }
    }

    this.logger?.debug(`Layer 2 total found: ${configs.length} configs`);
    return configs;
  }

  // ========== Layer 3: Source Jars ==========
  private async resolveFromSourceJars(): Promise<MapperScanConfig[]> {
    const configs: MapperScanConfig[] = [];

    try {
      // 查找本地Maven仓库中的source jars
      const homeDir = process.env.HOME || process.env.USERPROFILE;
      if (!homeDir) return configs;

      const mavenRepoPath = path.join(homeDir, '.m2', 'repository');
      const sourceJarPatterns = [
        '**/*-sources.jar',
        '**/*-sources.zip'
      ];

      // 使用Java扩展API获取实际依赖的source jars（更高效）
      // 这里简化为扫描常见路径
      for (const pattern of sourceJarPatterns) {
        const jars = await vscode.workspace.findFiles(
          new vscode.RelativePattern(mavenRepoPath, pattern),
          null,
          50
        );

        for (const jar of jars) {
          // 只处理可能与MyBatis相关的jar
          const jarName = path.basename(jar.fsPath).toLowerCase();
          if (jarName.includes('mybatis') || jarName.includes('mapper') || jarName.includes('dao')) {
            const jarConfigs = await this.parseAnnotationsFromJar(jar.fsPath);
            configs.push(...jarConfigs);
          }
        }
      }
    } catch (error) {
      this.logger?.debug('Error resolving from source jars:', error);
    }

    return configs;
  }

  // ========== Layer 4: 编译后的Class/Jar ==========
  private async resolveFromCompiledClasses(cacheOnly: boolean = false): Promise<MapperScanConfig[]> {
    const configs: MapperScanConfig[] = [];
    
    // 首先尝试从索引缓存加载
    const cachedConfigs = this.indexCache?.getAllConfigs() || [];
    if (cachedConfigs.length > 0) {
      this.logger?.info(`Using ${cachedConfigs.length} configs from index cache`);
      return cachedConfigs;
    }
    
    // 如果只需要缓存（源码中已找到配置），则跳过扫描
    if (cacheOnly) {
      this.logger?.debug('Cache is empty and cacheOnly=true, skipping compiled class scanning');
      return configs;
    }

    try {
      // 扫描项目的target/build目录
      const workspaceFolders = vscode.workspace.workspaceFolders;
      if (!workspaceFolders) {
        this.logger?.debug('No workspace folders found for compiled class scanning');
        return configs;
      }

      // 检查 javap 是否可用
      const javapAvailable = this.isJavapAvailable();
      this.logger?.info(`javap available: ${javapAvailable}`);
      
      if (!javapAvailable) {
        this.logger?.info('javap not available, skipping compiled class scanning');
        return configs;
      }

      for (const folder of workspaceFolders) {
        // 初始化索引缓存（只执行一次）
        if (this.indexCache && !this.indexCache.getStats().total) {
          await this.indexCache.initialize(folder.uri.fsPath);
        }
        
        const classesPaths: string[] = [];
        
        // 根目录的编译输出
        classesPaths.push(path.join(folder.uri.fsPath, 'target', 'classes'));
        classesPaths.push(path.join(folder.uri.fsPath, 'build', 'classes'));
        
        // 扫描子模块的编译输出（多模块项目）
        try {
          const subModules = await this.findSubModules(folder.uri.fsPath);
          for (const module of subModules) {
            classesPaths.push(path.join(module, 'target', 'classes'));
            classesPaths.push(path.join(module, 'build', 'classes'));
          }
        } catch (e) {
          // 忽略子模块扫描错误
        }

        this.logger?.debug(`Checking ${classesPaths.length} compiled classes directories`);

        for (const classesPath of classesPaths) {
          try {
            await fs.access(classesPath);
            this.logger?.info(`Found compiled classes directory: ${classesPath}`);
            
            // 只查找可能的配置类（性能优化：从300+减少到<20）
            const classFiles = await this.findConfigClassFiles(classesPath);
            this.logger?.info(`Found ${classFiles.length} potential config classes in ${classesPath}`);
            
            if (classFiles.length === 0) {
              continue;
            }
            
            // 使用 Worker Threads 或主线程解析
            const startParse = Date.now();
            const layerConfigs = await this.parseWithWorkerOrMain(classFiles);
            const parseTime = Date.now() - startParse;
            
            if (layerConfigs.length > 0) {
              configs.push(...layerConfigs);
              this.logger?.info(`Layer 4 (compiled classes): Found ${layerConfigs.length} configs in ${parseTime}ms`);
              
              // 更新索引缓存
              for (const cfg of layerConfigs) {
                this.logger?.info(`  - ${cfg.sourceFile}: ${cfg.basePackages.join(', ')}`);
                await this.indexCache?.updateEntry(cfg.sourceFile, cfg);
              }
              await this.indexCache?.saveIndex();
            } else {
              this.logger?.info(`No @MapperScan found in ${classesPath} (${parseTime}ms)`);
            }
          } catch (e) {
            // 目录不存在
            this.logger?.debug(`Compiled classes directory not found: ${classesPath}`);
          }
        }
      }
    } catch (error) {
      this.logger?.debug('Error resolving from compiled classes:', error);
    }

    return configs;
  }
  
  /**
   * 使用 Worker Threads 或主线程解析 class 文件
   */
  private async parseWithWorkerOrMain(classFiles: string[]): Promise<MapperScanConfig[]> {
    if (!this.useWorkerThreads || classFiles.length < 5) {
      // 文件数量少时，直接使用主线程
      return this.parseConfigClassesParallel(classFiles, 5);
    }
    
    // 使用 Worker Threads
    return this.parseWithWorkerThreads(classFiles);
  }
  
  /**
   * 使用 Worker Threads 并行解析
   */
  private async parseWithWorkerThreads(classFiles: string[]): Promise<MapperScanConfig[]> {
    const { Worker } = await import('worker_threads');
    const path = await import('path');
    
    const configs: MapperScanConfig[] = [];
    const errors: string[] = [];
    
    // 分批处理，每批创建一个 Worker
    const batchSize = Math.ceil(classFiles.length / this.workerPoolSize);
    const batches: string[][] = [];
    
    for (let i = 0; i < classFiles.length; i += batchSize) {
      batches.push(classFiles.slice(i, i + batchSize));
    }
    
    this.logger?.debug(`Processing ${classFiles.length} classes with ${batches.length} workers`);
    
    // 并行运行所有 Worker
    const workerPromises = batches.map(batch => {
      return new Promise<{ configs: MapperScanConfig[]; errors: string[] }>((resolve, reject) => {
        const workerPath = path.join(__dirname, 'classParsingWorker.js');
        const worker = new Worker(workerPath);
        
        worker.once('message', (result) => {
          worker.terminate();
          resolve(result);
        });
        
        worker.once('error', (err) => {
          worker.terminate();
          reject(err);
        });
        
        worker.postMessage({ classFiles: batch });
      });
    });
    
    try {
      const results = await Promise.all(workerPromises);
      for (const result of results) {
        configs.push(...result.configs);
        errors.push(...result.errors);
      }
      
      if (errors.length > 0) {
        this.logger?.debug(`Worker parsing errors: ${errors.length}`);
      }
    } catch (error) {
      this.logger?.debug('Worker thread error:', error);
      // 降级到主线程
      return this.parseConfigClassesParallel(classFiles, 5);
    }
    
    return configs;
  }

  // ========== Layer 5: 运行时配置 ==========
  private async resolveFromRuntime(): Promise<MapperScanConfig[]> {
    const configs: MapperScanConfig[] = [];

    try {
      // 尝试从环境变量读取Spring配置
      // 常见的云原生配置方式
      const envVars = process.env;
      
      // 检查是否有MyBatis相关的环境变量配置
      const mybatisConfigKeys = Object.keys(envVars).filter(key => 
        key.toUpperCase().includes('MYBATIS') || 
        key.toUpperCase().includes('MAPPER_SCAN')
      );

      for (const key of mybatisConfigKeys) {
        const value = envVars[key];
        if (value) {
          // 解析包名列表
          const packages = value.split(/[,;]/).map(p => p.trim()).filter(p => p);
          if (packages.length > 0) {
            configs.push({
              basePackages: packages,
              sourceFile: `environment:${key}`
            });
          }
        }
      }

      // 尝试读取Spring Boot的spring.profiles.active
      const springProfiles = envVars['SPRING_PROFILES_ACTIVE'];
      if (springProfiles) {
        this.logger?.info(`Detected Spring profiles: ${springProfiles}`);
      }
    } catch (error) {
      this.logger?.debug('Error resolving from runtime:', error);
    }

    return configs;
  }

  // ========== Layer 6: 环境变量和系统属性 ==========
  private async resolveFromEnvironment(): Promise<MapperScanConfig[]> {
    const configs: MapperScanConfig[] = [];

    try {
      // 检查IDE的配置（VS Code设置）
      const config = vscode.workspace.getConfiguration('mybatis-helper');
      const customPackages = config.get<string[]>('customMapperPackages', []);
      
      if (customPackages.length > 0) {
        configs.push({
          basePackages: customPackages,
          sourceFile: 'vscode:settings'
        });
      }
    } catch (error) {
      this.logger?.debug('Error resolving from environment:', error);
    }

    return configs;
  }

  // ========== 工具方法 ==========

  /**
   * 从Java源文件解析@MapperScan
   */
  private async parseMapperScanFromFile(filePath: string): Promise<MapperScanConfig | null> {
    try {
      const content = await fs.readFile(filePath, 'utf-8');
      return this.parseMapperScanFromContent(content, filePath);
    } catch (error) {
      return null;
    }
  }

  /**
   * 从内容解析@MapperScan
   */
  private parseMapperScanFromContent(content: string, sourcePath: string): MapperScanConfig | null {
    if (!content.includes('@MapperScan')) {
      return null;
    }

    this.logger?.debug(`Parsing @MapperScan from: ${path.basename(sourcePath)}`);

    // 支持多种格式
    const patterns = [
      // @MapperScan("pkg") 或 @MapperScan({"pkg1", "pkg2"})
      /@MapperScan\s*\(\s*(?:(?:value|basePackages)\s*=\s*)?(\{[^}]+\}|"[^"]+")\s*\)/,
      // @MapperScan(basePackages = "pkg")
      /@MapperScan\s*\(\s*basePackages\s*=\s*(\{[^}]+\}|"[^"]+")\s*\)/,
      // @MapperScan(basePackageClasses = Xxx.class)
      /@MapperScan\s*\(\s*basePackageClasses\s*=\s*\{?([^}]+)\}?\s*\)/
    ];

    for (let i = 0; i < patterns.length; i++) {
      const pattern = patterns[i];
      const match = content.match(pattern);
      if (match) {
        this.logger?.debug(`  Pattern ${i} matched: ${match[0].substring(0, 50)}...`);
        const value = match[1].trim();
        const packages = this.extractPackageNames(value, content);
        
        if (packages.length > 0) {
          this.logger?.debug(`  Extracted packages: ${packages.join(', ')}`);
          return {
            basePackages: packages,
            sourceFile: sourcePath
          };
        } else {
          this.logger?.debug(`  Pattern matched but no packages extracted from: ${value}`);
        }
      }
    }

    this.logger?.debug(`  No pattern matched for ${path.basename(sourcePath)}`);
    return null;
  }

  /**
   * 检查 javap 命令是否可用
   */
  private isJavapAvailable(): boolean {
    try {
      const { execSync } = require('child_process');
      execSync('javap -version', { encoding: 'utf-8', timeout: 3000 });
      return true;
    } catch {
      this.logger?.debug('javap command not available');
      return false;
    }
  }

  /**
   * 从字节码输出中解析 @MapperScan 注解
   */
  private parseMapperScanFromBytecode(output: string, sourceFile: string): MapperScanConfig | null {
    // 快速检查是否包含 MapperScan
    if (!output.includes('MapperScan')) {
      return null;
    }

    const basePackages: string[] = [];
    const lines = output.split('\n');
    let inAnnotations = false;
    let inMapperScan = false;
    
    for (let i = 0; i < lines.length; i++) {
      const line = lines[i];
      const trimmed = line.trim();
      
      // 进入 RuntimeVisibleAnnotations 部分
      if (trimmed === 'RuntimeVisibleAnnotations:') {
        inAnnotations = true;
        continue;
      }
      
      // 离开注解部分（遇到下一个属性段）
      if (inAnnotations && trimmed.endsWith(':') && !trimmed.includes('@') && !trimmed.match(/^\d+:/)) {
        break;
      }
      
      if (!inAnnotations) continue;
      
      // 检测 @MapperScan 注解开始
      if (trimmed.includes('org.mybatis.spring.annotation.MapperScan') ||
          (trimmed.match(/^\d+:.+#\d+/) && output.split('\n').slice(i, i+3).join('').includes('MapperScan'))) {
        inMapperScan = true;
        continue;
      }
      
      if (inMapperScan) {
        // 解析 value=["pkg1", "pkg2"] 格式
        const valueMatch = trimmed.match(/value=\[([^\]]+)\]/);
        if (valueMatch) {
          const packages = valueMatch[1]
            .split(',')
            .map(p => p.trim().replace(/"/g, ''))
            .filter(p => p && p.includes('.'));
          basePackages.push(...packages);
        }

        // 解析 basePackages={...} 格式
        const basePackagesMatch = trimmed.match(/basePackages=\{([^}]+)\}/);
        if (basePackagesMatch) {
          const packages = basePackagesMatch[1]
            .split(',')
            .map(p => p.trim().replace(/"/g, ''))
            .filter(p => p && p.includes('.'));
          basePackages.push(...packages);
        }

        // 遇到结束括号或新注解时退出
        if (trimmed === ')' || (trimmed.match(/^\d+:/))) {
          inMapperScan = false;
        }
      }
    }
    
    if (basePackages.length > 0) {
      this.logger?.debug(`Found @MapperScan with packages: ${basePackages.join(', ')}`);
      return { basePackages, sourceFile };
    }
    
    return null;
  }

  /**
   * 从jar包解析注解
   */
  private async parseAnnotationsFromJar(jarPath: string): Promise<MapperScanConfig[]> {
    const configs: MapperScanConfig[] = [];
    
    // 如果 javap 不可用，直接返回空数组
    if (!this.isJavapAvailable()) {
      this.logger?.debug('javap not available, skipping JAR bytecode parsing');
      return configs;
    }
    
    try {
      const { execSync } = require('child_process');
      
      // 列出jar中的class文件
      const output = execSync(`jar tf "${jarPath}"`, { encoding: 'utf-8' });
      const files = output.split('\n');
      
      // 查找可能的配置类
      const configClasses = files.filter((f: string) => 
        f.endsWith('Config.class') || 
        f.endsWith('Configuration.class') ||
        f.endsWith('AutoConfiguration.class')
      );

      // 限制扫描数量，避免耗时过长
      const limit = Math.min(configClasses.length, 5);
      for (let i = 0; i < limit; i++) {
        const classFile = configClasses[i];
        try {
          // 构建类名
          const className = classFile.replace(/\//g, '.').replace('.class', '');
          
          // 使用 javap 直接解析 JAR 中的 class
          const javapOutput = execSync(
            `javap -v -classpath "${jarPath}" "${className}"`,
            { encoding: 'utf-8', timeout: 2000 }
          );
          
          const config = this.parseMapperScanFromBytecode(javapOutput, `${jarPath}!${classFile}`);
          if (config) {
            configs.push(config);
            this.logger?.info(`Found @MapperScan in JAR: ${className} -> ${config.basePackages.join(', ')}`);
          }
        } catch (classError) {
          // 单个类解析失败，继续处理其他类
          this.logger?.debug(`Failed to parse class ${classFile}:`, classError);
        }
      }
    } catch (error) {
      this.logger?.debug(`Error parsing jar ${jarPath}:`, error);
    }

    return configs;
  }

  /**
   * 从class文件解析注解
   */
  private async parseAnnotationsFromClassFile(classPath: string): Promise<MapperScanConfig | null> {
    // 如果 javap 不可用，直接返回 null
    if (!this.isJavapAvailable()) {
      this.logger?.debug('javap not available, skipping class file bytecode parsing');
      return null;
    }
    
    try {
      const { execSync } = require('child_process');
      const output = execSync(`javap -v "${classPath}"`, { encoding: 'utf-8', timeout: 2000 });
      

      
      return this.parseMapperScanFromBytecode(output, classPath);
    } catch (error) {
      this.logger?.debug(`Error parsing class file ${classPath}:`, error);
      return null;
    }
  }

  // 文件解析缓存: 路径 -> {mtime, result}
  private fileCache = new Map<string, {mtime: number, result: MapperScanConfig | null}>();

  /**
   * 查找可能的配置类文件（只返回包含 Config/Configuration/Application 的类）
   */
  private async findConfigClassFiles(dir: string): Promise<string[]> {
    const files: string[] = [];
    const configPatterns = /(Config|Configuration|Application|AutoConfiguration)\.class$/i;
    
    try {
      const entries = await fs.readdir(dir, { withFileTypes: true });
      
      for (const entry of entries) {
        const fullPath = path.join(dir, entry.name);
        if (entry.isDirectory()) {
          const subFiles = await this.findConfigClassFiles(fullPath);
          files.push(...subFiles);
        } else if (configPatterns.test(entry.name)) {
          files.push(fullPath);
        }
      }
    } catch (error) {
      // 忽略错误
    }

    return files;
  }

  /**
   * 批量并行解析 class 文件（带缓存）
   */
  private async parseConfigClassesParallel(classFiles: string[], concurrency: number = 5): Promise<MapperScanConfig[]> {
    const configs: MapperScanConfig[] = [];
    
    // 分批处理，限制并发
    for (let i = 0; i < classFiles.length; i += concurrency) {
      const batch = classFiles.slice(i, i + concurrency);
      const results = await Promise.all(
        batch.map(file => this.parseAnnotationsFromClassFileCached(file))
      );
      
      for (const result of results) {
        if (result) {
          configs.push(result);
        }
      }
    }
    
    return configs;
  }

  /**
   * 带缓存的 class 文件解析
   */
  private async parseAnnotationsFromClassFileCached(classPath: string): Promise<MapperScanConfig | null> {
    try {
      // 检查缓存
      const stats = await fs.stat(classPath);
      const cached = this.fileCache.get(classPath);
      
      if (cached && cached.mtime === stats.mtimeMs) {
        this.logger?.debug(`Cache hit for ${classPath}`);
        return cached.result;
      }
      
      // 解析并缓存
      const result = await this.parseAnnotationsFromClassFile(classPath);
      this.fileCache.set(classPath, { mtime: stats.mtimeMs, result });
      
      return result;
    } catch (error) {
      return null;
    }
  }

  /**
   * 查找多模块项目中的子模块
   */
  private async findSubModules(rootPath: string): Promise<string[]> {
    const modules: string[] = [];
    
    try {
      // 读取 pom.xml 查找 Maven 子模块
      const pomPath = path.join(rootPath, 'pom.xml');
      try {
        await fs.access(pomPath);
        const pomContent = await fs.readFile(pomPath, 'utf-8');
        
        // 匹配 <modules> 部分
        const modulesMatch = pomContent.match(/<modules>([\s\S]*?)<\/modules>/);
        if (modulesMatch) {
          const moduleMatches = modulesMatch[1].matchAll(/<module>([^<]+)<\/module>/g);
          for (const match of moduleMatches) {
            const modulePath = path.join(rootPath, match[1].trim());
            modules.push(modulePath);
          }
        }
      } catch (e) {
        // pom.xml 不存在或无法读取
      }
      
      // 读取 settings.gradle 查找 Gradle 子模块
      const settingsPath = path.join(rootPath, 'settings.gradle');
      const settingsKtsPath = path.join(rootPath, 'settings.gradle.kts');
      try {
        const gradleSettingsPath = await fs.access(settingsPath).then(() => settingsPath)
          .catch(() => fs.access(settingsKtsPath).then(() => settingsKtsPath).catch(() => null));
        
        if (gradleSettingsPath) {
          const settingsContent = await fs.readFile(gradleSettingsPath, 'utf-8');
          // 匹配 include 'module' 或 include("module")
          const includeMatches = settingsContent.matchAll(/include\s*['"]([^'"]+)['"]/g);
          for (const match of includeMatches) {
            const moduleName = match[1].trim();
            // 处理可能的路径前缀
            const modulePath = path.join(rootPath, moduleName.replace(':', '/'));
            modules.push(modulePath);
          }
        }
      } catch (e) {
        // settings.gradle 不存在或无法读取
      }
    } catch (error) {
      // 忽略错误
    }
    
    this.logger?.debug(`Found ${modules.length} sub-modules: ${modules.join(', ')}`);
    return modules;
  }

  /**
   * 提取包名
   */
  private extractPackageNames(value: string, fullContent?: string): string[] {
    const packages: string[] = [];

    // 处理basePackageClasses
    if (value.includes('.class')) {
      const classMatches = value.matchAll(/(\w+)\.class/g);
      for (const match of classMatches) {
        // 从类名推断包名
        const className = match[1];
        // 在内容中查找import语句
        if (fullContent) {
          const importMatch = fullContent.match(new RegExp(`import\s+([\w.]+)\.${className};`));
          if (importMatch) {
            const pkg = importMatch[1];
            if (this.isValidPackageName(pkg)) {
              packages.push(pkg);
            }
          }
        }
      }
      return packages;
    }

    // 处理字符串数组 {"pkg1", "pkg2"}
    if (value.startsWith('{') && value.endsWith('}')) {
      const matches = value.matchAll(/"([^"]+)"/g);
      for (const match of matches) {
        if (match[1] && this.isValidPackageName(match[1])) {
          packages.push(match[1]);
        }
      }
    } else {
      // 单个字符串 "pkg"
      const cleanValue = value.replace(/"/g, '').trim();
      if (this.isValidPackageName(cleanValue)) {
        packages.push(cleanValue);
      }
    }

    return [...new Set(packages)]; // 去重
  }

  private isValidPackageName(name: string): boolean {
    // 支持标准包名，以及 Spring 的 ** 通配符（如 com.ruoyi.**.mapper）
    return /^[a-zA-Z][a-zA-Z0-9_]*(\.[a-zA-Z0-9_*]+)*$/.test(name);
  }

  /**
   * 配置去重
   */
  private deduplicateConfigs(configs: MapperScanConfig[]): MapperScanConfig[] {
    const seen = new Set<string>();
    const unique: MapperScanConfig[] = [];

    for (const config of configs) {
      const key = config.basePackages.sort().join(',');
      if (!seen.has(key)) {
        seen.add(key);
        unique.push(config);
      }
    }

    return unique;
  }

  /**
   * 获取诊断信息
   */
  public getDiagnostics(): object {
    return {
      cacheSize: this.configCache.size,
      runtimeConfigs: Object.fromEntries(this.runtimeConfigs)
    };
  }
}
