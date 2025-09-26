// 日志拦截相关类型
export interface LogEntry {
	timestamp: Date;
	type: "preparing" | "parameters" | "executed" | "other";
	content: string;
}

export interface SQLQuery {
	id: string;
	preparing: string;
	parameters?: Array<{ value: string; type: string }>;
	executedTime?: number;
	fullSQL?: string;
	timestamp?: Date;
	formattedSQL?: string;
	highlightedSQL?: string;
	operationType?: string;
	processedAt?: string;
	error?: string;
}

export interface SQLHistory {
	queries: SQLQuery[];
	lastUpdated: Date;
}

// 文件映射接口
export interface FileMapping {
	mapperPath: string;
	xmlPath: string;
	lastUpdated: Date;
}

// 数据库类型
export enum DatabaseType {
	MYSQL = "mysql",
	POSTGRESQL = "postgresql",
	ORACLE = "oracle",
	SQLSERVER = "sqlserver",
	DM = "dm",
	KINGBASEES = "kingbasees",
	OTHER = "other",
}

// 文件打开模式
export enum FileOpenMode {
	// 使用已打开的窗口，如果不存在则不拆分窗口
	USE_EXISTING = "useExisting",
	// 始终不拆分窗口
	NO_SPLIT = "noSplit",
	// 始终拆分窗口
	ALWAYS_SPLIT = "alwaysSplit",
}

// 插件配置
export interface PluginConfig {
	databaseType: DatabaseType;
	enableLogInterceptor: boolean;
	customLogPattern: string;
	maxHistorySize: number;
	showExecutionTime: boolean;
	fileOpenMode: FileOpenMode;
	customXmlDirectories: string[];
	logOutputLevel: "info" | "debug";
	enablePerformanceTracking: boolean;
	sqlFormatOptions: Record<string, any>;
}