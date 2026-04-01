/**
 * 快速创建 Mapper XML 命令
 *
 * 设计模式：
 * - 命令模式 (Command Pattern): 封装创建 XML 文件的操作
 *
 * 功能：在 Java Mapper 接口上右键创建对应的 XML 文件
 *
 * @module commands/createMapperXml
 */

import * as vscode from "vscode";
import * as path from "path";
import * as fs from "fs/promises";
import { Logger } from "../utils/logger";
import { FastMappingEngine } from "../features/mapping/fastMappingEngine";

/**
 * Java 方法信息
 */
interface JavaMethod {
  name: string;
  returnType: string;
  parameters: Array<{ name: string; type: string }>;
}

/**
 * 快速创建 Mapper XML 命令
 */
export class CreateMapperXmlCommand {
  /** 日志记录器 */
  private logger = Logger.getInstance();

  /** 映射引擎 */
  private mappingEngine = FastMappingEngine.getInstance();

  /**
   * 执行命令
   *
   * @param javaUri - Java 文件的 URI（从右键菜单传递）
   */
  async execute(javaUri?: vscode.Uri): Promise<void> {
    try {
      // 确定目标 Java 文件
      let targetUri = javaUri;

      if (!targetUri) {
        // 如果没有提供 URI，使用当前活动编辑器
        const editor = vscode.window.activeTextEditor;
        if (!editor || !editor.document.fileName.endsWith(".java")) {
          vscode.window.showWarningMessage(
            vscode.l10n.t("createMapperXml.noJavaFile"),
          );
          return;
        }
        targetUri = editor.document.uri;
      }

      const javaPath = targetUri.fsPath;

      // 检查是否已经是 Mapper 接口
      if (!(await this.isMapperInterface(javaPath))) {
        const proceed = await vscode.window.showQuickPick(
          [vscode.l10n.t("quickPick.yes"), vscode.l10n.t("quickPick.no")],
          { placeHolder: vscode.l10n.t("createMapperXml.notMapper") },
        );

        if (proceed !== vscode.l10n.t("quickPick.yes")) {
          return;
        }
      }

      // 创建 XML
      await this.createMapperXml(javaPath);
    } catch (error) {
      this.logger.error("Create mapper XML failed:", error);
      vscode.window.showErrorMessage(
        vscode.l10n.t("createMapperXml.failed", {
          error: error instanceof Error ? error.message : "Unknown error",
        }),
      );
    }
  }

  /**
   * 检查是否是 Mapper 接口
   *
   * @param javaPath - Java 文件路径
   * @returns 是否是 Mapper 接口
   */
  private async isMapperInterface(javaPath: string): Promise<boolean> {
    try {
      const content = await fs.readFile(javaPath, "utf-8");

      // 检查 MyBatis 标记
      return (
        /@Mapper\b/.test(content) ||
        /import\s+org\.apache\.ibatis/.test(content) ||
        /import\s+org\.mybatis/.test(content) ||
        /interface\s+\w*Mapper/.test(content)
      );
    } catch {
      return false;
    }
  }

