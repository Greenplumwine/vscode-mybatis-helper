import * as vscode from "vscode";

/**
 * 位置信息接口
 */
export interface Position {
  line: number;
  column: number;
}

/**
 * 方法映射接口
 * 存储 Java 方法与 XML SQL 之间的映射关系
 */
export interface MethodMapping {
  methodName: string;
  sqlId: string;
  javaPosition: Position;
  xmlPosition?: Position;
}

/**
 * Mapper 映射接口
 * 存储 Java Mapper 类与 XML 文件之间的完整映射关系
 */
export interface MapperMapping {
  className: string;
  javaPath: string;
  xmlPath?: string;
  namespace: string;
  methods: Map<string, MethodMapping>;
  lastUpdated: number;
}

/**
 * Java Mapper 信息接口
 * 扫描阶段发现的 Java Mapper 文件信息
 */
export interface JavaMapperInfo {
  filePath: string;
  className: string;
  packageName: string;
  methods: Array<{
    name: string;
    position: Position;
  }>;
}

/**
 * XML SQL 语句信息接口
 */
export interface SqlStatementInfo {
  id: string;
  type: "select" | "insert" | "update" | "delete";
  line: number;
  column: number;
}

/**
 * XML Mapper 信息接口
 * 扫描阶段发现的 XML Mapper 文件信息
 */
export interface XmlMapperInfo {
  filePath: string;
  namespace: string;
  statements: Map<string, SqlStatementInfo>;
}

/**
 * @MapperScan 配置信息接口
 */
export interface MapperScanConfig {
  basePackages: string[];
  sourceFile: string;
}

/**
 * 扫描进度事件接口
 */
export interface ScanProgressEvent {
  total: number;
  processed: number;
  currentFile?: string;
}

/**
 * 模块上下文接口
 * 表示文件所属的模块边界信息
 */
export interface ModuleContext {
  /** 模块唯一标识（相对于 workspace root 的路径） */
  moduleId: string;
  /** 模块根目录的绝对路径 */
  modulePath: string;
  /** 模块类型 */
  type: "maven" | "gradle" | "simple";
  /** 构建文件路径（如 pom.xml 或 build.gradle） */
  buildFile?: string;
  /** 源码根目录列表 */
  sourceRoots: string[];
  /** 资源根目录列表 */
  resourceRoots: string[];
}

/**
 * 查询上下文接口
 * 用于传递模块信息或参考路径以辅助歧义消解
 */
export interface QueryContext {
  /** 模块 ID（优先使用） */
  moduleId?: string;
  /** 参考文件路径（fallback 使用） */
  referencePath?: string;
}
