/**
 * SQL 格式化器
 *
 * 职责：使用 sql-formatter 库格式化完整的 SQL 语句
 *
 * @module features/formatting/pipeline/sqlFormatter
 */

import { format as formatSqlLib } from "sql-formatter";
import { PipelineStep, PipelineContext } from "../types";
import { Logger } from "../../../utils/logger";

/**
 * SQL 格式化器
 *
 * 格式化包含标签占位符的完整 SQL 语句
 */
export class SqlFormatter implements PipelineStep {
  readonly name = "SqlFormatter";

  private logger = Logger.getInstance();

  execute(content: string, context: PipelineContext): string {
    this.logger.debug(`Formatting ${context.sqlRegions.length} SQL regions...`);

    for (const region of context.sqlRegions) {
      try {
        // 格式化包含标签占位符的 SQL
        const formatted = this.formatWithPlaceholders(
          region.sqlContent,
          context.options,
        );
        region.sqlContent = formatted;
      } catch (error) {
        this.logger.error(`SQL formatting failed for ${region.tagId}:`, error);
        // 格式化失败保留原 SQL
      }
    }

    return content;
  }

  private formatWithPlaceholders(
    sql: string,
    options: PipelineContext["options"],
  ): string {
    // 保护标签占位符（__TAG_X_Y__）
    const placeholderPattern = /__TAG_\d+_\d+__/g;
    const placeholders: string[] = [];

    // 收集所有占位符
    let match: RegExpExecArray | null;
    while ((match = placeholderPattern.exec(sql)) !== null) {
      placeholders.push(match[0]);
    }

    // 用临时标记替换占位符
    let tempSql = sql;
    const tempMarkers: string[] = [];
    placeholders.forEach((ph, i) => {
      const marker = `/*PH${i}*/`;
      tempMarkers.push(marker);
      tempSql = tempSql.split(ph).join(marker);
    });

    // 映射方言到 sql-formatter 支持的格式
    const dialectMap: Record<string, string> = {
      mysql: "mysql",
      postgresql: "postgresql",
      oracle: "oracle",
      sqlite: "sqlite",
      tsql: "transactsql",
      db2: "db2",
    };
    const sqlDialect = dialectMap[options.sqlDialect] || "mysql";

    // 格式化 SQL
    const formatted = formatSqlLib(tempSql, {
      language: sqlDialect as any,
      keywordCase: options.keywordCase,
      tabWidth: options.tabSize,
      linesBetweenQueries: 1,
    });

    // 恢复占位符
    let result = formatted;
    tempMarkers.forEach((marker, i) => {
      result = result.split(marker).join(placeholders[i]);
    });

    return result;
  }
}
