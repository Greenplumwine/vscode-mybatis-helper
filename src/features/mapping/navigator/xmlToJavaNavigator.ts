import * as vscode from 'vscode';
import { FileMapper } from '../filemapper';
import { JavaExtensionAPI } from '../../../utils/javaExtensionAPI';
import { logger } from '../../../utils/logger';

/**
 * XML to Java Navigator
 * Handles navigation from XML files to corresponding Java Mapper files
 */
export class XmlToJavaNavigator {
    private fileMapper: FileMapper;

    /**
     * Creates a new XmlToJavaNavigator instance
     * @param fileMapper FileMapper instance for mapping XML files to Java files
     */
    constructor(fileMapper: FileMapper) {
        this.fileMapper = fileMapper;
    }

    /**
     * Navigate from XML file to corresponding Java Mapper file
     * @param xmlFilePath Path to the XML file
     * @param methodName Optional method name to navigate to in the Java file
     */
    public async navigateToJava(xmlFilePath: string, methodName?: string): Promise<void> {
        try {
            logger.debug("[XmlToJavaNavigator.navigateToJava] Called with:", { xmlFilePath, methodName });
            
            // Parse XML file's namespace
            const namespace = await this.fileMapper.parseXmlNamespacePublic(xmlFilePath);
            if (!namespace) {
                logger.debug("[XmlToJavaNavigator.navigateToJava] No namespace found in XML file");
                vscode.window.showErrorMessage(vscode.l10n.t("fileMapper.noNamespace"));
                return;
            }
            
            logger.debug("[XmlToJavaNavigator.navigateToJava] Namespace found:", namespace);
            
            // Extract class name from namespace
            const className = namespace.substring(namespace.lastIndexOf(".") + 1);
            logger.debug("[XmlToJavaNavigator.navigateToJava] Class name extracted:", className);
            
            // Find corresponding Java file
            const javaFilePath = await this.fileMapper.findJavaFileByClassNamePublic(className);
            if (!javaFilePath) {
                logger.debug("[XmlToJavaNavigator.navigateToJava] Java file not found for namespace:", namespace);
                vscode.window.showErrorMessage(vscode.l10n.t("fileMapper.noMapperInterface"));
                return;
            }
            
            logger.debug("[XmlToJavaNavigator.navigateToJava] Java file found:", javaFilePath);
            
            // First try to navigate using Java Extension API
            if (methodName) {
                logger.debug("[XmlToJavaNavigator.navigateToJava] Attempting navigation via Java Extension API");
                try {
                    const javaExtApi = JavaExtensionAPI.getInstance();
                    if (javaExtApi.isReady) {
                        // Try to navigate to method using Java Extension API
                        const success = await javaExtApi.navigateToMethod(javaFilePath, methodName);
                        if (success) {
                            logger.debug("[XmlToJavaNavigator.navigateToJava] Java Extension API navigation succeeded");
                            return;
                        } else {
                            logger.debug("[XmlToJavaNavigator.navigateToJava] Java Extension API navigation failed");
                        }
                    }
                } catch (error) {
                    logger.warn("[XmlToJavaNavigator.navigateToJava] Java Extension API navigation failed:", error as Error);
                }
                
                // If Java Extension API is unavailable or fails, use regex method
                logger.debug("[XmlToJavaNavigator.navigateToJava] Using regex method to find Java method position for:", methodName);
                const position = await this.fileMapper.findJavaMethodPositionPublic(javaFilePath, methodName);
                logger.debug("[XmlToJavaNavigator.navigateToJava] Method position found:", position);
                
                if (position) {
                    await this.fileMapper.jumpToFilePublic(javaFilePath, position);
                    return;
                }
            }
            
            // Jump to the beginning of the Java file
            logger.debug("[XmlToJavaNavigator.navigateToJava] Jumping to file beginning");
            await this.fileMapper.jumpToFilePublic(javaFilePath);
        } catch (error) {
            logger.error('[XmlToJavaNavigator.navigateToJava] Error navigating to Java:', error as Error);
            vscode.window.showErrorMessage(
                vscode.l10n.t("error.jumpToMapperFailed", { error: error instanceof Error ? error.message : "Unknown error" })
            );
        }
    }
}