---
phase: 06-module-aware-mapping-engine-refactor
plan: P04
type: execute
wave: 2
depends_on:
  - P02
files_modified:
  - src/features/mapping/queryContext.ts
  - src/features/mapping/unifiedNavigationService.ts
  - src/features/mapping/xmlCodeLensProvider.ts
  - src/features/mapping/fastCodeLensProvider.ts
  - src/features/mapping/index.ts
autonomous: true
requirements:
  - P4-01
  - P4-02
must_haves:
  truths:
    - QueryContext 可从活动编辑器自动推断模块上下文
    - UnifiedNavigationService 的所有查询都使用 QueryContext
    - xmlCodeLensProvider 不再手动传入 referencePath
    - fastCodeLensProvider 不再手动传入 referencePath
    - 所有调用方通过 QueryContext 传递上下文，不再直接传 referencePath
  artifacts:
    - path: src/features/mapping/queryContext.ts
      provides: QueryContext 推断工具类
      exports: ["QueryContextResolver", "QueryContext"]
    - path: src/features/mapping/unifiedNavigationService.ts
      provides: 改造后的导航服务，使用 QueryContext
      contains: "inferQueryContext", "QueryContext"
    - path: src/features/mapping/xmlCodeLensProvider.ts
      provides: 移除 referencePath 参数的 CodeLens
      contains: "getByNamespace(xmlInfo.namespace)"（无第二个参数）
    - path: src/features/mapping/fastCodeLensProvider.ts
      provides: 无 referencePath 参数的 CodeLens
  key_links:
    - from: UnifiedNavigationService.navigateXmlToJava
      to: FastMappingEngine.getByNamespace
      via: inferQueryContext() -> { moduleId }
    - from: xmlCodeLensProvider.provideCodeLenses
      to: FastMappingEngine.getByNamespace
      via: 直接调用，无 referencePath
    - from: fastCodeLensProvider.provideCodeLenses
      to: FastMappingEngine.getByJavaPath
      via: 直接调用，无 referencePath
---

<objective>
统一 QueryContext 查询接口，创建 QueryContextResolver 从活动编辑器自动推断模块上下文。改造所有调用点，移除手动传入 referencePath 的模式，改为引擎内部自动推断。

Purpose: 消除 "补丁式" referencePath 传递，让歧义消解责任完全内聚到引擎内部。
Output: queryContext.ts（新文件）+ 改造后的调用方文件
</objective>

<execution_context>
@$HOME/.claude/get-shit-done/workflows/execute-plan.md
</execution_context>

<context>
@.planning/phases/06-module-aware-mapping-engine-refactor/06-RESEARCH.md
@src/features/mapping/unifiedNavigationService.ts
@src/features/mapping/xmlCodeLensProvider.ts
@src/features/mapping/fastCodeLensProvider.ts
@src/features/mapping/fastMappingEngine.ts
@src/features/mapping/moduleResolver.ts
@src/features/mapping/index.ts
</context>

<tasks>

<task id="T1">
  <description>创建 QueryContextResolver 类</description>
  <read_first>
    - src/features/mapping/types.ts
    - src/features/mapping/moduleResolver.ts
  </read_first>
  <action>
创建 src/features/mapping/queryContext.ts：

