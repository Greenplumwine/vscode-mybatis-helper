/**
 * 文本处理工具类
 * 提供高性能的文本处理功能，包括位置计算、注释剥离等
 * 
 * @author MyBatis Helper Team
 * @version 1.0.0
 */

import * as vscode from 'vscode';
import * as path from 'path';
import * as fs from 'fs';

/**
 * 简单的 LRU 缓存实现，用于路径安全检查
 */
class PathSafetyCache {
    private cache: Map<string, boolean> = new Map();
    private readonly maxSize: number;
    
    constructor(maxSize: number = 100) {
        this.maxSize = maxSize;
    }
    
    get(key: string): boolean | undefined {
        const value = this.cache.get(key);
        if (value !== undefined) {
            // 移动到末尾（最近使用）
            this.cache.delete(key);
            this.cache.set(key, value);
        }
        return value;
    }
    
    set(key: string, value: boolean): void {
        if (this.cache.has(key)) {
            this.cache.delete(key);
        } else if (this.cache.size >= this.maxSize) {
            // 删除最旧的条目
            const firstKey = this.cache.keys().next().value;
            if (firstKey !== undefined) {
                this.cache.delete(firstKey);
            }
        }
        this.cache.set(key, value);
    }
    
    clear(): void {
        this.cache.clear();
    }
}

/**
 * 文本处理器类
 * 用于高效处理大文本文件，支持预计算行偏移量
 */
export class TextProcessor {
    /** 最大文件大小 5MB */
    public static readonly MAX_FILE_SIZE = 5 * 1024 * 1024;
    
    /** 路径安全检查缓存，避免重复的文件系统调用 */
    private static pathSafetyCache = new PathSafetyCache(100);
    
    private content: string;
    private lineOffsets: number[] = [];

    constructor(content: string) {
        this.content = content;
    }

    /**
     * 预计算行偏移量
     * 将 O(n²) 的 split 操作优化为 O(n) 的预计算
     * 正确处理 LF 和 CRLF 换行符
     */
    public precomputeLineOffsets(): void {
        this.lineOffsets = [0];
        const len = this.content.length;
        
        for (let i = 0; i < len; i++) {
            const charCode = this.content.charCodeAt(i);
            if (charCode === 10) { // '\n' LF
                // 如果是 CRLF (\r\n)，不将 \r 计入行首
                const lineStart = i + 1;
                this.lineOffsets.push(lineStart);
            }
        }
    }

    /**
     * 将字符索引转换为 VS Code Position
     * 使用二分查找，复杂度 O(log n)
     * 正确处理 CRLF 换行符
     * @param index 字符索引
     */
    public indexToPosition(index: number): vscode.Position {
        if (this.lineOffsets.length === 0) {
            this.precomputeLineOffsets();
        }

        // 边界检查
        const contentLength = this.content.length;
        if (index < 0) {
            index = 0;
        } else if (index > contentLength) {
            index = contentLength;
        }

        // 二分查找行号
        let left = 0;
        let right = this.lineOffsets.length - 1;
        
        while (left <= right) {
            const mid = Math.floor((left + right) / 2);
            if (this.lineOffsets[mid] <= index) {
                left = mid + 1;
            } else {
                right = mid - 1;
            }
        }

        const line = Math.max(0, left - 1);
        const lineStart = this.lineOffsets[line];
        let column = index - lineStart;
        
        // 确保列号非负
        column = Math.max(0, column);
        
        // 处理 CRLF：如果当前字符前面是 \r，调整列号
        // 找到当前行的实际起始位置
        const actualLineStart = this.getActualLineStart(lineStart);
        if (actualLineStart !== lineStart) {
            column = index - actualLineStart;
            column = Math.max(0, column);
        }
        
        return new vscode.Position(line, column);
    }
    
