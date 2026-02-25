/**
 * 高性能导航服务
 * 
 * 核心优化：
 * 1. O(1) 索引查找，避免线性搜索
 * 2. 快速路径优先，避免不必要的文件I/O
 * 3. 精确的 namespace 匹配
 * 4. 智能回退策略
 */

import * as vscode from 'vscode';
import { FastMappingEngine } from './fastMappingEngine';
import { FastScanner } from './fastScanner';
import { MapperMapping, MethodMapping } from './types';
import { Logger } from '../../utils/logger';
import { THRESHOLDS } from '../../utils/constants';

interface NavigationOptions {
  openSideBySide?: boolean;
  revealType?: vscode.TextEditorRevealType;
}

const DEFAULT_OPTIONS: NavigationOptions = {
  revealType: vscode.TextEditorRevealType.InCenter
};

export class FastNavigationService {
  private static instance: FastNavigationService;
  private mappingEngine: FastMappingEngine;
  private scanner: FastScanner;
  private logger!: Logger;

  // 缓存最近使用的映射，加速重复跳转
  private recentMappings: Map<string, string> = new Map(); // javaPath -> xmlPath
  private readonly MAX_RECENT = THRESHOLDS.MAX_RECENT_MAPPINGS;

  private constructor() {
    this.mappingEngine = FastMappingEngine.getInstance();
    this.scanner = FastScanner.getInstance();
  }

  public static getInstance(): FastNavigationService {
    if (!FastNavigationService.instance) {
      FastNavigationService.instance = new FastNavigationService();
    }
    return FastNavigationService.instance;
  }

  public async initialize(): Promise<void> {
    const { Logger } = await import('../../utils/logger.js');
    this.logger = Logger.getInstance();
  }

  // ========== Java → XML 导航 ==========

  /**
   * 从 Java Mapper 跳转到 XML
   * 
   * 优化路径：
   * 1. 检查缓存 - O(1)
   * 2. 索引查找 - O(1)
   * 3. 路径猜测 - O(1) 文件检查
   * 4. 按需扫描单个文件
   */
  public async navigateJavaToXml(
    javaPath: string, 
    methodName?: string,
    options: NavigationOptions = DEFAULT_OPTIONS
  ): Promise<boolean> {
    const startTime = Date.now();
    this.logger?.debug(`Navigating Java→XML: ${javaPath}, method: ${methodName}`);

    try {
      // 1. 索引查找 - O(1)
      let mapping = this.mappingEngine.getByJavaPath(javaPath);

      // 2. 如果未找到，尝试快速扫描该文件
      if (!mapping) {
        this.logger?.debug('Mapping not found, rescanning Java file...');
        await this.scanner.rescanJavaFile(javaPath);
        mapping = this.mappingEngine.getByJavaPath(javaPath);
      }

      if (!mapping) {
        vscode.window.showWarningMessage(vscode.l10n.t("warning.notMyBatisMapper"));
        return false;
      }

      if (!mapping.xmlPath) {
        // 尝试通过 namespace 查找 XML（可能文件路径变更了）
        const xmlPath = await this.findXmlByNamespace(mapping.namespace);
        if (xmlPath) {
          this.mappingEngine.updateXmlPath(javaPath, xmlPath);
          mapping = this.mappingEngine.getByJavaPath(javaPath)!;
        } else {
          vscode.window.showWarningMessage(vscode.l10n.t("fileMapper.noXmlFile"));
          return false;
        }
      }

      // 3. 执行跳转
      const targetPosition = methodName 
        ? this.findMethodPositionInXml(mapping, methodName)
        : undefined;

      await this.openAndReveal(mapping.xmlPath!, targetPosition, options);

      // 4. 更新缓存
      this.updateRecentCache(javaPath, mapping.xmlPath!);

      this.logger?.debug(`Navigation completed in ${Date.now() - startTime}ms`);
      return true;

    } catch (error) {
      this.logger?.error('Java→XML navigation failed:', error as Error);
      vscode.window.showErrorMessage(vscode.l10n.t("error.navigationFailed"));
      return false;
    }
  }

  // ========== XML → Java 导航 ==========

