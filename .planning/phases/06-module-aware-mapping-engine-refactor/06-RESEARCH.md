# Phase 6: 模块感知 Mapper 映射引擎重构 - Research

**Researched:** 2026-04-21
**Domain:** VS Code Extension / MyBatis Mapper Navigation / Multi-Module Indexing
**Confidence:** HIGH (基于完整代码库分析)

## Summary

当前 `FastMappingEngine` 使用 `namespace` 作为主索引键，在微服务/多模块项目中，不同模块的同名 Mapper 会产生索引冲突。当前 workaround 是通过 `referencePath` 参数让调用方承担歧义消解责任，但这种方式已在多个调用点出现遗漏（如 `xmlCodeLensProvider`、`enterpriseScanner` 等），属于"补丁式"修复。

本研究的核心发现：
1. **索引结构缺陷**：`namespaceIndex: Map<string, MappingIndex[]>` 使用数组存储同 namespace 的多条映射，查询时需线性扫描 + 路径相似度计算，退化为 O(n) [VERIFIED: fastMappingEngine.ts L54]
2. **责任分散**：至少 6 个调用点需要手动传入 `referencePath`，极易遗漏 [VERIFIED: 代码库 grep]
3. **NavigationService 重复**：`FastNavigationService` 和 `UnifiedNavigationService` 功能高度重叠，但 `extension.ts` 只使用 `UnifiedNavigationService` [VERIFIED: extension.ts L88, L349]
4. **路径相似度算法重复**：`FastMappingEngine.calculatePathScore` 和 `FastScanner.findBestMatchByFileName` 以及 `UnifiedNavigationService.calculatePathSimilarity` 三套算法逻辑相似 [VERIFIED: 代码对比]

**Primary recommendation:** 引入 `ModuleResolver` 显式识别模块边界，将索引键改造为 `${moduleId}::${namespace}` 复合键，从根本上消除歧义；合并两个 NavigationService；统一路径相似度算法。

## Architectural Responsibility Map

| Capability | Primary Tier | Secondary Tier | Rationale |
|------------|-------------|----------------|-----------|
| Module boundary detection | Scanner (FastScanner/EnterpriseScanner) | ModuleResolver | 扫描阶段需要知道文件所属模块才能正确建立索引 |
| Index storage & query | FastMappingEngine | — | 引擎负责所有索引的维护和查询，模块信息应内聚于此 |
| Navigation orchestration | UnifiedNavigationService | — | 统一入口，负责调用引擎和UI交互 |
| Context inference | UnifiedNavigationService | FastMappingEngine | 从活动编辑器推断模块上下文，可放在服务层或引擎层 |
| Path similarity fallback | FastMappingEngine | — | 当模块信息缺失时的兜底策略，应内聚在引擎内部 |

## Standard Stack

### Core
| Library | Version | Purpose | Why Standard |
|---------|---------|---------|--------------|
| vscode API | ^1.85.0 | Workspace discovery, file system access | VS Code extension 标准 API |
| fast-xml-parser | ^5.3.4 | XML parsing (已使用) | 项目现有依赖 [VERIFIED: CLAUDE.md] |
| TypeScript | ^5.3.0 | 类型安全 | 项目现有配置 |

### Supporting
| Library | Version | Purpose | When to Use |
|---------|---------|---------|-------------|
| path (Node.js built-in) | — | 路径规范化、相对路径计算 | 所有路径操作 |
| fs/promises (Node.js built-in) | — | 文件系统访问 | 读取 pom.xml/build.gradle |

### Alternatives Considered
| Instead of | Could Use | Tradeoff |
|------------|-----------|----------|
| 自定义 ModuleResolver | VS Code Java extension API | Java extension API 不提供模块结构查询；自定义更灵活 |
| 复合键字符串 `${moduleId}::${namespace}` | 嵌套 Map `Map<moduleId, Map<namespace, MappingIndex>>` | 嵌套 Map 查询需两次查找，复合键字符串保持 O(1) 单次查找，且更简洁 |

