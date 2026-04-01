/**
 * 增强型 Java 方法解析服务
 *
 * 提供以下功能：
 * 1. @Param 注解解析
 * 2. 源码文件属性解析
 * 3. javap 字节码解析（用于 JAR 依赖）
 * 4. LRU 缓存和并发请求合并
 *
 * @author MyBatis Helper Team
 * @version 2.0.0
 */

import * as vscode from "vscode";
import * as fs from "fs/promises";
import * as path from "path";
import { execFile } from "child_process";
import { promisify } from "util";
import { logger } from "../../utils/logger";
import { JavaParameter, JavaMethodInfo, JavaMapperInfo } from "../types";
import { ObjectProperty } from "../../features/completion/types";

const execFileAsync = promisify(execFile);

/**
 * LRU 缓存实现
 */
class LRUCache<K, V> {
  private cache: Map<K, { value: V; timestamp: number }> = new Map();
  private maxSize: number;
  private ttl: number;

  constructor(options: { max: number; ttl: number }) {
    this.maxSize = options.max;
    this.ttl = options.ttl;
  }

  get(key: K): V | undefined {
    const entry = this.cache.get(key);
    if (!entry) {
      return undefined;
    }

    // 检查是否过期
    if (Date.now() - entry.timestamp > this.ttl) {
      this.cache.delete(key);
      return undefined;
    }

    // 更新访问时间
    entry.timestamp = Date.now();
    return entry.value;
  }

  set(key: K, value: V): void {
    // 如果已存在，先删除再添加（保持最新访问顺序）
    if (this.cache.has(key)) {
      this.cache.delete(key);
    }

    // 如果超出容量，删除最旧的
    if (this.cache.size >= this.maxSize) {
      const oldest = this.cache.keys().next().value;
      if (oldest !== undefined) {
        this.cache.delete(oldest);
      }
    }

    this.cache.set(key, { value, timestamp: Date.now() });
  }

  has(key: K): boolean {
    return this.get(key) !== undefined;
  }

  clear(): void {
    this.cache.clear();
  }

  delete(key: K): boolean {
    return this.cache.delete(key);
  }
}

/**
 * 增强型 Java 方法解析器
 */
export class EnhancedJavaMethodParser {
  private static instance: EnhancedJavaMethodParser;

  // LRU 缓存：类名 -> 属性列表
  private typeCache = new LRUCache<string, ObjectProperty[]>({
    max: 500,
    ttl: 1000 * 60 * 10, // 10 分钟
  });

  // 文件缓存：文件路径 -> { mtime, properties }
  private fileCache = new Map<
    string,
    { mtime: number; properties: ObjectProperty[] }
  >();

  // 并发请求合并：类名 -> Promise
  private pendingRequests = new Map<string, Promise<ObjectProperty[]>>();

  // 循环引用检测
  private resolvingTypes = new Set<string>();

  private constructor() {}

  public static getInstance(): EnhancedJavaMethodParser {
    if (!EnhancedJavaMethodParser.instance) {
      EnhancedJavaMethodParser.instance = new EnhancedJavaMethodParser();
    }
    return EnhancedJavaMethodParser.instance;
  }

  // ============================================================================
  // 任务 1: @Param 注解解析
  // ============================================================================

