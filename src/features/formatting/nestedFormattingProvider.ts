/**
 * 嵌套格式化 Provider
 *
 * 设计模式：
 * - 外观模式 (Facade Pattern): 封装复杂的格式化流水线
 * - 适配器模式 (Adapter Pattern): 适配 VS Code 的 DocumentFormattingEditProvider 接口
 *
 * 职责：实现 VS Code 的格式化接口，提供 MyBatis XML 嵌套格式化
 *
 * @module features/formatting/nestedFormattingProvider
 */

import * as vscode from 'vscode';
import { format as formatSqlLib } from 'sql-formatter';
import { FormattingPipeline } from './pipeline';
import { FormattingOptions } from './types';
import { Logger } from '../../utils/logger';

/**
 * SQL 区域信息（用于范围格式化）
 */
interface SqlRegionInfo {
  /** 标签类型 */
  tagType: string;
  /** 范围 */
  range: vscode.Range;
  /** SQL 内容 */
  sqlContent: string;
  /** 基础缩进 */
  baseIndent: string;
  /** 是否包含动态标签 */
  hasDynamicTags: boolean;
}

/**
 * 嵌套格式化 Provider
 *
 * 实现 DocumentFormattingEditProvider 和 DocumentRangeFormattingEditProvider 接口，
 * 为 MyBatis XML 文件提供格式化功能
 */
