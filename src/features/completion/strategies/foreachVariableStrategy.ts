/**
 * Foreach 变量补全策略
 *
 * 设计模式：
 * - 策略模式 (Strategy Pattern): 实现 CompletionStrategy 接口
 * - 模板方法模式 (Template Method Pattern): 继承 BaseCompletionStrategy
 *
 * 功能：当光标在 <foreach> 标签内时，输入 #{ 优先提示 item 和 index 变量，
 *       以及 item 的属性（如果 item 是对象类型）
 *
 * @module features/completion/strategies/foreachVariableStrategy
 */

import * as vscode from 'vscode';
import { BaseCompletionStrategy } from './baseStrategy';
import { CompletionContext, ForeachContext, JavaMethodParser, JavaParameter } from '../types';

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
 * - item 的属性（如果 item 是对象类型，如 role.roleId）
 *
 * 优先级高于 PlaceholderStrategy，确保在 foreach 内优先提示 item/index
 *
 * @example
 * ```xml
 * <foreach collection="userList" item="user" index="idx">
 *   <!-- 输入 #{ 后提供的补全 -->
 *   #{user}       <!-- item 变量 -->
 *   #{user.name}  <!-- item 属性 -->
 *   #{idx}        <!-- index 变量 -->
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

  /** Java 方法解析器 */
  private javaParser: JavaMethodParser | undefined;

  constructor(javaParser?: JavaMethodParser) {
    super();
    this.javaParser = javaParser;
  }

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
    const { foreachContext, linePrefix, position, document, javaMethod } = context;

    if (!foreachContext) {
      return [];
    }

    // 获取当前行后缀（检查是否有自动插入的 }）
    const line = document.lineAt(position.line).text;
    const lineSuffix = line.substring(position.character);
    const hasAutoCloseBrace = lineSuffix.startsWith('}');

    // 检测用户已经输入了什么
    const endsWithPlaceholderStart = /#\{$/.test(linePrefix) || /\$\{$/.test(linePrefix);
    const endsWithMarker = /#$/.test(linePrefix) || /\$$/.test(linePrefix);

    const items: vscode.CompletionItem[] = [];

    // 添加 item 变量（最高优先级）
    items.push(this.createItemVariable(foreachContext, endsWithPlaceholderStart, endsWithMarker, hasAutoCloseBrace, position));

    // 添加 index 变量（如果定义了）
    if (foreachContext.index) {
      items.push(this.createIndexVariable(foreachContext, endsWithPlaceholderStart, endsWithMarker, hasAutoCloseBrace, position));
    }

    // 可选：添加 collection 引用（用于嵌套 foreach）
    items.push(this.createCollectionVariable(foreachContext, endsWithPlaceholderStart, endsWithMarker, hasAutoCloseBrace, position));

    // 添加 item 的属性补全（如果 javaParser 可用）
    if (this.javaParser && javaMethod?.parameters) {
      const propertyItems = await this.createItemPropertyItems(
        foreachContext,
        javaMethod.parameters,
        endsWithPlaceholderStart,
        endsWithMarker,
        hasAutoCloseBrace,
        position
      );
      items.push(...propertyItems);
    }

    return items;
  }

  /**
   * 创建 item 属性补全项列表
   */
  private async createItemPropertyItems(
    context: ForeachContext,
    parameters: JavaParameter[],
    endsWithPlaceholderStart: boolean,
    endsWithMarker: boolean,
    hasAutoCloseBrace: boolean,
    position: vscode.Position
  ): Promise<vscode.CompletionItem[]> {
    const { collection, item } = context;

    // 找到 collection 对应的参数
    const collectionParam = this.findCollectionParam(parameters, collection);
    if (!collectionParam) {
      return [];
    }

    // 推断 item 类型
    const itemType = this.inferItemType(collectionParam.type);
    if (!itemType || this.isBasicType(itemType)) {
      return [];
    }

    // 获取 item 类型的属性
    const properties = await this.javaParser?.getObjectProperties?.(itemType) ?? [];

    return properties.map((prop, index) =>
      this.createPropertyItem(
        prop.name,
        item,
        itemType,
        index,
        endsWithPlaceholderStart,
        endsWithMarker,
        hasAutoCloseBrace,
        position
      )
    );
  }

  /**
   * 查找 collection 对应的参数
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
   */
  private inferItemType(collectionType: string): string | null {
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
        return typeArg;
      }

      // 其他 Collection 类型：返回泛型参数
      return typeArg;
    }

    // 无法推断，返回 null
    return null;
  }

  /**
   * 判断是否是基本类型
   */
  private isBasicType(type: string): boolean {
    const basicTypes = [
      'String', 'Integer', 'Long', 'Boolean', 'Double', 'Float',
      'int', 'long', 'boolean', 'double', 'float', 'byte', 'short', 'char',
      'BigDecimal', 'BigInteger', 'Date', 'LocalDate', 'LocalDateTime',
      'LocalTime', 'Instant', 'UUID', 'Object'
    ];

    // 处理泛型
    const baseType = type.replace(/<.*>$/, '');

    return basicTypes.includes(baseType) ||
           type.startsWith('java.lang.') ||
           type.startsWith('java.math.') ||
           type.startsWith('java.time.');
  }

  /**
   * 创建属性补全项
   */
  private createPropertyItem(
    property: string,
    item: string,
    itemType: string,
    index: number,
    endsWithPlaceholderStart: boolean,
    endsWithMarker: boolean,
    hasAutoCloseBrace: boolean,
    position: vscode.Position
  ): vscode.CompletionItem {
    const label = `${item}.${property}`;

    // 根据上下文确定 insertText
    let insertText: string;
    let range: vscode.Range | undefined;

    if (endsWithPlaceholderStart) {
      // 已经有 #{，只需 item.property}
      if (hasAutoCloseBrace) {
        insertText = `${item}.${property}}`;
        range = new vscode.Range(position, new vscode.Position(position.line, position.character + 1));
      } else {
        insertText = `${item}.${property}}`;
      }
    } else if (endsWithMarker) {
      // 只有 #，需要 {item.property}
      if (hasAutoCloseBrace) {
        insertText = `{${item}.${property}}`;
        range = new vscode.Range(position, new vscode.Position(position.line, position.character + 1));
      } else {
        insertText = `{${item}.${property}}`;
      }
    } else {
      insertText = `{${item}.${property}}`;
    }

    const docs = new vscode.MarkdownString();
    docs.appendMarkdown(`**Property of \`${itemType}\`**\n\n`);
    docs.appendCodeblock(`${property}`, 'java');

    const completionItem = this.createItem(label, {
      kind: vscode.CompletionItemKind.Field,
      detail: `Property of ${itemType}`,
      documentation: docs,
      insertText,
      sortText: `3${index.toString().padStart(3, '0')}` // 排在 item/index/collection 之后
    });

    if (range) {
      completionItem.range = range;
    }

    return completionItem;
  }

  /**
   * 创建 item 变量补全项
   */
  private createItemVariable(
    context: ForeachContext,
    endsWithPlaceholderStart: boolean,
    endsWithMarker: boolean,
    hasAutoCloseBrace: boolean,
    position: vscode.Position
  ): vscode.CompletionItem {
    const label = context.item;

    // 根据上下文确定 insertText
    let insertText: string;
    let range: vscode.Range | undefined;

    if (endsWithPlaceholderStart) {
      // 已经有 #{，只需 item}
      if (hasAutoCloseBrace) {
        // 后面有自动插入的 }，需要覆盖它，同时 insertText 要包含 }
        insertText = `${context.item}}`;
        range = new vscode.Range(position, new vscode.Position(position.line, position.character + 1));
      } else {
        // 后面没有自动 }，需要自己加
        insertText = `${context.item}}`;
      }
    } else if (endsWithMarker) {
      // 只有 #，需要 {item}
      if (hasAutoCloseBrace) {
        // 后面有自动插入的 }
        insertText = `{${context.item}}`;
        range = new vscode.Range(position, new vscode.Position(position.line, position.character + 1));
      } else {
        insertText = `{${context.item}}`;
      }
    } else {
      // 默认情况，插入完整占位符
      insertText = `{${context.item}}`;
    }

    // 构建文档说明
    const docs = new vscode.MarkdownString();
    docs.appendMarkdown(`**foreach item variable**\n\n`);
    docs.appendMarkdown(`Collection: \`${context.collection}\`\n\n`);
    docs.appendMarkdown(`This variable represents each element in the collection.`);

    const item = this.createItem(label, {
      kind: vscode.CompletionItemKind.Variable,
      detail: `foreach item (${context.collection} → ${context.item})`,
      documentation: docs,
      insertText,
      sortText: '0' // 确保排在最前面
    });

    if (range) {
      item.range = range;
    }

    return item;
  }

  /**
   * 创建 index 变量补全项
   */
  private createIndexVariable(
    context: ForeachContext,
    endsWithPlaceholderStart: boolean,
    endsWithMarker: boolean,
    hasAutoCloseBrace: boolean,
    position: vscode.Position
  ): vscode.CompletionItem {
    const label = context.index!;

    // 根据上下文确定 insertText
    let insertText: string;
    let range: vscode.Range | undefined;

    if (endsWithPlaceholderStart) {
      if (hasAutoCloseBrace) {
        insertText = `${context.index}}`;
        range = new vscode.Range(position, new vscode.Position(position.line, position.character + 1));
      } else {
        insertText = `${context.index}}`;
      }
    } else if (endsWithMarker) {
      if (hasAutoCloseBrace) {
        insertText = `{${context.index}}`;
        range = new vscode.Range(position, new vscode.Position(position.line, position.character + 1));
      } else {
        insertText = `{${context.index}}`;
      }
    } else {
      insertText = `{${context.index}}`;
    }

    const docs = new vscode.MarkdownString();
    docs.appendMarkdown(`**foreach index variable**\n\n`);
    docs.appendMarkdown(`This variable represents the index of the current element.`);

    const item = this.createItem(label, {
      kind: vscode.CompletionItemKind.Variable,
      detail: 'foreach index',
      documentation: docs,
      insertText,
      sortText: '1'
    });

    if (range) {
      item.range = range;
    }

    return item;
  }

  /**
   * 创建 collection 变量补全项
   */
  private createCollectionVariable(
    context: ForeachContext,
    endsWithPlaceholderStart: boolean,
    endsWithMarker: boolean,
    hasAutoCloseBrace: boolean,
    position: vscode.Position
  ): vscode.CompletionItem {
    const label = context.collection;

    // 根据上下文确定 insertText
    let insertText: string;
    let range: vscode.Range | undefined;

    if (endsWithPlaceholderStart) {
      if (hasAutoCloseBrace) {
        insertText = `${context.collection}}`;
        range = new vscode.Range(position, new vscode.Position(position.line, position.character + 1));
      } else {
        insertText = `${context.collection}}`;
      }
    } else if (endsWithMarker) {
      if (hasAutoCloseBrace) {
        insertText = `{${context.collection}}`;
        range = new vscode.Range(position, new vscode.Position(position.line, position.character + 1));
      } else {
        insertText = `{${context.collection}}`;
      }
    } else {
      insertText = context.collection;
    }

    const docs = new vscode.MarkdownString();
    docs.appendMarkdown(`**foreach collection**\n\n`);
    docs.appendMarkdown(`Reference to the collection being iterated.`);
    docs.appendMarkdown(`\n\n*Useful for nested foreach loops.*`);

    const item = this.createItem(label, {
      kind: vscode.CompletionItemKind.Reference,
      detail: 'foreach collection reference',
      documentation: docs,
      insertText,
      sortText: '2' // 排在 item/index 之后
    });

    if (range) {
      item.range = range;
    }

    return item;
  }
}
