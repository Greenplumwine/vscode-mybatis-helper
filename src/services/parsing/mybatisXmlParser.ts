/**
 * MyBatis XML 解析服务增强版
 * 支持 DTD 验证和标签层次结构分析
 *
 * @author MyBatis Helper Team
 * @version 1.0.0
 */

import * as vscode from "vscode";
import * as fs from "fs/promises";
import { XMLParser } from "fast-xml-parser";
import { logger } from "../../utils/logger";
import { TextProcessor, createTextProcessor } from "../../utils/textProcessor";
import {
  MyBatisTagType,
  MyBatisAttribute,
  MyBatisXmlInfo,
  SqlStatementInfo,
  ResultMapInfo,
  SqlFragmentInfo,
  TagHierarchy,
  TagHierarchyMap,
} from "../types";
import { ForeachContext } from "../../features/completion/types";
import { tagHierarchyResolver } from "./dtdResolver";

/**
 * XML 解析选项接口
 */
interface XmlParseOptions {
  /** 是否保留注释 */
  preserveComments: boolean;
  /** 是否保留空白字符 */
  preserveWhitespace: boolean;
  /** 是否解析属性 */
  parseAttributes: boolean;
}

/**
 * XML 元素节点接口
 */
interface XmlElementNode {
  /** 元素名称 */
  name: string;
  /** 元素属性 */
  attributes: Record<string, string>;
  /** 子元素 */
  children: XmlElementNode[];
  /** 文本内容 */
  text?: string;
  /** 开始标签位置 */
  startPosition?: vscode.Position;
  /** 结束标签位置 */
  endPosition?: vscode.Position;
}

/**
 * MyBatis XML 解析器类
 */
export class MyBatisXmlParser {
  /** 单例实例 */
  private static instance: MyBatisXmlParser;

  /** 标签层次结构缓存 */
  private tagHierarchyCache: TagHierarchyMap | null = null;

  /** 初始化状态 */
  private initializing: boolean = false;

  /** 初始化等待队列 */
  private initWaiters: Array<{ resolve: (success: boolean) => void }> = [];

  /** XML 文档解析缓存 */
  private xmlDocumentCache: Map<string, MyBatisXmlInfo>;

  /** fast-xml-parser 实例 */
  private readonly xmlParser: XMLParser;

  /**
   * 私有构造函数
   */
  private constructor() {
    this.xmlDocumentCache = new Map();

    // 初始化 XML 解析器
    // 配置安全选项，禁用外部实体解析以防止 XXE 攻击
    this.xmlParser = new XMLParser({
      ignoreAttributes: false,
      attributeNamePrefix: "",
      parseAttributeValue: false,
      trimValues: true,
      preserveOrder: true,
      parseTagValue: false,
      // 安全选项：禁用外部实体和 DTD 处理
      processEntities: false,
      htmlEntities: false,
      ignoreDeclaration: false,
      allowBooleanAttributes: true,
    });

    logger.debug("MyBatisXmlParser initialized");
  }

  /**
   * 获取单例实例
   * @returns MyBatisXmlParser 实例
   */
  public static getInstance(): MyBatisXmlParser {
    if (!MyBatisXmlParser.instance) {
      MyBatisXmlParser.instance = new MyBatisXmlParser();
    }
    return MyBatisXmlParser.instance;
  }

  /**
   * 初始化标签层次结构
   * 从 DTD 加载或缓存获取
   * 使用锁机制防止并发初始化
   * 初始化失败时使用空映射作为回退，保证服务可用性
   */
  async initializeTagHierarchy(): Promise<boolean> {
    // 如果已初始化，直接返回成功
    if (this.tagHierarchyCache) {
      return this.tagHierarchyCache.size > 0;
    }

    // 如果正在初始化，等待初始化完成
    if (this.initializing) {
      return new Promise((resolve) => {
        this.initWaiters.push({ resolve });
      });
    }

    // 获取锁
    this.initializing = true;

    try {
      this.tagHierarchyCache = await tagHierarchyResolver.resolveTagHierarchy();
      logger.info("Tag hierarchy initialized:", {
        tagCount: this.tagHierarchyCache.size,
      });

      // 成功初始化后，通知所有等待者
      this.notifyWaiters(true);
      return true;
    } catch (error) {
      logger.error("Failed to initialize tag hierarchy:", error);
      // 使用空映射作为回退，保证服务可用性
      this.tagHierarchyCache = new Map();

      // 通知等待者初始化完成（使用空映射）
      this.notifyWaiters(false);
      return false;
    } finally {
      // 释放锁
      this.initializing = false;
    }
  }

