/**
 * SQL 日志拦截器类型定义
 */

/**
 * SQL 拦截规则
 */
export interface SQLInterceptorRule {
  /** 规则名称 */
  name: string;
  /** 是否启用 */
  enabled: boolean;
  /** 规则描述 */
  description?: string;
  
  // ========== 匹配规则 ==========
  /** 
   * 匹配日志行的正则表达式
   * 如果匹配，则该日志行会被送入 SQL 解析流程
   */
  lineMatchRegex: string;
  
  /** 
   * 提取 SQL 语句的正则表达式
   * 必须包含一个捕获组用于提取 SQL
   * 例如: "Preparing:\\s*(.+)"
   */
  sqlExtractRegex: string;
  
  /** 
   * 提取参数的正则表达式
   * 必须包含一个捕获组用于提取参数字符串
   * 例如: "Parameters:\\s*(.+)"
   */
  parametersExtractRegex?: string;
  
  /**
   * 提取执行时间的正则表达式
   * 必须包含一个捕获组用于提取时间（毫秒）
   * 例如: "Executed in\\s*(\\d+)ms"
   */
  executionTimeExtractRegex?: string;
  
  // ========== 参数解析 ==========
  /**
   * 参数分隔正则
   * 用于将参数字符串分割成单独的参数
   * 默认: "\\s*,\\s*"
   */
  paramSplitRegex?: string;
  
  /**
   * 单个参数解析正则
   * 用于从参数项中提取值和类型
   * 必须包含两个捕获组：值和类型
   * 例如: "([^\\(]+)\\(([^\\)]+)\\)"
   */
  paramParseRegex?: string;
  
  // ========== 高级选项 ==========
  /**
   * SQL 和参数是否在同一行
   * 如果为 true，则使用 sqlExtractRegex 提取 SQL，parametersExtractRegex 提取参数
   * 如果为 false，则 SQL 和参数可能在不同行，需要跨行匹配
   */
  singleLineMode?: boolean;
  
  /**
   * 多行模式下，SQL 和参数的最大间隔行数
   * 默认: 5
   */
  maxLineGap?: number;
}

/**
 * SQL 查询记录
 */
export interface SQLQueryRecord {
  /** 唯一标识 */
  id: string;
  /** 原始 SQL（带 ? 占位符） */
  rawSQL?: string;
  /** 完整 SQL（参数已填充） */
  fullSQL?: string;
  /** 格式化后的 SQL */
  formattedSQL?: string;
  /** 参数列表 */
  parameters?: Array<{
    value: string;
    type: string;
  }>;
  /** 执行时间（毫秒） */
  executionTime?: number;
  /** 数据源（debug console / terminal） */
  source: 'debug' | 'terminal';
  /** 时间戳 */
  timestamp: Date;
  /** 匹配的规则名称 */
  matchedRule: string;
}

/**
 * SQL 拦截器配置
 */
export interface SQLInterceptorConfig {
  /** 是否启用 */
  enabled: boolean;
  /** 最大历史记录数 */
  maxHistorySize: number;
  /** 是否显示执行时间 */
  showExecutionTime: boolean;
  /** 数据库类型 */
  databaseType: string;
  /** 自定义规则列表 */
  customRules: SQLInterceptorRule[];
  /** 
   * 内置规则启用状态
   * key: 规则名称, value: 是否启用
   */
  builtinRules: Record<string, boolean>;
  /** 是否监听调试控制台 */
  listenDebugConsole: boolean;
  /** 是否监听终端 */
  listenTerminal: boolean;
  /** 终端匹配模式（用于过滤哪些终端需要监听） */
  terminalFilter?: string;
}

/**
 * 日志行类型
 */
export type LogLineType = 'sql' | 'parameters' | 'executionTime' | 'unknown';

/**
 * 解析后的日志行
 */
export interface ParsedLogLine {
  type: LogLineType;
  content: string;
  ruleName: string;
  sql?: string;
  parameters?: string;
  executionTime?: number;
}

/**
 * SQL 拦截器事件
 */
export interface SQLInterceptorEvents {
  /** 有新的 SQL 记录 */
  onSQLRecorded: (query: SQLQueryRecord) => void;
  /** SQL 历史被清除 */
  onHistoryCleared: () => void;
  /** 拦截器状态改变 */
  onStateChanged: (enabled: boolean) => void;
}