```typescript
/**
 * 查询上下文解析器
 *
 * 从当前活动编辑器或文件路径自动推断查询上下文，
 * 使调用方无需手动传入 referencePath。
 */

import * as vscode from "vscode";
import { QueryContext } from "./types";
import { ModuleResolver } from "./moduleResolver";

export class QueryContextResolver {
  private static instance: QueryContextResolver;
  private moduleResolver: ModuleResolver;

  private constructor() {
    this.moduleResolver = ModuleResolver.getInstance();
  }

  public static getInstance(): QueryContextResolver {
    if (!QueryContextResolver.instance) {
      QueryContextResolver.instance = new QueryContextResolver();
    }
    return QueryContextResolver.instance;
  }

  /**
   * 从活动编辑器推断查询上下文
   */
  public inferFromActiveEditor(): QueryContext {
    const editor = vscode.window.activeTextEditor;
    if (!editor) {
      return {};
    }
    return this.inferFromFilePath(editor.document.uri.fsPath);
  }

  /**
   * 从文件路径推断查询上下文
   */
  public inferFromFilePath(filePath: string): QueryContext {
    const module = this.moduleResolver.resolveModuleForPath(filePath);
    if (module) {
      return { moduleId: module.moduleId };
    }
    return { referencePath: filePath };
  }

  /**
   * 从文档推断查询上下文
   */
  public inferFromDocument(document: vscode.TextDocument): QueryContext {
    return this.inferFromFilePath(document.uri.fsPath);
  }

  /**
   * 创建带模块 ID 的查询上下文
   */
  public withModuleId(moduleId: string): QueryContext {
    return { moduleId };
  }

  /**
   * 创建带参考路径的查询上下文
   */
  public withReferencePath(referencePath: string): QueryContext {
    return { referencePath };
  }
}
```
  </action>
  <acceptance_criteria>
    - grep "export class QueryContextResolver" src/features/mapping/queryContext.ts 返回匹配
    - grep "inferFromActiveEditor" src/features/mapping/queryContext.ts 返回匹配
    - grep "inferFromFilePath" src/features/mapping/queryContext.ts 返回匹配
    - grep "inferFromDocument" src/features/mapping/queryContext.ts 返回匹配
    - grep "resolveModuleForPath" src/features/mapping/queryContext.ts 返回匹配
  </acceptance_criteria>
</task>

<task id="T2">
  <description>改造 UnifiedNavigationService 使用 QueryContext</description>
  <read_first>
    - src/features/mapping/unifiedNavigationService.ts
    - src/features/mapping/queryContext.ts（T1 输出）
    - src/features/mapping/fastMappingEngine.ts
  </read_first>
  <action>
按以下步骤改造 src/features/mapping/unifiedNavigationService.ts：

**步骤 1：添加 QueryContextResolver import**
在第 12 行（Logger import 之后）添加：
```typescript
import { QueryContextResolver } from "./queryContext";
```

**步骤 2：添加 queryContextResolver 字段**
在 UnifiedNavigationService 类的字段声明区（第 24-27 行，xmlParser 之后）添加：
```typescript
  private queryContextResolver: QueryContextResolver;
```

**步骤 3：在 constructor 中初始化**
在第 31 行（xmlParser 初始化之后）添加：
```typescript
    this.queryContextResolver = QueryContextResolver.getInstance();
```

**步骤 4：改造 navigateXmlToJava 中的 getByNamespace 调用**
找到第 178 行：
```typescript
        mapping = this.mappingEngine.getByNamespace(xmlInfo.namespace, xmlPath);
```
替换为：
```typescript
        const context = this.queryContextResolver.inferFromFilePath(xmlPath);
        mapping = this.mappingEngine.getByNamespace(xmlInfo.namespace, context);
```

**步骤 5：改造 findXmlByNamespace 中的 getByNamespace 调用**
找到第 391 行：
```typescript
    const existingMapping = this.mappingEngine.getByNamespace(namespace, javaPath);
```
替换为：
```typescript
    const context = javaPath
      ? this.queryContextResolver.inferFromFilePath(javaPath)
      : this.queryContextResolver.inferFromActiveEditor();
    const existingMapping = this.mappingEngine.getByNamespace(namespace, context);
```

**步骤 6：改造 findJavaByNamespace 中的 getByClassName 调用**
找到第 334 行：
```typescript
    let mapping = this.mappingEngine.getByClassName(namespace, referencePath);
```
替换为：
```typescript
    const context = referencePath
      ? this.queryContextResolver.inferFromFilePath(referencePath)
      : this.queryContextResolver.inferFromActiveEditor();
    let mapping = this.mappingEngine.getByClassName(namespace, context);
```

