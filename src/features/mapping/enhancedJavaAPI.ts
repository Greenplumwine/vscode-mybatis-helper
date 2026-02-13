import * as vscode from 'vscode';
import { JavaMapperInfo, MapperScanConfig, Position } from './types';

/**
 * 增强的 Java API 封装
 * 提供 Java 文件扫描、@MapperScan 解析、文档符号获取等功能
 */
export class EnhancedJavaAPI {
  private static instance: EnhancedJavaAPI;
  private logger: any;

  private constructor() {}

  public static getInstance(): EnhancedJavaAPI {
    if (!EnhancedJavaAPI.instance) {
      EnhancedJavaAPI.instance = new EnhancedJavaAPI();
    }
    return EnhancedJavaAPI.instance;
  }

  public async initialize(): Promise<void> {
    const { Logger } = await import('../../utils/logger.js');
    this.logger = Logger.getInstance();
  }

  /**
   * 查找 @MapperScan 配置
   * 高性能版本：优先使用工作区符号搜索，避免遍历所有文件
   */
  async findMapperScanConfigs(): Promise<MapperScanConfig[]> {
    const configs: MapperScanConfig[] = [];
    const processedFiles = new Set<string>();

    try {
      this.logger?.info('Searching for @MapperScan configurations...');
      const startTime = Date.now();

      // 策略 1: 使用工作区符号搜索（最快）
      const symbolSearchFiles = await this.findCandidateFilesWithWorkspaceSymbols();
      this.logger?.debug(`Found ${symbolSearchFiles.length} candidate files via workspace symbols`);

      // 解析符号搜索找到的文件
      for (const filePath of symbolSearchFiles) {
        if (processedFiles.has(filePath)) {
          continue;
        }
        processedFiles.add(filePath);

        try {
          const config = await this.parseMapperScanFromFile(filePath);
          if (config) {
            configs.push(config);
            this.logger?.debug(`Found @MapperScan in ${filePath}: ${config.basePackages.join(', ')}`);
          }
        } catch (error) {
          this.logger?.debug(`Failed to parse ${filePath}: ${error}`);
        }
      }

      // 如果通过符号搜索找到了配置，直接返回（性能最优路径）
      if (configs.length > 0) {
        const duration = Date.now() - startTime;
        this.logger?.info(`Found ${configs.length} @MapperScan configurations in ${duration}ms via workspace symbols`);
        return configs;
      }

      // 策略 2: 快速文本搜索（限制搜索范围）
      this.logger?.debug('No @MapperScan found via symbols, trying targeted file search...');
      const targetedFiles = await this.findFilesWithTargetedSearch();
      this.logger?.debug(`Found ${targetedFiles.length} candidate files via targeted search`);

      for (const filePath of targetedFiles) {
        if (processedFiles.has(filePath)) {
          continue;
        }
        processedFiles.add(filePath);

        try {
          const config = await this.parseMapperScanFromFile(filePath);
          if (config) {
            configs.push(config);
            this.logger?.debug(`Found @MapperScan in ${filePath}: ${config.basePackages.join(', ')}`);
          }
        } catch (error) {
          this.logger?.debug(`Failed to parse ${filePath}: ${error}`);
        }
      }

      const duration = Date.now() - startTime;
      this.logger?.info(`Found ${configs.length} @MapperScan configurations in ${duration}ms`);
      return configs;
    } catch (error) {
      this.logger?.error('Failed to find @MapperScan configs:', error as Error);
      return [];
    }
  }

