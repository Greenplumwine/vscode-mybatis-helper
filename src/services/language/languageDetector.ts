/**
 * 语言检测服务
 * 提供文件类型检测功能，支持 Java、XML、SQL 等语言
 *
 * 设计模式：Strategy - 支持多种检测策略
 *
 * @author MyBatis Helper Team
 * @version 1.0.0
 */

import * as vscode from "vscode";
import * as path from "path";
import {
  LanguageType,
  LanguageDetectionResult,
  ILanguageDetectionStrategy,
} from "../types";
import { logger } from "../../utils/logger";

/**
 * 文件扩展名检测策略
 */
export class ExtensionDetectionStrategy implements ILanguageDetectionStrategy {
  detect(
    document: vscode.TextDocument,
    position?: vscode.Position,
  ): LanguageDetectionResult | null {
    const fileName = document.fileName.toLowerCase();

    if (fileName.endsWith(".java")) {
      return {
        language: "java" as LanguageType,
        confidence: 0.95,
      };
    }

    if (fileName.endsWith(".xml")) {
      // 进一步检测是否是 MyBatis XML
      const isMyBatis = this.isMyBatisMapper(document);
      return {
        language: "xml" as LanguageType,
        confidence: isMyBatis ? 0.95 : 0.9,
        metadata: { isMyBatisMapper: isMyBatis },
      };
    }

    if (fileName.endsWith(".sql")) {
      return {
        language: "sql" as LanguageType,
        confidence: 0.95,
      };
    }

    return null;
  }

  private isMyBatisMapper(document: vscode.TextDocument): boolean {
    // 只读取前 20 行进行检测，避免大文件性能问题
    const maxLines = Math.min(20, document.lineCount);
    let headerContent = "";
    for (let i = 0; i < maxLines; i++) {
      headerContent += document.lineAt(i).text + "\n";
    }

    // 检测是否包含 MyBatis Mapper 特征
    return (
      /<!DOCTYPE\s+mapper\s+PUBLIC\s+["']-\/\/mybatis\.org\/\/DTD Mapper/.test(
        headerContent,
      ) || /<mapper\s+namespace\s*=\s*["']/.test(headerContent)
    );
  }
}

/**
 * 内容特征检测策略
 */
export class ContentDetectionStrategy implements ILanguageDetectionStrategy {
  detect(
    document: vscode.TextDocument,
    position?: vscode.Position,
  ): LanguageDetectionResult | null {
    // 如果已经有明确的 languageId，直接返回
    switch (document.languageId) {
      case "java":
        return {
          language: "java" as LanguageType,
          confidence: 0.98,
        };
      case "xml":
        return {
          language: "xml" as LanguageType,
          confidence: 0.98,
        };
      case "sql":
        return {
          language: "sql" as LanguageType,
          confidence: 0.98,
        };
    }

    // 基于内容检测
    const content = document.getText();
    const firstLine = content.split("\n")[0] || "";

    // Java 文件特征
    if (/^\s*(package|import|public|class|interface|@)/m.test(content)) {
      return {
        language: "java" as LanguageType,
        confidence: 0.85,
      };
    }

    // XML 文件特征
    if (
      /^\s*<[\?\!]\s*xml/i.test(content) ||
      /^\s*<!DOCTYPE\s+/i.test(content) ||
      /^\s*<[a-zA-Z][^>]*>/.test(content)
    ) {
      return {
        language: "xml" as LanguageType,
        confidence: 0.85,
      };
    }

    // SQL 文件特征
    if (
      /^\s*(SELECT|INSERT|UPDATE|DELETE|CREATE|DROP|ALTER)\s+/i.test(content)
    ) {
      return {
        language: "sql" as LanguageType,
        confidence: 0.85,
      };
    }

    return null;
  }
}

/**
 * MyBatis Mapper 专项检测策略
 */
export class MyBatisMapperDetectionStrategy implements ILanguageDetectionStrategy {
  private readonly MYBATIS_SIGNATURE =
    /<mapper\s+namespace\s*=\s*["'][^"']+["']/;
  private readonly MYBATIS_DTD =
    /<!DOCTYPE\s+mapper\s+PUBLIC\s+["']-\/\/mybatis\.org/;

  detect(
    document: vscode.TextDocument,
    position?: vscode.Position,
  ): LanguageDetectionResult | null {
    try {
      // 只对 XML 文件进行检测
      if (
        !document.fileName.toLowerCase().endsWith(".xml") &&
        document.languageId !== "xml"
      ) {
        return null;
      }

      // 检查文档是否有内容
      if (document.lineCount === 0) {
        logger.debug(
          `[MyBatisMapperDetectionStrategy] Document has no lines: ${path.basename(document.fileName)}`,
        );
        return null;
      }

      // 只读取前 20 行进行检测，避免大文件性能问题
      const maxLines = Math.min(20, document.lineCount);
      let headerContent = "";
      for (let i = 0; i < maxLines; i++) {
        try {
          headerContent += document.lineAt(i).text + "\n";
        } catch (lineError) {
          logger.debug(
            `[MyBatisMapperDetectionStrategy] Error reading line ${i}: ${lineError}`,
          );
          break;
        }
      }

      // 检测 MyBatis Mapper 特征
      const hasNamespace = this.MYBATIS_SIGNATURE.test(headerContent);
      const hasMyBatisDtd = this.MYBATIS_DTD.test(headerContent);

      logger.debug(
        `[MyBatisMapperDetectionStrategy] ${path.basename(document.fileName)}: hasNamespace=${hasNamespace}, hasMyBatisDtd=${hasMyBatisDtd}`,
      );

      if (hasNamespace || hasMyBatisDtd) {
        return {
          language: "xml" as LanguageType,
          confidence: 0.99,
          metadata: {
            isMyBatisMapper: true,
            hasNamespace,
            hasMyBatisDtd,
          },
        };
      }

      return null;
    } catch (error) {
      logger.error(
        `[MyBatisMapperDetectionStrategy] Error detecting ${document.fileName}:`,
        error,
      );
      return null;
    }
  }
}

/**
 * 语言检测器
 * 使用 Strategy 模式组合多种检测策略
 */
export class LanguageDetector {
  private static instance: LanguageDetector;
  private strategies: ILanguageDetectionStrategy[] = [];
  private extensionStrategy: ExtensionDetectionStrategy;
  private contentStrategy: ContentDetectionStrategy;
  private myBatisStrategy: MyBatisMapperDetectionStrategy;

