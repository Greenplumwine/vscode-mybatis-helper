import { formatSQL, highlightSQL, safeRegexMatch } from "../utils";
import { DatabaseType, SQLQuery } from "../types";
import { logger } from "../utils/logger";
import { THRESHOLDS } from "../utils/constants";

/**
 * SQL parser for parsing SQL statements and parameters from MyBatis logs
 */
export class SQLParser {
	private databaseType: DatabaseType;

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

	/**
	 * Creates a new SQLParser instance
	 * @param databaseType The database type to use for parsing (default: MySQL)
	 */
	constructor(databaseType: DatabaseType = DatabaseType.MYSQL) {
		this.databaseType = databaseType;
	}

	/**
	 * Set database type and clear relevant caches
	 * @param type The database type to set
	 */
	setDatabaseType(type: DatabaseType): void {
		try {
			this.databaseType = type;
			// Clear SQL processing cache when database type changes
			this.clearCache();
		} catch (error) {
			logger.error(`Error setting database type: ${error instanceof Error ? error.message : String(error)}`);
		}
	}

	/**
	 * Set custom regular expressions and clear regex cache
	 * @param preparingPattern Optional custom pattern for preparing SQL statements
	 * @param parametersPattern Optional custom pattern for parameters
	 * @param executionTimePattern Optional custom pattern for execution time
	 */
	setCustomPatterns(
		preparingPattern?: string,
		parametersPattern?: string,
		executionTimePattern?: string
	): void {
		try {
			// Clear operation type regex cache when patterns change
			this.operationTypeRegexCache.clear();

			if (preparingPattern) {
				try {
					this.preparingRegex = new RegExp(preparingPattern, "i");
				} catch (error) {
					logger.error(`Error setting preparing regex: ${error instanceof Error ? error.message : String(error)}`);
				}
			}

			if (parametersPattern) {
				try {
					this.parametersRegex = new RegExp(parametersPattern, "i");
				} catch (error) {
					logger.error(`Error setting parameters regex: ${error instanceof Error ? error.message : String(error)}`);
				}
			}

			if (executionTimePattern) {
				try {
					this.executionTimeRegex = new RegExp(executionTimePattern, "i");
				} catch (error) {
					logger.error(`Error setting execution time regex: ${error instanceof Error ? error.message : String(error)}`);
				}
			}
		} catch (error) {
			logger.error(`Error setting custom patterns: ${error instanceof Error ? error.message : String(error)}`);
		}
	}

	/**
	 * Reset to default regular expressions and clear caches
	 */
	resetToDefaultPatterns(): void {
		try {
			this.preparingRegex = /Preparing:\s*(.+)/i;
			this.parametersRegex = /Parameters:\s*(.+)/i;
			this.executionTimeRegex = /Executed\s+in\s+(\d+)ms/i;
			this.operationTypeRegexCache.clear();
			this.clearCache();
		} catch (error) {
			logger.error(`Error resetting to default patterns: ${error instanceof Error ? error.message : String(error)}`);
		}
	}

	/**
	 * Parse log line for preparing SQL statement
	 * @param line The log line to parse
	 * @returns The parsed SQL statement or null if no match found
	 */
	parsePreparingLog(line: string): string | null {
		try {
			return safeRegexMatch(line, this.preparingRegex)?.[1]?.trim() || null;
		} catch (error) {
			logger.error(`Error parsing preparing log: ${error instanceof Error ? error.message : String(error)}`);
			return null;
		}
	}

	/**
	 * Parse log line for parameters
	 * @param line The log line to parse
	 * @returns Array of parameter objects with value and type, or null if no match found
	 */
	parseParametersLog(
		line: string
	): Array<{ value: string; type: string }> | null {
		try {
			const parametersMatch = safeRegexMatch(line, this.parametersRegex);
			if (!parametersMatch || !parametersMatch[1]) {
				return null;
			}

			const paramsString = parametersMatch[1];
			const params: Array<{ value: string; type: string }> = [];

			// Reset regex state
			this.paramRegex.lastIndex = 0;

			// Batch process parameters
			const paramBatchSize = THRESHOLDS.PARAM_BATCH_SIZE;
			let paramMatch;
			let paramCount = 0;

			while ((paramMatch = this.paramRegex.exec(paramsString)) !== null && paramCount < paramBatchSize) {
				const value = paramMatch[1].trim();
				const type = paramMatch[2].trim();
				params.push({ value, type });
				paramCount++;

				// Prevent infinite loops
				if (paramCount > THRESHOLDS.MAX_PARAM_COUNT) {
					logger.warn('Possible infinite loop detected in parameter parsing');
					break;
				}
			}

			return params.length > 0 ? params : null;
		} catch (error) {
			logger.error(`Error parsing parameters log: ${error instanceof Error ? error.message : String(error)}`);
			return null;
		}
	}

