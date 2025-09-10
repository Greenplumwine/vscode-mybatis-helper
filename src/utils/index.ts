import * as vscode from "vscode";
import { DatabaseType, PluginConfig, FileOpenMode } from "../types";

/**
 * Get plugin configuration
 */
export function getPluginConfig(): PluginConfig {
	const config = vscode.workspace.getConfiguration("mybatisHelper");
	return {
		databaseType: config.get<DatabaseType>("databaseType", DatabaseType.MYSQL),
		enableLogInterceptor: config.get<boolean>("enableLogInterceptor", false),
		customLogPattern: config.get<string>("customLogPattern", ""),
		maxHistorySize: config.get<number>("maxHistorySize", 100),
		showExecutionTime: config.get<boolean>("showExecutionTime", true),
		fileOpenMode: config.get<FileOpenMode>("fileOpenMode", FileOpenMode.USE_EXISTING),
	};
}

/**
 * Delay execution function
 */
export function delay(ms: number): Promise<void> {
	return new Promise((resolve) => setTimeout(resolve, ms));
}

/**
 * Safe regular expression matching
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
 */
export function formatSQL(sql: string, databaseType?: DatabaseType): string {
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

		keywords.forEach((keyword) => {
			// Do not add line breaks for the first keyword
			if (formatted.toUpperCase().startsWith(keyword + " ")) {
				return;
			}
			const regex = new RegExp(`\\b${keyword}\\b`, "gi");
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

		return indentedLines.join("\n");
	} catch (error) {
		console.error("SQL formatting failed:", error);
		return sql; // Return original SQL if formatting fails
	}
}

/**
 * Highlight SQL syntax
 */
export function highlightSQL(sql: string, databaseType: DatabaseType): string {
	try {
		// Simple SQL syntax highlighting, a specialized SQL syntax highlighting library can be used in actual projects
		let highlightedSQL = sql;

		// Cache regular expressions for performance improvement
		const keywordRegex =
			/\b(SELECT|FROM|WHERE|INSERT|UPDATE|DELETE|JOIN|LEFT|RIGHT|INNER|OUTER|ON|AND|OR|IN|LIKE|GROUP|BY|ORDER|HAVING|LIMIT|OFFSET|CREATE|DROP|ALTER|INDEX|VIEW|TABLE|DATABASE)\b/gi;
		const stringRegex = /'([^']|'')*'/g;
		const numberRegex = /\b\d+(\.\d+)?\b/g;
		const commentRegex = /--.*$/gm;
		const functionRegex =
			/\b(COUNT|SUM|AVG|MAX|MIN|CONCAT|SUBSTRING|DATE_FORMAT)\b\s*\(/gi;
		const placeholderRegex = /\?/g;

		// Highlight keywords
		highlightedSQL = highlightedSQL.replace(
			keywordRegex,
			'<span class="sql-keyword">$1</span>'
		);

		// Highlight functions
		highlightedSQL = highlightedSQL.replace(
			functionRegex,
			'<span class="sql-function">$1</span> ('
		);

		// Highlight strings
		highlightedSQL = highlightedSQL.replace(
			stringRegex,
			'<span class="sql-string">$&</span>'
		);

		// Highlight numbers
		highlightedSQL = highlightedSQL.replace(
			numberRegex,
			'<span class="sql-number">$&</span>'
		);

		// Highlight comments
		highlightedSQL = highlightedSQL.replace(
			commentRegex,
			'<span class="sql-comment">$&</span>'
		);

		// Highlight placeholders
		highlightedSQL = highlightedSQL.replace(
			placeholderRegex,
			'<span class="sql-placeholder">?</span>'
		);

		return highlightedSQL;
	} catch (error) {
		console.error("SQL highlighting failed:", error);
		return sql; // Return original SQL if highlighting fails
	}
}
