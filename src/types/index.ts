/**
 * 插件核心类型定义
 */

/**
 * SQL查询接口
 * 用于存储完整的SQL查询信息，包括准备语句、参数、执行时间等
 */
export interface SQLQuery {
	/** 查询唯一标识符 */
	id: string;
	/** SQL准备语句 */
	preparing: string;
	/** 查询参数列表 */
	parameters?: Array<{ 
		/** 参数值 */
		value: string; 
		/** 参数类型 */
		type: string 
	}>;
	/** 执行时间（毫秒） */
	executedTime?: number;
	/** 完整的SQL语句（替换参数后） */
	fullSQL?: string;
	/** 查询执行时间戳 */
	timestamp?: Date;
	/** 格式化后的SQL语句 */
	formattedSQL?: string;
	/** 高亮显示的SQL语句 */
	highlightedSQL?: string;
	/** 操作类型（SELECT/INSERT/UPDATE/DELETE） */
	operationType?: string;
	/** 处理时间 */
	processedAt?: string;
	/** 执行错误信息 */
	error?: string;
}

/**
 * 数据库类型枚举
 * 支持的数据库类型列表
 */
export enum DatabaseType {
	/** MySQL数据库 */
	MYSQL = "mysql",
	/** PostgreSQL数据库 */
	POSTGRESQL = "postgresql",
	/** Oracle数据库 */
	ORACLE = "oracle",
	/** SQL Server数据库 */
	SQLSERVER = "sqlserver",
	/** 达梦数据库 */
	DM = "dm",
	/** 金仓数据库 */
	KINGBASEES = "kingbasees",
	/** 其他数据库类型 */
	OTHER = "other",
}

/**
 * 文件打开模式枚举
 * 定义文件打开的不同模式
 */
export enum FileOpenMode {
	/** 使用已打开的窗口，如果不存在则不拆分窗口 */
	USE_EXISTING = "useExisting",
	/** 始终不拆分窗口 */
	NO_SPLIT = "noSplit",
	/** 始终拆分窗口 */
	ALWAYS_SPLIT = "alwaysSplit",
}

/**
 * 名称匹配规则配置接口
 * 用于定义Java Mapper和XML文件之间的名称匹配规则
 */
export interface NameMatchingRule {
	/** 规则名称 */
	name: string;
	/** 是否启用该规则 */
	enabled: boolean;
	/** Java文件名模式（支持正则表达式） */
	javaPattern: string;
	/** XML文件名模式（支持正则表达式，可使用${javaName}变量） */
	xmlPattern: string;
	/** 规则描述 */
	description?: string;
}

/**
 * 路径优先级配置接口
 * 用于配置文件搜索时的路径优先级
 */
export interface PathPriorityConfig {
	/** 优先搜索的目录列表 */
	priorityDirectories: string[];
	/** 排除搜索的目录列表 */
	excludeDirectories: string[];
	/** 是否启用路径优先级排序 */
	enabled: boolean;
}

/**
 * 插件配置接口
 * 定义插件的所有配置选项
 */
export interface PluginConfig {
	/** 数据库类型 */
	databaseType: DatabaseType;
	/** 自定义XML目录列表 */
	customXmlDirectories: string[];
	/** 文件打开模式 */
	fileOpenMode: FileOpenMode;
	/** 日志输出级别 */
	logOutputLevel: 'debug' | 'info' | 'warn' | 'error';
	/** 最大历史记录大小 */
	maxHistorySize: number;
	/** 是否显示执行时间 */
	showExecutionTime: boolean;

	/** 自定义名称匹配规则列表 */
	nameMatchingRules: NameMatchingRule[];
	/** 忽略的后缀列表 */
	ignoreSuffixes: string[];
	/** 路径优先级配置 */
	pathPriority: PathPriorityConfig;
}