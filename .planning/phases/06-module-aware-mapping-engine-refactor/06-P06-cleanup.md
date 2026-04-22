---
phase: 06-module-aware-mapping-engine-refactor
plan: P06
type: execute
wave: 4
depends_on:
  - P05
files_modified:
  - src/features/mapping/fastMappingEngine.ts
  - src/features/mapping/unifiedNavigationService.ts
  - src/features/mapping/fastScanner.ts
  - src/features/mapping/enterpriseScanner.ts
  - src/features/mapping/xmlCodeLensProvider.ts
  - src/features/mapping/fastCodeLensProvider.ts
  - src/features/mapping/index.ts
  - src/extension.ts
autonomous: true
requirements:
  - P6-01
  - P6-02
must_haves:
  truths:
    - 所有旧版 referencePath 参数调用已移除
    - 单模块项目导航行为无回归
    - 多模块项目同名 Mapper 能正确跳转到对应模块的 XML
    - 所有文件编译通过
    - lint 无错误
  artifacts:
    - path: src/features/mapping/fastMappingEngine.ts
      provides: 无旧版数组索引残留
      contains: "moduleNamespaceIndex", 不包含 "namespaceIndex: Map<string, MappingIndex[]>"
    - path: src/features/mapping/
      provides: 完整的模块感知映射系统
      contains: "ModuleResolver", "QueryContextResolver", "moduleNamespaceIndex"
  key_links:
    - from: Scanner
      to: FastMappingEngine
      via: buildMapping(java, xml, moduleId)
    - from: NavigationService
      to: FastMappingEngine
      via: getByNamespace(ns, { moduleId })
---

<objective>
清理所有补丁代码和旧接口残留，验证单模块和多模块场景的行为正确性。进行最终的全量检查，确保重构彻底完成。

Purpose: 消除技术债务，确保没有遗留的旧代码路径。
Output: 清理后的代码库 + 验证通过
</objective>

<execution_context>
@$HOME/.claude/get-shit-done/workflows/execute-plan.md
</execution_context>

<context>
@.planning/phases/06-module-aware-mapping-engine-refactor/06-RESEARCH.md
@src/features/mapping/fastMappingEngine.ts
@src/features/mapping/unifiedNavigationService.ts
@src/features/mapping/fastScanner.ts
@src/features/mapping/enterpriseScanner.ts
@src/features/mapping/xmlCodeLensProvider.ts
@src/features/mapping/fastCodeLensProvider.ts
@src/features/mapping/index.ts
@src/extension.ts
</context>

<tasks>

<task id="T1">
  <description>全量检查并移除旧版 referencePath 调用</description>
  <read_first>
    - src/features/mapping/fastMappingEngine.ts
    - src/features/mapping/unifiedNavigationService.ts
    - src/features/mapping/fastScanner.ts
    - src/features/mapping/enterpriseScanner.ts
    - src/features/mapping/xmlCodeLensProvider.ts
    - src/features/mapping/fastCodeLensProvider.ts
  </read_first>
  <action>
搜索整个 src/features/mapping/ 目录中所有旧版 referencePath 调用模式：

```bash
grep -rn "getByNamespace.*referencePath" src/features/mapping/
grep -rn "getByClassName.*referencePath" src/features/mapping/
grep -rn "getByNamespace.*, .*Path)" src/features/mapping/
grep -rn "namespaceIndex: Map<string, MappingIndex\[\]>" src/features/mapping/
```

对于每个匹配，判断是否应移除或改造：

1. **FastMappingEngine 内部**：确保没有旧版 `namespaceIndex: Map<string, MappingIndex[]>` 的残留定义。

2. **调用方检查**：
   - xmlCodeLensProvider.ts：确认 `getByNamespace(xmlInfo.namespace)` 无第二个参数
   - fastCodeLensProvider.ts：检查是否有 getByNamespace 调用（通常没有，它使用 getByJavaPath）
   - unifiedNavigationService.ts：确认所有调用都使用 QueryContext
   - fastScanner.ts：确认 buildMappings 传递 moduleId
   - enterpriseScanner.ts：确认 buildMappings 传递 moduleId

3. **移除旧版注释**：搜索并移除提到 "referencePath" 的旧版注释（如果它们描述的是已移除的机制）。

4. **检查 extension.ts**：
   ```bash
   grep -n "referencePath" src/extension.ts
   grep -n "FastNavigationService" src/extension.ts
   grep -n "fastNavigationService" src/extension.ts
   ```
   确保无残留引用。

5. **检查 index.ts**：
   ```bash
   grep -n "FastNavigationService" src/features/mapping/index.ts
   ```
   确保已移除导出。
  </action>
  <acceptance_criteria>
    - grep -r "getByNamespace.*, .*Path)" src/features/mapping/ 不返回匹配（除了使用 QueryContext 的调用）
    - grep -r "namespaceIndex: Map<string, MappingIndex\[\]>" src/features/mapping/ 不返回匹配
    - grep -r "FastNavigationService" src/features/mapping/ 不返回匹配
    - grep -r "FastNavigationService" src/extension.ts 不返回匹配
  </acceptance_criteria>
