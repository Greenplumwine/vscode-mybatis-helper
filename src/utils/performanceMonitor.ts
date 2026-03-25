import { logger } from './logger';
import type { FastMappingEngine } from '../features/mapping/fastMappingEngine';

interface ScanMetrics {
  startTime: number;
  endTime?: number;
  xmlFilesFound: number;
  javaFilesFound: number;
  mappingsBuilt: number;
  duration?: number;
}

interface CacheMetrics {
  namespaceCount: number;
  methodCount: number;
  cacheHits: number;
  cacheMisses: number;
  hitRate: number;
}

interface MemoryMetrics {
  heapUsed: number;
  heapTotal: number;
  external: number;
  rss: number;
}

export class PerformanceMonitor {
  private static instance: PerformanceMonitor;
  private scanHistory: ScanMetrics[] = [];
  private readonly MAX_HISTORY = 10;
  private memoryLogInterval: NodeJS.Timeout | null = null;

  private constructor() {}

  public static getInstance(): PerformanceMonitor {
    if (!PerformanceMonitor.instance) {
      PerformanceMonitor.instance = new PerformanceMonitor();
    }
    return PerformanceMonitor.instance;
  }

  // ========== Scan Metrics ==========

  public startScan(): number {
    return Date.now();
  }

  public endScan(
    startTime: number,
    xmlFiles: number,
    javaFiles: number,
    mappings: number
  ): ScanMetrics {
    const metrics: ScanMetrics = {
      startTime,
      endTime: Date.now(),
      xmlFilesFound: xmlFiles,
      javaFilesFound: javaFiles,
      mappingsBuilt: mappings,
      duration: Date.now() - startTime
    };

    this.scanHistory.push(metrics);
    if (this.scanHistory.length > this.MAX_HISTORY) {
      this.scanHistory.shift();
    }

    // Log at info level for visibility
    logger.info(
      `Scan completed in ${metrics.duration}ms: ` +
      `${xmlFiles} XML, ${javaFiles} Java, ${mappings} mappings`
    );

    return metrics;
  }

  // ========== Cache Metrics ==========

  public getCacheMetrics(engine: FastMappingEngine): CacheMetrics {
    const stats = engine.getStats();
    const total = stats.cacheHits + stats.cacheMisses;

    return {
      namespaceCount: stats.total,
      methodCount: stats.totalMethods,
      cacheHits: stats.cacheHits,
      cacheMisses: stats.cacheMisses,
      hitRate: total > 0 ? stats.cacheHits / total : 0
    };
  }

  public logCacheMetrics(engine: FastMappingEngine): void {
    const metrics = this.getCacheMetrics(engine);
    logger.debug(
      `Cache metrics: ${metrics.namespaceCount} namespaces, ` +
      `${metrics.methodCount} methods, ` +
      `hit rate: ${(metrics.hitRate * 100).toFixed(1)}%`
    );
  }

  // ========== Memory Metrics ==========

  public getMemoryMetrics(): MemoryMetrics {
    const usage = process.memoryUsage();
    return {
      heapUsed: Math.round(usage.heapUsed / 1024 / 1024 * 100) / 100, // MB
      heapTotal: Math.round(usage.heapTotal / 1024 / 1024 * 100) / 100, // MB
      external: Math.round(usage.external / 1024 / 1024 * 100) / 100, // MB
      rss: Math.round(usage.rss / 1024 / 1024 * 100) / 100 // MB
    };
  }

  public logMemoryMetrics(): void {
    const mem = this.getMemoryMetrics();
    logger.debug(
      `Memory: ${mem.heapUsed}MB / ${mem.heapTotal}MB heap, ` +
      `${mem.rss}MB RSS`
    );
  }

  // ========== Memory Logging Control ==========

  public startMemoryLogging(intervalMs: number = 5 * 60 * 1000): void {
    this.stopMemoryLogging();
    this.memoryLogInterval = setInterval(() => {
      this.logMemoryMetrics();
    }, intervalMs);
    logger.debug(`Started memory logging every ${intervalMs}ms`);
  }

  public stopMemoryLogging(): void {
    if (this.memoryLogInterval) {
      clearInterval(this.memoryLogInterval);
      this.memoryLogInterval = null;
    }
  }

  // ========== Stats Report ==========

  public getStatsReport(engine: FastMappingEngine): string {
    const cache = this.getCacheMetrics(engine);
    const memory = this.getMemoryMetrics();
    const lastScan = this.scanHistory[this.scanHistory.length - 1];

    const lines = [
      '=== MyBatis Helper Performance Stats ===',
      '',
      'Cache:',
      `  Namespaces: ${cache.namespaceCount}`,
      `  Methods: ${cache.methodCount}`,
      `  Cache hits: ${cache.cacheHits}`,
      `  Cache misses: ${cache.cacheMisses}`,
      `  Hit rate: ${(cache.hitRate * 100).toFixed(1)}%`,
      '',
      'Memory:',
      `  Heap used: ${memory.heapUsed} MB`,
      `  Heap total: ${memory.heapTotal} MB`,
      `  RSS: ${memory.rss} MB`,
      ''
    ];

    if (lastScan) {
      lines.push(
        'Last Scan:',
        `  Duration: ${lastScan.duration}ms`,
        `  XML files: ${lastScan.xmlFilesFound}`,
        `  Java files: ${lastScan.javaFilesFound}`,
        `  Mappings: ${lastScan.mappingsBuilt}`
      );
    } else {
      lines.push('No scan history');
    }

    return lines.join('\n');
  }

  public getScanHistory(): ScanMetrics[] {
    return [...this.scanHistory];
  }
}
