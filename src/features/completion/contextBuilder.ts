/**
 * 补全上下文构建器
 * 
 * 设计模式：
 * - 建造者模式 (Builder Pattern): 分步骤构建复杂的 CompletionContext
 * - 单例模式 (Singleton Pattern): 建议作为单例使用
 * 
 * 职责：收集和准备补全所需的所有上下文信息
 * 
 * @module features/completion/contextBuilder
 */

import * as vscode from 'vscode';
import {
  CompletionContext,
  JavaMethod,
  XmlMapperInfo,
  ForeachContext,
  JavaMethodParser,
  MyBatisXmlParser
} from './types';
import { FastMappingEngine } from '../mapping/fastMappingEngine';
import { Logger } from '../../utils/logger';

/**
 * 补全上下文构建器
 * 
 * 负责从 VS Code 的文档和位置信息中提取 MyBatis 相关的上下文，包括：
 * - XML Mapper 信息（命名空间、方法列表）
 * - 当前方法信息（如果在某个方法内）
 * - Foreach 上下文（如果在 foreach 标签内）
 * - 对应的 Java 方法信息
 */
export class CompletionContextBuilder {
  /** 日志记录器 */
  private logger = Logger.getInstance();
  
  /**
   * 构造函数
   * 
   * @param javaParser - Java 方法解析器
   * @param xmlParser - XML 解析器
   */
  constructor(
    private javaParser: JavaMethodParser,
    private xmlParser: MyBatisXmlParser
  ) {}

  /**
   * 构建补全上下文
   * 
   * 这是主要入口方法，协调各个子构建步骤
   * 
   * @param document - VS Code 文本文档
   * @param position - 光标位置
   * @param triggerCharacter - 触发字符（如果有）
   * @returns 完整的补全上下文
   */
  async build(
    document: vscode.TextDocument,
    position: vscode.Position,
    triggerCharacter: string | undefined
  ): Promise<CompletionContext> {
    // 1. 构建基础上下文（从 VS Code 直接获取的信息）
    const baseContext = this.buildBaseContext(
      document, 
      position, 
      triggerCharacter
    );
    
    // 2. 如果是 MyBatis Mapper XML，解析额外信息
    if (this.isMyBatisMapperXml(document)) {
      return await this.enrichMyBatisContext(baseContext);
    }
    
    // 3. 普通 XML 文件，只返回基础上下文
    return baseContext;
  }

  /**
   * 构建基础上下文
   * 
   * 包含从 VS Code 直接获取的基本信息
   * 
   * @param document - 文本文档
   * @param position - 光标位置
   * @param triggerCharacter - 触发字符
   * @returns 基础上下文
   */
  private buildBaseContext(
    document: vscode.TextDocument,
    position: vscode.Position,
    triggerCharacter: string | undefined
  ): CompletionContext {
    const lineText = document.lineAt(position.line).text;
    const linePrefix = lineText.substring(0, position.character);
    const lineSuffix = lineText.substring(position.character);
    
    return {
      document,
      position,
      triggerCharacter,
      linePrefix,
      lineSuffix
    };
  }

  /**
   * 检查是否为 MyBatis Mapper XML 文件
   * 
   * @param document - 文本文档
   * @returns 是否为 MyBatis Mapper XML
   */
  private isMyBatisMapperXml(document: vscode.TextDocument): boolean {
    // 检查语言 ID
    if (document.languageId === 'mybatis-xml') {
      return true;
    }
    
    // 检查文件内容特征
    if (document.languageId === 'xml') {
      const content = document.getText();
      // 检查是否包含 DOCTYPE mapper
      if (/<!DOCTYPE\s+mapper\s+PUBLIC/i.test(content)) {
        return true;
      }
      // 检查是否包含 <mapper namespace
      if (/<mapper\s+namespace=/i.test(content)) {
        return true;
      }
    }
    
    return false;
  }

  /**
   * 丰富 MyBatis 上下文
   * 
   * 解析 XML 并获取对应的 Java 方法信息
   * 
   * @param baseContext - 基础上下文
   * @returns 丰富的上下文
   */
  private async enrichMyBatisContext(
    baseContext: CompletionContext
  ): Promise<CompletionContext> {
    const { document, position } = baseContext;
    
    try {
      // 1. 解析 XML
      const xmlInfo = await this.parseXmlMapperWithFallback(document);
      
      // 2. 找到当前方法
      const currentMethod = this.findCurrentMethod(xmlInfo, position.line);
      
      // 3. 检测 foreach 上下文
      const foreachContext = this.xmlParser.findForeachContext?.(
        document.getText(), 
        position.line
      ) ?? undefined;
      
      // 4. 获取对应的 Java 方法信息
      let javaMethod: JavaMethod | undefined;
      if (currentMethod) {
        javaMethod = await this.findJavaMethod(document.fileName, currentMethod.id);
      }
      
      return {
        ...baseContext,
        xmlInfo,
        javaMethod,
        foreachContext
      };
    } catch (error) {
      // 记录详细的错误信息，帮助调试
      this.logger.warn(
        `Failed to enrich MyBatis context for ${document.fileName}:${position.line + 1}:`,
        error instanceof Error ? error.message : String(error)
      );
      // 出错时返回基础上下文，确保补全功能仍然可用
      return baseContext;
    }
  }

