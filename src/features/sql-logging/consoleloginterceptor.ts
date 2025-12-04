import * as vscode from "vscode";
import { LogEntry, SQLQuery, SQLHistory, DatabaseType } from "../../types";
import { SQLParser } from "../../language/sqlparser";
import {
	getPluginConfig,
	formatSQL,
	highlightSQL,
	safeRegexMatch
} from "../../utils";
import { logger } from "../../utils/logger";

/**
 * MyBatis log interceptor, responsible for intercepting console logs and parsing SQL statements
 */
export class ConsoleLogInterceptor {
	private outputChannel: vscode.OutputChannel;
	private sqlParser: SQLParser;
	private isIntercepting: boolean;
	private sqlHistory: SQLHistory;
	private currentQuery: SQLQuery | null;
	private maxHistorySize: number = 100;
	private showExecutionTime: boolean = true;
	private logProcessTimeout: NodeJS.Timeout | null = null;
	private logBatch: string[] = [];
	private logProcessDelay = 100; // Batch processing delay time (milliseconds)
	private customLogPattern: string = "";
	private customPreparingRegex: RegExp | null = null;
	private customParametersRegex: RegExp | null = null;
	private customExecutionTimeRegex: RegExp | null = null;
	private performanceStats = { logLinesProcessed: 0, sqlQueriesProcessed: 0, averageProcessingTime: 0, lastProcessingTime: 0 };

	// Simple cache for SQL formatting results
	private formatCache: Map<string, string> = new Map();

	constructor(config?: vscode.WorkspaceConfiguration) {
		this.outputChannel = vscode.window.createOutputChannel("MyBatis SQL");
		this.sqlParser = new SQLParser();
		this.isIntercepting = false;
		this.sqlHistory = { queries: [], lastUpdated: new Date() };
		this.currentQuery = null;

		// Initialize configuration
		if (config) {
			this.updateConfig(config);
		} else {
			// Use default configuration
			const defaultConfig = getPluginConfig();
			this.maxHistorySize = defaultConfig.maxHistorySize;
			this.showExecutionTime = defaultConfig.showExecutionTime;
			this.sqlParser.setDatabaseType(defaultConfig.databaseType);
			this.updateCustomLogPattern(defaultConfig.customLogPattern || "");
		}
	}

	/**
	 * Simple debounce function
	 * @param func Function to debounce
	 * @param delay Debounce delay in milliseconds
	 * @returns Debounced function
	 */
	private debounce<T extends (...args: any[]) => any>(func: T, delay: number): (...args: Parameters<T>) => void {
		let timeoutId: NodeJS.Timeout | null = null;
		return (...args: Parameters<T>) => {
			if (timeoutId) {
				clearTimeout(timeoutId);
			}
			timeoutId = setTimeout(() => {
				func(...args);
				timeoutId = null;
			}, delay);
		};
	}

	/**
	 * Toggle log interception status
	 */
	toggleIntercepting(): boolean {
		this.isIntercepting = !this.isIntercepting;

		if (this.isIntercepting) {
			this.startIntercepting();
			vscode.window.showInformationMessage(
				vscode.l10n.t("logInterceptor.enabled")
			);
		} else {
			this.stopIntercepting();
			vscode.window.showInformationMessage(
				vscode.l10n.t("logInterceptor.disabled")
			);
		}

		return this.isIntercepting;
	}

	/**
	 * Start intercepting logs
	 */
	private startIntercepting(): void {
		// Subscribe to debug console logs
		this.listenToDebugConsole();
		// Clear history
		this.clearSQLHistory();
		// Show output channel
		this.outputChannel.show();
	}

	/**
	 * Stop intercepting logs
	 */
	private stopIntercepting(): void {
		// Clean up work
		this.currentQuery = null;
		// Clear batch processing timer
		if (this.logProcessTimeout) {
			clearTimeout(this.logProcessTimeout);
			this.logProcessTimeout = null;
		}
		// Clear batch processing queue
		this.logBatch = [];
	}

