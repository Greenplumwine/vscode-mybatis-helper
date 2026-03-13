/**
 * 对象属性补全策略
 * 
 * 设计模式：
 * - 策略模式 (Strategy Pattern): 实现 CompletionStrategy 接口
 * - 模板方法模式 (Template Method Pattern): 继承 BaseCompletionStrategy
 * 
 * 功能：当用户输入 #{obj. 或 ${obj. 时，提供对象的属性列表
 * 
 * @module features/completion/strategies/propertyStrategy
 */

import * as vscode from 'vscode';
import { BaseCompletionStrategy } from './baseStrategy';
import { CompletionContext, JavaMethodParser, JavaParameter } from '../types';
import { logger } from '../../../utils/logger';

/**
 * 对象属性补全策略
 * 
 * 触发条件：
 * - 输入 `#{obj.` 或 `${obj.`（obj 是一个参数名）
 * 
 * 提供内容：
 * - 对象类型的属性列表
 * 
 * @example
 * ```java
 * // Java 方法
 * User findByCondition(@Param("user") User user);
 * ```
 * 
 * ```xml
 * <!-- 输入 #{user. 后提供的补全 -->
 * #{user.id}
 * #{user.name}
 * #{user.email}
 * ```
 */
export class PropertyStrategy extends BaseCompletionStrategy {
  /** 
   * 触发字符：.
   */
  readonly triggerCharacters = ['.'] as const;
  
  /**
   * 优先级：80
   * 
   * 高于 PlaceholderStrategy (70)，低于 ForeachVariableStrategy (90)
   */
  readonly priority = 80;
  
  /** 策略名称 */
  readonly name = 'Property';
  
  /** Java 方法解析器 */
  private javaParser: JavaMethodParser;

  /**
   * 构造函数
   * 
   * @param javaParser - Java 方法解析器，用于获取对象属性
   */
  constructor(javaParser: JavaMethodParser) {
    super();
    this.javaParser = javaParser;
  }

  /**
   * 判断是否可以提供补全
   * 
   * 条件：
   * - 行前缀匹配 #{xxx. 或 ${xxx.（后面可以跟任意字符用于过滤）
   * - xxx 是有效的参数名
   * 
   * @param context - 补全上下文
   * @returns 是否可以补全
   */
  canComplete(context: CompletionContext): boolean {
    // 匹配 #{xxx. 或 ${xxx.（后面可以跟任意字符，用于属性名过滤）
    // 例如：#{job. | #{job.j | #{job.jobId
    const pattern = /#\{(\w+)\.[\w]*$/;
    const altPattern = /\$\{(\w+)\.[\w]*$/;
    
    return pattern.test(context.linePrefix) || altPattern.test(context.linePrefix);
  }

  /**
   * 提供补全项
   * 
   * @param context - 补全上下文
   * @returns 属性补全项列表
   */
  async provideCompletionItems(
    context: CompletionContext
  ): Promise<vscode.CompletionItem[]> {
    // 提取对象名
    const objectName = this.extractObjectName(context.linePrefix);
    
    logger.debug(`PropertyStrategy: extracting object name from "${context.linePrefix}" -> "${objectName}"`);
    
    if (!objectName || !context.javaMethod) {
      logger.debug(`PropertyStrategy: no object name or java method. objectName=${objectName}, hasMethod=${!!context.javaMethod}`);
      return [];
    }
    
    // 在参数列表中查找该对象
    const param = this.findParameterByName(context.javaMethod.parameters, objectName);
    
    logger.debug(`PropertyStrategy: found param for "${objectName}":`, param);
    
    if (!param) {
      logger.debug(`PropertyStrategy: parameter "${objectName}" not found in method parameters`);
      return [];
    }
    
    // 获取对象属性（如果方法存在）
    logger.debug(`PropertyStrategy: getting properties for type "${param.type}"`);
    const properties = await this.javaParser.getObjectProperties?.(param.type) ?? [];
    
    logger.debug(`PropertyStrategy: got ${properties.length} properties for type "${param.type}":`, properties);
    
    // 创建补全项
    return this.createPropertyItems(properties, param);
  }

  /**
   * 从行前缀提取对象名
   * 
   * 支持格式：
   * - #{obj. | ${obj.（刚输入点号）
   * - #{obj.prop | ${obj.prop（已输入部分属性名）
   * 
   * @param linePrefix - 行前缀文本
   * @returns 对象名，如果不匹配返回 null
   */
  private extractObjectName(linePrefix: string): string | null {
    // 匹配 #{xxx. 或 ${xxx.（后面可以跟部分属性名）
    const match = linePrefix.match(/#\{(\w+)\.[\w]*$/) || 
                  linePrefix.match(/\$\{(\w+)\.[\w]*$/);
    return match ? match[1] : null;
  }

  /**
   * 在参数列表中查找指定名称的参数
   * 
   * 优先匹配 @Param 注解指定的名称，其次匹配参数名
   * 
   * 算法复杂度：O(n)，n 通常为 1-5
   * 
   * @param parameters - 参数列表
   * @param name - 要查找的参数名（可能是 @Param 值或实际参数名）
   * @returns 参数信息，未找到返回 undefined
   */
  private findParameterByName(
    parameters: readonly JavaParameter[], 
    name: string
  ): JavaParameter | undefined {
    // 优先匹配 @Param 注解指定的名称
    const byParamName = parameters.find(p => p.paramValue === name);
    if (byParamName) {
      return byParamName;
    }
    // 其次匹配实际参数名
    return parameters.find(p => p.name === name);
  }

  /**
   * 创建属性补全项列表
   * 
   * @param properties - 属性名列表
   * @param param - 参数信息（用于显示详情）
   * @returns 补全项列表
   */
  private createPropertyItems(
    properties: string[],
    param: JavaParameter
  ): vscode.CompletionItem[] {
    return properties.map((prop, index) => {
      const docs = new vscode.MarkdownString();
      docs.appendMarkdown(`**Property of \`${param.type}\`**\n\n`);
      docs.appendCodeblock(`${prop}`, 'java');
      
      return this.createItem(prop, {
        kind: vscode.CompletionItemKind.Field,
        detail: `Property of ${this.extractSimpleTypeName(param.type)}`,
        documentation: docs,
        insertText: prop,
        sortText: index.toString().padStart(3, '0')
      });
    });
  }

  /**
   * 从全限定类型名提取简单类型名
   * 
   * @param typeName - 类型名（如 java.lang.String 或 String）
   * @returns 简单类型名
   */
  private extractSimpleTypeName(typeName: string): string {
    const lastDot = typeName.lastIndexOf('.');
    return lastDot >= 0 ? typeName.substring(lastDot + 1) : typeName;
  }
}
