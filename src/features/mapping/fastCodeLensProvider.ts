/**
 * Java Mapper CodeLens 提供器
 * 
 * 使用 Java 语言服务 API 获取准确的方法信息
 */

import * as vscode from 'vscode';
import { FastMappingEngine } from './fastMappingEngine';

export class FastCodeLensProvider implements vscode.CodeLensProvider {
  private mappingEngine: FastMappingEngine;
  private logger: any;
  private _onDidChangeCodeLenses: vscode.EventEmitter<void> = new vscode.EventEmitter<void>();
  public readonly onDidChangeCodeLenses: vscode.Event<void> = this._onDidChangeCodeLenses.event;

  constructor() {
    this.mappingEngine = FastMappingEngine.getInstance();
    this.initialize();
  }

  private async initialize(): Promise<void> {
    const { Logger } = await import('../../utils/logger.js');
    this.logger = Logger.getInstance();
  }

  public refresh(): void {
    this._onDidChangeCodeLenses.fire();
  }

  async provideCodeLenses(document: vscode.TextDocument): Promise<vscode.CodeLens[]> {
    const filePath = document.uri.fsPath;

    // 只处理 Java 文件
    if (!filePath.toLowerCase().endsWith('.java')) {
      return [];
    }

    // 1. 快速检查：是否是 MyBatis Mapper 接口
    const text = document.getText();
    if (!this.isMyBatisMapper(text)) {
      return [];
    }

    // 2. 从 mappingEngine 获取该文件的 XML 映射
    const mapping = this.mappingEngine.getByJavaPath(filePath);
    const xmlPath = mapping?.xmlPath;

    // 3. 使用 VS Code 文档符号 API 获取类和方法
    const symbols = await this.getDocumentSymbols(document);
    const classSymbol = symbols.find(s => s.kind === vscode.SymbolKind.Interface || s.kind === vscode.SymbolKind.Class);
    const methods = this.extractMethodsFromSymbols(symbols);

    const codeLenses: vscode.CodeLens[] = [];

    // 4. 为类添加 CodeLens（在类名位置）
    if (classSymbol) {
      const className = classSymbol.name;
      const classPosition = classSymbol.selectionRange || classSymbol.range;
      const classLens = this.createClassCodeLens(className, filePath, xmlPath, classPosition.start.line);
      if (classLens) {
        codeLenses.push(classLens);
      }
    }

    // 5. 为每个方法添加 CodeLens（在方法名位置）
    for (const method of methods) {
      // 去掉参数部分，获取纯方法名
      const methodNameWithoutParams = method.name.split('(')[0];
      
      const hasSql = mapping ? this.mappingEngine.hasSqlForMethod(mapping.namespace, method.name) : false;
      
      // 传递不带参数的方法名给跳转命令
      const methodLens = this.createMethodCodeLens(
        { ...method, name: methodNameWithoutParams }, 
        filePath, 
        hasSql
      );
      if (methodLens) {
        codeLenses.push(methodLens);
      }
    }

    return codeLenses;
  }

  /**
   * 获取文档符号
   */
  private async getDocumentSymbols(
    document: vscode.TextDocument
  ): Promise<vscode.DocumentSymbol[]> {
    try {
      const symbols = await vscode.commands.executeCommand<vscode.DocumentSymbol[]>(
        'vscode.executeDocumentSymbolProvider',
        document.uri
      );
      return symbols || [];
    } catch (error) {
      this.logger?.error('[CodeLens] Failed to get document symbols:', error);
      return [];
    }
  }

  /**
   * 从符号树中提取方法
   * 
   * 关键：使用 selectionRange 获取方法名的准确位置
   */
  private extractMethodsFromSymbols(
    symbols: vscode.DocumentSymbol[]
  ): Array<{ name: string; line: number; column: number }> {
    const methods: Array<{ name: string; line: number; column: number }> = [];

    for (const symbol of symbols) {
      if (symbol.kind === vscode.SymbolKind.Method) {
        // 使用 selectionRange 获取方法名的位置
        const position = symbol.selectionRange || symbol.range;
        methods.push({
          name: symbol.name,
          line: position.start.line,
          column: position.start.character
        });
      }
      // 递归处理子符号
      if (symbol.children) {
        methods.push(...this.extractMethodsFromSymbols(symbol.children));
      }
    }

    this.logger?.info(`[CodeLens] Total methods found: ${methods.length}`);
    methods.forEach(m => this.logger?.info(`[CodeLens]   - ${m.name} at line ${m.line}`));

    return methods;
  }

  /**
   * 快速检查是否是 MyBatis Mapper 接口
   */
  private isMyBatisMapper(text: string): boolean {
    if (!/interface\s+\w+/.test(text)) {
      return false;
    }

    const hasMyBatisMarker = 
      /@Mapper\b/.test(text) ||
      /import\s+org\.apache\.ibatis/.test(text) ||
      /import\s+org\.mybatis/.test(text) ||
      /extends\s+\w*Mapper\s*[<{]/.test(text);

    return hasMyBatisMarker;
  }

  /**
   * 提取类名
   */
  private extractClassName(text: string): string | null {
    const match = /interface\s+(\w+)/.exec(text);
    return match ? match[1] : null;
  }

  /**
   * 创建类级别的 CodeLens
   */
  private createClassCodeLens(
    className: string,
    javaPath: string,
    xmlPath: string | undefined,
    line: number
  ): vscode.CodeLens | null {
    // CodeLens 显示在类名所在行
    const range = new vscode.Range(line, 0, line, 0);
    
    const title = xmlPath
      ? `$(file-code) ${vscode.l10n.t("codelens.java.jumpToXml", { className })}`
      : `$(file-code) ${vscode.l10n.t("codelens.java.findXml", { className })}`;

    const command: vscode.Command = {
      title,
      command: 'mybatis-helper.jumpToXml',
      arguments: [javaPath]
    };

    return new vscode.CodeLens(range, command);
  }

  /**
   * 创建方法级别的 CodeLens
   * 
   * 只有当方法有对应的 SQL 映射时才显示
   */
  private createMethodCodeLens(
    method: { name: string; line: number; column: number },
    javaPath: string,
    hasSql: boolean
  ): vscode.CodeLens | null {
    // 没有 SQL 映射的方法不显示 CodeLens
    if (!hasSql) {
      return null;
    }

    const range = new vscode.Range(method.line, method.column, method.line, method.column);

    const command: vscode.Command = {
      title: `$(arrow-right) ${vscode.l10n.t("codelens.java.jumpToSql")}`,
      command: 'mybatis-helper.jumpToXml',
      arguments: [javaPath, method.name]
    };

    return new vscode.CodeLens(range, command);
  }

  resolveCodeLens?(codeLens: vscode.CodeLens): vscode.ProviderResult<vscode.CodeLens> {
    return codeLens;
  }
}
