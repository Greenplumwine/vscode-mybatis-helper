/**
 * SQL 提取器
 *
 * 策略：简化策略 - 只提取，不做复杂转换
 * 1. 提取 <select|insert|update|delete> 内的内容
 * 2. 用占位符替换整个内容块
 * 3. XML 格式化后，根据占位符位置调整内容缩进
 * 4. 恢复内容
 *
 * @module features/formatting/pipeline/sqlExtractor
 */

import { SqlRegion, PipelineStep, PipelineContext } from "../types";
import { Logger } from "../../../utils/logger";

export class SqlExtractor implements PipelineStep {
  readonly name = "SqlExtractor";
  private logger = Logger.getInstance();

  execute(content: string, context: PipelineContext): string {
    this.logger.debug("Extracting SQL content...");

    const regions = this.extractRegions(content);
    context.sqlRegions = regions;

    this.logger.debug(`Extracted ${regions.length} regions`);

    // 用占位符替换
    let result = content;
    for (let i = regions.length - 1; i >= 0; i--) {
      const region = regions[i];
      result =
        result.substring(0, region.startOffset) +
        `<!--MYBATIS_SQL_${i}-->` +
        result.substring(region.endOffset);
    }

    return result;
  }

  private extractRegions(content: string): SqlRegion[] {
    const regions: SqlRegion[] = [];

    const pattern =
      /<(select|insert|update|delete)\b[^>]*>([\s\S]*?)<\/\1\s*>/gi;
    let match: RegExpExecArray | null;

    while ((match = pattern.exec(content)) !== null) {
      const fullMatch = match[0];
      const contentStart = match.index + match[1].length + 2; // 跳过 "<tag>"
      // 找到 > 的位置
      const tagEndPos = content.indexOf(">", match.index) + 1;
      const contentEnd =
        match.index + fullMatch.length - `</${match[1]}>`.length;

      const sqlContent = content.substring(tagEndPos, contentEnd);

      if (sqlContent.trim()) {
        regions.push({
          tagType: match[1].toLowerCase(),
          tagId: match[2] || "",
          startOffset: tagEndPos,
          endOffset: contentEnd,
          sqlContent: sqlContent,
          placeholder: "",
          xmlIndentLevel: 0,
          hasDynamicTags: /<(if|where|foreach|choose|trim|set)\b/i.test(
            sqlContent,
          ),
        });
      }
    }

    return regions;
  }

  restore(content: string, regions: SqlRegion[]): string {
    this.logger.debug(`Restoring ${regions.length} regions...`);

    let result = content;

    for (let i = regions.length - 1; i >= 0; i--) {
      const region = regions[i];
      const placeholder = `<!--MYBATIS_SQL_${i}-->`;

      if (result.includes(placeholder)) {
        // 根据占位符位置计算缩进
        const placeholderIndex = result.indexOf(placeholder);
        const indent = this.calculateIndent(result, placeholderIndex);

        // 调整 SQL 内容的缩进
        const adjustedContent = this.adjustContentIndent(
          region.sqlContent,
          indent,
        );

        result = result.split(placeholder).join(adjustedContent);
      }
    }

    return result;
  }

  private calculateIndent(content: string, position: number): string {
    // 找到该行的缩进
    const beforePos = content.substring(0, position);
    const lastNewline = beforePos.lastIndexOf("\n");
    const currentLine =
      lastNewline >= 0 ? beforePos.substring(lastNewline + 1) : beforePos;

    // 返回当前行的缩进空格
    const match = currentLine.match(/^(\s*)/);
    return match ? match[1] : "";
  }

  private adjustContentIndent(content: string, baseIndent: string): string {
    const lines = content.split("\n");

    return (
      lines
        .map((line, index) => {
          if (!line.trim()) {
            return "";
          }

          if (index === 0) {
            // 第一行不换行
            return "\n" + baseIndent + line.trim();
          }

          // 其他行添加基础缩进
          return baseIndent + line.trim();
        })
        .join("\n") +
      "\n" +
      baseIndent
    );
  }
}