    /**
     * 获取行的实际起始位置（跳过 \r）
     * 用于处理 CRLF 换行符
     */
    private getActualLineStart(offset: number): number {
        // 如果行首是 \r，跳过它
        if (offset < this.content.length && this.content.charCodeAt(offset) === 13) {
            return offset + 1;
        }
        return offset;
    }

    /**
     * 剥离注释和字符串
     * 用于安全的正则表达式匹配
     */
    public stripCommentsAndStrings(): string {
        let result = this.content;
        
        // 移除 // 注释
        result = result.replace(/\/\/.*$/gm, '');
        
        // 移除 /* */ 注释
        result = result.replace(/\/\*[\s\S]*?\*\//g, '');
        
        // 移除 "字符串"
        result = result.replace(/"(?:[^"\\]|\\.)*"/g, '""');
        
        // 移除 '字符串'
        result = result.replace(/'(?:[^'\\]|\\.)*'/g, "''");
        
        return result;
    }

    /**
     * 清除路径安全检查缓存
     * 在路径配置变更时调用
     */
    public static clearPathSafetyCache(): void {
        TextProcessor.pathSafetyCache.clear();
    }

    /**
     * 检查路径是否安全（防止路径遍历）
     * 使用 LRU 缓存避免重复的文件系统调用
     * @param filePath 文件路径
     * @param basePath 基础路径
     */
    public static isPathSafe(filePath: string, basePath?: string): boolean {
        // 生成缓存键
        const cacheKey = `${basePath || ''}:${filePath}`;
        
        // 检查缓存
        const cached = TextProcessor.pathSafetyCache.get(cacheKey);
        if (cached !== undefined) {
            return cached;
        }
        
        // 执行安全检查
        const result = TextProcessor.performPathSafetyCheck(filePath, basePath);
        
        // 缓存结果
        TextProcessor.pathSafetyCache.set(cacheKey, result);
        
        return result;
    }
    
    /**
     * 执行实际的路径安全检查
     */
    private static performPathSafetyCheck(filePath: string, basePath?: string): boolean {
        // 首先检查原始路径中是否包含路径遍历序列
        // 注意：需要在 normalize 之前检查，因为 normalize 会解析 ..
        if (filePath.includes('..')) {
            return false;
        }
        
        // 检查 URL 编码的路径遍历
        if (filePath.includes('%2e%2e') || filePath.includes('%2E%2E')) {
            return false;
        }
        
        const normalized = path.normalize(filePath);
        
        // 再次检查规范化后的路径
        if (normalized.includes('..')) {
            return false;
        }
        
        // 如果提供了基础路径，确保文件在基础路径下
        if (basePath) {
            // 首先尝试使用符号链接感知的方式（更安全）
            try {
                // 解析符号链接，防止符号链接绕过
                // realpathSync 会返回文件的绝对路径，解析所有符号链接
                const realBase = fs.realpathSync(basePath);
                const realFile = fs.realpathSync(normalized);
                
                // 确保基础路径以路径分隔符结尾，防止部分匹配
                const baseWithSep = realBase.endsWith(path.sep) 
                    ? realBase 
                    : realBase + path.sep;
                
                // 文件必须在基础路径下或是基础路径本身
                if (!realFile.startsWith(baseWithSep) && realFile !== realBase) {
                    return false;
                }
            } catch {
                // 如果无法解析路径（如文件不存在），回退到非符号链接感知的方式
                const resolvedBase = path.resolve(basePath);
                const resolvedFile = path.resolve(normalized);
                const baseWithSep = resolvedBase.endsWith(path.sep) 
                    ? resolvedBase 
                    : resolvedBase + path.sep;
                if (!resolvedFile.startsWith(baseWithSep) && resolvedFile !== resolvedBase) {
                    return false;
                }
            }
        }
        
        return true;
    }
}

/**
 * 创建文本处理器
 * @param content 文本内容
 */
export function createTextProcessor(content: string): TextProcessor {
    return new TextProcessor(content);
}
