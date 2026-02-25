import * as vscode from 'vscode';

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
  type: 'select' | 'insert' | 'update' | 'delete';
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