  /**
   * 解析 XML Mapper（带降级）
   * 
   * @param document - 文本文档
   * @returns XML Mapper 信息
   */
  private async parseXmlMapperWithFallback(document: vscode.TextDocument): Promise<XmlMapperInfo> {
    const content = document.getText();
    const filePath = document.fileName;
    
    // 尝试使用 xmlParser 的 parseXmlMapper 方法
    if (this.xmlParser.parseXmlMapper) {
      return await this.xmlParser.parseXmlMapper(filePath, content);
    }
    
    // 降级：简单解析 namespace 和方法列表
    return this.parseXmlSimple(content, filePath);
  }
  
  /**
   * 简单 XML 解析（降级方案）
   */
  private parseXmlSimple(content: string, filePath: string): XmlMapperInfo {
    // 提取 namespace
    const namespaceMatch = content.match(/<mapper\s+namespace=["']([^"']+)["']/i);
    const namespace = namespaceMatch ? namespaceMatch[1] : '';
    
    // 提取方法
    const methods: XmlMapperInfo['methods'] = [];
    const methodPattern = /<(select|insert|update|delete)\s+[^>]*id=["']([^"']+)["'][^>]*>/gi;
    let match;
    
    while ((match = methodPattern.exec(content)) !== null) {
      const tagType = match[1];
      const id = match[2];
      
      // 计算开始行号
      const beforeMatch = content.substring(0, match.index);
      const startLine = beforeMatch.split('\n').length - 1;
      
      // 找到对应的结束标签位置
      const endTag = `</${tagType}>`;
      const searchStart = match.index + match[0].length;
      const endTagPos = content.indexOf(endTag, searchStart);
      
      let endLine: number;
      if (endTagPos !== -1) {
        // 计算结束行号
        const beforeEndTag = content.substring(0, endTagPos + endTag.length);
        endLine = beforeEndTag.split('\n').length - 1;
      } else {
        // 找不到结束标签，使用下一个标签或文件末尾
        const nextTagMatch = content.match(/<\/(select|insert|update|delete)>/i);
        if (nextTagMatch && nextTagMatch.index && nextTagMatch.index > match.index) {
          const beforeNextTag = content.substring(0, nextTagMatch.index + nextTagMatch[0].length);
          endLine = beforeNextTag.split('\n').length - 1;
        } else {
          endLine = content.split('\n').length - 1;
        }
      }
      
      methods.push({
        id,
        tagType,
        lineRange: { start: startLine, end: endLine }
      });
    }
    
    return { namespace, methods, filePath };
  }

  /**
   * 找到当前光标所在的方法
   * 
   * 使用二分查找优化（假设方法按行号排序）
   * 
   * @param xmlInfo - XML Mapper 信息
   * @param line - 当前行号
   * @returns 当前方法信息，如果不在任何方法内返回 undefined
   */
  private findCurrentMethod(
    xmlInfo: XmlMapperInfo, 
    line: number
  ): XmlMapperInfo['methods'][number] | undefined {
    const methods = xmlInfo.methods;
    
    if (methods.length === 0) {
      return undefined;
    }
    
    // 二分查找（假设方法按起始行排序）
    let left = 0;
    let right = methods.length - 1;
    
    while (left <= right) {
      const mid = Math.floor((left + right) / 2);
      const method = methods[mid];
      
      if (line >= method.lineRange.start && line <= method.lineRange.end) {
        return method;
      }
      
      if (line < method.lineRange.start) {
        right = mid - 1;
      } else {
        left = mid + 1;
      }
    }
    
    return undefined;
  }

  /**
   * 查找 Foreach 上下文
   * 
   * 检测光标是否在 <foreach> 标签内
   * 
   * @param content - 文档内容
   * @param line - 当前行号
   * @returns Foreach 上下文，如果不在 foreach 内返回 undefined
   */
  private findForeachContext(
    content: string, 
    line: number
  ): ForeachContext | undefined {
    // 使用 xmlParser 的实现（如果存在）
    return this.xmlParser.findForeachContext?.(content, line) ?? undefined;
  }

  /**
   * 查找对应的 Java 方法
   * 
   * @param xmlPath - XML 文件路径
   * @param methodName - 方法名
   * @returns Java 方法信息，未找到返回 undefined
   */
  private async findJavaMethod(
    xmlPath: string, 
    methodName: string
  ): Promise<JavaMethod | undefined> {
    // 1. 通过 FastMappingEngine 找到对应的 Java 文件
    const mappingEngine = FastMappingEngine.getInstance();
    const mapping = mappingEngine.getByXmlPath(xmlPath);
    
    if (!mapping) {
      this.logger.debug(`No mapping found for XML: ${xmlPath}`);
      return undefined;
    }
    
    const javaPath = mapping.javaPath;
    this.logger.debug(`Found Java file for XML ${xmlPath}: ${javaPath}`);
    
    try {
      // 2. 解析 Java 文件获取方法（如果方法存在）
      this.logger.debug(`Parsing Java method: ${methodName} in ${javaPath}`);
      const result = await this.javaParser.parseMethod?.(javaPath, methodName);
      this.logger.debug(`Parse result: ${result ? `found ${result.name}` : 'null/undefined'}`);
      return result ?? undefined;
    } catch (error) {
      this.logger.debug(`Failed to parse Java method ${methodName} in ${javaPath}:`, error);
      return undefined;
    }
  }
}
