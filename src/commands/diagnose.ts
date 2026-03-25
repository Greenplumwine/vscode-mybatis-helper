/**
 * Enhanced Diagnose command
 *
 * Provides comprehensive diagnostics for MyBatis Helper.
 */

import * as vscode from 'vscode';
import * as path from 'path';
import * as fs from 'fs';
import { validateConfiguration } from '../services/validation';
import { FastMappingEngine } from '../features/mapping/fastMappingEngine';
import { SQLInterceptorService } from '../features/sql-interceptor/sqlInterceptorService';
import { logger } from '../utils/logger';

const OUTPUT_CHANNEL_NAME = 'MyBatis Helper Diagnostics';

/**
 * Execute the diagnose command
 */
export async function diagnoseCommand(): Promise<void> {
    const outputChannel = vscode.window.createOutputChannel(OUTPUT_CHANNEL_NAME);
    outputChannel.clear();
    outputChannel.show(true);

    await vscode.window.withProgress({
        location: vscode.ProgressLocation.Notification,
        title: vscode.l10n.t('diagnostics.running'),
        cancellable: false
    }, async () => {
        try {
            // Section 1: Environment
            await diagnoseEnvironment(outputChannel);

            // Section 2: Project Detection
            await diagnoseProject(outputChannel);

            // Section 3: Mapper Mappings
            await diagnoseMappings(outputChannel);

            // Section 4: SQL Interceptor
            await diagnoseSqlInterceptor(outputChannel);

            // Section 5: Configuration Validation
            await diagnoseConfiguration(outputChannel);

            // Section 6: Recommendations
            await generateRecommendations(outputChannel);

            logger.info('[Diagnose] Diagnostics completed');
        } catch (error) {
            logger.error('[Diagnose] Diagnostics failed:', error as Error);
            outputChannel.appendLine(`\n${vscode.l10n.t('diagnostics.error')}: ${error}`);
        }
    });
}

/**
 * Section 1: Environment diagnostics
 */
async function diagnoseEnvironment(outputChannel: vscode.OutputChannel): Promise<void> {
    outputChannel.appendLine(vscode.l10n.t('diagnostics.environment'));
    outputChannel.appendLine('');

    // VS Code version
    const vscodeVersion = vscode.version;
    outputChannel.appendLine(`  ${vscode.l10n.t('diagnostics.vscode')}: ${vscodeVersion}`);

    // Java Extension
    const javaExt = vscode.extensions.getExtension('redhat.java');
    if (javaExt) {
        const status = javaExt.isActive
            ? vscode.l10n.t('diagnostics.status.active')
            : vscode.l10n.t('diagnostics.status.inactive');
        outputChannel.appendLine(`  ${vscode.l10n.t('diagnostics.javaExt')}: ${status}`);
    } else {
        outputChannel.appendLine(`  ${vscode.l10n.t('diagnostics.javaExt')}: ${vscode.l10n.t('diagnostics.status.notInstalled')}`);
    }

    // OS
    const platform = process.platform;
    const osName = getOsName(platform);
    outputChannel.appendLine(`  ${vscode.l10n.t('diagnostics.os')}: ${osName} (${platform})`);

    // Extension version
    const ext = vscode.extensions.getExtension('Greenplumwine.mybatis-helper-vscode');
    if (ext) {
        outputChannel.appendLine(`  ${vscode.l10n.t('diagnostics.extVersion')}: ${ext.packageJSON.version}`);
    }

    outputChannel.appendLine('');
}

/**
 * Section 2: Project Detection
 */
