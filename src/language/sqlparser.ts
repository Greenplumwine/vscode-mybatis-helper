import { formatSQL, highlightSQL, safeRegexMatch } from "../utils";
import { DatabaseType, SQLQuery } from "../types";
import { PerformanceUtils } from '../utils/performanceUtils';
import { RegexUtils } from '../utils';

/**
 * SQL parser for parsing SQL statements and parameters from MyBatis logs
 */
export class SQLParser {
	private databaseType: DatabaseType;
	private performanceUtils: PerformanceUtils;
	private regexUtils: RegexUtils;

	// Cache regular expressions for performance improvement
	private preparingRegex = /Preparing:\s*(.+)/i;
	private parametersRegex = /Parameters:\s*(.+)/i;
	private executionTimeRegex = /Executed\s+in\s+(\d+)ms/i;
	private paramRegex = /([^,\(]+)\(([^\)]+)\)/g;

	// Operation type regex cache
	private operationTypeRegexCache: Map<string, RegExp> = new Map();

	// SQL processing cache
	private sqlProcessingCache: Map<string, SQLQuery> = new Map();

	// Mapping of supported special parameter types
	private specialParamTypes: Map<string, (value: string) => string> = new Map([
		["boolean", this.formatBooleanParam.bind(this)],
		["date", this.formatDateParam.bind(this)],
		["timestamp", this.formatTimestampParam.bind(this)],
		["time", this.formatTimeParam.bind(this)],
		["json", this.formatJsonParam.bind(this)],
		["array", this.formatArrayParam.bind(this)],
	]);

	constructor(databaseType: DatabaseType = DatabaseType.MYSQL) {
		this.databaseType = databaseType;
		this.performanceUtils = PerformanceUtils.getInstance();
		this.regexUtils = RegexUtils.getInstance();
	}

	/**
	 * Set database type and clear relevant caches
	 */
	setDatabaseType(type: DatabaseType): void {
		const startTime = Date.now();
		try {
			this.databaseType = type;
			// Clear SQL processing cache when database type changes
			this.clearCache();
		} finally {
			this.performanceUtils.recordExecutionTime('SQLParser.setDatabaseType', Date.now() - startTime);
		}
	}

	/**
	 * Set custom regular expressions and clear regex cache
	 */
	setCustomPatterns(
		preparingPattern?: string,
		parametersPattern?: string,
		executionTimePattern?: string
	): void {
		const startTime = Date.now();
		try {
			// Clear operation type regex cache when patterns change
			this.operationTypeRegexCache.clear();

			if (preparingPattern) {
				try {
					this.preparingRegex = new RegExp(preparingPattern, "i");
				} catch (error) {
					console.error("Error setting preparing regex:", error);
				}
			}

			if (parametersPattern) {
				try {
					this.parametersRegex = new RegExp(parametersPattern, "i");
				} catch (error) {
					console.error("Error setting parameters regex:", error);
				}
			}

			if (executionTimePattern) {
				try {
					this.executionTimeRegex = new RegExp(executionTimePattern, "i");
				} catch (error) {
					console.error("Error setting execution time regex:", error);
				}
			}
		} finally {
			this.performanceUtils.recordExecutionTime('SQLParser.setCustomPatterns', Date.now() - startTime);
		}
	}

	/**
	 * Reset to default regular expressions and clear caches
	 */
	resetToDefaultPatterns(): void {
		const startTime = Date.now();
		try {
			this.preparingRegex = /Preparing:\s*(.+)/i;
			this.parametersRegex = /Parameters:\s*(.+)/i;
			this.executionTimeRegex = /Executed\s+in\s+(\d+)ms/i;
			this.operationTypeRegexCache.clear();
			this.clearCache();
		} finally {
			this.performanceUtils.recordExecutionTime('SQLParser.resetToDefaultPatterns', Date.now() - startTime);
		}
	}

	/**
	 * Parse log line for preparing SQL statement with performance tracking
	 */
	parsePreparingLog(line: string): string | null {
		const startTime = Date.now();
		try {
			return this.regexUtils.safeMatch(line, this.preparingRegex)?.[1]?.trim() || null;
		} finally {
			this.performanceUtils.recordExecutionTime('SQLParser.parsePreparingLog', Date.now() - startTime);
		}
	}

