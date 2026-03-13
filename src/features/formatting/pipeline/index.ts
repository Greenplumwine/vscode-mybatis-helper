/**
 * 格式化流水线 - MyBatis XML 专用
 * 
 * 1. 使用 xml-formatter 格式化 XML 结构
 * 2. 在相邻的 SQL 操作标签之间添加空行
 * 
 * @module features/formatting/pipeline
 */

import formatXmlLib from 'xml-formatter';
import { FormattedResult, FormattingOptions } from '../types';
import { Logger } from '../../../utils/logger';

export class FormattingPipeline {
  private logger = Logger.getInstance();

  // 需要在之间添加空行的标签
  private static readonly TAGS_NEEDING_BLANK_LINE = [
    'select', 'insert', 'update', 'delete', 'sql', 'resultMap', 'parameterMap', 'cache', 'cache-ref'
  ];

  async execute(content: string, options: FormattingOptions): Promise<FormattedResult> {
    const startTime = Date.now();
    
    this.logger.debug('Starting MyBatis XML formatting...');
    
    try {
      // 1. 使用 xml-formatter 格式化 XML
      let formatted = formatXmlLib(content, {
        indentation: ' '.repeat(options.tabSize),
        collapseContent: false,
        lineSeparator: '\n',
        whiteSpaceAtEndOfSelfclosingTag: false
      });
      
      // 2. 在相邻的 SQL 标签之间添加空行
      formatted = this.addBlankLinesBetweenTags(formatted);
      
      return {
        content: formatted,
        sqlRegionCount: 0,
        duration: Date.now() - startTime
      };
      
    } catch (error) {
      this.logger.error('XML formatting failed:', error);
      return {
        content,
        sqlRegionCount: 0,
        duration: Date.now() - startTime
      };
    }
  }

  /**
   * 在相邻的 SQL 标签之间添加空行
   * 
   * 规则：
   * 1. </select> 和 <select> 之间添加空行
   * 2. </select> 和 <insert> 之间添加空行
   * 3. 以此类推，适用于所有 SQL 操作标签和定义标签
   * 
   * @param content - 格式化后的 XML
   * @returns 添加空行后的 XML
   */
  private addBlankLinesBetweenTags(content: string): string {
    const tags = FormattingPipeline.TAGS_NEEDING_BLANK_LINE.join('|');
    
    // 匹配结束标签后紧跟开始标签的情况（中间可能有空白）
    // 例如：...</select>\n  <select... 或 ...</select>\n<select...
    const pattern = new RegExp(
      `</(${tags})\\s*>(\\s*)\\n(\\s*)<(${tags})\\b`,
      'gi'
    );
    
    return content.replace(pattern, (match, endTag, endSpace, middleSpace, startTag) => {
      // 如果中间已经有空行了，不再添加
      if (middleSpace.includes('\n\n')) {
        return match;
      }
      
      // 获取当前缩进
      const currentIndent = middleSpace.replace('\n', '');
      
      // 在结束标签和开始标签之间添加空行
      return `</${endTag}>\n${currentIndent}\n${currentIndent}<${startTag}`;
    });
  }
}
