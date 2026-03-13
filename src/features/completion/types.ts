/**
 * 统一智能补全模块类型定义
 * 
 * 设计模式：
 * - 策略模式 (Strategy Pattern): CompletionStrategy 接口定义可互换的补全算法
 * - 工厂模式 (Factory Pattern): StrategyFactory 用于创建策略实例
 * 
 * @module features/completion/types
 */

import * as vscode from 'vscode';

/**
 * 补全策略接口
 * 
 * 所有补全策略必须实现此接口。
 * 策略按优先级排序，高优先级的策略优先匹配。
 * 
 * @example
 * ```typescript
 * class MyStrategy implements CompletionStrategy {
 *   readonly triggerCharacters = ['.'] as const;
 *   readonly priority = 80;
 *   readonly name = 'MyStrategy';
 *   
 *   canComplete(context: CompletionContext): boolean {
 *     return context.linePrefix.endsWith('.');
 *   }
 *   
 *   async provideCompletionItems(context: CompletionContext) {
 *     return [new vscode.CompletionItem('example')];
 *   }
 * }
 * ```
 */
export interface CompletionStrategy {
  /** 
   * 触发字符列表
   * 当用户输入这些字符时，会触发补全
   */
  readonly triggerCharacters: readonly string[];
  
  /** 
   * 优先级，数值越大优先级越高
   * 策略按优先级降序排列，第一个匹配的策略生效
   */
  readonly priority: number;
  
  /** 
   * 策略名称，用于日志和调试
   */
  readonly name: string;
  
  /**
   * 判断当前上下文是否支持此策略
   * 
   * @param context - 补全上下文
   * @returns 如果支持返回 true，否则返回 false
   */
  canComplete(context: CompletionContext): boolean | Promise<boolean>;
  
  /**
   * 提供补全项
   * 
   * @param context - 补全上下文
   * @returns 补全项列表
   */
  provideCompletionItems(
    context: CompletionContext
  ): Promise<vscode.CompletionItem[]>;
}

/**
 * Java 方法参数信息
 */
export interface JavaParameter {
  /** 参数名 */
  readonly name: string;
  /** 参数类型（全限定名或简名） */
  readonly type: string;
  /** 参数上的注解 */
  readonly annotations: string[];
  /** @Param 注解指定的名称 */
  readonly paramValue?: string;
}

/**
 * Java 方法信息
 */
export interface JavaMethod {
  /** 方法名 */
  readonly name: string;
  /** 返回类型 */
  readonly returnType: string;
  /** 是否返回集合 */
  readonly isCollection: boolean;
  /** 参数列表 */
  readonly parameters: JavaParameter[];
  /** 方法上的注解 */
  readonly annotations: string[];
  /** 方法在文件中的行范围 */
  readonly lineRange: { readonly start: number; readonly end: number };
}

/**
 * Foreach 上下文信息
 */
export interface ForeachContext {
  /** 集合表达式（如 list, user.ids） */
  readonly collection: string;
  /** item 变量名 */
  readonly item: string;
  /** index 变量名（可选） */
  readonly index?: string;
  /** item 类型（如 Student，用于属性补全） */
  readonly itemType?: string;
  /** 
   * 在 XML 中的位置信息
   * 用于快速判断光标是否在 foreach 内
   */
  readonly startLine: number;
  readonly endLine: number;
  /** foreach 标签的开始位置 */
  readonly tagStartPosition: number;
  /** foreach 标签的结束位置 */
  readonly tagEndPosition: number;
}

/**
 * XML Mapper 方法信息
 */
export interface XmlMapperMethod {
  /** 方法 ID（对应 SQL 标签的 id 属性） */
  readonly id: string;
  /** 标签类型：select/insert/update/delete/sql */
  readonly tagType: string;
  /** 结果类型 */
  readonly resultType?: string;
  /** 参数类型 */
  readonly parameterType?: string;
  /** 在文件中的行范围 */
  readonly lineRange: { readonly start: number; readonly end: number };
}

/**
 * XML Mapper 文件信息
 */
