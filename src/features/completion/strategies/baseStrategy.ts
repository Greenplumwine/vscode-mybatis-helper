/**
 * 补全策略抽象基类
 *
 * 设计模式：
 * - 模板方法模式 (Template Method Pattern): 定义策略执行的骨架，子类实现具体逻辑
 * - 策略模式 (Strategy Pattern): 作为 CompletionStrategy 接口的基础实现
 *
 * 提供通用的工具方法和默认实现，简化具体策略的开发。
 *
 * @module features/completion/strategies/baseStrategy
 */

import * as vscode from "vscode";
import { CompletionStrategy, CompletionContext } from "../types";

/**
 * 补全策略抽象基类
 *
 * 所有具体策略应继承此类，获得以下能力：
 * 1. 通用工具方法（属性检测、值提取等）
 * 2. 统一的 CompletionItem 创建方法
 * 3. 日志记录支持
 *
 * @example
 * ```typescript
 * export class MyStrategy extends BaseCompletionStrategy {
 *   readonly triggerCharacters = ['.'] as const;
 *   readonly priority = 80;
 *   readonly name = 'MyStrategy';
 *
 *   canComplete(context: CompletionContext): boolean {
 *     return this.isInAttribute(context, ['resultType']);
 *   }
 *
 *   async provideCompletionItems(context: CompletionContext) {
 *     return [
 *       this.createItem('User', { kind: vscode.CompletionItemKind.Class })
 *     ];
 *   }
 * }
 * ```
 */
export abstract class BaseCompletionStrategy implements CompletionStrategy {
  /**
   * 触发字符列表
   * 子类必须定义
   */
  abstract readonly triggerCharacters: readonly string[];

  /**
   * 优先级
   * 子类必须定义
   */
  abstract readonly priority: number;

  /**
   * 策略名称
   * 子类必须定义
   */
  abstract readonly name: string;

  /**
   * 判断当前上下文是否支持此策略
   *
   * 子类必须实现具体的判断逻辑
   *
   * @param context - 补全上下文
   * @returns 如果支持返回 true，否则返回 false
   */
  abstract canComplete(context: CompletionContext): boolean | Promise<boolean>;

  /**
   * 提供补全项
   *
   * 子类必须实现具体的补全逻辑
   *
   * @param context - 补全上下文
   * @returns 补全项列表
   */
  abstract provideCompletionItems(
    context: CompletionContext,
  ): Promise<vscode.CompletionItem[]>;

  /**
   * 判断是否在特定属性值中
   *
   * 用于检测光标是否在如 resultType="..." 这种属性值中
   *
   * @param context - 补全上下文
   * @param attributeNames - 要检测的属性名列表
   * @returns 如果光标在任一指定属性的值中，返回 true
   *
   * @example
   * ```typescript
   * // 检测是否在 resultType 或 parameterType 属性中
   * if (this.isInAttribute(context, ['resultType', 'parameterType'])) {
   *   // 提供类型补全
   * }
   * ```
   */
  protected isInAttribute(
    context: CompletionContext,
    attributeNames: readonly string[],
  ): boolean {
    // 构建正则：匹配任意属性名="... 或 属性名='...
    // 确保光标在引号内（行前缀以引号前的内容结尾）
    const regex = new RegExp(
      `\\s(${attributeNames.join("|")})=["'][^"']*$`,
      "i",
    );
    return regex.test(context.linePrefix);
  }