	/**
	 * Parse log line for parameters with performance tracking
	 */
	parseParametersLog(
		line: string
	): Array<{ value: string; type: string }> | null {
		const startTime = Date.now();
		try {
			const parametersMatch = this.regexUtils.safeMatch(line, this.parametersRegex);
			if (!parametersMatch || !parametersMatch[1]) {
				return null;
			}

			const paramsString = parametersMatch[1];
			const params: Array<{ value: string; type: string }> = [];

			// Reset regex state
			this.paramRegex.lastIndex = 0;

			// Batch process parameters
			const paramBatchSize = 100; // Process 100 parameters at a time
			let paramMatch;
			let paramCount = 0;

			while ((paramMatch = this.paramRegex.exec(paramsString)) !== null && paramCount < paramBatchSize) {
				const value = paramMatch[1].trim();
				const type = paramMatch[2].trim();
				params.push({ value, type });
				paramCount++;

				// Prevent infinite loops
				if (paramCount > 1000) {
					console.warn('Possible infinite loop detected in parameter parsing');
					break;
				}
			}

			return params.length > 0 ? params : null;
		} finally {
			this.performanceUtils.recordExecutionTime('SQLParser.parseParametersLog', Date.now() - startTime);
		}
	}

	/**
	 * Parse log line for execution time with performance tracking
	 */
	parseExecutionTimeLog(line: string): number | null {
		const startTime = Date.now();
		try {
			const timeMatch = this.regexUtils.safeMatch(line, this.executionTimeRegex);
			if (timeMatch && timeMatch[1]) {
				return parseInt(timeMatch[1], 10);
			}
			return null;
		} finally {
			this.performanceUtils.recordExecutionTime('SQLParser.parseExecutionTimeLog', Date.now() - startTime);
		}
	}

	/**
	 * Fill parameters into SQL statement with performance tracking
	 */
	fillParametersToSQL(
		sql: string,
		params: Array<{ value: string; type: string }>
	): string {
		const startTime = Date.now();
		try {
			// Create cache key based on SQL and parameters
			const cacheKey = `${sql}_${JSON.stringify(params)}`;
			let filledSQL: string = this.performanceUtils.getCache(cacheKey) || "";

			if (filledSQL) {
				return filledSQL;
			}

			filledSQL = sql;

			// Process question mark parameters
			let placeholderIndex = 0;
			filledSQL = sql.replace(/\?/g, () => {
				if (placeholderIndex < params.length) {
					const param = params[placeholderIndex];
					placeholderIndex++;
					return this.formatParameter(param.value, param.type);
				}
				// Keep original placeholder if there are insufficient parameters
				return "?";
			});

			// Process array parameter expansion (IN clause) - optimized
			filledSQL = this.processArrayParameters(filledSQL, params);

			// Cache the result
			this.performanceUtils.setCache(cacheKey, filledSQL);

			return filledSQL;
		} finally {
			this.performanceUtils.recordExecutionTime('SQLParser.fillParametersToSQL', Date.now() - startTime);
		}
	}

