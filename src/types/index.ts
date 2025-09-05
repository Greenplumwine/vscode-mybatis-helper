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

// 配置项类型
export interface PluginConfig {
	databaseType: DatabaseType;
	enableLogInterceptor: boolean;
	customLogPattern?: string;
	maxHistorySize: number;
	showExecutionTime: boolean;
	batchProcessingDelay?: number;
}
