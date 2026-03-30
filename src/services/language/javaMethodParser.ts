/**
 * Java 方法解析服务
 * 提供高性能的 Java 源代码解析功能
 * 
 * @author MyBatis Helper Team
 * @version 1.0.0
 */

import * as vscode from 'vscode';
import * as fs from 'fs/promises';
import { logger } from '../../utils/logger';
import { TextProcessor, createTextProcessor } from '../../utils/textProcessor';
import {
    JavaMapperInfo,
    JavaMethodInfo,
    JavaParameter
} from '../types';

/**
 * Java 源代码解析器类
 */
class SourceCodeParser {
    private textProcessor: TextProcessor;
    private content: string;
    /** 缓存 cleanContent 中每个方法名出现的位置，用于优化索引映射 */
    private cleanOccurrenceCache: Map<string, number[]> | null = null;

    constructor(content: string) {
        this.content = content;
        this.textProcessor = createTextProcessor(content);
    }

    /**
     * 解析 Java 文件
     * @param filePath 文件路径
     */
    parseJavaFile(filePath: string): JavaMapperInfo | null {
        try {
            // 预计算行偏移，优化位置计算
            this.textProcessor.precomputeLineOffsets();
            
            // 剥离注释后的内容（用于安全匹配）
            const cleanContent = this.textProcessor.stripCommentsAndStrings();
            
            // 提取包名
            const packageName = this.extractPackageName(this.content);
            
            // 提取导入
            const imports = this.extractImports(this.content);
            
            // 提取类/接口信息
            const interfaceInfo = this.extractInterfaceInfo(cleanContent);
            if (!interfaceInfo) {
                logger.debug('No interface found in file:', filePath);
                return null;
            }
            
            // 构建完整类名
            const className = packageName 
                ? `${packageName}.${interfaceInfo.name}` 
                : interfaceInfo.name;
            
            // 提取方法
            const methods = this.extractMethods(this.content, cleanContent, filePath);
            
            return {
                filePath,
                className,
                packageName: packageName || '',
                imports,
                methods
            };
        } catch (error) {
            logger.error('Error parsing Java file:', { filePath, error });
            return null;
        }
    }

    /**
     * 提取包名
     */
    private extractPackageName(content: string): string | null {
        const match = content.match(/package\s+([\w.]+)\s*;/);
        return match ? match[1] : null;
    }

    /**
     * 提取导入语句
     */
    private extractImports(content: string): string[] {
        const imports: string[] = [];
        const pattern = /import\s+([\w.*]+)\s*;/g;
        
        for (const match of content.matchAll(pattern)) {
            imports.push(match[1]);
        }
        
        return imports;
    }

    /**
     * 提取接口信息
     */
    private extractInterfaceInfo(cleanContent: string): { name: string; isInterface: boolean } | null {
        const pattern = /public\s+(?:class|interface)\s+(\w+)/;
        const match = pattern.exec(cleanContent);
        
        if (match) {
            const isInterface = cleanContent.includes('interface ' + match[1]);
            return { name: match[1], isInterface };
        }
        
        const defaultPattern = /(?:class|interface)\s+(\w+)/;
        const defaultMatch = defaultPattern.exec(cleanContent);
        
        if (defaultMatch) {
            const isInterface = cleanContent.includes('interface ' + defaultMatch[1]);
            return { name: defaultMatch[1], isInterface };
        }
        
        return null;
    }

