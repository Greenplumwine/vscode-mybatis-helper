/**
 * Java 类型补全策略
 * 
 * 设计模式：
 * - 策略模式 (Strategy Pattern): 实现 CompletionStrategy 接口
 * - 模板方法模式 (Template Method Pattern): 继承 BaseCompletionStrategy
 * 
 * 功能：在 resultType/parameterType/javaType/ofType 等属性中提供类名补全
 * 
 * @module features/completion/strategies/typeStrategy
 */

import * as vscode from 'vscode';
import { BaseCompletionStrategy } from './baseStrategy';
import { CompletionContext, JavaMethodParser, ClassInfo } from '../types';

/**
 * Java 类型补全策略
 * 
 * 触发条件：
 * - 在 resultType="、parameterType="、javaType="、ofType=" 属性值中输入
 * 
 * 提供内容：
 * - 项目中的 Java 类名
 * - 常用类型（String, Integer, Long, Date 等）优先排序
 * 
 * @example
 * ```xml
 * <!-- 在 resultType=" 后提供的补全 -->
 * <select id="findById" resultType="User">
 * <!-- 提供：com.example.User, java.lang.String 等 -->
 * ```
 */
export class TypeStrategy extends BaseCompletionStrategy {
  /** 
   * 触发字符：双引号和单引号
   */
  readonly triggerCharacters = ['"', "'"] as const;
  
  /**
   * 优先级：100（最高）
   * 
   * 类型补全是精确匹配场景，应该最高优先级
   */
  readonly priority = 100;
  
  /** 策略名称 */
  readonly name = 'Type';
  
  /**
   * 触发此策略的属性列表
   */
  private static readonly TYPE_ATTRIBUTES = [
    'resultType',
    'parameterType', 
    'javaType',
    'ofType',
    'type' // for resultMap
  ] as const;
  
  /**
   * 常用类型列表（优先排序）
   */
  private static readonly COMMON_TYPES = [
    'java.lang.String',
    'java.lang.Integer',
    'java.lang.Long',
    'java.lang.Boolean',
    'java.lang.Double',
    'java.util.Date',
    'java.time.LocalDate',
    'java.time.LocalDateTime',
    'java.math.BigDecimal',
    'java.util.List',
    'java.util.Map',
    'java.util.HashMap',
    'java.util.ArrayList'
  ];
  
  /** Java 方法解析器 */
  private javaParser: JavaMethodParser;

  /**
   * 构造函数
   * 
   * @param javaParser - Java 方法解析器
   */
  constructor(javaParser: JavaMethodParser) {
    super();
    this.javaParser = javaParser;
  }

  /**
   * 判断是否可以提供补全
   * 
   * 条件：光标在 TYPE_ATTRIBUTES 列表中的某个属性值内
   * 
   * @param context - 补全上下文
   * @returns 是否可以补全
   */
  canComplete(context: CompletionContext): boolean {
    return this.isInAttribute(context, TypeStrategy.TYPE_ATTRIBUTES);
  }

  /**
   * 提供补全项
   * 
   * @param context - 补全上下文
   * @returns 类型补全项列表
   */
  async provideCompletionItems(
    context: CompletionContext
  ): Promise<vscode.CompletionItem[]> {
    const partial = this.extractPartialValue(context);
    
    try {
      // 获取项目中的所有类（如果方法存在）
      const classes = await this.javaParser.scanProjectClasses?.() ?? [];
      
      // 过滤并排序
      const filtered = this.filterAndSortClasses(classes, partial);
      
      // 创建补全项
      return this.createTypeItems(filtered);
    } catch (error) {
      // 如果扫描失败，返回常用类型
      return this.createCommonTypeItems(partial);
    }
  }