## Architecture Patterns

### System Architecture Diagram

```
┌─────────────────────────────────────────────────────────────────┐
│                        VS Code Extension                         │
│                                                                  │
│  ┌──────────────┐    ┌──────────────┐    ┌──────────────┐      │
│  │   Commands   │───▶│  Navigation  │───▶│   Engine     │      │
│  │ (jumpToXml)  │    │   Service    │    │ (composite   │      │
│  │ (jumpToMapper│    │  (merged)    │    │   key index) │      │
│  └──────────────┘    └──────┬───────┘    └──────┬───────┘      │
│                             │                    │              │
│                             ▼                    ▼              │
│                     ┌──────────────┐    ┌──────────────┐       │
│                     │ QueryContext │    │ ModuleResolver│       │
│                     │  (inferred)  │    │ (pom.xml/     │       │
│                     └──────────────┘    │  build.gradle)│       │
│                                          └──────────────┘       │
│                                                                  │
│  ┌──────────────┐    ┌──────────────┐    ┌──────────────┐      │
│  │   Scanner    │───▶│  buildMapping│───▶│   Engine     │      │
│  │(Fast/Enterprise)   │ (with module)│    │ (update)     │      │
│  └──────────────┘    └──────────────┘    └──────────────┘      │
│                                                                  │
└─────────────────────────────────────────────────────────────────┘
```

### Recommended Project Structure

```
src/features/mapping/
├── types.ts                    # 现有类型定义
├── fastMappingEngine.ts        # 改造：复合键索引 + QueryContext
├── moduleResolver.ts           # 新增：模块边界检测
├── queryContext.ts             # 新增：查询上下文定义和推断
├── unifiedNavigationService.ts # 改造：合并 FastNavigationService
├── fastScanner.ts              # 改造：扫描时传入模块上下文
├── enterpriseScanner.ts        # 改造：扫描时传入模块上下文
├── xmlCodeLensProvider.ts      # 改造：移除 referencePath 参数
├── fastCodeLensProvider.ts     # 改造：移除 referencePath 参数
└── index.ts                    # 改造：导出新增模块
```

### Pattern 1: Composite Key Index
**What:** 使用 `${moduleId}::${namespace}` 作为单一索引键，保持 O(1) 查询
**When to use:** 当 namespace 在全局不唯一，但 (moduleId, namespace) 组合唯一时
**Example:**
```typescript
// Source: 基于 fastMappingEngine.ts 现有设计推导
private moduleNamespaceIndex: Map<string, MappingIndex> = new Map();

private getCompositeKey(moduleId: string, namespace: string): string {
  return `${moduleId}::${namespace}`;
}

// 查询时
public getByNamespace(namespace: string, context?: QueryContext): MapperMapping | undefined {
  if (context?.moduleId) {
    // O(1) 精确查找
    const key = this.getCompositeKey(context.moduleId, namespace);
    return this.moduleNamespaceIndex.get(key);
  }
  // fallback: 使用 namespaceToModules 反向索引
  // ...
}
```

### Pattern 2: Module Context Propagation
**What:** 扫描阶段解析模块信息，随文件信息一起传递到映射构建
**When to use:** 所有需要建立索引的场景
**Example:**
```typescript
// Source: 基于现有扫描流程推导
interface ModuleContext {
  moduleId: string;        // 模块唯一标识（如 pom.xml 所在目录的绝对路径）
  modulePath: string;      // 模块根目录
  type: 'maven' | 'gradle' | 'simple';
  buildFile?: string;      // pom.xml 或 build.gradle 路径
  sourceRoots: string[];   // src/main/java 等
  resourceRoots: string[]; // src/main/resources 等
}

// 扫描时
const module = this.moduleResolver.resolveModuleForPath(filePath);
this.mappingEngine.buildMapping(javaInfo, xmlInfo, module);
```

