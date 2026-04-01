/**
 * TypeHandler 补全策略
 *
 * 设计模式：
 * - 策略模式 (Strategy Pattern): 实现 CompletionStrategy 接口
 * - 模板方法模式 (Template Method Pattern): 继承 BaseCompletionStrategy
 *
 * 功能：在 typeHandler=" 属性中提供 MyBatis 内置 TypeHandler 补全
 *
 * @module features/completion/strategies/typeHandlerStrategy
 */

import * as vscode from "vscode";
import { BaseCompletionStrategy } from "./baseStrategy";
import { CompletionContext } from "../types";

/**
 * TypeHandler 信息
 */
interface TypeHandlerInfo {
  /** 显示名称 */
  readonly name: string;
  /** 全限定类名 */
  readonly fqcn: string;
  /** 对应 Java 类型 */
  readonly javaType: string;
  /** 对应 JDBC 类型 */
  readonly jdbcType: string;
  /** 说明文档 */
  readonly description: string;
}

/**
 * TypeHandler 补全策略
 *
 * 触发条件：
 * - 在 typeHandler=" 属性值中输入
 *
 * 提供内容：
 * - MyBatis 内置的 TypeHandler 列表
 * - 显示对应的 Java 类型和 JDBC 类型
 *
 * @example
 * ```xml
 * <result column="status" property="status"
 *         typeHandler="EnumOrdinalTypeHandler"/>
 * ```
 */
export class TypeHandlerStrategy extends BaseCompletionStrategy {
  /**
   * 触发字符：双引号和单引号
   */
  readonly triggerCharacters = ['"', "'"] as const;

  /**
   * 优先级：100（最高，与 TypeStrategy 相同）
   */
  readonly priority = 100;

  /** 策略名称 */
  readonly name = "TypeHandler";

  /**
   * MyBatis 内置 TypeHandler 列表
   */
  private static readonly HANDLERS: readonly TypeHandlerInfo[] = [
    // 基本类型
    {
      name: "String",
      fqcn: "org.apache.ibatis.type.StringTypeHandler",
      javaType: "java.lang.String",
      jdbcType: "VARCHAR/CHAR",
      description: "String type handler",
    },
    {
      name: "Integer",
      fqcn: "org.apache.ibatis.type.IntegerTypeHandler",
      javaType: "java.lang.Integer",
      jdbcType: "INTEGER",
      description: "Integer type handler",
    },
    {
      name: "Long",
      fqcn: "org.apache.ibatis.type.LongTypeHandler",
      javaType: "java.lang.Long",
      jdbcType: "BIGINT",
      description: "Long type handler",
    },
    {
      name: "Boolean",
      fqcn: "org.apache.ibatis.type.BooleanTypeHandler",
      javaType: "java.lang.Boolean",
      jdbcType: "BOOLEAN",
      description: "Boolean type handler",
    },
    {
      name: "Double",
      fqcn: "org.apache.ibatis.type.DoubleTypeHandler",
      javaType: "java.lang.Double",
      jdbcType: "DOUBLE",
      description: "Double type handler",
    },
    {
      name: "Float",
      fqcn: "org.apache.ibatis.type.FloatTypeHandler",
      javaType: "java.lang.Float",
      jdbcType: "FLOAT",
      description: "Float type handler",
    },
    {
      name: "Short",
      fqcn: "org.apache.ibatis.type.ShortTypeHandler",
      javaType: "java.lang.Short",
      jdbcType: "SMALLINT",
      description: "Short type handler",
    },
    {
      name: "Byte",
      fqcn: "org.apache.ibatis.type.ByteTypeHandler",
      javaType: "java.lang.Byte",
      jdbcType: "TINYINT",
      description: "Byte type handler",
    },
    // 日期时间
    {
      name: "Date",
      fqcn: "org.apache.ibatis.type.DateTypeHandler",
      javaType: "java.util.Date",
      jdbcType: "TIMESTAMP",
      description: "java.util.Date type handler",
    },
    {
      name: "SqlDate",
      fqcn: "org.apache.ibatis.type.SqlDateTypeHandler",
      javaType: "java.sql.Date",
      jdbcType: "DATE",
      description: "java.sql.Date type handler",
    },
    {
      name: "Time",
      fqcn: "org.apache.ibatis.type.SqlTimeTypeHandler",
      javaType: "java.sql.Time",
      jdbcType: "TIME",
      description: "java.sql.Time type handler",
    },
    {
      name: "Timestamp",
      fqcn: "org.apache.ibatis.type.SqlTimestampTypeHandler",
      javaType: "java.sql.Timestamp",
      jdbcType: "TIMESTAMP",
      description: "java.sql.Timestamp type handler",
    },
    {
      name: "LocalDate",
      fqcn: "org.apache.ibatis.type.LocalDateTypeHandler",
      javaType: "java.time.LocalDate",
      jdbcType: "DATE",
      description: "Java 8 LocalDate type handler",
    },
    {
      name: "LocalTime",
      fqcn: "org.apache.ibatis.type.LocalTimeTypeHandler",
      javaType: "java.time.LocalTime",
      jdbcType: "TIME",
      description: "Java 8 LocalTime type handler",
    },
    {
      name: "LocalDateTime",
      fqcn: "org.apache.ibatis.type.LocalDateTimeTypeHandler",
      javaType: "java.time.LocalDateTime",
      jdbcType: "TIMESTAMP",
      description: "Java 8 LocalDateTime type handler",
    },
    {
      name: "Instant",
      fqcn: "org.apache.ibatis.type.InstantTypeHandler",
      javaType: "java.time.Instant",
      jdbcType: "TIMESTAMP",
      description: "Java 8 Instant type handler",
    },
    // 大对象
    {
      name: "BigDecimal",
      fqcn: "org.apache.ibatis.type.BigDecimalTypeHandler",
      javaType: "java.math.BigDecimal",
      jdbcType: "DECIMAL/NUMERIC",
      description: "BigDecimal type handler for precise decimal calculations",
    },
    {
      name: "BigInteger",
      fqcn: "org.apache.ibatis.type.BigIntegerTypeHandler",
      javaType: "java.math.BigInteger",
      jdbcType: "BIGINT",
      description: "BigInteger type handler",
    },
    {
      name: "Blob",
      fqcn: "org.apache.ibatis.type.BlobTypeHandler",
      javaType: "java.sql.Blob",
      jdbcType: "BLOB",
      description: "BLOB type handler",
    },
    {
      name: "Clob",
      fqcn: "org.apache.ibatis.type.ClobTypeHandler",
      javaType: "java.sql.Clob",
      jdbcType: "CLOB",
      description: "CLOB type handler",
    },
    {
      name: "ByteArray",
      fqcn: "org.apache.ibatis.type.ByteArrayTypeHandler",
      javaType: "byte[]",
      jdbcType: "BLOB/VARBINARY",
      description: "Byte array type handler",
    },
    // 枚举
    {
      name: "Enum",
      fqcn: "org.apache.ibatis.type.EnumTypeHandler",
      javaType: "Enum<?>",
      jdbcType: "VARCHAR",
      description: "Enum type handler (stores enum name as string)",
    },
    {
      name: "EnumOrdinal",
      fqcn: "org.apache.ibatis.type.EnumOrdinalTypeHandler",
      javaType: "Enum<?>",
      jdbcType: "INTEGER",
      description: "Enum ordinal type handler (stores enum ordinal as integer)",
    },
    // 数组和集合
    {
      name: "Array",
      fqcn: "org.apache.ibatis.type.ArrayTypeHandler",
      javaType: "Object[]",
      jdbcType: "ARRAY",
      description: "SQL Array type handler",
    },
    // JDBC 类型
    {
      name: "Object",
      fqcn: "org.apache.ibatis.type.ObjectTypeHandler",
      javaType: "java.lang.Object",
      jdbcType: "OTHER",
      description: "Generic object type handler",
    },
    {
      name: "Any",
      fqcn: "org.apache.ibatis.type.AnyTypeHandler",
      javaType: "Object",
      jdbcType: "ANY",
      description: "Any type handler for unknown types",
    },
  ] as const;

