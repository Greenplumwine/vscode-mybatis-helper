/**
 * 统一智能补全 Provider
 * 
 * 设计模式：
 * - 策略模式 (Strategy Pattern): 协调多个 CompletionStrategy
 * - 责任链模式 (Chain of Responsibility): 按优先级选择策略
 * - 外观模式 (Facade Pattern): 对外提供统一的补全接口
 * 
 * 职责：
 * - 管理多个补全策略
 * - 根据上下文选择合适的策略
 * - 处理补全过程中的异常
 * 
 * @module features/completion/unifiedCompletionProvider
 */

import * as vscode from 'vscode';
import { 
  CompletionStrategy, 
  CompletionContext,
  JavaMethodParser,
  MyBatisXmlParser
} from './types';
import { CompletionContextBuilder } from './contextBuilder';
import { Logger } from '../../utils/logger';

// 策略导入
import {
  PlaceholderStrategy,
  ForeachVariableStrategy,
  ForeachCollectionStrategy,
  ForeachItemPropertyStrategy,
  PropertyStrategy,
  TypeStrategy,
  TypeHandlerStrategy
} from './strategies';

/**
 * 统一智能补全 Provider
 * 
 * 实现 VS Code 的 CompletionItemProvider 接口，协调多个补全策略
 * 
 * @example
 * ```typescript
 * const provider = new UnifiedCompletionProvider(
 *   javaParser,
 *   xmlParser,
 *   fileMapper
 * );
 * 
 * vscode.languages.registerCompletionItemProvider(
 *   { language: 'mybatis-mapper-xml' },
 *   provider,
 *   ...provider.triggerCharacters
 * );
 * ```
 */
export class UnifiedCompletionProvider implements vscode.CompletionItemProvider {
  /** 补全策略列表（按优先级排序） */
  private strategies: CompletionStrategy[] = [];
  