### Pattern 3: QueryContext Auto-Inference
**What:** 从当前活动编辑器自动推断查询上下文，调用方无需手动传入
**When to use:** 所有导航查询场景
**Example:**
```typescript
// Source: 基于现有 navigationService 设计推导
interface QueryContext {
  moduleId?: string;
  referencePath?: string;  // 保留作为 fallback
}

private inferQueryContext(): QueryContext {
  const editor = vscode.window.activeTextEditor;
  if (!editor) return {};
  
  const filePath = editor.document.uri.fsPath;
  const module = this.moduleResolver.resolveModuleForPath(filePath);
  return module ? { moduleId: module.moduleId } : { referencePath: filePath };
}
```

### Anti-Patterns to Avoid
- **让调用方承担歧义消解责任**：当前 `referencePath` 参数分散在多个调用点，容易遗漏。应将歧义消解内聚到引擎内部。
- **运行时重复解析模块**：模块结构在扫描期间相对稳定，应一次解析、缓存复用。
- **完全删除 fallback 路径**：模块识别在边缘场景（无构建文件、非标准目录结构）可能失败，必须保留路径相似度作为兜底。

## Don't Hand-Roll

| Problem | Don't Build | Use Instead | Why |
|---------|-------------|-------------|-----|
| Maven/Gradle 构建文件解析 | 完整 XML/Groovy 解析器 | 简单正则/字符串匹配提取 `<module>` / `include` | 只需要模块列表，不需要完整构建模型；减少依赖 |
| 路径相似度算法 | 复杂的编辑距离算法 | 基于路径段匹配的简单评分（现有实现已足够） | 实际场景下模块名匹配已能解决 95% 问题 |
| 文件系统监控 | 自定义轮询 | VS Code `FileSystemWatcher` | 已在使用，继续沿用 |

**Key insight:** 模块解析不需要工业级构建工具集成，简单可靠的启发式方法足以满足导航场景需求。

## Runtime State Inventory

> 本阶段涉及重构，需检查运行时状态

| Category | Items Found | Action Required |
|----------|-------------|------------------|
| Stored data | FastMappingEngine 的索引在内存中，无持久化；extension reload 后重建 | 无需数据迁移，重启后自动重建新索引 |
| Live service config | `indexCacheManager` 缓存目录（如启用）| 缓存格式不变，无需处理 |
| OS-registered state | 无 | — |
| Secrets/env vars | 无 | — |
| Build artifacts | 无 | — |

**Nothing found in category:** 无 OS-registered state、Secrets、Build artifacts 需要处理。

## Common Pitfalls

### Pitfall 1: Module ID 不稳定
**What goes wrong:** 使用绝对路径作为 moduleId，在团队协作或 CI 环境中不一致
**Why it happens:** 不同开发者的工作区路径不同
**How to avoid:** 使用相对于 workspace root 的路径作为 moduleId，或计算路径的 hash
**Warning signs:** 单元测试中 hardcode 绝对路径

### Pitfall 2: 循环依赖 (ModuleResolver ↔ FastMappingEngine)
**What goes wrong:** ModuleResolver 需要读取文件，FastMappingEngine 需要 ModuleResolver 解析模块
**Why it happens:** 两者互相依赖
**How to avoid:** ModuleResolver 作为独立服务，在扫描前初始化；FastMappingEngine 接收 ModuleContext 作为参数，不直接依赖 ModuleResolver
**Warning signs:** import 语句中出现循环引用

### Pitfall 3: 单模块项目回归
**What goes wrong:** 改造后单模块项目的查询性能下降或行为变化
**Why it happens:** 复合键查询增加了字符串拼接开销；fallback 路径被意外触发
**How to avoid:** 单模块场景使用默认 moduleId（如 `"default"` 或 `""`），保持代码路径与改造前一致
**Warning signs:** 单模块项目的单元测试失败

### Pitfall 4: NavigationService 合并遗漏功能
**What goes wrong:** `FastNavigationService` 中有 `UnifiedNavigationService` 没有的功能，合并后丢失
**Why it happens:** 两个服务独立演进，功能不完全对齐
**How to avoid:** 详细对比两个服务的每个方法，确保合并后的服务包含所有功能
**Warning signs:** 某些导航场景行为异常

