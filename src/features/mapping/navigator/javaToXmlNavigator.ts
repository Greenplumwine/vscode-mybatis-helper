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
  private async doNavigateToXml(
    javaFilePath: string,
    methodName?: string,
  ): Promise<void> {
    const xmlPath =
      await this.fileMapper.resolveXmlPathForJavaPublic(javaFilePath);
    logger.debug(
      "[JavaToXmlNavigator.doNavigateToXml] XML path resolved:",
      xmlPath,
    );

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