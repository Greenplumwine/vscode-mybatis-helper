/**
 * 缩进调整器
 *
 * 职责：调整 SQL 内容的缩进以匹配 XML 结构
 *
 * @module features/formatting/pipeline/indentAdjuster
 */

import { PipelineStep, PipelineContext } from "../types";
import { Logger } from "../../../utils/logger";

/**
 * 缩进调整器
 *
 * 根据占位符在 XML 中的位置调整 SQL 缩进
 */
export class IndentAdjuster implements PipelineStep {
  readonly name = "IndentAdjuster";
  private logger = Logger.getInstance();

  execute(content: string, context: PipelineContext): string {
    this.logger.debug("Adjusting SQL indentation...");

    const { tabSize } = context.options;

    for (const region of context.sqlRegions) {
      // 计算 SQL 应有的基础缩进
      const baseIndent = this.calculateBaseIndent(
        content,
        region.placeholder,
        tabSize,
      );

      // 调整 SQL 缩进
      region.sqlContent = this.adjustIndent(
        region.sqlContent,
        baseIndent,
        tabSize,
      );
    }

    return content;
  }

  private calculateBaseIndent(
    content: string,
    placeholder: string,
    tabSize: number,
  ): number {
    const index = content.indexOf(placeholder);
    if (index === -1) {
      return 1;
    }

    // 找到占位符所在行
    const beforePlaceholder = content.substring(0, index);
    const lastNewline = beforePlaceholder.lastIndexOf("\n");
    const currentLine =
      lastNewline >= 0
        ? beforePlaceholder.substring(lastNewline + 1)
        : beforePlaceholder;

    // 返回当前缩进层级
    const currentIndent = currentLine.match(/^(\s*)/)?.[1].length ?? 0;
    return Math.floor(currentIndent / tabSize);
  }

  private adjustIndent(
    sql: string,
    baseIndentLevel: number,
    tabSize: number,
  ): string {
    const baseIndent = " ".repeat(baseIndentLevel * tabSize);
    const innerIndent = " ".repeat((baseIndentLevel + 1) * tabSize);

    const lines = sql.split("\n");
    let result: string[] = [];
    let inTagBlock = false;
    let tagBlockDepth = 0;

    for (const line of lines) {
      const trimmed = line.trim();
      if (!trimmed) {
        result.push("");
        continue;
      }

      // 检测是否是标签占位符行
      const isTagPlaceholder = /^__TAG_\d+_\d+__$/.test(trimmed);
      const hasTagPlaceholder = trimmed.includes("__TAG_");

      if (isTagPlaceholder) {
        // 纯标签占位符行使用基础缩进
        result.push(baseIndent + trimmed);
      } else if (hasTagPlaceholder) {
        // 混合行（SQL + 标签）
        result.push(baseIndent + trimmed);
      } else {
        // 纯 SQL 行也使用基础缩进
        result.push(baseIndent + trimmed);
      }
    }

    return result.join("\n");
  }
}
