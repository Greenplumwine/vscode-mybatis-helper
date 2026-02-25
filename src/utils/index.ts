import * as vscode from "vscode";
import { DatabaseType, PluginConfig, FileOpenMode, NameMatchingRule, PathPriorityConfig } from "../types";
import { RegexUtils, PerformanceUtils } from "./performanceUtils";
import { JavaExtensionAPI } from "./javaExtensionAPI";
import { logger } from "./logger";


// 导出工具类
export { 
  RegexUtils, 
  PerformanceUtils,
  JavaExtensionAPI
};

/**
 * 获取插件配置
 * 从VS Code配置中读取并合并插件的所有配置选项
 * @returns 合并后的插件配置对象
 */
export function getPluginConfig(): PluginConfig {
	const config = vscode.workspace.getConfiguration('mybatis-helper');
	const nameMatchingRules = config.get<NameMatchingRule[]>('nameMatchingRules') || [];
	const ignoreSuffixes = config.get<string[]>('ignoreSuffixes') || [];
	const pathPriority = config.get<PathPriorityConfig>('pathPriority') || {
		enabled: true,
		priorityDirectories: ['/src/', '/main/', '/resources/'],
		excludeDirectories: ['/build/', '/target/', '/out/', '/.git/']
	};
	
	return {
		databaseType: (config.get<string>('databaseType') || 'mysql') as DatabaseType,
		customXmlDirectories: config.get<string[]>('customXmlDirectories') || [],
		fileOpenMode: (config.get<string>('fileOpenMode') || 'useExisting') as FileOpenMode,
		logOutputLevel: config.get<'debug' | 'info' | 'warn' | 'error'>('logOutputLevel') || 'info',
		enableLogInterceptor: config.get<boolean>('enableLogInterceptor') || false,
		customLogPattern: config.get<string>('customLogPattern') || '',
		maxHistorySize: config.get<number>('maxHistorySize') || 100,
		showExecutionTime: config.get<boolean>('showExecutionTime') || false,
		nameMatchingRules,
		ignoreSuffixes,
		pathPriority
	};
}

/**
 * 延迟执行函数
 * @param ms 延迟毫秒数
 * @returns Promise对象，延迟指定时间后resolve
 */
