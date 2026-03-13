/**
 * DTD 解析器服务
 * 实现 DTD 加载链和标签层次结构解析
 * 
 * 使用策略模式实现多种 DTD 加载器
 * 使用责任链模式组织加载器优先级
 * 
 * @author MyBatis Helper Team
 * @version 1.0.0
 */

import * as vscode from 'vscode';
import * as fs from 'fs/promises';
import * as path from 'path';
import * as os from 'os';
import * as crypto from 'crypto';
import { logger } from '../../utils/logger';
import { HttpClient } from '../../utils/httpClient';
import {
    IDtdLoader,
    DtdLoaderResult,
    TagHierarchy,
    TagHierarchyMap
} from '../types';

/**
 * DTD 文件 URL
 */
const MYBATIS_DTD_URL = 'http://mybatis.org/dtd/mybatis-3-mapper.dtd';

/**
 * 内置标签层次结构数据
 * 用于离线环境作为最终回退
 */
const BUILT_IN_TAG_HIERARCHY: TagHierarchyMap = new Map([
    ['mapper', {
        tagName: 'mapper',
        allowedChildren: ['cache', 'cache-ref', 'resultMap', 'sql', 'insert', 'update', 'delete', 'select'],
        allowedParents: [],
        requiredAttributes: ['namespace'],
        optionalAttributes: [],
        canHaveText: false,
        canHaveSql: false
    }],
    ['resultMap', {
        tagName: 'resultMap',
        allowedChildren: ['constructor', 'id', 'result', 'association', 'collection', 'discriminator'],
        allowedParents: ['mapper'],
        requiredAttributes: ['id', 'type'],
        optionalAttributes: ['extends', 'autoMapping'],
        canHaveText: false,
        canHaveSql: false
    }],
    ['sql', {
        tagName: 'sql',
        allowedChildren: ['include', 'bind', 'if', 'choose', 'where', 'set', 'foreach', 'trim'],
        allowedParents: ['mapper'],
        requiredAttributes: ['id'],
        optionalAttributes: ['databaseId', 'lang'],
        canHaveText: true,
        canHaveSql: true
    }],
    ['insert', {
        tagName: 'insert',
        allowedChildren: ['selectKey', 'include', 'bind', 'if', 'choose', 'where', 'set', 'foreach', 'trim'],
        allowedParents: ['mapper'],
        requiredAttributes: ['id'],
        optionalAttributes: ['parameterType', 'parameterMap', 'timeout', 'fetchSize', 
            'statementType', 'useGeneratedKeys', 'keyProperty', 'keyColumn', 
            'databaseId', 'lang', 'resultType', 'resultMap', 'flushCache', 
            'useCache'],
        canHaveText: true,
        canHaveSql: true
    }],
    ['update', {
        tagName: 'update',
        allowedChildren: ['include', 'bind', 'if', 'choose', 'where', 'set', 'foreach', 'trim'],
        allowedParents: ['mapper'],
        requiredAttributes: ['id'],
        optionalAttributes: ['parameterType', 'parameterMap', 'timeout', 'fetchSize', 
            'statementType', 'useGeneratedKeys', 'keyProperty', 'keyColumn', 
            'databaseId', 'lang', 'flushCache'],
        canHaveText: true,
        canHaveSql: true
    }],
    ['delete', {
        tagName: 'delete',
        allowedChildren: ['include', 'bind', 'if', 'choose', 'where', 'set', 'foreach', 'trim'],
        allowedParents: ['mapper'],
        requiredAttributes: ['id'],
        optionalAttributes: ['parameterType', 'parameterMap', 'timeout', 'fetchSize', 
            'statementType', 'databaseId', 'lang', 'flushCache'],
        canHaveText: true,
        canHaveSql: true
    }],
    ['select', {
        tagName: 'select',
        allowedChildren: ['include', 'bind', 'if', 'choose', 'where', 'set', 'foreach', 'trim'],
        allowedParents: ['mapper'],
        requiredAttributes: ['id'],
        optionalAttributes: ['parameterType', 'parameterMap', 'resultType', 'resultMap', 
            'timeout', 'fetchSize', 'statementType', 'resultSetType', 'databaseId', 
            'lang', 'flushCache', 'useCache', 'cacheNamespace'],
        canHaveText: true,
        canHaveSql: true
    }],
    ['selectKey', {
        tagName: 'selectKey',
        allowedChildren: [],
        allowedParents: ['insert'],
        requiredAttributes: ['keyProperty'],
        optionalAttributes: ['keyColumn', 'resultType', 'statementType', 
            'databaseId', 'lang', 'order', 'before'],
        canHaveText: true,
        canHaveSql: true
    }],
    ['if', {
        tagName: 'if',
        allowedChildren: ['include', 'bind', 'if', 'choose', 'where', 'set', 'foreach', 'trim'],
        allowedParents: ['sql', 'insert', 'update', 'delete', 'select', 'if', 
            'when', 'where', 'set', 'foreach', 'trim'],
        requiredAttributes: ['test'],
        optionalAttributes: [],
        canHaveText: true,
        canHaveSql: true
    }],
    ['choose', {
        tagName: 'choose',
        allowedChildren: ['when', 'otherwise'],
        allowedParents: ['sql', 'insert', 'update', 'delete', 'select', 'if', 
            'when', 'where', 'set', 'foreach', 'trim'],
        requiredAttributes: [],
        optionalAttributes: [],
        canHaveText: false,
        canHaveSql: false
    }],
    ['when', {
        tagName: 'when',
        allowedChildren: ['include', 'bind', 'if', 'choose', 'where', 'set', 'foreach', 'trim'],
        allowedParents: ['choose'],
        requiredAttributes: ['test'],
        optionalAttributes: [],
        canHaveText: true,
        canHaveSql: true
    }],
    ['otherwise', {
        tagName: 'otherwise',
        allowedChildren: ['include', 'bind', 'if', 'choose', 'where', 'set', 'foreach', 'trim'],
        allowedParents: ['choose'],
        requiredAttributes: [],
        optionalAttributes: [],
        canHaveText: true,
        canHaveSql: true
    }],
    ['where', {
        tagName: 'where',
        allowedChildren: ['include', 'bind', 'if', 'choose', 'foreach', 'trim'],
        allowedParents: ['sql', 'insert', 'update', 'delete', 'select', 'if', 
            'when', 'where', 'set', 'foreach', 'trim'],
        requiredAttributes: [],
        optionalAttributes: [],
        canHaveText: false,
        canHaveSql: true
    }],
    ['set', {
        tagName: 'set',
        allowedChildren: ['include', 'bind', 'if', 'choose', 'foreach', 'trim'],
        allowedParents: ['update'],
        requiredAttributes: [],
        optionalAttributes: [],
        canHaveText: false,
        canHaveSql: true
    }],
    ['trim', {
        tagName: 'trim',
        allowedChildren: ['include', 'bind', 'if', 'choose', 'foreach'],
        allowedParents: ['sql', 'insert', 'update', 'delete', 'select', 'if', 
            'when', 'where', 'set', 'foreach', 'trim'],
        requiredAttributes: [],
        optionalAttributes: ['prefix', 'suffix', 'prefixOverrides', 'suffixOverrides'],
        canHaveText: false,
        canHaveSql: true
    }],
    ['foreach', {
        tagName: 'foreach',
        allowedChildren: ['include', 'bind', 'if', 'choose'],
        allowedParents: ['sql', 'insert', 'update', 'delete', 'select', 'if', 
            'when', 'where', 'set', 'foreach', 'trim'],
        requiredAttributes: ['collection'],
        optionalAttributes: ['item', 'index', 'open', 'close', 'separator'],
        canHaveText: true,
        canHaveSql: true
    }],
    ['bind', {
        tagName: 'bind',
        allowedChildren: [],
        allowedParents: ['sql', 'insert', 'update', 'delete', 'select', 'if', 
            'when', 'where', 'set', 'foreach', 'trim'],
        requiredAttributes: ['name', 'value'],
        optionalAttributes: [],
        canHaveText: false,
        canHaveSql: false
    }],
    ['include', {
        tagName: 'include',
        allowedChildren: ['property'],
        allowedParents: ['sql', 'insert', 'update', 'delete', 'select', 'if', 
            'when', 'where', 'set', 'foreach', 'trim'],
        requiredAttributes: ['refid'],
        optionalAttributes: [],
        canHaveText: false,
        canHaveSql: false
    }],
    ['selectKey', {
        tagName: 'selectKey',
        allowedChildren: [],
        allowedParents: ['insert'],
        requiredAttributes: ['keyProperty'],
        optionalAttributes: ['keyColumn', 'resultType', 'statementType', 
            'databaseId', 'lang', 'order', 'before'],
        canHaveText: true,
        canHaveSql: true
    }]
]);