</task>

<task id="T2">
  <description>验证编译和 lint 通过</description>
  <read_first>
    - package.json（确认 lint 和 compile 命令）
  </read_first>
  <action>
运行以下命令验证代码质量：

```bash
npm run compile
```

如果编译通过，继续运行：
```bash
npm run lint
```

如果 lint 有错误，修复所有错误。常见可能需要修复的问题：
1. 未使用的 import（如 FastNavigationService 的 import）
2. 未使用的变量（如旧版索引变量）
3. 类型不匹配（如 QueryContext 的 optional 字段）

特别注意检查：
- `src/features/mapping/index.ts` 中是否有未使用的导出
- `src/extension.ts` 中是否有未使用的 import
  </action>
  <acceptance_criteria>
    - npm run compile 返回 0 退出码
    - npm run lint 返回 0 退出码（无 error）
  </acceptance_criteria>
</task>

<task id="T3">
  <description>验证关键接口一致性</description>
  <read_first>
    - src/features/mapping/fastMappingEngine.ts
    - src/features/mapping/types.ts
  </read_first>
  <action>
验证以下接口一致性：

1. **buildMapping 签名**：
   ```typescript
   public buildMapping(
     javaInfo: JavaMapperInfo,
     xmlInfo?: XmlMapperInfo,
     moduleId: string = "default",
   ): MappingIndex
   ```
   确认 fastMappingEngine.ts 中该签名存在。

2. **buildMappings 签名**：
   ```typescript
   public buildMappings(
     pairs: Array<{ java: JavaMapperInfo; xml?: XmlMapperInfo; moduleId?: string }>,
   ): void
   ```
   确认签名存在。

3. **getByNamespace 签名**：
   ```typescript
   public getByNamespace(
     namespace: string,
     context?: QueryContext,
   ): MapperMapping | undefined
   ```
   确认签名存在。

4. **QueryContext 定义**：
   ```typescript
   export interface QueryContext {
     moduleId?: string;
     referencePath?: string;
   }
   ```
   确认 types.ts 中存在。

5. **ModuleContext 定义**：
   ```typescript
   export interface ModuleContext {
     moduleId: string;
     modulePath: string;
     type: "maven" | "gradle" | "simple";
     buildFile?: string;
     sourceRoots: string[];
     resourceRoots: string[];
   }
   ```
   确认 types.ts 中存在。

6. **导出检查**：
   确认 index.ts 导出了所有新模块：
   - ModuleResolver
   - QueryContextResolver
   - FastMappingEngine
   - FastScanner
   - EnterpriseScanner
   - UnifiedNavigationService
   - XmlCodeLensProvider
   - FastCodeLensProvider
  </action>
  <acceptance_criteria>
    - grep "moduleId: string = \"default\"" src/features/mapping/fastMappingEngine.ts 返回匹配
    - grep "moduleId?: string" src/features/mapping/fastMappingEngine.ts 返回匹配
    - grep "context?: QueryContext" src/features/mapping/fastMappingEngine.ts 返回匹配
    - grep "export interface QueryContext" src/features/mapping/types.ts 返回匹配
    - grep "export interface ModuleContext" src/features/mapping/types.ts 返回匹配
    - grep "ModuleResolver" src/features/mapping/index.ts 返回匹配
    - grep "QueryContextResolver" src/features/mapping/index.ts 返回匹配
  </acceptance_criteria>
</task>

</tasks>

<threat_model>
## Trust Boundaries

| Boundary | Description |
|----------|-------------|
| Cleanup -> Runtime | 清理操作不应影响运行时行为 |

## STRIDE Threat Register

| Threat ID | Category | Component | Disposition | Mitigation Plan |
|-----------|----------|-----------|-------------|-----------------|
| T-06-P06-01 | Denial of Service | 清理时误删必要代码 | mitigate | 通过编译和 lint 验证；grep 检查关键接口 |
| T-06-P06-02 | Information Disclosure | 无 | — | 本阶段无新增安全影响 |
</threat_model>

<verification>
1. `npm run compile` 无编译错误
2. `npm run lint` 无错误
3. 全量 grep 确认无旧代码残留
4. 关键接口签名验证通过
</verification>

<success_criteria>
- 所有旧版 referencePath 手动传递已移除
- FastNavigationService 文件已删除且无残留引用
- 所有新接口（ModuleResolver、QueryContextResolver、复合键索引）工作正常
- 编译和 lint 通过
- 单模块项目使用 "default" moduleId 无回归
- 多模块项目同名 Mapper 通过 moduleId 精确区分
</success_criteria>

<output>
After completion, create `.planning/phases/06-module-aware-mapping-engine-refactor/06-P06-SUMMARY.md`
</output>
