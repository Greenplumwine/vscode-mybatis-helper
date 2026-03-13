/**
 * 字符串工具类
 * 提供通用的字符串处理函数
 * 
 * @author MyBatis Helper Team
 * @version 1.0.0
 */

/**
 * 驼峰命名转蛇形命名
 * @param str 驼峰命名字符串
 * @returns 蛇形命名字符串
 * @example camelToSnakeCase("userName") -> "user_name"
 * @example camelToSnakeCase("UserName") -> "user_name"
 */
export function camelToSnakeCase(str: string): string {
    if (!str) {
        return '';
    }
    
    return str
        .replace(/([a-z])([A-Z])/g, '$1_$2')
        .toLowerCase()
        .replace(/^_/, '');
}

/**
 * 蛇形命名转驼峰命名
 * @param str 蛇形命名字符串
 * @param capitalizeFirst 是否首字母大写
 * @returns 驼峰命名字符串
 * @example snakeToCamelCase("user_name") -> "userName"
 * @example snakeToCamelCase("user_name", true) -> "UserName"
 */
export function snakeToCamelCase(str: string, capitalizeFirst: boolean = false): string {
    if (!str) {
        return '';
    }
    
    const result = str
        .toLowerCase()
        .replace(/_([a-z])/g, (_, letter) => letter.toUpperCase());
    
    if (capitalizeFirst && result) {
        return result.charAt(0).toUpperCase() + result.slice(1);
    }
    
    return result;
}

/**
 * 检查字符串是否为空或仅包含空白字符
 * @param str 字符串
 * @returns 是否为空
 */
export function isEmpty(str: string | null | undefined): boolean {
    return !str || str.trim().length === 0;
}

/**
 * 安全地获取字符串，如果为空则返回默认值
 * @param str 字符串
 * @param defaultValue 默认值
 * @returns 字符串或默认值
 */
export function defaultIfEmpty(str: string | null | undefined, defaultValue: string): string {
    return isEmpty(str) ? defaultValue : str!;
}

/**
 * 移除字符串的前缀
 * @param str 字符串
 * @param prefix 前缀
 * @param ignoreCase 是否忽略大小写
 * @returns 移除前缀后的字符串
 * @example removePrefix("insertUser", "insert") -> "User"
 * @example removePrefix("InsertUser", "insert", true) -> "User"
 */
export function removePrefix(str: string, prefix: string, ignoreCase: boolean = true): string {
    if (!str || !prefix) {
        return str || '';
    }
    
    if (ignoreCase) {
        if (str.toLowerCase().startsWith(prefix.toLowerCase())) {
            return str.substring(prefix.length);
        }
    } else {
        if (str.startsWith(prefix)) {
            return str.substring(prefix.length);
        }
    }
    
    return str;
}
