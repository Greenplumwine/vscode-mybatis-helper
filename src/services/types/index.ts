/**
 * 服务层类型定义
 *
 * @author MyBatis Helper Team
 * @version 1.0.0
 */

import * as vscode from "vscode";

// ============================================================================
// DTD 解析器相关类型
// ============================================================================

/**
 * DTD 加载器接口
 * 策略模式：定义 DTD 加载策略
 */
export interface IDtdLoader {
  /**
   * 检查是否可以加载指定的 DTD 路径
   */
  canLoad(dtdPath: string): boolean;

  /**
   * 加载 DTD 内容
   */
  load(dtdPath: string): Promise<DtdLoaderResult>;
}

/**
 * DTD 加载结果
 */
export interface DtdLoaderResult {
  /** 是否成功 */
  success: boolean;
  /** DTD 内容 */
  content?: string;
  /** 错误信息 */
  error?: string;
  /** 加载器类型 */
  loaderType: string;
}

/**
 * 标签层次结构
 */
export interface TagHierarchy {
  /** 标签名称 */
  tagName: string;
  /** 允许的子标签 */
  allowedChildren: string[];
  /** 允许的父标签 */
  allowedParents: string[];
  /** 必需属性 */
  requiredAttributes: string[];
  /** 可选属性 */
  optionalAttributes: string[];
  /** 是否可以有文本内容 */
  canHaveText: boolean;
  /** 是否可以包含 SQL */
  canHaveSql: boolean;
}

/**
 * 标签层次结构映射
 */
export type TagHierarchyMap = Map<string, TagHierarchy>;

// ============================================================================
// MyBatis XML 解析相关类型
// ============================================================================

/**
 * MyBatis 标签类型枚举
 */
export enum MyBatisTagType {
  MAPPER = "mapper",
  SELECT = "select",
  INSERT = "insert",
  UPDATE = "update",
  DELETE = "delete",
  RESULT_MAP = "resultMap",
  SQL = "sql",
  IF = "if",
  CHOOSE = "choose",
  WHEN = "when",
  OTHERWISE = "otherwise",
  FOREACH = "foreach",
  WHERE = "where",
  SET = "set",
  TRIM = "trim",
  INCLUDE = "include",
  BIND = "bind",
}

/**
 * MyBatis 属性定义
 */
export interface MyBatisAttribute {
  /** 属性名称 */
  name: string;
  /** 属性值 */
  value: string;
  /** 属性位置 */
  position?: vscode.Position;
}

/**
 * SQL 语句信息
 */
export interface SqlStatementInfo {
  /** 语句 ID */
  id: string;
  /** 语句类型 */
  type: MyBatisTagType;
  /** 参数类型 */
  parameterType?: string;
  /** 返回类型 */
  resultType?: string;
  /** 语句内容 */
  content: string;
  /** 在文件中的位置 */
  position: vscode.Position;
  /** 结束位置 */
  endPosition?: vscode.Position;
}

/**
 * ResultMap 信息
 */
export interface ResultMapInfo {
  /** ResultMap ID */
  id: string;
  /** 类型 */
  type: string;
  /** 扩展的 ResultMap */
  extends?: string;
  /** 映射列表 */
  mappings: Array<{
    column: string;
    property: string;
    jdbcType?: string;
  }>;
}

/**
 * SQL 片段信息
 */
export interface SqlFragmentInfo {
  /** 片段 ID */
  id: string;
  /** 片段内容 */
  content: string;
  /** 在文件中的位置 */
  position: vscode.Position;
}

/**
 * MyBatis XML 文件信息
 */
export interface MyBatisXmlInfo {
  /** 文件路径 */
  filePath: string;
  /** 命名空间 */
  namespace: string;
  /** SQL 语句列表 */
  statements: SqlStatementInfo[];
  /** ResultMap 列表 */
  resultMaps: ResultMapInfo[];
  /** SQL 片段列表 */
  sqlFragments: SqlFragmentInfo[];
}

// ============================================================================
// Java 解析相关类型
// ============================================================================

/**
 * Java 方法参数信息
 */
export interface JavaParameter {
  /** 参数名称 */
  name: string;
  /** 参数类型 */
  type: string;
  /** 是否有 @Param 注解 */
  hasParamAnnotation?: boolean;
  /** @Param 注解值 */
  paramValue?: string;
}

/**
 * Java 方法信息
 */
export interface JavaMethodInfo {
  /** 方法名称 */
  name: string;
  /** 返回类型 */
  returnType: string;
  /** 参数列表 */
  parameters: JavaParameter[];
  /** 方法签名 */
  signature: string;
  /** 在文件中的位置 */
  position: vscode.Position;
  /** 是否是默认方法 */
  isDefault?: boolean;
}

/**
 * Java Mapper 接口信息
 */
export interface JavaMapperInfo {
  /** 文件路径 */
  filePath: string;
  /** 类名（全限定名） */
  className: string;
  /** 包名 */
  packageName: string;
  /** 导入的类 */
  imports: string[];
  /** 方法列表 */
  methods: JavaMethodInfo[];
}

// ============================================================================
// 模板引擎相关类型
// ============================================================================

/**
 * 模板类型枚举
 */
export enum TemplateType {
  MAPPER_XML = "mapperXml",
  SELECT_METHOD = "selectMethod",
  INSERT_METHOD = "insertMethod",
  UPDATE_METHOD = "updateMethod",
  DELETE_METHOD = "deleteMethod",
  RESULT_MAP = "resultMap",
}

/**
 * 模板上下文
 */
export interface TemplateContext {
  /** 方法名称 */
  methodName?: string;
  /** 返回类型 */
  returnType?: string;
  /** 参数列表 */
  parameters?: JavaParameter[];
  /** 命名空间 */
  namespace?: string;
  /** 额外数据 */
  [key: string]: unknown;
}

/**
 * 模板渲染结果
 */
export interface TemplateRenderResult {
  /** 是否成功 */
  success: boolean;
  /** 渲染内容 */
  content?: string;
  /** 错误信息 */
  error?: string;
}

/**
 * 模板引擎接口
 */
export interface ITemplateEngine {
  /**
   * 渲染模板
   * @param type 模板类型
   * @param context 模板上下文
   */
  render(type: TemplateType, context: TemplateContext): TemplateRenderResult;

  /**
   * 注册自定义模板
   * @param type 模板类型
   * @param template 模板字符串
   */
  registerTemplate(type: TemplateType, template: string): void;
}

// ============================================================================
// 语言检测相关类型
// ============================================================================

/**
 * 语言类型枚举
 */
export enum LanguageType {
  JAVA = "java",
  XML = "xml",
  SQL = "sql",
  UNKNOWN = "unknown",
}

/**
 * 文件类型检测结果
 */
export interface LanguageDetectionResult {
  /** 检测到的语言类型 */
  language: LanguageType;
  /** 置信度 0-1 */
  confidence: number;
  /** 额外信息 */
  metadata?: Record<string, unknown>;
}

/**
 * 语言检测策略接口
 */
export interface ILanguageDetectionStrategy {
  /**
   * 检测语言类型
   * @param document 文档
   * @param position 位置（可选）
   */
  detect(
    document: vscode.TextDocument,
    position?: vscode.Position,
  ): LanguageDetectionResult | null;
}
