import * as vscode from "vscode";
import { SQLQuery, DatabaseType } from "../types";
import { formatSQL, highlightSQL, getPluginConfig } from "../utils";
import { PerformanceUtils } from '../utils/performanceUtils';
import { RegexUtils } from '../utils';

/**
 * SQL result displayer, responsible for displaying SQL query results in a user-friendly way
 */
export class SQLResultDisplayer {
	private webviewPanel: vscode.WebviewPanel | undefined;
	private extensionUri: vscode.Uri;
	private currentQuery: SQLQuery | null = null;
	private databaseType: DatabaseType;
	private performanceUtils: PerformanceUtils;
	private regexUtils: RegexUtils;
	private searchRegexCache: Map<string, RegExp> = new Map();
	private formattedSQLCache: Map<string, string> = new Map();
	private highlightedSQLCache: Map<string, string> = new Map();
	private updateWebviewContent: () => void;

	constructor(extensionUri: vscode.Uri) {
		this.extensionUri = extensionUri;
		const config = getPluginConfig();
		this.databaseType = config.databaseType;
		this.performanceUtils = PerformanceUtils.getInstance();
		this.updateWebviewContent = this.performanceUtils.debounce(() => {
			const startTime = Date.now();
			try {
				if (!this.webviewPanel || !this.currentQuery) {
					vscode.window.showErrorMessage(
						vscode.l10n.t("sqlResult.webviewNotInitialized")
					);
					return;
				}

				this.webviewPanel.webview.html = this.getWebviewContent();
			} catch (error) {
				console.error("Error updating webview content:", error);
				vscode.window.showErrorMessage(
					vscode.l10n.t("sqlResult.updateContentError")
				);
			} finally {
				this.performanceUtils.recordExecutionTime('SQLResultDisplayer.updateWebviewContent', Date.now() - startTime);
			}
		}, 300);
		this.regexUtils = RegexUtils.getInstance();
	}

	/**
	 * Show SQL query result
	 */
	showSQLResult(query: SQLQuery): void {
		const startTime = Date.now();
		try {
			this.currentQuery = query;

			// If there's no complete SQL, don't display
			if (!query.fullSQL) {
				return;
			}

			// Create or get webview panel
			if (!this.webviewPanel) {
				this.createWebviewPanel();
			} else {
				// Refresh webview content
				this.updateWebviewContent();
				// Show panel
				this.webviewPanel.reveal(vscode.ViewColumn.Beside);
			}
		} finally {
			this.performanceUtils.recordExecutionTime('SQLResultDisplayer.showSQLResult', Date.now() - startTime);
		}
	}

	/**
	 * Show SQL query result (alias method, called by external commands)
	 */
	displaySQL(query: SQLQuery): void {
		this.showSQLResult(query);
	}

	/**
	 * Create webview panel with debouncing to prevent multiple creations
	 */
	private createWebviewPanel(): void {
		const startTime = Date.now();
		try {
			if (!this.currentQuery) {
				vscode.window.showErrorMessage(
					vscode.l10n.t("sqlResult.webviewNotInitialized")
				);
				return;
			}

			this.webviewPanel = vscode.window.createWebviewPanel(
				"mybatis-sql-result",
				vscode.l10n.t("sqlResult.title", { queryId: this.currentQuery.id }),
				vscode.ViewColumn.Beside,
				{
					enableScripts: true,
					retainContextWhenHidden: true,
					localResourceRoots: [vscode.Uri.joinPath(this.extensionUri, "media")],
				}
			);

			// Set webview content
			this.updateWebviewContent();

			// Handle panel close
			this.webviewPanel.onDidDispose(() => {
				this.webviewPanel = undefined;
				// Clear caches when panel is closed
				this.searchRegexCache.clear();
			});

			// Handle messages from webview with debouncing for frequent events
			const debouncedSearch = this.performanceUtils.debounce((message: any) => {
				this.processWebviewMessage(message);
			}, 300);

			this.webviewPanel.webview.onDidReceiveMessage(
				(message) => {
					// Use debounced processing for search and other frequent events
					if (message.command === 'search' || message.command === 'copyToClipboard' || message.command === 'copyFormattedToClipboard') {
						debouncedSearch(message);
					} else {
						// Process other commands immediately
						this.processWebviewMessage(message);
					}
				},
				undefined,
				undefined
			);
		} finally {
			this.performanceUtils.recordExecutionTime('SQLResultDisplayer.createWebviewPanel', Date.now() - startTime);
		}
	}

