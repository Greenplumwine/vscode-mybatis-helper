/**
 * Class 解析 Worker
 * 
 * 使用 Node.js Worker Threads 并行解析 class 文件
 * 避免阻塞主线程，提升性能
 */

import { parentPort, workerData } from 'worker_threads';
import { execSync } from 'child_process';
import * as fs from 'fs';

interface WorkerInput {
  classFiles: string[];
}

interface MapperScanConfig {
  basePackages: string[];
  sourceFile: string;
}

interface WorkerOutput {
  configs: MapperScanConfig[];
  errors: string[];
  duration: number;
}

/**
 * 检查 javap 是否可用
 */
function isJavapAvailable(): boolean {
  try {
    execSync('javap -version', { encoding: 'utf-8', timeout: 3000 });
    return true;
  } catch {
    return false;
  }
}

/**
 * 从 class 文件解析 @MapperScan
 */
function parseAnnotationsFromClassFile(classPath: string): MapperScanConfig | null {
  try {
    const output = execSync(`javap -v "${classPath}"`, { 
      encoding: 'utf-8', 
      timeout: 2000 
    });
    
    return parseMapperScanFromBytecode(output, classPath);
  } catch (error) {
    return null;
  }
}

/**
 * 从字节码输出中解析 @MapperScan
 */
function parseMapperScanFromBytecode(output: string, sourceFile: string): MapperScanConfig | null {
  if (!output.includes('MapperScan')) {
    return null;
  }

  const basePackages: string[] = [];
  const lines = output.split('\n');
  let inAnnotations = false;
  let inMapperScan = false;

  for (let i = 0; i < lines.length; i++) {
    const line = lines[i];
    const trimmed = line.trim();

    // 进入 RuntimeVisibleAnnotations 部分
    if (trimmed === 'RuntimeVisibleAnnotations:') {
      inAnnotations = true;
      continue;
    }

    // 离开注解部分（遇到下一个属性段）
    if (inAnnotations && trimmed.endsWith(':') && !trimmed.includes('@') && !trimmed.match(/^\d+:/)) {
      break;
    }

    if (!inAnnotations) continue;

    // 检测 @MapperScan 注解开始（匹配 org.mybatis.spring.annotation.MapperScan）
    if (trimmed.includes('org.mybatis.spring.annotation.MapperScan') ||
        (trimmed.match(/^\d+:.+#\d+/) && output.split('\n').slice(i, i+3).join('').includes('MapperScan'))) {
      inMapperScan = true;
      continue;
    }

    if (inMapperScan) {
      // 解析 value=["pkg1", "pkg2"] 格式（javap 展开后的格式）
      const valueMatch = trimmed.match(/value=\[([^\]]+)\]/);
      if (valueMatch) {
        const packages = valueMatch[1]
          .split(',')
          .map(p => p.trim().replace(/"/g, ''))
          .filter(p => p && p.includes('.'));
        basePackages.push(...packages);
      }

      // 解析 basePackages={...} 格式
      const basePackagesMatch = trimmed.match(/basePackages=\{([^}]+)\}/);
      if (basePackagesMatch) {
        const packages = basePackagesMatch[1]
          .split(',')
          .map(p => p.trim().replace(/"/g, ''))
          .filter(p => p && p.includes('.'));
        basePackages.push(...packages);
      }

      // 遇到结束括号或新注解时退出
      if (trimmed === ')' || (trimmed.match(/^\d+:/))) {
        inMapperScan = false;
      }
    }
  }

  if (basePackages.length > 0) {
    return { basePackages, sourceFile };
  }

  return null;
}

/**
 * Worker 主函数
 */
async function processClassFiles(classFiles: string[]): Promise<WorkerOutput> {
  const startTime = Date.now();
  const configs: MapperScanConfig[] = [];
  const errors: string[] = [];

  if (!isJavapAvailable()) {
    return { configs, errors: ['javap not available'], duration: 0 };
  }

  // 顺序处理（Worker 内部已经是并行的）
  for (const classFile of classFiles) {
    try {
      const config = parseAnnotationsFromClassFile(classFile);
      if (config) {
        configs.push(config);
      }
    } catch (error) {
      errors.push(`Failed to parse ${classFile}: ${error}`);
    }
  }

  return {
    configs,
    errors,
    duration: Date.now() - startTime
  };
}

// 如果作为 Worker 运行
if (parentPort) {
  parentPort.once('message', async (input: WorkerInput) => {
    const result = await processClassFiles(input.classFiles);
    parentPort!.postMessage(result);
  });
}

export { processClassFiles, MapperScanConfig };