  /** 上下文构建器 */
  private contextBuilder: CompletionContextBuilder;
  
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
  ) {
    // 初始化上下文构建器
    this.contextBuilder = new CompletionContextBuilder(
      javaParser,
      xmlParser
    );
    
    // 注册默认策略
    this.registerDefaultStrategies();
  }

  /**
   * 获取所有触发字符
   * 
   * 收集所有策略的触发字符并去重
   * 
   * @returns 触发字符数组
   */
  get triggerCharacters(): string[] {
    const chars = new Set<string>();
    
    for (const strategy of this.strategies) {
      for (const char of strategy.triggerCharacters) {
        chars.add(char);
      }
    }
    
    return Array.from(chars);
  }

  /**
   * 注册策略
   * 
   * 添加一个新策略，并按优先级自动排序
   * 
   * @param strategy - 要注册的策略
   */
  registerStrategy(strategy: CompletionStrategy): void {
    this.strategies.push(strategy);
    
    // 按优先级降序排序（高优先级在前）
    this.strategies.sort((a, b) => b.priority - a.priority);
    
    this.logger.debug(`Registered completion strategy: ${strategy.name} (priority: ${strategy.priority})`);
  }

  /**
   * 批量注册策略
   * 
   * @param strategies - 策略列表
   */
  registerStrategies(strategies: CompletionStrategy[]): void {
    for (const strategy of strategies) {
      this.registerStrategy(strategy);
    }
  }

  /**
   * 注销策略
   * 
   * @param name - 策略名称
   * @returns 是否成功注销
   */
  unregisterStrategy(name: string): boolean {
    const index = this.strategies.findIndex(s => s.name === name);
    if (index >= 0) {
      this.strategies.splice(index, 1);
      this.logger.debug(`Unregistered completion strategy: ${name}`);
      return true;
    }
    return false;
  }

  /**
   * VS Code 补全接口实现
   * 
   * 这是 VS Code 调用的入口方法
   * 
   * @param document - 当前文档
   * @param position - 光标位置
   * @param token - 取消令牌
   * @param context - 补全上下文
   * @returns 补全项列表
   */
  async provideCompletionItems(
    document: vscode.TextDocument,
    position: vscode.Position,
    token: vscode.CancellationToken,
    context: vscode.CompletionContext
  ): Promise<vscode.CompletionItem[]> {
    // 入口日志
    this.logger.debug(`[UnifiedCompletion] triggered by: ${context.triggerCharacter}, language: ${document.languageId}`);

    // 1. 构建补全上下文
    const completionContext = await this.contextBuilder.build(
      document,
      position,
      context.triggerCharacter
    );
    
    // 2. 检查是否取消
    if (token.isCancellationRequested) {
      return [];
    }
    
    // 3. 选择合适的策略
    const strategy = await this.selectStrategy(completionContext);
    
    if (!strategy) {
      this.logger.debug('No matching completion strategy found');
      return [];
    }
    
    // 4. 执行策略
    try {
      const items = await this.executeStrategy(strategy, completionContext);
      
      // 5. 检查是否取消
      if (token.isCancellationRequested) {
        return [];
      }
      
      // 6. 添加来源标记（调试用）
      this.tagItemsWithSource(items, strategy.name);
      
      this.logger.debug(
        `Strategy ${strategy.name} provided ${items.length} completion items`
      );
      
      return items;
    } catch (error) {
      this.logger.error(`Strategy ${strategy.name} failed:`, error);
      return [];
    }
  }

  /**
   * 选择最适合的策略
   * 
   * 按优先级遍历策略，返回第一个匹配的策略
   * 
   * 算法：顺序查找（策略已按优先级排序）
   * 时间复杂度：O(n)，n 为策略数量（通常很小）
   * 
   * @param context - 补全上下文
   * @returns 匹配的策略，如果没有匹配返回 null
   */
  private async selectStrategy(
    context: CompletionContext
  ): Promise<CompletionStrategy | null> {
    for (const strategy of this.strategies) {
      try {
        // 检查策略是否匹配
        const canComplete = await Promise.resolve(strategy.canComplete(context));
        
        this.logger.debug(`[Strategy Check] ${strategy.name}: ${canComplete}`);
        
        if (canComplete) {
          this.logger.debug(`Selected completion strategy: ${strategy.name}`);
          return strategy;
        }
      } catch (error) {
        this.logger.warn(`Strategy ${strategy.name} canComplete check failed:`, error);
        // 继续检查下一个策略
      }
    }
    
    return null;
  }

  /**
   * 执行策略
   * 
   * @param strategy - 选中的策略
   * @param context - 补全上下文
   * @returns 补全项列表
   */
  private async executeStrategy(
    strategy: CompletionStrategy,
    context: CompletionContext
  ): Promise<vscode.CompletionItem[]> {
    return await strategy.provideCompletionItems(context);
  }

  /**
   * 为补全项添加来源标记
   * 
   * 用于调试，显示补全来源
   * 
   * @param items - 补全项列表
   * @param source - 来源策略名
   */
  private tagItemsWithSource(
    items: vscode.CompletionItem[], 
    source: string
  ): void {
    // 只在调试模式下添加标记
    if (process.env.VSCODE_DEBUG_MODE === 'true') {
      for (const item of items) {
        if (!item.detail) {
          item.detail = `[${source}]`;
        } else if (!item.detail.startsWith(`[${source}]`)) {
          item.detail = `[${source}] ${item.detail}`;
        }
      }
    }
  }

  /**
   * 注册默认策略
   * 
   * 按优先级从高到低注册所有默认策略
   */
  private registerDefaultStrategies(): void {
    // 优先级 100：类型相关
    this.registerStrategy(new TypeHandlerStrategy());
    this.registerStrategy(new TypeStrategy(this.javaParser));
    
    // 优先级 90：Foreach 变量
    this.registerStrategy(new ForeachVariableStrategy());
    
    // 优先级 88：Foreach item 属性补全
    this.registerStrategy(new ForeachItemPropertyStrategy(this.javaParser));
    
    // 优先级 85：Foreach collection 属性补全
    this.registerStrategy(new ForeachCollectionStrategy());
    
    // 优先级 80：对象属性
    this.registerStrategy(new PropertyStrategy(this.javaParser));
    
    // 优先级 70：SQL 占位符
    this.registerStrategy(new PlaceholderStrategy(this.javaParser));
    
    this.logger.info(`Registered ${this.strategies.length} default completion strategies`);
  }

  /**
   * 获取已注册的策略列表
   * 
   * @returns 策略列表副本
   */
  getRegisteredStrategies(): CompletionStrategy[] {
    return [...this.strategies];
  }

  /**
   * 获取策略数量
   * 
   * @returns 已注册的策略数量
   */
  get strategyCount(): number {
    return this.strategies.length;
  }
}
