---
created: 2026-03-31T06:52:13.820Z
title: 通过策略模式和责任链模式重构标签补全与参数补全逻辑
area: completion
files:
  - src/features/completion/
  - src/features/completion/strategies/
  - src/features/completion/unifiedCompletionProvider.ts
---

## Problem

当前的补全系统存在以下问题：

1. **架构僵化**：补全逻辑高度耦合，难以扩展新的补全类型
2. **上下文感知不足**：无法根据当前光标位置和 XML 上下文动态调整补全内容
3. **性能问题**：大量条件判断和遍历导致补全响应不够迅速
4. **维护困难**：新增补全类型需要修改多处代码，容易引入 bug

具体问题表现：
- 标签补全和参数补全逻辑分散在不同 provider 中，缺乏统一协调
- 无法智能判断何时应该提供标签补全、何时应该提供参数补全
- 对于复杂嵌套标签（如 `<foreach>` 内的 `<if>`）的补全支持不完善

## Solution

### 架构重构方向

1. **策略模式 (Strategy Pattern)**
   - 定义 `CompletionStrategy` 接口
   - 为不同补全类型创建独立策略类：
     - `TagCompletionStrategy` - 标签名补全
     - `AttributeCompletionStrategy` - 属性名补全
     - `AttributeValueCompletionStrategy` - 属性值补全
     - `ParameterCompletionStrategy` - 参数补全
     - `SqlKeywordCompletionStrategy` - SQL 关键字补全
   - 策略注册表支持动态添加/移除策略

2. **责任链模式 (Chain of Responsibility)**
   - 构建补全请求处理链
   - 每个策略决定是否处理当前请求
   - 支持多个策略组合返回补全结果
   - 链的顺序决定优先级

3. **上下文感知 (Context Awareness)**
   - 创建 `CompletionContext` 对象封装：
     - 当前光标位置（标签内、属性内、文本内容内）
     - 父标签层级链
     - 已定义的属性集合
     - 可用的命名空间/类型信息
   - 上下文预计算和缓存

4. **动态判断补全内容**
   - 基于上下文动态选择适用的策略
   - 智能过滤不相关的补全项
   - 根据项目配置调整补全行为

### 预期收益

- 更精准的补全：上下文感知减少无关建议
- 更快速的响应：策略缓存和预计算减少运行时开销
- 更易维护：新增补全类型只需添加新策略类
- 更好的测试性：每个策略可独立单元测试

### 参考文件

- `src/features/completion/unifiedCompletionProvider.ts` - 当前统一补全入口
- `src/features/completion/strategies/` - 现有策略实现