export class NestedFormattingProvider implements
  vscode.DocumentFormattingEditProvider,
  vscode.DocumentRangeFormattingEditProvider {
  /** 格式化流水线 */
  private pipeline: FormattingPipeline;

  /** 日志记录器 */
  private logger = Logger.getInstance();

  /**
   * 构造函数
   */
  constructor() {
    this.pipeline = new FormattingPipeline();
  }

  /**
   * VS Code 格式化接口实现
   *
   * @param document - 当前文档
   * @param options - VS Code 格式化选项
   * @param token - 取消令牌
   * @returns 文本编辑列表
   */
  async provideDocumentFormattingEdits(
    document: vscode.TextDocument,
    options: vscode.FormattingOptions,
    token: vscode.CancellationToken
  ): Promise<vscode.TextEdit[]> {
    // 检查是否取消
    if (token.isCancellationRequested) {
      return [];
    }

    // 检查是否是支持的文件类型
    if (!this.isSupportedDocument(document)) {
      return [];
    }

    const content = document.getText();
    const formattingOptions = this.buildOptions(options);

    try {
      // 检查是否取消
      if (token.isCancellationRequested) {
        return [];
      }

      const result = await this.pipeline.execute(content, formattingOptions);

      // 检查是否取消
      if (token.isCancellationRequested) {
        return [];
      }

      this.logger.info(
        `Formatted ${document.fileName}: ` +
        `${result.sqlRegionCount} SQL regions in ${result.duration}ms`
      );

      // 如果内容没有变化，返回空数组
      if (result.content === content) {
        return [];
      }

      // 构建全范围编辑
      const fullRange = new vscode.Range(
        document.positionAt(0),
        document.positionAt(content.length)
      );

      return [new vscode.TextEdit(fullRange, result.content)];
    } catch (error) {
      this.logger.error('Formatting failed:', error);
      return [];
    }
  }

  /**
   * 提供范围格式化（真正实现）
   *
   * 仅格式化选定范围内的 SQL 内容，不影响范围外的内容
   *
   * @param document - 当前文档
   * @param range - 格式化范围
   * @param options - 格式化选项
   * @param token - 取消令牌
   * @returns 文本编辑列表
   */
  async provideDocumentRangeFormattingEdits(
    document: vscode.TextDocument,
    range: vscode.Range,
    options: vscode.FormattingOptions,
    token: vscode.CancellationToken
  ): Promise<vscode.TextEdit[]> {
    // 检查是否取消
    if (token.isCancellationRequested) {
      return [];
    }

    // 检查是否是支持的文件类型
    if (!this.isSupportedDocument(document)) {
      return [];
    }

    const formattingOptions = this.buildOptions(options);
    const edits: vscode.TextEdit[] = [];

    try {
      // 提取范围内的 SQL 区域
      const sqlRegions = this.extractSqlRegionsInRange(document, range);

      if (sqlRegions.length === 0) {
        this.logger.debug('No SQL regions found in selected range');
        return [];
      }

      // 格式化每个 SQL 区域
      for (const region of sqlRegions) {
        if (token.isCancellationRequested) {
          break;
        }

        // 检查是否应该格式化此区域
        if (!this.shouldFormatRegion(region)) {
          continue;
        }

        const formatted = this.formatSqlContent(region.sqlContent, formattingOptions);

        // 如果格式化后的内容不同，创建编辑
        if (formatted !== region.sqlContent) {
          // 调整缩进以匹配 XML 上下文
          const adjustedFormatted = this.adjustIndentForXml(
            formatted,
            region.baseIndent
          );

          edits.push(new vscode.TextEdit(region.range, adjustedFormatted));
        }
      }

      this.logger.info(
        `Range formatted ${document.fileName}: ${edits.length} regions modified`
      );

      return edits;
    } catch (error) {
      this.logger.error('Range formatting failed:', error);
      return [];
    }
  }

  /**
   * 检查是否是支持的文档
   *
   * @param document - 文本文档
   * @returns 是否支持
   */
  private isSupportedDocument(document: vscode.TextDocument): boolean {
    // 支持的文件类型
    const supportedLanguages = [
      'mybatis-xml',
      'xml'
    ];

    if (supportedLanguages.includes(document.languageId)) {
      return true;
    }

    // 检查文件扩展名
    if (document.fileName.toLowerCase().endsWith('.xml')) {
      return true;
    }

    return false;
  }

  /**
   * 构建内部格式化选项
   *
   * 从 VS Code 选项和配置中构建内部选项
   *
   * @param vscodeOptions - VS Code 格式化选项
   * @returns 内部格式化选项
   */
  private buildOptions(vscodeOptions: vscode.FormattingOptions): FormattingOptions {
    const config = vscode.workspace.getConfiguration('mybatis-helper.formatting');

    return {
      tabSize: vscodeOptions.tabSize,
      insertSpaces: vscodeOptions.insertSpaces,
      sqlDialect: config.get<string>('sql.dialect', 'mysql'),
      keywordCase: config.get<'upper' | 'lower' | 'preserve'>('sql.keywordCase', 'upper'),
      maxLineLength: config.get<number>('sql.maxLineLength', 120)
    };
  }

  /**
   * 提取范围内的 SQL 区域
   */
  private extractSqlRegionsInRange(
    document: vscode.TextDocument,
    range: vscode.Range
  ): SqlRegionInfo[] {
    const regions: SqlRegionInfo[] = [];
    const content = document.getText();
    const rangeStartOffset = document.offsetAt(range.start);
    const rangeEndOffset = document.offsetAt(range.end);

    // 匹配 <select|insert|update|delete> 标签内的内容
    const pattern = /<(select|insert|update|delete)\b[^>]*>([\s\S]*?)<\/\1\s*>/gi;
    let match: RegExpExecArray | null;

    while ((match = pattern.exec(content)) !== null) {
      const fullMatch = match[0];
      const tagType = match[1].toLowerCase();

      // 找到标签结束位置
      const tagEndPos = content.indexOf('>', match.index) + 1;
      const contentEnd = match.index + fullMatch.length - (`</${tagType}>`).length;

      // 检查是否与选择范围有交集
      const regionStart = tagEndPos;
      const regionEnd = contentEnd;

      // 如果 SQL 区域与选择范围有重叠
      if (regionStart < rangeEndOffset && regionEnd > rangeStartOffset) {
        // 计算实际要格式化的范围（交集）
        const effectiveStart = Math.max(regionStart, rangeStartOffset);
        const effectiveEnd = Math.min(regionEnd, rangeEndOffset);

        // 获取 SQL 内容
        let sqlContent = content.substring(regionStart, regionEnd);

        // 如果范围是部分选择，尝试智能扩展到完整语句
        if (regionStart < rangeStartOffset || regionEnd > rangeEndOffset) {
          // 检查选择是否完全在 SQL 区域内
          if (rangeStartOffset >= regionStart && rangeEndOffset <= regionEnd) {
            // 获取选择范围内的内容
            sqlContent = content.substring(effectiveStart, effectiveEnd);
          }
        }

        // 计算基础缩进
        const baseIndent = this.calculateBaseIndent(content, regionStart);

        regions.push({
          tagType,
          range: new vscode.Range(
            document.positionAt(regionStart),
            document.positionAt(regionEnd)
          ),
          sqlContent: sqlContent.trim(),
          baseIndent,
          hasDynamicTags: /<(if|where|foreach|choose|trim|set)\b/i.test(sqlContent)
        });
      }
    }

    return regions;
  }

  /**
   * 计算 SQL 内容的基础缩进
   */
  private calculateBaseIndent(content: string, position: number): string {
    const beforePos = content.substring(0, position);
    const lastNewline = beforePos.lastIndexOf('\n');
    const currentLine = lastNewline >= 0
      ? beforePos.substring(lastNewline + 1)
      : beforePos;

    // 返回当前行的缩进空格
    const match = currentLine.match(/^(\s*)/);
    return match ? match[1] : '';
  }

  /**
   * 检查是否应该格式化此区域
   */
  private shouldFormatRegion(region: SqlRegionInfo): boolean {
    // 不格式化过短的 SQL（可能是片段）
    if (region.sqlContent.length < 5) {
      return false;
    }

    // 不格式化只包含空白的内容
    if (!region.sqlContent.trim()) {
      return false;
    }

    return true;
  }

  /**
   * 格式化 SQL 内容
   */
  private formatSqlContent(sql: string, options: FormattingOptions): string {
    try {
      // 映射方言到 sql-formatter 支持的格式
      const dialectMap: Record<string, string> = {
        'mysql': 'mysql',
        'postgresql': 'postgresql',
        'oracle': 'oracle',
        'sqlite': 'sqlite',
        'tsql': 'transactsql',
        'db2': 'db2'
      };
      const sqlDialect = dialectMap[options.sqlDialect] || 'mysql';

      // 保护 MyBatis 标签占位符
      const placeholderPattern = /<(if|where|foreach|choose|trim|set|bind)\b[^>]*>[\s\S]*?<\/\1>/gi;
      const placeholders: string[] = [];

      let tempSql = sql;
      let match: RegExpExecArray | null;
      while ((match = placeholderPattern.exec(sql)) !== null) {
        const placeholder = `/*MYBATIS_TAG_${placeholders.length}*/`;
        placeholders.push(match[0]);
        tempSql = tempSql.replace(match[0], placeholder);
      }

      // 格式化 SQL
      const formatted = formatSqlLib(tempSql, {
        language: sqlDialect as any,
        keywordCase: options.keywordCase,
        tabWidth: options.tabSize,
        linesBetweenQueries: 1
      });

      // 恢复占位符
      let result = formatted;
      placeholders.forEach((ph, i) => {
        result = result.replace(`/*MYBATIS_TAG_${i}*/`, ph);
      });

      return result;
    } catch (error) {
      this.logger.warn('SQL formatting failed for region:', error);
      return sql;
    }
  }

  /**
   * 调整 SQL 缩进以匹配 XML 上下文
   */
  private adjustIndentForXml(sql: string, baseIndent: string): string {
    const lines = sql.split('\n');

    return lines.map((line, index) => {
      if (!line.trim()) {
        return '';
      }

      if (index === 0) {
        // 第一行：换行 + 基础缩进 + 内容
        return '\n' + baseIndent + line.trim();
      }

      // 其他行：基础缩进 + 内容
      return baseIndent + line.trim();
    }).join('\n') + '\n' + baseIndent;
  }
}
