import * as vscode from 'vscode';
import { FileMapper } from '../filemapper';
import { JavaExtensionAPI } from '../../utils/javaExtensionAPI';
import { PerformanceUtils } from '../../utils/performanceUtils';

/**
 * Java到XML导航器
 * 处理从Java Mapper文件跳转到对应XML文件的逻辑
 */
export class JavaToXmlNavigator {
    private fileMapper: FileMapper;
    private performanceUtils: PerformanceUtils;

    constructor(fileMapper: FileMapper) {
        this.fileMapper = fileMapper;
        this.performanceUtils = PerformanceUtils.getInstance();
    }

    /**
     * 导航到XML文件
     * @param javaFilePath Java文件路径
     * @param methodName 可选的方法名
     */
    public async navigateToXml(javaFilePath: string, methodName?: string): Promise<void> {
        const startTime = Date.now();
        try {
            console.log("[JavaToXmlNavigator.navigateToXml] Called with:", { javaFilePath, methodName });

            // 尝试从缓存获取对应的XML文件
            let xmlPath = this.fileMapper.getMappings().get(javaFilePath);
            console.log("[JavaToXmlNavigator.navigateToXml] XML path from cache:", xmlPath);

            // 如果缓存中没有，则尝试查找
            if (!xmlPath) {
                // 使用新的智能查找方式
                const quickPath = await this.fileMapper['findXmlByQuickPath'](javaFilePath);
                if (quickPath) {
                    xmlPath = quickPath;
                    // 更新缓存
                    this.fileMapper.getMappings().set(javaFilePath, xmlPath);
                    this.fileMapper.getReverseMappings().set(xmlPath, javaFilePath);
                    console.log("[JavaToXmlNavigator.navigateToXml] XML path from quick path:", xmlPath);
                } else {
                    // 如果快速路径没找到，搜索所有XML文件
                    const xmlFiles = await vscode.workspace.findFiles('**/*.xml');
                    // 过滤掉Git相关文件
                    const filteredXmlFiles = xmlFiles.filter(xmlFile => 
                        !xmlFile.fsPath.includes('/.git/') && 
                        !xmlFile.fsPath.includes('\\.git\\') &&
                        !xmlFile.fsPath.endsWith('.git')
                    );
                    xmlPath = await this.fileMapper['findXmlForMapper'](javaFilePath, filteredXmlFiles);
                    if (xmlPath) {
                        // 更新缓存
                        this.fileMapper.getMappings().set(javaFilePath, xmlPath);
                        this.fileMapper.getReverseMappings().set(xmlPath, javaFilePath);
                        console.log("[JavaToXmlNavigator.navigateToXml] XML path from full search:", xmlPath);
                    } else {
                        // 找不到对应的XML文件
                        console.log("[JavaToXmlNavigator.navigateToXml] No XML file found for Java file");
                        vscode.window.showErrorMessage(vscode.l10n.t("fileMapper.noXmlFile"));
                        return;
                    }
                }
            }

            // 如果提供了方法名，查找方法在XML中的位置
            if (methodName) {
                console.log("[JavaToXmlNavigator.navigateToXml] Looking for method position:", methodName);
                const position = await this.fileMapper['findMethodPosition'](xmlPath, methodName);
                if (position) {
                    console.log("[JavaToXmlNavigator.navigateToXml] Method position found:", position);
                    await this.fileMapper.jumpToFilePublic(xmlPath, position);
                    return;
                } else {
                    console.log("[JavaToXmlNavigator.navigateToXml] Method position not found");
                }
            }

            // 直接跳转到文件开头
            console.log("[JavaToXmlNavigator.navigateToXml] Jumping to file beginning");
            await this.fileMapper.jumpToFilePublic(xmlPath);
        } catch (error) {
            console.error('[JavaToXmlNavigator.navigateToXml] Error navigating to XML:', error);
            vscode.window.showErrorMessage(
                vscode.l10n.t("error.jumpToXmlFailed", { error: error instanceof Error ? error.message : "Unknown error" })
            );
        } finally {
            this.performanceUtils.recordExecutionTime('JavaToXmlNavigator.navigateToXml', Date.now() - startTime);
        }
    }
}