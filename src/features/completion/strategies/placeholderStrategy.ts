/**
 * SQL 占位符补全策略
 *
 * 设计模式：
 * - 策略模式 (Strategy Pattern): 实现 CompletionStrategy 接口
 * - 模板方法模式 (Template Method Pattern): 继承 BaseCompletionStrategy
 *
 * 功能：当用户输入 #{ 或 ${ 时，提供 Java 方法参数列表作为补全项
 *
 * @module features/completion/strategies/placeholderStrategy
 */

import * as vscode from 'vscode';
import { BaseCompletionStrategy } from './baseStrategy';
import { CompletionContext, JavaParameter, JavaMethodParser } from '../types';
import { Logger } from '../../../utils/logger';

/**
 * SQL 占位符补全策略
 *
 * 触发条件：
 * - 输入 `#{` 或 `${`
 * - 不在 foreach 标签内（优先级低于 ForeachVariableStrategy）
 *
 * 提供内容：
 * - Java 方法的参数列表
 * - @Param 标注的参数优先排序
 * - 显示参数类型和名称
 *
 * @example
 * ```java
 * // Java 方法
 * User findById(@Param("id") Long userId, String name);
 * ```
 *
 * ```xml
 * <!-- 输入 #{ 后提供的补全 -->
 * #{id}      <!-- @Param 标注，优先显示 -->
 * #{userId}  <!-- 实际参数名 -->
 * #{name}
 * ```
 */
export class PlaceholderStrategy extends BaseCompletionStrategy {
  /**
   * 触发字符：#、$、{
   * 这样可以在用户输入 # 或 $ 时就触发，然后检查是否是 #{
   */
  readonly triggerCharacters = ['#', '$', '{'] as const;

  /**
   * 优先级：70
   *
   * 低于 ForeachVariableStrategy (90) 和 PropertyStrategy (80)
   * 确保在 foreach 内优先提示 item/index，在 #{user. 后优先提示属性
   */
  readonly priority = 70;

  /** 策略名称 */
  readonly name = 'Placeholder';

  /** 日志记录器 */
  private logger = Logger.getInstance();

  /** Java 方法解析器 */
  private javaParser: JavaMethodParser | undefined;

  /**
   * 构造函数
   *
   * @param javaParser - Java 方法解析器（可选，用于获取对象属性）
   */
  constructor(javaParser?: JavaMethodParser) {
    super();
    this.javaParser = javaParser;
  }

