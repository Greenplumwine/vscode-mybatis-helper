/**
 * Foreach Item 属性补全策略
 * 
 * 设计模式：
 * - 策略模式 (Strategy Pattern): 实现 CompletionStrategy 接口
 * 
 * 功能：在 <foreach> 标签内，输入 #{item. 时提供 item 类型的属性补全
 * 
 * @module features/completion/strategies/foreachItemPropertyStrategy
 */

import * as vscode from 'vscode';
import { BaseCompletionStrategy } from './baseStrategy';
import { CompletionContext, JavaMethodParser, JavaParameter } from '../types';

/**
 * Foreach Item 属性补全策略
 * 
 * 触发条件：
 * - 在 foreach 标签内
 * - 输入 #{item. 或 ${item.
 * 
 * 提供内容：
 * - item 对应类型的属性列表
 * 
 * 示例：
 * ```xml
 * <foreach collection="students" item="student">
 *   #{student.|}
 *   <!-- 补全：name, age, class 等 Student 类的属性 -->
 * </foreach>
 * ```
 */
export class ForeachItemPropertyStrategy extends BaseCompletionStrategy {
  /** 
   * 触发字符：.
   */
  readonly triggerCharacters = ['.'] as const;
  
  /**
   * 优先级：88
   * 
   * 高于 PlaceholderStrategy (70) 和 PropertyStrategy (80)
   * 确保在 foreach 内优先处理 item 变量
   */
  readonly priority = 88;
  
  /** 策略名称 */
  readonly name = 'ForeachItemProperty';
  
  /** Java 方法解析器 */
  private javaParser: JavaMethodParser;

  constructor(javaParser: JavaMethodParser) {
    super();
    this.javaParser = javaParser;
  }

  /**
   * 判断是否可以提供补全
   * 
   * 条件：
   * 1. 在 foreach 标签内
   * 2. 输入 #{item. 或 ${item.
   */
  canComplete(context: CompletionContext): boolean {
    // 必须有 foreach 上下文
    if (!context.foreachContext) {
      return false;
    }
    
    const { linePrefix } = context;
    const { item } = context.foreachContext;
    
    // 匹配 #{item. 或 ${item.（item 可以是任意名称）
    const pattern = new RegExp(`#\\{${item}\\.$`);
    const altPattern = new RegExp(`\\$\\{${item}\\.$`);
    
    return pattern.test(linePrefix) || altPattern.test(linePrefix);
  }

  /**
   * 提供补全项
   * 
   * 根据 collection 参数类型推断 item 类型，然后提供属性补全
   */
  async provideCompletionItems(
    context: CompletionContext
  ): Promise<vscode.CompletionItem[]> {
    const { foreachContext, javaMethod } = context;
    
    if (!foreachContext || !javaMethod?.parameters) {
      return [];
    }
    
    const { collection, item } = foreachContext;
    
    // 找到 collection 对应的参数
    const collectionParam = this.findCollectionParam(
      javaMethod.parameters, 
      collection
    );
    
    if (!collectionParam) {
      return [];
    }
    
    // 推断 item 类型
    const itemType = await this.inferItemType(collectionParam.type);
    
    if (!itemType) {
      return [];
    }
    
    // 获取 item 类型的属性
    const properties = await this.javaParser.getObjectProperties?.(itemType) ?? [];
    
    return properties.map((prop, index) => 
      this.createPropertyItem(prop, item, itemType, index)
    );
  }

  /**
   * 查找 collection 对应的参数
   * 
   * 优先匹配 @Param 注解值，其次匹配参数名
   */
  private findCollectionParam(
    parameters: JavaParameter[],
    collection: string
  ): JavaParameter | undefined {
    // 优先匹配 @Param 注解指定的名称
    const byParamValue = parameters.find(p => p.paramValue === collection);
    if (byParamValue) {
      return byParamValue;
    }
    // 其次匹配实际参数名
    return parameters.find(p => p.name === collection);
  }

  /**
   * 推断 item 类型
   * 
   * 从集合类型中提取元素类型：
   * - List<Student> -> Student
   * - Set<String> -> String
   * - Map<String, Integer> -> Map.Entry（简化处理为 Map）
   * - Student[] -> Student
   * 
   * @param collectionType 集合类型（如 List<Student>）
   * @returns item 类型（如 Student），无法推断返回 null
   */
  private async inferItemType(collectionType: string): Promise<string | null> {
    // 处理数组类型：Student[] -> Student
    if (collectionType.endsWith('[]')) {
      return collectionType.slice(0, -2);
    }
    
    // 处理泛型类型：List<Student> -> Student
    const genericMatch = collectionType.match(/<(.*?)>/);
    if (genericMatch) {
      const typeArg = genericMatch[1].trim();
      
      // 处理 Map<K, V>：返回 V（value 类型）
      if (collectionType.includes('Map<')) {
        const mapMatch = typeArg.match(/,\s*(.+)/);
        if (mapMatch) {
          return mapMatch[1].trim();
        }
        return typeArg; // 如果没有逗号，可能是简单类型
      }
      
      // 其他 Collection 类型：返回泛型参数
      return typeArg;
    }
    
    // 处理通配符：List<?> -> Object
    if (collectionType.includes('<?>')) {
      return 'Object';
    }
    
    // 无法推断，返回 null
    return null;
  }

  /**
   * 创建属性补全项
   */
  private createPropertyItem(
    property: string,
    item: string,
    itemType: string,
    index: number
  ): vscode.CompletionItem {
    const docs = new vscode.MarkdownString();
    docs.appendMarkdown(`**Property of \`${itemType}\`**\n\n`);
    docs.appendCodeblock(`${property}`, 'java');
    
    return this.createItem(`${item}.${property}`, {
      kind: vscode.CompletionItemKind.Field,
      detail: `Property of ${itemType}`,
      documentation: docs,
      insertText: property, // 只插入属性名，因为前面已经有 item.
      sortText: index.toString().padStart(3, '0')
    });
  }
}
