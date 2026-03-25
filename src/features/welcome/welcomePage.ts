/**
 * Welcome Page WebView Implementation
 *
 * Provides a visually appealing entry point for first-time users
 * with feature cards, setup checklist, and action buttons.
 */

import * as vscode from 'vscode';
import * as path from 'path';
import { getWelcomeContent } from './welcomeContent';

const WELCOME_SHOWN_KEY = 'mybatis-helper.welcomeShown';

/**
 * Check if welcome page should be shown
 * @param context Extension context
 * @returns true if welcome page should be shown
 */
export function shouldShowWelcomePage(context: vscode.ExtensionContext): boolean {
    const globalState = context.globalState;
    const welcomeShown = globalState.get<boolean>(WELCOME_SHOWN_KEY, false);
    const showWelcome = vscode.workspace.getConfiguration('mybatis-helper').get<boolean>('showWelcome', true);

    // 只有当用户没有勾选"不再显示"且配置允许显示时才显示
    return !welcomeShown && showWelcome;
}

/**
 * Show the welcome page webview
 * @param context Extension context
 */
export function showWelcomePage(context: vscode.ExtensionContext): void {
    // Get current welcome shown state for checkbox initialization
    const welcomeShown = context.globalState.get<boolean>(WELCOME_SHOWN_KEY, false);

    const panel = vscode.window.createWebviewPanel(
        'mybatisHelperWelcome',
        vscode.l10n.t('welcome.title'),
        vscode.ViewColumn.One,
        {
            enableScripts: true,
            localResourceRoots: [
                context.extensionUri,
                vscode.Uri.joinPath(context.extensionUri, 'node_modules', '@vscode', 'codicons'),
                vscode.Uri.joinPath(context.extensionUri, 'static')
            ],
            retainContextWhenHidden: true
        }
    );

    // Set webview content with welcomeShown state
    panel.webview.html = getWelcomeContent(panel.webview, context.extensionUri, welcomeShown);

    // Handle messages from webview
    panel.webview.onDidReceiveMessage(
        async (message) => {
            switch (message.command) {
                case 'openSample':
                    await handleOpenSample(context);
                    break;
                case 'configure':
                    await handleConfigure();
                    break;
                case 'openDocs':
                    await handleOpenDocs(context);
                    break;
                case 'dontShowAgain':
                    await handleDontShowAgain(context, message.value);
                    break;
                case 'checkSetupStatus':
                    await handleCheckSetupStatus(panel.webview);
                    break;
            }
        },
        undefined,
        context.subscriptions
    );

    // Check setup status when webview is ready
    setTimeout(() => {
        handleCheckSetupStatus(panel.webview);
    }, 500);
}

/**
 * Handle opening sample project
 */
async function handleOpenSample(context: vscode.ExtensionContext): Promise<void> {
    try {
        const samplePath = path.join(context.extensionPath, 'samples', 'basic-mybatis-project');
        const sampleUri = vscode.Uri.file(samplePath);

        // Check if sample exists
        try {
            await vscode.workspace.fs.stat(sampleUri);
        } catch {
            vscode.window.showErrorMessage(vscode.l10n.t('welcome.sampleNotFound'));
            return;
        }

        // Open sample folder in new window
        await vscode.commands.executeCommand('vscode.openFolder', sampleUri, true);
    } catch (error) {
        vscode.window.showErrorMessage(
            vscode.l10n.t('welcome.openSampleFailed', { error: String(error) })
        );
    }
}

/**
 * Handle configure button - run configuration wizard
 */
async function handleConfigure(): Promise<void> {
    try {
        await vscode.commands.executeCommand('mybatis-helper.configureWizard');
    } catch (error) {
        vscode.window.showErrorMessage(
            vscode.l10n.t('welcome.configureFailed', { error: String(error) })
        );
    }
}

/**
 * Handle opening documentation
 */
async function handleOpenDocs(context: vscode.ExtensionContext): Promise<void> {
    try {
        const docsPath = path.join(context.extensionPath, 'docs', 'FEATURES.md');
        const docsUri = vscode.Uri.file(docsPath);

        // Check if docs exist
        try {
            await vscode.workspace.fs.stat(docsUri);
        } catch {
            // Fall back to README if FEATURES.md doesn't exist
            const readmePath = path.join(context.extensionPath, 'README.md');
            const readmeUri = vscode.Uri.file(readmePath);
            await vscode.commands.executeCommand('markdown.showPreview', readmeUri);
            return;
        }

        await vscode.commands.executeCommand('markdown.showPreview', docsUri);
    } catch (error) {
        vscode.window.showErrorMessage(
            vscode.l10n.t('welcome.openDocsFailed', { error: String(error) })
        );
    }
}

/**
 * Handle "Don't show again" checkbox
 */
async function handleDontShowAgain(context: vscode.ExtensionContext, value: boolean): Promise<void> {
    await context.globalState.update(WELCOME_SHOWN_KEY, value);
}

/**
 * Check setup status and send to webview
 */
async function handleCheckSetupStatus(webview: vscode.Webview): Promise<void> {
    const status = {
        javaExtension: false,
        mappersDetected: false,
        sqlInterceptorConfigured: false
    };

    // Check Java extension
    const javaExt = vscode.extensions.getExtension('redhat.java');
    status.javaExtension = !!javaExt && javaExt.isActive;

    // Check mapper files (using workspace file search)
    try {
        const xmlFiles = await vscode.workspace.findFiles('**/*.xml', '**/node_modules/**,**/.git/**,**/target/**,**/build/**', 10);
        status.mappersDetected = xmlFiles.length > 0;
    } catch {
        status.mappersDetected = false;
    }

    // Check SQL interceptor configuration
    const config = vscode.workspace.getConfiguration('mybatis-helper.sqlInterceptor');
    const listenMode = config.get<string>('listenMode', 'auto');
    status.sqlInterceptorConfigured = listenMode !== 'auto' || config.get<boolean>('autoStart', true);

    webview.postMessage({
        command: 'setupStatus',
        data: status
    });
}
