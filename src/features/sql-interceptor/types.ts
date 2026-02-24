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
   * 例如: "([^\\(]+)\\(([^\\)]+)\\)" 匹配 "value(type)"
   * 
   * 如果日志中没有类型信息，可以使用 "paramValueOnlyRegex" 选项
   */
  paramParseRegex?: string;

  /**
   * 只提取参数值的正则（当日志中没有类型信息时使用）
   * 例如: "(\\d+)" 只提取数字
   * 此时 type 会被设置为 "unknown"
   */
  paramValueOnlyRegex?: string;

  /**
   * 参数类型映射（用于处理特殊类型）
   * 例如: { "integer": "int", "string": "varchar" }
   */
  paramTypeMapping?: Record<string, string>;

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
  /** 
   * 监听模式选择
   * - 'auto': 自动根据 java.debug.settings.console 配置选择
   * - 'debugConsole': 强制监听 Debug Console
   * - 'terminal': 强制监听 Terminal
   */
  listenMode: 'auto' | 'debugConsole' | 'terminal';
  /** 终端匹配模式（用于过滤哪些终端需要监听） */
  terminalFilter?: string;
  /** 
   * 是否自动启动监听
   * - true: 插件激活时自动启动
   * - false: 用户需要手动点击启动按钮
   */
  autoStart: boolean;
  /** 
   * 自动滚动行为
   * - 'always': 总是自动滚动到最新 SQL
   * - 'onlyWhenNotInteracting': 仅在用户没有交互时自动滚动
   * - 'never': 从不自动滚动
   */
  autoScrollBehavior: 'always' | 'onlyWhenNotInteracting' | 'never';
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