	/**
	 * Process array parameters in SQL with optimized performance
	 */
	private processArrayParameters(
		filledSQL: string,
		params: Array<{ value: string; type: string }>
	): string {
		if (!params || params.length === 0) {
			return filledSQL;
		}

		// Use a single regex for array detection to avoid multiple regex creations
		const arrayTypeRegex = /array|list/i;
		let resultSQL = filledSQL;

		// Process array parameters in batch
		for (let i = 0; i < params.length; i++) {
			const param = params[i];
			// Skip non-array parameters
			if (!param.type || !arrayTypeRegex.test(param.type)) {
				continue;
			}

			try {
				// Try to parse array content
				const arrayValue = param.value
					.replace(/\[/g, "")
					.replace(/\]/g, "");
				const arrayItems = arrayValue.split(",").map((item) => item.trim());

				// Create regex with cached pattern
				const placeholder = this.formatParameter(param.value, param.type);
				const inClauseCacheKey = `in_clause_${placeholder}_${this.databaseType}`;
				let inClauseRegex = this.operationTypeRegexCache.get(inClauseCacheKey);

				if (!inClauseRegex) {
					// Escape regex special characters
					const escapedPlaceholder = placeholder.replace(
						/[.*+?^${}()|[\]\\]/g,
						"\\$&"
					);
					inClauseRegex = new RegExp(
						`IN\s*\(\s*${escapedPlaceholder}\s*\)`,
						"gi"
					);
					this.operationTypeRegexCache.set(inClauseCacheKey, inClauseRegex);
				}

				// Skip if no IN clause found
				if (!inClauseRegex.test(resultSQL)) {
					// Reset regex lastIndex
					inClauseRegex.lastIndex = 0;
					continue;
				}

				// Reset regex lastIndex before replace
				inClauseRegex.lastIndex = 0;

				// Format each array element in parallel
				const formattedItems = arrayItems
					.map((item) => {
						// Create a temporary parameter object to use existing formatting logic
						const tempParam = {
							value: item,
							type: this.getArrayItemType(param.type),
						};
						return this.formatParameter(tempParam.value, tempParam.type);
					})
					.join(", ");

				// Replace the placeholder with formatted array items
				resultSQL = resultSQL.replace(
					inClauseRegex,
					`IN (${formattedItems})`
				);

			} catch (error) {
				console.warn(
					`Failed to expand array parameter at index ${i}:`,
					error
				);
				// Skip array expansion and keep original if there's an error
				continue;
			}
		}
		return resultSQL;
	}

	/**
	 * Infer element type from array type
	 */
	private getArrayItemType(arrayType: string): string {
		const startTime = Date.now();
		try {
			// Try to extract element type from array type name
			// Example: String[] -> string, List<Integer> -> integer
			const arrayItemTypeCacheKey = `array_item_type_${arrayType}`;
			let itemType: string = this.performanceUtils.getCache(arrayItemTypeCacheKey) || "";

			if (itemType) {
				return itemType;
			}

			const arrayTypeRegex = /^(?:Array<|List<|)(\w+)/i;
			const match = this.regexUtils.safeMatch(arrayType, arrayTypeRegex);

			if (match && match[1]) {
				itemType = match[1].toLowerCase();
			} else {
				// Default to string type
				itemType = "string";
			}

			// Cache the result
			this.performanceUtils.setCache(arrayItemTypeCacheKey, itemType);

			return itemType;
		} finally {
			this.performanceUtils.recordExecutionTime('SQLParser.getArrayItemType', Date.now() - startTime);
		}
	}

	/**
	 * Format boolean type parameter
	 */
	private formatBooleanParam(value: string): string {
		const startTime = Date.now();
		try {
			const boolValue = value.toLowerCase() === "true" || value === "1";

			// Use a map for faster database type lookup
			const boolFormats: Record<DatabaseType, string> = {
				[DatabaseType.MYSQL]: boolValue ? "1" : "0",
				[DatabaseType.POSTGRESQL]: boolValue ? "1" : "0",
				[DatabaseType.ORACLE]: boolValue ? "1" : "0",
				[DatabaseType.SQLSERVER]: boolValue ? "1" : "0",
				[DatabaseType.DM]: boolValue ? "1" : "0",
				[DatabaseType.KINGBASEES]: boolValue ? "1" : "0",
				[DatabaseType.OTHER]: boolValue ? "1" : "0"
			};

			return boolFormats[this.databaseType] || (boolValue ? "1" : "0");
		} finally {
			this.performanceUtils.recordExecutionTime('SQLParser.formatBooleanParam', Date.now() - startTime);
		}
	}