	/**
	 * Process messages from webview
	 */
	private processWebviewMessage(message: any): void {
		const startTime = Date.now();
		try {
			switch (message.command) {
				case "copyToClipboard":
					this.copySQLToClipboard(message.text);
					break;
				case "copyFormattedToClipboard":
					this.copyFormattedSQLToClipboard(message.text);
					break;
				case "refresh":
					this.refreshData();
					break;
				case "search":
					this.searchSQL(message.text);
					break;
				case "clearSearch":
					this.clearSearch();
					break;
			}
		} finally {
			this.performanceUtils.recordExecutionTime('SQLResultDisplayer.processWebviewMessage', Date.now() - startTime);
		}
	}

	/**
	 * Update webview content with caching
	 */	
	// updateWebviewContent is initialized in the constructor

	/**
	 * Generate webview content with caching for SQL formatting and highlighting
	 */
	private getWebviewContent(): string {
		const startTime = Date.now();
		try {
			if (!this.currentQuery) {
				return vscode.l10n.t("sqlResult.processingError");
			}

			const sqlQuery = this.currentQuery.fullSQL || "";
			
			// Use cached formatted SQL if available
			let formattedSQL = this.formattedSQLCache.get(sqlQuery);
			if (!formattedSQL) {
				formattedSQL = formatSQL(sqlQuery);
				this.formattedSQLCache.set(sqlQuery, formattedSQL);
			}

			// Use cached highlighted SQL if available
			const cacheKey = `${sqlQuery}_${this.databaseType}`;
			let highlightedSQL = this.highlightedSQLCache.get(cacheKey);
			if (!highlightedSQL) {
				highlightedSQL = highlightSQL(formattedSQL, this.databaseType);
				this.highlightedSQLCache.set(cacheKey, highlightedSQL);
			}

			// Create nonce for script security
			const nonce = this.getNonce();

			// Get media file URIs
			const codiconsUri = this.webviewPanel?.webview.asWebviewUri(
				vscode.Uri.joinPath(this.extensionUri, "media", "codicons.css")
			);

			const stylesUri = this.webviewPanel?.webview.asWebviewUri(
				vscode.Uri.joinPath(this.extensionUri, "media", "styles.css")
			);

			const scriptUri = this.webviewPanel?.webview.asWebviewUri(
				vscode.Uri.joinPath(this.extensionUri, "media", "script.js")
			);

			return `
<!DOCTYPE html>
<html lang="en">
<head>
    <meta charset="UTF-8">
    <meta name="viewport" content="width=device-width, initial-scale=1.0">
    <title>${vscode.l10n.t("sqlResult.sqlQueryResult")}</title>
    <link href="${codiconsUri}" rel="stylesheet">
    <link href="${stylesUri}" rel="stylesheet">
</head>
<body>
    <div class="container">
        <div class="header">
            <h1>${vscode.l10n.t("sqlResult.sqlQueryResult")}</h1>
            <div class="header-info">
                <span class="query-id">ID: ${this.currentQuery.id}</span>
                <span class="database-type">${vscode.l10n.t(
					"sqlResult.databaseType"
				)}: ${this.databaseType}</span>
                ${this.currentQuery.executedTime
					? `<span class="execution-time">${vscode.l10n.t(
							"sqlResult.executionTime"
						  )}: ${this.currentQuery.executedTime}ms</span>`
					: ""}
            </div>
        </div>
        
        <div class="toolbar">
            <div class="search-container">
                <input type="text" id="search-input" placeholder="${vscode.l10n.t(
					"sqlResult.searchPlaceholder"
				)}">
                <button id="search-button" class="icon-button" title="${vscode.l10n.t(
					"sqlResult.searchButton"
				)}">
                    <span class="codicon codicon-search"></span>
                </button>
                <button id="clear-search-button" class="icon-button" title="${vscode.l10n.t(
					"sqlResult.clearSearchButton"
				)}">
                    <span class="codicon codicon-clear-all"></span>
                </button>
            </div>
            
            <div class="actions">
                <button id="copy-button" class="action-button" title="${vscode.l10n.t(
					"sqlResult.copySql"
				)}">
                    <span class="codicon codicon-copy"></span>
                    ${vscode.l10n.t("sqlResult.copyButton")}
                </button>
                <button id="copy-formatted-button" class="action-button" title="${vscode.l10n.t(
					"sqlResult.copyFormattedSql"
				)}">
                    <span class="codicon codicon-format-code"></span>
                    ${vscode.l10n.t("sqlResult.copyFormattedButton")}
                </button>
                <button id="refresh-button" class="action-button" title="${vscode.l10n.t(
					"sqlResult.refresh"
				)}">
                    <span class="codicon codicon-refresh"></span>
                    ${vscode.l10n.t("sqlResult.refreshButton")}
                </button>
            </div>
        </div>
        
        ${this.currentQuery.parameters && this.currentQuery.parameters.length > 0
				? `
        <div class="parameters-section">
            <h2>${vscode.l10n.t("sqlResult.parameters")}</h2>
            <div class="parameters-list">
                ${this.currentQuery.parameters
						.map(
							(param, index) => `
                <div class="parameter-item">
                    <span class="parameter-name">${vscode.l10n.t(
								"sqlResult.parameter"
							)} ${index + 1}:</span>
                    <span class="parameter-value">${param.value}</span>
                    <span class="parameter-type">(${param.type})</span>
                </div>
                `
						)
						.join("")}
            </div>
        </div>
        `
				: ""}
        
        <div class="sql-content">
            <div class="tabs">
                <button class="tab-button active" data-tab="formatted">${vscode.l10n.t(
					"sqlResult.formattedTab"
				)}</button>
                <button class="tab-button" data-tab="original">${vscode.l10n.t(
					"sqlResult.originalTab"
				)}</button>
            </div>
            
            <div class="tab-content active" id="formatted-content">
                <pre><code class="sql">${highlightedSQL}</code></pre>
            </div>
            
            <div class="tab-content" id="original-content">
                <pre><code class="sql">${sqlQuery}</code></pre>
            </div>
        </div>
        
        ${this.currentQuery.executedTime && this.currentQuery.executedTime > 1000
				? `
        <div class="performance-warning">
            <span class="warning-icon">⚠️</span>
            <span>${vscode.l10n.t("sqlResult.performanceWarning")}</span>
        </div>
        `
				: ""}
    </div>
    
    <script nonce="${nonce}" src="${scriptUri}"></script>
    <script nonce="${nonce}">
        // Initialize webview
        const vscode = acquireVsCodeApi();
        
        // Set current SQL content
        const currentSql = ${JSON.stringify(sqlQuery)};
        const currentFormattedSql = ${JSON.stringify(formattedSQL)};
        
        // Tab switching logic
        document.querySelectorAll('.tab-button').forEach(button => {
            button.addEventListener('click', () => {
                // Remove active class from all buttons and content
                document.querySelectorAll('.tab-button').forEach(btn => btn.classList.remove('active'));
                document.querySelectorAll('.tab-content').forEach(content => content.classList.remove('active'));
                
                // Add active class to clicked button and corresponding content
                button.classList.add('active');
                document.getElementById(button.dataset.tab + '-content').classList.add('active');
            });
        });
        
        // Copy button event
        document.getElementById('copy-button').addEventListener('click', () => {
            vscode.postMessage({ command: 'copyToClipboard', text: currentSql });
        });
        
        // Copy formatted button event
        document.getElementById('copy-formatted-button').addEventListener('click', () => {
            vscode.postMessage({ command: 'copyFormattedToClipboard', text: currentFormattedSql });
        });
        
        // Refresh button event
        document.getElementById('refresh-button').addEventListener('click', () => {
            vscode.postMessage({ command: 'refresh' });
        });
        
        // Search functionality
        document.getElementById('search-button').addEventListener('click', () => {
            const searchText = document.getElementById('search-input').value;
            vscode.postMessage({ command: 'search', text: searchText });
        });
        
        document.getElementById('search-input').addEventListener('keypress', (e) => {
            if (e.key === 'Enter') {
                const searchText = document.getElementById('search-input').value;
                vscode.postMessage({ command: 'search', text: searchText });
            }
        });
        
        // Clear search functionality
        document.getElementById('clear-search-button').addEventListener('click', () => {
            document.getElementById('search-input').value = '';
            vscode.postMessage({ command: 'clearSearch' });
        });
        
        // Add syntax highlighting dynamically
        function highlightSearchTerms(text, searchTerm) {
            if (!searchTerm.trim()) return text;
            
            const regex = new RegExp('(' + searchTerm + ')', 'gi');
            return text.replace(regex, '<mark>$1</mark>');
        }
    </script>
</body>
</html>
`;
		} finally {
			this.performanceUtils.recordExecutionTime('SQLResultDisplayer.getWebviewContent', Date.now() - startTime);
		}
	}

