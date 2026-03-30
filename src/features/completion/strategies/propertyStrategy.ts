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
 * JDK 类型集合 - 这些类型不应该被展开
 */
const JDK_TYPES = new Set([
  // Wrapper types
  'java.lang.String', 'java.lang.Integer', 'java.lang.Long',
  'java.lang.Boolean', 'java.lang.Double', 'java.lang.Float',
  'java.lang.Short', 'java.lang.Byte', 'java.lang.Character',
  'java.math.BigDecimal', 'java.math.BigInteger',
  // Date/Time types
  'java.util.Date', 'java.time.LocalDate', 'java.time.LocalDateTime',
  'java.time.LocalTime', 'java.time.Instant', 'java.time.ZonedDateTime',
  // Collection interfaces (we want the generic type, not these)
  'java.util.List', 'java.util.Set', 'java.util.Map',
  'java.util.Collection', 'java.util.Iterable',
  // Primitives
  'int', 'long', 'boolean', 'double', 'float', 'short', 'byte', 'char',
  // Common simple names
  'String', 'Integer', 'Long', 'Boolean', 'Double', 'Float',
  'Short', 'Byte', 'Character', 'BigDecimal', 'BigInteger',
  'Date', 'LocalDate', 'LocalDateTime', 'LocalTime', 'Instant', 'ZonedDateTime'
]);

/**
 * 属性路径解析结果
 */