## Code Examples

### 当前索引结构（问题）
```typescript
// Source: fastMappingEngine.ts L52-66
/** 主索引：namespace -> mapping[] */
private namespaceIndex: Map<string, MappingIndex[]> = new Map();

/** 反向索引：javaPath -> namespace */
private javaPathIndex: Map<string, string> = new Map();

/** 反向索引：xmlPath -> namespace */
private xmlPathIndex: Map<string, string> = new Map();
```

### 当前查询方式（问题）
```typescript
// Source: fastMappingEngine.ts L272-296
public getByNamespace(
  namespace: string,
  referencePath?: string,
): MapperMapping | undefined {
  const mappings = this.namespaceIndex.get(namespace);
  if (!mappings || mappings.length === 0) {
    return undefined;
  }
  // 如果只有一个映射，直接返回
  if (mappings.length === 1) {
    return this.toMapperMapping(mappings[0]);
  }
  // 如果有多个映射，且有参考路径，使用路径相似度选择最佳匹配
  if (referencePath && mappings.length > 1) {
    const bestMatch = this.findBestMatchByPath(mappings, referencePath);
    if (bestMatch) {
      return this.toMapperMapping(bestMatch);
    }
  }
  // 有多个但没有参考路径，返回第一个（可能错误！）
  return this.toMapperMapping(mappings[0]);
}
```

### 当前调用点（需要修改）
```typescript
// Source: xmlCodeLensProvider.ts L62-63
// 传入当前 XML 文件路径作为参考路径
const mapping = this.mappingEngine.getByNamespace(xmlInfo.namespace, filePath);

// Source: unifiedNavigationService.ts L178
mapping = this.mappingEngine.getByNamespace(xmlInfo.namespace, xmlPath);

// Source: enterpriseScanner.ts L595-598
const existingMapping = this.mappingEngine.getByNamespace(
  mapper.namespace,
  filePath,
);
```

### 目标索引结构
```typescript
// Proposed design
/** 主索引：compositeKey -> MappingIndex (O(1)) */
private moduleNamespaceIndex: Map<string, MappingIndex> = new Map();

/** 反向索引：namespace -> moduleId[] (用于无模块上下文时的查找) */
private namespaceToModules: Map<string, string[]> = new Map();

/** 反向索引：javaPath -> compositeKey */
private javaPathIndex: Map<string, string> = new Map();

/** 反向索引：xmlPath -> compositeKey */
private xmlPathIndex: Map<string, string> = new Map();

private getCompositeKey(moduleId: string, namespace: string): string {
  return `${moduleId}::${namespace}`;
}
```

### 目标查询方式
```typescript
// Proposed design
public getByNamespace(
  namespace: string,
  context?: QueryContext,
): MapperMapping | undefined {
  // 优先使用模块上下文（O(1)）
  if (context?.moduleId) {
    const key = this.getCompositeKey(context.moduleId, namespace);
    const mapping = this.moduleNamespaceIndex.get(key);
    if (mapping) {
      return this.toMapperMapping(mapping);
    }
  }
  
  // Fallback: 使用 referencePath 进行路径相似度匹配
  if (context?.referencePath) {
    const modules = this.namespaceToModules.get(namespace);
    if (modules && modules.length > 0) {
      const candidates = modules
        .map(m => this.moduleNamespaceIndex.get(this.getCompositeKey(m, namespace)))
        .filter((m): m is MappingIndex => !!m);
      const bestMatch = this.findBestMatchByPath(candidates, context.referencePath);
      if (bestMatch) {
        return this.toMapperMapping(bestMatch);
      }
    }
  }
  
  // 最后的 fallback: 返回第一个（仅单模块场景）
  const modules = this.namespaceToModules.get(namespace);
  if (modules && modules.length > 0) {
    const first = this.moduleNamespaceIndex.get(this.getCompositeKey(modules[0], namespace));
    if (first) {
      return this.toMapperMapping(first);
    }
  }
  
  return undefined;
}
```

