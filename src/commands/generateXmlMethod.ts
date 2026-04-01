/**
 * 生成 XML 方法命令
 *
 * 设计模式：
 * - 命令模式 (Command Pattern): 封装生成 XML 方法的操作
 *
 * 功能：为 Java Mapper 接口中的方法生成对应的 XML SQL 方法
 *
 * @module commands/generateXmlMethod
 */

import * as vscode from "vscode";
import * as path from "path";
import * as fs from "fs/promises";
import { Logger } from "../utils/logger";
import { FastMappingEngine } from "../features/mapping/fastMappingEngine";
import { extractTableNameFromMethod } from "../utils/stringUtils";

/**
 * 方法信息
 */
interface MethodInfo {
  name: string;
  returnType: string;
  parameters: Array<{ name: string; type: string }>;
}

/**
 * 生成 XML 方法命令
 */
export class GenerateXmlMethodCommand {
  /** 日志记录器 */
  private logger = Logger.getInstance();

  /** 映射引擎 */
  private mappingEngine = FastMappingEngine.getInstance();

  /**
   * 执行命令
   *
   * @param args - 命令参数
   */
  async execute(args?: {
    javaPath?: string;
    methodName?: string;
  }): Promise<void> {
    try {
      const editor = vscode.window.activeTextEditor;
      if (!editor) {
        vscode.window.showWarningMessage(
          vscode.l10n.t("generateXmlMethod.noActiveEditor"),
        );
        return;
      }

      // 获取参数
      let javaPath = args?.javaPath;
      let methodName: string | undefined = args?.methodName ?? undefined;

      // 如果通过快捷键触发，从当前选择/光标推断
      if (!javaPath) {
        javaPath = editor.document.fileName;

        // 如果有选中，使用选中的方法名
        if (editor.selection && !editor.selection.isEmpty) {
          methodName = editor.document.getText(editor.selection);
        } else {
          // 从光标位置推断方法名
          const line = editor.selection.active.line;
          const inferredName = await this.inferMethodNameAtLine(
            editor.document,
            line,
          );
          methodName = inferredName ?? undefined;
        }
      }

      if (!javaPath || !methodName) {
        vscode.window.showWarningMessage(
          vscode.l10n.t("generateXmlMethod.noMethodSelected"),
        );
        return;
      }

      // 执行生成
      await this.generateMethod(javaPath, methodName);
    } catch (error) {
      this.logger.error("Generate XML method failed:", error);
      vscode.window.showErrorMessage(
        vscode.l10n.t("generateXmlMethod.failed", {
          error: error instanceof Error ? error.message : "Unknown error",
        }),
      );
    }
  }

