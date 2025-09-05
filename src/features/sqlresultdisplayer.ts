import * as vscode from "vscode";
import { SQLQuery, DatabaseType } from "../types";
import { formatSQL, highlightSQL, getPluginConfig } from "../utils";

/**
 * SQL result displayer, responsible for displaying SQL query results in a user-friendly way
 */
export class SQLResultDisplayer {
	private webviewPanel: vscode.WebviewPanel | undefined;
	private extensionUri: vscode.Uri;
	private currentQuery: SQLQuery | null = null;
	private databaseType: DatabaseType;

	constructor(extensionUri: vscode.Uri) {
		this.extensionUri = extensionUri;
		const config = getPluginConfig();
		this.databaseType = config.databaseType;
	}

	/**
	 * Show SQL query result
	 */
	showSQLResult(query: SQLQuery): void {
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
	}

	/**
	 * Show SQL query result (alias method, called by external commands)
	 */
	displaySQL(query: SQLQuery): void {
		this.showSQLResult(query);
	}

	/**
	 * Create webview panel
	 */
	private createWebviewPanel(): void {
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
		});

		// Handle messages from webview
		this.webviewPanel.webview.onDidReceiveMessage(
			(message) => {
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
			},
			undefined,
			undefined
		);
	}

	/**
	 * Update webview content
	 */
	private updateWebviewContent(): void {
		if (!this.webviewPanel || !this.currentQuery) {
			vscode.window.showErrorMessage(
				vscode.l10n.t("sqlResult.webviewNotInitialized")
			);
			return;
		}

		this.webviewPanel.webview.html = this.getWebviewContent();
	}

	/**
	 * Generate webview content
	 */
	private getWebviewContent(): string {
		if (!this.currentQuery) {
			return vscode.l10n.t("sqlResult.processingError");
		}

		const sqlQuery = this.currentQuery.fullSQL || "";
		const formattedSQL = formatSQL(sqlQuery);
		const highlightedSQL = highlightSQL(formattedSQL, this.databaseType);

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
                ${
									this.currentQuery.executedTime
										? `<span class="execution-time">${vscode.l10n.t(
												"sqlResult.executionTime"
										  )}: ${this.currentQuery.executedTime}ms</span>`
										: ""
								}
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
        
        ${
					this.currentQuery.parameters &&
					this.currentQuery.parameters.length > 0
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
						: ""
				}
        
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
        
        ${
					this.currentQuery.executedTime &&
					this.currentQuery.executedTime > 1000
						? `
        <div class="performance-warning">
            <span class="warning-icon">⚠️</span>
            <span>${vscode.l10n.t("sqlResult.performanceWarning")}</span>
        </div>
        `
						: ""
				}
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
	}

	/**
	 * Generate random nonce for script security
	 */
	private getNonce(): string {
		let text = "";
		const possible =
			"ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwxyz0123456789";

		for (let i = 0; i < 32; i++) {
			text += possible.charAt(Math.floor(Math.random() * possible.length));
		}

		return text;
	}

	/**
	 * Copy SQL to clipboard
	 */
	private async copySQLToClipboard(text: string): Promise<void> {
		try {
			await vscode.env.clipboard.writeText(text);
			vscode.window.showInformationMessage(
				vscode.l10n.t("sqlResult.sqlCopied")
			);
		} catch (error: any) {
			console.error("Failed to copy SQL:", error);
			vscode.window.showErrorMessage(vscode.l10n.t("sqlResult.copyFailed"));
		}
	}

	/**
	 * Copy formatted SQL to clipboard
	 */
	private async copyFormattedSQLToClipboard(text: string): Promise<void> {
		try {
			await vscode.env.clipboard.writeText(text);
			vscode.window.showInformationMessage(
				vscode.l10n.t("sqlResult.formattedSqlCopied")
			);
		} catch (error: any) {
			console.error("Failed to copy formatted SQL:", error);
			vscode.window.showErrorMessage(vscode.l10n.t("sqlResult.copyFailed"));
		}
	}

	/**
	 * Refresh data
	 */
	private refreshData(): void {
		if (this.webviewPanel) {
			this.updateWebviewContent();
			vscode.window.showInformationMessage(
				vscode.l10n.t("sqlResult.dataRefreshed")
			);
		}
	}

	/**
	 * Search SQL content
	 */
	private searchSQL(text: string): void {
		if (this.webviewPanel) {
			this.webviewPanel.webview.postMessage({ command: "search", text });
		}
	}

	/**
	 * Clear search
	 */
	private clearSearch(): void {
		if (this.webviewPanel) {
			this.webviewPanel.webview.postMessage({ command: "clearSearch" });
		}
	}

	/**
	 * Select history item
	 */
	public selectHistoryItem(query: SQLQuery): void {
		this.currentQuery = query;
		this.updateWebviewContent();
		vscode.window.showInformationMessage(
			vscode.l10n.t("sqlResult.historyItemSelected")
		);
	}

	/**
	 * Switch database type
	 */
	public switchTab(tabId: string): void {
		if (this.webviewPanel) {
			this.webviewPanel.webview.postMessage({ command: "switchTab", tabId });
			vscode.window.showInformationMessage(
				vscode.l10n.t("sqlResult.tabSwitched")
			);
		}
	}

	/**
	 * Set database type
	 */
	public setDatabaseType(databaseType: DatabaseType): void {
		this.databaseType = databaseType;
		this.updateWebviewContent();
	}

	/**
	 * Dispose resources
	 */
	public dispose(): void {
		if (this.webviewPanel) {
			this.webviewPanel.dispose();
		}
	}
}