  /**
   * 过滤并排序类列表
   * 
   * 排序策略：
   * 1. 完全匹配优先
   * 2. 前缀匹配其次
   * 3. 常用类型优先
   * 4. 简单名匹配优先于全限定名匹配
   * 5. 字母顺序
   * 
   * 算法：自定义排序比较器
   * 时间复杂度：O(n log n)
   * 
   * @param classes - 类列表
   * @param partial - 用户输入的部分值
   * @returns 过滤并排序后的类列表
   */
  private filterAndSortClasses(
    classes: ClassInfo[],
    partial: string
  ): ClassInfo[] {
    const lowerPartial = partial.toLowerCase();
    
    return classes
      .filter(cls => {
        // 简单名或全限定名包含输入内容
        return cls.simpleName.toLowerCase().includes(lowerPartial) ||
               cls.fullyQualifiedName.toLowerCase().includes(lowerPartial);
      })
      .sort((a, b) => {
        const aSimple = a.simpleName.toLowerCase();
        const bSimple = b.simpleName.toLowerCase();
        const aFull = a.fullyQualifiedName.toLowerCase();
        const bFull = b.fullyQualifiedName.toLowerCase();
        
        // 1. 完全匹配优先
        const aExact = aSimple === lowerPartial || aFull === lowerPartial;
        const bExact = bSimple === lowerPartial || bFull === lowerPartial;
        if (aExact && !bExact) return -1;
        if (!aExact && bExact) return 1;
        
        // 2. 前缀匹配优先
        const aPrefix = aSimple.startsWith(lowerPartial);
        const bPrefix = bSimple.startsWith(lowerPartial);
        if (aPrefix && !bPrefix) return -1;
        if (!aPrefix && bPrefix) return 1;
        
        // 3. 常用类型优先
        const aCommon = TypeStrategy.COMMON_TYPES.includes(a.fullyQualifiedName);
        const bCommon = TypeStrategy.COMMON_TYPES.includes(b.fullyQualifiedName);
        if (aCommon && !bCommon) return -1;
        if (!aCommon && bCommon) return 1;
        
        // 4. 简单名匹配优先于全限定名匹配
        const aSimpleMatch = aSimple.includes(lowerPartial);
        const bSimpleMatch = bSimple.includes(lowerPartial);
        if (aSimpleMatch && !bSimpleMatch) return -1;
        if (!aSimpleMatch && bSimpleMatch) return 1;
        
        // 5. 字母顺序
        return aSimple.localeCompare(bSimple);
      });
  }

  /**
   * 创建类型补全项列表
   * 
   * @param classes - 类信息列表
   * @returns 补全项列表
   */
  private createTypeItems(classes: ClassInfo[]): vscode.CompletionItem[] {
    return classes.map((cls, index) => {
      const isCommon = TypeStrategy.COMMON_TYPES.includes(cls.fullyQualifiedName);
      
      return this.createItem(cls.simpleName, {
        kind: vscode.CompletionItemKind.Class,
        detail: cls.fullyQualifiedName,
        documentation: this.buildTypeDocumentation(cls, isCommon),
        insertText: cls.fullyQualifiedName,
        sortText: this.calculateSortText(index, isCommon)
      });
    });
  }

  /**
   * 创建常用类型补全项（降级方案）
   * 
   * @param partial - 部分输入
   * @returns 常用类型补全项
   */
  private createCommonTypeItems(partial: string): vscode.CompletionItem[] {
    const lowerPartial = partial.toLowerCase();
    
    return TypeStrategy.COMMON_TYPES
      .filter(type => type.toLowerCase().includes(lowerPartial))
      .map((type, index) => {
        const simpleName = type.substring(type.lastIndexOf('.') + 1);
        
        return this.createItem(simpleName, {
          kind: vscode.CompletionItemKind.Class,
          detail: type,
          insertText: type,
          sortText: `0${index.toString().padStart(3, '0')}`
        });
      });
  }

  /**
   * 构建类型文档
   * 
   * @param cls - 类信息
   * @param isCommon - 是否为常用类型
   * @returns Markdown 文档
   */
  private buildTypeDocumentation(cls: ClassInfo, isCommon: boolean): vscode.MarkdownString {
    const docs = new vscode.MarkdownString();
    
    // 代码块显示全限定名
    docs.appendCodeblock(cls.fullyQualifiedName, 'java');
    
    // 包信息
    if (cls.package) {
      docs.appendMarkdown(`\n\n**Package:** \`${cls.package}\``);
    }
    
    // 常用类型标记
    if (isCommon) {
      docs.appendMarkdown(`\n\n⭐ **Commonly used type**`);
    }
    
    return docs;
  }

  /**
   * 计算排序文本
   * 
   * 确保常用类型排在前面
   * 
   * @param index - 原始索引
   * @param isCommon - 是否为常用类型
   * @returns 排序文本
   */
  private calculateSortText(index: number, isCommon: boolean): string {
    const prefix = isCommon ? '0' : '1';
    return `${prefix}${index.toString().padStart(4, '0')}`;
  }
}