  /**
   * 判断是否可以提供补全
   *
   * 条件：
   * 1. 行前缀以 #{ 或 ${ 结尾
   * 2. 不在 foreach 标签内（让给 ForeachVariableStrategy）
   *
   * @param context - 补全上下文
   * @returns 是否可以补全
   */
  canComplete(context: CompletionContext): boolean {
    const { linePrefix, triggerCharacter } = context;

    // 情况1：已经输入了 #{ 或 ${
    const isCompletePlaceholder = /#\{$/.test(linePrefix) ||
                                   /\$\{$/.test(linePrefix);

    // 情况2：刚输入了 # 或 $（触发字符）
    const isTriggerChar = triggerCharacter === '#' || triggerCharacter === '$';

    // 情况3：输入了 {，前面是 # 或 $
    const isOpeningBrace = triggerCharacter === '{' &&
                           (/#$/.test(linePrefix.slice(0, -1)) || /\$$/.test(linePrefix.slice(0, -1)));

    // 情况4：在 foreach 标签属性区域内输入了 #{ 或 ${
    // 这种情况下 linePrefix 可能包含 <foreach ... #{，需要特殊处理
    const isInForeachTagWithPlaceholder = /<foreach\b[^>]*#\{$/i.test(linePrefix) ||
                                          /<foreach\b[^>]*\$\{$/i.test(linePrefix);

    if (!isCompletePlaceholder && !isTriggerChar && !isOpeningBrace && !isInForeachTagWithPlaceholder) {
      return false;
    }

    // 如果在 foreach 内且输入的是 #{，让给 ForeachVariableStrategy
    // 但只有在光标确实在 foreach 标签的 SQL 内容区域内时才让出
    // 如果 linePrefix 包含 <foreach，说明还在标签属性区域，不应该让出
    if (context.foreachContext && /#\{?$/.test(linePrefix)) {
      // 检查是否在 foreach 标签的属性区域内
      const isInForeachTagAttrs = /<foreach\b[^>]*$/i.test(linePrefix);
      if (!isInForeachTagAttrs) {
        return false;
      }
    }

    return true;
  }

  /**
   * 提供补全项
   *
   * 包括：
   * 1. 所有参数本身（如 #{job}）
   * 2. 对象类型参数的属性（如 #{job.jobId}, #{job.jobName}）
   *
   * @param context - 补全上下文
   * @returns 参数补全项列表
   */
  async provideCompletionItems(
    completionContext: CompletionContext
  ): Promise<vscode.CompletionItem[]> {
    if (!completionContext.javaMethod) {
      this.logger.debug('Placeholder: No javaMethod in context');
      return [];
    }
    this.logger.debug(`Placeholder: javaMethod=${completionContext.javaMethod.name}, params=${completionContext.javaMethod.parameters?.length || 0}`);

    const { javaMethod, linePrefix } = completionContext;
    const javaParser = this.javaParser;

    // 确定占位符类型：# 或 $
    let marker = '#';
    if (linePrefix.endsWith('${') || linePrefix.endsWith('$')) {
      marker = '$';
    } else if (linePrefix.endsWith('#{') || linePrefix.endsWith('#')) {
      marker = '#';
    }

    // 使用二分法排序参数：@Param 标注的参数在前
    const sortedParams = this.sortParameters(javaMethod.parameters);

    const items: vscode.CompletionItem[] = [];

    // 为每个参数创建补全项，并为对象类型参数添加属性补全
    for (let index = 0; index < sortedParams.length; index++) {
      const param = sortedParams[index];

      // 1. 添加参数本身的补全项
      items.push(this.createParameterItem(param, marker, index, completionContext));

      // 2. 如果是对象类型，获取并添加属性补全
      if (javaParser && !this.isBasicType(param.type)) {
        try {
          const properties = await javaParser.getObjectProperties?.(param.type) ?? [];
          for (const prop of properties) {
            items.push(this.createPropertyPathItem(param, prop, marker, index, completionContext));
          }
        } catch (error) {
          this.logger.debug(`Failed to get properties for ${param.type}:`, error);
        }
      }
    }

    return items;
  }

  /**
   * 判断是否是基本类型（非对象类型）
   */
  private isBasicType(type: string): boolean {
    const basicTypes = ['String', 'Integer', 'Long', 'Boolean', 'Double', 'Float',
                       'int', 'long', 'boolean', 'double', 'float', 'byte', 'short',
                       'BigDecimal', 'Date', 'LocalDate', 'LocalDateTime',
                       'List', 'Set', 'Map', 'Collection', 'Iterable'];
    return basicTypes.includes(type) ||
           type.startsWith('java.') ||
           type.includes('<') || // 泛型类型
           type.endsWith('[]'); // 数组类型
  }

  /**
   * 对参数进行排序
   *
   * 排序规则：
   * 1. 有 @Param 注解的参数排在前面
   * 2. 保持原始顺序（稳定排序）
   *
   * 算法：Array.prototype.sort() 配合稳定比较器
   * 时间复杂度：O(n log n)
   *
   * @param parameters - 参数列表
   * @returns 排序后的参数列表
   */
  private sortParameters(parameters: readonly JavaParameter[]): JavaParameter[] {
    return [...parameters].sort((a, b) => {
      // 有 @Param 的排在前面（1 - 0 = 1 或 0 - 1 = -1）
      const aHasParam = a.paramValue ? 1 : 0;
      const bHasParam = b.paramValue ? 1 : 0;
      return bHasParam - aHasParam;
    });
  }

  /**
   * 创建参数补全项
   *
   * @param param - 参数信息
   * @param marker - 占位符标记（# 或 $）
   * @param index - 参数索引
   * @param context - 补全上下文（用于计算范围）
   * @returns 配置好的 CompletionItem
   */
  private createParameterItem(
    param: JavaParameter,
    marker: string,
    index: number,
    completionContext: CompletionContext
  ): vscode.CompletionItem {
    // 优先使用 @Param 注解指定的名称，否则使用参数名
    const paramRefName = param.paramValue || param.name;

    const label = `${marker}{${paramRefName}}`;

    // 构建文档
    const docs = this.buildParameterDocs(param);

    // 排序文本：有 @Param 的用 0xx，无的用 1xx
    const sortText = param.paramValue ? `0${index.toString().padStart(2, '0')}`
                                     : `1${index.toString().padStart(2, '0')}`;

    // 根据触发字符确定插入文本和范围
    const { triggerCharacter, position, document } = completionContext;
    let insertText: string;
    let range: vscode.Range | undefined;

    // 计算行前缀和后缀
    const line = document.lineAt(position.line).text;
    const linePrefix = line.substring(0, position.character);
    const lineSuffix = line.substring(position.character);
    const hasAutoCloseBrace = lineSuffix.startsWith('}');

    // 检查行前缀是否以 #{ 或 ${ 结尾（这是最重要的判断）
    const endsWithPlaceholderStart = /#\{$/.test(linePrefix) || /\$\{$/.test(linePrefix);

    if (triggerCharacter === '#' || triggerCharacter === '$') {
      // 用户输入了 # 或 $，需要插入完整 {param}
      insertText = `{${paramRefName}}`;
    } else if (endsWithPlaceholderStart) {
      // 行前缀以 #{ 或 ${ 结尾
      // 注意：如果后面有自动插入的 }，我们只插入参数名，不插入 }
      if (hasAutoCloseBrace) {
        // 有自动插入的 }，设置 range 覆盖它，只插入参数名
        range = new vscode.Range(
          position,
          new vscode.Position(position.line, position.character + 1)
        );
        insertText = paramRefName;
      } else {
        // 没有自动插入的 }，插入参数名 + }
        insertText = `${paramRefName}}`;
      }
    } else {
      // 默认情况：插入完整的占位符
      insertText = `${marker}{${paramRefName}}`;
    }

    const item = this.createItem(label, {
      kind: vscode.CompletionItemKind.Variable,
      detail: `${param.type} ${param.name}`,
      documentation: docs,
      insertText,
      sortText
    });

    // 设置范围（如果需要覆盖自动插入的 }）
    if (range) {
      item.range = range;
    }

    return item;
  }

  /**
   * 创建属性路径补全项（如 #{job.jobId}）
   *
   * @param param - 参数信息
   * @param property - 属性名
   * @param marker - 占位符标记（# 或 $）
   * @param index - 参数索引
   * @param completionContext - 补全上下文
   * @returns 配置好的 CompletionItem
   */
  private createPropertyPathItem(
    param: JavaParameter,
    property: string,
    marker: string,
    index: number,
    completionContext: CompletionContext
  ): vscode.CompletionItem {
    // 优先使用 @Param 注解指定的名称，否则使用参数名
    const paramRefName = param.paramValue || param.name;

    const label = `${marker}{${paramRefName}.${property}}`;

    // 构建文档
    const docs = new vscode.MarkdownString();
    docs.appendCodeblock(`${param.type} ${param.name}`, 'java');
    docs.appendMarkdown(`\n\n**Property:** \`${property}\``);

    // 排序文本：对象属性的排序在参数之后
    const sortText = `2${index.toString().padStart(2, '0')}${property}`;

    // 根据触发字符确定插入文本和范围
    const { triggerCharacter, position, document } = completionContext;
    let insertText: string;
    let range: vscode.Range | undefined;

    // 计算行前缀和后缀
    const line = document.lineAt(position.line).text;
    const linePrefix = line.substring(0, position.character);
    const lineSuffix = line.substring(position.character);
    const hasAutoCloseBrace = lineSuffix.startsWith('}');

    // 检查行前缀是否以 #{ 或 ${ 结尾（这是最重要的判断）
    const endsWithPlaceholderStart = /#\{$/.test(linePrefix) || /\$\{$/.test(linePrefix);

    if (triggerCharacter === '#' || triggerCharacter === '$') {
      // 用户输入了 # 或 $，需要插入完整 {param.property}
      insertText = `{${paramRefName}.${property}}`;
    } else if (endsWithPlaceholderStart) {
      // 行前缀以 #{ 或 ${ 结尾
      // 注意：如果后面有自动插入的 }，我们只插入参数名.属性，不插入 }
      if (hasAutoCloseBrace) {
        // 有自动插入的 }，设置 range 覆盖它，只插入参数名.属性
        range = new vscode.Range(
          position,
          new vscode.Position(position.line, position.character + 1)
        );
        insertText = `${paramRefName}.${property}`;
      } else {
        // 没有自动插入的 }，插入参数名.属性 + }
        insertText = `${paramRefName}.${property}}`;
      }
    } else {
      // 默认情况：插入完整的占位符
      insertText = `${marker}{${paramRefName}.${property}}`;
    }

    const item = this.createItem(label, {
      kind: vscode.CompletionItemKind.Field,
      detail: `${this.extractSimpleTypeName(param.type)}.${property}`,
      documentation: docs,
      insertText,
      sortText
    });

    // 设置范围（如果需要覆盖自动插入的 }）
    if (range) {
      item.range = range;
    }

    return item;
  }

  /**
   * 从全限定类型名提取简单类型名
   */
  private extractSimpleTypeName(typeName: string): string {
    const lastDot = typeName.lastIndexOf('.');
    return lastDot >= 0 ? typeName.substring(lastDot + 1) : typeName;
  }

  /**
   * 构建参数文档
   *
   * @param param - 参数信息
   * @returns Markdown 文档
   */
  private buildParameterDocs(param: JavaParameter): vscode.MarkdownString {
    const docs = new vscode.MarkdownString();

    // 类型信息
    docs.appendCodeblock(`${param.type} ${param.name}`, 'java');

    // @Param 信息
    if (param.paramValue) {
      docs.appendMarkdown(`\n\n**@Param("${param.paramValue}")**`);
      docs.appendMarkdown(`\n\n在 SQL 中可使用 \`#\{${param.paramValue}\}\` 引用此参数`);
    }

    // 注解列表
    if (param.annotations && param.annotations.length > 0) {
      docs.appendMarkdown(`\n\n**Annotations:**`);
      for (const annotation of param.annotations) {
        docs.appendMarkdown(`\n- \`${annotation}\``);
      }
    }

    return docs;
  }
}