async function diagnoseProject(outputChannel: vscode.OutputChannel): Promise<void> {
    outputChannel.appendLine(vscode.l10n.t('diagnostics.project'));
    outputChannel.appendLine('');

    const workspaceFolders = vscode.workspace.workspaceFolders;
    if (!workspaceFolders || workspaceFolders.length === 0) {
        outputChannel.appendLine(`  ${vscode.l10n.t('diagnostics.noWorkspace')}`);
        outputChannel.appendLine('');
        return;
    }

    // Workspace folder
    const workspaceRoot = workspaceFolders[0].uri.fsPath;
    outputChannel.appendLine(`  ${vscode.l10n.t('diagnostics.workspace')}: ${workspaceRoot}`);

    // Build tool detection
    const buildTool = await detectBuildTool(workspaceRoot);
    if (buildTool) {
        outputChannel.appendLine(`  ${vscode.l10n.t('diagnostics.buildTool')}: ${buildTool}`);
    } else {
        outputChannel.appendLine(`  ${vscode.l10n.t('diagnostics.buildTool')}: ${vscode.l10n.t('diagnostics.unknown')}`);
    }

    // Java files count
    const javaFiles = await vscode.workspace.findFiles('**/*.java', '**/{node_modules,.git,target,build,out}/**', 1000);
    outputChannel.appendLine(`  ${vscode.l10n.t('diagnostics.javaFiles')}: ${javaFiles.length}`);

    // XML files count
    const xmlFiles = await vscode.workspace.findFiles('**/*.xml', '**/{node_modules,.git,target,build,out}/**', 1000);
    outputChannel.appendLine(`  ${vscode.l10n.t('diagnostics.xmlFiles')}: ${xmlFiles.length}`);

    outputChannel.appendLine('');
}

/**
 * Section 3: Mapper Mappings
 */
async function diagnoseMappings(outputChannel: vscode.OutputChannel): Promise<void> {
    outputChannel.appendLine(vscode.l10n.t('diagnostics.mappings'));
    outputChannel.appendLine('');

    try {
        const engine = FastMappingEngine.getInstance();
        const stats = engine.getStats();
        const diagnostics = engine.getDiagnostics() as {
            indexSizes?: { namespace?: number; javaPath?: number; xmlPath?: number };
        };

        // Total mappings
        outputChannel.appendLine(`  ${vscode.l10n.t('diagnostics.totalMappings')}: ${stats.total}`);
        outputChannel.appendLine(`  ${vscode.l10n.t('diagnostics.withXml')}: ${stats.withXml}`);
        outputChannel.appendLine(`  ${vscode.l10n.t('diagnostics.totalMethods')}: ${stats.totalMethods}`);

        // Index sizes
        if (diagnostics.indexSizes) {
            outputChannel.appendLine(`  ${vscode.l10n.t('diagnostics.indexSizes')}:`);
            outputChannel.appendLine(`    - ${vscode.l10n.t('diagnostics.namespaceIndex')}: ${diagnostics.indexSizes.namespace || 0}`);
            outputChannel.appendLine(`    - ${vscode.l10n.t('diagnostics.javaPathIndex')}: ${diagnostics.indexSizes.javaPath || 0}`);
            outputChannel.appendLine(`    - ${vscode.l10n.t('diagnostics.xmlPathIndex')}: ${diagnostics.indexSizes.xmlPath || 0}`);
        }

        // Check for unmapped Java files
        const javaFiles = await vscode.workspace.findFiles('**/*.java', '**/{node_modules,.git,target,build,out}/**', 1000);
        const unmappedJava: string[] = [];

        for (const javaFile of javaFiles.slice(0, 100)) { // Limit to first 100
            const mapping = engine.getByJavaPath(javaFile.fsPath);
            if (!mapping || !mapping.xmlPath) {
                // Check if it's a mapper interface
                try {
                    const document = await vscode.workspace.openTextDocument(javaFile);
                    const content = document.getText();
                    const isInterface = /interface\s+\w+/.test(content);
                    const hasMyBatis = /@Mapper|@Select|@Insert|@Update|@Delete|import\s+org\.apache\.ibatis/.test(content);

                    if (isInterface && hasMyBatis) {
                        const classNameMatch = content.match(/interface\s+(\w+)/);
                        if (classNameMatch) {
                            unmappedJava.push(classNameMatch[1]);
                        }
                    }
                } catch {
                    // Ignore errors
                }
            }
        }

        if (unmappedJava.length > 0) {
            outputChannel.appendLine(`  ${vscode.l10n.t('diagnostics.unmappedJava')}: ${unmappedJava.length}`);
            outputChannel.appendLine(`    ${vscode.l10n.t('diagnostics.files')}: ${unmappedJava.slice(0, 10).join(', ')}${unmappedJava.length > 10 ? '...' : ''}`);
            outputChannel.appendLine(`    ${vscode.l10n.t('diagnostics.suggestion')}: ${vscode.l10n.t('diagnostics.checkXmlDirs')}`);
        }

        // Check for unmapped XML files
        const xmlFiles = await vscode.workspace.findFiles('**/*.xml', '**/{node_modules,.git,target,build,out}/**', 1000);
        const unmappedXml: string[] = [];

        for (const xmlFile of xmlFiles.slice(0, 100)) { // Limit to first 100
            const mapping = engine.getByXmlPath(xmlFile.fsPath);
            if (!mapping) {
                // Check if it's a MyBatis mapper XML
                try {
                    const content = fs.readFileSync(xmlFile.fsPath, 'utf-8');
                    if (content.includes('<!DOCTYPE mapper') || content.includes('<mapper')) {
                        unmappedXml.push(path.basename(xmlFile.fsPath, '.xml'));
                    }
                } catch {
                    // Ignore errors
                }
            }
        }

        if (unmappedXml.length > 0) {
            outputChannel.appendLine(`  ${vscode.l10n.t('diagnostics.unmappedXml')}: ${unmappedXml.length}`);
            outputChannel.appendLine(`    ${vscode.l10n.t('diagnostics.files')}: ${unmappedXml.slice(0, 10).join(', ')}${unmappedXml.length > 10 ? '...' : ''}`);
            outputChannel.appendLine(`    ${vscode.l10n.t('diagnostics.suggestion')}: ${vscode.l10n.t('diagnostics.checkJavaFiles')}`);
        }

    } catch (error) {
        outputChannel.appendLine(`  ${vscode.l10n.t('diagnostics.mappingError')}: ${error}`);
    }

    outputChannel.appendLine('');
}

