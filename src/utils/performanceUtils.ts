import * as vscode from 'vscode';
import * as fs from 'fs/promises';
import * as path from 'path';
import { safeRegexMatch } from '.';
import { logger } from './logger';
import { TIME, THRESHOLDS } from './constants';

/**
 * 性能优化工具类
 * 提供批量处理、缓存管理、延迟执行等性能相关功能
 */
export class PerformanceUtils {
  private static instance: PerformanceUtils;
  private cacheStore: Map<string, { value: unknown; timestamp: number; ttl?: number }> = new Map();
  private batchTasks: Map<string, { tasks: Array<() => void>; timer: NodeJS.Timeout | null }> = new Map();

  private constructor() {}

  /**
   * 获取单例实例
   */
  public static getInstance(): PerformanceUtils {
    if (!PerformanceUtils.instance) {
      PerformanceUtils.instance = new PerformanceUtils();
    }
    return PerformanceUtils.instance;
  }

  /**
   * 添加到缓存
   * @param key 缓存键
   * @param value 缓存值
   * @param ttl 缓存过期时间(毫秒)，默认为30分钟
   */
  public setCache<T>(key: string, value: T, ttl: number = TIME.THIRTY_MINUTES): void {
    this.cacheStore.set(key, {
      value,
      timestamp: Date.now(),
      ttl
    });
  }

  /**
   * 从缓存获取
   * @param key 缓存键
   * @returns 缓存值，如果不存在或已过期则返回undefined
   */
  public getCache<T>(key: string): T | undefined {
    const cachedItem = this.cacheStore.get(key);
    if (!cachedItem) {
      return undefined;
    }

    // 检查是否过期
    if (cachedItem.ttl && Date.now() - cachedItem.timestamp > cachedItem.ttl) {
      this.cacheStore.delete(key);
      return undefined;
    }

    return cachedItem.value as T;
  }

  /**
   * 清除指定缓存
   */
  public clearCache(key?: string): void {
    if (key) {
      this.cacheStore.delete(key);
    } else {
      this.cacheStore.clear();
    }
  }

  /**
   * 批量处理任务
   * @param batchKey 批次键
   * @param task 要执行的任务函数
   * @param delay 批处理延迟时间(毫秒)
   */
  public scheduleBatchTask(batchKey: string, task: () => void, delay: number = 100): void {
    if (!this.batchTasks.has(batchKey)) {
      this.batchTasks.set(batchKey, {
        tasks: [],
        timer: null
      });
    }

    const batchInfo = this.batchTasks.get(batchKey)!;
    batchInfo.tasks.push(task);

    // 清除之前的定时器
    if (batchInfo.timer) {
      clearTimeout(batchInfo.timer);
    }

    // 设置新的定时器
    batchInfo.timer = setTimeout(() => {
      try {
        // 执行所有任务
        batchInfo.tasks.forEach(taskFn => {
          try {
            taskFn();
          } catch (error) {
            logger.error(`Error executing batch task:`, error);
          }
        });
      } finally {
        // 清理批次信息
        this.batchTasks.delete(batchKey);
      }
    }, delay);
  }

  /**
   * 防抖函数
   * @param func 需要防抖的函数
   * @param wait 等待时间(毫秒)
   * @returns 防抖后的函数
   */
  public debounce<T extends (...args: unknown[]) => unknown>(func: T, wait: number): (...args: Parameters<T>) => void {
    let timeout: NodeJS.Timeout | null = null;

    return (...args: Parameters<T>): void => {
      if (timeout) {
        clearTimeout(timeout);
      }

      timeout = setTimeout(() => {
        func(...args);
        timeout = null;
      }, wait);
    };
  }

  /**
   * 节流函数
   * @param func 需要节流的函数
   * @param limit 时间限制(毫秒)
   * @returns 节流后的函数
   */
  public throttle<T extends (...args: unknown[]) => unknown>(func: T, limit: number): (...args: Parameters<T>) => void {
    let inThrottle: boolean = false;

    return (...args: Parameters<T>): void => {
      if (!inThrottle) {
        func(...args);
        inThrottle = true;
        setTimeout(() => inThrottle = false, limit);
      }
    };
  }