  /**
   * 使用工作区符号搜索找到候选类文件
   * 这是最快的方式，利用 VS Code 已有的索引
   */
  private async findCandidateFilesWithWorkspaceSymbols(): Promise<string[]> {
    const candidateFiles: string[] = [];
    const processedUris = new Set<string>();

    try {
      // 搜索常见的类名模式，限制结果数量以提高性能
      const searchPatterns = [
        'Application',
        'Config',
        'Mybatis',
        'Mapper',
        'Boot',
      ];

      for (const pattern of searchPatterns) {
        try {
          const symbols = await vscode.commands.executeCommand<vscode.SymbolInformation[]>(
            'vscode.executeWorkspaceSymbolProvider',
            pattern
          );

          if (symbols && symbols.length > 0) {
            // 限制每个模式的结果数量
            const limitedSymbols = symbols.slice(0, 20);

            for (const symbol of limitedSymbols) {
              if (symbol.kind === vscode.SymbolKind.Class ||
                  symbol.kind === vscode.SymbolKind.Interface) {
                const uri = symbol.location.uri.toString();
                if (!processedUris.has(uri) && uri.endsWith('.java')) {
                  processedUris.add(uri);
                  candidateFiles.push(symbol.location.uri.fsPath);
                }
              }
            }
          }
        } catch (error) {
          this.logger?.debug(`Workspace symbol search failed for pattern ${pattern}: ${error}`);
        }
      }

      return candidateFiles;
    } catch (error) {
      this.logger?.debug('Failed to search workspace symbols:', error);
      return [];
    }
  }

  /**
   * 使用定向搜索找到可能包含 @MapperScan 的文件
   * 只搜索特定目录，避免遍历整个项目
   */
  private async findFilesWithTargetedSearch(): Promise<string[]> {
    const filesWithAnnotation: string[] = [];
    const processedPaths = new Set<string>();

    try {
      // 策略：只搜索常见的配置目录
      const targetPatterns = [
        '**/config/**/*.java',
        '**/configuration/**/*.java',
        '**/*Application*.java',
        '**/*Config*.java',
        '**/src/main/java/**/*.java',
      ];

      const allFiles: vscode.Uri[] = [];

      // 并行搜索多个模式
      const searchPromises = targetPatterns.map(async (pattern) => {
        try {
          const files = await vscode.workspace.findFiles(
            pattern,
            '**/{node_modules,.git,target,build,out}/**',
            50 // 限制每个模式的结果数量
          );
          return files;
        } catch (error) {
          return [];
        }
      });

      const fileArrays = await Promise.all(searchPromises);

      // 合并并去重
      for (const files of fileArrays) {
        for (const file of files) {
          if (!processedPaths.has(file.fsPath)) {
            processedPaths.add(file.fsPath);
            allFiles.push(file);
          }
        }
      }

      this.logger?.debug(`Targeted search found ${allFiles.length} candidate files`);

      // 批量检查文件内容
      const batchSize = 50;
      for (let i = 0; i < allFiles.length; i += batchSize) {
        const batch = allFiles.slice(i, i + batchSize);

        const batchResults = await Promise.all(
          batch.map(async (file) => {
            try {
              // 快速检查：只读取文件前 30 行
              const document = await vscode.workspace.openTextDocument(file);
              const lineCount = Math.min(30, document.lineCount);
              let content = '';
              for (let j = 0; j < lineCount; j++) {
                content += document.lineAt(j).text + '\n';
              }

              // 快速排除：检查是否包含 mybatis 或 MapperScan 相关 import
              if (content.includes('mybatis') || content.includes('MapperScan')) {
                if (content.includes('@MapperScan')) {
                  return file.fsPath;
                }
              }
              return null;
            } catch (error) {
              return null;
            }
          })
        );

        for (const result of batchResults) {
          if (result) {
            filesWithAnnotation.push(result);
          }
        }
      }

      return filesWithAnnotation;
    } catch (error) {
      this.logger?.debug('Failed to search files with targeted search:', error);
      return [];
    }
  }

  /**
   * 从文件解析 @MapperScan 配置
   */
  private async parseMapperScanFromFile(filePath: string): Promise<MapperScanConfig | null> {
    try {
      const document = await vscode.workspace.openTextDocument(filePath);
      const content = document.getText();

      return this.parseMapperScanFromContent(content, filePath);
    } catch (error) {
      this.logger?.debug(`Failed to parse file ${filePath}: ${error}`);
      return null;
    }
  }