  /**
   * 解析方法参数列表
   * 提取 @Param 注解值和参数类型信息
   *
   * @param methodSignature - 方法签名字符串
   * @returns JavaParameter 数组
   */
  public parseMethodParameters(methodSignature: string): JavaParameter[] {
    // 提取参数部分：从第一个 ( 到最后一个 )
    const paramsMatch = methodSignature.match(
      /\((.*)\)\s*(?:throws\s+[\w,\s]+)?\s*[;{]$/s,
    );
    if (!paramsMatch) {
      return [];
    }

    const paramsStr = paramsMatch[1].trim();
    if (!paramsStr) {
      return [];
    }

    return this.parseParameters(paramsStr);
  }

  /**
   * 解析参数字符串
   */
  private parseParameters(paramsStr: string): JavaParameter[] {
    const parameters: JavaParameter[] = [];
    const tokens = this.tokenizeParameters(paramsStr);
    let i = 0;

    while (i < tokens.length) {
      // 解析注解列表
      const annotations: string[] = [];
      while (i < tokens.length && tokens[i].startsWith("@")) {
        let annotation = tokens[i];
        i++;
        // 处理注解参数，如 @Param("id")
        if (i < tokens.length && tokens[i] === "(") {
          annotation += "(";
          i++;
          let parenDepth = 1;
          while (i < tokens.length && parenDepth > 0) {
            if (tokens[i] === "(") {
              parenDepth++;
            }
            if (tokens[i] === ")") {
              parenDepth--;
            }
            annotation += tokens[i];
            i++;
          }
        }
        annotations.push(annotation);
      }

      if (i >= tokens.length) {
        break;
      }

      // 解析类型和参数名
      const typeParts: string[] = [];
      let angleBracketDepth = 0;
      let squareBracketDepth = 0;

      while (i < tokens.length) {
        const token = tokens[i];

        if (token === "<") {
          angleBracketDepth++;
          typeParts.push(token);
        } else if (token === ">") {
          angleBracketDepth--;
          typeParts.push(token);
        } else if (token === "[") {
          squareBracketDepth++;
          typeParts.push(token);
        } else if (token === "]") {
          squareBracketDepth--;
          typeParts.push(token);
        } else if (
          token === "," &&
          angleBracketDepth === 0 &&
          squareBracketDepth === 0
        ) {
          break;
        } else if (
          token === " " &&
          angleBracketDepth === 0 &&
          squareBracketDepth === 0
        ) {
          typeParts.push(token);
        } else {
          typeParts.push(token);
        }

        i++;
      }

      // 分离类型和参数名
      const typeStrFull = typeParts.join("").trim();
      let paramName = "";
      let typeStr = "";

      // 从后向前查找参数名
      let trimmed = typeStrFull.trimEnd();

      // 检查是否以 ... 结尾（可变参数）
      let isVarArgs = false;
      if (trimmed.endsWith("...")) {
        isVarArgs = true;
        trimmed = trimmed.slice(0, -3).trimEnd();
      }

      // 检查是否以 [] 结尾（数组）
      let arraySuffix = "";
      while (trimmed.endsWith("]")) {
        const bracketStart = trimmed.lastIndexOf("[");
        if (bracketStart === -1) {
          break;
        }
        arraySuffix = trimmed.substring(bracketStart) + arraySuffix;
        trimmed = trimmed.substring(0, bracketStart).trimEnd();
      }

      // 查找参数名（最后一个单词）
      let lastAngleBracket = -1;
      let depth = 0;
      for (let j = trimmed.length - 1; j >= 0; j--) {
        if (trimmed[j] === ">") {
          depth++;
          if (lastAngleBracket === -1) {
            lastAngleBracket = j;
          }
        } else if (trimmed[j] === "<") {
          depth--;
        } else if (depth === 0 && trimmed[j] === " ") {
          const afterSpace = trimmed.substring(j + 1).trim();
          if (/^[a-zA-Z_]\w*$/.test(afterSpace)) {
            paramName = afterSpace;
            typeStr = trimmed.substring(0, j).trim();
            break;
          }
        }
      }

      // 如果没有找到，尝试简单分割
      if (!paramName) {
        const lastSpace = trimmed.lastIndexOf(" ");
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
        typeStr += "...";
      }

      // 提取 @Param 注解值
      const hasParamAnnotation = annotations.some((a) =>
        a.startsWith("@Param"),
      );
      let paramValue: string | undefined;

      if (hasParamAnnotation) {
        const paramAnnotation = annotations.find((a) => a.startsWith("@Param"));
        if (paramAnnotation) {
          // 支持多种格式：@Param("value")、@Param('value')、@Param(value)
          const valueMatch = paramAnnotation.match(
            /@Param\s*\(\s*["']?([^"')\s]+)["']?\s*\)/,
          );
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
          paramValue,
        });
      }

      // 跳过逗号
      if (i < tokens.length && tokens[i] === ",") {
        i++;
      }
    }

    return parameters;
  }

