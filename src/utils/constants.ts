/**
 * 常量定义文件
 * 集中管理所有硬编码的常量值
 */

/**
 * 时间相关常量（毫秒）
 */
export const TIME = {
  /** 1秒 */
  SECOND: 1000,
  /** 5秒 */
  FIVE_SECONDS: 5000,
  /** 10秒 */
  TEN_SECONDS: 10000,
  /** 30秒（高亮缓存TTL） */
  THIRTY_SECONDS: 30000,
  /** 1分钟 */
  MINUTE: 60 * 1000,
  /** 5分钟（配置缓存TTL） */
  FIVE_MINUTES: 5 * 60 * 1000,
  /** 30分钟（默认缓存TTL） */
  THIRTY_MINUTES: 30 * 60 * 1000,
  /** 1.5秒（通知显示时间） */
  NOTIFICATION_DURATION: 1500,
  /** 3秒（启动延迟） */
  STARTUP_DELAY: 3000,
  /** 默认批处理延迟 */
  BATCH_DELAY: 100,
  /** 防抖/节流默认等待时间 */
  DEBOUNCE_WAIT: 300,
  /** 行缓冲超时 */
  LINE_BUFFER_TIMEOUT: 5000,
  /** 重复SQL检测时间窗口 */
  DUPLICATE_CHECK_WINDOW: 100,
} as const;

/**
 * 性能阈值常量
 */
export const THRESHOLDS = {
  /** 慢操作阈值（毫秒） */
  SLOW_OPERATION: 500,
  /** 慢查询阈值（毫秒） */
  SLOW_QUERY: 1000,
  /** 参数批处理大小 */
  PARAM_BATCH_SIZE: 100,
  /** 参数数量上限警告 */
  MAX_PARAM_COUNT: 1000,
  /** 日志字符串截断长度（长） */
  LOG_TRUNCATE_LONG: 100,
  /** 日志字符串截断长度（短） */
  LOG_TRUNCATE_SHORT: 50,
  /** SQL显示截断长度 */
  SQL_DISPLAY_TRUNCATE: 50,
  /** 最大最近映射缓存数 */
  MAX_RECENT_MAPPINGS: 20,
  /** 最大行间隔（秒） */
  MAX_LINE_GAP: 5,
} as const;

/**
 * 文件扫描限制常量
 */
export const SCAN_LIMITS = {
  /** 默认最大XML文件数 */
  DEFAULT_MAX_XML_FILES: 2000,
  /** 默认最大Java文件数 */
  DEFAULT_MAX_JAVA_FILES: 5000,
  /** 企业级最大XML文件数 */
  ENTERPRISE_MAX_XML_FILES: 5000,
  /** 企业级最大Java文件数 */
  ENTERPRISE_MAX_JAVA_FILES: 10000,
  /** 批处理大小 */
  BATCH_SIZE: 50,
  /** 并行限制 */
  PARALLEL_LIMIT: 10,
  /** 类文件扫描限制 */
  CLASS_FILE_SCAN_LIMIT: 100,
  /** JAR配置类扫描限制 */
  JAR_CONFIG_SCAN_LIMIT: 5,
} as const;

/**
 * 缓存大小限制
 */
export const CACHE_LIMITS = {
  /** 默认最大历史记录数 */
  DEFAULT_MAX_HISTORY: 500,
  /** 最大历史记录数配置上限 */
  MAX_HISTORY_SIZE: 10000,
  /** 映射统计最大方法数 */
  MAX_METHODS_IN_STATS: 100,
} as const;

/**
 * 正则表达式相关常量
 */
export const REGEX = {
  /** 参数匹配正则 */
  PARAM_PATTERN: /([^,]+)\(([^)]+)\)/g,
  /** 数组类型检测 */
  ARRAY_TYPE_PATTERN: /array|list/i,
} as const;
