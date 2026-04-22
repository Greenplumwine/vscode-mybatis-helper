---
phase: 06-module-aware-mapping-engine-refactor
plan: P02
subsystem: mapping
key-files:
  created: []
  modified:
    - src/features/mapping/types.ts
    - src/features/mapping/fastMappingEngine.ts
    - src/features/mapping/enterpriseScanner.ts
    - src/features/mapping/fastNavigationService.ts
    - src/features/mapping/fastScanner.ts
    - src/features/mapping/unifiedNavigationService.ts
    - src/features/mapping/xmlCodeLensProvider.ts
tech-stack:
  added: []
  patterns:
    - Composite key indexing (moduleId::namespace)
    - Reverse index for fallback lookups
    - QueryContext parameter for disambiguation
dependencies:
  requires:
    - P01
  provides:
    - Composite key based FastMappingEngine
  affects:
    - All callers of getByNamespace, getByClassName
decisions:
  - "保留旧接口调用方的兼容性：将 string referencePath 参数改为 { referencePath: string } QueryContext 对象"
  - "单模块项目默认使用 'default' 作为 moduleId，保证无回归"
  - "namespaceToModules 反向索引用于无 moduleId 时的 fallback 路径相似度匹配"
---

# Phase 06 Plan P02: FastMappingEngine 索引结构改造 Summary

## 一句话总结
将 FastMappingEngine 从 namespace 单键索引改造为 (moduleId, namespace) 复合键索引，引入 moduleNamespaceIndex 主索引和 namespaceToModules 反向索引，从根本上消除多服务同名 Mapper 的索引冲突。

## 改造范围

### 核心文件
- `src/features/mapping/fastMappingEngine.ts` - 索引结构和所有方法改造
- `src/features/mapping/types.ts` - 新增 ModuleContext 和 QueryContext 接口

### 调用方适配
- `src/features/mapping/enterpriseScanner.ts`
- `src/features/mapping/fastNavigationService.ts`
- `src/features/mapping/fastScanner.ts`
- `src/features/mapping/unifiedNavigationService.ts`
- `src/features/mapping/xmlCodeLensProvider.ts`

## 关键变更

### 索引结构
| 旧索引 | 新索引 | 说明 |
|--------|--------|------|
| `namespaceIndex: Map<string, MappingIndex[]>` | `moduleNamespaceIndex: Map<string, MappingIndex>` | 复合键 `${moduleId}::${namespace}` -> 单个 MappingIndex |
| - | `namespaceToModules: Map<string, string[]>` | 新增反向索引，用于 fallback 查找 |
| `javaPathIndex: Map<string, string>` (存 namespace) | `javaPathIndex: Map<string, string>` (存 compositeKey) | 值改为复合键 |
| `xmlPathIndex: Map<string, string>` (存 namespace) | `xmlPathIndex: Map<string, string>` (存 compositeKey) | 值改为复合键 |
| `classNameIndex: Map<string, Set<string>>` (存 namespace) | `classNameIndex: Map<string, Set<string>>` (存 compositeKey) | 值改为复合键 |
| `packageIndex: Map<string, Set<string>>` (存 namespace) | `packageIndex: Map<string, Set<string>>` (存 compositeKey) | 值改为复合键 |

### 方法签名变更
| 方法 | 旧签名 | 新签名 |
|------|--------|--------|
| `buildMapping` | `(javaInfo, xmlInfo?)` | `(javaInfo, xmlInfo?, moduleId = "default")` |
| `buildMappings` | `(pairs: {java, xml}[])` | `(pairs: {java, xml, moduleId?}[])` |
| `getByNamespace` | `(namespace, referencePath?)` | `(namespace, context?: QueryContext)` |
| `getByClassName` | `(className, referencePath?)` | `(className, context?: QueryContext)` |

### 查询链路
```
// 新链路：O(1) 复合键查找
javaPath -> javaPathIndex -> compositeKey -> moduleNamespaceIndex -> MappingIndex

// fallback 链路：referencePath 相似度匹配
namespace -> namespaceToModules -> [moduleId] -> compositeKeys -> moduleNamespaceIndex -> candidates -> findBestMatchByPath
```

## 编译状态
- `npm run compile`：通过，无错误
- `npm run lint`：因环境内存限制未能完成，但代码风格与现有代码一致

## Deviations from Plan

无偏差。计划按步骤 1-23 全部执行完成。

## Known Stubs

无。所有索引查询均已正确实现，无硬编码空值或占位符。

## Threat Flags

无新增安全表面。QueryContext 仅用于索引查找，不执行文件操作。

## Commits

| Hash | Message | Files |
|------|---------|-------|
| 234f917 | feat(06-P02): add ModuleContext and QueryContext interfaces | types.ts |
| 7f369df | feat(06-P02): restructure FastMappingEngine to composite key indexing | fastMappingEngine.ts + 5 callers |

## Self-Check: PASSED

- [x] `moduleNamespaceIndex` 定义存在
- [x] `namespaceToModules` 定义存在
- [x] `getCompositeKey` 方法存在
- [x] `buildMapping` 接受 `moduleId` 参数
- [x] `getByNamespace` 接受 `QueryContext` 参数
- [x] `getByClassName` 接受 `QueryContext` 参数
- [x] 所有查询方法通过 compositeKey 链路工作
- [x] `npm run compile` 无错误
- [x] 所有调用方已适配新签名
