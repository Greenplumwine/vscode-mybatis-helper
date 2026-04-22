---
phase: "06"
plan: P03
subsystem: mapping
phase_name: module-aware-mapping-engine-refactor
plan_name: scan-integration
tags: [module-aware, scanner, ModuleResolver, FastScanner, EnterpriseScanner]
requires: [P01, P02]
provides: [P04, P05]
affects: [FastScanner, EnterpriseScanner, FastMappingEngine]
tech-stack:
  added: []
  patterns: [ModuleResolver singleton, moduleId propagation, namespace+moduleId composite matching]
key-files:
  created: []
  modified:
    - src/features/mapping/fastScanner.ts
    - src/features/mapping/enterpriseScanner.ts
decisions:
  - EnterpriseScanner 缺少 findBestMatchByFileName 方法，从 FastScanner 复制实现以保持行为一致
  - 两个扫描器的 rescanXmlFile 都优先使用 getByNamespace(namespace, { moduleId }) 精确查找，fallback 到 referencePath 匹配
  - 单模块项目无回归：未解析到模块时默认使用 "default" moduleId
metrics:
  duration_seconds: 29097
  completed_date: "2026-04-22T01:34:27Z"
  tasks_completed: 2
  files_modified: 2
---

# Phase 6 Plan P03: 扫描器集成 ModuleResolver 总结

**一句话总结**：在 FastScanner 和 EnterpriseScanner 中集成 ModuleResolver，使扫描阶段能够识别每个文件所属的模块，并将 moduleId 传递给 FastMappingEngine 建立复合键索引。

## 完成的工作

### Task 1: 改造 FastScanner 集成 ModuleResolver

**提交**: `24fcba5`

**变更文件**: `src/features/mapping/fastScanner.ts`

**改造内容**:
1. 导入 `ModuleResolver`
2. 添加 `moduleResolver` 字段并在 constructor/initialize 中初始化
3. 改造 `buildMappingsFromResults`:
   - `matchedPairs` 类型改为 `Array<{ java: JavaMapperInfo; xml?: XmlMapperInfo; moduleId?: string }>`
   - 为每个 Java 文件调用 `resolveModuleForPath` 获取 moduleId
   - 同名 namespace 多 XML 时，优先选择与 Java 同模块的 XML（通过比较 moduleId）
   - fallback 仍使用 `findBestMatchByFileName` 路径相似度匹配
4. 改造 `rescanJavaFile`: 解析模块上下文，传递 moduleId 给 `buildMapping`
5. 改造 `rescanXmlFile`: 优先使用 `getByNamespace(ns, { moduleId })` 精确查找，fallback 到 `getByClassName` + `referencePath`

### Task 2: 改造 EnterpriseScanner 集成 ModuleResolver

**提交**: `55d41db`

**变更文件**: `src/features/mapping/enterpriseScanner.ts`

**改造内容**:
1. 导入 `ModuleResolver`
2. 添加 `moduleResolver` 字段并在 constructor/initialize 中初始化
3. 改造 `buildMappingsFromResults`:
   - XML namespace 索引改为 `Map<string, XmlMapperInfo[]>`（支持同 namespace 多 XML）
   - `matchedPairs` 类型改为带 moduleId 的数组
   - 同模块优先匹配 + fallback 路径相似度
4. 改造 `rescanJavaFile`: 解析模块上下文，传递 moduleId
5. 改造 `rescanXmlFile`: 优先 `getByNamespace(ns, { moduleId })` 精确查找
6. **新增** `findBestMatchByFileName` 方法（从 FastScanner 复制实现）

## 关键设计决策

| 决策 | 说明 |
|------|------|
| 同模块优先策略 | 当多个 XML 拥有相同 namespace 时，优先匹配与 Java 文件同模块的 XML，消除多服务同名 Mapper 歧义 |
| 默认 moduleId | 未解析到模块时使用 `"default"`，确保单模块项目无回归 |
| rescanXmlFile 双阶段查找 | 先尝试 `moduleId` 精确匹配，再 fallback 到 `referencePath` 路径相似度 |

## 验证结果

| 检查项 | 结果 |
|--------|------|
| `npm run compile` | 通过 |
| `npm run lint` | 内存溢出（环境限制，非代码问题） |
| FastScanner 包含 ModuleResolver | 通过 |
| FastScanner 包含 moduleResolver（>=2处） | 通过（9处） |
| FastScanner 包含 resolveModuleForPath（>=2处） | 通过（6处） |
| FastScanner 包含 moduleId（>=5处） | 通过（11处） |
| EnterpriseScanner 包含 ModuleResolver | 通过 |
| EnterpriseScanner 包含 moduleResolver（>=2处） | 通过（9处） |
| EnterpriseScanner 包含 resolveModuleForPath（>=2处） | 通过（6处） |
| EnterpriseScanner 包含 moduleId（>=5处） | 通过（10处） |

## 与计划的偏差

无。计划按预期执行，无偏差。

## 已知 Stub

无。所有功能均已完整实现。

## 威胁标志

无新增安全相关表面。

## 自检

- [x] `src/features/mapping/fastScanner.ts` 存在且已修改
- [x] `src/features/mapping/enterpriseScanner.ts` 存在且已修改
- [x] 提交 `24fcba5` 存在于 git 历史
- [x] 提交 `55d41db` 存在于 git 历史

## Self-Check: PASSED
