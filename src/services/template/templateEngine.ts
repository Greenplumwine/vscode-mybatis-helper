/**
 * 模板引擎服务
 * 使用策略模式支持多种模板类型
 * 
 * @author MyBatis Helper Team
 * @version 1.0.0
 */

import { logger } from '../../utils/logger';
import { camelToSnakeCase, removePrefix, extractTableNameFromMethod } from '../../utils/stringUtils';
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
 * WHERE 条件接口
 */
interface WhereCondition {
    field: string;
    operator: string;
    logic: 'AND' | 'OR';
}

/**
 * 操作符映射
 */
const OPERATOR_MAP: Record<string, string> = {
    'like': 'LIKE',
    'between': 'BETWEEN',
    'in': 'IN',
    'not': 'NOT',
    'is': 'IS',
    'null': 'NULL',
    'notnull': 'IS NOT NULL',
    'istrue': '= TRUE',
    'isfalse': '= FALSE',
    'greaterthan': '>',
    'lessthan': '<',
    'greaterthanorequalto': '>=',
    'lessthanorequalto': '<='
};

/**
 * 从方法名提取 WHERE 条件
 *
 * 示例：
 * - findByUserIdAndStatus → [{field: 'user_id', operator: '=', logic: 'AND'}, {field: 'status', operator: '=', logic: 'AND'}]
 * - selectByCreateTimeBetween → [{field: 'create_time', operator: 'BETWEEN', logic: 'AND'}]
 * - getByNameLike → [{field: 'name', operator: 'LIKE', logic: 'AND'}]
 */
function extractWhereConditions(methodName: string): WhereCondition[] {
    const byIndex = methodName.toLowerCase().indexOf('by');
    if (byIndex === -1 || byIndex === methodName.length - 2) {
        return [];
    }

    const conditionPart = methodName.substring(byIndex + 2);

    // 使用正则分割：按大写字母分割，但保留逻辑连接词
    // 匹配模式：And、Or 作为逻辑连接词，其他大写字母开头的词作为字段或操作符
    const parts: string[] = [];
    let current = '';

    for (let i = 0; i < conditionPart.length; i++) {
        const char = conditionPart[i];
        const nextChar = conditionPart[i + 1];

        // 检查是否是逻辑连接词的开始 (And, Or)
        const remaining = conditionPart.substring(i);
        if (remaining.toLowerCase().startsWith('and') && remaining.length > 3 && remaining[3] === remaining[3].toUpperCase()) {
            if (current) {
                parts.push(current);
                current = '';
            }
            parts.push('And');
            i += 2;
            continue;
        }
        if (remaining.toLowerCase().startsWith('or') && remaining.length > 2 && remaining[2] === remaining[2].toUpperCase()) {
            if (current) {
                parts.push(current);
                current = '';
            }
            parts.push('Or');
            i += 1;
            continue;
        }

        if (char === char.toUpperCase() && i > 0 && current) {
            parts.push(current);
            current = char;
        } else {
            current += char;
        }
    }

    if (current) {
        parts.push(current);
    }

    const conditions: WhereCondition[] = [];
    let currentField = '';
    let currentOperator = '=';
    let currentLogic: 'AND' | 'OR' = 'AND';

    for (let i = 0; i < parts.length; i++) {
        const part = parts[i];
        const lowerPart = part.toLowerCase();

        if (lowerPart === 'and') {
            if (currentField) {
                conditions.push({
                    field: camelToSnakeCase(currentField),
                    operator: currentOperator,
                    logic: currentLogic
                });
                currentField = '';
                currentOperator = '=';
            }
            currentLogic = 'AND';
        } else if (lowerPart === 'or') {
            if (currentField) {
                conditions.push({
                    field: camelToSnakeCase(currentField),
                    operator: currentOperator,
                    logic: currentLogic
                });
                currentField = '';
                currentOperator = '=';
            }
            currentLogic = 'OR';
        } else if (OPERATOR_MAP[lowerPart]) {
            // 操作符
            currentOperator = OPERATOR_MAP[lowerPart];
        } else if (lowerPart === 'not' && parts[i + 1]?.toLowerCase() === 'null') {
            // 处理 IsNotNull 或 NotNull
            currentOperator = 'IS NOT NULL';
            i++; // 跳过 'Null'
        } else if (lowerPart === 'is' && parts[i + 1]?.toLowerCase() === 'null') {
            // 处理 IsNull
            currentOperator = 'IS NULL';
            i++; // 跳过 'Null'
        } else if (lowerPart === 'is' && parts[i + 1]?.toLowerCase() === 'not' && parts[i + 2]?.toLowerCase() === 'null') {
            // 处理 IsNotNull
            currentOperator = 'IS NOT NULL';
            i += 2; // 跳过 'Not' 和 'Null'
        } else {
            // 字段名
            currentField += part;
        }
    }

    // 处理最后一个字段
    if (currentField) {
        conditions.push({
            field: camelToSnakeCase(currentField),
            operator: currentOperator,
            logic: currentLogic
        });
    }

    return conditions;
}

