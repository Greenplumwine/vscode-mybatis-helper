import * as vscode from 'vscode';
import { MapperScanConfig } from './types';
import { MyBatisXmlParser } from './xmlParser';
import { Logger } from '../../utils/logger';

/**
 * XML 位置解析器
 * 按照优先级解析 XML Mapper 文件位置：
 * 1. mybatis-config.xml 的 <mappers> 配置
 * 2. Spring Boot 的 application.yml/properties 的 mybatis.mapper-locations
 * 3. 默认路径猜测
 */
export class XmlLocationResolver {
  private static instance: XmlLocationResolver;
  private xmlParser: MyBatisXmlParser;
  private logger!: Logger;
  private resolvedLocations: string[] = [];

  private constructor() {
    this.xmlParser = MyBatisXmlParser.getInstance();
  }

  public static getInstance(): XmlLocationResolver {
    if (!XmlLocationResolver.instance) {
      XmlLocationResolver.instance = new XmlLocationResolver();
    }
    return XmlLocationResolver.instance;
  }

  public async initialize(): Promise<void> {
    const { Logger } = await import('../../utils/logger.js');
    this.logger = Logger.getInstance();
    await this.xmlParser.initialize();
  }

  /**
   * 解析 XML 位置
   * 按照优先级：mybatis-config.xml → Spring Boot 配置 → 默认路径
   */
  async resolveXmlLocations(): Promise<string[]> {
    this.logger?.info('Resolving XML locations...');
    const startTime = Date.now();
    const locations: string[] = [];

    // 并行解析所有来源
    const [mybatisConfigLocations, springBootLocations] = await Promise.all([
      this.resolveFromMyBatisConfig(),
      this.resolveFromSpringBootConfig()
    ]);

    if (mybatisConfigLocations.length > 0) {
      this.logger?.info(`Found ${mybatisConfigLocations.length} locations from mybatis-config.xml`);
      locations.push(...mybatisConfigLocations);
    }

    if (springBootLocations.length > 0) {
      this.logger?.info(`Found ${springBootLocations.length} locations from Spring Boot config`);
      locations.push(...springBootLocations);
    }

    // 去重并转换路径模式
    this.resolvedLocations = [...new Set(locations)];
    const globPatterns = this.convertToGlobPatterns(this.resolvedLocations);

    const duration = Date.now() - startTime;
    this.logger?.info(`Resolved ${globPatterns.length} XML location patterns in ${duration}ms`);
    return globPatterns;
  }

  /**
   * 从 mybatis-config.xml 解析
   */
  private async resolveFromMyBatisConfig(): Promise<string[]> {
    try {
      const configFiles = await vscode.workspace.findFiles(
        '**/mybatis-config.xml',
        '**/{node_modules,.git,target,build,out}/**',
        5 // 限制数量
      );

      if (configFiles.length === 0) {
        return [];
      }

      const locations: string[] = [];
      for (const file of configFiles) {
        const configLocations = await this.xmlParser.parseMyBatisConfig(file.fsPath);
        if (configLocations) {
          locations.push(...configLocations);
        }
      }
      return locations;
    } catch (error) {
      this.logger?.debug('Failed to resolve from mybatis-config.xml:', error);
      return [];
    }
  }

  /**
   * 从 Spring Boot 配置解析
   */
  private async resolveFromSpringBootConfig(): Promise<string[]> {
    try {
      // 并行查找 YAML 和 Properties 文件
      const [yamlFiles, propertiesFiles] = await Promise.all([
        vscode.workspace.findFiles(
          '**/application{,-*}.yml',
          '**/{node_modules,.git,target,build,out}/**',
          5
        ),
        vscode.workspace.findFiles(
          '**/application{,-*}.properties',
          '**/{node_modules,.git,target,build,out}/**',
          5
        )
      ]);

      const locations: string[] = [];

      // 解析 YAML 文件
      const yamlPromises = yamlFiles.map(async (file) => {
        try {
          const document = await vscode.workspace.openTextDocument(file);
          const content = document.getText();
          return this.xmlParser.parseMapperLocationsFromYaml(content);
        } catch (error) {
          return [];
        }
      });

      // 解析 Properties 文件
      const propPromises = propertiesFiles.map(async (file) => {
        try {
          const document = await vscode.workspace.openTextDocument(file);
          const content = document.getText();
          return this.xmlParser.parseMapperLocationsFromProperties(content);
        } catch (error) {
          return [];
        }
      });

      const [yamlResults, propResults] = await Promise.all([
        Promise.all(yamlPromises),
        Promise.all(propPromises)
      ]);

      for (const result of yamlResults) {
        locations.push(...result);
      }
      for (const result of propResults) {
        locations.push(...result);
      }

      return locations;
    } catch (error) {
      this.logger?.debug('Failed to resolve from Spring Boot config:', error);
      return [];
    }
  }

  /**
   * 将配置路径转换为 glob 模式
   */
  private convertToGlobPatterns(locations: string[]): string[] {
    const patterns: string[] = [];

    for (const location of locations) {
      // 处理 classpath*: 前缀
      let pattern = location.replace(/^classpath\*?:/, '');

      // 处理 /**/*.xml 模式
      if (pattern.includes('**/*.xml')) {
        patterns.push(pattern);
      } else if (pattern.endsWith('.xml')) {
        // 具体文件路径
        patterns.push(`**/${pattern}`);
      } else {
        // 目录路径，添加 /**/*.xml
        patterns.push(`${pattern}/**/*.xml`);
      }
    }

    return patterns;
  }

  /**
   * 设置 MapperScan 配置
   */
  public setMapperScanConfigs(configs: MapperScanConfig[]): void {
    // 此方法用于外部设置配置
  }
}