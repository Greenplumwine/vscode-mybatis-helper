import * as vscode from "vscode";
import { FileMapper } from "./filemapper";
import { PerformanceUtils } from '../utils/performanceUtils';
import { RegexUtils } from '../utils/performanceUtils';

/**
 * CodeLens Provider for MyBatis Helper
 * Provides CodeLens for jumping between Java Mapper interfaces and XML files
 */
export class MyBatisCodeLensProvider implements vscode.CodeLensProvider {
    private _onDidChangeCodeLenses: vscode.EventEmitter<void> = new vscode.EventEmitter<void>();
    public readonly onDidChangeCodeLenses: vscode.Event<void> = this._onDidChangeCodeLenses.event;
    private fileMapper: FileMapper;
    private isEnabled: boolean = true;
    private performanceUtils: PerformanceUtils;
    private regexUtils: RegexUtils;
    private codeLensCache: Map<string, vscode.CodeLens[]> = new Map();

    constructor(fileMapper: FileMapper) {
        this.fileMapper = fileMapper;
        this.performanceUtils = PerformanceUtils.getInstance();
        this.regexUtils = RegexUtils.getInstance();

        // Listen for configuration changes
        vscode.workspace.onDidChangeConfiguration((e) => {
            const startTime = Date.now();
            try {
                if (e.affectsConfiguration("mybatis-helper.enableCodeLens")) {
                    this.isEnabled = vscode.workspace.getConfiguration("mybatis-helper").get<boolean>("enableCodeLens", true);
                    // Clear cache when configuration changes
                    this.clearCache();
                    this._onDidChangeCodeLenses.fire();
                }
            } finally {
                this.performanceUtils.recordExecutionTime('MyBatisCodeLensProvider.onDidChangeConfiguration', Date.now() - startTime);
            }
        });

        // Initialize configuration
        this.isEnabled = vscode.workspace.getConfiguration("mybatis-helper").get<boolean>("enableCodeLens", true);

        // Schedule periodic cache clearing to prevent memory leaks
        this.scheduleCacheCleanup();
    }

    /**
     * Schedule periodic cache cleanup
     */
    private scheduleCacheCleanup(): void {
        // Clean cache every 5 minutes
        setInterval(() => {
            const startTime = Date.now();
            try {
                this.clearCache();
            } finally {
                this.performanceUtils.recordExecutionTime('MyBatisCodeLensProvider.scheduleCacheCleanup', Date.now() - startTime);
            }
        }, 5 * 60 * 1000);
    }

    /**
     * Clear CodeLens cache
     */
    public clearCache(): void {
        const startTime = Date.now();
        try {
            this.codeLensCache.clear();
        } finally {
            this.performanceUtils.recordExecutionTime('MyBatisCodeLensProvider.clearCache', Date.now() - startTime);
        }
    }

    /**
     * Refresh CodeLenses
     */
    public refresh(): void {
        const startTime = Date.now();
        try {
            this.clearCache();
            this._onDidChangeCodeLenses.fire();
        } finally {
            this.performanceUtils.recordExecutionTime('MyBatisCodeLensProvider.refresh', Date.now() - startTime);
        }
    }

    /**
     * Provide CodeLenses for the given document with caching and performance tracking
     */
    public provideCodeLenses(document: vscode.TextDocument, token: vscode.CancellationToken): vscode.CodeLens[] {
        const startTime = Date.now();
        try {
            // Check if CodeLens is enabled
            if (!this.isEnabled) {
                return [];
            }

            // Check cache first
            const cacheKey = `${document.uri.fsPath}_${document.version}`;
            const cachedLenses = this.codeLensCache.get(cacheKey);
            if (cachedLenses) {
                return cachedLenses;
            }

            const lenses: vscode.CodeLens[] = [];

            // For Java files, provide "Jump to XML" CodeLens
            if (document.languageId === "java") {
                lenses.push(...this.provideJavaCodeLenses(document));
            }
            // For XML files, provide "Jump to Mapper" CodeLens
            else if (document.languageId === "xml") {
                lenses.push(...this.provideXmlCodeLenses(document));
            }

            // Cache the lenses
            this.codeLensCache.set(cacheKey, lenses);

            return lenses;
        } catch (error) {
            console.error("Error providing CodeLenses:", error);
            return [];
        } finally {
            this.performanceUtils.recordExecutionTime('MyBatisCodeLensProvider.provideCodeLenses', Date.now() - startTime);
        }
    }