  /**
   * 创建 Mapper XML
   *
   * @param javaPath - Java 文件路径
   */
  private async createMapperXml(javaPath: string): Promise<void> {
    const className = path.basename(javaPath, ".java");

    // 获取包名
    const content = await fs.readFile(javaPath, "utf-8");
    const packageMatch = content.match(/package\s+([\w.]+)/);
    const packageName = packageMatch ? packageMatch[1] : "";
    const namespace = packageName ? `${packageName}.${className}` : className;

    // 解析方法
    const methods = this.parseJavaMethods(content);

    // 确定 XML 路径
    const xmlPath = await this.determineXmlPath(javaPath);

    // 检查文件是否已存在
    try {
      await fs.access(xmlPath);
      const overwrite = await vscode.window.showQuickPick(
        [
          vscode.l10n.t("quickPick.overwrite"),
          vscode.l10n.t("quickPick.cancel"),
        ],
        {
          placeHolder: vscode.l10n.t("createMapperXml.fileExists", {
            fileName: path.basename(xmlPath),
          }),
        },
      );

      if (overwrite !== vscode.l10n.t("quickPick.overwrite")) {
        return;
      }
    } catch {
      // 文件不存在，继续
    }

    // 生成 XML 内容
    const xmlContent = this.generateMapperXml(namespace, className, methods);

    // 确保目录存在
    await fs.mkdir(path.dirname(xmlPath), { recursive: true });

    // 写入文件
    await fs.writeFile(xmlPath, xmlContent, "utf-8");

    // 注册映射（通过触发全局刷新）
    this.mappingEngine.emit("mappingUpdated");

    // 打开文件
    const doc = await vscode.workspace.openTextDocument(xmlPath);
    const editor = await vscode.window.showTextDocument(doc);

    // 格式化
    await vscode.commands.executeCommand("editor.action.formatDocument");

    vscode.window.showInformationMessage(
      vscode.l10n.t("createMapperXml.created", {
        fileName: path.basename(xmlPath),
      }),
    );
  }

  /**
   * 确定 XML 文件路径
   *
   * @param javaPath - Java 文件路径
   * @returns XML 文件路径
   */
  private async determineXmlPath(javaPath: string): Promise<string> {
    // 策略 1：根据项目结构推断
    const className = path.basename(javaPath, ".java");
    const javaDir = path.dirname(javaPath);

    // 尝试 resources 目录
    const resourcesPath = javaDir
      .replace("/java/", "/resources/")
      .replace("\\java\\", "\\resources\\");

    const potentialPaths = [
      path.join(resourcesPath, "mapper", `${className}.xml`),
      path.join(resourcesPath, "mappers", `${className}.xml`),
      path.join(resourcesPath, "mapping", `${className}.xml`),
      path.join(resourcesPath, `${className}.xml`),
      path.join(javaDir, `${className}.xml`), // 与 Java 文件同目录
    ];

    // 检查是否有配置指定
    const config = vscode.workspace.getConfiguration("mybatis-helper");
    const customDir = config.get<string>("customXmlDirectory");
    if (customDir) {
      const workspaceFolder = vscode.workspace.getWorkspaceFolder(
        vscode.Uri.file(javaPath),
      );
      if (workspaceFolder) {
        potentialPaths.unshift(
          path.join(workspaceFolder.uri.fsPath, customDir, `${className}.xml`),
        );
      }
    }

    // 检查哪个目录已存在，优先使用
    for (const xmlPath of potentialPaths) {
      try {
        await fs.access(path.dirname(xmlPath));
        // 目录存在，使用这个路径
        return xmlPath;
      } catch {
        // 目录不存在，继续检查下一个
      }
    }

    // 默认使用第一个路径
    return potentialPaths[0];
  }

  /**
   * 解析 Java 方法
   *
   * @param content - Java 文件内容
   * @returns 方法列表
   */
  private parseJavaMethods(content: string): JavaMethod[] {
    const methods: JavaMethod[] = [];

    // 方法定义正则
    const methodPattern =
      /(\w+(?:<[^>]+>)?)\s+(\w+)\s*\(([^)]*)\)\s*(?:throws\s+[\w,\s]+)?\s*;/g;

    let match;
    while ((match = methodPattern.exec(content)) !== null) {
      const returnType = match[1];
      const methodName = match[2];
      const paramsStr = match[3];

      // 解析参数
      const parameters: Array<{ name: string; type: string }> = [];
      if (paramsStr.trim()) {
        const paramPairs = paramsStr.split(",");
        for (const pair of paramPairs) {
          const parts = pair.trim().split(/\s+/);
          if (parts.length >= 2) {
            // 处理注解（如 @Param("id") Long id）
            let typeIndex = parts.length - 2;
            let nameIndex = parts.length - 1;

            // 如果倒数第二个是注解，再往前找
            while (typeIndex >= 0 && parts[typeIndex].startsWith("@")) {
              typeIndex--;
              nameIndex--;
            }

            if (typeIndex >= 0) {
              parameters.push({
                type: parts[typeIndex],
                name: parts[nameIndex],
              });
            }
          }
        }
      }

      methods.push({ name: methodName, returnType, parameters });
    }

