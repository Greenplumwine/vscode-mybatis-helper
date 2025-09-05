import * as vscode from "vscode";
import { FileMapper } from "./filemapper";

/**
 * CodeLens Provider for MyBatis Helper
 * Provides CodeLens for jumping between Java Mapper interfaces and XML files
 */
export class MyBatisCodeLensProvider implements vscode.CodeLensProvider {
    private _onDidChangeCodeLenses: vscode.EventEmitter<void> = new vscode.EventEmitter<void>();
    public readonly onDidChangeCodeLenses: vscode.Event<void> = this._onDidChangeCodeLenses.event;
    private fileMapper: FileMapper;
    private isEnabled: boolean = true;

    constructor(fileMapper: FileMapper) {
        this.fileMapper = fileMapper;

        // Listen for configuration changes
        vscode.workspace.onDidChangeConfiguration((e) => {
            if (e.affectsConfiguration("mybatis-helper.enableCodeLens")) {
                this.isEnabled = vscode.workspace.getConfiguration("mybatis-helper").get<boolean>("enableCodeLens", true);
                this._onDidChangeCodeLenses.fire();
            }
        });

        // Initialize configuration
        this.isEnabled = vscode.workspace.getConfiguration("mybatis-helper").get<boolean>("enableCodeLens", true);
    }

    /**
     * Refresh CodeLenses
     */
    public refresh(): void {
        this._onDidChangeCodeLenses.fire();
    }

    /**
     * Provide CodeLenses for the given document
     */
    public provideCodeLenses(document: vscode.TextDocument, token: vscode.CancellationToken): vscode.CodeLens[] {
        // Check if CodeLens is enabled
        if (!this.isEnabled) {
            return [];
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

        return lenses;
    }

    /**
     * Provide CodeLenses for Java files
     */
    private provideJavaCodeLenses(document: vscode.TextDocument): vscode.CodeLens[] {
        const lenses: vscode.CodeLens[] = [];
        const text = document.getText();

        // Regex to find method signatures in Java files - more flexible pattern
        const methodRegex = /^(\s*(public|private|protected|default)?\s*(static\s+)?[\w<>,\[\]]+(\s+\w+(<[^>]+>)?)?\s+(\w+)\s*\([^)]*\))/gm;
        let match;

        while ((match = methodRegex.exec(text)) !== null) {
            const methodName = match[5];
            const line = document.positionAt(match.index).line;
            const position = new vscode.Position(line, 0);
            const range = new vscode.Range(position, position);

            // Create CodeLens for this method
            const codeLens = new vscode.CodeLens(range);
            codeLens.command = {
                title: vscode.l10n.t("codeLens.jumpToXml"),
                command: "mybatis-helper.jumpToXml",
                arguments: [document.uri.fsPath, methodName]
            };

            lenses.push(codeLens);
        }

        return lenses;
    }

    /**
     * Provide CodeLenses for XML files
     */
    private provideXmlCodeLenses(document: vscode.TextDocument): vscode.CodeLens[] {
        const lenses: vscode.CodeLens[] = [];
        const text = document.getText();

        // Regex to find select/update/insert/delete tags with id attribute
        const tagRegex = /<(select|update|insert|delete)\s+[^>]*id="([^"]+)"/gmi;
        let match;

        while ((match = tagRegex.exec(text)) !== null) {
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

            lenses.push(codeLens);
        }

        return lenses;
    }

    /**
     * Resolve CodeLens to provide additional information
     */
    public resolveCodeLens(codeLens: vscode.CodeLens, token: vscode.CancellationToken): vscode.CodeLens | undefined {
        // Here we could add additional checks to ensure the mapping exists before showing the CodeLens
        // For example, we could check if the XML/Mapper file exists
        return codeLens;
    }
}