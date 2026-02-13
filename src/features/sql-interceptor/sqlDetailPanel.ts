/**
 * SQL 详情面板
 * 
 * 显示单个 SQL 查询的详细信息
 */

import * as vscode from 'vscode';
import { SQLQueryRecord } from './types';
import { formatSQL, highlightSQL, getPluginConfig } from '../../utils';

export class SQLDetailPanel {
  private static currentPanel: SQLDetailPanel | undefined;
  private readonly panel: vscode.WebviewPanel;
  private disposables: vscode.Disposable[] = [];
  private query: SQLQueryRecord;
  private extensionUri: vscode.Uri;

  public static createOrShow(extensionUri: vscode.Uri, query: SQLQueryRecord): SQLDetailPanel {
    const column = vscode.ViewColumn.Beside;

    // 如果面板已存在，更新内容
    if (SQLDetailPanel.currentPanel) {
      SQLDetailPanel.currentPanel.updateQuery(query);
      SQLDetailPanel.currentPanel.panel.reveal(column);
      return SQLDetailPanel.currentPanel;
    }

    // 创建新面板
    const panel = vscode.window.createWebviewPanel(
      'sqlDetail',
      vscode.l10n.t('sqlDetail.title', { id: query.id.substring(0, 8) }),
      column,
      {
        enableScripts: true,
        retainContextWhenHidden: true,
        localResourceRoots: [vscode.Uri.joinPath(extensionUri, 'media')]
      }
    );

    SQLDetailPanel.currentPanel = new SQLDetailPanel(panel, extensionUri, query);
    return SQLDetailPanel.currentPanel;
  }

  private constructor(panel: vscode.WebviewPanel, extensionUri: vscode.Uri, query: SQLQueryRecord) {
    this.panel = panel;
    this.extensionUri = extensionUri;
    this.query = query;

    // 设置 Webview 内容
    this.updateWebview();

    // 监听面板关闭
    this.panel.onDidDispose(() => this.dispose(), null, this.disposables);

    // 监听来自 Webview 的消息
    this.panel.webview.onDidReceiveMessage(
      message => this.handleMessage(message),
      null,
      this.disposables
    );
  }

  /**
   * 更新查询
   */
  public updateQuery(query: SQLQueryRecord): void {
    this.query = query;
    this.updateWebview();
  }

  /**
   * 更新 Webview 内容
   */
  private updateWebview(): void {
    this.panel.title = vscode.l10n.t('sqlDetail.title', { id: this.query.id.substring(0, 8) });
    this.panel.webview.html = this.getHtmlContent();
  }

  /**
   * 处理 Webview 消息
   */
  private async handleMessage(message: any): Promise<void> {
    switch (message.command) {
      case 'copy':
        await this.copyToClipboard(message.text);
        break;
      case 'copyRaw':
        await this.copyToClipboard(this.query.rawSQL || '');
        break;
      case 'copyFormatted':
        await this.copyToClipboard(this.query.formattedSQL || this.query.fullSQL || '');
        break;
    }
  }

  /**
   * 复制到剪贴板
   */
  private async copyToClipboard(text: string): Promise<void> {
    try {
      await vscode.env.clipboard.writeText(text);
      vscode.window.showInformationMessage(vscode.l10n.t('sqlDetail.copied'));
    } catch (error) {
      vscode.window.showErrorMessage(vscode.l10n.t('sqlDetail.copyFailed'));
    }
  }

