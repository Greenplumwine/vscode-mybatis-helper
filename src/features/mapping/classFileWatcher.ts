/**
 * Class 文件监听器
 * 
 * 监听编译输出目录的变化，增量更新索引缓存
 */

import * as vscode from 'vscode';
import * as path from 'path';
import { Logger } from '../../utils/logger';
import { indexCacheManager } from './indexCache';

export class ClassFileWatcher {
  private static instance: ClassFileWatcher;
  private logger!: Logger;
  private watchers: vscode.FileSystemWatcher[] = [];
  private isWatching: boolean = false;
  private debounceTimer: NodeJS.Timeout | null = null;
  private readonly DEBOUNCE_DELAY = 500; // 500ms 防抖

  private constructor() {}

  public static getInstance(): ClassFileWatcher {
    if (!ClassFileWatcher.instance) {
      ClassFileWatcher.instance = new ClassFileWatcher();
    }
    return ClassFileWatcher.instance;
  }

  public async initialize(): Promise<void> {
    const { Logger } = await import('../../utils/logger.js');
    this.logger = Logger.getInstance();
  }

  /**
   * 启动文件监听
   */
  public async startWatching(workspaceFolders: readonly vscode.WorkspaceFolder[]): Promise<void> {
    if (this.isWatching) {
      return;
    }

    this.stopWatching();

    for (const folder of workspaceFolders) {
      // 监听所有 target/classes 和 build/classes 目录
      const patterns = [
        new vscode.RelativePattern(folder, '**/target/classes/**/*.class'),
        new vscode.RelativePattern(folder, '**/build/classes/**/*.class')
      ];

      for (const pattern of patterns) {
        // 创建文件创建监听器
        const createWatcher = vscode.workspace.createFileSystemWatcher(pattern, false, true, true);
        createWatcher.onDidCreate(uri => this.handleClassFileChange(uri, 'create'));
        this.watchers.push(createWatcher);

        // 创建文件变更监听器
        const changeWatcher = vscode.workspace.createFileSystemWatcher(pattern, true, false, true);
        changeWatcher.onDidChange(uri => this.handleClassFileChange(uri, 'change'));
        this.watchers.push(changeWatcher);

        // 创建文件删除监听器
        const deleteWatcher = vscode.workspace.createFileSystemWatcher(pattern, true, true, false);
        deleteWatcher.onDidDelete(uri => this.handleClassFileChange(uri, 'delete'));
        this.watchers.push(deleteWatcher);
      }
    }

    this.isWatching = true;
    this.logger?.info(`Started watching class files in ${this.watchers.length / 3} patterns`);
  }

  /**
   * 停止文件监听
   */
  public stopWatching(): void {
    for (const watcher of this.watchers) {
      watcher.dispose();
    }
    this.watchers = [];
    this.isWatching = false;
    
    if (this.debounceTimer) {
      clearTimeout(this.debounceTimer);
      this.debounceTimer = null;
    }
    
    this.logger?.info('Stopped watching class files');
  }

  /**
   * 处理 class 文件变更
   */
  private handleClassFileChange(uri: vscode.Uri, type: 'create' | 'change' | 'delete'): void {
    const filePath = uri.fsPath;
    
    // 只处理配置类
    const configPattern = /(Config|Configuration|Application|AutoConfiguration)\.class$/i;
    if (!configPattern.test(filePath)) {
      return;
    }

    this.logger?.debug(`Class file ${type}: ${path.basename(filePath)}`);

    // 防抖处理，避免频繁更新
    if (this.debounceTimer) {
      clearTimeout(this.debounceTimer);
    }

    this.debounceTimer = setTimeout(() => {
      this.incrementalUpdate(filePath, type);
    }, this.DEBOUNCE_DELAY);
  }

  /**
   * 增量更新索引
   */
  private async incrementalUpdate(filePath: string, type: 'create' | 'change' | 'delete'): Promise<void> {
    try {
      if (type === 'delete') {
        // 删除缓存条目
        await indexCacheManager.updateEntry(filePath, undefined);
        this.logger?.info(`Removed from cache: ${path.basename(filePath)}`);
      } else {
        // 创建或更新：重新解析
        const { execSync } = require('child_process');
        const output = execSync(`javap -v "${filePath}"`, { 
          encoding: 'utf-8', 
          timeout: 2000 
        });

        // 快速检查是否包含 MapperScan
        if (!output.includes('MapperScan')) {
          // 更新缓存（无 @MapperScan）
          await indexCacheManager.updateEntry(filePath, undefined);
          return;
        }

        // 解析 @MapperScan
        const config = this.parseMapperScanQuick(output, filePath);
        await indexCacheManager.updateEntry(filePath, config || undefined);
        
        if (config) {
          this.logger?.info(`Updated cache: ${path.basename(filePath)} -> ${config.basePackages.join(', ')}`);
        }
      }

      // 保存索引
      await indexCacheManager.saveIndex();
    } catch (error) {
      this.logger?.debug(`Failed to incrementally update ${filePath}:`, error);
    }
  }

  /**
   * 快速解析 @MapperScan（简化版，只处理常见格式）
   */
  private parseMapperScanQuick(output: string, sourceFile: string): { basePackages: string[]; sourceFile: string } | null {
    const basePackages: string[] = [];
    
    // 查找 value=[...] 或 basePackages=[...] 格式
    const valueMatch = output.match(/value=\[([^\]]+)\]/);
    if (valueMatch) {
      const packages = valueMatch[1]
        .split(',')
        .map(p => p.trim().replace(/"/g, ''))
        .filter(p => p && p.includes('.'));
      basePackages.push(...packages);
    }

    if (basePackages.length > 0) {
      return { basePackages, sourceFile };
    }

    return null;
  }

  /**
   * 手动触发索引重建
   */
  public async rebuildIndex(): Promise<void> {
    this.logger?.info('Rebuilding index cache...');
    await indexCacheManager.clearCache();
    
    // 触发重新扫描（通过事件或其他方式）
    vscode.commands.executeCommand('mybatisHelper.rescanProject');
  }
}

export const classFileWatcher = ClassFileWatcher.getInstance();
