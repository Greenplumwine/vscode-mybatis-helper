# Quick Task: 修复多服务同名 Mapper 跳转问题

## 问题描述
GitHub Issue 反馈：项目下有多个 Spring Boot 服务，其中两个服务下的部分 mapper 和 XML 同名时，跳转会出现不准确的情况。例如：A 服务的 mapper 会跳转到 B 服务的 XML。

## 预期行为
在多模块/多服务项目结构中，Java mapper 应该准确跳转到同模块/同服务下的对应 XML 文件，而不是跨服务跳转。

## 需要排查的内容
1. 当前的 mapper-XML 映射逻辑是否考虑了文件路径/模块边界
2. `FastMappingEngine` 如何处理同名文件的映射关系
3. 导航服务如何确定目标 XML 文件的优先级

## 相关组件
- `src/features/mapping/FastMappingEngine.ts`
- `src/features/mapping/UnifiedNavigationService.ts`
- `src/features/mapping/scanners/FastScanner.ts`