  private constructor() {
    this.extensionStrategy = new ExtensionDetectionStrategy();
    this.contentStrategy = new ContentDetectionStrategy();
    this.myBatisStrategy = new MyBatisMapperDetectionStrategy();

    // 注册默认策略（按优先级排序）
    this.registerStrategy(this.myBatisStrategy);
    this.registerStrategy(this.extensionStrategy);
    this.registerStrategy(this.contentStrategy);

    logger.debug("LanguageDetector initialized with default strategies");
  }

  /**
   * 获取单例实例
   */
  public static getInstance(): LanguageDetector {
    if (!LanguageDetector.instance) {
      LanguageDetector.instance = new LanguageDetector();
    }
    return LanguageDetector.instance;
  }

  /**
   * 注册检测策略
   * @param strategy 检测策略
   */
  public registerStrategy(strategy: ILanguageDetectionStrategy): void {
    this.strategies.push(strategy);
  }

  /**
   * 检测文档语言类型
   * @param document 文档
   * @param position 位置（可选）
   * @returns 检测结果，无法检测时返回 UNKNOWN
   */
  public detect(
    document: vscode.TextDocument,
    position?: vscode.Position,
  ): LanguageDetectionResult {
    // 尝试所有策略，返回置信度最高的结果
    let bestResult: LanguageDetectionResult | null = null;

    for (const strategy of this.strategies) {
      try {
        const result = strategy.detect(document, position);
        if (result) {
          if (!bestResult || result.confidence > bestResult.confidence) {
            bestResult = result;
          }

          // 置信度足够高时直接返回
          if (result.confidence >= 0.95) {
            return result;
          }
        }
      } catch (error) {
        logger.warn(`Language detection strategy failed:`, error);
      }
    }

    return (
      bestResult || {
        language: "unknown" as LanguageType,
        confidence: 0,
      }
    );
  }

  /**
   * 快速检测语言类型
   * @param document 文档
   * @returns 语言类型
   */
  public detectLanguage(document: vscode.TextDocument): LanguageType {
    return this.detect(document).language;
  }

  /**
   * 检测是否为 Java 文件
   */
  public isJava(document: vscode.TextDocument): boolean {
    return this.detectLanguage(document) === "java";
  }

  /**
   * 检测是否为 XML 文件
   */
  public isXml(document: vscode.TextDocument): boolean {
    return this.detectLanguage(document) === "xml";
  }

  /**
   * 检测是否为 SQL 文件
   */
  public isSql(document: vscode.TextDocument): boolean {
    return this.detectLanguage(document) === "sql";
  }

  /**
   * 检测是否为 MyBatis Mapper XML
   */
  public isMyBatisMapper(document: vscode.TextDocument): boolean {
    try {
      // 确保文档已加载且有内容
      if (document.lineCount === 0) {
        logger.debug(
          `[isMyBatisMapper] Document has no lines: ${document.fileName}`,
        );
        return false;
      }

      const result = this.myBatisStrategy.detect(document);
      const isMyBatis = result?.metadata?.isMyBatisMapper === true;

      logger.debug(
        `[isMyBatisMapper] ${path.basename(document.fileName)}: ${isMyBatis}`,
      );
      return isMyBatis;
    } catch (error) {
      logger.error(
        `[isMyBatisMapper] Error detecting ${document.fileName}:`,
        error,
      );
      return false;
    }
  }

  /**
   * 根据文件路径检测语言
   * @param filePath 文件路径
   * @returns 检测结果
   */
  public detectByPath(filePath: string): LanguageDetectionResult {
    const lowerPath = filePath.toLowerCase();

    if (lowerPath.endsWith(".java")) {
      return { language: "java" as LanguageType, confidence: 0.9 };
    }
    if (lowerPath.endsWith(".xml")) {
      return { language: "xml" as LanguageType, confidence: 0.9 };
    }
    if (lowerPath.endsWith(".sql")) {
      return { language: "sql" as LanguageType, confidence: 0.9 };
    }

    return { language: "unknown" as LanguageType, confidence: 0 };
  }

  /**
   * 重置并清空所有策略
   */
  public clearStrategies(): void {
    this.strategies = [];
    logger.debug("LanguageDetector strategies cleared");
  }
}

/**
 * 全局语言检测器实例
 */
export const languageDetector = LanguageDetector.getInstance();
