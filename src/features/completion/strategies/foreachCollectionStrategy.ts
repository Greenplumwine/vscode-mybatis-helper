/**
 * Foreach Collection 属性补全策略
 * 
 * 设计模式：
 * - 策略模式 (Strategy Pattern): 实现 CompletionStrategy 接口
 * 
 * 功能：在 <foreach> 标签的 collection 属性中提供集合类型参数的补全
 * 
 * @module features/completion/strategies/foreachCollectionStrategy
 */

import * as vscode from 'vscode';
import { BaseCompletionStrategy } from './baseStrategy';
import { CompletionContext, JavaParameter } from '../types';

/**
 * Foreach Collection 补全策略
 * 
 * 触发条件：
 * - 在 foreach 标签的 collection 属性中
 * 
 * 提供内容：
 * - 数组类型参数（如 String[]）
 * - Collection 类型参数（如 List<Student>, Set<Integer>）
 * - Map 类型参数（如 Map<String, Object>）
 * 
 * 示例：
 * ```xml
 * <foreach collection="|" item="student">
 *   <!-- 补全：studentList, ids, userMap -->
 * </foreach>
 * ```
 */
export class ForeachCollectionStrategy extends BaseCompletionStrategy {
  /** 
   * 触发字符：双引号、单引号、字母（用于输入属性值时触发）
   */
  readonly triggerCharacters = ['"', "'", 'a', 'b', 'c', 'd', 'e', 'f', 'g', 'h', 'i', 'j', 'k', 'l', 'm', 'n', 'o', 'p', 'q', 'r', 's', 't', 'u', 'v', 'w', 'x', 'y', 'z'] as const;
  
  /**
   * 优先级：85
   * 
   * 高于一般的属性值补全
   */
  readonly priority = 85;
  
  /** 策略名称 */
  readonly name = 'ForeachCollection';

  /**
   * 判断是否可以提供补全
   * 
   * 条件：
   * 1. 光标在 foreach 标签内
   * 2. 在 collection 属性值中（包括空值）
   */
  canComplete(context: CompletionContext): boolean {
    const { linePrefix, lineSuffix, foreachContext } = context;
    
    // 检测是否在 collection 属性值中
    // 场景1: collection="..."（光标在引号对之间）
    // 场景2: collection="...（光标在值中间）
    // 使用 linePrefix 检测是否在开引号之后
    const isInCollectionOpen = /collection\s*=\s*["'][^"']*$/i.test(linePrefix);
    
    // 补充检测：如果 linePrefix 以引号结尾，且 lineSuffix 以引号或空格/标签结尾
    // 这处理 collection="|" 的场景（光标在空引号对之间）
    const lastQuoteMatch = linePrefix.match(/collection\s*=\s*(["'])$/);
    const isAtEmptyValue = lastQuoteMatch !== null && 
                          (lineSuffix.startsWith(lastQuoteMatch[1]) || // 闭合引号
                           lineSuffix.startsWith(' ') || 
                           lineSuffix.startsWith('>') ||
                           lineSuffix.startsWith('\n'));
    
    const isInCollection = isInCollectionOpen || isAtEmptyValue;
    
    // 如果在 collection 属性中，且满足以下任一条件：
    // 1. 行中包含 <foreach 标签
    // 2. 有 foreachContext（表示在 foreach 标签内）
    const hasForeachTag = /<foreach\b/i.test(linePrefix);
    const hasForeachCtx = !!foreachContext;
    
    const result = isInCollection && (hasForeachTag || hasForeachCtx);
    
    // 输出调试日志
    console.log(`[ForeachCollection] line="${linePrefix.slice(-35)}", suffix="${lineSuffix.slice(0, 10)}", isOpen=${isInCollectionOpen}, isEmpty=${isAtEmptyValue}, hasForeachTag=${hasForeachTag}, hasForeachCtx=${hasForeachCtx}, result=${result}`);
    
    return result;
  }

  /**
   * 提供补全项
   * 
   * 返回所有集合类型的参数
   */
  async provideCompletionItems(
    context: CompletionContext
  ): Promise<vscode.CompletionItem[]> {
    if (!context.javaMethod?.parameters) {
      return [];
    }
    
    const { parameters } = context.javaMethod;
    
    // 过滤出集合类型的参数
    const collectionParams = parameters.filter(p => this.isCollectionType(p.type));
    
    if (collectionParams.length === 0) {
      return [];
    }
    
    return collectionParams.map((param, index) => 
      this.createCollectionItem(param, index)
    );
  }

  /**
   * 判断是否为集合类型
   * 
   * 包括：
   * - 数组（如 String[], int[]）
   * - Collection 接口及其实现（List, Set, Queue 等）
   * - Map 接口及其实现
   */
  private isCollectionType(type: string): boolean {
    const collectionTypes = [
      '[]',              // 数组
      'List<',
      'Set<',
      'Collection<',
      'Queue<',
      'Deque<',
      'Map<',
      'HashMap<',
      'LinkedHashMap<',
      'TreeMap<',
      'ArrayList<',
      'LinkedList<',
      'HashSet<',
      'TreeSet<',
      'Vector<',
      'Stack<',
      // 全限定名
      'java.util.List',
      'java.util.Set',
      'java.util.Collection',
      'java.util.Map',
      'java.util.Queue',
      'java.util.Deque'
    ];
    
    return collectionTypes.some(ct => type.includes(ct)) || type.endsWith('[]');
  }

  /**
   * 创建集合参数补全项
   */
  private createCollectionItem(
    param: JavaParameter,
    index: number
  ): vscode.CompletionItem {
    // 使用 @Param 注解值或参数名
    const insertName = param.paramValue || param.name;
    
    const label = insertName;
    
    // 构建文档
    const docs = new vscode.MarkdownString();
    docs.appendCodeblock(`${param.type} ${param.name}`, 'java');
    
    if (param.paramValue) {
      docs.appendMarkdown(`\n\n**@Param("${param.paramValue}")**`);
    }
    
    docs.appendMarkdown(`\n\n集合类型，可用于 foreach 遍历`);
    
    return this.createItem(label, {
      kind: vscode.CompletionItemKind.Property,
      detail: `Collection: ${param.type}`,
      documentation: docs,
      insertText: insertName,
      sortText: index.toString().padStart(3, '0')
    });
  }
}