	/**
	 * Listen to debug console output
	 */
	private listenToDebugConsole(): void {
		// Listen to debug session start and end
		vscode.debug.onDidStartDebugSession((session) => {
			logger.debug(`Started listening to debug session: ${session.name}`);
			this.currentQuery = null;
		});

		vscode.debug.onDidTerminateDebugSession((session) => {
			logger.debug(`Stopped listening to debug session: ${session.name}`);
			this.currentQuery = null;
		});

		// Listen to debug output events
		vscode.debug.onDidReceiveDebugSessionCustomEvent((event) => {
			if (
				event.event === "output" &&
				event.body &&
				typeof event.body === "object"
			) {
				const output = event.body as { category: string; output: string };
				if (output.category === "console" || output.category === "stdout") {
					this.processLogLine(output.output);
				}
			}
		});
	}

	/**
	 * Process console log line - using batch processing and debounce to optimize performance
	 */
	public processLogLine(line: string): void {
		if (!this.isIntercepting) {
			return;
		}

		// Add log to batch processing queue
		this.logBatch.push(line);

		// Clear previous timer
		if (this.logProcessTimeout) {
			clearTimeout(this.logProcessTimeout);
		}

		// Set new timer, delay processing logs
		const debouncedProcess = this.debounce(() => {
			this.processLogBatch();
		}, this.logProcessDelay);
		this.logProcessTimeout = setTimeout(debouncedProcess, this.logProcessDelay);
	}

	/**
	 * Process log lines in batch to improve performance
	 */
	private processLogBatch(): void {
		const startTime = Date.now();
		const batch = [...this.logBatch];
		this.logBatch = [];
		this.logProcessTimeout = null;

		batch.forEach((line) => {
			try {
				const logEntry = this.parseLogLine(line);
				if (!logEntry) {
					return;
				}

				// Process different types of logs
				switch (logEntry.type) {
					case "preparing":
						this.handlePreparingLog(logEntry.content);
						break;
					case "parameters":
						this.handleParametersLog(logEntry.content);
						break;
					case "executed":
						this.handleExecutedLog(logEntry.content);
						break;
					default:
						// Ignore other types of logs
						break;
				}
			} catch (error) {
				logger.error(`Error processing log line: ${error instanceof Error ? error.message : String(error)}`, error as Error);
			}
		});

		// Update performance statistics
		this.performanceStats.logLinesProcessed += batch.length;
		const endTime = Date.now();
		this.performanceStats.lastProcessingTime = endTime - startTime;
		this.performanceStats.averageProcessingTime = (
			this.performanceStats.averageProcessingTime * 
			(this.performanceStats.logLinesProcessed - batch.length) + 
			this.performanceStats.lastProcessingTime 
		) / this.performanceStats.logLinesProcessed;

		logger.debug(`Processed ${batch.length} log lines in ${endTime - startTime}ms`);
	}

	/**
	 * Parse log line
	 */
	private parseLogLine(line: string): LogEntry | null {
		// Skip empty lines
		if (!line || line.trim().length === 0) {
			return null;
		}

		try {
			// If there's a custom log format, use custom format to parse
			if (
				this.customLogPattern &&
				this.customPreparingRegex &&
				this.customParametersRegex &&
				this.customExecutionTimeRegex
			) {
				if (safeRegexMatch(line, this.customPreparingRegex)) {
					return {
						timestamp: new Date(),
						type: "preparing",
						content: line,
					};
				} else if (safeRegexMatch(line, this.customParametersRegex)) {
					return {
						timestamp: new Date(),
						type: "parameters",
						content: line,
					};
				} else if (safeRegexMatch(line, this.customExecutionTimeRegex)) {
					return {
						timestamp: new Date(),
						type: "executed",
						content: line,
					};
				}

				// If it doesn't match any custom pattern but contains keywords from the custom log format, it might also be related log
				if (
					line.toLowerCase().includes("mybatis") ||
					line.toLowerCase().includes("sqlsession")
				) {
					return {
						timestamp: new Date(),
						type: "other",
						content: line,
					};
				}
				return null;
			}

			// Default log format parsing logic
			// Check if it's a MyBatis related log
			if (
				line.toLowerCase().includes("mybatis") ||
				line.toLowerCase().includes("sqlsession") ||
				line.includes("Preparing:") ||
				line.includes("Parameters:") ||
				line.includes("Executed in")
			) {
				let type: LogEntry["type"] = "other";
				if (line.includes("Preparing:")) {
					type = "preparing";
				} else if (line.includes("Parameters:")) {
					type = "parameters";
				} else if (line.includes("Executed in")) {
					type = "executed";
				}
				return {
					timestamp: new Date(),
					type,
					content: line,
				};
			}
			return null;
		} catch (error) {
			logger.error(`Error parsing log line: ${error instanceof Error ? error.message : String(error)}`, error as Error);
			return null;
		}
	}