/**
 * Section 4: SQL Interceptor
 */
async function diagnoseSqlInterceptor(outputChannel: vscode.OutputChannel): Promise<void> {
    outputChannel.appendLine(vscode.l10n.t('diagnostics.sqlInterceptor'));
    outputChannel.appendLine('');

    try {
        const interceptor = SQLInterceptorService.getInstance();
        const config = interceptor.getConfig();

        // Status
        const status = interceptor.isRunning
            ? vscode.l10n.t('diagnostics.status.running')
            : vscode.l10n.t('diagnostics.status.stopped');
        outputChannel.appendLine(`  ${vscode.l10n.t('diagnostics.status')}: ${status}`);

        // Mode
        outputChannel.appendLine(`  ${vscode.l10n.t('diagnostics.mode')}: ${config.listenMode}`);

        // History entries
        const history = interceptor.getHistory();
        outputChannel.appendLine(`  ${vscode.l10n.t('diagnostics.historyEntries')}: ${history.length}`);

        // Auto-start
        outputChannel.appendLine(`  ${vscode.l10n.t('diagnostics.autoStart')}: ${config.autoStart ? vscode.l10n.t('diagnostics.enabled') : vscode.l10n.t('diagnostics.disabled')}`);

        if (!interceptor.isRunning) {
            outputChannel.appendLine(`  ${vscode.l10n.t('diagnostics.suggestion')}: ${vscode.l10n.t('diagnostics.checkSqlConfig')}`);
        }

    } catch (error) {
        outputChannel.appendLine(`  ${vscode.l10n.t('diagnostics.sqlError')}: ${error}`);
    }

    outputChannel.appendLine('');
}

/**
 * Section 5: Configuration Validation
 */
async function diagnoseConfiguration(outputChannel: vscode.OutputChannel): Promise<void> {
    outputChannel.appendLine(vscode.l10n.t('diagnostics.config'));
    outputChannel.appendLine('');

    try {
        const result = await validateConfiguration();
        const errors = result.issues.filter(i => i.severity === 'error');
        const warnings = result.issues.filter(i => i.severity === 'warning');

        if (result.valid && result.issues.length === 0) {
            outputChannel.appendLine(`  ${vscode.l10n.t('diagnostics.configValid')}`);
        } else {
            outputChannel.appendLine(`  ${vscode.l10n.t('diagnostics.configIssues')}: ${errors.length} ${vscode.l10n.t('diagnostics.errors')}, ${warnings.length} ${vscode.l10n.t('diagnostics.warnings')}`);

            for (const issue of result.issues.slice(0, 5)) { // Show first 5 issues
                const icon = issue.severity === 'error' ? '✗' : '⚠';
                outputChannel.appendLine(`    ${icon} ${issue.configPath}: ${issue.message}`);
            }

            if (result.issues.length > 5) {
                outputChannel.appendLine(`    ... and ${result.issues.length - 5} more issues`);
            }
        }

    } catch (error) {
        outputChannel.appendLine(`  ${vscode.l10n.t('diagnostics.configError')}: ${error}`);
    }

    outputChannel.appendLine('');
}