	/**
	 * Generate random nonce for script security
	 */
	private getNonce(): string {
		let text = "";
		const possible = "ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwxyz0123456789";

		for (let i = 0; i < 32; i++) {
			text += possible.charAt(Math.floor(Math.random() * possible.length));
		}

		return text;
	}

	/**
	 * Copy SQL to clipboard with error handling
	 */
	private async copySQLToClipboard(text: string): Promise<void> {
		const startTime = Date.now();
		try {
			await vscode.env.clipboard.writeText(text);
			vscode.window.showInformationMessage(
				vscode.l10n.t("sqlResult.sqlCopied")
			);
		} catch (error: any) {
			console.error("Failed to copy SQL:", error);
			vscode.window.showErrorMessage(vscode.l10n.t("sqlResult.copyFailed"));
		} finally {
			this.performanceUtils.recordExecutionTime('SQLResultDisplayer.copySQLToClipboard', Date.now() - startTime);
		}
	}

	/**
	 * Copy formatted SQL to clipboard with error handling
	 */
	private async copyFormattedSQLToClipboard(text: string): Promise<void> {
		const startTime = Date.now();
		try {
			await vscode.env.clipboard.writeText(text);
			vscode.window.showInformationMessage(
				vscode.l10n.t("sqlResult.formattedSqlCopied")
			);
		} catch (error: any) {
			console.error("Failed to copy formatted SQL:", error);
			vscode.window.showErrorMessage(vscode.l10n.t("sqlResult.copyFailed"));
		} finally {
			this.performanceUtils.recordExecutionTime('SQLResultDisplayer.copyFormattedSQLToClipboard', Date.now() - startTime);
		}
	}

