import * as vscode from 'vscode';
import { FileMapper } from '../filemapper';
import { logger } from '../../../utils/logger';

/**
 * Java到XML导航器
 * 处理从Java Mapper文件跳转到对应XML文件的逻辑
 */
export class JavaToXmlNavigator {
    private fileMapper: FileMapper;

    /**
     * 创建JavaToXmlNavigator实例
     * @param fileMapper FileMapper实例，用于映射Java文件到XML文件
     */
    constructor(fileMapper: FileMapper) {
        this.fileMapper = fileMapper;
    }

    /**
 * Navigate from Java Mapper file to corresponding XML file
 * @param javaFilePath Path to the Java file
 * @param methodName Optional method name to navigate to in the XML file
 */
    public async navigateToXml(javaFilePath: string, methodName?: string): Promise<void> {
        try {
            logger.debug("[JavaToXmlNavigator.navigateToXml] Called with:", { javaFilePath, methodName });

            // 设置超时时间（5秒）
            const timeoutMs = 5000;
            const timeoutPromise = new Promise<void>((_, reject) => {
                setTimeout(() => reject(new Error(`XML navigation timed out after ${timeoutMs}ms`)), timeoutMs);
            });

            // 执行导航逻辑，带有超时控制
            await Promise.race([this.doNavigateToXml(javaFilePath, methodName), timeoutPromise]);
        } catch (error) {
            const errorMsg = error instanceof Error ? error.message : "Unknown error";
            logger.error('[JavaToXmlNavigator.navigateToXml] Error navigating to XML:', error as Error);
            vscode.window.showErrorMessage(
                vscode.l10n.t("error.jumpToXmlFailed", { error: errorMsg })
            );
        }
    }

    /**
     * 实际执行导航逻辑的方法
     */
    private async doNavigateToXml(javaFilePath: string, methodName?: string): Promise<void> {
        // Try to get corresponding XML file from cache
        let xmlPath = this.fileMapper.getMappings().get(javaFilePath);
        logger.debug("[JavaToXmlNavigator.doNavigateToXml] XML path from cache:", xmlPath);

        // If not found in cache, try to locate it with timeout protection
        if (!xmlPath) {
            // Step 1: Use new intelligent lookup method (quick path)
            const quickPath = await this.fileMapper['findXmlByQuickPath'](javaFilePath);
            if (quickPath) {
                xmlPath = quickPath;
                // Update cache
                this.fileMapper.getMappings().set(javaFilePath, xmlPath);
                this.fileMapper.getReverseMappings().set(xmlPath, javaFilePath);
                logger.debug("[JavaToXmlNavigator.doNavigateToXml] XML path from quick path:", xmlPath);
            } else {
                // Step 2: If quick path fails, search XML files with limit
                logger.debug("[JavaToXmlNavigator.doNavigateToXml] Quick path failed, searching XML files with limit");
                
                // 限制搜索结果数量，避免处理过多文件
                const maxXmlFiles = 500;
                const xmlFiles = await vscode.workspace.findFiles('**/*.xml', '**/{node_modules,.git,target,build,out}/**', maxXmlFiles);
                
                if (xmlFiles.length >= maxXmlFiles) {
                    logger.warn(`[JavaToXmlNavigator.doNavigateToXml] Reached maximum XML files to search (${maxXmlFiles}), some files may be skipped`);
                }
                
                // Filter out Git-related files
                const filteredXmlFiles = xmlFiles.filter(xmlFile => 
                    !xmlFile.fsPath.includes('/.git/') && 
                    !xmlFile.fsPath.includes('\\.git\\') &&
                    !xmlFile.fsPath.endsWith('.git')
                );
                
                // 限制并发处理数量
                const batchSize = 100;
                let found = false;
                
                for (let i = 0; i < filteredXmlFiles.length; i += batchSize) {
                    const batch = filteredXmlFiles.slice(i, i + batchSize);
                    logger.debug(`[JavaToXmlNavigator.doNavigateToXml] Processing batch ${i/batchSize + 1} of ${Math.ceil(filteredXmlFiles.length/batchSize)}`);
                    
                    // 尝试在当前批次中查找
                    xmlPath = await this.fileMapper['findXmlForMapper'](javaFilePath, batch);
                    if (xmlPath) {
                        found = true;
                        break;
                    }
                }
                
                if (!found) {
                    // No corresponding XML file found
                    logger.debug("[JavaToXmlNavigator.doNavigateToXml] No XML file found for Java file after searching all batches");
                    vscode.window.showErrorMessage(vscode.l10n.t("fileMapper.noXmlFile"));
                    return;
                }
                
                // Update cache
                if (xmlPath) {
                    this.fileMapper.getMappings().set(javaFilePath, xmlPath);
                    this.fileMapper.getReverseMappings().set(xmlPath, javaFilePath);
                    logger.debug("[JavaToXmlNavigator.doNavigateToXml] XML path from batch search:", xmlPath);
                }
            }
        }

        // If xmlPath is still undefined, show error and return
        if (!xmlPath) {
            logger.debug("[JavaToXmlNavigator.doNavigateToXml] No XML file found after all attempts");
            vscode.window.showErrorMessage(vscode.l10n.t("fileMapper.noXmlFile"));
            return;
        }

        // If method name is provided, find the method position in XML
        if (methodName) {
            logger.debug("[JavaToXmlNavigator.doNavigateToXml] Looking for method position:", methodName);
            const position = await this.fileMapper['findMethodPosition'](xmlPath, methodName);
            if (position) {
                logger.debug("[JavaToXmlNavigator.doNavigateToXml] Method position found:", position);
                await this.fileMapper.jumpToFilePublic(xmlPath, position);
                return;
            } else {
                logger.debug("[JavaToXmlNavigator.doNavigateToXml] Method position not found, jumping to file beginning");
            }
        }

        // Jump to the beginning of the file
        logger.debug("[JavaToXmlNavigator.doNavigateToXml] Jumping to file beginning");
        await this.fileMapper.jumpToFilePublic(xmlPath);
    }
}