	/**
	 * Handle preparing SQL statement log
	 */
	private handlePreparingLog(content: string): void {
		try {
			const sql = this.sqlParser.parsePreparingLog(content);
			if (sql) {
				// If there's an unprocessed query, save it to history first
				if (this.currentQuery && this.currentQuery.preparing) {
					this.addToSQLHistory(this.currentQuery);
					this.displaySQLQuery(this.currentQuery);
				}
				this.currentQuery = {
					id: Date.now().toString(),
					preparing: sql,
					parameters: [],
					timestamp: new Date(),
				};
			}
		} catch (error) {
			logger.error("Error parsing preparing SQL log:", error as Error);
			// Reset current query when error occurs to avoid affecting subsequent log processing
			this.currentQuery = null;
		}
	}

	/**
	 * Handle SQL parameters log
	 */
	private handleParametersLog(content: string): void {
		try {
			if (!this.currentQuery) {
				return;
			}
			const parameters = this.sqlParser.parseParametersLog(content);
			if (parameters && parameters.length > 0) {
				this.currentQuery.parameters = parameters;
				// Process complete SQL query
				this.processCompleteQuery();
			}
		} catch (error) {
			logger.error("Error parsing parameters log:", error as Error);
		}
	}

	/**
	 * Handle SQL execution completed log
	 */
	private handleExecutedLog(content: string): void {
		try {
			if (!this.currentQuery) {
				return;
			}
			const executionTime = this.sqlParser.parseExecutionTimeLog(content);
			if (executionTime !== null) {
				this.currentQuery.executedTime = executionTime;
			}
			// If there's already fullSQL, update display
			if (this.currentQuery.fullSQL) {
				this.displaySQLQuery(this.currentQuery);
				// Add to history
				this.addToSQLHistory(this.currentQuery);
				// Reset current query
				this.currentQuery = null;
			}
		} catch (error) {
			logger.error("Error parsing execution completed log:", error as Error);
			// Even if an error occurs, reset the current query
			this.currentQuery = null;
		}
	}

	/**
	 * Process complete SQL query
	 */
	private processCompleteQuery(): void {
		if (
			this.currentQuery &&
			this.currentQuery.preparing &&
			this.currentQuery.parameters
		) {
			try {
				// Fill parameters to generate complete SQL
				this.currentQuery = this.sqlParser.processSQLQuery(this.currentQuery);
				// Display SQL query
				this.displaySQLQuery(this.currentQuery);
				// Save to history
				this.addToSQLHistory(this.currentQuery);
			} catch (error) {
				logger.error("Error processing complete SQL query:", error as Error);
			} finally {
				this.performanceStats.sqlQueriesProcessed++;
			}
		}
	}