/**
 * 网络 DTD 加载器
 * 从网络下载 DTD 文件
 */
class NetworkDtdLoader implements IDtdLoader {
    
    canLoad(dtdPath: string): boolean {
        return dtdPath.startsWith('http://') || dtdPath.startsWith('https://');
    }
    
    async load(dtdPath: string): Promise<DtdLoaderResult> {
        logger.info('Loading DTD from network:', { dtdPath });
        
        try {
            const httpClient = HttpClient.getInstance();
            const content = await httpClient.getText(dtdPath, {
                headers: {
                    'Accept': 'application/xml-dtd, text/plain, */*'
                },
                timeout: 15000
            });
            
            logger.info('DTD loaded from network successfully');
            return {
                success: true,
                content,
                loaderType: 'network'
            };
        } catch (error) {
            logger.error('Failed to load DTD from network:', error);
            return {
                success: false,
                error: error instanceof Error ? error.message : String(error),
                loaderType: 'network'
            };
        }
    }
}

/**
 * 本地文件 DTD 加载器
 * 从本地文件系统加载 DTD
 */
class LocalFileDtdLoader implements IDtdLoader {
    
    canLoad(dtdPath: string): boolean {
        return dtdPath.startsWith('file://') || path.isAbsolute(dtdPath);
    }
    