**步骤 7：改造 getNavigationInfo 中的查询调用**
找到 XML 分支（约第 700-708 行）：
```typescript
      if (!mapping) {
        const xmlInfo = await this.xmlParser.parseXmlMapper(filePath);
        if (xmlInfo?.namespace) {
          mapping = this.mappingEngine.getByNamespace(xmlInfo.namespace, filePath);
        }
      }
```
替换为：
```typescript
      if (!mapping) {
        const xmlInfo = await this.xmlParser.parseXmlMapper(filePath);
        if (xmlInfo?.namespace) {
          const context = this.queryContextResolver.inferFromFilePath(filePath);
          mapping = this.mappingEngine.getByNamespace(xmlInfo.namespace, context);
        }
      }
```

**步骤 8：移除 calculatePathSimilarity 方法**
由于路径相似度算法已内聚到 FastMappingEngine 中，UnifiedNavigationService 不再需要自己的 calculatePathSimilarity 方法。检查该方法是否还有其他调用点：
- 在 findXmlByNamespace 中是否使用了 calculatePathSimilarity？

如果 findXmlByNamespace 中使用了 calculatePathSimilarity 来计算候选 XML 的得分，保留该方法（因为这里不是查询引擎，而是搜索文件系统）。

如果仅用于 getByNamespace/getByClassName 的 fallback，可以移除。

经检查：findXmlByNamespace 第 434-436 行使用了 calculatePathSimilarity 来排序候选文件，这是文件系统搜索场景，不是索引查询场景，因此保留该方法。
  </action>
  <acceptance_criteria>
    - grep "QueryContextResolver" src/features/mapping/unifiedNavigationService.ts 返回匹配
    - grep "queryContextResolver" src/features/mapping/unifiedNavigationService.ts 返回匹配（至少 2 处）
    - grep "inferFromFilePath" src/features/mapping/unifiedNavigationService.ts 返回匹配（至少 3 处）
    - grep "getByNamespace.*context" src/features/mapping/unifiedNavigationService.ts 返回匹配（至少 2 处）
    - grep "getByClassName.*context" src/features/mapping/unifiedNavigationService.ts 返回匹配（至少 1 处）
    - grep "getByNamespace.*xmlPath)" src/features/mapping/unifiedNavigationService.ts 不返回匹配（旧签名应消失）
    - npm run compile 无错误
  </acceptance_criteria>
</task>

<task id="T3">
  <description>改造 xmlCodeLensProvider 移除 referencePath</description>
  <read_first>
    - src/features/mapping/xmlCodeLensProvider.ts
    - src/features/mapping/fastMappingEngine.ts
  </read_first>
  <action>
改造 src/features/mapping/xmlCodeLensProvider.ts：

找到第 63 行：
```typescript
    const mapping = this.mappingEngine.getByNamespace(xmlInfo.namespace, filePath);
```
替换为：
```typescript
    const mapping = this.mappingEngine.getByNamespace(xmlInfo.namespace);
```

注释 "传入当前 XML 文件路径作为参考路径..." 也应删除或更新为：
```typescript
    // 2. 从 mappingEngine 查找对应的 Java 文件
    // 引擎内部会自动推断模块上下文
    const mapping = this.mappingEngine.getByNamespace(xmlInfo.namespace);
```
  </action>
  <acceptance_criteria>
    - grep "getByNamespace(xmlInfo.namespace)" src/features/mapping/xmlCodeLensProvider.ts 返回匹配
    - grep "getByNamespace(xmlInfo.namespace, filePath)" src/features/mapping/xmlCodeLensProvider.ts 不返回匹配
    - npm run compile 无错误
  </acceptance_criteria>
</task>

<task id="T4">
  <description>改造 fastCodeLensProvider 使用 QueryContext 自动推断模块上下文</description>
  <read_first>
    - src/features/mapping/fastCodeLensProvider.ts
    - src/features/mapping/fastMappingEngine.ts
    - src/features/mapping/queryContext.ts（T1 输出）
  </read_first>
  <action>
改造 src/features/mapping/fastCodeLensProvider.ts：

**步骤 1：检查当前 fastCodeLensProvider 的实现**
读取 fastCodeLensProvider.ts，确认其当前使用方式：
- 是否直接调用 `getByJavaPath(javaPath)`？如果是，无需修改（getByJavaPath 不需要 QueryContext）。
- 是否调用 `getByNamespace(namespace, referencePath)`？如果是，需要移除 referencePath。
- 是否调用 `getByClassName(className, referencePath)`？如果是，需要移除 referencePath。