	/**
	 * Display SQL query in output channel
	 */
	private displaySQLQuery(query: SQLQuery): void {
		try {
			if (!query.fullSQL) {
				return;
			}
			const outputLines: string[] = [];
			outputLines.push(` === ${vscode.l10n.t("logInterceptor.executedSql")} ===`);
			outputLines.push(
				`${vscode.l10n.t(
					"logInterceptor.time"
				)}: ${new Date().toLocaleString()}`
			);
			// Format SQL with custom cache
			const cacheKey = `formatSQL_${query.id}`;
			let formattedSQL = this.formatCache.get(cacheKey);
			if (!formattedSQL) {
				formattedSQL = formatSQL(query.fullSQL!);
				this.formatCache.set(cacheKey, formattedSQL);
				// Limit cache size to 50 entries to prevent memory issues
				if (this.formatCache.size > 50) {
					// Remove the oldest entry
					const oldestKey = this.formatCache.keys().next().value;
					if (oldestKey) {
						this.formatCache.delete(oldestKey);
					}
				}
			}
			outputLines.push(formattedSQL);

			// Show parameter information
			if (query.parameters && query.parameters.length > 0) {
				outputLines.push(` --- ${vscode.l10n.t("logInterceptor.parameterInfo")} ---`);
				query.parameters.forEach((param, index) => {
					outputLines.push(
						`${vscode.l10n.t("logInterceptor.parameter")} ${index + 1}: ${param.value} (${param.type})`
					);
				});
			}

			// Show execution time
			if (this.showExecutionTime && query.executedTime !== undefined) {
				let timeDisplay = ` ${vscode.l10n.t("logInterceptor.executionTime")}: ${query.executedTime}ms`;
				if (query.executedTime > 1000) {
					timeDisplay += ` ⚠️ ${vscode.l10n.t(
						"logInterceptor.performanceWarning"
					)}`;
				}
				outputLines.push(timeDisplay);
			}

			outputLines.push("================\n");
			// Append all lines at once to reduce I/O operations
			this.outputChannel.appendLine(outputLines.join("\n"));
		} catch (error) {
			logger.error("Error displaying SQL query:", error as Error);
		}
	}

	/**
	 * Add SQL query to history
	 */
	private addToSQLHistory(query: SQLQuery): void {
		// Add query to history immediately
		this.sqlHistory.queries.push({ ...query });
		this.sqlHistory.lastUpdated = new Date();
		// Limit history size
		if (this.sqlHistory.queries.length > this.maxHistorySize) {
			this.sqlHistory.queries = this.sqlHistory.queries.slice(
				-this.maxHistorySize
			);
		}
	}

	/**
	 * Find query in history by ID
	 */
	public findQueryById(id: string): SQLQuery | undefined {
		return this.sqlHistory.queries.find((query) => query.id === id);
	}

	/**
	 * Show SQL output channel
	 */
	public showSQLOutput(): void {
		this.outputChannel.show();
	}

	/**
	 * Clear SQL history
	 */
	public clearSQLHistory(): void {
		try {
			this.sqlHistory = { queries: [], lastUpdated: new Date() };
			this.outputChannel.clear();
			vscode.window.showInformationMessage(
				vscode.l10n.t("logInterceptor.historyCleared")
			);
		} catch (error) {
			logger.error("Error clearing SQL history:", error as Error);
			vscode.window.showErrorMessage(
				vscode.l10n.t("logInterceptor.clearHistoryFailed")
			);
		}
	}

	/**
	 * Get interception status
	 */
	public getInterceptingState(): boolean {
		return this.isIntercepting;
	}

	/**
	 * Get SQL history
	 */
	public getSQLHistory(): SQLHistory {
		// Return deep copy to avoid external modifications
		return {
			queries: [...this.sqlHistory.queries].map((query) => ({
				...query,
				parameters: [...(query.parameters || [])],
				timestamp: new Date(),
			})),
			lastUpdated: new Date(this.sqlHistory.lastUpdated),
		};
	}

	/**
	 * Update plugin configuration
	 */
	public updateConfig(config: vscode.WorkspaceConfiguration): void {
		try {
			// Use debounce to avoid frequent configuration updates
			const debouncedUpdate = this.debounce(() => {
				this.maxHistorySize = config.get("maxHistorySize", 100);
				this.showExecutionTime = config.get("showExecutionTime", true);
				this.sqlParser.setDatabaseType(
					config.get("databaseType", DatabaseType.MYSQL)
				);
				// Adjust batch processing delay according to configuration
				this.logProcessDelay = config.get("batchProcessingDelay", 100);
				// Get configuration for enabling log interception
				const enableLogInterceptor = config.get("enableLogInterceptor", true);
				if (!enableLogInterceptor && this.isIntercepting) {
					this.toggleIntercepting();
				}
				// Update custom log format configuration
				const customLogPattern = config.get("customLogPattern", "");
				this.updateCustomLogPattern(customLogPattern);
				// Pass custom regular expressions to SQLParser
				if (
					this.customPreparingRegex &&
					this.customParametersRegex &&
					this.customExecutionTimeRegex
				) {
					this.sqlParser.setCustomPatterns(
						this.customPreparingRegex.source,
						this.customParametersRegex.source,
						this.customExecutionTimeRegex.source
					);
				} else {
					this.sqlParser.resetToDefaultPatterns();
				}
			}, 100);
			debouncedUpdate();
		} catch (error) {
			logger.error("Error updating configuration:", error as Error);
		}
	}