  /**
   * 从 XML 跳转到 Java Mapper
   * 
   * 优化路径：
   * 1. 索引查找 - O(1)
   * 2. namespace 查找 - O(1)
   * 3. 按需扫描
   */
  public async navigateXmlToJava(
    xmlPath: string,
    sqlId?: string,
    options: NavigationOptions = DEFAULT_OPTIONS
  ): Promise<boolean> {
    const startTime = Date.now();
    this.logger?.debug(`Navigating XML→Java: ${xmlPath}, sqlId: ${sqlId}`);

    try {
      // 1. 索引查找 - O(1)
      let mapping = this.mappingEngine.getByXmlPath(xmlPath);

      // 2. 如果未找到，解析 XML 获取 namespace
      if (!mapping) {
        this.logger?.debug('Mapping not found, parsing XML...');
        const { MyBatisXmlParser } = await import('./xmlParser.js');
        const parser = MyBatisXmlParser.getInstance();
        const xmlInfo = await parser.parseXmlMapper(xmlPath);

        if (!xmlInfo?.namespace) {
          vscode.window.showWarningMessage(vscode.l10n.t("fileMapper.noNamespace"));
          return false;
        }

        // 3. 通过 namespace 查找
        mapping = this.mappingEngine.getByNamespace(xmlInfo.namespace);

        // 4. 如果仍未找到，尝试扫描 Java
        if (!mapping) {
          await this.scanner.rescanXmlFile(xmlPath);
          mapping = this.mappingEngine.getByXmlPath(xmlPath);
        }
      }

      if (!mapping) {
        vscode.window.showWarningMessage(vscode.l10n.t("fileMapper.noMapperInterface"));
        return false;
      }

      // 5. 执行跳转
      const targetPosition = sqlId
        ? this.findSqlIdPositionInJava(mapping, sqlId)
        : undefined;

      await this.openAndReveal(mapping.javaPath, targetPosition, options);

      this.logger?.debug(`Navigation completed in ${Date.now() - startTime}ms`);
      return true;

    } catch (error) {
      this.logger?.error('XML→Java navigation failed:', error as Error);
      vscode.window.showErrorMessage(vscode.l10n.t("error.navigationFailed"));
      return false;
    }
  }

  // ========== 智能定位 ==========

  /**
   * 获取当前位置的导航信息（用于 CodeLens 和快捷键）
   */
  public async getNavigationInfo(
    document: vscode.TextDocument,
    position: vscode.Position
  ): Promise<{
    canNavigate: boolean;
    direction: 'java-to-xml' | 'xml-to-java' | null;
    targetPath?: string;
    methodName?: string;
  }> {
    const filePath = document.uri.fsPath;
    const isJava = filePath.endsWith('.java');

    if (isJava) {
      const mapping = this.mappingEngine.getByJavaPath(filePath);
      if (!mapping) {
        return { canNavigate: false, direction: null };
      }

      const methodName = await this.extractCurrentMethodName(document, position);
      return {
        canNavigate: !!mapping.xmlPath,
        direction: 'java-to-xml',
        targetPath: mapping.xmlPath,
        methodName
      };
    } else {
      const mapping = this.mappingEngine.getByXmlPath(filePath);
      if (!mapping) {
        return { canNavigate: false, direction: null };
      }

      const sqlId = await this.extractCurrentSqlId(document, position);
      return {
        canNavigate: true,
        direction: 'xml-to-java',
        targetPath: mapping.javaPath,
        methodName: sqlId
      };
    }
  }

  /**
   * 检查是否可以导航
   */
  public canNavigate(filePath: string): boolean {
    if (filePath.endsWith('.java')) {
      const mapping = this.mappingEngine.getByJavaPath(filePath);
      return !!mapping?.xmlPath;
    } else if (filePath.endsWith('.xml')) {
      return this.mappingEngine.hasXmlMapping(filePath);
    }
    return false;
  }

  // ========== 私有辅助方法 ==========

  /**
   * 通过 namespace 查找 XML 文件（用于恢复映射）
   * 
   * 优化：先检查索引，再搜索文件系统
   */
  private async findXmlByNamespace(namespace: string): Promise<string | undefined> {
    // 1. 检查是否已有其他 XML 使用此 namespace
    const existingMapping = this.mappingEngine.getByNamespace(namespace);
    if (existingMapping?.xmlPath) {
      return existingMapping.xmlPath;
    }

    // 2. 快速路径：基于类名猜测路径
    const className = namespace.substring(namespace.lastIndexOf('.') + 1);
    const workspaceFolders = vscode.workspace.workspaceFolders;
    if (!workspaceFolders) return undefined;

    for (const folder of workspaceFolders) {
      // 常见路径模式
      const possiblePaths = [
        `**/mapper/**/${className}.xml`,
        `**/mappers/**/${className}.xml`,
        `**/resources/**/${className}.xml`,
        `**/${className}.xml`
      ];

      for (const pattern of possiblePaths) {
        const files = await vscode.workspace.findFiles(
          pattern,
          '**/{node_modules,.git,target,build,out}/**',
          5
        );

        for (const file of files) {
          // 验证 namespace
          const { MyBatisXmlParser } = await import('./xmlParser.js');
          const parser = MyBatisXmlParser.getInstance();
          const xmlInfo = await parser.parseXmlMapper(file.fsPath);
          
          if (xmlInfo?.namespace === namespace) {
            return file.fsPath;
          }
        }
      }
    }

    return undefined;
  }

