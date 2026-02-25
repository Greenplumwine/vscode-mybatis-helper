/**
 * MyBatis Helper 索引缓存系统
 * 
 * 功能：
 * 1. 持久化缓存解析结果到磁盘 (.mybatis/index.json)
 * 2. 基于文件修改时间的增量更新
 * 3. 跨会话保持（VS Code 重启后仍有效）
 */

import * as fs from 'fs/promises';
import * as path from 'path';
import { MapperScanConfig } from './types';
import { Logger } from '../../utils/logger';

interface IndexEntry {
  path: string;
  mtime: number;
  size: number;
  mapperScan?: MapperScanConfig;
}

interface IndexData {
  version: string;
  timestamp: number;
  projectRoot: string;
  entries: IndexEntry[];
}

const INDEX_VERSION = '1.0';
const INDEX_DIR = '.mybatis';
const INDEX_FILE = 'index.json';

export class IndexCacheManager {
  private static instance: IndexCacheManager;
  private logger!: Logger;
  private memoryCache: Map<string, IndexEntry> = new Map();
  private projectRoot: string = '';
  private indexPath: string = '';
  private isInitialized: boolean = false;

  private constructor() {}

  public static getInstance(): IndexCacheManager {
    if (!IndexCacheManager.instance) {
      IndexCacheManager.instance = new IndexCacheManager();
    }
    return IndexCacheManager.instance;
  }

  /**
   * 初始化索引缓存
   */
  public async initialize(projectRoot: string): Promise<void> {
    if (this.isInitialized && this.projectRoot === projectRoot) {
      return;
    }

    const { Logger } = await import('../../utils/logger.js');
    this.logger = Logger.getInstance();
    
    this.projectRoot = projectRoot;
    this.indexPath = path.join(projectRoot, INDEX_DIR, INDEX_FILE);
    
    await this.loadIndex();
    this.isInitialized = true;
    
    this.logger?.debug(`Index cache initialized at ${this.indexPath}`);
  }

  /**
   * 加载索引文件
   */
  private async loadIndex(): Promise<void> {
    try {
      const data = await fs.readFile(this.indexPath, 'utf-8');
      const index: IndexData = JSON.parse(data);
      
      // 版本检查
      if (index.version !== INDEX_VERSION) {
        this.logger?.info(`Index version mismatch (${index.version} vs ${INDEX_VERSION}), rebuilding...`);
        await this.clearCache();
        return;
      }

      // 项目路径检查
      if (index.projectRoot !== this.projectRoot) {
        this.logger?.info('Project root changed, rebuilding index...');
        await this.clearCache();
        return;
      }

      // 加载到内存
      this.memoryCache.clear();
      for (const entry of index.entries) {
        this.memoryCache.set(entry.path, entry);
      }

      this.logger?.info(`Loaded index with ${this.memoryCache.size} entries`);
    } catch (error) {
      // 索引不存在或损坏，创建新的
      this.logger?.debug('No existing index found or index corrupted, creating new...');
      await this.createIndexDir();
    }
  }

  /**
   * 保存索引到磁盘
   */
  public async saveIndex(): Promise<void> {
    if (!this.isInitialized) return;

    try {
      const index: IndexData = {
        version: INDEX_VERSION,
        timestamp: Date.now(),
        projectRoot: this.projectRoot,
        entries: Array.from(this.memoryCache.values())
      };

      await fs.writeFile(this.indexPath, JSON.stringify(index, null, 2));
      this.logger?.debug(`Saved index with ${this.memoryCache.size} entries`);
    } catch (error) {
      this.logger?.debug('Failed to save index:', error);
    }
  }

  /**
   * 创建索引目录
   */
  private async createIndexDir(): Promise<void> {
    try {
      const dir = path.dirname(this.indexPath);
      await fs.mkdir(dir, { recursive: true });
    } catch (error) {
      this.logger?.debug('Failed to create index directory:', error);
    }
  }

  /**
   * 检查文件是否已缓存且未变更
   */
  public async isCached(filePath: string): Promise<{ cached: boolean; entry?: IndexEntry }> {
    const relativePath = path.relative(this.projectRoot, filePath);
    const cached = this.memoryCache.get(relativePath);
    
    if (!cached) {
      return { cached: false };
    }

    try {
      const stats = await fs.stat(filePath);
      if (stats.mtimeMs === cached.mtime && stats.size === cached.size) {
        return { cached: true, entry: cached };
      }
    } catch (error) {
      // 文件不存在，从缓存移除
      this.memoryCache.delete(relativePath);
    }

    return { cached: false };
  }

  /**
   * 更新缓存条目
   */
  public async updateEntry(filePath: string, mapperScan?: MapperScanConfig): Promise<void> {
    const relativePath = path.relative(this.projectRoot, filePath);
    
    try {
      const stats = await fs.stat(filePath);
      const entry: IndexEntry = {
        path: relativePath,
        mtime: stats.mtimeMs,
        size: stats.size,
        mapperScan
      };

      this.memoryCache.set(relativePath, entry);
    } catch (error) {
      this.logger?.debug(`Failed to update cache for ${filePath}:`, error);
    }
  }

  /**
   * 批量更新缓存
   */
  public async updateEntries(entries: { path: string; mapperScan?: MapperScanConfig }[]): Promise<void> {
    for (const entry of entries) {
      await this.updateEntry(entry.path, entry.mapperScan);
    }
    // 批量更新后保存
    await this.saveIndex();
  }

  /**
   * 获取所有缓存的 MapperScan 配置
   */
  public getAllConfigs(): MapperScanConfig[] {
    const configs: MapperScanConfig[] = [];
    for (const entry of this.memoryCache.values()) {
      if (entry.mapperScan) {
        configs.push(entry.mapperScan);
      }
    }
    return configs;
  }

  /**
   * 清除缓存
   */
  public async clearCache(): Promise<void> {
    this.memoryCache.clear();
    try {
      await fs.unlink(this.indexPath);
    } catch (error) {
      // 忽略错误
    }
  }

  /**
   * 获取统计信息
   */
  public getStats(): { total: number; withMapperScan: number } {
    let withMapperScan = 0;
    for (const entry of this.memoryCache.values()) {
      if (entry.mapperScan) {
        withMapperScan++;
      }
    }
    return {
      total: this.memoryCache.size,
      withMapperScan
    };
  }

  /**
   * 清理不存在的文件
   */
  public async cleanup(): Promise<number> {
    let removed = 0;
    for (const [key, entry] of this.memoryCache) {
      const fullPath = path.join(this.projectRoot, entry.path);
      try {
        await fs.access(fullPath);
      } catch {
        this.memoryCache.delete(key);
        removed++;
      }
    }
    
    if (removed > 0) {
      await this.saveIndex();
    }
    
    return removed;
  }
}

export const indexCacheManager = IndexCacheManager.getInstance();
