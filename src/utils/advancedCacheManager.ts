import * as vscode from 'vscode';

/**
 * 高级缓存管理器
 */
export class AdvancedCacheManager {
  private static instance: AdvancedCacheManager;
  private caches: Map<string, CacheLayer> = new Map();
  private defaultMaxSize: number = 1000;
  private defaultTTL: number = 30 * 60 * 1000; // 默认 30 分钟

  private constructor() {
    // 初始化不同类型的缓存
    this.caches.set('fileMappings', new CacheLayer('fileMappings', this.defaultMaxSize, this.defaultTTL));
    this.caches.set('javaToXml', new CacheLayer('javaToXml', this.defaultMaxSize, this.defaultTTL));
    this.caches.set('xmlToJava', new CacheLayer('xmlToJava', this.defaultMaxSize, this.defaultTTL));
    this.caches.set('quickPath', new CacheLayer('quickPath', 500, 10 * 60 * 1000)); // 10 分钟
    this.caches.set('resourcePath', new CacheLayer('resourcePath', 500, 15 * 60 * 1000)); // 15 分钟
  }

  public static getInstance(): AdvancedCacheManager {
    if (!AdvancedCacheManager.instance) {
      AdvancedCacheManager.instance = new AdvancedCacheManager();
    }
    return AdvancedCacheManager.instance;
  }

  /**
   * 获取指定类型的缓存
   */
  public getCache(cacheType: string): CacheLayer | undefined {
    return this.caches.get(cacheType);
  }

  /**
   * 清除所有缓存
   */
  public clearAll(): void {
    for (const cache of this.caches.values()) {
      cache.clear();
    }
  }

  /**
   * 清除指定类型的缓存
   */
  public clearCache(cacheType: string): void {
    const cache = this.getCache(cacheType);
    if (cache) {
      cache.clear();
    }
  }
}

/**
 * 缓存层实现，支持 LRU 淘汰策略
 */
export class CacheLayer {
  private cache: Map<string, CacheItem> = new Map();
  private accessOrder: string[] = [];
  private maxSize: number;
  private ttl: number;
  private name: string;

  constructor(name: string, maxSize: number, ttl: number) {
    this.name = name;
    this.maxSize = maxSize;
    this.ttl = ttl;
  }

  /**
   * 设置缓存项
   */
  public set(key: string, value: any): void {
    // 检查是否达到最大大小，如果是则移除最久未使用的项
    if (this.cache.size >= this.maxSize && !this.cache.has(key)) {
      if (this.accessOrder.length > 0) {
        const oldestKey = this.accessOrder.shift();
        if (oldestKey) {
          this.cache.delete(oldestKey);
        }
      }
    }

    // 更新访问顺序
    this.updateAccessOrder(key);
    
    // 设置缓存项
    this.cache.set(key, {
      value,
      timestamp: Date.now()
    });
  }

  /**
   * 获取缓存项
   */
  public get(key: string): any | undefined {
    const item = this.cache.get(key);
    if (!item) {
      return undefined;
    }

    // 检查是否过期
    if (Date.now() - item.timestamp > this.ttl) {
      this.cache.delete(key);
      return undefined;
    }

    // 更新访问顺序
    this.updateAccessOrder(key);
    
    return item.value;
  }

  /**
   * 检查缓存中是否存在指定键
   */
  public has(key: string): boolean {
    return this.get(key) !== undefined;
  }

  /**
   * 删除缓存项
   */
  public delete(key: string): void {
    this.cache.delete(key);
    const index = this.accessOrder.indexOf(key);
    if (index > -1) {
      this.accessOrder.splice(index, 1);
    }
  }

  /**
   * 清除缓存
   */
  public clear(): void {
    this.cache.clear();
    this.accessOrder = [];
  }

  /**
   * 获取缓存大小
   */
  public get size(): number {
    return this.cache.size;
  }

  /**
   * 更新访问顺序
   */
  private updateAccessOrder(key: string): void {
    // 移除旧位置
    const index = this.accessOrder.indexOf(key);
    if (index > -1) {
      this.accessOrder.splice(index, 1);
    }
    // 添加到末尾
    this.accessOrder.push(key);
  }
}

interface CacheItem {
  value: any;
  timestamp: number;
}