    async load(dtdPath: string): Promise<DtdLoaderResult> {
        logger.info('Loading DTD from local file:', { dtdPath });
        
        try {
            const filePath = dtdPath.startsWith('file://') 
                ? dtdPath.substring(7) 
                : dtdPath;
            
            const content = await fs.readFile(filePath, 'utf-8');
            
            logger.info('DTD loaded from local file successfully');
            return {
                success: true,
                content,
                loaderType: 'localFile'
            };
        } catch (error) {
            logger.error('Failed to load DTD from local file:', error);
            return {
                success: false,
                error: error instanceof Error ? error.message : String(error),
                loaderType: 'localFile'
            };
        }
    }
}

/**
 * 内置 DTD 加载器
 * 提供内置的标签层次结构
 */
class BuiltinDtdLoader implements IDtdLoader {
    
    canLoad(_dtdPath: string): boolean {
        // 始终可以作为回退
        return true;
    }
    
    async load(_dtdPath: string): Promise<DtdLoaderResult> {
        logger.info('Using built-in DTD');
        
        // 返回空内容，表示使用内置数据
        return {
            success: true,
            content: '',
            loaderType: 'builtin'
        };
    }
}

/**
 * 缓存 DTD 加载器
 * 管理 DTD 文件的本地缓存
 */
class CacheDtdLoader implements IDtdLoader {
    private cacheDir: string;
    private initialized: boolean = false;
    
