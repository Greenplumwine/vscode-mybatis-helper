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

/**
 * 从方法名提取表名
 *
 * 规则：
 * 1. 去除前缀：select/find/get/query/search/list/insert/update/delete/count
 * 2. 去除 "By" 及之后的所有内容
 * 3. 将 CamelCase 转换为 snake_case
 *
 * 示例：
 * - findByUserIdAndStatus → user
 * - selectUserById → user
 * - getUserOrderListByUserId → user_order
 * - insertUser → user
 */
export function extractTableNameFromMethod(methodName: string): string {
  const prefixes = [
    'select', 'find', 'get', 'query', 'search', 'list',
    'insert', 'update', 'delete', 'count'
  ];

  let result = methodName;

  // 步骤 1: 去除前缀
  for (const prefix of prefixes) {
    const removed = removePrefix(result, prefix, true);
    if (removed !== result) {
      result = removed;
      break;
    }
  }

  // 步骤 2: 去除 "By" 及之后的内容（不区分大小写）
  const byIndex = result.toLowerCase().indexOf('by');
  if (byIndex > 0) {
    // By 在中间，如 "UserById"，截取前面的部分
    result = result.substring(0, byIndex);
  } else if (byIndex === 0) {
    // 以 By 开头，如 "ByUserIdAndStatus"
    // 尝试从条件字段推断表名
    const conditionPart = result.substring(2); // 去除 "By"
    // 使用驼峰边界分割，提取第一个条件字段
    const parts = conditionPart.split(/(?=[A-Z])/);
    if (parts.length > 0 && parts[0]) {
      // 第一个部分通常是实体名（如 "User"）
      let entityName = parts[0];
      // 去除 Id/Ids 后缀
      entityName = entityName.replace(/Ids?$/i, '');
      result = entityName;
    } else {
      result = '';
    }
  }

  // 步骤 3: 处理 "List" 后缀（常见情况：getUserList → user）
  if (result.toLowerCase().endsWith('list')) {
    result = result.substring(0, result.length - 4);
  }

  // 步骤 4: 转换为 snake_case
  result = camelToSnakeCase(result);

  // 步骤 5: 清理（去除首尾下划线）
  result = result.replace(/^_+|_+$/g, '');

  // 如果结果为空，返回空字符串（不是原方法名）
  return result || '';
}