	/**
	 * Update custom log format pattern
	 */
	private updateCustomLogPattern(pattern: string): void {
		this.customLogPattern = pattern;
		if (!pattern) {
			// Clear custom regular expressions
			this.customPreparingRegex = null;
			this.customParametersRegex = null;
			this.customExecutionTimeRegex = null;
			return;
		}
		try {
			// Parse custom log format, create corresponding regular expressions
			// Basic strategy:
			// - %PREPARING%: Match SQL preparation statement
			// - %PARAMETERS%: Match SQL parameters
			// - %EXECUTION_TIME%: Match execution time
			const extractRegex = /%([A-Z_]+)%/g;

			// Preparation statement regular expression
			if (pattern.includes("%PREPARING%")) {
				// Try to extract Preparing's regular pattern from custom format
				const preparingRegex = this.extractRegexFromPattern(
					pattern,
					"%PREPARING%"
				);
				if (preparingRegex) {
					this.customPreparingRegex = new RegExp(preparingRegex, "i");
				}
			} else {
				// Default Preparing regular expression
				this.customPreparingRegex = new RegExp("Preparing:", "i");
			}

			// Parameter statement regular expression
			if (pattern.includes("%PARAMETERS%")) {
				const parametersRegex = this.extractRegexFromPattern(
					pattern,
					"%PARAMETERS%"
				);
				if (parametersRegex) {
					this.customParametersRegex = new RegExp(parametersRegex, "i");
				}
			} else {
				// Default Parameters regular expression
				this.customParametersRegex = new RegExp("Parameters:", "i");
			}

			// Execution time regular expression
			if (pattern.includes("%EXECUTION_TIME%")) {
				const executionTimeRegex = this.extractRegexFromPattern(
					pattern,
					"%EXECUTION_TIME%"
				);
				if (executionTimeRegex) {
					this.customExecutionTimeRegex = new RegExp(executionTimeRegex, "i");
				}
			} else {
				// Default Executed in regular expression
				this.customExecutionTimeRegex = new RegExp("Executed\\s+in", "i");
			}

			logger.debug("Custom log format updated");
		} catch (error) {
			logger.error("Error parsing custom log format:", error as Error);
			// Fall back to default settings when error occurs
			this.customPreparingRegex = null;
			this.customParametersRegex = null;
			this.customExecutionTimeRegex = null;
			vscode.window.showErrorMessage(
				vscode.l10n.t("logInterceptor.parsePatternFailed", { error: error instanceof Error ? error.message : String(error) })
			);
		}
	}

	/**
	 * Extract regular expression pattern from custom log format
	 */
	private extractRegexFromPattern(pattern: string, placeholder: string): string {
		try {
			// Escape special regex characters in the pattern
			const escapedPattern = pattern.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
			// Replace placeholder with capture group
			return escapedPattern.replace(
				escapedPattern.includes(placeholder) ? placeholder : escapedPattern,
				'(.+)'
			);
		} catch (error) {
			logger.error(`Error extracting regex from pattern: ${error instanceof Error ? error.message : String(error)}`, error as Error);
			// Return default pattern for the placeholder if extraction fails
			if (placeholder === "%PREPARING%") {
				return "Preparing:\\s*(.+)";
			};
			if (placeholder === "%PARAMETERS%") {
				return "Parameters:\\s*(.+)";
			};
			if (placeholder === "%EXECUTION_TIME%") {
				return "Executed\\s+in\\s+(\\d+)ms";
			};
			return ".*";
		}
	}

	/**
	 * 清理资源
	 */
	dispose(): void {
		this.stopIntercepting();
		this.outputChannel.dispose();
		this.formatCache.clear();
	}
}