  /**
   * 将参数字符串分割为 token
   */
  private tokenizeParameters(paramsStr: string): string[] {
    const tokens: string[] = [];
    let current = "";
    let inString = false;
    let stringChar = "";

    for (let i = 0; i < paramsStr.length; i++) {
      const char = paramsStr[i];

      if (inString) {
        current += char;
        if (char === stringChar) {
          let backslashCount = 0;
          for (let j = current.length - 2; j >= 0 && current[j] === "\\"; j--) {
            backslashCount++;
          }
          if (backslashCount % 2 === 0) {
            inString = false;
            tokens.push(current);
            current = "";
          }
        }
      } else if (char === '"' || char === "'") {
        if (current) {
          tokens.push(current);
          current = "";
        }
        inString = true;
        stringChar = char;
        current = char;
      } else if ("<>(), ".includes(char)) {
        if (current) {
          tokens.push(current);
          current = "";
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

  // ============================================================================
  // 任务 2: 源码文件属性解析
  // ============================================================================

  /**
   * 根据类名查找源码文件
   *
   * @param className - 全限定类名（如 com.example.User）
   * @returns 源码文件路径，未找到返回 undefined
   */
  public async findSourceFile(className: string): Promise<string | undefined> {
    const workspaceFolders = vscode.workspace.workspaceFolders;
    if (!workspaceFolders) {
      return undefined;
    }

    // 从类名推导文件路径
    const relativePath = className.replace(/\./g, "/") + ".java";
    const simpleClassName = className.includes(".")
      ? className.substring(className.lastIndexOf(".") + 1)
      : className;

    // 搜索路径模式
    const searchPatterns = [
      `**/${relativePath}`,
      `**/src/main/java/${relativePath}`,
      `**/src/test/java/${relativePath}`,
      `**/java/${relativePath}`,
      `**/${simpleClassName}.java`,
    ];

    for (const folder of workspaceFolders) {
      for (const pattern of searchPatterns) {
        const files = await vscode.workspace.findFiles(
          new vscode.RelativePattern(folder, pattern),
          "**/target/**,**/build/**,**/node_modules/**",
          5,
        );

        for (const file of files) {
          // 验证包名匹配
          if (await this.verifyPackageName(file.fsPath, className)) {
            return file.fsPath;
          }
        }
      }
    }

    return undefined;
  }

  /**
   * 验证文件包名是否与类名匹配
   */
  private async verifyPackageName(
    filePath: string,
    className: string,
  ): Promise<boolean> {
    try {
      if (!className.includes(".")) {
        // 简单类名，不需要验证包
        return true;
      }

      const packageName = className.substring(0, className.lastIndexOf("."));
      const content = await fs.readFile(filePath, "utf-8");

      // 匹配 package 声明
      const packagePattern = new RegExp(
        `package\\s+${packageName.replace(/\./g, "\\.")}\\s*;`,
      );
      return packagePattern.test(content);
    } catch {
      return false;
    }
  }

  /**
   * 解析源码文件，提取属性列表
   *
   * @param filePath - Java 源文件路径
   * @returns 属性名列表
   */
  public async parseSourceFile(filePath: string): Promise<ObjectProperty[]> {
    // 检查文件缓存
    try {
      const stats = await fs.stat(filePath);
      const cached = this.fileCache.get(filePath);
      if (cached && cached.mtime === stats.mtimeMs) {
        return cached.properties;
      }
    } catch {
      return [];
    }

    try {
      const content = await fs.readFile(filePath, "utf-8");
      const properties = this.extractPropertiesFromSource(content);

      // 更新文件缓存
      const stats = await fs.stat(filePath);
      this.fileCache.set(filePath, { mtime: stats.mtimeMs, properties });

      return properties;
    } catch (error) {
      logger.error(`Failed to parse source file ${filePath}:`, error);
      return [];
    }
  }

  /**
   * 从源码内容中提取属性
   */
  private extractPropertiesFromSource(content: string): ObjectProperty[] {
    const properties = new Map<string, string>(); // name -> type

    // 检测 Lombok 注解
    const hasLombokData = /@Data\b/.test(content);
    const hasLombokGetter = /@Getter\b/.test(content);
    const useLombok = hasLombokData || hasLombokGetter;

    // 1. 提取字段（用于 Lombok 或作为备选）
    const fieldPattern =
      /(?:private|protected|public)\s+(?:static\s+)?(?:final\s+)?(?:transient\s+)?([\w<>,\s\[\]?]+)\s+(\w+)\s*;/g;
    let match;
    const fields: Array<{ name: string; type: string }> = [];

    while ((match = fieldPattern.exec(content)) !== null) {
      const fieldType = match[1].trim();
      const fieldName = match[2];
      fields.push({ name: fieldName, type: fieldType });

      if (useLombok) {
        // Lombok 类直接使用字段名作为属性
        properties.set(fieldName, fieldType);
      }
    }

    // 2. 提取 getter 方法并推断类型
    const getterPattern = /public\s+([\w<>,\s\[\]?]+)\s+get(\w+)\s*\(/g;
    while ((match = getterPattern.exec(content)) !== null) {
      const returnType = match[1].trim();
      const propName = match[2].charAt(0).toLowerCase() + match[2].slice(1);
      properties.set(propName, returnType);
    }

    // 3. 提取 boolean 类型的 isXxx 方法
    const booleanGetterPattern = /public\s+boolean\s+is(\w+)\s*\(/g;
    while ((match = booleanGetterPattern.exec(content)) !== null) {
      const propName = match[1].charAt(0).toLowerCase() + match[1].slice(1);
      properties.set(propName, "boolean");
    }

    // 4. 如果没有找到任何属性且不是 Lombok 类，尝试从字段推断
    if (properties.size === 0 && !useLombok) {
      for (const field of fields) {
        properties.set(field.name, field.type);
      }
    }

    // 转换为 ObjectProperty 数组
    return Array.from(properties.entries()).map(([name, type]) => ({
      name,
      type,
    }));
  }

  // ============================================================================
  // 任务 3: javap 属性解析
  // ============================================================================

  /**
   * 根据类名查找 class 文件
   *
   * @param className - 全限定类名
   * @returns class 文件路径，未找到返回 undefined
   */
  public async findClassFile(className: string): Promise<string | undefined> {
    const workspaceFolders = vscode.workspace.workspaceFolders;
    if (!workspaceFolders) {
      return undefined;
    }

    const relativePath = className.replace(/\./g, "/") + ".class";

    // 搜索路径优先级
    const searchPaths = [
      `target/classes/${relativePath}`,
      `build/classes/java/main/${relativePath}`,
      `bin/${relativePath}`,
      `out/production/classes/${relativePath}`,
    ];

    // 1. 在项目编译输出中查找
    for (const folder of workspaceFolders) {
      for (const searchPath of searchPaths) {
        const fullPath = path.join(folder.uri.fsPath, searchPath);
        try {
          await fs.access(fullPath);
          return fullPath;
        } catch {
          // 继续查找
        }
      }
    }

    // 2. 在 Maven 本地仓库中查找
    const mavenRepoPath = await this.findInMavenRepo(className);
    if (mavenRepoPath) {
      return mavenRepoPath;
    }

    return undefined;
  }

  /**
   * 在 Maven 本地仓库中查找类
   */
  private async findInMavenRepo(
    className: string,
  ): Promise<string | undefined> {
    const homeDir = process.env.HOME || process.env.USERPROFILE;
    if (!homeDir) {
      return undefined;
    }

    const mavenRepo = path.join(homeDir, ".m2", "repository");
    const relativePath = className.replace(/\./g, "/") + ".class";

    // 尝试直接查找
    const fullPath = path.join(mavenRepo, relativePath);
    try {
      await fs.access(fullPath);
      return fullPath;
    } catch {
      // 类可能在 JAR 包中，返回 JAR 路径和类名
      return this.findClassInJar(className, mavenRepo);
    }
  }

  /**
   * 在 JAR 包中查找类
   */
  private async findClassInJar(
    className: string,
    searchDir: string,
  ): Promise<string | undefined> {
    // 简化实现：实际项目中可能需要扫描 JAR 文件
    // 这里返回 undefined，让调用方处理
    return undefined;
  }

  /**
   * 使用 javap 解析 class 文件
   *
   * @param classFilePath - class 文件路径
   * @returns 属性信息数组
   */
  public async parseWithJavap(
    classFilePath: string,
  ): Promise<ObjectProperty[]> {
    // 验证路径安全性
    if (!this.isValidClassPath(classFilePath)) {
      logger.warn(`Invalid class file path: ${classFilePath}`);
      return [];
    }

    try {
      // 使用 javap -p -public 获取公共成员
      const { stdout } = await execFileAsync(
        "javap",
        ["-p", "-public", classFilePath],
        {
          timeout: 3000, // 3 秒超时
          maxBuffer: 1024 * 1024, // 1MB 输出限制
        },
      );

      return this.parseJavapOutput(stdout);
    } catch (error) {
      // javap 不可用或执行失败，静默返回空列表
      logger.debug(`javap failed for ${classFilePath}:`, error);
      return [];
    }
  }

  /**
   * 验证 class 文件路径是否合法
   */
  private isValidClassPath(classPath: string): boolean {
    // 防止路径遍历攻击
    const normalized = path.normalize(classPath);

    // 只允许 .class 文件
    if (!normalized.endsWith(".class")) {
      return false;
    }

    // 检查是否包含非法字符
    const illegalChars = /[;&|`$(){}[\]\\*?<>]/;
    if (illegalChars.test(classPath)) {
      return false;
    }

    return true;
  }

  /**
   * 解析 javap 输出
   */
  private parseJavapOutput(output: string): ObjectProperty[] {
    const properties = new Map<string, string>(); // name -> type
    const lines = output.split("\n");

    for (const line of lines) {
      const trimmed = line.trim();

      // 解析字段：private java.lang.String name;
      const fieldMatch = trimmed.match(
        /^(?:private|protected|public)\s+([\w<>,\s\[\]]+)\s+(\w+)\s*;$/,
      );
      if (fieldMatch) {
        const fieldType = fieldMatch[1].trim();
        const fieldName = fieldMatch[2];
        properties.set(fieldName, fieldType);
        continue;
      }

      // 解析 getter 方法：public java.lang.String getName();
      const getterMatch = trimmed.match(
        /public\s+([\w<>,\s\[\]]+)\s+get(\w+)\s*\(\s*\)/,
      );
      if (getterMatch) {
        const returnType = getterMatch[1].trim();
        const propName =
          getterMatch[2].charAt(0).toLowerCase() + getterMatch[2].slice(1);
        properties.set(propName, returnType);
        continue;
      }

      // 解析 boolean getter：public boolean isActive();
      const booleanGetterMatch = trimmed.match(
        /public\s+boolean\s+is(\w+)\s*\(\s*\)/,
      );
      if (booleanGetterMatch) {
        const propName =
          booleanGetterMatch[1].charAt(0).toLowerCase() +
          booleanGetterMatch[1].slice(1);
        properties.set(propName, "boolean");
      }
    }

    // 转换为 ObjectProperty 数组
    return Array.from(properties.entries()).map(([name, type]) => ({
      name,
      type,
    }));
  }

  // ============================================================================
  // 任务 4: 整合 getObjectProperties 并添加缓存
  // ============================================================================

  /**
   * 获取对象的属性列表
   * 整合三种解析方式：内存缓存 -> 源码解析 -> javap 解析
   *
   * @param className - 类名（全限定名或简单名）
   * @returns 属性信息数组
   */
  public async getObjectProperties(
    className: string,
  ): Promise<ObjectProperty[]> {
    // 基本类型直接返回空数组
    if (this.isBasicType(className)) {
      return [];
    }

    // 处理泛型类型：List<User> -> User
    const genericType = this.extractGenericType(className);
    if (genericType && genericType !== className) {
      return this.getObjectProperties(genericType);
    }

    // 处理数组类型：User[] -> User
    const arrayElementType = this.extractArrayElementType(className);
    if (arrayElementType) {
      return this.getObjectProperties(arrayElementType);
    }

    // 标准化类名
    const normalizedClassName = this.normalizeClassName(className);

    // 1. 检查内存缓存
    const cached = this.typeCache.get(normalizedClassName);
    if (cached) {
      logger.debug(`Cache hit for ${normalizedClassName}`);
      return cached;
    }

    // 2. 合并并发请求
    if (this.pendingRequests.has(normalizedClassName)) {
      logger.debug(`Reusing pending request for ${normalizedClassName}`);
      return this.pendingRequests.get(normalizedClassName)!;
    }

    // 3. 检测循环引用
    if (this.resolvingTypes.has(normalizedClassName)) {
      logger.warn(`Circular reference detected for ${normalizedClassName}`);
      return [];
    }

    // 创建新的解析请求
    const requestPromise = this.doGetObjectProperties(normalizedClassName);
    this.pendingRequests.set(normalizedClassName, requestPromise);

    try {
      const result = await requestPromise;
      return result;
    } finally {
      this.pendingRequests.delete(normalizedClassName);
    }
  }

  /**
   * 实际执行属性获取
   */
  private async doGetObjectProperties(
    className: string,
  ): Promise<ObjectProperty[]> {
    this.resolvingTypes.add(className);

    try {
      // 1. 尝试源码解析（最准确）
      const sourceFile = await this.findSourceFile(className);
      if (sourceFile) {
        const props = await this.parseSourceFile(sourceFile);
        if (props.length > 0) {
          this.typeCache.set(className, props);
          logger.debug(
            `Source parsed ${className}: ${props.length} properties`,
          );
          return props;
        }
      }

      // 2. 尝试 javap 解析（适用于 JAR 中的类）
      const classFile = await this.findClassFile(className);
      if (classFile) {
        const props = await this.parseWithJavap(classFile);
        if (props.length > 0) {
          this.typeCache.set(className, props);
          logger.debug(`Javap parsed ${className}: ${props.length} properties`);
          return props;
        }
      }

      // 3. 都失败，返回空并缓存（防止重复失败查询）
      this.typeCache.set(className, []);
      logger.debug(`No properties found for ${className}`);
      return [];
    } finally {
      this.resolvingTypes.delete(className);
    }
  }

  /**
   * 判断是否是基本类型
   */
  private isBasicType(type: string): boolean {
    const basicTypes = [
      "String",
      "Integer",
      "Long",
      "Boolean",
      "Double",
      "Float",
      "int",
      "long",
      "boolean",
      "double",
      "float",
      "byte",
      "short",
      "char",
      "BigDecimal",
      "BigInteger",
      "Date",
      "LocalDate",
      "LocalDateTime",
      "LocalTime",
      "Instant",
      "UUID",
      "Object",
    ];

    // 处理泛型
    const baseType = type.replace(/<.*>$/, "");

    return (
      basicTypes.includes(baseType) ||
      type.startsWith("java.lang.") ||
      type.startsWith("java.math.") ||
      type.startsWith("java.time.") ||
      type.startsWith("java.util.UUID")
    );
  }

  /**
   * 从泛型类型中提取实际类型
   * List<User> -> User
   */
  private extractGenericType(type: string): string | undefined {
    // 匹配泛型参数：List<User>, Map<String, User>, etc.
    const match = type.match(/<([^>]+)>/);
    if (!match) {
      return undefined;
    }

    const genericContent = match[1].trim();

    // 对于 Map，返回 value 类型
    if (type.startsWith("Map<") || type.startsWith("java.util.Map<")) {
      const parts = genericContent.split(",");
      if (parts.length >= 2) {
        return parts[1].trim();
      }
    }

    // 对于其他类型（List, Set, Collection等），返回第一个泛型参数
    return genericContent.split(",")[0].trim();
  }

  /**
   * 从数组类型中提取元素类型
   * User[] -> User
   */
  private extractArrayElementType(type: string): string | undefined {
    if (type.endsWith("[]")) {
      return type.slice(0, -2);
    }
    return undefined;
  }

  /**
   * 标准化类名
   */
  private normalizeClassName(className: string): string {
    // 移除泛型
    return className.replace(/<.*>$/, "").trim();
  }

  // ============================================================================
  // 工具方法
  // ============================================================================

  /**
   * 清除所有缓存
   */
  public clearCache(): void {
    this.typeCache.clear();
    this.fileCache.clear();
    this.pendingRequests.clear();
    this.resolvingTypes.clear();
    logger.debug("EnhancedJavaMethodParser cache cleared");
  }

  /**
   * 使指定类型的缓存失效
   */
  public invalidateCache(className: string): void {
    const normalized = this.normalizeClassName(className);
    this.typeCache.delete(normalized);
    logger.debug(`Cache invalidated for ${normalized}`);
  }

  /**
   * 获取缓存统计
   */
  public getCacheStats(): {
    typeCacheSize: number;
    fileCacheSize: number;
    pendingRequests: number;
  } {
    return {
      typeCacheSize: this.typeCache["cache"]?.size || 0,
      fileCacheSize: this.fileCache.size,
      pendingRequests: this.pendingRequests.size,
    };
  }
}

// 导出单例
export const enhancedJavaMethodParser = EnhancedJavaMethodParser.getInstance();
