import * as vscode from "vscode";
import { FileMapper } from "../mapping/filemapper";
import { logger } from "../../utils/logger";

/**
 * CodeLens Provider for MyBatis Helper
 * Provides CodeLens for jumping between Java Mapper interfaces and XML files
 */
export class MyBatisCodeLensProvider implements vscode.CodeLensProvider {
    private _onDidChangeCodeLenses: vscode.EventEmitter<void> = new vscode.EventEmitter<void>();
    public readonly onDidChangeCodeLenses: vscode.Event<void> = this._onDidChangeCodeLenses.event;
    private fileMapper: FileMapper;
    private isEnabled: boolean = true;
    private codeLensCache: Map<string, vscode.CodeLens[]> = new Map();

    /**
     * Creates a new MyBatisCodeLensProvider instance
     * @param fileMapper The FileMapper instance for mapping between Java and XML files
     */
    constructor(fileMapper: FileMapper) {
        this.fileMapper = fileMapper;

        // Listen for configuration changes
        vscode.workspace.onDidChangeConfiguration((e) => {
            if (e.affectsConfiguration("mybatis-helper.enableCodeLens")) {
                this.isEnabled = vscode.workspace.getConfiguration("mybatis-helper").get<boolean>("enableCodeLens", true);
                // Clear cache when configuration changes
                this.clearCache();
                this._onDidChangeCodeLenses.fire();
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
            try {
                this.clearCache();
            } catch (error) {
                logger.error(`Error during cache cleanup: ${error instanceof Error ? error.message : String(error)}`);
            }
        }, 5 * 60 * 1000);
    }

    /**
     * Clear CodeLens cache
     */
    public clearCache(): void {
        this.codeLensCache.clear();
    }

    /**
     * Refresh CodeLenses
     */
    public refresh(): void {
        this.clearCache();
        this._onDidChangeCodeLenses.fire();
    }

    /**
     * Provide CodeLenses for the given document with caching
     * @param document The document to provide CodeLenses for
     * @param token Cancellation token to cancel the operation
     * @returns Array of CodeLenses for the document
     */
    public provideCodeLenses(document: vscode.TextDocument, token: vscode.CancellationToken): vscode.CodeLens[] {
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
            logger.error(`Error providing CodeLenses: ${error instanceof Error ? error.message : String(error)}`);
            return [];
        }
    }

    /**
     * Provide CodeLenses for Java files
     * @param document The Java document to provide CodeLenses for
     * @returns Array of CodeLenses for the Java document
     */
    private provideJavaCodeLenses(document: vscode.TextDocument): vscode.CodeLens[] {
        try {
            // First check if the Java file is a Mapper interface
            const text = document.getText();
            const isMapperInterface = this.isMapperInterface(text);
            
            // Only provide CodeLenses for Mapper interfaces
            if (!isMapperInterface) {
                return [];
            }

            const lenses: vscode.CodeLens[] = [];
            
            // 1. Add class-level CodeLens
            const classRegex = /interface\s+(\w+)\s*\{/g;
            let classMatch = classRegex.exec(text);
            if (classMatch) {
                const line = document.positionAt(classMatch.index).line;
                const position = new vscode.Position(line, 0);
                const range = new vscode.Range(position, position);

                // Create class-level CodeLens (no method name)
                const classCodeLens = new vscode.CodeLens(range);
                classCodeLens.command = {
                    title: vscode.l10n.t("codeLens.jumpToXml"),
                    command: "mybatis-helper.jumpToXml",
                    arguments: [document.uri.fsPath] // No method name - jump to beginning
                };

                lenses.push(classCodeLens);
            }

            // 2. Add method-level CodeLenses
            // Improved approach: process each line individually to skip comments
            const lines = text.split('\n');
            
            // Process matches in batches to avoid blocking the UI
            const batchSize = 100; // Process 100 methods at a time
            let matchCount = 0;

            for (let lineNum = 0; lineNum < lines.length && matchCount < batchSize; lineNum++) {
                // Check if cancellation is requested
                if (vscode.window.activeTextEditor?.document !== document) {
                    break;
                }
                
                const line = lines[lineNum];
                
                // Skip empty lines, comments, and JavaDoc
                if (line.trim() === '' || line.trim().startsWith('//') || line.trim().startsWith('/*') || line.trim().startsWith(' * ')) {
                    continue;
                }
                
                // Regex for method signatures - improved to skip comments
                const methodRegex = /^(?!\s*\*\s+)(?!\s*\/\/)\s*(?:public|private|protected)?\s*(?:static\s+)?[\w<>,\s]+\s+(\w+)\s*\([^)]*\)/;
                const match = methodRegex.exec(line);
                if (match) {
                    const methodName = match[1];
                    const position = new vscode.Position(lineNum, 0);
                    const range = new vscode.Range(position, position);

                    // Create CodeLens for this method
                    const codeLens = new vscode.CodeLens(range);
                    codeLens.command = {
                        title: vscode.l10n.t("codeLens.jumpToXml"),
                        command: "mybatis-helper.jumpToXml",
                        arguments: [document.uri.fsPath, methodName]
                    };

                    lenses.push(codeLens);
                    matchCount++;
                    logger.debug(`[provideJavaCodeLenses] Added method-level CodeLens for method ${methodName} at line ${lineNum}`);
                }

                // Prevent infinite loops
                if (matchCount > 1000) {
                    logger.warn('Possible infinite loop detected in Java method parsing');
                    break;
                }
            }

            return lenses;
        } catch (error) {
            logger.error(`Error providing Java CodeLenses: ${error instanceof Error ? error.message : String(error)}`);
            return [];
        }
    }