    /**
     * 提取方法列表
     */
    private extractMethods(originalContent: string, cleanContent: string, filePath: string): JavaMethodInfo[] {
        const methods: JavaMethodInfo[] = [];
        
        // 使用 matchAll 避免正则 lastIndex 问题
        // 方法签名正则：支持泛型返回类型、注解参数
        // 注意：需要正确处理 @Param("xxx") 这种带引号的注解
        const methodPattern = /(?:public|private|protected)?\s*(?:static|final|abstract)?\s*([\w<>,\s\[\]]+?)\s+(\w+)\s*\((.*?)\)\s*(?:throws\s+[\w,\s]+)?\s*[;{]/gs;
        
        // 用于处理重复方法名的计数器
        const methodNameCounts = new Map<string, number>();
        
        // 调试：检查 cleanContent 中是否包含 insertJob
        if (filePath.includes('SysJobMapper')) {
            logger.debug(`[DEBUG] SysJobMapper cleanContent snippet:`, cleanContent.substring(0, 2000));
            logger.debug(`[DEBUG] insertJob found in cleanContent:`, cleanContent.includes('insertJob'));
        }
        
        for (const match of cleanContent.matchAll(methodPattern)) {
            const returnType = match[1].trim();
            const methodName = match[2];
            const paramsStr = match[3].trim();
            const cleanIndex = match.index ?? 0;
            
            // 将 cleanContent 中的索引映射回 originalContent
            // 使用第 N 次出现的逻辑处理重复方法名
            const occurrenceIndex = methodNameCounts.get(methodName) ?? 0;
            const originalIndex = this.mapCleanIndexToOriginal(
                cleanContent, 
                originalContent, 
                cleanIndex, 
                methodName, 
                occurrenceIndex
            );
            
            // 更新计数
            methodNameCounts.set(methodName, occurrenceIndex + 1);
            
            const position = this.textProcessor.indexToPosition(originalIndex);
            
            // 从原始内容中提取参数字符串（保留 @Param 注解中的字符串值）
            const originalParamsStr = this.extractOriginalParamsStr(originalContent, originalIndex, methodName);
            
            // 调试日志
            if (methodName === 'insertJob') {
                logger.debug(`[DEBUG] insertJob originalParamsStr: "${originalParamsStr}"`);
            }
            
            const parameters = this.parseParameters(originalParamsStr);
            
            // 调试日志
            if (methodName === 'insertJob') {
                logger.debug(`[DEBUG] insertJob parsed parameters:`, parameters);
            }
            
            const signature = this.extractMethodSignature(originalContent, originalIndex);
            
            methods.push({
                name: methodName,
                returnType,
                parameters,
                signature,
                position
            });
        }
        
        logger.debug(`Extracted ${methods.length} methods from ${filePath}: ${methods.map(m => m.name).join(', ')}`);
        return methods;
    }

    /**
     * 预计算 cleanContent 中每个方法名的所有出现位置
     * 用于优化索引映射性能
     */
    private buildCleanOccurrenceCache(cleanContent: string): void {
        if (this.cleanOccurrenceCache !== null) {
            return;
        }
        
        this.cleanOccurrenceCache = new Map();
        
        // 匹配所有方法定义
        const methodPattern = /\b(\w+)\s*\(/g;
        for (const match of cleanContent.matchAll(methodPattern)) {
            const methodName = match[1];
            const index = match.index ?? 0;
            
            if (!this.cleanOccurrenceCache.has(methodName)) {
                this.cleanOccurrenceCache.set(methodName, []);
            }
            this.cleanOccurrenceCache.get(methodName)!.push(index);
        }
    }

    /**
     * 将 cleanContent 中的索引映射回 originalContent
     * 用于在原始内容中定位匹配位置
     * @param occurrenceIndex 同名的第几次出现（处理重载方法）
     */
    private mapCleanIndexToOriginal(
        cleanContent: string, 
        originalContent: string, 
        cleanIndex: number,
        methodName: string,
        occurrenceIndex: number
    ): number {
        // 如果内容相同，直接返回
        if (cleanContent === originalContent) {
            return cleanIndex;
        }
        
        // 确保缓存已构建
        this.buildCleanOccurrenceCache(cleanContent);
        
        // 从缓存获取该方法名的所有出现位置
        const occurrences = this.cleanOccurrenceCache?.get(methodName);
        if (!occurrences || occurrences.length === 0) {
            // 缓存未命中，回退到简单查找
            return this.fallbackIndexMapping(cleanContent, originalContent, cleanIndex, methodName);
        }
        
        // 找到 cleanIndex 对应的是第几次出现
        let cleanOccurrenceCount = 0;
        for (let i = 0; i < occurrences.length; i++) {
            if (occurrences[i] === cleanIndex) {
                cleanOccurrenceCount = i + 1;
                break;
            } else if (occurrences[i] > cleanIndex) {
                break;
            }
        }
        
        if (cleanOccurrenceCount === 0) {
            // 未找到精确匹配，使用 occurrenceIndex
            cleanOccurrenceCount = occurrenceIndex + 1;
        }
        
        // 在 originalContent 中找到第 cleanOccurrenceCount 次出现
        let originalOccurrenceCount = 0;
        let originalSearchIndex = 0;
        
        while (originalOccurrenceCount < cleanOccurrenceCount) {
            const idx = originalContent.indexOf(methodName + '(', originalSearchIndex);
            if (idx === -1) break;
            originalOccurrenceCount++;
            if (originalOccurrenceCount === cleanOccurrenceCount) {
                return idx;
            }
            originalSearchIndex = idx + 1;
        }
        
        // 回退策略
        return this.fallbackIndexMapping(cleanContent, originalContent, cleanIndex, methodName);
    }
    
    /**
     * 索引映射的回退策略
     */
    private fallbackIndexMapping(
        cleanContent: string, 
        originalContent: string, 
        cleanIndex: number,
        methodName: string
    ): number {
        // 尝试上下文匹配
        const contextLength = Math.min(50, cleanContent.length - cleanIndex);
        if (contextLength <= 0) {
            return cleanIndex;
        }
        
        const context = cleanContent.substring(cleanIndex, cleanIndex + contextLength);
        const originalIndex = originalContent.indexOf(context);
        if (originalIndex !== -1) {
            return originalIndex;
        }
        
        // 最终回退：直接查找方法名
        const nameIndex = originalContent.indexOf(methodName + '(');
        if (nameIndex !== -1) {
            return nameIndex;
        }
        
        // 最坏情况
        return cleanIndex;
    }

    /**
     * 解析参数列表
     * 正确处理泛型参数（如 Map<String, Integer>）、数组和可变参数
     */
    private parseParameters(paramsStr: string): JavaParameter[] {
        if (!paramsStr.trim()) {
            return [];
        }
        
        const parameters: JavaParameter[] = [];
        
        // 手动解析参数，正确处理泛型中的逗号
        const tokens = this.tokenizeParameters(paramsStr);
        let i = 0;
        let paramIndex = 0;
        
        while (i < tokens.length) {
            // 跳过注解
            const annotations: string[] = [];
            while (i < tokens.length && tokens[i].startsWith('@')) {
                let annotation = tokens[i];
                i++;
                // 处理注解参数，如 @Param("id")
                if (i < tokens.length && tokens[i] === '(') {
                    annotation += '(';
                    i++;
                    let parenDepth = 1;
                    while (i < tokens.length && parenDepth > 0) {
                        if (tokens[i] === '(') parenDepth++;
                        if (tokens[i] === ')') parenDepth--;
                        annotation += tokens[i];
                        i++;
                    }
                }
                annotations.push(annotation);
            }
            
            if (i >= tokens.length) break;
            
            // 解析类型（可能包含泛型、数组、可变参数）
            const typeParts: string[] = [];
            let angleBracketDepth = 0;
            let squareBracketDepth = 0;
            
            while (i < tokens.length) {
                const token = tokens[i];
                
                if (token === '<') {
                    angleBracketDepth++;
                    typeParts.push(token);
                } else if (token === '>') {
                    angleBracketDepth--;
                    typeParts.push(token);
                } else if (token === '[') {
                    squareBracketDepth++;
                    typeParts.push(token);
                } else if (token === ']') {
                    squareBracketDepth--;
                    typeParts.push(token);
                } else if (token === ',' && angleBracketDepth === 0 && squareBracketDepth === 0) {
                    // 参数分隔符
                    break;
                } else if (token === ' ' && angleBracketDepth === 0 && squareBracketDepth === 0) {
                    // 空格是类型和名称的分界标识
                    // 将空格添加到 typeParts，后续通过 trim 处理
                    typeParts.push(token);
                } else {
                    typeParts.push(token);
                }
                
                i++;
            }
            
            // 从 typeParts 中分离类型和参数名
            let paramName = '';
            let typeStr = '';
            
            const typeStrFull = typeParts.join('');
            
            // 策略：从后向前查找参数名
            // 参数名是最后一个独立单词，前面是类型
            // 考虑：普通类型、泛型、数组、可变参数
            
            // 移除末尾空格
            let trimmed = typeStrFull.trimEnd();
            
            // 检查是否以 ... 结尾（可变参数）
            let isVarArgs = false;
            if (trimmed.endsWith('...')) {
                isVarArgs = true;
                trimmed = trimmed.slice(0, -3).trimEnd();
            }
            
            // 检查是否以 [] 结尾（数组）
            let arraySuffix = '';
            while (trimmed.endsWith(']')) {
                const bracketStart = trimmed.lastIndexOf('[');
                if (bracketStart === -1) break;
                arraySuffix = trimmed.substring(bracketStart) + arraySuffix;
                trimmed = trimmed.substring(0, bracketStart).trimEnd();
            }
            
            // 查找参数名（最后一个单词）
            // 处理泛型情况：Map<String, Integer> map
            // 需要找到 > 后面的单词
            
            let lastAngleBracket = -1;
            let depth = 0;
            for (let j = trimmed.length - 1; j >= 0; j--) {
                if (trimmed[j] === '>') {
                    depth++;
                    if (lastAngleBracket === -1) lastAngleBracket = j;
                } else if (trimmed[j] === '<') {
                    depth--;
                } else if (depth === 0 && trimmed[j] === ' ') {
                    // 在类型外找到空格
                    const afterSpace = trimmed.substring(j + 1).trim();
                    if (/^[a-zA-Z_]\w*$/.test(afterSpace)) {
                        // 这是一个有效的标识符
                        paramName = afterSpace;
                        typeStr = trimmed.substring(0, j).trim();
                        break;
                    }
                }
            }
            
            // 如果没有找到，尝试简单分割
            if (!paramName) {
                const lastSpace = trimmed.lastIndexOf(' ');
                if (lastSpace !== -1) {
                    const afterSpace = trimmed.substring(lastSpace + 1).trim();
                    if (/^[a-zA-Z_]\w*$/.test(afterSpace)) {
                        paramName = afterSpace;
                        typeStr = trimmed.substring(0, lastSpace).trim();
                    }
                }
            }
            
            // 恢复数组后缀和可变参数
            if (arraySuffix) {
                typeStr += arraySuffix;
            }
            if (isVarArgs) {
                typeStr += '...';
            }
            
            // 检查是否有 @Param 注解
            const hasParamAnnotation = annotations.some(a => a.startsWith('@Param'));
            let paramValue: string | undefined;
            
            if (hasParamAnnotation) {
                const paramAnnotation = annotations.find(a => a.startsWith('@Param'));
                if (paramAnnotation) {
                    const valueMatch = paramAnnotation.match(/@Param\s*\(\s*["']([^"']+)["']\s*\)/);
                    if (valueMatch) {
                        paramValue = valueMatch[1];
                    }
                }
            }
            
            if (paramName && typeStr) {
                parameters.push({
                    name: paramName,
                    type: typeStr,
                    hasParamAnnotation,
                    paramValue
                });
            }
            
            paramIndex++;
            
            // 跳过逗号
            if (i < tokens.length && tokens[i] === ',') {
                i++;
            }
        }
        
        return parameters;
    }

    /**
     * 将参数字符串分割为 token
     * 正确处理字符串中的转义字符
     */
    private tokenizeParameters(paramsStr: string): string[] {
        const tokens: string[] = [];
        let current = '';
        let inString = false;
        let stringChar = '';
        
        for (let i = 0; i < paramsStr.length; i++) {
            const char = paramsStr[i];
            
            if (inString) {
                current += char;
                // 检查字符串结束：当前字符是引号，且前面有偶数个反斜杠（未被转义）
                if (char === stringChar) {
                    // 计算前面连续的反斜杠数量
                    // 从倒数第二个字符开始检查，确保索引有效
                    let backslashCount = 0;
                    for (let j = current.length - 2; j >= 0 && current[j] === '\\'; j--) {
                        backslashCount++;
                    }
                    // 如果反斜杠数量是偶数，则引号未被转义
                    if (backslashCount % 2 === 0) {
                        inString = false;
                        tokens.push(current);
                        current = '';
                    }
                }
            } else if (char === '"' || char === "'") {
                if (current) {
                    tokens.push(current);
                    current = '';
                }
                inString = true;
                stringChar = char;
                current = char;
            } else if ('<>(), '.includes(char)) {
                if (current) {
                    tokens.push(current);
                    current = '';
                }
                tokens.push(char);
            } else {
                current += char;
            }
        }
        
        if (current) {
            tokens.push(current);
        }
        
        return tokens;
    }

    /**
     * 提取完整方法签名
     */
    private extractMethodSignature(content: string, startIndex: number): string {
        let endIndex = startIndex;
        let braceCount = 0;
        let foundBrace = false;
        
        for (let i = startIndex; i < content.length; i++) {
            const char = content[i];
            
            if (char === '{') {
                braceCount++;
                foundBrace = true;
            } else if (char === '}') {
                braceCount--;
                if (foundBrace && braceCount === 0) {
                    endIndex = i + 1;
                    break;
                }
            } else if (char === ';' && !foundBrace) {
                endIndex = i + 1;
                break;
            }
        }
        
        return content.substring(startIndex, endIndex).trim();
    }

    /**
     * 从原始内容中提取参数字符串
     * 用于获取未经过 stripCommentsAndStrings 处理的原始参数（保留 @Param 注解中的字符串值）
     */
    private extractOriginalParamsStr(content: string, startIndex: number, methodName: string): string {
        // 找到方法名后的左括号
        const methodStart = content.indexOf(methodName, startIndex);
        if (methodStart === -1) {
            return '';
        }
        
        const openParen = content.indexOf('(', methodStart);
        if (openParen === -1) {
            return '';
        }
        
        // 找到匹配的右括号
        let parenDepth = 1;
        let closeParen = -1;
        for (let i = openParen + 1; i < content.length; i++) {
            const char = content[i];
            if (char === '(') {
                parenDepth++;
            } else if (char === ')') {
                parenDepth--;
                if (parenDepth === 0) {
                    closeParen = i;
                    break;
                }
            } else if (char === '"' || char === "'") {
                // 跳过字符串
                const quote = char;
                i++;
                while (i < content.length) {
                    if (content[i] === '\\') {
                        i += 2; // 跳过转义字符
                    } else if (content[i] === quote) {
                        break;
                    } else {
                        i++;
                    }
                }
            }
        }
        
        if (closeParen === -1) {
            return '';
        }
        
        return content.substring(openParen + 1, closeParen).trim();
    }
}

/**
 * Java 方法解析器类
 */
export class JavaMethodParser {
    private static instance: JavaMethodParser;
    private cache: Map<string, JavaMapperInfo> = new Map();

    private constructor() {}

    public static getInstance(): JavaMethodParser {
        if (!JavaMethodParser.instance) {
            JavaMethodParser.instance = new JavaMethodParser();
        }
        return JavaMethodParser.instance;
    }

    async parseJavaFile(filePath: string, forceRefresh: boolean = false): Promise<JavaMapperInfo | null> {
        const cached = this.cache.get(filePath);
        if (cached && !forceRefresh) {
            logger.debug('Returning cached Java info:', filePath);
            return cached;
        }

        try {
            const content = await fs.readFile(filePath, 'utf-8');
            const parser = new SourceCodeParser(content);
            const info = parser.parseJavaFile(filePath);
            
            if (info) {
                this.cache.set(filePath, info);
            }
            
            return info;
        } catch (error) {
            logger.error('Error parsing Java file:', { filePath, error });
            return null;
        }
    }

    public getCached(filePath: string): JavaMapperInfo | undefined {
        return this.cache.get(filePath);
    }

    public clearCache(): void {
        this.cache.clear();
        logger.debug('Java parser cache cleared');
    }

    public invalidateCache(filePath: string): void {
        this.cache.delete(filePath);
        logger.debug('Java parser cache invalidated:', filePath);
    }

    /**
     * 获取对象的属性列表
     *
     * 从类文件中提取字段声明，支持从项目源码中查找实体类
     *
     * @param className - 类名（简单名或全限定名）
     * @returns 属性信息数组（包含名称和类型）
     */
    async getObjectProperties(className: string): Promise<Array<{ name: string; type: string }>> {
        logger.debug(`Getting properties for class: ${className}`);

        // 常见类型直接返回空数组
        if (this.isBasicType(className)) {
            return [];
        }

        // 1. 尝试从缓存的所有 Java 文件中查找这个类
        for (const [filePath, info] of this.cache.entries()) {
            if (info.className.endsWith(className) || info.className === className) {
                logger.debug(`Found class ${className} in cache: ${filePath}`);
                return this.extractPropertiesFromClass(filePath);
            }
        }

        // 2. 尝试从项目源码中查找实体类文件
        const classFilePath = await this.findClassFileInProject(className);
        if (classFilePath) {
            logger.debug(`Found class ${className} in project: ${classFilePath}`);
            return this.extractPropertiesFromClass(classFilePath);
        }

        logger.debug(`Class ${className} not found in cache or project`);
        return [];
    }
    
    /**
     * 在项目中查找类文件
     * 支持简单类名和全限定名
     */
    private async findClassFileInProject(className: string): Promise<string | null> {
        try {
            // 获取所有工作区
            const workspaceFolders = vscode.workspace.workspaceFolders;
            if (!workspaceFolders || workspaceFolders.length === 0) {
                return null;
            }
            
            // 处理简单类名：直接搜索 {ClassName}.java
            // 处理全限定名：转换为路径格式
            const simpleClassName = className.includes('.') 
                ? className.substring(className.lastIndexOf('.') + 1) 
                : className;
            
            // 搜索模式：所有以类名命名的 Java 文件
            const pattern = `**/${simpleClassName}.java`;
            
            for (const folder of workspaceFolders) {
                const files = await vscode.workspace.findFiles(
                    new vscode.RelativePattern(folder, pattern),
                    '**/target/**', // 排除编译输出
                    10 // 最多返回10个结果
                );
                
                for (const file of files) {
                    const filePath = file.fsPath;
                    
                    // 验证文件内容是否包含类定义
                    if (await this.verifyClassDefinition(filePath, className, simpleClassName)) {
                        return filePath;
                    }
                }
            }
            
            return null;
        } catch (error) {
            logger.error(`Error finding class file for ${className}:`, error);
            return null;
        }
    }
    
    /**
     * 验证文件是否包含指定的类定义
     */
    private async verifyClassDefinition(
        filePath: string, 
        className: string, 
        simpleName: string
    ): Promise<boolean> {
        try {
            const content = await fs.readFile(filePath, 'utf-8');
            
            // 如果是全限定名，需要检查 package 声明
            if (className.includes('.')) {
                const packageName = className.substring(0, className.lastIndexOf('.'));
                // 匹配 package 声明（考虑各种空白字符）
                const packagePattern = new RegExp(`package\\s+${packageName.replace(/\./g, '\\.')}\\s*;`);
                if (!packagePattern.test(content)) {
                    return false;
                }
            }
            
            // 检查是否包含类/接口/枚举定义
            const classPattern = new RegExp(`(class|interface|enum|record)\\s+${simpleName}\\b`);
            return classPattern.test(content);
        } catch (error) {
            return false;
        }
    }

    /**
     * 判断是否是基本类型
     */
    private isBasicType(type: string): boolean {
        const basicTypes = ['String', 'Integer', 'Long', 'Boolean', 'Double', 'Float', 
                           'int', 'long', 'boolean', 'double', 'float', 'byte', 'short',
                           'BigDecimal', 'Date', 'LocalDate', 'LocalDateTime'];
        return basicTypes.includes(type) || type.startsWith('java.');
    }

    /**
     * 从类文件中提取属性（包含类型信息）
     *
     * @param filePath - Java 文件路径
     * @returns 属性信息数组（包含名称和类型）
     */
    private async extractPropertiesFromClass(filePath: string): Promise<Array<{ name: string; type: string }>> {
        try {
            const content = await fs.readFile(filePath, 'utf-8');
            const properties: Array<{ name: string; type: string }> = [];

            // 简单的正则匹配：private/protected/public Type fieldName;
            const fieldPattern = /(?:private|protected|public)\s+(?:static\s+)?(?:final\s+)?(\w+(?:<[^>]+>)?(?:\[\])?)\s+(\w+)\s*;/g;
            let match;
            while ((match = fieldPattern.exec(content)) !== null) {
                properties.push({
                    type: match[1], // 字段类型
                    name: match[2]  // 字段名
                });
            }

            // 如果没有匹配到，尝试匹配 getter 方法名
            if (properties.length === 0) {
                const getterPattern = /public\s+(\w+(?:<[^>]+>)?(?:\[\])?)\s+get(\w+)\s*\(/g;
                while ((match = getterPattern.exec(content)) !== null) {
                    const propName = match[2].charAt(0).toLowerCase() + match[2].slice(1);
                    properties.push({
                        type: match[1], // 返回类型
                        name: propName
                    });
                }
            }

            logger.debug(`Extracted ${properties.length} properties from ${filePath}`);
            return properties;
        } catch (error) {
            logger.error(`Failed to extract properties from ${filePath}:`, error);
            return [];
        }
    }

    /**
     * 解析指定方法
     * 
     * @param filePath - Java 文件路径
     * @param methodName - 方法名
     * @returns JavaMethod 对象，未找到返回 null
     */
    async parseMethod(filePath: string, methodName: string): Promise<any | null> {
        // 强制刷新缓存以获取最新的 @Param 注解
        const info = await this.parseJavaFile(filePath, true);
        if (!info) {
            logger.debug('parseMethod: No info returned from parseJavaFile');
            return null;
        }

        logger.debug(`parseMethod: Looking for ${methodName}, found ${info.methods?.length || 0} methods`);
        if (info.methods?.length > 0) {
            logger.debug(`parseMethod: Available methods: ${info.methods.map(m => m.name).join(', ')}`);
        }

        const methodInfo = info.methods?.find(m => m.name === methodName);
        if (!methodInfo) {
            logger.debug(`Method ${methodName} not found in ${filePath}`);
            return null;
        }

        // 转换为 JavaMethod 格式
        return {
            name: methodInfo.name,
            returnType: methodInfo.returnType,
            isCollection: methodInfo.returnType.includes('List') || 
                         methodInfo.returnType.includes('Set') || 
                         methodInfo.returnType.includes('Collection') ||
                         methodInfo.returnType.includes('[]'),
            parameters: methodInfo.parameters,
            annotations: [], // TODO: 从 methodInfo 获取注解
            lineRange: {
                start: methodInfo.position.line,
                end: methodInfo.position.line + 1 // 估算结束行
            }
        };
    }
}

export const javaMethodParser = JavaMethodParser.getInstance();