  /**
   * 通知所有等待者
   * @param success 初始化是否成功
   */
  private notifyWaiters(success: boolean): void {
    const waiters = this.initWaiters;
    this.initWaiters = [];

    for (const waiter of waiters) {
      try {
        // 通知等待者初始化结果
        // 无论成功与否，都 resolve，让调用者继续执行
        waiter.resolve(success);
      } catch (e) {
        // 忽略通知过程中的错误
        logger.debug("Error notifying waiter:", e);
      }
    }
  }

  /**
   * 检查标签层次结构是否已成功初始化
   */
  public isHierarchyInitialized(): boolean {
    return this.tagHierarchyCache !== null && this.tagHierarchyCache.size > 0;
  }

  /**
   * 解析 MyBatis XML 文件
   * @param filePath 文件路径
   * @returns MyBatis XML 信息
   */
  /** 最大文件大小 5MB */
  private static readonly MAX_FILE_SIZE = 5 * 1024 * 1024;

  async parseXmlFile(filePath: string): Promise<MyBatisXmlInfo | null> {
    // 检查缓存
    const cached = this.xmlDocumentCache.get(filePath);
    if (cached) {
      logger.debug("Returning cached XML info:", { filePath });
      return cached;
    }

    try {
      // 检查文件大小
      const stats = await fs.stat(filePath);
      if (stats.size > MyBatisXmlParser.MAX_FILE_SIZE) {
        logger.warn("XML file too large, skipping:", {
          filePath,
          size: stats.size,
          maxSize: MyBatisXmlParser.MAX_FILE_SIZE,
        });
        return null;
      }

      const content = await fs.readFile(filePath, "utf-8");
      const info = this.parseXmlContent(content, filePath);

      // 缓存解析结果
      if (info) {
        this.xmlDocumentCache.set(filePath, info);
      }

      return info;
    } catch (error) {
      logger.error("Error parsing XML file:", { filePath, error });
      return null;
    }
  }

  /**
   * 解析 XML 内容
   * @param content XML 内容
   * @param filePath 文件路径（用于错误报告）
   * @returns MyBatis XML 信息
   */
  private parseXmlContent(
    content: string,
    filePath: string,
  ): MyBatisXmlInfo | null {
    try {
      // 提取命名空间
      const namespace = this.extractNamespace(content);
      if (!namespace) {
        logger.warn("No namespace found in XML:", { filePath });
        return null;
      }

      // 解析 SQL 语句
      const statements = this.parseSqlStatements(content);

      // 解析 ResultMap
      const resultMaps = this.parseResultMaps(content);

      // 解析 SQL 片段
      const sqlFragments = this.parseSqlFragments(content);

      return {
        filePath,
        namespace,
        statements,
        resultMaps,
        sqlFragments,
      };
    } catch (error) {
      logger.error("Error parsing XML content:", { filePath, error });
      return null;
    }
  }

  /**
   * 提取命名空间
   * @param content XML 内容
   */
  private extractNamespace(content: string): string | null {
    const match = content.match(
      /<mapper[^>]*namespace\s*=\s*["']([^"']+)["']/i,
    );
    return match ? match[1] : null;
  }

  /**
   * 解析 SQL 语句
   * @param content XML 内容
   */
  private parseSqlStatements(content: string): SqlStatementInfo[] {
    const statements: SqlStatementInfo[] = [];
    const statementTypes = ["select", "insert", "update", "delete"];

    for (const type of statementTypes) {
      // 使用 matchAll 避免正则 lastIndex 问题
      const regex = new RegExp(`<${type}[^>]*id\s*=\s*["']([^"']+)["']`, "gi");

      for (const match of content.matchAll(regex)) {
        const id = match[1];
        const index = match.index ?? 0;
        const position = this.calculatePosition(content, index);

        statements.push({
          id,
          type: type as MyBatisTagType,
          content: "", // 完整内容解析需要更复杂的逻辑
          position,
        });
      }
    }

    return statements;
  }

  /**
   * 解析 ResultMap
   * @param content XML 内容
   */
  private parseResultMaps(content: string): ResultMapInfo[] {
    const resultMaps: ResultMapInfo[] = [];
    const regex =
      /<resultMap[^>]*id\s*=\s*["']([^"']+)["'][^>]*type\s*=\s*["']([^"']+)["']/gi;

    for (const match of content.matchAll(regex)) {
      resultMaps.push({
        id: match[1],
        type: match[2],
        mappings: [],
      });
    }

    return resultMaps;
  }

