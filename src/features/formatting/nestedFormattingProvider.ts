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
import { FormattingPipeline } from './pipeline';
import { FormattingOptions } from './types';
import { Logger } from '../../utils/logger';

/**
 * 嵌套格式化 Provider
 * 
 * 实现 DocumentFormattingEditProvider 接口，为 MyBatis XML 文件提供格式化功能
 */
export class NestedFormattingProvider implements vscode.DocumentFormattingEditProvider {
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
   * 提供范围格式化（可选实现）
   * 
   * 当前简化实现：格式化整个文档后截取范围
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
    // 简化实现：先格式化整个文档
    // 实际项目中可能需要更精细的实现
    const fullEdits = await this.provideDocumentFormattingEdits(
      document,
      options,
      token
    );
    
    // TODO: 实现范围格式化逻辑
    // 当前返回全文档格式化结果
    return fullEdits;
  }
}
