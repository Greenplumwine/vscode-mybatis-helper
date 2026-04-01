/**
 * Class 解析 Worker
 *
 * 使用 Node.js Worker Threads 并行解析 class 文件
 * 避免阻塞主线程，提升性能
 */

import { parentPort, workerData } from "worker_threads";
import { execFileSync } from "child_process";
import * as fs from "fs";
import * as path from "path";

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

const MAX_RETRIES = 3;
const RETRY_DELAY_MS = 100;

/**
 * 检查 javap 是否可用
 */
function isJavapAvailable(): boolean {
  try {
    execFileSync("javap", ["-version"], { encoding: "utf-8", timeout: 3000 });
    return true;
  } catch {
    return false;
  }
}

/**
 * 验证并清理类文件路径
 * 防止路径遍历和命令注入
 */
function sanitizeClassPath(classPath: string): string | null {
  // 解析为绝对路径
  const resolved = path.resolve(classPath);

  // 验证路径存在且是文件
  try {
    const stats = fs.statSync(resolved);
    if (!stats.isFile()) {
      return null;
    }
    // 验证扩展名是 .class
    if (!resolved.endsWith(".class")) {
      return null;
    }
  } catch {
    return null;
  }

  return resolved;
}

/**
 * 延迟函数
 */
function delay(ms: number): Promise<void> {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

/**
 * 从 class 文件解析 @MapperScan（带重试机制）
 */
async function parseAnnotationsFromClassFileWithRetry(
  classPath: string,
  retries: number = MAX_RETRIES,
): Promise<MapperScanConfig | null> {
  let lastError: Error | null = null;

  for (let attempt = 0; attempt < retries; attempt++) {
    try {
      const result = parseAnnotationsFromClassFile(classPath);
      return result;
    } catch (error) {
      lastError = error instanceof Error ? error : new Error(String(error));

      // 如果不是最后一次尝试，等待后重试
      if (attempt < retries - 1) {
        await delay(RETRY_DELAY_MS * (attempt + 1)); // 指数退避
      }
    }
  }

  // 所有重试都失败了
  throw new Error(
    `Failed to parse ${classPath} after ${retries} attempts: ${lastError?.message}`,
  );
}

/**
 * 从 class 文件解析 @MapperScan
 * 使用 execFileSync 防止命令注入
 */
function parseAnnotationsFromClassFile(
  classPath: string,
): MapperScanConfig | null {
  // 验证路径安全
  const safePath = sanitizeClassPath(classPath);
  if (!safePath) {
    throw new Error(`Invalid class file path: ${classPath}`);
  }

  try {
    // 使用数组形式的命令参数，防止命令注入
    const output = execFileSync("javap", ["-v", safePath], {
      encoding: "utf-8",
      timeout: 5000,
      maxBuffer: 10 * 1024 * 1024, // 10MB buffer
    });

    return parseMapperScanFromBytecode(output, classPath);
  } catch (error) {
    // 区分 javap 失败和解析失败
    if (error instanceof Error) {
      if (error.message.includes("ENOENT")) {
        throw new Error(`javap not found in PATH`);
      }
      if (
        error.message.includes("ETIMEDOUT") ||
        error.message.includes("timeout")
      ) {
        throw new Error(`Timeout parsing ${path.basename(classPath)}`);
      }
    }
    throw error;
  }
}

/**
 * 从字节码输出中解析 @MapperScan
 */
function parseMapperScanFromBytecode(
  output: string,
  sourceFile: string,
): MapperScanConfig | null {
  if (!output.includes("MapperScan")) {
    return null;
  }

  const basePackages: string[] = [];
  const lines = output.split("\n");
  let inAnnotations = false;
  let inMapperScan = false;

  for (let i = 0; i < lines.length; i++) {
    const line = lines[i];
    const trimmed = line.trim();

    // 进入 RuntimeVisibleAnnotations 部分
    if (trimmed === "RuntimeVisibleAnnotations:") {
      inAnnotations = true;
      continue;
    }

    // 离开注解部分（遇到下一个属性段）
    if (
      inAnnotations &&
      trimmed.endsWith(":") &&
      !trimmed.includes("@") &&
      !trimmed.match(/^\d+:/)
    ) {
      break;
    }

    if (!inAnnotations) {
      continue;
    }

    // 检测 @MapperScan 注解开始（匹配 org.mybatis.spring.annotation.MapperScan）
    if (
      trimmed.includes("org.mybatis.spring.annotation.MapperScan") ||
      (trimmed.match(/^\d+:.+#\d+/) &&
        output
          .split("\n")
          .slice(i, i + 3)
          .join("")
          .includes("MapperScan"))
    ) {
      inMapperScan = true;
      continue;
    }

    if (inMapperScan) {
      // 解析 value=["pkg1", "pkg2"] 格式（javap 展开后的格式）
      const valueMatch = trimmed.match(/value=\[([^\]]+)\]/);
      if (valueMatch) {
        const packages = valueMatch[1]
          .split(",")
          .map((p) => p.trim().replace(/"/g, ""))
          .filter((p) => p && p.includes("."));
        basePackages.push(...packages);
      }

      // 解析 basePackages={...} 格式
      const basePackagesMatch = trimmed.match(/basePackages=\{([^}]+)\}/);
      if (basePackagesMatch) {
        const packages = basePackagesMatch[1]
          .split(",")
          .map((p) => p.trim().replace(/"/g, ""))
          .filter((p) => p && p.includes("."));
        basePackages.push(...packages);
      }

      // 遇到结束括号或新注解时退出
      if (trimmed === ")" || trimmed.match(/^\d+:/)) {
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
    return { configs, errors: ["javap not available"], duration: 0 };
  }

  // 顺序处理（Worker 内部已经是并行的）
  for (const classFile of classFiles) {
    try {
      // 使用带重试的版本
      const config = await parseAnnotationsFromClassFileWithRetry(classFile);
      if (config) {
        configs.push(config);
      }
    } catch (error) {
      const errorMsg = error instanceof Error ? error.message : String(error);
      errors.push(`Failed to parse ${classFile}: ${errorMsg}`);
    }
  }

  return {
    configs,
    errors,
    duration: Date.now() - startTime,
  };
}

// 如果作为 Worker 运行
if (parentPort) {
  parentPort.once("message", async (input: WorkerInput) => {
    const result = await processClassFiles(input.classFiles);
    parentPort!.postMessage(result);
  });
}

export { processClassFiles, MapperScanConfig };