	/**
	 * Parse log line for execution time
	 * @param line The log line to parse
	 * @returns The execution time in milliseconds or null if no match found
	 */
	parseExecutionTimeLog(line: string): number | null {
		try {
			const timeMatch = safeRegexMatch(line, this.executionTimeRegex);
			if (timeMatch && timeMatch[1]) {
				return parseInt(timeMatch[1], 10);
			}
			return null;
		} catch (error) {
			logger.error(`Error parsing execution time log: ${error instanceof Error ? error.message : String(error)}`);
			return null;
		}
	}

	/**
	 * Fill parameters into SQL statement
	 * @param sql The SQL statement with placeholders
	 * @param params Array of parameter objects with value and type
	 * @returns The SQL statement with filled parameters
	 */
	fillParametersToSQL(
		sql: string,
		params: Array<{ value: string; type: string }>
	): string {
		try {
			// Create cache key based on SQL and parameters
			const cacheKey = `${sql}_${JSON.stringify(params)}`;
			
			let filledSQL: string = "";

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

			return filledSQL;
		} catch (error) {
			logger.error(`Error filling parameters to SQL: ${error instanceof Error ? error.message : String(error)}`);
			return sql; // Return original SQL on error
		}
	}

	/**
	 * Process array parameters in SQL
	 * @param filledSQL The SQL statement with filled parameters
	 * @param params Array of parameter objects with value and type
	 * @returns The SQL statement with processed array parameters
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
				logger.warn(
					`Failed to expand array parameter at index ${i}: ${error instanceof Error ? error.message : String(error)}`
				);
				// Skip array expansion and keep original if there's an error
				continue;
			}
		}
		return resultSQL;
	}

	/**
	 * Infer element type from array type
	 * @param arrayType The array type string
	 * @returns The inferred element type
	 */
	private getArrayItemType(arrayType: string): string {
		try {
			// Try to extract element type from array type name
			// Example: String[] -> string, List<Integer> -> integer
			const arrayTypeRegex = /^(?:Array<|List<|)(\w+)/i;
			const match = safeRegexMatch(arrayType, arrayTypeRegex);

			if (match && match[1]) {
				return match[1].toLowerCase();
			} else {
				// Default to string type
				return "string";
			}
		} catch (error) {
			logger.error(`Error inferring array item type: ${error instanceof Error ? error.message : String(error)}`);
			return "string"; // Default to string on error
		}
	}

