/**
 * 模板引擎服务
 * 使用策略模式支持多种模板类型
 * 
 * @author MyBatis Helper Team
 * @version 1.0.0
 */

import { logger } from '../../utils/logger';
import { camelToSnakeCase, removePrefix } from '../../utils/stringUtils';
import {
    ITemplateEngine,
    TemplateType,
    TemplateContext,
    TemplateRenderResult,
    JavaParameter
} from '../types';

/**
 * XML 字符转义
 * 将特殊字符转换为 XML 实体
 * 优化：先检查是否需要转义，避免不必要的字符串创建
 */
function escapeXml(str: string): string {
    if (!str) return str;
    
    // 快速检查：如果字符串中没有需要转义的字符，直接返回
    // 这避免了创建 5 个中间字符串的开销
    if (!/[&<>"']/.test(str)) {
        return str;
    }
    
    return str
        .replace(/&/g, '&amp;')
        .replace(/</g, '&lt;')
        .replace(/>/g, '&gt;')
        .replace(/"/g, '&quot;')
        .replace(/'/g, '&apos;');
}

/**
 * 模板策略接口
 */
interface TemplateStrategy {
    readonly templateType: TemplateType;
    render(context: TemplateContext): string;
    validateContext(context: TemplateContext): { valid: boolean; error?: string };
}

/**
 * Mapper XML 模板策略
 */
class MapperXmlTemplateStrategy implements TemplateStrategy {
    readonly templateType = TemplateType.MAPPER_XML;
    
    render(context: TemplateContext): string {
        const namespace = escapeXml(context.namespace || 'com.example.mapper');
        return `<?xml version="1.0" encoding="UTF-8" ?>
<!DOCTYPE mapper
  PUBLIC "-//mybatis.org//DTD Mapper 3.0//EN"
  "http://mybatis.org/dtd/mybatis-3-mapper.dtd">
<mapper namespace="${namespace}">
    
</mapper>`;
    }
    
    validateContext(context: TemplateContext): { valid: boolean; error?: string } {
        return { valid: true };
    }
}

/**
 * SQL 语句模板基类
 */
abstract class SqlStatementTemplateStrategy implements TemplateStrategy {
    abstract readonly templateType: TemplateType;
    
    abstract render(context: TemplateContext): string;
    
    validateContext(context: TemplateContext): { valid: boolean; error?: string } {
        if (!context.methodName) {
            return { valid: false, error: 'methodName is required' };
        }
        return { valid: true };
    }
    
    protected renderParameters(parameters?: JavaParameter[]): string {
        if (!parameters || parameters.length === 0) {
            return '';
        }
        
        if (parameters.length === 1) {
            // 对类型名进行 XML 转义，处理泛型中的 < >
            const escapedType = escapeXml(parameters[0].type);
            return ` parameterType="${escapedType}"`;
        }
        
        return '';
    }
    
    protected renderResultType(returnType?: string): string {
        if (!returnType || returnType === 'void') {
            return '';
        }
        // 对返回类型进行 XML 转义
        const escapedType = escapeXml(returnType);
        return ` resultType="${escapedType}"`;
    }
}

/**
 * Select 语句模板策略
 */
class SelectTemplateStrategy extends SqlStatementTemplateStrategy {
    readonly templateType = TemplateType.SELECT_METHOD;
    
    render(context: TemplateContext): string {
        const methodName = escapeXml(context.methodName || '');
        const paramsStr = this.renderParameters(context.parameters);
        const resultStr = this.renderResultType(context.returnType);
        const tableName = this.convertToTableName(context.methodName || '');
        
        return `    <select id="${methodName}"${paramsStr}${resultStr}>
        SELECT * FROM ${tableName}
        WHERE 
    </select>`;
    }
    
    private convertToTableName(methodName: string): string {
        const prefixes = ['select', 'find', 'get', 'query', 'search', 'list'];
        let tableName = methodName;
        
        for (const prefix of prefixes) {
            const removed = removePrefix(tableName, prefix, true);
            if (removed !== tableName) {
                tableName = removed;
                break;
            }
        }
        
        const finalName = tableName || methodName;
        return camelToSnakeCase(finalName);
    }
}

/**
 * Insert 语句模板策略
 */
class InsertTemplateStrategy extends SqlStatementTemplateStrategy {
    readonly templateType = TemplateType.INSERT_METHOD;
    
    render(context: TemplateContext): string {
        const methodName = escapeXml(context.methodName || '');
        const paramsStr = this.renderParameters(context.parameters);
        const tableName = this.inferTableName(context.methodName || '');
        
        return `    <insert id="${methodName}"${paramsStr}>
        INSERT INTO ${tableName} (
            
        ) VALUES (
            
        )
    </insert>`;
    }
    
    private inferTableName(methodName: string): string {
        const tableName = removePrefix(methodName, 'insert', true);
        return camelToSnakeCase(tableName || methodName);
    }
}

/**
 * Update 语句模板策略
 */
class UpdateTemplateStrategy extends SqlStatementTemplateStrategy {
    readonly templateType = TemplateType.UPDATE_METHOD;
    
    render(context: TemplateContext): string {
        const methodName = escapeXml(context.methodName || '');
        const paramsStr = this.renderParameters(context.parameters);
        const tableName = this.inferTableName(context.methodName || '');
        
        return `    <update id="${methodName}"${paramsStr}>
        UPDATE ${tableName}
        <set>
            
        </set>
        WHERE 
    </update>`;
    }
    
    private inferTableName(methodName: string): string {
        const tableName = removePrefix(methodName, 'update', true);
        return camelToSnakeCase(tableName || methodName);
    }
}

/**
 * Delete 语句模板策略
 */
class DeleteTemplateStrategy extends SqlStatementTemplateStrategy {
    readonly templateType = TemplateType.DELETE_METHOD;
    
    render(context: TemplateContext): string {
        const methodName = escapeXml(context.methodName || '');
        const paramsStr = this.renderParameters(context.parameters);
        const tableName = this.inferTableName(context.methodName || '');
        
        return `    <delete id="${methodName}"${paramsStr}>
        DELETE FROM ${tableName}
        WHERE 
    </delete>`;
    }
    
    private inferTableName(methodName: string): string {
        const tableName = removePrefix(methodName, 'delete', true);
        return camelToSnakeCase(tableName || methodName);
    }
}

/**
 * 结果映射模板策略
 */
class ResultMapTemplateStrategy implements TemplateStrategy {
    readonly templateType = TemplateType.RESULT_MAP;
    
    render(context: TemplateContext): string {
        const methodName = escapeXml(context.methodName || 'BaseResultMap');
        const type = escapeXml(context.returnType || 'java.lang.Object');
        
        return `    <resultMap id="${methodName}" type="${type}">
        <id column="id" property="id" />
        <!-- Add result mappings here -->
    </resultMap>`;
    }
    
    validateContext(context: TemplateContext): { valid: boolean; error?: string } {
        return { valid: true };
    }
}

/**
 * 模板引擎实现类
 */
export class TemplateEngine implements ITemplateEngine {
    private static instance: TemplateEngine;
    private strategies: Map<TemplateType, TemplateStrategy>;
    
    private constructor() {
        this.strategies = new Map();
        
        this.registerStrategy(new MapperXmlTemplateStrategy());
        this.registerStrategy(new SelectTemplateStrategy());
        this.registerStrategy(new InsertTemplateStrategy());
        this.registerStrategy(new UpdateTemplateStrategy());
        this.registerStrategy(new DeleteTemplateStrategy());
        this.registerStrategy(new ResultMapTemplateStrategy());
        
        logger.debug('TemplateEngine initialized with strategies:', {
            strategies: Array.from(this.strategies.keys())
        });
    }
    
    public static getInstance(): TemplateEngine {
        if (!TemplateEngine.instance) {
            TemplateEngine.instance = new TemplateEngine();
        }
        return TemplateEngine.instance;
    }
    
    private registerStrategy(strategy: TemplateStrategy): void {
        this.strategies.set(strategy.templateType, strategy);
    }
    
    render(type: TemplateType, context: TemplateContext): TemplateRenderResult {
        const strategy = this.strategies.get(type);
        
        if (!strategy) {
            return {
                success: false,
                error: `Unknown template type: ${type}`
            };
        }
        
        const validation = strategy.validateContext(context);
        if (!validation.valid) {
            return {
                success: false,
                error: validation.error
            };
        }
        
        try {
            const content = strategy.render(context);
            return { success: true, content };
        } catch (error) {
            logger.error('Error rendering template:', error);
            return {
                success: false,
                error: error instanceof Error ? error.message : String(error)
            };
        }
    }
    
    registerTemplate(type: TemplateType, template: string): void {
        // TODO: 实现自定义模板注册逻辑
        // 当前版本不支持自定义模板，预留接口供未来扩展
        logger.warn('Custom template registration not implemented yet:', { type });
        throw new Error(`Custom template registration not implemented. Type: ${type}`);
    }
}

export const templateEngine = TemplateEngine.getInstance();
