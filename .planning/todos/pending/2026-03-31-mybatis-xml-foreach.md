---
created: 2026-03-31T06:52:13.820Z
title: 深入优化 Mybatis XML 语法中的 foreach 标签的标签补全与参数补全逻辑
area: completion
files:
  - src/features/completion/
---

## Problem

当前 MyBatis Helper 对 `<foreach>` 标签的补全支持不够完善：

1. **标签补全**：在编写 `<foreach>` 标签时，缺少对 `collection`、`item`、`index`、`open`、`close`、`separator` 等属性的智能提示和补全
2. **参数补全**：在 `<foreach>` 标签体内（如 `#{item}`），缺少对 `item` 和 `index` 变量的参数补全支持
3. **上下文感知**：无法根据外部 Java 方法的参数类型推断 `collection` 属性的可用值

这导致开发者在编写动态 SQL 的 foreach 循环时需要手动记忆属性名和变量名，影响开发效率。

## Solution

TBD

### 可能的实现方向

1. 扩展 `TagCompletionProvider` 添加 foreach 标签的专用属性提示
2. 在 `AttributeCompletionProvider` 中处理 foreach 特有的属性值补全
3. 增强 `ParameterCompletionProvider` 以识别 foreach 上下文中的 item/index 变量
4. 结合 Java 方法参数解析，为 collection 属性提供智能建议