  /**
   * 解析 SQL 片段
   * @param content XML 内容
   */
  private parseSqlFragments(content: string): SqlFragmentInfo[] {
    const fragments: SqlFragmentInfo[] = [];
    const regex = /<sql[^>]*id\s*=\s*["']([^"']+)["']/gi;

    for (const match of content.matchAll(regex)) {
      const index = match.index ?? 0;
      const position = this.calculatePosition(content, index);

      fragments.push({
        id: match[1],
        content: "",
        position,
      });
    }

    return fragments;
  }

  /**
   * 计算字符索引对应的 Position
   * 使用 TextProcessor 进行高性能计算
   */
  private calculatePosition(content: string, index: number): vscode.Position {
    const processor = createTextProcessor(content);
    processor.precomputeLineOffsets();
    return processor.indexToPosition(index);
  }

  /**
   * 清除缓存
   */
  public clearCache(): void {
    this.xmlDocumentCache.clear();
    logger.debug("XML document cache cleared");
  }

  /**
   * 获取标签层次结构
   */
  public getTagHierarchy(): TagHierarchyMap | null {
    return this.tagHierarchyCache;
  }

  /**
   * 验证标签嵌套是否合法
   * @param parentTag 父标签
   * @param childTag 子标签
   */
  public isValidNesting(parentTag: string, childTag: string): boolean {
    if (!this.tagHierarchyCache) {
      return true; // 未初始化时默认允许
    }

    const parentInfo = this.tagHierarchyCache.get(parentTag);
    if (!parentInfo) {
      return false;
    }

    return parentInfo.allowedChildren.includes(childTag);
  }

  /**
   * 查找 Foreach 上下文
   *
   * 根据光标位置查找对应的 foreach 标签上下文
   *
   * @param content - XML 文档内容
   * @param line - 当前行号（0-based）
   * @returns ForeachContext 或 null
   */
  public findForeachContext(
    content: string,
    line: number,
  ): ForeachContext | null {
    // 查找所有 foreach 标签
    const foreachRegex = /<foreach\s+([^>]*)>/gi;
    const matches: Array<{
      startPos: number;
      endPos: number;
      startLine: number;
      endLine: number;
      attributes: Record<string, string>;
    }> = [];

    let match;
    while ((match = foreachRegex.exec(content)) !== null) {
      const startPos = match.index;
      const endPos = startPos + match[0].length;
      const startLine = content.substring(0, startPos).split("\n").length - 1;

      // 查找对应的结束标签
      const openTag = "<foreach";
      const closeTag = "</foreach>";
      let depth = 1;
      let searchPos = endPos;
      let endTagPos = -1;

      while (searchPos < content.length) {
        const nextOpen = content.indexOf(openTag, searchPos);
        const nextClose = content.indexOf(closeTag, searchPos);

        if (nextClose === -1) {
          break; // 找不到结束标签
        }

        if (nextOpen !== -1 && nextOpen < nextClose) {
          // 找到嵌套的 foreach
          depth++;
          searchPos = nextOpen + openTag.length;
        } else {
          // 找到结束标签
          depth--;
          if (depth === 0) {
            endTagPos = nextClose + closeTag.length;
            break;
          }
          searchPos = nextClose + closeTag.length;
        }
      }

      const endLine =
        endTagPos !== -1
          ? content.substring(0, endTagPos).split("\n").length - 1
          : content.split("\n").length - 1;

      // 解析属性
      const attrText = match[1];
      const attributes: Record<string, string> = {};
      const attrRegex = /(\w+)=["']([^"']*)["']/g;
      let attrMatch;
      while ((attrMatch = attrRegex.exec(attrText)) !== null) {
        attributes[attrMatch[1]] = attrMatch[2];
      }

      matches.push({
        startPos,
        endPos,
        startLine,
        endLine,
        attributes,
      });
    }

    // 找到包含当前行的 foreach
    const containingForeach = matches.find(
      (f) => line >= f.startLine && line <= f.endLine,
    );

    if (!containingForeach) {
      return null;
    }

    const attrs = containingForeach.attributes;

    return {
      collection: attrs.collection || "",
      item: attrs.item || "item",
      index: attrs.index,
      itemType: attrs.ofType || attrs.itemType, // 支持 ofType 或 itemType 属性
      startLine: containingForeach.startLine,
      endLine: containingForeach.endLine,
      tagStartPosition: containingForeach.startPos,
      tagEndPosition: containingForeach.endPos,
    };
  }
}

// 导出单例实例
export const myBatisXmlParser = MyBatisXmlParser.getInstance();