interface PropertyPathResult {
  /** 根对象名 */
  rootObject: string;
  /** 属性路径（已解析的部分） */
  propertyPath: string[];
  /** 部分输入（用于过滤） */
  partial: string;
}

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

  /** 最大属性深度（基于项目大小的自适应策略） */
  private maxDepth: number;

  /**
   * 构造函数
   * 
   * @param javaParser - Java 方法解析器，用于获取对象属性
   */
  constructor(javaParser: JavaMethodParser, maxDepth = 2) {
    super();
    this.javaParser = javaParser;
    this.maxDepth = maxDepth;
  }

  /**
   * 判断是否可以提供补全
   *
   * 条件：
   * - 行前缀匹配 #{xxx. 或 ${xxx.（后面可以跟任意字符用于过滤）
   * - xxx 是有效的参数名，支持多级属性如 user.address.city
   *
   * @param context - 补全上下文
   * @returns 是否可以补全
   */
  canComplete(context: CompletionContext): boolean {
    // 匹配多级属性模式：#{xxx.yyy. 或 ${xxx.yyy.
    // 支持：#{user. | #{user.address. | #{user.address.ci | #{user.roles[0].
    // [\w.\[\]]+ 支持数组索引语法如 [0]、[1]
    const pattern = /#\{([\w.\[\]]+)\.[\w]*$/;
    const altPattern = /\$\{([\w.\[\]]+)\.[\w]*$/;

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
    // 解析属性路径
    const pathResult = this.parsePropertyPath(context.linePrefix);

    logger.debug(`PropertyStrategy: parsing property path from "${context.linePrefix}" ->`, pathResult);

    if (!pathResult || !context.javaMethod) {
      logger.debug(`PropertyStrategy: no path result or java method. pathResult=${!!pathResult}, hasMethod=${!!context.javaMethod}`);
      return [];
    }

    const { rootObject, propertyPath } = pathResult;

    // 在参数列表中查找根对象
    const param = this.findParameterByName(context.javaMethod.parameters, rootObject);

    logger.debug(`PropertyStrategy: found param for "${rootObject}":`, param);

    if (!param) {
      logger.debug(`PropertyStrategy: parameter "${rootObject}" not found in method parameters`);
      return [];
    }

    // 获取嵌套属性（支持多级）
    logger.debug(`PropertyStrategy: getting nested properties for type "${param.type}", path:`, propertyPath);
    const properties = await this.getNestedProperties(param.type, propertyPath, new Set(), 0, this.maxDepth);

    logger.debug(`PropertyStrategy: got ${properties.length} properties:`, properties);

    // 创建补全项
    return this.createPropertyItems(properties, param, propertyPath);
  }

  /**
   * 解析属性路径
   *
   * 支持格式：
   * - #{user. → { rootObject: "user", propertyPath: [], partial: "" }
   * - #{user.address. → { rootObject: "user", propertyPath: ["address"], partial: "" }
   * - #{user.address.ci → { rootObject: "user", propertyPath: ["address"], partial: "ci" }
   *
   * @param linePrefix - 行前缀文本
   * @returns 属性路径解析结果，如果不匹配返回 null
   */
  private parsePropertyPath(linePrefix: string): PropertyPathResult | null {
    // 匹配多级属性模式：#{xxx.yyy.zzz. 或 #{user.roles[0].
    // [\w.\[\]]+ 支持数组索引语法如 roles[0]
    const match = linePrefix.match(/#\{([\w.\[\]]+)\.([\w]*)$/) ||
                  linePrefix.match(/\$\{([\w.\[\]]+)\.([\w]*)$/);

    if (!match) {
      return null;
    }

    const fullPath = match[1];
    const partial = match[2] || '';

    // 分割路径，处理数组索引语法如 roles[0]
    // 将 roles[0] 分割为 roles 和 [0] 两部分
    const parts = fullPath.split('.').flatMap(part => {
      // 处理数组索引语法：roles[0] → ['roles', '[0]']
      const arrayMatch = part.match(/^(\w+)(\[\d+\])$/);
      if (arrayMatch) {
        return [arrayMatch[1], arrayMatch[2]];
      }
      return [part];
    });

    const rootObject = parts[0];
    const propertyPath = parts.slice(1);

    return {
      rootObject,
      propertyPath,
      partial
    };
  }

  /**
   * 获取嵌套属性列表
   *
   * 逐级解析属性类型，支持多级属性导航
   *
   * @param rootType - 根对象类型
   * @param propertyPath - 属性路径（如 ["address"]）
   * @param visitedTypes - 已访问的类型集合（防止循环引用）
   * @param currentDepth - 当前深度
   * @param maxDepth - 最大深度限制
   * @returns 属性名列表
   */
  private async getNestedProperties(
    rootType: string,
    propertyPath: string[],
    visitedTypes = new Set<string>(),
    currentDepth = 0,
    maxDepth = 2
  ): Promise<Array<{ name: string; type: string }>> {
    // 深度限制
    if (currentDepth >= maxDepth) {
      logger.debug(`PropertyStrategy: max depth ${maxDepth} reached`);
      return [];
    }

    // 循环引用检测
    if (visitedTypes.has(rootType)) {
      logger.debug(`PropertyStrategy: circular reference detected for type ${rootType}`);
      return [];
    }

    // 标记当前类型为已访问
    visitedTypes.add(rootType);

    let currentType = rootType;

    // 逐级解析属性路径
    for (const propName of propertyPath) {
      // 处理数组索引语法如 [0]、[1]
      if (propName.startsWith('[') && propName.endsWith(']')) {
        // 数组索引，提取集合的泛型参数
        const elementType = this.extractCollectionElementType(currentType);
        if (elementType) {
          currentType = elementType;
          // 检查元素类型是否是 JDK 类型
          if (this.isJdkType(currentType)) {
            logger.debug(`PropertyStrategy: JDK element type ${currentType} reached, stopping navigation`);
            return [];
          }
          continue;
        }
        logger.debug(`PropertyStrategy: cannot extract element type from ${currentType}`);
        return [];
      }

      // 获取当前类型的属性
      const properties = await this.javaParser.getObjectProperties?.(currentType) ?? [];

      // 查找当前属性
      const prop = properties.find(p => p.name === propName);
      if (!prop) {
        logger.debug(`PropertyStrategy: property "${propName}" not found in type ${currentType}`);
        return [];
      }

      // 更新当前类型为属性类型
      currentType = prop.type;

      // 检查是否是 JDK 类型
      if (this.isJdkType(currentType)) {
        logger.debug(`PropertyStrategy: JDK type ${currentType} reached, stopping navigation`);
        return [];
      }
    }

    // 获取最终类型的属性列表
    const finalProperties = await this.javaParser.getObjectProperties?.(currentType) ?? [];

    // 过滤掉 JDK 类型，但保留类型信息用于后续判断
    return finalProperties.map(prop => ({
      name: prop.name,
      type: prop.type || 'Object'
    }));
  }

  /**
   * 从集合类型中提取元素类型
   *
   * 支持：
   * - List<User> → User
   * - Set<String> → String
   * - Map<K, V> → V (value 类型)
   * - 数组类型 User[] → User
   *
   * @param typeName - 类型名（如 List<User>）
   * @returns 元素类型名，如果不是集合类型返回 null
   */
  private extractCollectionElementType(typeName: string): string | null {
    if (!typeName) {
      return null;
    }

    // 处理数组类型：User[] → User
    if (typeName.endsWith('[]')) {
      return typeName.slice(0, -2);
    }

    // 提取泛型参数：<User>
    const genericMatch = typeName.match(/<(.*)>$/);
    if (!genericMatch) {
      return null;
    }

    const genericContent = genericMatch[1].trim();

    // 处理 Map<K, V>：返回 value 类型 V
    if (typeName.startsWith('java.util.Map') || typeName.startsWith('Map<')) {
      const mapMatch = genericContent.match(/^([^,]+),\s*(.+)$/);
      if (mapMatch) {
        return mapMatch[2].trim(); // 返回 value 类型
      }
      return null;
    }

    // 处理单泛型参数集合：List<User>, Set<User> 等
    // 取第一个（也是唯一一个）泛型参数
    const elementType = genericContent.split(',')[0].trim();
    return elementType || null;
  }

  /**
   * 检查类型是否是 JDK 类型（不应该展开）
   *
   * @param typeName - 类型名
   * @returns 是否是 JDK 类型
   */
  private isJdkType(typeName: string): boolean {
    if (!typeName) {
      return true;
    }

    // 处理泛型：List<String> → List
    const baseType = typeName.split('<')[0].trim();

    // 检查是否是 JDK 类型
    if (JDK_TYPES.has(baseType)) {
      return true;
    }

    // 检查是否以 java. 或 javax. 开头
    if (baseType.startsWith('java.') || baseType.startsWith('javax.')) {
      return true;
    }

    // 检查是否是数组类型（基本类型数组）
    if (baseType.endsWith('[]')) {
      const elementType = baseType.slice(0, -2);
      return JDK_TYPES.has(elementType) || this.isPrimitiveType(elementType);
    }

    return false;
  }

  /**
   * 检查是否是基本类型
   *
   * @param typeName - 类型名
   * @returns 是否是基本类型
   */
  private isPrimitiveType(typeName: string): boolean {
    const primitives = ['int', 'long', 'boolean', 'double', 'float', 'short', 'byte', 'char'];
    return primitives.includes(typeName);
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
   * @param properties - 属性列表（包含名称和类型）
   * @param param - 参数信息（用于显示详情）
   * @param propertyPath - 属性路径前缀
   * @returns 补全项列表
   */
  private createPropertyItems(
    properties: Array<{ name: string; type: string }>,
    param: JavaParameter,
    propertyPath: string[] = []
  ): vscode.CompletionItem[] {
    // 构建完整路径前缀
    const pathPrefix = propertyPath.length > 0 ? propertyPath.join('.') + '.' : '';

    return properties.map((prop, index) => {
      const fullPropName = pathPrefix + prop.name;
      const isJdkType = this.isJdkType(prop.type);

      const docs = new vscode.MarkdownString();
      docs.appendMarkdown(`**Property of \`${param.type}\`**\n\n`);
      docs.appendMarkdown(`**Type:** \`${prop.type}\`\n\n`);
      if (isJdkType) {
        docs.appendMarkdown(`*(JDK type - no further expansion)*`);
      }

      // 根据类型选择补全项类型
      const kind = isJdkType
        ? vscode.CompletionItemKind.Property
        : vscode.CompletionItemKind.Field;

      // 构建插入文本
      const insertText = prop.name;

      return this.createItem(fullPropName, {
        kind,
        detail: `${this.extractSimpleTypeName(prop.type)} ${prop.name}`,
        documentation: docs,
        insertText,
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