  /**
   * 使用缓存执行操作
   * @param cacheKey 缓存键
   * @param computeFn 当缓存不存在时的计算函数
   * @param ttl 缓存过期时间(毫秒)，默认为30分钟
   * @returns 计算结果或缓存值
   */
  public withCache<T>(cacheKey: string, computeFn: () => T, ttl: number = TIME.THIRTY_MINUTES): T {
    // 尝试从缓存获取结果
    const cachedValue = this.getCache<T>(cacheKey);
    if (cachedValue !== undefined) {
      return cachedValue;
    }
    
    // 缓存不存在，执行计算函数并缓存结果
    const result = computeFn();
    this.setCache(cacheKey, result, ttl);
    return result;
  }

  /**
   * 记录操作执行时间
   * @param operation 操作名称
   * @param executionTime 执行时间(毫秒)
   * @param threshold 阈值(毫秒)，超过此值才记录日志
   */
  public recordExecutionTime(operation: string, executionTime: number, threshold: number = THRESHOLDS.SLOW_OPERATION): void {
    // 可以根据需要在这里添加日志记录、性能统计等功能
    // 例如，只有当执行时间超过阈值时才记录日志
    if (executionTime > threshold) {
      logger.debug(`Performance: ${operation} took ${executionTime}ms`);
    }
  }

  /**
   * 记录函数执行时间
   * @param operation 操作名称
   * @param func 要执行的函数
   * @returns 函数的返回值
   */
  public logExecutionTime<T>(operation: string, func: () => T): T {
    const startTime = Date.now();
    try {
      return func();
    } finally {
      this.recordExecutionTime(operation, Date.now() - startTime);
    }
  }
}

/**
 * 正则表达式工具类
 * 提供安全、高效的正则表达式操作
 */
export class RegexUtils {
  private static instance: RegexUtils;
  private regexCache: Map<string, RegExp> = new Map();

  private constructor() {}

  /**
   * 获取单例实例
   */
  public static getInstance(): RegexUtils {
    if (!RegexUtils.instance) {
      RegexUtils.instance = new RegexUtils();
    }
    return RegexUtils.instance;
  }

  /**
   * 获取缓存的正则表达式
   * @param pattern 正则表达式模式或对象
   * @param flags 正则表达式标志(如果pattern是字符串)
   * @returns 正则表达式对象
   */
  public getRegex(pattern: string | RegExp, flags: string = ''): RegExp {
    if (pattern instanceof RegExp) {
      // 如果传入的是正则表达式对象，提取其模式和标志
      const key = `${pattern.source}__${pattern.flags}`;
      if (!this.regexCache.has(key)) {
        this.regexCache.set(key, pattern);
      }
      return pattern;
    }
    
    // 如果传入的是字符串，使用原有的逻辑
    const key = `${pattern}__${flags}`;
    if (!this.regexCache.has(key)) {
      try {
        this.regexCache.set(key, new RegExp(pattern, flags));
      } catch (error) {
        logger.error(`Invalid regex pattern: ${pattern}`, error);
        throw error;
      }
    }
    return this.regexCache.get(key)!;
  }

  /**
   * 安全的正则表达式匹配
   * @param text 要匹配的文本
   * @param pattern 正则表达式模式或对象
   * @param flags 正则表达式标志(如果pattern是字符串)
   * @returns 匹配结果数组或null
   */
  public safeMatch(text: string, pattern: string | RegExp, flags: string = ''): RegExpExecArray | null {
    try {
      const regex = typeof pattern === 'string' ? this.getRegex(pattern, flags) : pattern;
      return safeRegexMatch(text, regex);
    } catch (error) {
      logger.error('Regular expression match failed:', error);
      return null;
    }
  }

  /**
   * 转义正则表达式特殊字符
   * @param text 要转义的文本
   * @returns 转义后的文本
   */
  public escapeRegex(text: string): string {
    return text.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
  }
}