	/**
	 * Refresh data with caching
	 */
	private refreshData(): void {
		const startTime = Date.now();
		try {
			if (this.webviewPanel) {
				// Clear caches to force refresh
				this.clearCaches();
				this.updateWebviewContent();
				vscode.window.showInformationMessage(
					vscode.l10n.t("sqlResult.dataRefreshed")
				);
			}
		} finally {
			this.performanceUtils.recordExecutionTime('SQLResultDisplayer.refreshData', Date.now() - startTime);
		}
	}

	/**
	 * Search SQL content with regex caching
	 */
	private searchSQL(text: string): void {
		const startTime = Date.now();
		try {
			if (this.webviewPanel) {
				// Cache regex for better performance with repeated searches
				if (!this.searchRegexCache.has(text)) {
					try {
						const regex = new RegExp(text, 'gi');
						this.searchRegexCache.set(text, regex);
					} catch (e) {
						console.error('Invalid search regex:', e);
					}
				}
				this.webviewPanel.webview.postMessage({ command: "search", text });
			}
		} finally {
			this.performanceUtils.recordExecutionTime('SQLResultDisplayer.searchSQL', Date.now() - startTime);
		}
	}

	/**
	 * Clear search
	 */
	private clearSearch(): void {
		const startTime = Date.now();
		try {
			if (this.webviewPanel) {
				this.webviewPanel.webview.postMessage({ command: "clearSearch" });
			}
		} finally {
			this.performanceUtils.recordExecutionTime('SQLResultDisplayer.clearSearch', Date.now() - startTime);
		}
	}

	/**
	 * Select history item with caching
	 */
	public selectHistoryItem(query: SQLQuery): void {
		const startTime = Date.now();
		try {
			this.currentQuery = query;
			// Clear caches for the new query
			this.clearCaches();
			this.updateWebviewContent();
			vscode.window.showInformationMessage(
				vscode.l10n.t("sqlResult.historyItemSelected")
			);
		} finally {
			this.performanceUtils.recordExecutionTime('SQLResultDisplayer.selectHistoryItem', Date.now() - startTime);
		}
	}

	/**
	 * Switch database type
	 */
	public switchTab(tabId: string): void {
		const startTime = Date.now();
		try {
			if (this.webviewPanel) {
				this.webviewPanel.webview.postMessage({ command: "switchTab", tabId });
				vscode.window.showInformationMessage(
					vscode.l10n.t("sqlResult.tabSwitched")
				);
			}
		} finally {
			this.performanceUtils.recordExecutionTime('SQLResultDisplayer.switchTab', Date.now() - startTime);
		}
	}

	/**
	 * Set database type and clear relevant caches
	 */
	public setDatabaseType(databaseType: DatabaseType): void {
		const startTime = Date.now();
		try {
			this.databaseType = databaseType;
			// Clear highlighted SQL cache as it depends on database type
			this.highlightedSQLCache.clear();
			this.updateWebviewContent();
		} finally {
			this.performanceUtils.recordExecutionTime('SQLResultDisplayer.setDatabaseType', Date.now() - startTime);
		}
	}

	/**
	 * Clear all caches
	 */
	private clearCaches(): void {
		this.formattedSQLCache.clear();
		this.highlightedSQLCache.clear();
		this.searchRegexCache.clear();
	}

	/**
	 * Public method to clear all caches (for extension use)
	 */
	public clearAllCaches(): void {
		this.clearCaches();
	}

	/**
	 * Dispose resources and clear caches
	 */
	public dispose(): void {
		const startTime = Date.now();
		try {
			if (this.webviewPanel) {
				this.webviewPanel.dispose();
			}
			// Clear all caches
			this.clearCaches();
		} finally {
			this.performanceUtils.recordExecutionTime('SQLResultDisplayer.dispose', Date.now() - startTime);
		}
	}
}
