import { formatSQL, highlightSQL, safeRegexMatch } from "../utils";
import { DatabaseType, SQLQuery } from "../types";

/**
 * SQL parser for parsing SQL statements and parameters from MyBatis logs
 */
export class SQLParser {
	private databaseType: DatabaseType;

	// Cache regular expressions for performance improvement
	private preparingRegex = /Preparing:\s*(.+)/i;
	private parametersRegex = /Parameters:\s*(.+)/i;
	private executionTimeRegex = /Executed\s+in\s+(\d+)ms/i;
	private readonly paramRegex = /([^,\(]+)\(([^\)]+)\)/g;

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
	}

	/**
	 * Set database type
	 */
	setDatabaseType(type: DatabaseType): void {
		this.databaseType = type;
	}

	/**
	 * Set custom regular expressions
	 */
	setCustomPatterns(
		preparingPattern?: string,
		parametersPattern?: string,
		executionTimePattern?: string
	): void {
		try {
			if (preparingPattern) {
				this.preparingRegex = new RegExp(preparingPattern, "i");
			}

			if (parametersPattern) {
				this.parametersRegex = new RegExp(parametersPattern, "i");
			}

			if (executionTimePattern) {
				this.executionTimeRegex = new RegExp(executionTimePattern, "i");
			}
		} catch (error) {
			console.error("Error setting custom regular expressions:", error);
			// Keep original configuration if there's an error
		}
	}

	/**
	 * Reset to default regular expressions
	 */
	resetToDefaultPatterns(): void {
		this.preparingRegex = /Preparing:\s*(.+)/i;
		this.parametersRegex = /Parameters:\s*(.+)/i;
		this.executionTimeRegex = /Executed\s+in\s+(\d+)ms/i;
	}

	/**
	 * Parse log line for preparing SQL statement
	 */
	parsePreparingLog(line: string): string | null {
		const preparingMatch = safeRegexMatch(line, this.preparingRegex);
		if (preparingMatch && preparingMatch[1]) {
			return preparingMatch[1].trim();
		}
		return null;
	}

	/**
	 * Parse log line for parameters
	 */
	parseParametersLog(
		line: string
	): Array<{ value: string; type: string }> | null {
		const parametersMatch = safeRegexMatch(line, this.parametersRegex);
		if (!parametersMatch || !parametersMatch[1]) {
			return null;
		}

		const paramsString = parametersMatch[1];
		const params: Array<{ value: string; type: string }> = [];

		// Reset regex state
		this.paramRegex.lastIndex = 0;

		let paramMatch;
		while ((paramMatch = this.paramRegex.exec(paramsString)) !== null) {
			const value = paramMatch[1].trim();
			const type = paramMatch[2].trim();
			params.push({ value, type });
		}

		return params.length > 0 ? params : null;
	}

	/**
	 * Parse log line for execution time
	 */
	parseExecutionTimeLog(line: string): number | null {
		const timeMatch = safeRegexMatch(line, this.executionTimeRegex);
		if (timeMatch && timeMatch[1]) {
			return parseInt(timeMatch[1], 10);
		}
		return null;
	}

	/**
	 * Fill parameters into SQL statement
	 */
	fillParametersToSQL(
		sql: string,
		params: Array<{ value: string; type: string }>
	): string {
		let filledSQL = sql;

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

		// Process array parameter expansion (IN clause)
		if (params && params.length > 0) {
			for (let i = 0; i < params.length; i++) {
				const param = params[i];
				if (
					param.type &&
					(param.type.toLowerCase().includes("array") ||
						param.type.toLowerCase().includes("list"))
				) {
					try {
						// Try to parse array content
						const arrayValue = param.value
							.replace(/\[/g, "")
							.replace(/\]/g, "");
						const arrayItems = arrayValue.split(",").map((item) => item.trim());

						// Find IN clause containing this parameter position
						// Since we don't have parameter names, we need to identify based on parameter position in original list
						// This is a simplified method, mainly used for handling question mark parameters that have been replaced
						const placeholder = this.formatParameter(param.value, param.type);
						const inClauseRegex = new RegExp(
							`IN\s*\(\s*${placeholder.replace(
								/[.*+?^${}()|[\]\\]/g,
								"\\$&"
							)}\s*\)`,
							"gi"
						);

						if (inClauseRegex.test(filledSQL)) {
							// Format each array element
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

							filledSQL = filledSQL.replace(
								inClauseRegex,
								`IN (${formattedItems})`
							);
						}
					} catch (error) {
						console.warn(
							`Failed to expand array parameter at index ${i}:`,
							error
						);
						// Skip array expansion and keep original if there's an error
					}
				}
			}
		}

		return filledSQL;
	}

	/**
	 * Infer element type from array type
	 */
	private getArrayItemType(arrayType: string): string {
		// Try to extract element type from array type name
		// Example: String[] -> string, List<Integer> -> integer
		const match = arrayType.match(/^(?:Array<|List<|)(\w+)/i);
		if (match && match[1]) {
			return match[1].toLowerCase();
		}
		// Default to string type
		return "string";
	}

	/**
	 * Format boolean type parameter
	 */
	private formatBooleanParam(value: string): string {
		const boolValue = value.toLowerCase() === "true" || value === "1";

		switch (this.databaseType) {
			case DatabaseType.MYSQL:
			case DatabaseType.POSTGRESQL:
				return boolValue ? "1" : "0";
			case DatabaseType.ORACLE:
				return boolValue ? "1" : "0"; // Oracle uses numbers to represent boolean values
			case DatabaseType.SQLSERVER:
				return boolValue ? "1" : "0"; // SQL Server uses BIT type
			case DatabaseType.DM:
			case DatabaseType.KINGBASEES:
				return boolValue ? "1" : "0"; // Domestic databases are usually compatible with MySQL style
			default:
				return boolValue ? "1" : "0";
		}
	}

	/**
	 * Format date type parameter
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
			console.warn(`Invalid date value: ${value}`);
			return "NULL";
		}
	}

	/**
	 * Format timestamp type parameter
	 */
	private formatTimestampParam(value: string): string {
		try {
			// Process timestamp strings in different formats
			let formattedTimestamp = value.trim();

			// Adjust timestamp format according to database type
			switch (this.databaseType) {
				case DatabaseType.MYSQL:
				case DatabaseType.POSTGRESQL:
				case DatabaseType.DM:
				case DatabaseType.KINGBASEES:
					// Keep original format, add quotes
					return `'${formattedTimestamp}'`;
				case DatabaseType.ORACLE:
					// Oracle uses TO_TIMESTAMP function
					return `TO_TIMESTAMP('${formattedTimestamp}', 'YYYY-MM-DD"T"HH24:MI:SS.FF')`;
				case DatabaseType.SQLSERVER:
					// SQL Server uses CONVERT function
					return `CONVERT(DATETIME2, '${formattedTimestamp}')`;
				default:
					return `'${formattedTimestamp}'`;
			}
		} catch (error) {
			console.warn(`Invalid timestamp value: ${value}`);
			return "NULL";
		}
	}

	/**
	 * Format time type parameter
	 */
	private formatTimeParam(value: string): string {
		try {
			// Process time strings in different formats
			let formattedTime = value.trim();

			// Adjust time format according to database type
			switch (this.databaseType) {
				case DatabaseType.MYSQL:
				case DatabaseType.POSTGRESQL:
				case DatabaseType.DM:
				case DatabaseType.KINGBASEES:
					// Keep original format, add quotes
					return `'${formattedTime}'`;
				case DatabaseType.ORACLE:
					// Oracle uses TO_DATE function
					return `TO_DATE('${formattedTime}', 'HH24:MI:SS')`;
				case DatabaseType.SQLSERVER:
					// SQL Server uses CONVERT function
					return `CONVERT(TIME, '${formattedTime}')`;
				default:
					return `'${formattedTime}'`;
			}
		} catch (error) {
			console.warn(`Invalid time value: ${value}`);
			return "NULL";
		}
	}

	/**
	 * Format JSON type parameter
	 */
	private formatJsonParam(value: string): string {
		try {
			// Try to parse JSON and re-serialize to ensure validity
			const trimmedValue = value.trim();
			const parsedJson = JSON.parse(trimmedValue);
			const escapedJson = JSON.stringify(parsedJson).replace(/'/g, "''");

			// Adjust JSON format according to database type
			switch (this.databaseType) {
				case DatabaseType.MYSQL:
					return `JSON_OBJECT('json', '${escapedJson}')`;
				case DatabaseType.POSTGRESQL:
					return `'${escapedJson}'::jsonb`;
				case DatabaseType.ORACLE:
					return `JSON('${escapedJson}')`;
				case DatabaseType.SQLSERVER:
					return `'${escapedJson}'`;
				case DatabaseType.DM:
					return `'${escapedJson}'`;
				case DatabaseType.KINGBASEES:
					return `'${escapedJson}'::jsonb`;
				default:
					return `'${escapedJson}'`;
			}
		} catch (error) {
			console.warn(`Invalid JSON value: ${value}`);
			return "NULL";
		}
	}

	/**
	 * Format array type parameter
	 */
	private formatArrayParam(value: string): string {
		try {
			// Process array format
			let formattedArray = value.trim();

			// Adjust array format according to database type
			switch (this.databaseType) {
				case DatabaseType.POSTGRESQL:
					// PostgreSQL array format: ARRAY[1, 2, 3]
					if (formattedArray.startsWith("[") && formattedArray.endsWith("]")) {
						return `ARRAY${formattedArray}`;
					}
					return formattedArray;
				case DatabaseType.ORACLE:
					// Oracle uses collections
					return `SYS.ODCIVARCHAR2LIST(${formattedArray})`;
				default:
					// Other databases may not directly support arrays, return original value
					return formattedArray;
			}
		} catch (error) {
			console.warn(`Invalid array value: ${value}`);
			return "NULL";
		}
	}

	/**
	 * Format parameter value according to database type and parameter type to prevent SQL injection
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
			if (value.toLowerCase() === "null") {
				return "NULL";
			}

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

				if (
					this.databaseType === DatabaseType.MYSQL ||
					this.databaseType === DatabaseType.POSTGRESQL
				) {
					return boolValue ? "1" : "0";
				} else if (
					this.databaseType === DatabaseType.ORACLE ||
					this.databaseType === DatabaseType.SQLSERVER
				) {
					return boolValue ? "TRUE" : "FALSE";
				}
				// Default to numeric representation
				return boolValue ? "1" : "0";
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
				}
				// If not a valid number, return NULL
				return "NULL";
			}

			// Check if it's a JSON type
			if (
				typeLower.includes("json") &&
				(trimmedValue.startsWith("{") || trimmedValue.startsWith("["))
			) {
				try {
					// Try to parse JSON and re-serialize to ensure validity
					const parsedJson = JSON.parse(trimmedValue);
					const escapedJson = JSON.stringify(parsedJson).replace(/'/g, "''");
					return `'${escapedJson}'`;
				} catch (e) {
					console.warn(`Invalid JSON value: ${trimmedValue} for type: ${type}`);
					return "NULL";
				}
			}

			// Try to handle other types as strings and log a warning
			console.warn(`Unknown parameter type: ${type} for value: ${value}`);
			const escapedValue = trimmedValue.replace(/'/g, "''");
			return `'${escapedValue}'`;
		} catch (error) {
			console.error(
				`Error formatting parameter: ${value} (type: ${type})`,
				error
			);
			return "NULL";
		}
	}

	/**
	 * Process complete SQL query object, including parameter filling, formatting and highlighting
	 */
	processSQLQuery(query: SQLQuery): SQLQuery {
		try {
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

			// Format SQL statement
			if (processedQuery.fullSQL) {
				try {
					processedQuery.formattedSQL = formatSQL(
						processedQuery.fullSQL,
						this.databaseType
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

			// Generate SQL highlighted HTML
			if (processedQuery.formattedSQL) {
				try {
					processedQuery.highlightedSQL = highlightSQL(
						processedQuery.formattedSQL,
						this.databaseType
					);
				} catch (error) {
					console.error("Error highlighting SQL:", error);
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
		}
	}

	/**
	 * Extract operation type from SQL statement (SELECT, INSERT, UPDATE, DELETE, etc.)
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
				const regex = new RegExp(`^${operation}\s`, "i");
				if (regex.test(trimmedSQL)) {
					return operation;
				}
			}

			// If no clear operation type is found, return generic type
			return "SQL";
		} catch (error) {
			console.warn("Error extracting SQL operation type:", error);
			return "SQL";
		}
	}
}
