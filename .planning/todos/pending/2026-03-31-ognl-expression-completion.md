---
created: 2026-03-31T06:52:13.820Z
title: MyBatis XML OGNL 表达式与参数智能补全
tags: ["completion", "OGNL", "parameter"]
area: completion
files:
  - src/features/completion/
  - src/features/completion/strategies/
---

## Problem

当前 MyBatis Helper 对 XML 中 `test` 属性等 OGNL 表达式的补全支持不完善：

1. **参数补全缺失**：在 `<if test="|">` 中无法补全 Java 方法的入参名称
2. **OGNL 函数补全缺失**：无法补全 `@ognl` 开头的 OGNL 内置函数（如 `@java.lang.Math@max()`）
3. **属性导航缺失**：无法补全参数对象的属性（如 `user.name`）
4. **上下文感知不足**：无法根据已输入内容动态过滤补全项

期望行为：
- 输入 `@` → 补全 `@ognl` 相关函数
- 输入参数名前缀 → 补全匹配的参数
- 空输入 → 展示所有可用选项（参数 + OGNL 函数）

## Solution

### 实现要点

1. **OGNL 表达式解析器**
   - 识别当前光标在 OGNL 表达式中的位置
   - 解析已输入的 token 类型（参数名、属性访问、@调用等）

2. **参数来源**
   - 从对应的 Mapper Java 方法获取参数列表
   - 支持 `@Param` 注解别名
   - 支持默认参数名（arg0, arg1 或 param1, param2）

3. **补全策略**

| 输入状态 | 补全内容 |
|---------|---------|
| `@` | OGNL 静态方法调用（`@java.lang.Math@` 等） |
| `@类名@` | 该类下的静态方法 |
| `参数名.` | 该参数对象的属性 |
| `参数名.属性.` | 嵌套属性 |
| 空或字母 | 所有参数名 + OGNL 函数 |

4. **支持的 OGNL 函数**
   - `@java.lang.Math@*` 数学函数
   - `@java.lang.String@*` 字符串工具
   - `@java.util.Collections@*` 集合工具
   - 自定义工具类（可配置）

### 相关标签

- `<if test="">`
- `<when test="">`
- `<bind name="" value="">`
- `<foreach collection="">`（collection 属性）

### 技术实现

1. 复用现有的 `JavaMethodParser` 获取方法参数
2. 扩展 `AttributeCompletionStrategy` 处理 `test` 和 `value` 属性
3. 实现 `OgnlCompletionProvider` 专门处理 OGNL 表达式
4. 缓存参数类型信息用于属性补全
