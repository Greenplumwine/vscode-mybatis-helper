import * as vscode from "vscode";
import { DatabaseType, PluginConfig, FileOpenMode } from "../types";
import { RegexUtils, PerformanceUtils } from "./performanceUtils";

// 导出工具类
export { RegexUtils, PerformanceUtils };

/**
 * Get plugin configuration
 * @returns PluginConfig object
 */
export function getPluginConfig(): PluginConfig {
  const config = vscode.workspace.getConfiguration("mybatisHelper");
  return {
    databaseType: config.get<DatabaseType>("databaseType", DatabaseType.MYSQL),
    enableLogInterceptor: config.get<boolean>("enableLogInterceptor", false),
    customLogPattern: config.get<string>("customLogPattern", ""),
    maxHistorySize: config.get<number>("maxHistorySize", 100),
    showExecutionTime: config.get<boolean>("showExecutionTime", true),
    fileOpenMode: config.get<FileOpenMode>(
      "fileOpenMode",
      FileOpenMode.USE_EXISTING
    ),
  };
}

/**
 * Delay execution function
 * @param ms Milliseconds to delay
 * @returns Promise that resolves after the delay
 */
export function delay(ms: number): Promise<void> {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

/**
 * Safe regular expression matching
 * @param text Text to match against
 * @param regex Regular expression to use
 * @returns Match result or null if match fails
 */
export function safeRegexMatch(
  text: string,
  regex: RegExp
): RegExpExecArray | null {
  try {
    return regex.exec(text);
  } catch (error) {
    console.error("Regular expression match failed:", error);
    return null;
  }
}

/**
 * Format SQL statement, add appropriate spaces and indentation
 * @param sql SQL statement to format
 * @param databaseType Optional database type
 * @returns Formatted SQL string
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
    console.error("SQL formatting failed:", error);
    return sql; // Return original SQL if formatting fails
  }
}

/**
 * Highlight SQL syntax with performance optimization
 * @param sql SQL statement to highlight
 * @param databaseType Database type
 * @returns HTML-formatted SQL with syntax highlighting
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
    console.error("SQL highlighting failed:", error);
    return sql; // Return original SQL if highlighting fails
  }
}
