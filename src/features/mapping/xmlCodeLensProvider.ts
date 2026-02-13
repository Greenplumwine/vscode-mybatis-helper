/**
 * XML Mapper CodeLens 提供器
 * 
 * 设计原则：
 * 1. FastMappingEngine 只存储文件级别的映射
 * 2. CodeLens 独立工作，实时查询当前文件
 * 3. 从 XML 提取 SQL id，查询 Java 是否有对应方法
 */

import * as vscode from 'vscode';
import { FastMappingEngine } from './fastMappingEngine';
import { MyBatisXmlParser } from './xmlParser';

export class XmlCodeLensProvider implements vscode.CodeLensProvider {
  private mappingEngine: FastMappingEngine;
  private xmlParser: MyBatisXmlParser;
  private logger: any;
  private _onDidChangeCodeLenses: vscode.EventEmitter<void> = new vscode.EventEmitter<void>();
  public readonly onDidChangeCodeLenses: vscode.Event<void> = this._onDidChangeCodeLenses.event;

  constructor() {
    this.mappingEngine = FastMappingEngine.getInstance();
    this.xmlParser = MyBatisXmlParser.getInstance();
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

    // 只处理 XML 文件
    if (!filePath.toLowerCase().endsWith('.xml')) {
      return [];
    }

    // 1. 解析 XML 获取 namespace 和 SQL 语句
    let xmlInfo;
    try {
      xmlInfo = await this.xmlParser.parseXmlMapper(filePath);
    } catch (e) {
      return [];
    }

    if (!xmlInfo || !xmlInfo.namespace) {
      return [];
    }

    // 2. 从 mappingEngine 查找对应的 Java 文件
    const mapping = this.mappingEngine.getByNamespace(xmlInfo.namespace);
    const javaPath = mapping?.javaPath;

    const codeLenses: vscode.CodeLens[] = [];

    // 3. 为 namespace 添加 CodeLens
    const simpleClassName = xmlInfo.namespace.substring(xmlInfo.namespace.lastIndexOf('.') + 1);
    const nsLens = this.createNamespaceCodeLens(simpleClassName, filePath, javaPath);
    if (nsLens) {
      codeLenses.push(nsLens);
    }

    // 4. 为每个 SQL 语句添加 CodeLens
    for (const [sqlId, statement] of xmlInfo.statements) {
      const sqlLens = this.createSqlCodeLens(sqlId, statement.line, statement.column, filePath, !!javaPath);
      if (sqlLens) {
        codeLenses.push(sqlLens);
      }
    }

    return codeLenses;
  }

  /**
   * 创建 namespace 的 CodeLens
   */
  private createNamespaceCodeLens(
    className: string,
    xmlPath: string,
    javaPath: string | undefined
  ): vscode.CodeLens | null {
    const range = new vscode.Range(0, 0, 0, 0);

    const title = javaPath
      ? vscode.l10n.t("codelens.xml.jumpToJava", { className })
      : vscode.l10n.t("codelens.xml.findJava", { className });

    const command: vscode.Command = {
      title: `$(file-code) ${title}`,
      command: 'mybatis-helper.jumpToMapper',
      arguments: [xmlPath]
    };

    return new vscode.CodeLens(range, command);
  }

  /**
   * 创建 SQL 语句的 CodeLens
   */
  private createSqlCodeLens(
    sqlId: string,
    line: number,
    column: number,
    xmlPath: string,
    hasJava: boolean
  ): vscode.CodeLens | null {
    const range = new vscode.Range(line, column, line, column);

    const title = hasJava
      ? vscode.l10n.t("codelens.xml.jumpToMethod", { methodName: sqlId })
      : vscode.l10n.t("codelens.xml.findMethod", { methodName: sqlId });

    const command: vscode.Command = {
      title: `$(arrow-right) ${title}`,
      command: 'mybatis-helper.jumpToMapper',
      arguments: [xmlPath, sqlId]
    };

    return new vscode.CodeLens(range, command);
  }

  resolveCodeLens?(codeLens: vscode.CodeLens): vscode.ProviderResult<vscode.CodeLens> {
    return codeLens;
  }
}