## State of the Art

| Old Approach | Current Approach | When Changed | Impact |
|--------------|------------------|--------------|--------|
| `namespace` 单键索引 | `namespace` + `referencePath` 数组存储 | v1.0.0+ | 补丁式修复，调用方责任重 |
| `FastNavigationService` 单独使用 | `UnifiedNavigationService` 统一使用 | v1.0.0+ | extension.ts 已统一使用 UnifiedNavigationService，但 FastNavigationService 代码仍在 |

**Deprecated/outdated:**
- `FastNavigationService`: 代码仍在但未被 `extension.ts` 使用，应合并到 `UnifiedNavigationService` 后删除
- `referencePath` 手动传递: 应改为引擎内部自动推断

## Assumptions Log

| # | Claim | Section | Risk if Wrong |
|---|-------|---------|---------------|
| A1 | Maven 多模块项目的模块边界可以通过 pom.xml 中的 `<modules>` 元素确定 | Module Detection Strategy | 某些项目使用扁平结构或自定义布局，可能无法正确识别 |
| A2 | Gradle 多项目结构的模块边界可以通过 settings.gradle 中的 `include` 确定 | Module Detection Strategy | Kotlin DSL (settings.gradle.kts) 语法不同，需要额外处理 |
| A3 | 使用 workspace root 相对路径作为 moduleId 在团队协作中足够稳定 | Index Structure Design | 如果团队成员使用不同的子目录结构，moduleId 可能不一致 |
| A4 | `UnifiedNavigationService` 已包含 `FastNavigationService` 的所有功能 | NavigationService Merge Plan | 如果遗漏功能，合并后会导致回归 |
| A5 | 单模块项目使用默认 moduleId 不会引入性能开销 | Index Structure Design | 字符串拼接和额外的 Map 查找可能有微小开销 |

## Open Questions [RESOLVED]

以下问题在 Phase 6 规划过程中已得到明确解答，结论已融入各 Plan 的设计中：

1. **ModuleResolver 缓存策略** — RESOLVED
   - Decision: 初始实现不添加文件监听，每次扫描前重新解析（P01-T4 明确说明）
   - Rationale: 模块结构变更频率低，监听机制可在后续优化阶段添加

2. **无构建文件项目的模块识别** — RESOLVED
   - Decision: 使用 "default" 作为单模块项目的 moduleId（P01-T2 明确说明）
   - Rationale: 保持向后兼容，避免引入不必要的复杂度

3. **嵌套模块的边界处理** — RESOLVED
   - Decision: 归属到最近的模块（P01-T2 明确说明）
   - Rationale: 最直观的语义，与文件系统组织结构一致

## Environment Availability

| Dependency | Required By | Available | Version | Fallback |
|------------|------------|-----------|---------|----------|
| VS Code API | Extension runtime | ✓ | ^1.85.0 | — |
| Node.js fs/promises | ModuleResolver 文件读取 | ✓ | built-in | — |
| redhat.java extension | Java 符号 API | ✓ | extension dependency | 部分功能降级 |

**Missing dependencies with no fallback:** 无

**Missing dependencies with fallback:** 无

## Validation Architecture

### Test Framework
| Property | Value |
|----------|-------|
| Framework | `@vscode/test-cli` (项目已有配置) |
| Config file | 未明确配置 |
| Quick run command | `npm run test` |
| Full suite command | `npm run test` |

### Phase Requirements → Test Map

基于 PLAN.md 的 6 个 Plan：