  /**
   * 生成 HTML 内容
   */
  private getHtmlContent(): string {
    const config = getPluginConfig();
    const sql = this.query.formattedSQL || this.query.fullSQL || this.query.rawSQL || '';
    const rawSQL = this.query.rawSQL || '';
    const highlightedSQL = highlightSQL(sql, config.databaseType);
    
    // 生成参数表格 HTML
    const paramsHtml = this.generateParamsTable();
    
    // 生成执行时间 HTML
    const executionTimeHtml = this.query.executionTime !== undefined
      ? `<div class="execution-time ${this.query.executionTime > 1000 ? 'slow' : ''}">
           ${vscode.l10n.t('sqlDetail.executionTime', { time: this.query.executionTime })}
           ${this.query.executionTime > 1000 ? '<span class="warning">⚠️ ' + vscode.l10n.t('sqlDetail.slowWarning') + '</span>' : ''}
         </div>`
      : '';

    return `<!DOCTYPE html>
<html lang="en">
<head>
    <meta charset="UTF-8">
    <meta name="viewport" content="width=device-width, initial-scale=1.0">
    <title>${vscode.l10n.t('sqlDetail.title', { id: this.query.id.substring(0, 8) })}</title>
    <style>
        :root {
            --bg-color: var(--vscode-editor-background);
            --fg-color: var(--vscode-editor-foreground);
            --border-color: var(--vscode-panel-border);
            --button-bg: var(--vscode-button-background);
            --button-fg: var(--vscode-button-foreground);
            --button-hover: var(--vscode-button-hoverBackground);
            --input-bg: var(--vscode-input-background);
            --input-fg: var(--vscode-input-foreground);
            --input-border: var(--vscode-input-border);
        }
        
        * {
            box-sizing: border-box;
            margin: 0;
            padding: 0;
        }
        
        body {
            font-family: var(--vscode-font-family);
            font-size: var(--vscode-font-size);
            color: var(--fg-color);
            background-color: var(--bg-color);
            padding: 20px;
            line-height: 1.6;
        }
        
        .header {
            margin-bottom: 20px;
            padding-bottom: 15px;
            border-bottom: 1px solid var(--border-color);
        }
        
        .header h1 {
            font-size: 18px;
            margin-bottom: 10px;
        }
        
        .meta-info {
            display: flex;
            gap: 20px;
            font-size: 12px;
            color: var(--vscode-descriptionForeground);
        }
        
        .actions {
            display: flex;
            gap: 10px;
            margin-bottom: 20px;
            flex-wrap: wrap;
        }
        
        button {
            padding: 8px 16px;
            background-color: var(--button-bg);
            color: var(--button-fg);
            border: none;
            border-radius: 4px;
            cursor: pointer;
            font-size: 13px;
            display: inline-flex;
            align-items: center;
            gap: 6px;
            transition: background-color 0.2s;
        }
        
        button:hover {
            background-color: var(--button-hover);
        }
        
        button.secondary {
            background-color: transparent;
            border: 1px solid var(--border-color);
            color: var(--fg-color);
        }
        
        button.secondary:hover {
            background-color: var(--vscode-list-hoverBackground);
        }
        
        .sql-container {
            background-color: var(--vscode-textCodeBlock-background);
            border: 1px solid var(--border-color);
            border-radius: 6px;
            overflow: hidden;
            margin-bottom: 20px;
        }
        
        .sql-header {
            padding: 10px 15px;
            background-color: var(--vscode-titleBar-inactiveBackground);
            border-bottom: 1px solid var(--border-color);
            display: flex;
            justify-content: space-between;
            align-items: center;
        }
        
        .sql-header h3 {
            font-size: 14px;
            margin: 0;
        }
        
        .sql-content {
            padding: 15px;
            overflow-x: auto;
        }
        
        pre {
            margin: 0;
            font-family: var(--vscode-editor-font-family), 'Consolas', monospace;
            font-size: 13px;
            line-height: 1.5;
            white-space: pre-wrap;
            word-break: break-all;
        }
        
        code {
            font-family: var(--vscode-editor-font-family), 'Consolas', monospace;
        }
        
        .params-section {
            margin-top: 20px;
        }
        
        .params-section h3 {
            font-size: 14px;
            margin-bottom: 10px;
        }
        
        table {
            width: 100%;
            border-collapse: collapse;
            font-size: 13px;
        }
        
        th, td {
            padding: 8px 12px;
            text-align: left;
            border: 1px solid var(--border-color);
        }
        
        th {
            background-color: var(--vscode-titleBar-inactiveBackground);
            font-weight: 600;
        }
        
        tr:hover {
            background-color: var(--vscode-list-hoverBackground);
        }
        
        .execution-time {
            padding: 10px 15px;
            background-color: var(--vscode-statusBar-background);
            border-radius: 4px;
            margin-bottom: 20px;
            font-size: 13px;
        }
        
        .execution-time.slow {
            background-color: var(--vscode-errorForeground);
            color: var(--vscode-errorForeground);
            border: 1px solid var(--vscode-errorForeground);
        }
        
        .warning {
            margin-left: 10px;
            font-weight: bold;
        }
        
        .empty-state {
            text-align: center;
            padding: 40px;
            color: var(--vscode-descriptionForeground);
        }
    </style>
</head>
<body>
    <div class="header">
        <h1>${vscode.l10n.t('sqlDetail.sqlQuery')}</h1>
        <div class="meta-info">
            <span>${vscode.l10n.t('sqlDetail.time')}: ${this.query.timestamp.toLocaleString()}</span>
            <span>${vscode.l10n.t('sqlDetail.source')}: ${this.query.source === 'debug' ? 'Debug Console' : 'Terminal'}</span>
            <span>${vscode.l10n.t('sqlDetail.rule')}: ${this.query.matchedRule}</span>
        </div>
    </div>
    
    <div class="actions">
        <button onclick="copyFormatted()">
            <span>📋</span> ${vscode.l10n.t('sqlDetail.copyFormatted')}
        </button>
        <button class="secondary" onclick="copyRaw()">
            <span>📄</span> ${vscode.l10n.t('sqlDetail.copyRaw')}
        </button>
        <button class="secondary" onclick="copyWithParams()">
            <span>🔧</span> ${vscode.l10n.t('sqlDetail.copyWithParams')}
        </button>
    </div>
    
    ${executionTimeHtml}
    
    <div class="sql-container">
        <div class="sql-header">
            <h3>${vscode.l10n.t('sqlDetail.formattedSQL')}</h3>
        </div>
        <div class="sql-content">
            <pre><code>${highlightedSQL}</code></pre>
        </div>
    </div>
    
    ${rawSQL !== sql ? `
    <div class="sql-container">
        <div class="sql-header">
            <h3>${vscode.l10n.t('sqlDetail.rawSQL')}</h3>
        </div>
        <div class="sql-content">
            <pre><code>${this.escapeHtml(rawSQL)}</code></pre>
        </div>
    </div>
    ` : ''}
    
    ${paramsHtml}
    
    <script>
        const vscode = acquireVsCodeApi();
        
        function copyFormatted() {
            vscode.postMessage({ command: 'copyFormatted' });
        }
        
        function copyRaw() {
            vscode.postMessage({ command: 'copyRaw' });
        }
        
        function copyWithParams() {
            const text = \`${this.escapeHtml(this.generateParamInfoText())}\`;
            vscode.postMessage({ command: 'copy', text });
        }
    </script>
</body>
</html>`;
  }

