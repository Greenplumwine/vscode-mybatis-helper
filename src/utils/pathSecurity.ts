/**
 * 路径安全工具
 *
 * 提供路径验证和清理功能，防止路径遍历和命令注入攻击
 */

import * as fs from "fs";
import * as path from "path";

/**
 * 验证并清理类文件路径
 * 防止路径遍历和命令注入
 *
 * @param classPath - 类文件路径
 * @returns 绝对路径或 null（验证失败）
 */
export function sanitizeClassPath(classPath: string): string | null {
  if (!classPath || typeof classPath !== "string") {
    return null;
  }

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
 * 验证并清理 JAR 文件路径
 * 防止路径遍历和命令注入
 *
 * @param jarPath - JAR 文件路径
 * @returns 绝对路径或 null（验证失败）
 */
export function sanitizeJarPath(jarPath: string): string | null {
  if (!jarPath || typeof jarPath !== "string") {
    return null;
  }

  // 解析为绝对路径
  const resolved = path.resolve(jarPath);

  // 验证路径存在且是文件
  try {
    const stats = fs.statSync(resolved);
    if (!stats.isFile()) {
      return null;
    }
    // 验证扩展名是 .jar
    if (!resolved.endsWith(".jar")) {
      return null;
    }
  } catch {
    return null;
  }

  return resolved;
}

/**
 * 验证类名是否合法
 * 防止命令注入通过类名
 *
 * @param className - 类名
 * @returns 是否合法
 */
export function isValidClassName(className: string): boolean {
  if (!className || typeof className !== "string") {
    return false;
  }
  // 类名只能包含字母、数字、下划线、美元符号和点号
  return /^[\w.$]+$/.test(className);
}

/**
 * 验证并清理一般文件路径
 * 防止路径遍历
 *
 * @param filePath - 文件路径
 * @param allowedExtensions - 允许的文件扩展名数组（如 ['.java', '.xml']）
 * @returns 绝对路径或 null（验证失败）
 */
export function sanitizeFilePath(
  filePath: string,
  allowedExtensions?: string[],
): string | null {
  if (!filePath || typeof filePath !== "string") {
    return null;
  }

  // 解析为绝对路径
  const resolved = path.resolve(filePath);

  // 验证路径存在且是文件
  try {
    const stats = fs.statSync(resolved);
    if (!stats.isFile()) {
      return null;
    }
  } catch {
    return null;
  }

  // 如果指定了允许的扩展名，进行验证
  if (allowedExtensions && allowedExtensions.length > 0) {
    const ext = path.extname(resolved).toLowerCase();
    const allowedLower = allowedExtensions.map((e) => e.toLowerCase());
    if (!allowedLower.includes(ext)) {
      return null;
    }
  }

  return resolved;
}