	/**
	 * Format date type parameter
	 */
	private formatDateParam(value: string): string {
		const startTime = Date.now();
		try {
			// Process date strings in different formats
			let formattedDate = value.trim();

			// ISO format: 2023-01-01T12:00:00
			if (formattedDate.includes("T")) {
				formattedDate = formattedDate.split("T")[0];
			}

			// Add quotes for date
			return `'${formattedDate}'`;
		} catch (error) {
			console.warn(`Invalid date value: ${value}`);
			return "NULL";
		} finally {
			this.performanceUtils.recordExecutionTime('SQLParser.formatDateParam', Date.now() - startTime);
		}
	}

	/**
	 * Format timestamp type parameter
	 */
	private formatTimestampParam(value: string): string {
		const startTime = Date.now();
		try {
			// Process timestamp strings in different formats
			let formattedTimestamp = value.trim();

			// Use a map for faster database type lookup
			const timestampFormats: Record<DatabaseType, string> = {
				[DatabaseType.MYSQL]: `'${formattedTimestamp}'`,
				[DatabaseType.POSTGRESQL]: `'${formattedTimestamp}'`,
				[DatabaseType.DM]: `'${formattedTimestamp}'`,
				[DatabaseType.KINGBASEES]: `'${formattedTimestamp}'`,
				[DatabaseType.ORACLE]: `TO_TIMESTAMP('${formattedTimestamp}', 'YYYY-MM-DD"T"HH24:MI:SS.FF')`,
				[DatabaseType.SQLSERVER]: `CONVERT(DATETIME2, '${formattedTimestamp}')`,
				[DatabaseType.OTHER]: `'${formattedTimestamp}'`
			};

			return timestampFormats[this.databaseType] || `'${formattedTimestamp}'`;
		} catch (error) {
			console.warn(`Invalid timestamp value: ${value}`);
			return "NULL";
		} finally {
			this.performanceUtils.recordExecutionTime('SQLParser.formatTimestampParam', Date.now() - startTime);
		}
	}

	/**
	 * Format time type parameter
	 */
	private formatTimeParam(value: string): string {
		const startTime = Date.now();
		try {
			// Process time strings in different formats
			let formattedTime = value.trim();

			// Use a map for faster database type lookup
			const timeFormats: Record<DatabaseType, string> = {
				[DatabaseType.MYSQL]: `'${formattedTime}'`,
				[DatabaseType.POSTGRESQL]: `'${formattedTime}'`,
				[DatabaseType.DM]: `'${formattedTime}'`,
				[DatabaseType.KINGBASEES]: `'${formattedTime}'`,
				[DatabaseType.ORACLE]: `TO_DATE('${formattedTime}', 'HH24:MI:SS')`,
				[DatabaseType.SQLSERVER]: `CONVERT(TIME, '${formattedTime}')`,
				[DatabaseType.OTHER]: `'${formattedTime}'`
			};

			return timeFormats[this.databaseType] || `'${formattedTime}'`;
		} catch (error) {
			console.warn(`Invalid time value: ${value}`);
			return "NULL";
		} finally {
			this.performanceUtils.recordExecutionTime('SQLParser.formatTimeParam', Date.now() - startTime);
		}
	}