  /**
   * 生成参数表格 HTML
   */
  private generateParamsTable(): string {
    if (!this.query.parameters || this.query.parameters.length === 0) {
      return '';
    }

    const rows = this.query.parameters.map((param, index) => `
      <tr>
        <td>${index + 1}</td>
        <td><code>${this.escapeHtml(param.value)}</code></td>
        <td>${this.escapeHtml(param.type)}</td>
      </tr>
    `).join('');

    return `
      <div class="params-section">
        <h3>${vscode.l10n.t('sqlDetail.parameters')}</h3>
        <table>
          <thead>
            <tr>
              <th>#</th>
              <th>${vscode.l10n.t('sqlDetail.value')}</th>
              <th>${vscode.l10n.t('sqlDetail.type')}</th>
            </tr>
          </thead>
          <tbody>
            ${rows}
          </tbody>
        </table>
      </div>
    `;
  }

  /**
   * 生成参数信息文本
   */
  private generateParamInfoText(): string {
    if (!this.query.parameters || this.query.parameters.length === 0) {
      return '';
    }

    const lines = this.query.parameters.map((param, index) => 
      `-- Parameter ${index + 1}: ${param.value} (${param.type})`
    );

    return lines.join('\n');
  }

  /**
   * HTML 转义
   */
  private escapeHtml(text: string): string {
    const div = { toString: () => text };
    return text
      .replace(/&/g, '&amp;')
      .replace(/</g, '&lt;')
      .replace(/>/g, '&gt;')
      .replace(/"/g, '&quot;')
      .replace(/'/g, '&#039;');
  }

  /**
   * 释放资源
   */
  public dispose(): void {
    SQLDetailPanel.currentPanel = undefined;
    this.panel.dispose();
    this.disposables.forEach(d => d.dispose());
  }
}