    constructor(baseCacheDir: string) {
        this.cacheDir = path.join(baseCacheDir, 'dtd-cache');
    }
    
    async initialize(): Promise<void> {
        if (this.initialized) {
            return;
        }
        
        try {
            await fs.mkdir(this.cacheDir, { recursive: true });
            this.initialized = true;
            logger.debug('DTD cache directory initialized:', this.cacheDir);
        } catch (error) {
            logger.error('Failed to create DTD cache directory:', error);
        }
    }
    
    canLoad(dtdPath: string): boolean {
        // 检查缓存中是否存在（同步检查）
        if (!this.initialized) {
            return false;
        }
        
        const cacheKey = this.getCacheKey(dtdPath);
        const cachePath = path.join(this.cacheDir, cacheKey);
        
        try {
            // 使用 sync 方法进行同步检查
            require('fs').accessSync(cachePath);
            return true;
        } catch {
            return false;
        }
    }
    
    async load(dtdPath: string): Promise<DtdLoaderResult> {
        const cacheKey = this.getCacheKey(dtdPath);
        const cachePath = path.join(this.cacheDir, cacheKey);
        
        logger.info('Loading DTD from cache:', { cachePath });
        
        try {
            const content = await fs.readFile(cachePath, 'utf-8');
            
            logger.info('DTD loaded from cache successfully');
            return {
                success: true,
                content,
                loaderType: 'cache'
            };
        } catch (error) {
            logger.error('Failed to load DTD from cache:', error);
            return {
                success: false,
                error: error instanceof Error ? error.message : String(error),
                loaderType: 'cache'
            };
        }
    }
    
    /**
     * 保存 DTD 到缓存
     */
    async saveToCache(dtdPath: string, content: string): Promise<void> {
        await this.initialize();
        
        const cacheKey = this.getCacheKey(dtdPath);
        const cachePath = path.join(this.cacheDir, cacheKey);
        
        try {
            await fs.writeFile(cachePath, content, 'utf-8');
            logger.debug('DTD saved to cache:', cachePath);
        } catch (error) {
            logger.error('Failed to save DTD to cache:', error);
        }
    }
    
    /**
     * 生成缓存键
     */
    private getCacheKey(dtdPath: string): string {
        return crypto.createHash('md5').update(dtdPath).digest('hex') + '.dtd';
    }
}

/**
 * 标签层次结构解析器
 * 使用责任链模式组合多个 DTD 加载器
 */
export class TagHierarchyResolver {
    private static instance: TagHierarchyResolver;
    private loaders: IDtdLoader[] = [];
    private cacheLoader: CacheDtdLoader | undefined;
    private baseCacheDir: string = '';
    private initialized: boolean = false;
    
    private constructor() {}
    
    /**
     * 获取单例实例
     */
    public static getInstance(): TagHierarchyResolver {
        if (!TagHierarchyResolver.instance) {
            TagHierarchyResolver.instance = new TagHierarchyResolver();
        }
        return TagHierarchyResolver.instance;
    }
    
    /**
     * 初始化解析器
     * @param baseCacheDir 基础缓存目录
     */
    async initialize(baseCacheDir: string): Promise<void> {
        if (this.initialized) {
            return;
        }
        
        this.baseCacheDir = baseCacheDir;
        
        // 初始化缓存加载器
        this.cacheLoader = new CacheDtdLoader(baseCacheDir);
        await this.cacheLoader.initialize();
        
        // 按优先级设置加载器链
        // 1. 本地文件（优先级最高）
        // 2. 缓存
        // 3. 网络
        // 4. 内置（最终回退）
        this.loaders = [
            new LocalFileDtdLoader(),
            this.cacheLoader,
            new NetworkDtdLoader(),
            new BuiltinDtdLoader()
        ];
        
        this.initialized = true;
        
        logger.debug('TagHierarchyResolver initialized with loaders:', {
            loaders: this.loaders.map(l => l.constructor.name)
        });
    }
    