| Req ID | Behavior | Test Type | Automated Command | File Exists? |
|--------|----------|-----------|-------------------|-------------|
| P1-01 | ModuleResolver 正确识别 Maven 多模块结构 | unit | 需新建 | ❌ Wave 0 |
| P1-02 | ModuleResolver 正确识别 Gradle 多项目结构 | unit | 需新建 | ❌ Wave 0 |
| P1-03 | ModuleResolver 对无构建文件项目返回 default 模块 | unit | 需新建 | ❌ Wave 0 |
| P2-01 | 同名 namespace 在不同模块可独立索引 | unit | 需新建 | ❌ Wave 0 |
| P2-02 | 复合键查询保持 O(1) | unit | 需新建 | ❌ Wave 0 |
| P2-03 | 无模块信息时 fallback 路径正常工作 | unit | 需新建 | ❌ Wave 0 |
| P3-01 | 扫描阶段正确传递模块上下文 | integration | 需新建 | ❌ Wave 0 |
| P4-01 | QueryContext 从活动编辑器正确推断 | unit | 需新建 | ❌ Wave 0 |
| P4-02 | 所有调用方不再需要手动传入 referencePath | static analysis | 需新建 | ❌ Wave 0 |
| P5-01 | 合并后的 NavigationService 包含所有功能 | unit | 需新建 | ❌ Wave 0 |
| P6-01 | 单模块项目行为无回归 | integration | 需新建 | ❌ Wave 0 |
| P6-02 | 多模块项目同名 Mapper 正确跳转 | integration | 需新建 | ❌ Wave 0 |

### Sampling Rate
- **Per task commit:** `npm run compile` + `npm run lint`
- **Per wave merge:** `npm run test` (如有测试) + 手动验证多模块场景
- **Phase gate:** 全量编译通过 + lint 无错误 + 手动验证单模块/多模块场景

### Wave 0 Gaps
- [ ] `src/features/mapping/__tests__/moduleResolver.test.ts` — 模块解析单元测试
- [ ] `src/features/mapping/__tests__/fastMappingEngine.test.ts` — 引擎索引和查询单元测试
- [ ] `src/features/mapping/__tests__/queryContext.test.ts` — 查询上下文推断单元测试
- [ ] `src/test/suite/navigation.test.ts` — 导航集成测试（如已有则复用）
- [ ] 测试框架配置确认 — 项目使用 `@vscode/test-cli`，需确认测试目录结构

*(CLAUDE.md 已说明：No unit tests for core parsers, mapping engine. 本项目测试基础设施薄弱，需新建)*

## Security Domain

> 本阶段为纯重构，不涉及新的安全敏感功能。现有安全考虑：

### Applicable ASVS Categories

| ASVS Category | Applies | Standard Control |
|---------------|---------|-----------------|
| V5 Input Validation | yes | 路径规范化（已使用 NFC + toLowerCase） |

### Known Threat Patterns

| Pattern | STRIDE | Standard Mitigation |
|---------|--------|---------------------|
| 路径遍历（ModuleResolver 读取 pom.xml） | Tampering | 使用 `path.join` + `fs.access` 验证文件存在性，不执行用户控制的路径 |
| 正则表达式 DoS（路径匹配） | Denial of Service | 路径相似度算法使用简单循环，非回溯正则 |

## Sources

### Primary (HIGH confidence)
- `fastMappingEngine.ts` (1254 lines) - 完整索引结构、查询逻辑、路径相似度算法
- `fastNavigationService.ts` (465 lines) - 导航服务实现
- `unifiedNavigationService.ts` (795 lines) - 统一导航服务实现
- `fastScanner.ts` (928 lines) - 扫描器实现、路径相似度算法
- `enterpriseScanner.ts` (635 lines) - 企业级扫描器实现
- `xmlCodeLensProvider.ts` (151 lines) - XML CodeLens 实现
- `extension.ts` (1000+ lines) - 服务注册和初始化
- `index.ts` - 导出结构

### Secondary (MEDIUM confidence)
- PLAN.md - 阶段目标和计划
- CLAUDE.md - 项目架构和已知技术债务

## Metadata

**Confidence breakdown:**
- Standard stack: HIGH - 基于现有代码分析，无新依赖
- Architecture: HIGH - 完整阅读了所有核心文件
- Pitfalls: MEDIUM - 基于代码分析推断，需实际验证

**Research date:** 2026-04-21
**Valid until:** 2026-05-21 (稳定架构，30天有效期)