  /**
   * 从文件内容解析 @MapperScan 配置
   */
  private parseMapperScanFromContent(content: string, filePath: string): MapperScanConfig | null {
    // 匹配 @MapperScan 注解，支持多种格式
    const mapperScanRegex = /@MapperScan\s*\(\s*(?:(?:value|basePackages)\s*=\s*)?(\{[^}]*\}|["'][^"']+["'])\s*(?:,\s*\w+\s*=\s*[^)]+)?\s*\)/;
    const mapperScanMatch = content.match(mapperScanRegex);

    if (mapperScanMatch) {
      const value = mapperScanMatch[1].trim();

      // 如果是数组格式 { "pkg1", "pkg2" }
      if (value.startsWith('{') && value.endsWith('}')) {
        const packages = value
          .slice(1, -1)
          .split(',')
          .map(p => p.trim().replace(/["']/g, ''))
          .filter(p => p.length > 0);

        if (packages.length > 0) {
          return {
            basePackages: packages,
            sourceFile: filePath
          };
        }
      } else {
        // 单个字符串值
        const packageName = value.replace(/["']/g, '');
        if (packageName) {
          return {
            basePackages: [packageName],
            sourceFile: filePath
          };
        }
      }
    }

    // 尝试匹配 basePackageClasses
    const basePackageClassesRegex = /@MapperScan\s*\(\s*basePackageClasses\s*=\s*\{([^}]+)\}\s*\)/;
    const basePackageClassesMatch = content.match(basePackageClassesRegex);

    if (basePackageClassesMatch) {
      const classRefs = basePackageClassesMatch[1]
        .split(',')
        .map(c => c.trim().replace(/\.class/g, ''))
        .filter(c => c.length > 0);

      const packages = classRefs.map(classRef => {
        const lastDotIndex = classRef.lastIndexOf('.');
        return lastDotIndex > 0 ? classRef.substring(0, lastDotIndex) : classRef;
      }).filter(p => p.length > 0);

      if (packages.length > 0) {
        return {
          basePackages: packages,
          sourceFile: filePath
        };
      }
    }

    return null;
  }

  /**
   * 扫描指定包路径下的 Java Mapper 文件
   */
  async scanJavaMappers(packages?: string[]): Promise<JavaMapperInfo[]> {
    const mappers: JavaMapperInfo[] = [];
    const scannedFiles = new Set<string>();

    try {
      if (packages && packages.length > 0) {
        // 并行收集所有包路径下的文件
        const filePromises = packages.map(async (pkg) => {
          const pkgPath = pkg.replace(/\./g, '/');
          const pattern = `**/${pkgPath}/**/*.java`;
          return vscode.workspace.findFiles(
            pattern,
            '**/{node_modules,.git,target,build,out}/**'
          );
        });

        const fileArrays = await Promise.all(filePromises);
        const allFiles = fileArrays.flat();

        // 去重
        const uniqueFiles = allFiles.filter(file => {
          if (scannedFiles.has(file.fsPath)) {
            return false;
          }
          scannedFiles.add(file.fsPath);
          return true;
        });

        this.logger?.debug(`Found ${uniqueFiles.length} unique Java files in packages`);

        // 批量并行解析
        const batchSize = 20;
        for (let i = 0; i < uniqueFiles.length; i += batchSize) {
          const batch = uniqueFiles.slice(i, i + batchSize);
          const batchResults = await Promise.all(
            batch.map(file => this.parseJavaMapperFile(file.fsPath))
          );
          mappers.push(...batchResults.filter((m): m is JavaMapperInfo => m !== null));

          if (i + batchSize < uniqueFiles.length) {
            await new Promise(resolve => setTimeout(resolve, 0));
          }
        }
      } else {
        const allJavaFiles = await vscode.workspace.findFiles(
          '**/*.java',
          '**/{node_modules,.git,target,build,out}/**'
        );

        this.logger?.debug(`Found ${allJavaFiles.length} Java files to scan`);

        const batchSize = 20;
        for (let i = 0; i < allJavaFiles.length; i += batchSize) {
          const batch = allJavaFiles.slice(i, i + batchSize);
          const batchResults = await Promise.all(
            batch.map(file => this.parseJavaMapperFile(file.fsPath))
          );
          mappers.push(...batchResults.filter((m): m is JavaMapperInfo => m !== null));

          if (i + batchSize < allJavaFiles.length) {
            await new Promise(resolve => setTimeout(resolve, 0));
          }
        }
      }

      this.logger?.info(`Scanned ${mappers.length} Java mappers`);
      return mappers;
    } catch (error) {
      this.logger?.error('Failed to scan Java mappers:', error as Error);
      return [];
    }
  }

  /**
   * 解析单个 Java Mapper 文件
   */
  async parseJavaMapperFile(filePath: string): Promise<JavaMapperInfo | null> {
    try {
      const document = await vscode.workspace.openTextDocument(filePath);
      const content = document.getText();

      const isInterface = /interface\s+\w+/.test(content);
      if (!isInterface) {
        return null;
      }

      const hasMapperAnnotation = /@Mapper\b/.test(content);
      const hasMyBatisImport = /import\s+org\.apache\.ibatis|import\s+org\.mybatis/.test(content);

      if (!hasMapperAnnotation && !hasMyBatisImport) {
        return null;
      }

      const packageMatch = content.match(/package\s+([^;]+);/);
      const packageName = packageMatch ? packageMatch[1] : '';

      const classNameMatch = content.match(/interface\s+(\w+)/);
      if (!classNameMatch) {
        return null;
      }
      const simpleClassName = classNameMatch[1];
      const className = packageName ? `${packageName}.${simpleClassName}` : simpleClassName;

      const symbols = await this.getDocumentSymbols(filePath);
      const methods: Array<{ name: string; position: Position }> = [];

      for (const symbol of symbols) {
        if (symbol.kind === vscode.SymbolKind.Method) {
          methods.push({
            name: symbol.name,
            position: {
              line: symbol.range.start.line,
              column: symbol.range.start.character
            }
          });
        }
      }

      return {
        filePath,
        className,
        packageName,
        methods
      };
    } catch (error) {
      this.logger?.debug(`Failed to parse Java file ${filePath}: ${error}`);
      return null;
    }
  }

  /**
   * 获取文档符号
   */
  async getDocumentSymbols(filePath: string): Promise<vscode.DocumentSymbol[]> {
    try {
      const uri = vscode.Uri.file(filePath);
      const document = await vscode.workspace.openTextDocument(uri);

      const symbols = await vscode.commands.executeCommand<vscode.DocumentSymbol[]>(
        'vscode.executeDocumentSymbolProvider',
        uri
      );

      if (symbols && symbols.length > 0) {
        return symbols;
      }

      return this.fallbackSymbolParsing(document);
    } catch (error) {
      this.logger?.debug(`Failed to get document symbols for ${filePath}: ${error}`);
      return [];
    }
  }

  /**
   * 降级方案
   */
  private fallbackSymbolParsing(document: vscode.TextDocument): vscode.DocumentSymbol[] {
    const symbols: vscode.DocumentSymbol[] = [];
    const content = document.getText();
    const lines = content.split('\n');

    const methodRegex = /^(?:\s*)(?:public|private|protected|default)?\s*(?:static|final|abstract)?\s*(?:<[^>]+>\s*)?[\w<>,\s]+\s+(\w+)\s*\([^)]*\)\s*(?:throws\s+[\w,\s]+)?\s*\{/;

    for (let i = 0; i < lines.length; i++) {
      const line = lines[i];
      const match = methodRegex.exec(line);
      if (match) {
        const methodName = match[1];
        const range = new vscode.Range(i, 0, i, line.length);
        const symbol = new vscode.DocumentSymbol(
          methodName,
          '',
          vscode.SymbolKind.Method,
          range,
          range
        );
        symbols.push(symbol);
      }
    }

    return symbols;
  }
}