export interface XmlMapperInfo {
  /** 命名空间（对应 Java 接口全限定名） */
  readonly namespace: string;
  /** 方法列表 */
  readonly methods: XmlMapperMethod[];
  /** 文件路径 */
  readonly filePath: string;
}

/**
 * Java 类信息
 */
export interface ClassInfo {
  /** 简单类名 */
  readonly simpleName: string;
  /** 全限定类名 */
  readonly fullyQualifiedName: string;
  /** 包名 */
  readonly package?: string;
}

/**
 * 补全上下文
 * 
 * 包含补全所需的全部信息，由 CompletionContextBuilder 构建
 */
export interface CompletionContext {
  /** 当前文档 */
  readonly document: vscode.TextDocument;
  /** 光标位置 */
  readonly position: vscode.Position;
  /** 触发字符 */
  readonly triggerCharacter: string | undefined;
  /** 光标前行文本 */
  readonly linePrefix: string;
  /** 光标后行文本 */
  readonly lineSuffix: string;
  /** 
   * XML 解析信息（仅在 mybatis-mapper-xml 中有效）
   * 包含命名空间、方法列表等
   */
  readonly xmlInfo?: XmlMapperInfo;
  /** 
   * 当前 Java 方法信息
   * 由 XML 中的 namespace + method id 定位到对应的 Java 方法
   */
  readonly javaMethod?: JavaMethod;
  /** 
   * foreach 上下文（如果在 foreach 标签内）
   * 用于提供 item/index 变量补全
   */
  readonly foreachContext?: ForeachContext;
}

/**
 * 策略工厂接口
 * 
 * 用于创建策略实例，支持动态注册策略
 */
export interface StrategyFactory {
  /**
   * 创建策略列表
   * 
   * @param javaParser - Java 方法解析器
   * @param xmlParser - XML 解析器
   * @returns 策略实例列表
   */
  createStrategies(
    javaParser: JavaMethodParser,
    xmlParser: MyBatisXmlParser
  ): CompletionStrategy[];
}

/**
 * Java 方法解析器接口（简化版）
 * 
 * 实际实现参考 src/services/language/javaMethodParser.ts
 */
export interface JavaMethodParser {
  /**
   * 解析 Java 文件
   */
  parseJavaFile(filePath: string): Promise<any>;
  
  /**
   * 解析指定方法（可选，使用 getInstance() 方式调用）
   */
  parseMethod?(filePath: string, methodName: string): Promise<JavaMethod | null>;
  
  /**
   * 获取对象的属性列表（可选，用于 #{user.} 补全）
   */
  getObjectProperties?(className: string): Promise<string[]>;
  
  /**
   * 扫描项目中的所有类（可选，用于 resultType/parameterType 补全）
   */
  scanProjectClasses?(): Promise<ClassInfo[]>;
}

/**
 * MyBatis XML 解析器接口（简化版）
 * 
 * 实际实现参考 src/services/parsing/mybatisXmlParser.ts
 */
export interface MyBatisXmlParser {
  /**
   * 获取标签层级（实际存在的方法）
   */
  getTagHierarchy?(): any;
  
  /**
   * 检查层级是否已初始化
   */
  isHierarchyInitialized?(): boolean;
  
  /**
   * 初始化标签层级
   */
  initializeTagHierarchy?(): Promise<any>;
  
  /**
   * 解析 XML Mapper（用于上下文构建）
   */
  parseXmlMapper?(filePath: string, content: string): Promise<XmlMapperInfo>;
  
  /**
   * 查找 foreach 上下文
   */
  findForeachContext?(content: string, line: number): ForeachContext | null;
}

/**
 * 文件映射器接口（简化版）
 * 
 * 用于 Java ↔ XML 文件映射
 */
export interface FileMapper {
  /**
   * 获取所有映射（Java -> XML）
   */
  getMappings?(): Map<string, string>;
  
  /**
   * 获取反向映射（XML -> Java）
   */
  getReverseMappings?(): Map<string, string>;
  
  /**
   * 根据 Java 路径获取可能的 XML 路径
   */
  getPossibleXmlPathsPublic?(javaFilePath: string): string[];
}