	/**
	 * Format JSON type parameter with caching
	 */
	private formatJsonParam(value: string): string {
		const startTime = Date.now();
		try {
			// Create cache key
			const cacheKey = `json_param_${value}_${this.databaseType}`;
			let formattedJson: string = this.performanceUtils.getCache(cacheKey) || "";

			if (formattedJson) {
				return formattedJson;
			}

			// Try to parse JSON and re-serialize to ensure validity
			const trimmedValue = value.trim();
			const parsedJson = JSON.parse(trimmedValue);
			const escapedJson = JSON.stringify(parsedJson).replace(/'/g, "''");

			// Use a map for faster database type lookup
			const jsonFormats: Record<DatabaseType, string> = {
				[DatabaseType.MYSQL]: `JSON_OBJECT('json', '${escapedJson}')`,
				[DatabaseType.POSTGRESQL]: `'${escapedJson}'::jsonb`,
				[DatabaseType.ORACLE]: `JSON('${escapedJson}')`,
				[DatabaseType.SQLSERVER]: `'${escapedJson}'`,
				[DatabaseType.DM]: `'${escapedJson}'`,
				[DatabaseType.KINGBASEES]: `'${escapedJson}'::jsonb`,
				[DatabaseType.OTHER]: `'${escapedJson}'`
			};

			formattedJson = jsonFormats[this.databaseType] || `'${escapedJson}'`;

			// Cache the result
			this.performanceUtils.setCache(cacheKey, formattedJson);

			return formattedJson;
		} catch (error) {
			console.warn(`Invalid JSON value: ${value}`);
			return "NULL";
		} finally {
			this.performanceUtils.recordExecutionTime('SQLParser.formatJsonParam', Date.now() - startTime);
		}
	}

	/**
	 * Format array type parameter
	 */
	private formatArrayParam(value: string): string {
		const startTime = Date.now();
		try {
			// Process array format
			let formattedArray = value.trim();

			// Use a map for faster database type lookup
			const arrayFormats: Record<DatabaseType, string> = {
				[DatabaseType.POSTGRESQL]: formattedArray.startsWith("[") && formattedArray.endsWith("]") 
					? `ARRAY${formattedArray}` 
					: formattedArray,
				[DatabaseType.ORACLE]: `SYS.ODCIVARCHAR2LIST(${formattedArray})`,
				// Default format for other databases
				[DatabaseType.MYSQL]: formattedArray,
				[DatabaseType.SQLSERVER]: formattedArray,
				[DatabaseType.DM]: formattedArray,
				[DatabaseType.KINGBASEES]: formattedArray,
				[DatabaseType.OTHER]: formattedArray
			};

			return arrayFormats[this.databaseType] || formattedArray;
		} catch (error) {
			console.warn(`Invalid array value: ${value}`);
			return "NULL";
		} finally {
			this.performanceUtils.recordExecutionTime('SQLParser.formatArrayParam', Date.now() - startTime);
		}
	}

	/**
	 * Format parameter value according to database type and parameter type to prevent SQL injection
	 */
	private formatParameter(value: string, type: string): string {
		const startTime = Date.now();
		try {
			// Create cache key
			const cacheKey = `param_${value}_${type}_${this.databaseType}`;
			let formattedParam: string = this.performanceUtils.getCache(cacheKey) || "";

			if (formattedParam) {
				return formattedParam;
			}

			// Check if there is special parameter type handling
			const typeLower = type.toLowerCase();
			for (const [
				paramType,
				formatFunction,
			] of this.specialParamTypes.entries()) {
				if (typeLower.includes(paramType)) {
					formattedParam = formatFunction(value);
					// Cache the result
					this.performanceUtils.setCache(cacheKey, formattedParam);
					return formattedParam;
				}
			}

			// Process general types
			// Handle empty values
			if (!value || value === "undefined") {
				formattedParam = "NULL";
			} 
			// Handle NULL values
			else if (value.toLowerCase() === "null") {
				formattedParam = "NULL";
			} 
			else {
				// Remove leading and trailing spaces
				const trimmedValue = value.trim();

				if (typeLower.includes("string") || typeLower.includes("char")) {
					// String type, add single quotes
					// Escape single quotes to prevent SQL injection
					const escapedValue = trimmedValue.replace(/'/g, "''");
					formattedParam = `'${escapedValue}'`;
				} else if (typeLower.includes("date") || typeLower.includes("time")) {
					// Date and time types, add appropriate format according to database type
					// Handle common date formats
					let formattedDate = trimmedValue;
					if (trimmedValue.includes("-") && trimmedValue.includes("T")) {
						// ISO format date 2023-01-01T12:00:00
						formattedDate = trimmedValue.split("T")[0];
					}
					formattedParam = `'${formattedDate}'`;
				} else if (typeLower.includes("boolean")) {
					// Boolean type, convert according to database type
					const boolValue = trimmedValue.toLowerCase() === "true";

					const boolFormats: Record<DatabaseType, string> = {
						[DatabaseType.MYSQL]: boolValue ? "1" : "0",
						[DatabaseType.POSTGRESQL]: boolValue ? "1" : "0",
						[DatabaseType.ORACLE]: boolValue ? "TRUE" : "FALSE",
						[DatabaseType.SQLSERVER]: boolValue ? "TRUE" : "FALSE",
						[DatabaseType.DM]: boolValue ? "1" : "0",
						[DatabaseType.KINGBASEES]: boolValue ? "1" : "0",
						[DatabaseType.OTHER]: boolValue ? "1" : "0"
					};

					formattedParam = boolFormats[this.databaseType] || (boolValue ? "1" : "0");
				} else if (
					typeLower.includes("number") ||
					typeLower.includes("int") ||
					typeLower.includes("long") ||
					typeLower.includes("float") ||
					typeLower.includes("double") ||
					typeLower.includes("decimal")
				) {
					// Numeric type, perform simple validation
					const numValue = Number(trimmedValue);
					if (!isNaN(numValue) && isFinite(numValue)) {
						formattedParam = String(numValue);
					} else {
						// If not a valid number, return NULL
						formattedParam = "NULL";
					}
				} 
				// Check if it's a JSON type
				else if (
					typeLower.includes("json") &&
					(trimmedValue.startsWith("{") || trimmedValue.startsWith("["))
				) {
					try {
						// Try to parse JSON and re-serialize to ensure validity
						const parsedJson = JSON.parse(trimmedValue);
						const escapedJson = JSON.stringify(parsedJson).replace(/'/g, "''");
						formattedParam = `'${escapedJson}'`;
					} catch (e) {
						console.warn(`Invalid JSON value: ${trimmedValue} for type: ${type}`);
						formattedParam = "NULL";
					}
				} 
				else {
					// Try to handle other types as strings and log a warning
					console.warn(`Unknown parameter type: ${type} for value: ${value}`);
					const escapedValue = trimmedValue.replace(/'/g, "''");
					formattedParam = `'${escapedValue}'`;
				}
			}

			// Cache the result if not NULL
			if (formattedParam !== "NULL") {
				this.performanceUtils.setCache(cacheKey, formattedParam);
			}

			return formattedParam;
		} catch (error) {
			console.error(
				`Error formatting parameter: ${value} (type: ${type})`,
				error
			);
			return "NULL";
		} finally {
			this.performanceUtils.recordExecutionTime('SQLParser.formatParameter', Date.now() - startTime);
		}
	}

	/**
	 * Process complete SQL query object with caching and performance tracking
	 */
	processSQLQuery(query: SQLQuery): SQLQuery {
		const startTime = Date.now();
		try {
			// Create cache key based on query content
			const cacheKey = `query_${query.id}_${this.databaseType}`;

			// Check if result is already in cache
			const cachedQuery = this.sqlProcessingCache.get(cacheKey);
			if (cachedQuery) {
				return cachedQuery;
			}

			// Deep copy query object to avoid modifying the original object
			const processedQuery: SQLQuery = { ...query };

			// Fill parameters into SQL statement
			if (processedQuery.preparing && processedQuery.parameters) {
				try {
					processedQuery.fullSQL = this.fillParametersToSQL(
						processedQuery.preparing,
						processedQuery.parameters
					);
				} catch (error) {
					console.error("Error filling SQL parameters:", error);
					// Add error message but continue processing
					processedQuery.error = `Parameter filling failed: ${
						error instanceof Error ? error.message : String(error)
					}`;
					processedQuery.fullSQL = processedQuery.preparing;
				}
			}

			// Format SQL statement with caching
			if (processedQuery.fullSQL) {
				try {
					// Use PerformanceUtils withCache for SQL formatting
					processedQuery.formattedSQL = this.performanceUtils.withCache(
						`formatted_sql_${processedQuery.fullSQL}_${this.databaseType}`,
						() => formatSQL(
							processedQuery.fullSQL!,
							this.databaseType
						)
					);
				} catch (error) {
					console.error("Error formatting SQL:", error);
					// Add error message but continue processing
					processedQuery.error = processedQuery.error
						? `${processedQuery.error}\nFormatting failed: ${
								error instanceof Error ? error.message : String(error)
						  }`
						: `Formatting failed: ${
								error instanceof Error ? error.message : String(error)
						  }`;
					processedQuery.formattedSQL = processedQuery.fullSQL;
				}
			}

			// Generate SQL highlighted HTML with caching
			if (processedQuery.formattedSQL) {
				try {
					// Use PerformanceUtils withCache for SQL highlighting
					processedQuery.highlightedSQL = this.performanceUtils.withCache(
						`highlighted_sql_${processedQuery.formattedSQL}_${this.databaseType}`,
						() => highlightSQL(
							processedQuery.formattedSQL!,
							this.databaseType
						)
					);
				} catch (error) {
					console.error("Error highlighting SQL:", error);
					// Even if highlighting fails, it doesn't affect usage, continue to return original SQL
					processedQuery.highlightedSQL = processedQuery.formattedSQL;
				}
			}

			// Extract SQL operation type (SELECT, INSERT, UPDATE, DELETE, etc.) with caching
			if (processedQuery.preparing) {
				processedQuery.operationType = this.extractSQLOperationType(
					processedQuery.preparing
				);
			} else if (processedQuery.fullSQL) {
				processedQuery.operationType = this.extractSQLOperationType(
					processedQuery.fullSQL
				);
			}

			// Add processing timestamp
			processedQuery.processedAt = new Date().toISOString();

			// Cache the processed query
			this.sqlProcessingCache.set(cacheKey, processedQuery);

			return processedQuery;
		} catch (error) {
			console.error("Error processing SQL query:", error);
			// Return original query object but add error message
			return {
				...query,
				error: `Query processing failed: ${
					error instanceof Error ? error.message : String(error)
				}`,
			};
		} finally {
			this.performanceUtils.recordExecutionTime('SQLParser.processSQLQuery', Date.now() - startTime);
		}
	}

	/**
	 * Extract operation type from SQL statement (SELECT, INSERT, UPDATE, DELETE, etc.) with caching
	 */
	private extractSQLOperationType(sql: string): string {
		const startTime = Date.now();
		try {
			// Create cache key
			const cacheKey = `operation_type_${sql.trim().toLowerCase()}`;
			let operationType: string = this.performanceUtils.getCache(cacheKey) || "";

			if (operationType) {
				return operationType;
			}

			// Remove all content before non-whitespace characters
			const trimmedSQL = sql.trim().toUpperCase();

			// Look for common SQL operation keywords
			const operationTypes = [
				"SELECT",
				"INSERT",
				"UPDATE",
				"DELETE",
				"MERGE",
				"CREATE",
				"DROP",
				"ALTER",
				"TRUNCATE",
				"EXEC",
				"CALL",
			];

			for (const operation of operationTypes) {
				// Get or create regex from cache
				let operationRegex = this.operationTypeRegexCache.get(operation);
				if (!operationRegex) {
					operationRegex = this.regexUtils.getRegex(`^${operation}\s`, "i");
					if (operationRegex) {
						this.operationTypeRegexCache.set(operation, operationRegex);
					} else {
						continue;
					}
				}

				if (operationRegex && operationRegex.test(trimmedSQL)) {
					// Reset regex lastIndex
					operationRegex.lastIndex = 0;
					operationType = operation;
					break;
				}
				// Reset regex lastIndex
				if (operationRegex) {
					operationRegex.lastIndex = 0;
				}
			}

			// If no clear operation type is found, return generic type
			operationType = operationType || "SQL";

			// Cache the result
			this.performanceUtils.setCache(cacheKey, operationType);

			return operationType;
		} catch (error) {
			console.warn("Error extracting SQL operation type:", error);
			return "SQL";
		} finally {
			this.performanceUtils.recordExecutionTime('SQLParser.extractSQLOperationType', Date.now() - startTime);
		}
	}

	/**
	 * Clear SQL processing cache
	 */
	public clearCache(): void {
		this.sqlProcessingCache.clear();
	}

	/**
	 * Dispose resources and clear all caches
	 */
	public dispose(): void {
		this.clearCache();
		this.operationTypeRegexCache.clear();
		this.performanceUtils.clearCache();
	}
}