export function delay(ms: number): Promise<void> {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

/**
 * 安全的正则表达式匹配
 * 包装了正则表达式匹配，捕获并处理可能的异常
 * @param text 要匹配的文本
 * @param regex 正则表达式对象
 * @returns 匹配结果数组或null
 */
export function safeRegexMatch(
  text: string,
  regex: RegExp
): RegExpExecArray | null {
  try {
    return regex.exec(text);
  } catch (error) {
    logger.error("Regular expression match failed:", error);
    return null;
  }
}

/**
 * 格式化SQL语句
 * 对SQL语句进行基本的格式化，添加适当的空格和缩进
 * @param sql 要格式化的SQL语句
 * @param databaseType 数据库类型，用于生成特定数据库的格式
 * @returns 格式化后的SQL字符串
 */
export function formatSQL(sql: string, databaseType?: DatabaseType): string {
  const perfUtils = PerformanceUtils.getInstance();
  const regexUtils = RegexUtils.getInstance();

  // 检查缓存
  const cacheKey = `format-sql-${sql.length}-${databaseType || "default"}`;
  const cachedResult = perfUtils.getCache<string>(cacheKey);
  if (cachedResult) {
    return cachedResult;
  }

  try {
    // Basic SQL formatting logic
    let formatted = sql.replace(/\s+/g, " ").trim();

    // Add simple line break processing
    const keywords = [
      "SELECT",
      "FROM",
      "WHERE",
      "INSERT",
      "UPDATE",
      "DELETE",
      "JOIN",
      "LEFT",
      "RIGHT",
      "INNER",
      "OUTER",
      "ON",
      "AND",
      "OR",
      "IN",
      "LIKE",
      "GROUP",
      "BY",
      "ORDER",
      "HAVING",
      "LIMIT",
      "OFFSET",
    ];

    // 使用缓存的正则表达式提高性能
    keywords.forEach((keyword) => {
      // Do not add line breaks for the first keyword
      if (formatted.toUpperCase().startsWith(keyword + " ")) {
        return;
      }
      const regex = regexUtils.getRegex(`\\b${keyword}\\b`, "gi");
      formatted = formatted.replace(regex, `\n${keyword}`);
    });

    // Indentation
    const lines = formatted.split("\n");
    const indentedLines: string[] = [];

    for (let i = 0; i < lines.length; i++) {
      const line = lines[i].trim();
      if (!line) {
        continue;
      }

      // Basic indentation rules
      if (
        ["SELECT", "INSERT", "UPDATE", "DELETE"].some((keyword) =>
          line.toUpperCase().startsWith(keyword)
        )
      ) {
        indentedLines.push(line);
      } else {
        indentedLines.push("  " + line);
      }
    }

    const result = indentedLines.join("\n");
    // 缓存结果
    perfUtils.setCache(cacheKey, result, 30000); // 缓存30秒
    return result;
  } catch (error) {
    logger.error("SQL formatting failed:", error);
    return sql; // Return original SQL if formatting fails
  }
}

/**
 * SQL语法高亮
 * 对SQL语句进行语法高亮处理，生成HTML格式的高亮代码
 * @param sql 要高亮的SQL语句
 * @param databaseType 数据库类型，用于生成特定数据库的高亮规则
 * @returns HTML格式的高亮SQL字符串
 */
export function highlightSQL(sql: string, databaseType: DatabaseType): string {
  const perfUtils = PerformanceUtils.getInstance();
  const regexUtils = RegexUtils.getInstance();

  // 检查缓存
  const cacheKey = `highlight-sql-${sql.length}-${databaseType}`;
  const cachedResult = perfUtils.getCache<string>(cacheKey);
  if (cachedResult) {
    return cachedResult;
  }

  try {
    let highlightedSQL = sql;

    // Use cached regular expressions for performance improvement
    const keywordRegex = regexUtils.getRegex(
      /\b(SELECT|FROM|WHERE|INSERT|UPDATE|DELETE|JOIN|LEFT|RIGHT|INNER|OUTER|ON|AND|OR|IN|LIKE|GROUP|BY|ORDER|HAVING|LIMIT|OFFSET|CREATE|DROP|ALTER|INDEX|VIEW|TABLE|DATABASE)\b/gi
    );
    const stringRegex = regexUtils.getRegex(/'([^']|'')*'/g);
    const numberRegex = regexUtils.getRegex(/\b\d+(\.\d+)?\b/g);
    const commentRegex = regexUtils.getRegex(/--.*$/gm);
    const functionRegex = regexUtils.getRegex(
      /\b(COUNT|SUM|AVG|MAX|MIN|CONCAT|SUBSTRING|DATE_FORMAT)\b\s*\(/gi
    );
    const placeholderRegex = regexUtils.getRegex(/\?/g);

    // Apply highlighting in an optimized order
    // 1. Comments (to prevent them from being highlighted by other patterns)
    highlightedSQL = highlightedSQL.replace(
      commentRegex,
      '<span class="sql-comment">$&</span>'
    );

    // 2. Strings
    highlightedSQL = highlightedSQL.replace(
      stringRegex,
      '<span class="sql-string">$&</span>'
    );

    // 3. Numbers
    highlightedSQL = highlightedSQL.replace(
      numberRegex,
      '<span class="sql-number">$&</span>'
    );

    // 4. Functions
    highlightedSQL = highlightedSQL.replace(
      functionRegex,
      '<span class="sql-function">$1</span> ('
    );

    // 5. Keywords
    highlightedSQL = highlightedSQL.replace(
      keywordRegex,
      '<span class="sql-keyword">$1</span>'
    );

    // 6. Placeholders
    highlightedSQL = highlightedSQL.replace(
      placeholderRegex,
      '<span class="sql-placeholder">?</span>'
    );

    // 缓存结果
    perfUtils.setCache(cacheKey, highlightedSQL, 30000); // 缓存30秒
    return highlightedSQL;
  } catch (error) {
    logger.error("SQL highlighting failed:", error);
    return sql; // Return original SQL if highlighting fails
  }
}