  /**
   * 提取当前输入的部分值
   *
   * 用于获取属性值中已输入的部分，用于过滤补全项
   *
   * @param context - 补全上下文
   * @returns 当前输入的部分值（小写，用于不区分大小写的比较）
   *
   * @example
   * ```typescript
   * // 如果行前缀是：resultType="Us
   * // 返回：us
   * const partial = this.extractPartialValue(context);
   * ```
   */
  protected extractPartialValue(context: CompletionContext): string {
    // 匹配 ="... 或 ='... 结尾的内容
    const match = context.linePrefix.match(/=["']([^"']*)$/);
    return match ? match[1].toLowerCase() : "";
  }

  /**
   * 创建 CompletionItem 的通用方法
   *
   * 提供统一的方式来创建补全项，确保一致的外观和行为
   *
   * @param label - 补全项标签（显示文本）
   * @param options - 可选配置
   * @returns 配置好的 CompletionItem
   *
   * @example
   * ```typescript
   * const item = this.createItem('User', {
   *   kind: vscode.CompletionItemKind.Class,
   *   detail: 'com.example.User',
   *   documentation: '用户实体类',
   *   insertText: 'com.example.User',
   *   sortText: '1'
   * });
   * ```
   */
  protected createItem(
    label: string,
    options: {
      /** 补全项类型 */
      kind?: vscode.CompletionItemKind;
      /** 详细信息（显示在右侧） */
      detail?: string;
      /** 文档说明（悬停显示） */
      documentation?: string | vscode.MarkdownString;
      /** 插入文本（与 label 不同时使用） */
      insertText?: string | vscode.SnippetString;
      /** 排序文本（控制显示顺序） */
      sortText?: string;
      /** 命令（选中后执行） */
      command?: vscode.Command;
    } = {},
  ): vscode.CompletionItem {
    const item = new vscode.CompletionItem(
      label,
      options.kind ?? vscode.CompletionItemKind.Text,
    );

    if (options.detail !== undefined) {
      item.detail = options.detail;
    }

    if (options.documentation !== undefined) {
      item.documentation = options.documentation;
    }

    if (options.insertText !== undefined) {
      item.insertText = options.insertText;
    }

    if (options.sortText !== undefined) {
      item.sortText = options.sortText;
    }

    if (options.command !== undefined) {
      item.command = options.command;
    }

    return item;
  }

  /**
   * 批量创建 CompletionItem
   *
   * 方便地将字符串列表转换为补全项列表
   *
   * @param labels - 标签列表
   * @param options - 应用到所有项的通用配置
   * @returns 补全项列表
   */
  protected createItems(
    labels: string[],
    options: {
      kind?: vscode.CompletionItemKind;
      getDetail?: (label: string) => string | undefined;
      getSortText?: (label: string, index: number) => string | undefined;
    } = {},
  ): vscode.CompletionItem[] {
    return labels.map((label, index) =>
      this.createItem(label, {
        kind: options.kind,
        detail: options.getDetail?.(label),
        sortText: options.getSortText?.(label, index),
      }),
    );
  }

  /**
   * 检查光标是否在 SQL 标签内
   *
   * 通过检测行前缀中是否有未闭合的 select/insert/update/delete 标签
   *
   * @param context - 补全上下文
   * @returns 如果在 SQL 标签内返回 true
   */
  protected isInSqlTag(context: CompletionContext): boolean {
    const sqlTags = ["select", "insert", "update", "delete", "sql"];
    const content = context.document.getText();
    const offset = context.document.offsetAt(context.position);

    // 获取光标前的内容
    const beforeCursor = content.substring(0, offset);

    // 检查是否有未闭合的 SQL 标签（简化检测）
    for (const tag of sqlTags) {
      // 匹配 <tag ...> 但不包括 </tag>
      const openTagRegex = new RegExp(`<${tag}[^>]*>`, "gi");
      const closeTagRegex = new RegExp(`</${tag}>`, "gi");

      const openCount = (beforeCursor.match(openTagRegex) || []).length;
      const closeCount = (beforeCursor.match(closeTagRegex) || []).length;

      if (openCount > closeCount) {
        return true;
      }
    }

    return false;
  }

  /**
   * 获取光标所在的方法名
   *
   * 通过 XML 解析信息定位当前方法
   *
   * @param context - 补全上下文
   * @returns 方法名，如果无法确定返回 undefined
   */
  protected getCurrentMethodName(
    context: CompletionContext,
  ): string | undefined {
    if (!context.xmlInfo) {
      return undefined;
    }

    const line = context.position.line;
    const method = context.xmlInfo.methods.find(
      (m) => line >= m.lineRange.start && line <= m.lineRange.end,
    );

    return method?.id;
  }

  /**
   * 创建 Markdown 文档
   *
   * 辅助方法，用于快速创建文档说明
   *
   * @param content - Markdown 内容
   * @returns MarkdownString 实例
   */
  protected createDocs(content: string): vscode.MarkdownString {
    return new vscode.MarkdownString(content);
  }

  /**
   * 创建代码块文档
   *
   * @param code - 代码内容
   * @param language - 语言标识
   * @returns 格式化的 MarkdownString
   */
  protected createCodeDocs(
    code: string,
    language: string = "java",
  ): vscode.MarkdownString {
    const docs = new vscode.MarkdownString();
    docs.appendCodeblock(code, language);
    return docs;
  }
}