    /**
     * Check if the Java file is a Mapper interface
     * @param fileContent The content of the Java file
     * @returns True if the file is a Mapper interface
     */
    private isMapperInterface(fileContent: string): boolean {
        try {
            logger.debug('[isMapperInterface] Checking if file is a Mapper interface');
            
            // Common indicators of a Mapper interface
            const mapperIndicators = [
                // Check for @Mapper annotation
                /@Mapper\b/,
                // Check for MyBatis specific annotations
                /@Select\b|@Insert\b|@Update\b|@Delete\b|@SelectKey\b/,
                // Check for MyBatis specific imports
                /import\s+org\.apache\.ibatis\.annotations\./,
                /import\s+org\.mybatis\./,
                // Check for MyBatis Spring annotations
                /import\s+org\.mybatis\.spring\.annotation\.MapperScan;/,
                // Check for interface declaration with common Mapper naming
                /interface\s+\w*Mapper\s*\{/,
                /interface\s+\w*Dao\s*\{/
            ];

            // If any of the indicators are found, consider it a Mapper interface
            const isMapper = mapperIndicators.some(indicator => indicator.test(fileContent));
            logger.debug(`[isMapperInterface] Result: ${isMapper}`);
            return isMapper;
        } catch (error) {
            logger.error(`Error checking if file is a Mapper interface: ${error instanceof Error ? error.message : String(error)}`);
            return false;
        }
    }

    /**
     * Provide CodeLenses for XML files
     * @param document The XML document to provide CodeLenses for
     * @returns Array of CodeLenses for the XML document
     */
    private provideXmlCodeLenses(document: vscode.TextDocument): vscode.CodeLens[] {
        try {
            // Regex for SQL tags in XML files
            const tagRegex = /<(select|update|insert|delete)\s+[^>]*id\s*=\s*["']([^"']+)["'][^>]*>/gmi;

            const lenses: vscode.CodeLens[] = [];
            const text = document.getText();
            let match;

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
                
                // Debug log for CodeLens creation
                logger.debug(`Creating CodeLens for method: ${methodName} at line: ${line}`);

                lenses.push(codeLens);
                matchCount++;

                // Prevent infinite loops
                if (matchCount > 1000) {
                    logger.warn('Possible infinite loop detected in XML tag parsing');
                    break;
                }
            }

            return lenses;
        } catch (error) {
            logger.error(`Error providing XML CodeLenses: ${error instanceof Error ? error.message : String(error)}`);
            return [];
        }
    }

    /**
     * Resolve CodeLens to provide additional information with caching
     * @param codeLens The CodeLens to resolve
     * @param token Cancellation token to cancel the operation
     * @returns Resolved CodeLens or undefined if not resolvable
     */
    public resolveCodeLens(codeLens: vscode.CodeLens, token: vscode.CancellationToken): vscode.CodeLens | undefined {
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
                    
                    // Check if we have a mapping for this Java file
                    const xmlPath = this.fileMapper.getMappings().get(javaFilePath);
                    if (!xmlPath) {
                        // No mapping found, don't show the CodeLens
                        return undefined;
                    }
                }
                // For XML to Java navigation
                else if (codeLens.command.command === "mybatis-helper.jumpToMapper" && codeLens.command.arguments.length >= 2) {
                    const xmlFilePath = codeLens.command.arguments[0];
                    
                    // Check if we have a mapping for this XML file
                    const javaPath = this.fileMapper.getReverseMappings().get(xmlFilePath);
                    if (!javaPath) {
                        // No mapping found, don't show the CodeLens
                        return undefined;
                    }
                }
            }

            return codeLens;
        } catch (error) {
            logger.error(`Error resolving CodeLens: ${error instanceof Error ? error.message : String(error)}`);
            return undefined;
        }
    }

    /**
     * Dispose resources and clear cache
     */
    public dispose(): void {
        try {
            this.clearCache();
            this._onDidChangeCodeLenses.dispose();
        } catch (error) {
            logger.error(`Error during dispose: ${error instanceof Error ? error.message : String(error)}`);
        }
    }
}