/**
 * Section 6: Recommendations
 */
async function generateRecommendations(outputChannel: vscode.OutputChannel): Promise<void> {
    outputChannel.appendLine(vscode.l10n.t('diagnostics.recommendations'));
    outputChannel.appendLine('');

    const recommendations: string[] = [];

    // Check Java extension
    const javaExt = vscode.extensions.getExtension('redhat.java');
    if (!javaExt) {
        recommendations.push(vscode.l10n.t('diagnostics.rec.installJavaExt'));
    } else if (!javaExt.isActive) {
        recommendations.push(vscode.l10n.t('diagnostics.rec.activateJavaExt'));
    }

    // Check mappings
    try {
        const engine = FastMappingEngine.getInstance();
        const stats = engine.getStats();
        if (stats.total === 0) {
            recommendations.push(vscode.l10n.t('diagnostics.rec.noMappings'));
        } else if (stats.withXml < stats.total) {
            recommendations.push(vscode.l10n.t('diagnostics.rec.someUnmapped', String(stats.total - stats.withXml)));
        }
    } catch {
        // Ignore
    }

    // Check SQL interceptor
    try {
        const interceptor = SQLInterceptorService.getInstance();
        if (!interceptor.isRunning) {
            recommendations.push(vscode.l10n.t('diagnostics.rec.sqlNotRunning'));
        }
    } catch {
        // Ignore
    }

    // Output recommendations
    if (recommendations.length === 0) {
        outputChannel.appendLine(`  ${vscode.l10n.t('diagnostics.noRecommendations')}`);
    } else {
        for (let i = 0; i < recommendations.length; i++) {
            outputChannel.appendLine(`  ${i + 1}. ${recommendations[i]}`);
        }
    }

    outputChannel.appendLine('');
    outputChannel.appendLine(vscode.l10n.t('diagnostics.seeDocs'));
}

/**
 * Detect build tool used in project
 */
async function detectBuildTool(workspaceRoot: string): Promise<string | undefined> {
    const pomPath = path.join(workspaceRoot, 'pom.xml');
    const gradlePath = path.join(workspaceRoot, 'build.gradle');
    const gradleKtsPath = path.join(workspaceRoot, 'build.gradle.kts');

    if (fs.existsSync(pomPath)) {
        // Check if it's a multi-module project
        try {
            const content = fs.readFileSync(pomPath, 'utf-8');
            if (content.includes('<modules>')) {
                return 'Maven (Multi-module)';
            }
        } catch {
            // Ignore
        }
        return 'Maven';
    }

    if (fs.existsSync(gradlePath) || fs.existsSync(gradleKtsPath)) {
        // Check if it's a multi-module project
        const settingsPath = path.join(workspaceRoot, 'settings.gradle');
        const settingsKtsPath = path.join(workspaceRoot, 'settings.gradle.kts');

        if (fs.existsSync(settingsPath) || fs.existsSync(settingsKtsPath)) {
            try {
                const settingsFile = fs.existsSync(settingsPath) ? settingsPath : settingsKtsPath;
                const content = fs.readFileSync(settingsFile, 'utf-8');
                if (content.includes('include')) {
                    return 'Gradle (Multi-module)';
                }
            } catch {
                // Ignore
            }
        }
        return 'Gradle';
    }

    return undefined;
}

/**
 * Get OS name from platform
 */
function getOsName(platform: string): string {
    switch (platform) {
        case 'win32':
            return 'Windows';
        case 'darwin':
            return 'macOS';
        case 'linux':
            return 'Linux';
        default:
            return platform;
    }
}