/**
 * 构建 WHERE 子句
 */
function buildWhereClause(conditions: WhereCondition[]): string {
    if (conditions.length === 0) {
        return '';
    }

    return conditions.map((c, i) => {
        const prefix = i === 0 ? '' : ` ${c.logic} `;
        if (c.operator === 'IS NULL' || c.operator === 'IS NOT NULL') {
            return `${prefix}${c.field} ${c.operator}`;
        } else if (c.operator === 'BETWEEN') {
            return `${prefix}${c.field} BETWEEN ? AND ?`;
        } else if (c.operator === 'IN') {
            return `${prefix}${c.field} IN (...)`;
        } else {
            return `${prefix}${c.field} ${c.operator} ?`;
        }
    }).join('');
}

/**
 * 检查是否应该使用 resultMap
 */
function shouldUseResultMap(returnType: string | undefined): boolean {
    if (!returnType || returnType === 'void') {
        return false;
    }

    // 基础类型：直接使用 resultType
    const primitiveTypes = ['int', 'long', 'boolean', 'string', 'integer', 'void', 'double', 'float', 'short', 'byte'];
    const simpleName = returnType.toLowerCase().replace(/java\.lang\./g, '');
    if (primitiveTypes.includes(simpleName)) {
        return false;
    }

    // 包装类
    const wrapperTypes = ['integer', 'long', 'boolean', 'double', 'float', 'short', 'byte', 'string'];
    if (wrapperTypes.includes(simpleName)) {
        return false;
    }

    // 集合类型：检查泛型参数
    if (returnType.includes('<')) {
        const genericMatch = returnType.match(/<(.*?)>/);
        if (genericMatch) {
            const genericType = genericMatch[1].trim();
            // 如果泛型参数是简单类型，不使用 resultMap
            const genericSimpleName = genericType.toLowerCase().replace(/java\.lang\./g, '');
            if (primitiveTypes.includes(genericSimpleName) || wrapperTypes.includes(genericSimpleName)) {
                return false;
            }
            // 复杂泛型类型使用 resultMap
            return true;
        }
    }

    // 复杂对象类型：使用 resultMap
    return true;
}

/**
 * 提取简单类名
 */
function extractSimpleTypeName(returnType: string): string {
    // 处理泛型
    const withoutGeneric = returnType.replace(/<[^>]+>/g, '');
    const lastDot = withoutGeneric.lastIndexOf('.');
    return lastDot >= 0 ? withoutGeneric.substring(lastDot + 1) : withoutGeneric;
}

/**
 * 生成 resultMap 引用
 */
function renderResultMapRef(returnType: string | undefined): string {
    if (!returnType || returnType === 'void') {
        return '';
    }

    if (!shouldUseResultMap(returnType)) {
        // 对于简单类型，使用 resultType
        const simpleName = extractSimpleTypeName(returnType);
        return ` resultType="${escapeXml(simpleName)}"`;
    }

    // 提取简单类名
    const simpleTypeName = extractSimpleTypeName(returnType);

    // 生成 resultMap ID
    const resultMapId = `${simpleTypeName}ResultMap`;

    return ` resultMap="${resultMapId}"`;
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
        const resultStr = renderResultMapRef(context.returnType);
        const tableName = extractTableNameFromMethod(context.methodName || '');

        // 提取 WHERE 条件
        const conditions = extractWhereConditions(context.methodName || '');

        if (conditions.length > 0) {
            // 生成带 WHERE 提示的 SQL
            const whereClause = buildWhereClause(conditions);

            return `    <select id="${methodName}"${paramsStr}${resultStr}>
        SELECT * FROM ${tableName}
        WHERE ${whereClause}
    </select>`;
        }

        // 默认 SQL（无 By 后缀）
        return `    <select id="${methodName}"${paramsStr}${resultStr}>
        SELECT * FROM ${tableName}
        WHERE
    </select>`;
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
        const tableName = extractTableNameFromMethod(context.methodName || '');

        return `    <insert id="${methodName}"${paramsStr}>
        INSERT INTO ${tableName} (

        ) VALUES (

        )
    </insert>`;
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
        const tableName = extractTableNameFromMethod(context.methodName || '');

        return `    <update id="${methodName}"${paramsStr}>
        UPDATE ${tableName}
        <set>

        </set>
        WHERE
    </update>`;
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
        const tableName = extractTableNameFromMethod(context.methodName || '');

        return `    <delete id="${methodName}"${paramsStr}>
        DELETE FROM ${tableName}
        WHERE
    </delete>`;
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
