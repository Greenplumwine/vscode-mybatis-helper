import * as vscode from 'vscode';

/**
 * 映射索引管理器
 */
export class MappingIndexManager {
  private static instance: MappingIndexManager;
  private classNameToXmlPath: Map<string, string> = new Map();
  private xmlPathToClassName: Map<string, string> = new Map();
  private methodToXmlLocation: Map<string, { xmlPath: string, line: number }> = new Map();
  private isIndexLoaded: boolean = false;

  private constructor() {}

  public static getInstance(): MappingIndexManager {
    if (!MappingIndexManager.instance) {
      MappingIndexManager.instance = new MappingIndexManager();
    }
    return MappingIndexManager.instance;
  }

  /**
   * 初始化索引
   */
  public async initialize(): Promise<void> {
    // 尝试从持久化存储加载索引
    await this.loadIndex();
  }

  /**
   * 添加映射关系到索引
   */
  public addMapping(className: string, xmlPath: string): void {
    this.classNameToXmlPath.set(className, xmlPath);
    this.xmlPathToClassName.set(xmlPath, className);
    
    // 异步保存索引
    this.saveIndexDebounced();
  }

  /**
   * 添加方法位置信息到索引
   */
  public addMethodLocation(className: string, methodName: string, xmlPath: string, line: number): void {
    const key = `${className}.${methodName}`;
    this.methodToXmlLocation.set(key, { xmlPath, line });
    
    // 异步保存索引
    this.saveIndexDebounced();
  }

  /**
   * 根据类名查找 XML 文件路径
   */
  public getXmlPathByClassName(className: string): string | undefined {
    return this.classNameToXmlPath.get(className);
  }

  /**
   * 根据 XML 文件路径查找类名
   */
  public getClassNameByXmlPath(xmlPath: string): string | undefined {
    return this.xmlPathToClassName.get(xmlPath);
  }

  /**
   * 根据类名和方法名查找 XML 中的位置
   */
  public getMethodLocation(className: string, methodName: string): { xmlPath: string, line: number } | undefined {
    return this.methodToXmlLocation.get(`${className}.${methodName}`);
  }

  /**
   * 移除映射关系
   */
  public removeMapping(className: string): void {
    const xmlPath = this.classNameToXmlPath.get(className);
    if (xmlPath) {
      this.classNameToXmlPath.delete(className);
      this.xmlPathToClassName.delete(xmlPath);
      
      // 移除相关的方法位置信息
      for (const key of this.methodToXmlLocation.keys()) {
        if (key.startsWith(`${className}.`)) {
          this.methodToXmlLocation.delete(key);
        }
      }
      
      // 异步保存索引
      this.saveIndexDebounced();
    }
  }

  /**
   * 清空索引
   */
  public clear(): void {
    this.classNameToXmlPath.clear();
    this.xmlPathToClassName.clear();
    this.methodToXmlLocation.clear();
    this.isIndexLoaded = false;
  }

  /**
   * 从持久化存储加载索引
   */
  private async loadIndex(): Promise<void> {
    try {
      // 实现从磁盘加载索引的逻辑
      // 例如从 VSCode 的 workspaceState 或磁盘文件加载
      this.isIndexLoaded = true;
    } catch (error) {
      console.error('Failed to load mapping index:', error);
      this.isIndexLoaded = false;
    }
  }

  /**
   * 保存索引到持久化存储
   */
  private async saveIndex(): Promise<void> {
    try {
      // 实现保存索引到磁盘的逻辑
    } catch (error) {
      console.error('Failed to save mapping index:', error);
    }
  }

  /**
   * 防抖保存索引
   */
  private saveIndexDebounced = this.debounce(() => {
    this.saveIndex();
  }, 1000);

  /**
   * 防抖函数
   */
  private debounce<T extends (...args: any[]) => any>(func: T, wait: number): (...args: Parameters<T>) => void {
    let timeout: NodeJS.Timeout;
    return function(this: any, ...args: Parameters<T>) {
      clearTimeout(timeout);
      timeout = setTimeout(() => func.apply(this, args), wait);
    };
  }
}