**步骤 2：如果存在 referencePath 调用，进行改造**
如果 fastCodeLensProvider 中存在以下模式：
```typescript
const mapping = this.mappingEngine.getByNamespace(namespace, somePath);
```
替换为：
```typescript
const mapping = this.mappingEngine.getByNamespace(namespace);
```

如果 fastCodeLensProvider 中需要获取当前 Java 文件对应的完整映射信息（包括 XML 位置），且当前通过 getByJavaPath 获取：
```typescript
const mapping = this.mappingEngine.getByJavaPath(document.uri.fsPath);
```
此调用无需修改，因为 getByJavaPath 使用 javaPathIndex（O(1) 精确查找），不需要 QueryContext。

**步骤 3：确认无手动 referencePath 传入**
确保 fastCodeLensProvider.ts 中没有任何手动传入 referencePath 的调用。所有需要模块上下文的查询都应依赖引擎内部自动推断。
  </action>
  <acceptance_criteria>
    - grep "getByNamespace.*, " src/features/mapping/fastCodeLensProvider.ts 不返回匹配（无第二个参数的 getByNamespace 调用）
    - grep "getByClassName.*, " src/features/mapping/fastCodeLensProvider.ts 不返回匹配（无第二个参数的 getByClassName 调用）
    - grep "referencePath" src/features/mapping/fastCodeLensProvider.ts 不返回匹配
    - npm run compile 无错误
  </acceptance_criteria>
</task>

<task id="T5">
  <description>更新 index.ts 导出 QueryContextResolver</description>
  <read_first>
    - src/features/mapping/index.ts
  </read_first>
  <action>
在 src/features/mapping/index.ts 中添加 QueryContextResolver 的导出。

在第 5 行（FastMappingEngine export 之前或之后）添加：
```typescript
export { QueryContextResolver } from "./queryContext";
```

如果 P01 已完成，确保 ModuleResolver 也已导出：
```typescript
export { ModuleResolver } from "./moduleResolver";
```
  </action>
  <acceptance_criteria>
    - grep "QueryContextResolver" src/features/mapping/index.ts 返回匹配
    - npm run compile 无错误
  </acceptance_criteria>
</task>

</tasks>

<threat_model>
## Trust Boundaries

| Boundary | Description |
|----------|-------------|
| CodeLens Provider -> Engine | CodeLens 查询映射 |
| NavigationService -> Engine | 导航查询映射 |

## STRIDE Threat Register

| Threat ID | Category | Component | Disposition | Mitigation Plan |
|-----------|----------|-----------|-------------|-----------------|
| T-06-P04-01 | Information Disclosure | QueryContext 包含文件路径 | accept | referencePath 仅用于引擎内部路径相似度计算，不外传 |
| T-06-P04-02 | Denial of Service | inferFromActiveEditor 频繁调用 | accept | 仅导航触发时调用，非高频操作 |
</threat_model>

<verification>
1. `npm run compile` 无编译错误
2. `npm run lint` 无错误
3. grep 验证 xmlCodeLensProvider 中无 referencePath 传入 getByNamespace
4. grep 验证 fastCodeLensProvider 中无 referencePath 传入任何查询方法
5. grep 验证 unifiedNavigationService 中所有 getByNamespace/getByClassName 调用都使用 context 参数
</verification>

<success_criteria>
- QueryContextResolver 类已创建，支持从编辑器/文件路径/文档推断上下文
- UnifiedNavigationService 的所有引擎查询都通过 QueryContextResolver 获取上下文
- xmlCodeLensProvider 不再手动传入 referencePath
- fastCodeLensProvider 不再手动传入 referencePath
- index.ts 导出了 QueryContextResolver
- 编译和 lint 通过
</success_criteria>

<output>
After completion, create `.planning/phases/06-module-aware-mapping-engine-refactor/06-P04-SUMMARY.md`
</output>