    return methods;
  }

  /**
   * 生成 Mapper XML
   *
   * @param namespace - 命名空间
   * @param className - 类名
   * @param methods - 方法列表
   * @returns XML 内容
   */
  private generateMapperXml(
    namespace: string,
    className: string,
    methods: JavaMethod[],
  ): string {
    const methodTags = methods
      .map((m) => this.generateMethodTag(m))
      .join("\n\n");

    return `<?xml version="1.0" encoding="UTF-8"?>
<!DOCTYPE mapper PUBLIC "-//mybatis.org//DTD Mapper 3.0//EN" 
    "http://mybatis.org/dtd/mybatis-3-mapper.dtd">
<!--
    ${className} Mapper
    
    Auto-generated by MyBatis Helper
    Generation Time: ${new Date().toISOString()}
-->
<mapper namespace="${namespace}">

${methodTags}

</mapper>
`;
  }

  /**
   * 生成单个方法的 SQL 标签
   *
   * @param method - 方法信息
   * @returns SQL 标签字符串
   */
  private generateMethodTag(method: JavaMethod): string {
    const methodName = method.name.toLowerCase();

    // 推断 SQL 类型
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

    // 参数类型
    const paramType =
      method.parameters.length > 0
        ? ` parameterType="${this.extractSimpleName(method.parameters[0].type)}"`
        : "";

    // 结果类型
    let resultType = "";
    if (
      tagType === "select" &&
      !method.returnType.toLowerCase().includes("void")
    ) {
      const simpleReturn = this.extractSimpleName(method.returnType);
      if (
        !simpleReturn.toLowerCase().includes("list") &&
        !simpleReturn.toLowerCase().includes("collection") &&
        !simpleReturn.toLowerCase().includes("page")
      ) {
        resultType = ` resultType="${simpleReturn}"`;
      }
    }

    // 生成注释
    const lines: string[] = [];
    lines.push(`  <!--`);
    lines.push(`    ${method.name}`);

    // 参数说明
    if (method.parameters.length > 0) {
      lines.push(`    `);
      lines.push(`    Parameters:`);
      for (const param of method.parameters) {
        lines.push(
          `      - ${param.name}: ${this.extractSimpleName(param.type)}`,
        );
      }
    }

    lines.push(`  -->`);

    // SQL 标签
    lines.push(`  <${tagType} id="${method.name}"${paramType}${resultType}>`);
    lines.push(`    <!-- TODO: Implement SQL for ${method.name} -->`);
    lines.push(`    `);

    // 参数占位符示例
    if (method.parameters.length > 0) {
      lines.push(`    <!-- Example with parameters:`);
      for (const param of method.parameters) {
        lines.push(`       #{${param.name}}`);
      }
      lines.push(`    -->`);
      lines.push(`    `);
    }

    // 默认 SQL
    switch (tagType) {
      case "select":
        lines.push(`    SELECT * FROM table WHERE 1=1`);
        break;
      case "insert":
        lines.push(`    INSERT INTO table (column1, column2)`);
        lines.push(`    VALUES (#{param1}, #{param2})`);
        break;
      case "update":
        lines.push(`    UPDATE table`);
        lines.push(`    SET column = #{value}`);
        lines.push(`    WHERE id = #{id}`);
        break;
      case "delete":
        lines.push(`    DELETE FROM table WHERE id = #{id}`);
        break;
    }

    lines.push(`  </${tagType}>`);

    return lines.join("\n");
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
}

/**
 * 命令实例
 */
export const createMapperXmlCommand = new CreateMapperXmlCommand();
