/**
 * Foreach 变量补全策略
 * 
 * 设计模式：
 * - 策略模式 (Strategy Pattern): 实现 CompletionStrategy 接口
 * - 模板方法模式 (Template Method Pattern): 继承 BaseCompletionStrategy
 * 
 * 功能：当光标在 <foreach> 标签内时，输入 #{ 优先提示 item 和 index 变量
 * 
 * @module features/completion/strategies/foreachVariableStrategy
 */

import * as vscode from 'vscode';
import { BaseCompletionStrategy } from './baseStrategy';
import { CompletionContext, ForeachContext } from '../types';

/**
 * Foreach 变量补全策略
 * 
 * 触发条件：
 * - 输入 `#{`
 * - 光标在 <foreach> 标签内（由 context.foreachContext 标识）
 * 
 * 提供内容：
 * - item 变量（foreach 的 item 属性值）
 * - index 变量（如果定义了 index 属性）
 * 
 * 优先级高于 PlaceholderStrategy，确保在 foreach 内优先提示 item/index
 * 
 * @example
 * ```xml
 * <foreach collection="userList" item="user" index="idx">
 *   <!-- 输入 #{ 后提供的补全 -->
 *   #{user}  <!-- item 变量，优先 -->
 *   #{idx}   <!-- index 变量 -->
 * </foreach>
 * ```
 */
export class ForeachVariableStrategy extends BaseCompletionStrategy {
  /** 
   * 触发字符：#、$、{
   */
  readonly triggerCharacters = ['#', '$', '{'] as const;
  
  /**
   * 优先级：90
   * 
   * 高于 PlaceholderStrategy (70)，确保在 foreach 内优先匹配
   */
  readonly priority = 90;
  
  /** 策略名称 */
  readonly name = 'ForeachVariable';

  /**
   * 判断是否可以提供补全
   * 
   * 条件：
   * 1. 在 foreach 上下文内（context.foreachContext 不为空）
   * 2. 正在输入 #{
   * 
   * @param context - 补全上下文
   * @returns 是否可以补全
   */
  canComplete(context: CompletionContext): boolean {
    // 必须有 foreach 上下文
    if (!context.foreachContext) {
      return false;
    }
    
    // 检查是否是 #{
    const isPlaceholder = /#\{$/.test(context.linePrefix);
    
    return isPlaceholder;
  }

  /**
   * 提供补全项
   * 
   * @param context - 补全上下文
   * @returns item 和 index 变量补全项
   */
  async provideCompletionItems(
    context: CompletionContext
  ): Promise<vscode.CompletionItem[]> {
    const { foreachContext } = context;
    
    if (!foreachContext) {
      return [];
    }
    
    const items: vscode.CompletionItem[] = [];
    
    // 添加 item 变量（最高优先级）
    items.push(this.createItemVariable(foreachContext));
    
    // 添加 index 变量（如果定义了）
    if (foreachContext.index) {
      items.push(this.createIndexVariable(foreachContext));
    }
    
    // 可选：添加 collection 引用（用于嵌套 foreach）
    items.push(this.createCollectionVariable(foreachContext));
    
    return items;
  }

  /**
   * 创建 item 变量补全项
   * 
   * @param context - Foreach 上下文
   * @returns item 变量的 CompletionItem
   */
  private createItemVariable(context: ForeachContext): vscode.CompletionItem {
    const label = context.item;
    
    // 构建文档说明
    const docs = new vscode.MarkdownString();
    docs.appendMarkdown(`**foreach item variable**\n\n`);
    docs.appendMarkdown(`Collection: \`${context.collection}\`\n\n`);
    docs.appendMarkdown(`This variable represents each element in the collection.`);
    
    return this.createItem(label, {
      kind: vscode.CompletionItemKind.Variable,
      detail: `foreach item (${context.collection} → ${context.item})`,
      documentation: docs,
      insertText: `{${context.item}}`,
      sortText: '0' // 确保排在最前面
    });
  }

  /**
   * 创建 index 变量补全项
   * 
   * @param context - Foreach 上下文
   * @returns index 变量的 CompletionItem
   */
  private createIndexVariable(context: ForeachContext): vscode.CompletionItem {
    const label = context.index!;
    
    const docs = new vscode.MarkdownString();
    docs.appendMarkdown(`**foreach index variable**\n\n`);
    docs.appendMarkdown(`This variable represents the index of the current element.`);
    
    return this.createItem(label, {
      kind: vscode.CompletionItemKind.Variable,
      detail: 'foreach index',
      documentation: docs,
      insertText: `{${context.index}}`,
      sortText: '1'
    });
  }

  /**
   * 创建 collection 变量补全项
   * 
   * 用于嵌套 foreach 场景
   * 
   * @param context - Foreach 上下文
   * @returns collection 引用的 CompletionItem
   */
  private createCollectionVariable(context: ForeachContext): vscode.CompletionItem {
    const label = context.collection;
    
    const docs = new vscode.MarkdownString();
    docs.appendMarkdown(`**foreach collection**\n\n`);
    docs.appendMarkdown(`Reference to the collection being iterated.`);
    docs.appendMarkdown(`\n\n*Useful for nested foreach loops.*`);
    
    return this.createItem(label, {
      kind: vscode.CompletionItemKind.Reference,
      detail: 'foreach collection reference',
      documentation: docs,
      insertText: context.collection,
      sortText: '2' // 排在 item/index 之后
    });
  }

  /**
   * 检测嵌套 foreach
   * 
   * 分析是否存在嵌套的 foreach 标签
   * 这在实际场景中可能用于提供更精确的补全
   * 
   * @param content - 文档内容
   * @param line - 当前行号
   * @returns 是否为嵌套 foreach
   */
  private isNestedForeach(content: string, line: number): boolean {
    const lines = content.split('\n');
    let openCount = 0;
    
    // 扫描到当前行
    for (let i = 0; i <= line && i < lines.length; i++) {
      const lineContent = lines[i];
      
      // 统计 foreach 标签
      const openMatches = lineContent.match(/<foreach\s/gi);
      const closeMatches = lineContent.match(/<\/foreach>/gi);
      
      openCount += openMatches?.length ?? 0;
      openCount -= closeMatches?.length ?? 0;
    }
    
    // 如果 openCount > 1，说明是嵌套
    return openCount > 1;
  }
}
