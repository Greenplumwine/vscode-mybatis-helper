import * as vscode from 'vscode';
import { FileMapper } from '../filemapper';
import { JavaExtensionAPI } from '../../utils/javaExtensionAPI';
import { PerformanceUtils } from '../../utils/performanceUtils';

/**
 * XML到Java导航器
 * 处理从XML文件跳转到对应Java Mapper文件的逻辑
 */
export class XmlToJavaNavigator {
    private fileMapper: FileMapper;
    private performanceUtils: PerformanceUtils;

    constructor(fileMapper: FileMapper) {
        this.fileMapper = fileMapper;
        this.performanceUtils = PerformanceUtils.getInstance();
    }

    /**
     * 导航到Java文件
     * @param xmlFilePath XML文件路径
     * @param methodName 可选的方法名
     */
    public async navigateToJava(xmlFilePath: string, methodName?: string): Promise<void> {
        const startTime = Date.now();
        try {
            console.log("[XmlToJavaNavigator.navigateToJava] Called with:", { xmlFilePath, methodName });
            
            // 解析XML文件的命名空间
            const namespace = await this.fileMapper.parseXmlNamespacePublic(xmlFilePath);
            if (!namespace) {
                console.log("[XmlToJavaNavigator.navigateToJava] No namespace found in XML file");
                vscode.window.showErrorMessage(vscode.l10n.t("fileMapper.noNamespace"));
                return;
            }
            
            console.log("[XmlToJavaNavigator.navigateToJava] Namespace found:", namespace);
            
            // 从命名空间中提取类名
            const className = namespace.substring(namespace.lastIndexOf(".") + 1);
            console.log("[XmlToJavaNavigator.navigateToJava] Class name extracted:", className);
            
            // 查找对应的Java文件
            const javaFilePath = await this.fileMapper.findJavaFileByClassNamePublic(className);
            if (!javaFilePath) {
                console.log("[XmlToJavaNavigator.navigateToJava] Java file not found for namespace:", namespace);
                vscode.window.showErrorMessage(vscode.l10n.t("fileMapper.noMapperInterface"));
                return;
            }
            
            console.log("[XmlToJavaNavigator.navigateToJava] Java file found:", javaFilePath);
            
            // 优先尝试使用Java扩展API导航到方法
            if (methodName) {
                console.log("[XmlToJavaNavigator.navigateToJava] Attempting navigation via Java Extension API");
                try {
                    const javaExtApi = JavaExtensionAPI.getInstance();
                    if (javaExtApi.isReady) {
                        // 尝试使用Java扩展API导航到方法
                        const success = await javaExtApi.navigateToMethod(javaFilePath, methodName);
                        if (success) {
                            console.log("[XmlToJavaNavigator.navigateToJava] Java Extension API navigation succeeded");
                            return;
                        } else {
                            console.log("[XmlToJavaNavigator.navigateToJava] Java Extension API navigation failed");
                        }
                    }
                } catch (error) {
                    console.warn("[XmlToJavaNavigator.navigateToJava] Java Extension API navigation failed:", error);
                }
                
                // Java扩展API不可用或调用失败，使用正则表达式方法
                console.log("[XmlToJavaNavigator.navigateToJava] Using regex method to find Java method position for:", methodName);
                const position = await this.fileMapper.findJavaMethodPositionPublic(javaFilePath, methodName);
                console.log("[XmlToJavaNavigator.navigateToJava] Method position found:", position);
                
                if (position) {
                    await this.fileMapper.jumpToFilePublic(javaFilePath, position);
                    return;
                }
            }
            
            // 直接跳转到Java文件开头
            console.log("[XmlToJavaNavigator.navigateToJava] Jumping to file beginning");
            await this.fileMapper.jumpToFilePublic(javaFilePath);
        } catch (error) {
            console.error('[XmlToJavaNavigator.navigateToJava] Error navigating to Java:', error);
            vscode.window.showErrorMessage(
                vscode.l10n.t("error.jumpToMapperFailed", { error: error instanceof Error ? error.message : "Unknown error" })
            );
        } finally {
            this.performanceUtils.recordExecutionTime('XmlToJavaNavigator.navigateToJava', Date.now() - startTime);
        }
    }
}