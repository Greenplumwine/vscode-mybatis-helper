---
phase: "06"
plan: P04
subsystem: mapping
phase_name: module-aware-mapping-engine-refactor
plan_name: query-context
tags: [query-context, QueryContextResolver, UnifiedNavigationService, CodeLens]
requires: [P02]
provides: [P05]
affects: [UnifiedNavigationService, XmlCodeLensProvider, FastCodeLensProvider]
tech-stack:
  added: []
  patterns: [QueryContextResolver singleton, automatic module inference, referencePath elimination]
key-files:
  created:
    - src/features/mapping/queryContext.ts
  modified:
    - src/features/mapping/unifiedNavigationService.ts
    - src/features/mapping/xmlCodeLensProvider.ts
    - src/features/mapping/index.ts
decisions:
  - fastCodeLensProvider 无需修改：仅使用 getByJavaPath（O(1) 精确查找），不涉及 namespace 歧义消解
  - findXmlByNamespace 中保留 calculatePathSimilarity：用于文件系统搜索候选排序，非索引查询场景
  - UnifiedNavigationService 中 findJavaByNamespace 和 findXmlByNamespace 的 referencePath 参数保留用于文件系统搜索，但索引查询改用 QueryContext
metrics:
  duration_seconds: 29001
  completed_date: "2026-04-22T02:21:26Z"
  tasks_completed: 5
  files_created: 1
  files_modified: 3
---

# Phase 6 Plan P04: QueryContext 统一查询接口总结

**一句话总结**：创建 QueryContextResolver 从活动编辑器/文件路径自动推断模块上下文，改造所有调用点消除手动 referencePath 传递，使歧义消解责任完全内聚到引擎内部。

## 完成的工作

### Task 1: 创建 QueryContextResolver 类

**提交**: `14c8112`

**变更文件**: `src/features/mapping/queryContext.ts`（新建）

**内容**:
- `QueryContextResolver` 单例类
- `inferFromActiveEditor()`: 从当前活动编辑器推断上下文
- `inferFromFilePath(filePath)`: 通过 `ModuleResolver.resolveModuleForPath` 解析 moduleId，未解析到时 fallback 到 `referencePath`
- `inferFromDocument(document)`: 文档包装器
- `withModuleId(moduleId)` / `withReferencePath(referencePath)`: 显式构建器

### Task 2: 改造 UnifiedNavigationService 使用 QueryContext

**提交**: `b9e20e2`

**变更文件**: `src/features/mapping/unifiedNavigationService.ts`

**改造点**:
1. 导入 `QueryContextResolver`
2. 添加 `queryContextResolver` 字段并在 constructor 中初始化
3. `navigateXmlToJava`（第 181 行）：`getByNamespace(xmlInfo.namespace, context)`，context 由 `inferFromFilePath(xmlPath)` 生成
4. `findJavaByNamespace`（第 339 行）：索引查询使用 `inferFromFilePath(referencePath)` 或 `inferFromActiveEditor()`
5. `findXmlByNamespace`（第 399 行）：索引查询使用 `inferFromFilePath(javaPath)` 或 `inferFromActiveEditor()`
6. `getNavigationInfo`（第 716 行）：XML 分支使用 `inferFromFilePath(filePath)`

**保留**: `calculatePathSimilarity` 方法——用于 `findXmlByNamespace` 文件系统搜索候选排序，非索引查询场景。

### Task 3: 改造 xmlCodeLensProvider 移除 referencePath

**提交**: `7555960`

**变更文件**: `src/features/mapping/xmlCodeLensProvider.ts`

**改造**: 第 63 行 `getByNamespace(xmlInfo.namespace, { referencePath: filePath })` 改为 `getByNamespace(xmlInfo.namespace)`，引擎内部自动推断模块上下文。

### Task 4: 改造 fastCodeLensProvider

**提交**: 无需修改（已在 T3/T5 中验证）

**结论**: `fastCodeLensProvider.ts` 中所有查询均为 `getByJavaPath(filePath)`（O(1) 精确查找）和 `hasSqlForMethod(namespace, methodName)`，不涉及 namespace 歧义消解，无需传入 QueryContext。

### Task 5: 更新 index.ts 导出

**提交**: `786dc0e`

**变更文件**: `src/features/mapping/index.ts`

**改造**:
- 新增 `export { QueryContextResolver } from "./queryContext";`
- 新增 `export { ModuleResolver } from "./moduleResolver";`
- 将两者归入 "模块感知组件" 分组

## 关键设计决策

| 决策 | 说明 |
|------|------|
| fastCodeLensProvider 不修改 | 仅使用 getByJavaPath（精确路径查找），不涉及歧义消解 |
| calculatePathSimilarity 保留 | 用于文件系统搜索候选排序，非引擎索引查询 |
| referencePath fallback | 当 ModuleResolver 无法解析模块时，仍保留 referencePath 作为 fallback |

## 验证结果

| 检查项 | 结果 |
|--------|------|
| `npm run compile` | 通过 |
| QueryContextResolver 类存在 | 通过 |
| inferFromActiveEditor | 通过 |
| inferFromFilePath | 通过 |
| inferFromDocument | 通过 |
| resolveModuleForPath | 通过 |
| UnifiedNavigationService 含 QueryContextResolver | 通过（9 处） |
| UnifiedNavigationService 含 queryContextResolver | 通过（18 处） |
| UnifiedNavigationService 含 inferFromFilePath | 通过（4 处） |
| UnifiedNavigationService 含 getByNamespace.*context | 通过（3 处） |
| UnifiedNavigationService 含 getByClassName.*context | 通过（1 处） |
| xmlCodeLensProvider 无 referencePath | 通过 |
| fastCodeLensProvider 无 referencePath | 通过 |
| index.ts 导出 QueryContextResolver | 通过 |

## 与计划的偏差

无。计划按预期执行，无偏差。

## 已知 Stub

无。所有功能均已完整实现。

## 威胁标志

无新增安全相关表面。

## 自检

- [x] `src/features/mapping/queryContext.ts` 已创建
- [x] `src/features/mapping/unifiedNavigationService.ts` 已修改
- [x] `src/features/mapping/xmlCodeLensProvider.ts` 已修改
- [x] `src/features/mapping/index.ts` 已修改
- [x] 提交 `14c8112` 存在于 git 历史
- [x] 提交 `b9e20e2` 存在于 git 历史
- [x] 提交 `7555960` 存在于 git 历史
- [x] 提交 `786dc0e` 存在于 git 历史

## Self-Check: PASSED
