# Phase 6: 模块感知 Mapper 映射引擎重构

## Goal

将 FastMappingEngine 的 namespace 单键索引改造为 (moduleId, namespace) 复合键索引，引入 ModuleResolver 显式识别模块边界，从根本上消除多服务同名 Mapper 跳转歧义问题。合并 FastNavigationService 与 UnifiedNavigationService，统一 QueryContext 查询接口，使歧义消解由引擎内部自动处理。

## Motivation

当前架构通过 `referencePath` 参数让调用方承担歧义消解责任，已在 `xmlCodeLensProvider`、`enterpriseScanner`、`unifiedNavigationService` 等多个调用点出现遗漏。这种方式是"补丁式"修复，无法从根本上解决同名 namespace 的歧义问题。

根本原因是 `namespace` 在微服务/多模块项目中不是全局唯一的。需要将模块归属提升为一等公民，建立真正的 O(1) 复合索引。

## Depends on

- v1.0.0 MVP 完成（基础导航和扫描功能已稳定）
- 多服务同名 Mapper 跳转补丁已验证（ad27a51）

## Plans

### Plan 1: 引入 ModuleResolver

- [ ] 设计 `ModuleContext` 接口（moduleId, modulePath, type, buildFile, sourceRoots, resourceRoots）
- [ ] 实现 `ModuleResolver.resolveModuleForPath()` — 根据文件路径向上追溯 pom.xml/build.gradle 确定所属模块
- [ ] 实现 `ModuleResolver.resolveAllModules()` — 预扫描 workspace 所有模块
- [ ] 单元测试：Maven 多模块、Gradle 多项目、Spring Boot 微服务结构

### Plan 2: 改造 FastMappingEngine 索引结构

- [ ] 新增 `moduleNamespaceIndex: Map<string, MappingIndex>`（key = `${moduleId}::${namespace}`）
- [ ] 新增 `namespaceToModules: Map<string, string[]>` 反向索引
- [ ] 改造 `javaPathIndex` / `xmlPathIndex` 指向 compositeKey 而非 namespace
- [ ] 保留 fallback 路径：无模块信息时回退到路径相似度匹配
- [ ] 验证：同名 namespace 在不同模块下可独立索引和查询

### Plan 3: 扫描阶段集成模块上下文

- [ ] 改造 `EnterpriseScanner.scanWithConfig()` — Phase 0 解析模块结构
- [ ] 改造 `buildMapping()` / `buildMappings()` — 传入模块上下文
- [ ] 改造 `FastScanner` 同样支持模块上下文（如适用）
- [ ] 增量注册：新模块加入时无需全量重扫

### Plan 4: 统一 QueryContext 查询接口

- [ ] 定义 `QueryContext` 接口（moduleId?, referencePath?）
- [ ] 改造 `getByNamespace(namespace, context?)` — 自动推断最佳策略
- [ ] 改造 `getByClassName(className, context?)`
- [ ] 实现 `inferQueryContext()` — 从当前活动编辑器自动推断
- [ ] 所有调用方简化：不再需要手动传入 `referencePath`

### Plan 5: 合并 NavigationService

- [ ] 分析 `FastNavigationService` 和 `UnifiedNavigationService` 功能差异
- [ ] 将 `FastNavigationService` 功能合并到 `UnifiedNavigationService`
- [ ] 或保留 `UnifiedNavigationService` 为唯一服务，删除 `FastNavigationService`
- [ ] 更新所有调用方引用
- [ ] 统一路径相似度算法（当前两套）

### Plan 6: 清理补丁代码

- [ ] 删除各调用方手动传入 `referencePath` 的补丁逻辑
- [ ] 删除 `FastMappingEngine.findBestMatchByPath` 中冗余的路径相似度代码（保留作为兜底 fallback）
- [ ] 验证所有场景回归通过：单模块、多模块、微服务

## Acceptance Criteria

- [ ] 同名 namespace 在不同模块的 Mapper 可以正确独立跳转
- [ ] 不传入任何 context 时，引擎能根据当前活动文件自动推断正确模块
- [ ] 单模块项目行为不变（零回归）
- [ ] 性能不劣化：查询仍保持 O(1)（模块已知时）
- [ ] 两个 NavigationService 合并为一个
- [ ] 所有 `referencePath` 补丁代码已清理

## Risk Assessment

| 风险 | 概率 | 影响 | 缓解措施 |
|------|------|------|----------|
| 模块识别在边缘项目中不准确 | 中 | 高 | 保留无模块信息时的 fallback 路径 |
| 索引结构改造引入回归 | 低 | 高 | 充分的单元测试 + 手动验证多模块场景 |
| NavigationService 合并导致行为差异 | 中 | 中 | 详细对比功能差异后再合并 |
| 扫描性能下降 | 低 | 低 | 模块解析一次执行，复用结果 |

## Notes

- 参考 Issue #7 修复补丁（ad27a51）了解当前痛点
- 当前路径相似度算法分散在 `FastMappingEngine` 和 `UnifiedNavigationService` 中，需统一
- `ModuleResolver` 应支持 Maven、Gradle、以及无构建文件的简单项目（fallback 到目录结构）