  /**
   * 判断是否可以提供补全
   *
   * 条件：光标在 typeHandler=" 属性值内
   *
   * @param context - 补全上下文
   * @returns 是否可以补全
   */
  canComplete(context: CompletionContext): boolean {
    // 只匹配 typeHandler 属性
    const pattern = /\stypeHandler=["'][^"']*$/i;
    return pattern.test(context.linePrefix);
  }

  /**
   * 提供补全项
   *
   * @param context - 补全上下文
   * @returns TypeHandler 补全项列表
   */
  async provideCompletionItems(
    context: CompletionContext,
  ): Promise<vscode.CompletionItem[]> {
    const partial = this.extractPartialValue(context);
    const lowerPartial = partial.toLowerCase();

    // 过滤 TypeHandler
    const filtered = TypeHandlerStrategy.HANDLERS.filter(
      (handler) =>
        handler.name.toLowerCase().includes(lowerPartial) ||
        handler.fqcn.toLowerCase().includes(lowerPartial) ||
        handler.javaType.toLowerCase().includes(lowerPartial),
    );

    // 创建补全项
    return filtered.map((handler, index) =>
      this.createHandlerItem(handler, index),
    );
  }

  /**
   * 创建 TypeHandler 补全项
   *
   * @param handler - TypeHandler 信息
   * @param index - 索引（用于排序）
   * @returns CompletionItem
   */
  private createHandlerItem(
    handler: TypeHandlerInfo,
    index: number,
  ): vscode.CompletionItem {
    // 构建文档
    const docs = this.buildHandlerDocumentation(handler);

    return this.createItem(handler.name, {
      kind: vscode.CompletionItemKind.Class,
      detail: handler.fqcn,
      documentation: docs,
      insertText: handler.fqcn,
      sortText: index.toString().padStart(3, "0"),
    });
  }

  /**
   * 构建 TypeHandler 文档
   *
   * @param handler - TypeHandler 信息
   * @returns Markdown 文档
   */
  private buildHandlerDocumentation(
    handler: TypeHandlerInfo,
  ): vscode.MarkdownString {
    const docs = new vscode.MarkdownString();

    // 描述
    docs.appendMarkdown(`**${handler.description}**\n\n`);

    // 代码块显示全限定名
    docs.appendCodeblock(handler.fqcn, "java");

    // 类型映射表
    docs.appendMarkdown(`\n\n| Type | Value |\n|------|-------|\n`);
    docs.appendMarkdown(`| Java Type | \`${handler.javaType}\` |\n`);
    docs.appendMarkdown(`| JDBC Type | \`${handler.jdbcType}\` |\n`);

    // 使用示例
    docs.appendMarkdown(`\n\n**Usage Example:**\n`);
    docs.appendCodeblock(
      `<result column="status" property="status" typeHandler="${handler.fqcn}"/>`,
      "xml",
    );

    return docs;
  }
}
