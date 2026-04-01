/**
 * XML 格式化器
 *
 * 职责：使用 xml-formatter 库格式化 XML 结构
 *
 * @module features/formatting/pipeline/xmlFormatter
 */

import formatXmlLib from "xml-formatter";
import { PipelineStep, PipelineContext } from "../types";
import { Logger } from "../../../utils/logger";

/**
 * XML 格式化器
 */
export class XmlFormatter implements PipelineStep {
  readonly name = "XmlFormatter";

  /** 日志记录器 */
  private logger = Logger.getInstance();

  /**
   * 执行格式化
   *
   * @param content - 包含 SQL 占位符的内容
   * @param context - 流水线上下文
   * @returns 格式化后的内容
   */
  execute(content: string, context: PipelineContext): string {
    this.logger.debug("Formatting XML structure...");

    try {
      const indent = " ".repeat(context.options.tabSize);

      // 注意：现在占位符是注释格式 /*MYBATIS_SQL_N*/，xml-formatter 会保留它们
      return formatXmlLib(content, {
        indentation: indent,
        collapseContent: false, // 不折叠内容
        lineSeparator: "\n",
        whiteSpaceAtEndOfSelfclosingTag: false,
      });
    } catch (error) {
      this.logger.error("XML formatting failed:", error);
      // 格式化失败返回原内容，不破坏用户数据
      return content;
    }
  }
}
