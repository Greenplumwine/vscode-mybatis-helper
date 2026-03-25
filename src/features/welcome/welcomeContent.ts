/**
 * Welcome Page HTML Content
 *
 * Generates the HTML content for the welcome page webview.
 * Uses VS Code CSS variables for theming and Codicons for icons.
 */

import * as vscode from 'vscode';

/**
 * Generate welcome page HTML content
 * @param webview Webview instance
 * @param extensionUri Extension URI for resource resolution
 * @param welcomeShown Whether welcome page has been marked as "don't show again"
 * @returns HTML string
 */
export function getWelcomeContent(webview: vscode.Webview, extensionUri: vscode.Uri, welcomeShown: boolean = false): string {
    const nonce = getNonce();

    // Create URI for codicon.css
    const codiconsUri = webview.asWebviewUri(
        vscode.Uri.joinPath(extensionUri, 'node_modules', '@vscode', 'codicons', 'dist', 'codicon.css')
    );

    // Create URI for MyBatis Helper icon
    const iconUri = webview.asWebviewUri(
        vscode.Uri.joinPath(extensionUri, 'static', 'icon', 'mybatis-helper-icon.svg')
    );

    return `<!DOCTYPE html>
<html lang="en">
<head>
    <meta charset="UTF-8">
    <meta name="viewport" content="width=device-width, initial-scale=1.0">
    <meta http-equiv="Content-Security-Policy" content="
        default-src 'none';
        style-src ${webview.cspSource} 'unsafe-inline';
        font-src ${webview.cspSource};
        img-src ${webview.cspSource} https: data:;
        script-src 'nonce-${nonce}';
    ">
    <title>${vscode.l10n.t('welcome.title')}</title>
    <link rel="stylesheet" type="text/css" href="${codiconsUri}">
    <style>
        :root {
            --welcome-padding: 40px;
            --card-gap: 24px;
            --icon-size: 48px;
        }

        * {
            margin: 0;
            padding: 0;
            box-sizing: border-box;
        }

        body {
            font-family: var(--vscode-font-family);
            font-size: var(--vscode-font-size);
            color: var(--vscode-foreground);
            background-color: var(--vscode-editor-background);
            line-height: 1.6;
            padding: var(--welcome-padding);
            max-width: 1200px;
            margin: 0 auto;
        }

        /* Header Section */
        .header {
            text-align: center;
            margin-bottom: 48px;
            padding-bottom: 32px;
            border-bottom: 1px solid var(--vscode-panel-border);
        }

        .header-icon {
            width: 120px;
            height: 120px;
            margin: 0 auto 16px;
        }

        .header-icon img {
            width: 100%;
            height: 100%;
            object-fit: contain;
        }

        .header h1 {
            font-size: 32px;
            font-weight: 300;
            margin-bottom: 8px;
            color: var(--vscode-foreground);
        }

        .header p {
            font-size: 16px;
            color: var(--vscode-descriptionForeground);
            max-width: 600px;
            margin: 0 auto;
        }

        /* Feature Cards Section */
        .features-section {
            margin-bottom: 48px;
        }

        .section-title {
            font-size: 20px;
            font-weight: 500;
            margin-bottom: 24px;
            color: var(--vscode-foreground);
        }

        .feature-cards {
            display: grid;
            grid-template-columns: repeat(auto-fit, minmax(280px, 1fr));
            gap: var(--card-gap);
        }

        .feature-card {
            background-color: var(--vscode-editor-inactiveSelectionBackground);
            border: 1px solid var(--vscode-panel-border);
            border-radius: 8px;
            padding: 24px;
            transition: all 0.2s ease;
            display: flex;
            flex-direction: column;
            align-items: center;
            text-align: center;
        }

        .feature-card:hover {
            border-color: var(--vscode-focusBorder);
            transform: translateY(-2px);
            box-shadow: 0 4px 12px rgba(0, 0, 0, 0.15);
        }

        .feature-icon {
            font-size: 48px;
            margin-bottom: 16px;
            display: flex;
            align-items: center;
            justify-content: center;
            width: 64px;
            height: 64px;
            color: var(--vscode-symbolIcon-classForeground);
        }

        .feature-icon::before {
            font-size: 48px;
        }

        .feature-card h3 {
            font-size: 18px;
            font-weight: 500;
            margin-bottom: 8px;
            color: var(--vscode-foreground);
            width: 100%;
        }

        .feature-card p {
            font-size: 14px;
            color: var(--vscode-descriptionForeground);
            line-height: 1.5;
            width: 100%;
        }

        /* Quick Setup Section */
        .setup-section {
            margin-bottom: 48px;
            background-color: var(--vscode-editor-inactiveSelectionBackground);
            border: 1px solid var(--vscode-panel-border);
            border-radius: 8px;
            padding: 24px;
        }

        .setup-list {
            list-style: none;
        }

        .setup-item {
            display: flex;
            align-items: center;
            padding: 12px 0;
            border-bottom: 1px solid var(--vscode-panel-border);
        }

        .setup-item:last-child {
            border-bottom: none;
        }

        .setup-checkbox {
            width: 20px;
            height: 20px;
            margin-right: 12px;
            border: 2px solid var(--vscode-checkbox-border);
            border-radius: 4px;
            display: flex;
            align-items: center;
            justify-content: center;
            flex-shrink: 0;
        }

        .setup-checkbox.checked {
            background-color: var(--vscode-checkbox-selectBackground);
            border-color: var(--vscode-checkbox-selectBorder);
        }

        .setup-checkbox .codicon {
            font-size: 14px;
            color: var(--vscode-checkbox-foreground);
            opacity: 0;
        }

        .setup-checkbox.checked .codicon {
            opacity: 1;
        }

        .setup-checkbox.loading {
            animation: pulse 1.5s infinite;
        }

        @keyframes pulse {
            0%, 100% { opacity: 1; }
            50% { opacity: 0.5; }
        }

        .setup-text {
            flex: 1;
            font-size: 14px;
            color: var(--vscode-foreground);
        }

        .setup-status {
            font-size: 12px;
            color: var(--vscode-descriptionForeground);
            margin-left: 8px;
        }

        /* Action Buttons Section */
        .actions-section {
            margin-bottom: 48px;
        }

        .action-buttons {
            display: flex;
            flex-wrap: wrap;
            gap: 16px;
        }

        .action-button {
            display: inline-flex;
            align-items: center;
            gap: 8px;
            padding: 12px 24px;
            font-size: 14px;
            font-weight: 500;
            border: none;
            border-radius: 4px;
            cursor: pointer;
            transition: all 0.2s ease;
            text-decoration: none;
        }

        .action-button.primary {
            background-color: var(--vscode-button-background);
            color: var(--vscode-button-foreground);
        }

        .action-button.primary:hover {
            background-color: var(--vscode-button-hoverBackground);
        }

        .action-button.secondary {
            background-color: var(--vscode-button-secondaryBackground);
            color: var(--vscode-button-secondaryForeground);
        }

        .action-button.secondary:hover {
            background-color: var(--vscode-button-secondaryHoverBackground);
        }

        .action-button .codicon {
            font-size: 16px;
        }

        .btn-icon {
            display: none;
        }

        /* Footer Section */
        .footer {
            padding-top: 24px;
            border-top: 1px solid var(--vscode-panel-border);
            display: flex;
            align-items: center;
            justify-content: space-between;
            flex-wrap: wrap;
            gap: 16px;
        }

        .dont-show-again {
            display: flex;
            align-items: center;
            gap: 8px;
            cursor: pointer;
            font-size: 14px;
            color: var(--vscode-foreground);
        }

        .dont-show-again input[type="checkbox"] {
            width: 16px;
            height: 16px;
            cursor: pointer;
        }

        .version-info {
            font-size: 12px;
            color: var(--vscode-descriptionForeground);
        }

        /* Responsive adjustments */
        @media (max-width: 600px) {
            :root {
                --welcome-padding: 20px;
            }

            .header h1 {
                font-size: 24px;
            }

            .feature-cards {
                grid-template-columns: 1fr;
            }

            .action-buttons {
                flex-direction: column;
            }

            .action-button {
                width: 100%;
                justify-content: center;
            }
        }
    </style>
</head>
<body>
    <div class="header">
        <div class="header-icon">
            <img src="${iconUri}" alt="MyBatis Helper">
        </div>
        <h1>${vscode.l10n.t('welcome.title')}</h1>
        <p>${vscode.l10n.t('welcome.subtitle')}</p>
    </div>

    <div class="features-section">
        <h2 class="section-title">${vscode.l10n.t('welcome.features.title')}</h2>
        <div class="feature-cards">
            <div class="feature-card">
                <i class="feature-icon codicon codicon-arrow-swap"></i>
                <h3>${vscode.l10n.t('welcome.feature.navigate')}</h3>
                <p>${vscode.l10n.t('welcome.feature.navigate.desc')}</p>
            </div>
            <div class="feature-card">
                <i class="feature-icon codicon codicon-database"></i>
                <h3>${vscode.l10n.t('welcome.feature.capture')}</h3>
                <p>${vscode.l10n.t('welcome.feature.capture.desc')}</p>
            </div>
            <div class="feature-card">
                <i class="feature-icon codicon codicon-symbol-snippet"></i>
                <h3>${vscode.l10n.t('welcome.feature.complete')}</h3>
                <p>${vscode.l10n.t('welcome.feature.complete.desc')}</p>
            </div>
        </div>
    </div>

    <div class="setup-section">
        <h2 class="section-title">${vscode.l10n.t('welcome.setup.title')}</h2>
        <ul class="setup-list">
            <li class="setup-item">
                <div class="setup-checkbox loading" id="check-java">
                    <i class="codicon codicon-check"></i>
                </div>
                <span class="setup-text">${vscode.l10n.t('welcome.setup.java')}</span>
                <span class="setup-status" id="status-java">${vscode.l10n.t('welcome.setup.checking')}</span>
            </li>
            <li class="setup-item">
                <div class="setup-checkbox loading" id="check-mappers">
                    <i class="codicon codicon-check"></i>
                </div>
                <span class="setup-text">${vscode.l10n.t('welcome.setup.mappers')}</span>
                <span class="setup-status" id="status-mappers">${vscode.l10n.t('welcome.setup.checking')}</span>
            </li>
            <li class="setup-item">
                <div class="setup-checkbox loading" id="check-sql">
                    <i class="codicon codicon-check"></i>
                </div>
                <span class="setup-text">${vscode.l10n.t('welcome.setup.sql')}</span>
                <span class="setup-status" id="status-sql">${vscode.l10n.t('welcome.setup.checking')}</span>
            </li>
        </ul>
    </div>

    <div class="actions-section">
        <h2 class="section-title">${vscode.l10n.t('welcome.actions.title')}</h2>
        <div class="action-buttons">
            <button class="action-button secondary" id="btn-sample">
                <i class="codicon codicon-folder-opened"></i>
                ${vscode.l10n.t('welcome.action.sample')}
            </button>
            <button class="action-button primary" id="btn-configure">
                <i class="codicon codicon-gear"></i>
                ${vscode.l10n.t('welcome.action.configure')}
            </button>
            <button class="action-button secondary" id="btn-docs">
                <i class="codicon codicon-book"></i>
                ${vscode.l10n.t('welcome.action.docs')}
            </button>
        </div>
    </div>

    <div class="footer">
        <label class="dont-show-again">
            <input type="checkbox" id="dont-show-again" ${welcomeShown ? 'checked' : ''}>
            <span>${vscode.l10n.t('welcome.dontShowAgain')}</span>
        </label>
        <span class="version-info">MyBatis Helper v0.0.8</span>
    </div>

    <script nonce="${nonce}">
        const vscode = acquireVsCodeApi();

        // Button click handlers
        document.getElementById('btn-sample').addEventListener('click', () => {
            vscode.postMessage({ command: 'openSample' });
        });

        document.getElementById('btn-configure').addEventListener('click', () => {
            vscode.postMessage({ command: 'configure' });
        });

        document.getElementById('btn-docs').addEventListener('click', () => {
            vscode.postMessage({ command: 'openDocs' });
        });

        // Don't show again checkbox
        document.getElementById('dont-show-again').addEventListener('change', (e) => {
            vscode.postMessage({ command: 'dontShowAgain', value: e.target.checked });
        });

        // Request setup status check
        vscode.postMessage({ command: 'checkSetupStatus' });

        // Handle messages from extension
        window.addEventListener('message', event => {
            const message = event.data;

            switch (message.command) {
                case 'setupStatus':
                    updateSetupStatus(message.data);
                    break;
            }
        });

        function updateSetupStatus(status) {
            updateCheckItem('check-java', 'status-java', status.javaExtension);
            updateCheckItem('check-mappers', 'status-mappers', status.mappersDetected);
            updateCheckItem('check-sql', 'status-sql', status.sqlInterceptorConfigured);
        }

        function updateCheckItem(checkId, statusId, isComplete) {
            const checkbox = document.getElementById(checkId);
            const status = document.getElementById(statusId);

            checkbox.classList.remove('loading');
            if (isComplete) {
                checkbox.classList.add('checked');
                status.textContent = '${vscode.l10n.t('welcome.setup.complete')}';
                status.style.color = 'var(--vscode-testing-iconPassed)';
            } else {
                checkbox.classList.remove('checked');
                status.textContent = '${vscode.l10n.t('welcome.setup.pending')}';
                status.style.color = 'var(--vscode-descriptionForeground)';
            }
        }
    </script>
</body>
</html>`;
}

/**
 * Generate a random nonce for CSP
 * @returns Random nonce string
 */
function getNonce(): string {
    let text = '';
    const possible = 'ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwxyz0123456789';
    for (let i = 0; i < 32; i++) {
        text += possible.charAt(Math.floor(Math.random() * possible.length));
    }
    return text;
}
