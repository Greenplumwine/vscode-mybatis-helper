import * as vscode from 'vscode';
import * as fs from 'fs/promises';
import * as path from 'path';
import { safeRegexMatch } from '.';

/**
 * 性能优化工具类
 * 提供批量处理、缓存管理、延迟执行等性能相关功能
 */
export class PerformanceUtils {
  private static instance: PerformanceUtils;
  private cacheStore: Map<string, { value: any; timestamp: number; ttl?: number }> = new Map();
  private batchTasks: Map<string, { tasks: Function[]; timer: NodeJS.Timeout | null }> = new Map();

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
  public setCache(key: string, value: any, ttl: number = 30 * 60 * 1000): void {
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
  public scheduleBatchTask(batchKey: string, task: Function, delay: number = 100): void {
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
            console.error(`Error executing batch task:`, error);
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
  public debounce<T extends (...args: any[]) => any>(func: T, wait: number): (...args: Parameters<T>) => void {
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
  public throttle<T extends (...args: any[]) => any>(func: T, limit: number): (...args: Parameters<T>) => void {
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
  public withCache<T>(cacheKey: string, computeFn: () => T, ttl: number = 30 * 60 * 1000): T {
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
  public recordExecutionTime(operation: string, executionTime: number, threshold: number = 500): void {
    // 可以根据需要在这里添加日志记录、性能统计等功能
    // 例如，只有当执行时间超过阈值时才记录日志
    if (executionTime > threshold) {
      console.log(`Performance: ${operation} took ${executionTime}ms`);
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
 * 文件操作工具类
 * 提供文件和目录的高效操作方法
 */
export class FileUtils {
  private static instance: FileUtils;
  private fileAccessCache: Map<string, { exists: boolean; timestamp: number }> = new Map();
  private static readonly FILE_ACCESS_CACHE_TTL = 5000; // 5秒缓存

  private constructor() {}

  /**
   * 获取单例实例
   */
  public static getInstance(): FileUtils {
    if (!FileUtils.instance) {
      FileUtils.instance = new FileUtils();
    }
    return FileUtils.instance;
  }

  /**
   * 检查文件是否存在(带缓存)
   * @param filePath 文件路径
   * @returns 是否存在
   */
  public async fileExists(filePath: string): Promise<boolean> {
    const cached = this.fileAccessCache.get(filePath);
    if (cached && Date.now() - cached.timestamp < FileUtils.FILE_ACCESS_CACHE_TTL) {
      return cached.exists;
    }

    try {
      await fs.access(filePath);
      this.fileAccessCache.set(filePath, { exists: true, timestamp: Date.now() });
      return true;
    } catch {
      this.fileAccessCache.set(filePath, { exists: false, timestamp: Date.now() });
      return false;
    }
  }

  /**
   * 读取文件内容(带错误处理)
   * @param filePath 文件路径
   * @returns 文件内容
   */
  public async safeReadFile(filePath: string): Promise<string> {
    try {
      return await fs.readFile(filePath, 'utf-8');
    } catch (error) {
      console.error(`Error reading file: ${filePath}`, error);
      throw new Error(`Failed to read file: ${filePath}`);
    }
  }

  /**
   * 智能查找文件
   * @param basePath 基础路径
   * @param fileName 文件名
   * @param extensions 文件扩展名列表
   * @param maxDepth 最大搜索深度
   * @returns 找到的文件路径列表
   */
  public async smartFindFiles(
    basePath: string,
    fileName: string,
    extensions: string[] = ['.java', '.xml'],
    maxDepth: number = 3
  ): Promise<string[]> {
    try {
      // 首先检查缓存
      const cacheKey = `smart-find-${basePath}-${fileName}-${extensions.join(',')}`;
      const perfUtils = PerformanceUtils.getInstance();
      const cachedResult = perfUtils.getCache<string[]>(cacheKey);
      if (cachedResult) {
        return cachedResult;
      }

      // 规范化文件扩展名
      const normalizedExtensions = extensions.map(ext => ext.startsWith('.') ? ext : `.${ext}`);
      const results: string[] = [];
      
      // 构建搜索模式
      const patterns: string[] = [];
      normalizedExtensions.forEach(ext => {
        patterns.push(`**/${fileName}${ext}`);
        // 同时尝试常见变体，如 Mapper 后缀
        patterns.push(`**/${fileName}Mapper${ext}`);
      });

      // 执行搜索 (限制结果数量提高性能)
      const files: vscode.Uri[] = [];
      for (const pattern of patterns) {
        const found = await vscode.workspace.findFiles(
          new vscode.RelativePattern(basePath, pattern),
          '**/node_modules/**|**/target/**|**/.git/**',
          10 // 限制每个模式最多返回10个结果
        );
        files.push(...found);
      }

      // 转换为文件路径
      const filePaths = files.map(uri => uri.fsPath);
      
      // 缓存结果
      perfUtils.setCache(cacheKey, filePaths, 60000); // 缓存1分钟
      
      return filePaths;
    } catch (error) {
      console.error(`Error smart finding files:`, error);
      return [];
    }
  }

  /**
   * 解析Java包名
   * @param filePath Java文件路径
   * @param fileContent 文件内容(可选)
   * @returns 包名
   */
  public async parseJavaPackage(filePath: string, fileContent?: string): Promise<string | null> {
    try {
      const content = fileContent || await this.safeReadFile(filePath);
      const packageMatch = content.match(/package\s+([\w\.]+);/);
      return packageMatch ? packageMatch[1] : null;
    } catch (error) {
      console.error(`Error parsing Java package: ${filePath}`, error);
      return null;
    }
  }

  /**
   * 解析XML命名空间
   * @param filePath XML文件路径
   * @param fileContent 文件内容(可选)
   * @returns 命名空间
   */
  public async parseXmlNamespace(filePath: string, fileContent?: string): Promise<string | null> {
    try {
      const content = fileContent || await this.safeReadFile(filePath);
      const namespaceMatch = content.match(/namespace=["']([^"']+)["']/);
      return namespaceMatch ? namespaceMatch[1] : null;
    } catch (error) {
      console.error(`Error parsing XML namespace: ${filePath}`, error);
      return null;
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
        console.error(`Invalid regex pattern: ${pattern}`, error);
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
      console.error('Regular expression match failed:', error);
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