	/**
	 * Format boolean type parameter
	 * @param value The boolean value to format
	 * @returns The formatted boolean value according to database type
	 */
	private formatBooleanParam(value: string): string {
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
		} catch (error) {
			logger.error(`Error formatting boolean parameter: ${error instanceof Error ? error.message : String(error)}`);
			return "NULL";
		}
	}

	/**
	 * Format date type parameter
	 * @param value The date value to format
	 * @returns The formatted date value according to database type
	 */
	private formatDateParam(value: string): string {
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
			logger.warn(`Invalid date value: ${value}`);
			return "NULL";
		}
	}

	/**
	 * Format timestamp type parameter
	 * @param value The timestamp value to format
	 * @returns The formatted timestamp value according to database type
	 */
	private formatTimestampParam(value: string): string {
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
			logger.warn(`Invalid timestamp value: ${value}`);
			return "NULL";
		}
	}

	/**
	 * Format time type parameter
	 * @param value The time value to format
	 * @returns The formatted time value according to database type
	 */
	private formatTimeParam(value: string): string {
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
			logger.warn(`Invalid time value: ${value}`);
			return "NULL";
		}
	}

	/**
	 * Format JSON type parameter
	 * @param value The JSON value to format
	 * @returns The formatted JSON value according to database type
	 */
	private formatJsonParam(value: string): string {
		try {
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

			return jsonFormats[this.databaseType] || `'${escapedJson}'`;
		} catch (error) {
			logger.warn(`Invalid JSON value: ${value}`);
			return "NULL";
		}
	}

	/**
	 * Format array type parameter
	 * @param value The array value to format
	 * @returns The formatted array value according to database type
	 */
	private formatArrayParam(value: string): string {
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
			logger.warn(`Invalid array value: ${value}`);
			return "NULL";
		}
	}

	/**
	 * Format parameter value according to database type and parameter type to prevent SQL injection
	 * @param value The parameter value to format
	 * @param type The parameter type
	 * @returns The formatted parameter value
	 */
	private formatParameter(value: string, type: string): string {
		try {
			// Check if there is special parameter type handling
			const typeLower = type.toLowerCase();
			for (const [
				paramType,
				formatFunction,
			] of this.specialParamTypes.entries()) {
				if (typeLower.includes(paramType)) {
					return formatFunction(value);
				}
			}

			// Process general types
			// Handle empty values
			if (!value || value === "undefined") {
				return "NULL";
			} 
			// Handle NULL values
			else if (value.toLowerCase() === "null") {
				return "NULL";
			} 
			else {
				// Remove leading and trailing spaces
				const trimmedValue = value.trim();

				if (typeLower.includes("string") || typeLower.includes("char")) {
					// String type, add single quotes
					// Escape single quotes to prevent SQL injection
					const escapedValue = trimmedValue.replace(/'/g, "''");
					return `'${escapedValue}'`;
				} else if (typeLower.includes("date") || typeLower.includes("time")) {
					// Date and time types, add appropriate format according to database type
					// Handle common date formats
					let formattedDate = trimmedValue;
					if (trimmedValue.includes("-") && trimmedValue.includes("T")) {
						// ISO format date 2023-01-01T12:00:00
						formattedDate = trimmedValue.split("T")[0];
					}
					return `'${formattedDate}'`;
				} else if (typeLower.includes("boolean")) {
					// Boolean type, convert according to database type
					const boolValue = trimmedValue.toLowerCase() === "true";

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
						return String(numValue);
					} else {
						// If not a valid number, return NULL
						return "NULL";
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
						return `'${escapedJson}'`;
					} catch (e) {
						logger.warn(`Invalid JSON value: ${trimmedValue} for type: ${type}`);
						return "NULL";
					}
				} 
				else {
					// Try to handle other types as strings and log a warning
					logger.warn(`Unknown parameter type: ${type} for value: ${value}`);
					const escapedValue = trimmedValue.replace(/'/g, "''");
					return `'${escapedValue}'`;
				}
			}
		} catch (error) {
			logger.error(
				`Error formatting parameter: ${value} (type: ${type}): ${error instanceof Error ? error.message : String(error)}`
			);
			return "NULL";
		}
	}

	/**
	 * Process complete SQL query object with caching
	 * @param query The SQL query object to process
	 * @returns The processed SQL query object with fullSQL, formattedSQL, and highlightedSQL
	 */
	processSQLQuery(query: SQLQuery): SQLQuery {
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
					// Add error message but continue processing
					processedQuery.error = `Parameter filling failed: ${
						error instanceof Error ? error.message : String(error)
					}`;
					processedQuery.fullSQL = processedQuery.preparing;
					logger.error("Error filling SQL parameters:", error instanceof Error ? error : new Error(String(error)));
				}
			}

			// Format SQL statement
			if (processedQuery.fullSQL) {
				try {
					processedQuery.formattedSQL = formatSQL(
						processedQuery.fullSQL!,
						this.databaseType
					);
				} catch (error) {
					logger.error("Error formatting SQL:", error instanceof Error ? error : new Error(String(error)));
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

			// Generate SQL highlighted HTML
			if (processedQuery.formattedSQL) {
				try {
					processedQuery.highlightedSQL = highlightSQL(
						processedQuery.formattedSQL!,
						this.databaseType
					);
				} catch (error) {
					logger.error("Error highlighting SQL:", error instanceof Error ? error : new Error(String(error)));
					// Even if highlighting fails, it doesn't affect usage, continue to return original SQL
					processedQuery.highlightedSQL = processedQuery.formattedSQL;
				}
			}

			// Extract SQL operation type (SELECT, INSERT, UPDATE, DELETE, etc.)
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
			logger.error(`Error processing SQL query: ${error instanceof Error ? error.message : String(error)}`);
			// Return original query object but add error message
			return {
				...query,
				error: `Query processing failed: ${
					error instanceof Error ? error.message : String(error)
				}`,
			};
		}
	}

	/**
	 * Extract operation type from SQL statement (SELECT, INSERT, UPDATE, DELETE, etc.)
	 * @param sql The SQL statement to extract operation type from
	 * @returns The extracted operation type
	 */
	private extractSQLOperationType(sql: string): string {
		try {
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
					operationRegex = new RegExp(`^${operation}\s`, "i");
					this.operationTypeRegexCache.set(operation, operationRegex);
				}

				if (operationRegex && operationRegex.test(trimmedSQL)) {
					// Reset regex lastIndex
					operationRegex.lastIndex = 0;
					return operation;
				}
				// Reset regex lastIndex
				operationRegex.lastIndex = 0;
			}

			// If no clear operation type is found, return generic type
			return "SQL";
		} catch (error) {
			logger.warn(`Error extracting SQL operation type: ${error instanceof Error ? error.message : String(error)}`);
			return "SQL";
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
	}
}