    /**
     * Provide CodeLenses for Java files with performance optimization
     */
    private provideJavaCodeLenses(document: vscode.TextDocument): vscode.CodeLens[] {
        const startTime = Date.now();
        try {
            // First check if the Java file is a Mapper interface
            const text = document.getText();
            const isMapperInterface = this.isMapperInterface(text);
            
            // Only provide CodeLenses for Mapper interfaces
            if (!isMapperInterface) {
                return [];
            }

            // Get or create cached regex for method signatures
            // 修复正则表达式：移除有问题的前瞻断言，直接匹配访问修饰符
            const methodRegex = this.regexUtils.getRegex(
                /(?:public|private|protected)?\s+(?:static\s+)?[\w<>\[\],\s]+\s+(\w+)\s*\([^)]*\)/g
            );

            const lenses: vscode.CodeLens[] = [];
            let match;

            // Reset regex state
            methodRegex.lastIndex = 0;

            // Process matches in batches to avoid blocking the UI
            const batchSize = 100; // Process 100 methods at a time
            let matchCount = 0;

            while ((match = methodRegex.exec(text)) !== null && matchCount < batchSize) {
                // Check if cancellation is requested
                if (vscode.window.activeTextEditor?.document !== document) {
                    break;
                }

                const methodName = match[1]; // 修复索引，应该是第1个捕获组
                const line = document.positionAt(match.index).line;
                const position = new vscode.Position(line, 0);
                const range = new vscode.Range(position, position);

                // Check if the method exists in the corresponding XML file
                const xmlPath = this.fileMapper.getMappings().get(document.uri.fsPath);
                if (xmlPath) {
                    // We have a mapping, but we should check if the method exists in the XML
                    // This is a simplified check - in a real implementation, we might want to do a more thorough check
                }

                // Create CodeLens for this method
                const codeLens = new vscode.CodeLens(range);
                codeLens.command = {
                    title: vscode.l10n.t("codeLens.jumpToXml"),
                    command: "mybatis-helper.jumpToXml",
                    arguments: [document.uri.fsPath, methodName]
                };

                lenses.push(codeLens);
                matchCount++;

                // Prevent infinite loops
                if (matchCount > 1000) {
                    console.warn('Possible infinite loop detected in Java method parsing');
                    break;
                }
            }

            return lenses;
        } catch (error) {
            console.error("Error providing Java CodeLenses:", error);
            return [];
        } finally {
            this.performanceUtils.recordExecutionTime('MyBatisCodeLensProvider.provideJavaCodeLenses', Date.now() - startTime);
        }
    }

    /**
     * Check if the Java file is a Mapper interface
     * @param fileContent The content of the Java file
     * @returns True if the file is a Mapper interface
     */
    private isMapperInterface(fileContent: string): boolean {
        try {
            // Common indicators of a Mapper interface
            const mapperIndicators = [
                // Check for @Mapper annotation
                /@Mapper\b/,
                // Check for MyBatis specific imports
                /import\s+org\.apache\.ibatis\.annotations\./,
                // Check for MyBatis Spring annotations
                /import\s+org\.mybatis\.spring\.annotation\.MapperScan;/,
                // Check for interface declaration with common Mapper naming
                /interface\s+\w*Mapper\s*\{/,
                /interface\s+\w*Dao\s*\{/
            ];

            // If any of the indicators are found, consider it a Mapper interface
            return mapperIndicators.some(indicator => indicator.test(fileContent));
        } catch (error) {
            console.error("Error checking if file is a Mapper interface:", error);
            return false;
        }
    }

    /**
     * Provide CodeLenses for XML files with performance optimization
     */
    private provideXmlCodeLenses(document: vscode.TextDocument): vscode.CodeLens[] {
        const startTime = Date.now();
        try {
            // Get or create cached regex for SQL tags
            // 改进正则表达式以更好地匹配XML标签
            const tagRegex = this.regexUtils.getRegex(
                /<(select|update|insert|delete)\s+[^>]*id\s*=\s*["']([^"']+)["'][^>]*>/gmi
            );

            const lenses: vscode.CodeLens[] = [];
            const text = document.getText();
            let match;

            // Reset regex state
            tagRegex.lastIndex = 0;

            // Process matches in batches to avoid blocking the UI
            const batchSize = 100; // Process 100 SQL statements at a time
            let matchCount = 0;

            while ((match = tagRegex.exec(text)) !== null && matchCount < batchSize) {
                // Check if cancellation is requested
                if (vscode.window.activeTextEditor?.document !== document) {
                    break;
                }

                const methodName = match[2];
                const line = document.positionAt(match.index).line;
                const position = new vscode.Position(line, 0);
                const range = new vscode.Range(position, position);

                // Create CodeLens for this SQL statement
                const codeLens = new vscode.CodeLens(range);
                codeLens.command = {
                    title: vscode.l10n.t("codeLens.jumpToMapper"),
                    command: "mybatis-helper.jumpToMapper",
                    arguments: [document.uri.fsPath, methodName]
                };
                
                // 添加调试日志
                console.log(`Creating CodeLens for method: ${methodName} at line: ${line}`);

                lenses.push(codeLens);
                matchCount++;

                // Prevent infinite loops
                if (matchCount > 1000) {
                    console.warn('Possible infinite loop detected in XML tag parsing');
                    break;
                }
            }

            return lenses;
        } catch (error) {
            console.error("Error providing XML CodeLenses:", error);
            return [];
        } finally {
            this.performanceUtils.recordExecutionTime('MyBatisCodeLensProvider.provideXmlCodeLenses', Date.now() - startTime);
        }
    }

    /**
     * Resolve CodeLens to provide additional information with caching
     */
    public resolveCodeLens(codeLens: vscode.CodeLens, token: vscode.CancellationToken): vscode.CodeLens | undefined {
        const startTime = Date.now();
        try {
            // Check if cancellation is requested
            if (token.isCancellationRequested) {
                return undefined;
            }

            // Check if the target method exists before showing the CodeLens
            if (codeLens.command && codeLens.command.arguments) {
                // For Java to XML navigation
                if (codeLens.command.command === "mybatis-helper.jumpToXml" && codeLens.command.arguments.length >= 2) {
                    const javaFilePath = codeLens.command.arguments[0];
                    const methodName = codeLens.command.arguments[1];
                    
                    // Check if we have a mapping for this Java file
                    const xmlPath = this.fileMapper.getMappings().get(javaFilePath);
                    if (xmlPath) {
                        // Store the target information for later use in the command execution
                        // The actual method existence check will be done when the command is executed
                    } else {
                        // No mapping found, don't show the CodeLens
                        return undefined;
                    }
                }
                // For XML to Java navigation
                else if (codeLens.command.command === "mybatis-helper.jumpToMapper" && codeLens.command.arguments.length >= 2) {
                    const xmlFilePath = codeLens.command.arguments[0];
                    const methodName = codeLens.command.arguments[1];
                    
                    // Check if we have a mapping for this XML file
                    const javaPath = this.fileMapper.getReverseMappings().get(xmlFilePath);
                    if (javaPath) {
                        // Store the target information for later use in the command execution
                        // The actual method existence check will be done when the command is executed
                    } else {
                        // No mapping found, don't show the CodeLens
                        return undefined;
                    }
                }
            }

            return codeLens;
        } finally {
            this.performanceUtils.recordExecutionTime('MyBatisCodeLensProvider.resolveCodeLens', Date.now() - startTime);
        }
    }

    /**
     * Dispose resources and clear cache
     */
    public dispose(): void {
        const startTime = Date.now();
        try {
            this.clearCache();
            this._onDidChangeCodeLenses.dispose();
        } finally {
            this.performanceUtils.recordExecutionTime('MyBatisCodeLensProvider.dispose', Date.now() - startTime);
        }
    }
}