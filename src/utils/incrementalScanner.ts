import * as vscode from 'vscode';
import * as fs from 'fs/promises';

/**
 * 增量扫描器实现
 */
export class IncrementalScanner {
  private static instance: IncrementalScanner;
  private projectRoots: Set<string> = new Set();
  private scannedFiles: Map<string, number> = new Map(); // 文件路径 -> 上次修改时间
  private scanQueue: Set<string> = new Set();
  private isScanning: boolean = false;
  private readonly batchSize: number = 50;
  private readonly maxConcurrentTasks: number = 5;

  private constructor() {}

  public static getInstance(): IncrementalScanner {
    if (!IncrementalScanner.instance) {
      IncrementalScanner.instance = new IncrementalScanner();
    }
    return IncrementalScanner.instance;
  }

  /**
   * 添加项目根目录
   */
  public addProjectRoot(rootPath: string): void {
    this.projectRoots.add(rootPath);
  }

  /**
   * 添加文件到扫描队列
   */
  public addFileToQueue(filePath: string): void {
    this.scanQueue.add(filePath);
    this.scheduleScan();
  }

  /**
   * 调度扫描任务
   */
  private scheduleScan(): void {
    if (this.isScanning || this.scanQueue.size === 0) {
      return;
    }

    this.isScanning = true;
    
    // 处理一批文件
    this.processNextBatch().finally(() => {
      this.isScanning = false;
      // 检查是否还有待处理的文件
      if (this.scanQueue.size > 0) {
        this.scheduleScan();
      }
    });
  }

  /**
   * 处理下一批文件
   */
  private async processNextBatch(): Promise<void> {
    // 取出一批文件
    const batch: string[] = [];
    let count = 0;
    
    for (const filePath of this.scanQueue) {
      batch.push(filePath);
      this.scanQueue.delete(filePath);
      count++;
      
      if (count >= this.batchSize) {
        break;
      }
    }

    if (batch.length === 0) {
      return;
    }

    // 并行处理文件
    const tasks: Promise<void>[] = [];
    const chunks = this.chunkArray(batch, Math.ceil(batch.length / this.maxConcurrentTasks));
    
    for (const chunk of chunks) {
      tasks.push(this.processFileChunk(chunk));
    }

    await Promise.all(tasks);
  }

  /**
   * 处理文件块
   */
  private async processFileChunk(files: string[]): Promise<void> {
    for (const filePath of files) {
      await this.scanFile(filePath);
    }
  }

  /**
   * 扫描单个文件
   */
  private async scanFile(filePath: string): Promise<void> {
    try {
      // 获取文件的修改时间
      const stats = await fs.stat(filePath);
      const mtimeMs = stats.mtimeMs;
      
      // 检查文件是否已扫描过且未修改
      const lastScanned = this.scannedFiles.get(filePath);
      if (lastScanned && lastScanned >= mtimeMs) {
        return;
      }
      
      // 更新扫描记录
      this.scannedFiles.set(filePath, mtimeMs);
      
      // 检查文件类型并处理
      if (filePath.endsWith('.java')) {
        await this.processJavaFile(filePath);
      } else if (filePath.endsWith('.xml')) {
        await this.processXmlFile(filePath);
      }
    } catch (error) {
      console.error(`Failed to scan file ${filePath}:`, error);
    }
  }

  /**
   * 处理 Java 文件
   */
  private async processJavaFile(filePath: string): Promise<void> {
    // 实现 Java 文件的处理逻辑
    // 检查是否为 Mapper 接口，并更新映射关系
  }

  /**
   * 处理 XML 文件
   */
  private async processXmlFile(filePath: string): Promise<void> {
    // 实现 XML 文件的处理逻辑
    // 检查是否为 MyBatis 映射文件，并更新映射关系
  }

  /**
   * 数组分块
   */
  private chunkArray<T>(array: T[], chunkSize: number): T[][] {
    const chunks: T[][] = [];
    
    for (let i = 0; i < array.length; i += chunkSize) {
      chunks.push(array.slice(i, i + chunkSize));
    }
    
    return chunks;
  }

  /**
   * 清除扫描记录
   */
  public clearScanHistory(): void {
    this.scannedFiles.clear();
  }
}