  /**
   * 从行号推断方法名
   *
   * @param document - 文本文档
   * @param line - 行号
   * @returns 方法名，如果无法推断返回 null
   */
  private async inferMethodNameAtLine(
    document: vscode.TextDocument,
    line: number,
  ): Promise<string | null> {
    const text = document.lineAt(line).text;

    // 匹配方法定义
    const methodMatch = text.match(/(?:\w+\s+)+(\w+)\s*\(/);
    if (methodMatch) {
      return methodMatch[1];
    }

    // 向上查找方法定义
    for (let i = line - 1; i >= 0 && i >= line - 10; i--) {
      const lineText = document.lineAt(i).text;
      const match = lineText.match(/(?:\w+\s+)+(\w+)\s*\(/);
      if (match) {
        return match[1];
      }
    }

    return null;
  }

  /**
   * 生成方法
   *
   * @param javaPath - Java 文件路径
   * @param methodName - 方法名
   */
  private async generateMethod(
    javaPath: string,
    methodName: string,
  ): Promise<void> {
    // 1. 获取对应的 XML 文件路径
    const mapping = this.mappingEngine.getByJavaPath(javaPath);
    const xmlPath = mapping?.xmlPath;

    if (!xmlPath) {
      // 没有对应的 XML 文件，询问是否创建
      const createNew = await vscode.window.showQuickPick(
        [vscode.l10n.t("quickPick.yes"), vscode.l10n.t("quickPick.no")],
        { placeHolder: vscode.l10n.t("generateXmlMethod.noMapperFound") },
      );

      if (createNew === vscode.l10n.t("quickPick.yes")) {
        await this.createNewMapperXml(javaPath, methodName);
      }
      return;
    }

    // 2. 检查方法是否已存在
    const exists = await this.methodExistsInXml(xmlPath, methodName);
    if (exists) {
      vscode.window.showInformationMessage(
        vscode.l10n.t("generateXmlMethod.methodExists", { methodName }),
      );
      return;
    }

    // 3. 解析 Java 方法信息
    const methodInfo = await this.parseJavaMethod(javaPath, methodName);

    // 4. 生成 SQL 标签
    const sqlTag = this.generateSqlTag(methodInfo);

    // 5. 插入到 XML
    await this.insertSqlTag(xmlPath, sqlTag, methodName);

    // 6. 打开 XML 文件
    const doc = await vscode.workspace.openTextDocument(xmlPath);
    const editor = await vscode.window.showTextDocument(doc);

    // 7. 立即更新映射引擎，添加新方法映射
    this.mappingEngine.addMethodMapping(javaPath, methodName);

    // 8. 定位到刚生成的 SQL 标签
    const methodPosition = await this.findMethodPosition(doc, methodName);
    if (methodPosition) {
      editor.selection = new vscode.Selection(methodPosition, methodPosition);
      editor.revealRange(
        new vscode.Range(methodPosition, methodPosition),
        vscode.TextEditorRevealType.InCenter,
      );
    }

    vscode.window.showInformationMessage(
      vscode.l10n.t("generateXmlMethod.generated", { methodName }),
    );
  }

  /**
   * 检查方法是否已存在于 XML 中
   *
   * @param xmlPath - XML 文件路径
   * @param methodName - 方法名
   * @returns 是否存在
   */
  private async methodExistsInXml(
    xmlPath: string,
    methodName: string,
  ): Promise<boolean> {
    try {
      const content = await fs.readFile(xmlPath, "utf-8");
      const pattern = new RegExp(
        `<(?:select|insert|update|delete)\\s+[^>]*id=["']${methodName}["']`,
        "i",
      );
      return pattern.test(content);
    } catch {
      return false;
    }
  }

  /**
   * 转义正则表达式特殊字符
   *
   * @param str - 需要转义的字符串
   * @returns 转义后的字符串
   */
  private escapeRegExp(str: string): string {
    return str.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
  }

  /**
   * 检查是否应该使用 resultMap
   */
  private shouldUseResultMap(returnType: string): boolean {
    const primitiveTypes = [
      "int",
      "long",
      "boolean",
      "string",
      "integer",
      "void",
      "double",
      "float",
      "short",
      "byte",
    ];
    const simpleName = returnType.toLowerCase().replace(/java\.lang\./g, "");
    if (primitiveTypes.includes(simpleName)) {
      return false;
    }

    const wrapperTypes = [
      "integer",
      "long",
      "boolean",
      "double",
      "float",
      "short",
      "byte",
      "string",
    ];
    if (wrapperTypes.includes(simpleName)) {
      return false;
    }

    if (returnType.includes("<")) {
      const genericMatch = returnType.match(/<(.*?)>/);
      if (genericMatch) {
        const genericType = genericMatch[1].trim();
        const genericSimpleName = genericType
          .toLowerCase()
          .replace(/java\.lang\./g, "");
        if (
          primitiveTypes.includes(genericSimpleName) ||
          wrapperTypes.includes(genericSimpleName)
        ) {
          return false;
        }
        return true;
      }
    }
    return true;
  }

  /**
   * 生成 resultMap 引用
   */
  private generateResultMapRef(returnType: string): string {
    if (!this.shouldUseResultMap(returnType)) {
      return ` resultType="${this.extractSimpleName(returnType)}"`;
    }
    const simpleTypeName = this.extractSimpleName(returnType);
    return ` resultMap="${simpleTypeName}ResultMap"`;
  }

  /**
   * 检查 resultMap 是否存在
   */
  private async resultMapExists(
    xmlPath: string,
    resultMapId: string,
  ): Promise<boolean> {
    try {
      const content = await fs.readFile(xmlPath, "utf-8");
      const pattern = new RegExp(
        `<resultMap\\s+[^>]*id=["']${resultMapId}["']`,
        "i",
      );
      return pattern.test(content);
    } catch {
      return false;
    }
  }

  /**
   * 生成 resultMap 提示
   */
  private async generateResultMapHint(
    xmlPath: string,
    returnType: string,
  ): Promise<string | null> {
    if (!this.shouldUseResultMap(returnType)) {
      return null;
    }
    const simpleTypeName = this.extractSimpleName(returnType);
    const resultMapId = `${simpleTypeName}ResultMap`;
    const exists = await this.resultMapExists(xmlPath, resultMapId);
    if (exists) {
      return null;
    }
    return `<!-- TODO: Add resultMap with id="${resultMapId}" for ${simpleTypeName} -->`;
  }

  /**
   * 解析 Java 方法
   *
   * @param javaPath - Java 文件路径
   * @param methodName - 方法名
   * @returns 方法信息
   */
  private async parseJavaMethod(
    javaPath: string,
    methodName: string,
  ): Promise<MethodInfo> {
    const content = await fs.readFile(javaPath, "utf-8");

    // 转义方法名中的特殊字符，防止正则错误
    const escapedMethodName = this.escapeRegExp(methodName);

    // 简单正则解析（实际项目中可能需要更精确的解析）
    const methodPattern = new RegExp(
      `(\\w+(?:<[^>]+>)?)\\s+${escapedMethodName}\\s*\\(([^)]*)\\)`,
      "i",
    );

    const match = content.match(methodPattern);
    if (!match) {
      return { name: methodName, returnType: "void", parameters: [] };
    }

    const returnType = match[1];
    const paramsStr = match[2];

    // 解析参数
    const parameters: Array<{ name: string; type: string }> = [];
    if (paramsStr.trim()) {
      const paramPairs = paramsStr.split(",");
      for (const pair of paramPairs) {
        const parts = pair.trim().split(/\s+/);
        if (parts.length >= 2) {
          parameters.push({
            type: parts[parts.length - 2],
            name: parts[parts.length - 1],
          });
        }
      }
    }

    return { name: methodName, returnType, parameters };
  }

  /**
   * 生成 SQL 标签
   */
  private generateSqlTag(method: MethodInfo, xmlPath?: string): string {
    // 根据方法名推断 SQL 类型
    const methodName = method.name.toLowerCase();
    let tagType: "select" | "insert" | "update" | "delete" = "select";

    if (
      methodName.startsWith("insert") ||
      methodName.startsWith("add") ||
      methodName.startsWith("create")
    ) {
      tagType = "insert";
    } else if (
      methodName.startsWith("update") ||
      methodName.startsWith("modify") ||
      methodName.startsWith("set")
    ) {
      tagType = "update";
    } else if (
      methodName.startsWith("delete") ||
      methodName.startsWith("remove") ||
      methodName.startsWith("del")
    ) {
      tagType = "delete";
    }

    // 构建参数类型
    const paramType =
      method.parameters.length > 0 ? method.parameters[0].type : "";
    const paramTypeAttr = paramType
      ? ` parameterType="${this.extractSimpleName(paramType)}"`
      : "";

    // 构建结果类型（如果是 select）
    let resultAttr = "";
    if (tagType === "select" && method.returnType !== "void") {
      resultAttr = this.generateResultMapRef(method.returnType);
    }

    // 提取表名
    const tableName = extractTableNameFromMethod(method.name);

    // 生成注释
    const comment = `  <!-- ${method.name} -->\n`;

    // 生成 SQL 标签内容
    let sqlContent = "";
    if (tagType === "select") {
      sqlContent = `    SELECT * FROM ${tableName}\n    WHERE`;
    } else if (tagType === "insert") {
      sqlContent = `    INSERT INTO ${tableName} (\n\n    ) VALUES (\n\n    )`;
    } else if (tagType === "update") {
      sqlContent = `    UPDATE ${tableName}\n    <set>\n\n    </set>\n    WHERE`;
    } else if (tagType === "delete") {
      sqlContent = `    DELETE FROM ${tableName}\n    WHERE`;
    }

    const sqlTag = `${comment}  <${tagType} id="${method.name}"${paramTypeAttr}${resultAttr}>\n${sqlContent}\n  </${tagType}>`;

    return sqlTag;
  }

  /**
   * 提取简单类名
   *
   * @param fullName - 全限定类名
   * @returns 简单类名
   */
  private extractSimpleName(fullName: string): string {
    // 处理泛型
    const withoutGeneric = fullName.replace(/<[^>]+>/g, "");
    const lastDot = withoutGeneric.lastIndexOf(".");
    return lastDot >= 0
      ? withoutGeneric.substring(lastDot + 1)
      : withoutGeneric;
  }

  /**
   * 查找方法在文档中的位置
   *
   * @param document - 文本文档
   * @param methodName - 方法名
   * @returns 方法所在位置，如果未找到返回 null
   */
  private async findMethodPosition(
    document: vscode.TextDocument,
    methodName: string,
  ): Promise<vscode.Position | null> {
    const content = document.getText();
    const pattern = new RegExp(
      `<(select|insert|update|delete)\\s+[^>]*id=["']${methodName}["']`,
      "i",
    );
    const match = content.match(pattern);
    if (match && match.index !== undefined) {
      const line = document.positionAt(match.index).line;
      return new vscode.Position(line, 0);
    }
    return null;
  }

  /**
   * 插入 SQL 标签到 XML
   *
   * @param xmlPath - XML 文件路径
   * @param sqlTag - SQL 标签
   * @throws 如果文件无效或插入失败
   */
  private async insertSqlTag(
    xmlPath: string,
    sqlTag: string,
    _methodName?: string,
  ): Promise<void> {
    // 输入验证
    if (!xmlPath || !xmlPath.endsWith(".xml")) {
      throw new Error(`Invalid XML file path: ${xmlPath}`);
    }
    if (!sqlTag || sqlTag.trim().length === 0) {
      throw new Error("SQL tag content cannot be empty");
    }

    // 检查文件是否存在
    try {
      await fs.access(xmlPath);
    } catch {
      throw new Error(`XML file not found: ${xmlPath}`);
    }

    const content = await fs.readFile(xmlPath, "utf-8");

    // 验证是有效的 Mapper XML
    if (!content.includes("<mapper") || !content.includes("</mapper>")) {
      throw new Error(`Invalid mapper XML file: ${xmlPath}`);
    }

    // 在 </mapper> 前插入
    const insertIndex = content.lastIndexOf("</mapper>");

    if (insertIndex >= 0) {
      const newContent =
        content.substring(0, insertIndex) +
        "\n" +
        sqlTag +
        "\n\n" +
        content.substring(insertIndex);

      await fs.writeFile(xmlPath, newContent, "utf-8");
      this.logger.info(`Inserted SQL tag into ${xmlPath}`);
    } else {
      throw new Error(`Could not find </mapper> tag in ${xmlPath}`);
    }
  }

  /**
   * 创建新的 Mapper XML 文件
   *
   * @param javaPath - Java 文件路径
   * @param methodName - 方法名
   */
  private async createNewMapperXml(
    javaPath: string,
    methodName: string,
  ): Promise<void> {
    // 获取类名
    const className = path.basename(javaPath, ".java");

    // 推断包名
    const content = await fs.readFile(javaPath, "utf-8");
    const packageMatch = content.match(/package\s+([\w.]+)/);
    const packageName = packageMatch ? packageMatch[1] : "";
    const namespace = packageName ? `${packageName}.${className}` : className;

    // 推断 XML 路径（默认在 resources/mapper 下）
    const javaDir = path.dirname(javaPath);
    const xmlDir = javaDir
      .replace("/java/", "/resources/")
      .replace("\\java\\", "\\resources\\");

    const xmlPath = path.join(xmlDir, `${className}.xml`);

    // 确保目录存在
    await fs.mkdir(path.dirname(xmlPath), { recursive: true });

    // 生成 XML 模板
    const xmlTemplate = this.generateMapperXmlTemplate(namespace, methodName);

    await fs.writeFile(xmlPath, xmlTemplate, "utf-8");

    // 注册映射（通过触发全局刷新）
    this.mappingEngine.emit("mappingUpdated");

    // 打开文件
    const doc = await vscode.workspace.openTextDocument(xmlPath);
    await vscode.window.showTextDocument(doc);

    vscode.window.showInformationMessage(
      vscode.l10n.t("generateXmlMethod.created", { xmlPath }),
    );
  }

  /**
   * 生成 Mapper XML 模板
   *
   * @param namespace - 命名空间
   * @param firstMethod - 第一个方法名
   * @returns XML 内容
   */
  private generateMapperXmlTemplate(
    namespace: string,
    firstMethod: string,
  ): string {
    return `<?xml version="1.0" encoding="UTF-8"?>
<!DOCTYPE mapper PUBLIC "-//mybatis.org//DTD Mapper 3.0//EN" 
    "http://mybatis.org/dtd/mybatis-3-mapper.dtd">
<mapper namespace="${namespace}">

  <!-- ${firstMethod} -->
  <select id="${firstMethod}" resultType="java.util.HashMap">
    <!-- TODO: Implement SQL -->
    SELECT * FROM table WHERE id = #{id}
  </select>

</mapper>
`;
  }
}

/**
 * 命令实例
 */
export const generateXmlMethodCommand = new GenerateXmlMethodCommand();