  /**
   * 查找方法在 XML 中的位置
   */
  private findMethodPositionInXml(
    mapping: MapperMapping,
    methodName: string
  ): { line: number; column: number } | undefined {
    const methodMapping = mapping.methods.get(methodName);
    return methodMapping?.xmlPosition;
  }

  /**
   * 查找 SQL ID 在 Java 中的位置
   */
  private findSqlIdPositionInJava(
    mapping: MapperMapping,
    sqlId: string
  ): { line: number; column: number } | undefined {
    const methodMapping = mapping.methods.get(sqlId);
    return methodMapping?.javaPosition;
  }

  /**
   * 打开文件并定位
   */
  private async openAndReveal(
    filePath: string,
    position?: { line: number; column: number },
    options?: NavigationOptions
  ): Promise<void> {
    const uri = vscode.Uri.file(filePath);
    
    // 确定视图列
    const viewColumn = options?.openSideBySide 
      ? vscode.ViewColumn.Beside 
      : vscode.ViewColumn.One;

    // 打开文档
    const document = await vscode.workspace.openTextDocument(uri);
    const editor = await vscode.window.showTextDocument(document, {
      viewColumn,
      preserveFocus: false,
      preview: false
    });

    // 定位到指定位置
    if (position) {
      const vscodePosition = new vscode.Position(position.line, position.column);
      editor.selection = new vscode.Selection(vscodePosition, vscodePosition);
      editor.revealRange(
        new vscode.Range(vscodePosition, vscodePosition),
        options?.revealType || vscode.TextEditorRevealType.InCenter
      );
    }
  }

  /**
   * 提取当前方法名（Java）
   */
  private async extractCurrentMethodName(
    document: vscode.TextDocument,
    position: vscode.Position
  ): Promise<string | undefined> {
    // 尝试使用文档符号（最准确）
    try {
      const symbols = await vscode.commands.executeCommand<vscode.DocumentSymbol[]>(
        'vscode.executeDocumentSymbolProvider',
        document.uri
      );

      if (symbols) {
        for (const symbol of symbols) {
          if (symbol.kind === vscode.SymbolKind.Method &&
              symbol.range.contains(position)) {
            return symbol.name;
          }
          // 检查子符号
          for (const child of symbol.children || []) {
            if (child.kind === vscode.SymbolKind.Method &&
                child.range.contains(position)) {
              return child.name;
            }
          }
        }
      }
    } catch (error) {
      this.logger?.debug('Failed to get document symbols:', error);
    }

    // 降级：正则匹配当前行
    const line = document.lineAt(position.line).text;
    const methodRegex = /\s+(\w+)\s*\([^)]*\)\s*\{/;
    const match = methodRegex.exec(line);
    if (match) {
      return match[1];
    }

    return undefined;
  }

  /**
   * 提取当前 SQL ID（XML）
   */
  private async extractCurrentSqlId(
    document: vscode.TextDocument,
    position: vscode.Position
  ): Promise<string | undefined> {
    // 从当前行向上查找
    const sqlIdRegex = /<(select|insert|update|delete)\s+[^>]*id\s*=\s*["']([^"']+)["']/;
    
    for (let i = position.line; i >= 0; i--) {
      const line = document.lineAt(i).text;
      const match = sqlIdRegex.exec(line);
      if (match) {
        return match[2];
      }
    }

    return undefined;
  }

  /**
   * 更新最近使用缓存
   */
  private updateRecentCache(javaPath: string, xmlPath: string): void {
    this.recentMappings.set(javaPath, xmlPath);
    
    // 限制缓存大小
    if (this.recentMappings.size > this.MAX_RECENT) {
      const firstKey = this.recentMappings.keys().next().value;
      if (firstKey) {
        this.recentMappings.delete(firstKey);
      }
    }
  }

  // ========== 诊断接口 ==========

  public getDiagnostics(): object {
    return {
      recentCacheSize: this.recentMappings.size,
      engineDiagnostics: this.mappingEngine.getDiagnostics()
    };
  }
}