    /**
     * 解析标签层次结构
     * @param dtdPath DTD 文件路径（可选，默认使用 MyBatis 官方 DTD）
     */
    async resolveTagHierarchy(dtdPath?: string): Promise<TagHierarchyMap> {
        if (!this.initialized) {
            throw new Error('TagHierarchyResolver not initialized. Call initialize() first.');
        }
        
        const targetPath = dtdPath || MYBATIS_DTD_URL;
        
        // 按优先级尝试加载器
        for (const loader of this.loaders) {
            if (!loader.canLoad(targetPath)) {
                continue;
            }
            
            const result = await loader.load(targetPath);
            
            if (result.success) {
                // 如果是网络加载，保存到缓存
                if (result.loaderType === 'network' && result.content && this.cacheLoader) {
                    await this.cacheLoader.saveToCache(targetPath, result.content);
                }
                
                // 解析 DTD 内容
                if (result.content && result.loaderType !== 'builtin') {
                    return this.parseDtdToHierarchy(result.content);
                }
                
                // 使用内置数据
                if (result.loaderType === 'builtin') {
                    return new Map(BUILT_IN_TAG_HIERARCHY);
                }
            }
        }
        
        // 所有加载器都失败，使用内置数据作为最终回退
        logger.warn('All DTD loaders failed, using built-in tag hierarchy');
        return new Map(BUILT_IN_TAG_HIERARCHY);
    }
    
    /**
     * 解析 DTD 内容为标签层次结构
     * @param dtdContent DTD 内容
     */
    private parseDtdToHierarchy(dtdContent: string): TagHierarchyMap {
        // 简化实现：解析 DTD 中的元素定义
        const hierarchy: TagHierarchyMap = new Map();
        
        // 匹配元素定义：<!ELEMENT elementName (contentModel)>
        const elementRegex = /<!ELEMENT\s+(\w+)\s+\(([^)]+)\)>/gi;
        
        for (const match of dtdContent.matchAll(elementRegex)) {
            const tagName = match[1];
            const contentModel = match[2].trim();
            
            // 解析内容模型，提取允许的子元素
            const allowedChildren = this.parseContentModel(contentModel);
            
            hierarchy.set(tagName, {
                tagName,
                allowedChildren,
                allowedParents: [], // 需要反向计算
                requiredAttributes: [],
                optionalAttributes: [],
                canHaveText: contentModel.includes('#PCDATA'),
                canHaveSql: ['select', 'insert', 'update', 'delete', 'sql'].includes(tagName)
            });
        }
        
        // 计算允许的父元素（反向关系）
        this.calculateParentRelationships(hierarchy);
        
        return hierarchy;
    }
    
    /**
     * 解析内容模型，提取子元素
     */
    private parseContentModel(contentModel: string): string[] {
        if (contentModel === 'EMPTY' || contentModel === 'ANY') {
            return [];
        }
        
        // 提取元素名称（移除修饰符如 ?, *, +）
        const elementRegex = /(\w+)/g;
        const elements: string[] = [];
        
        for (const match of contentModel.matchAll(elementRegex)) {
            const element = match[1];
            if (element !== 'PCDATA') {
                elements.push(element);
            }
        }
        
        return [...new Set(elements)]; // 去重
    }
    
    /**
     * 计算父元素关系
     */
    private calculateParentRelationships(hierarchy: TagHierarchyMap): void {
        for (const [parentName, parentInfo] of hierarchy) {
            for (const childName of parentInfo.allowedChildren) {
                const childInfo = hierarchy.get(childName);
                if (childInfo) {
                    if (!childInfo.allowedParents.includes(parentName)) {
                        childInfo.allowedParents.push(parentName);
                    }
                }
            }
        }
    }
}

// 导出单例实例
export const tagHierarchyResolver = TagHierarchyResolver.getInstance();
