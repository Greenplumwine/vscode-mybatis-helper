---
phase: 06-module-aware-mapping-engine-refactor
plan: P05
type: execute
wave: 3
depends_on:
  - P04
files_modified:
  - src/features/mapping/unifiedNavigationService.ts
  - src/features/mapping/fastNavigationService.ts
  - src/features/mapping/index.ts
  - src/extension.ts
autonomous: true
requirements:
  - P5-01
must_haves:
  truths:
    - UnifiedNavigationService 包含 FastNavigationService 的所有功能
    - FastNavigationService 文件被删除
    - extension.ts 中所有 FastNavigationService 引用已移除
    - 合并后的服务无功能回归
  artifacts:
    - path: src/features/mapping/unifiedNavigationService.ts
      provides: 合并后的统一导航服务
      contains: "navigateJavaToXml", "navigateXmlToJava", "getNavigationInfo", "canNavigate"
    - path: src/features/mapping/fastNavigationService.ts
      provides: 已删除
      contains: "文件不存在"
    - path: src/extension.ts
      provides: 仅引用 UnifiedNavigationService
      contains: "UnifiedNavigationService", 不包含 "FastNavigationService"
  key_links:
    - from: extension.ts navigationService
      to: UnifiedNavigationService
      via: getInstance()
---

<objective>
合并 FastNavigationService 到 UnifiedNavigationService 中，确保合并后的服务包含所有功能，然后删除 FastNavigationService 文件并更新所有引用。

Purpose: 消除两个导航服务并存造成的维护负担和混淆。extension.ts 已使用 UnifiedNavigationService，但 FastNavigationService 代码仍在，需要彻底清理。
Output: 增强后的 unifiedNavigationService.ts + 删除 fastNavigationService.ts + 更新 index.ts 和 extension.ts
</objective>

<execution_context>
@$HOME/.claude/get-shit-done/workflows/execute-plan.md
</execution_context>

<context>
@.planning/phases/06-module-aware-mapping-engine-refactor/06-RESEARCH.md
@src/features/mapping/fastNavigationService.ts
@src/features/mapping/unifiedNavigationService.ts
@src/features/mapping/index.ts
@src/extension.ts
</context>

<tasks>

<task id="T1">
  <description>对比两个导航服务，将 FastNavigationService 的独有功能合并到 UnifiedNavigationService</description>
  <read_first>
    - src/features/mapping/fastNavigationService.ts
    - src/features/mapping/unifiedNavigationService.ts
  </read_first>
  <action>
对比 FastNavigationService 和 UnifiedNavigationService 的方法列表，找出 FastNavigationService 有但 UnifiedNavigationService 没有的功能：

**FastNavigationService 独有功能：**
1. `recentMappings` 缓存（最近使用的映射缓存）
2. `MAX_RECENT` 常量
3. `updateRecentCache` 方法
4. `getDiagnostics` 返回 recentCacheSize

**UnifiedNavigationService 已有功能：**
1. `navigateJavaToXml` - 两者都有
2. `navigateXmlToJava` - 两者都有
3. `getNavigationInfo` - 两者都有
4. `canNavigate` - 两者都有
5. `parseAndMapJavaFile` - Unified 独有
6. `findJavaByNamespace` - Unified 独有
7. `findMethodPositionDynamically` - Unified 独有

**需要合并到 UnifiedNavigationService 的功能：**

**步骤 1：添加 recentMappings 缓存**
在 UnifiedNavigationService 的字段声明区添加：
```typescript
  // 缓存最近使用的映射，加速重复跳转
  private recentMappings: Map<string, string> = new Map(); // javaPath -> xmlPath
  private readonly MAX_RECENT = 50;
```

**步骤 2：添加 updateRecentCache 方法**
在 UnifiedNavigationService 的私有方法区添加：
```typescript
  /**
   * 更新最近使用缓存
   */
  private updateRecentCache(javaPath: string, xmlPath: string): void {
    this.recentMappings.set(javaPath, xmlPath);

    // 限制缓存大小
    if (this.recentMappings.size > this.MAX_RECENT) {
      const firstKey = this.recentMappings.keys().next().value;
      if (firstKey) {
        this.recentMappings.delete(firstKey);
      }
    }
  }
```

**步骤 3：在 navigateJavaToXml 中使用缓存**
在 navigateJavaToXml 方法中，找到执行跳转后的位置（第 128 行附近），在 `await this.openAndReveal(...)` 之后添加缓存更新：
```typescript
      // 5. 更新缓存
      this.updateRecentCache(javaPath, mapping.xmlPath!);
```

注意：FastNavigationService 的 navigateJavaToXml 中缓存更新在第 115 行（openAndReveal 之后）。UnifiedNavigationService 中对应位置在第 128 行之后。

**步骤 4：在 navigateJavaToXml 开头添加缓存检查**
在 navigateJavaToXml 方法开头（获取 mapping 之前），添加缓存快速路径：
```typescript
    // 0. 检查缓存 - O(1)
    const cachedXmlPath = this.recentMappings.get(javaPath);
    if (cachedXmlPath) {
      try {
        await vscode.workspace.fs.stat(vscode.Uri.file(cachedXmlPath));
        // 缓存有效，直接跳转
        const targetPosition = methodName
          ? this.findMethodPositionInXml(
              { javaPath, xmlPath: cachedXmlPath, namespace: "", methods: new Map(), lastUpdated: 0 },
              methodName,
            )
          : undefined;
        await this.openAndReveal(cachedXmlPath, targetPosition, options);
        this.logger?.debug(`Navigation completed from cache in ${Date.now() - startTime}ms`);
        return true;
      } catch {
        // 缓存文件已不存在，继续正常流程
        this.recentMappings.delete(javaPath);
      }
    }
```

注意：这个缓存快速路径需要构造一个临时的 MapperMapping 来调用 findMethodPositionInXml。更好的方式是在缓存命中时直接通过 javaPath 获取 mapping：

```typescript
    // 0. 检查缓存 - O(1)
    const cachedXmlPath = this.recentMappings.get(javaPath);
    if (cachedXmlPath) {
      try {
        await vscode.workspace.fs.stat(vscode.Uri.file(cachedXmlPath));
        // 缓存有效，获取完整 mapping 信息
        const mapping = this.mappingEngine.getByJavaPath(javaPath);
        if (mapping?.xmlPath === cachedXmlPath) {
          const targetPosition = methodName
            ? this.findMethodPositionInXml(mapping, methodName)
            : undefined;
          await this.openAndReveal(cachedXmlPath, targetPosition, options);
          this.logger?.debug(`Navigation completed from cache in ${Date.now() - startTime}ms`);
          return true;
        }
      } catch {
        // 缓存文件已不存在
        this.recentMappings.delete(javaPath);
      }
    }
```

**步骤 5：更新 getDiagnostics 方法**
将 UnifiedNavigationService 的 getDiagnostics 替换为：
```typescript
  public getDiagnostics(): object {
    return {
      recentCacheSize: this.recentMappings.size,
      engineDiagnostics: this.mappingEngine.getDiagnostics(),
    };
  }
```

**步骤 6：确保所有 FastNavigationService 的公共方法在 UnifiedNavigationService 中都有**
对比两个类的方法列表：
- `navigateJavaToXml` - Unified 有
- `navigateXmlToJava` - Unified 有
- `getNavigationInfo` - Unified 有
- `canNavigate` - Unified 有
- `getDiagnostics` - Unified 有（已更新）

所有公共方法都已覆盖。
  </action>
  <acceptance_criteria>
    - grep "recentMappings" src/features/mapping/unifiedNavigationService.ts 返回匹配
    - grep "updateRecentCache" src/features/mapping/unifiedNavigationService.ts 返回匹配
    - grep "MAX_RECENT" src/features/mapping/unifiedNavigationService.ts 返回匹配
    - grep "recentCacheSize" src/features/mapping/unifiedNavigationService.ts 返回匹配
    - npm run compile 无错误
  </acceptance_criteria>
</task>

<task id="T2">
  <description>删除 FastNavigationService 文件并更新 index.ts</description>
  <read_first>
    - src/features/mapping/index.ts
    - src/extension.ts
  </read_first>
  <action>
**步骤 1：删除 fastNavigationService.ts**
```bash
rm src/features/mapping/fastNavigationService.ts
```

**步骤 2：更新 index.ts**
从 src/features/mapping/index.ts 中移除 FastNavigationService 的导出。

将第 7 行：
```typescript
export { FastNavigationService } from "./fastNavigationService";
```
删除或注释掉。

如果 P04 已完成，确保 QueryContextResolver 的导出存在：
```typescript
export { QueryContextResolver } from "./queryContext";
```

如果 P01 已完成，确保 ModuleResolver 的导出存在：
```typescript
export { ModuleResolver } from "./moduleResolver";
```

**步骤 3：检查 extension.ts 中是否有 FastNavigationService 引用**
搜索 extension.ts 中所有 FastNavigationService 的引用：
```bash
grep -n "FastNavigationService" src/extension.ts
```

如果存在，全部替换为 UnifiedNavigationService 或移除。

根据之前读取的 extension.ts 内容（第 57-64 行），import 语句中导入了 FastScanner、FastMappingEngine、UnifiedNavigationService、XmlCodeLensProvider，但没有导入 FastNavigationService。变量声明区（第 80-94 行）也没有 fastNavigationService 变量。因此 extension.ts 可能不需要修改。

但仍需检查是否有遗漏的引用（如字符串中的命令注册等）。
  </action>
  <acceptance_criteria>
    - test ! -f src/features/mapping/fastNavigationService.ts（文件不存在）
    - grep "FastNavigationService" src/features/mapping/index.ts 不返回匹配
    - grep "FastNavigationService" src/extension.ts 不返回匹配
    - npm run compile 无错误
  </acceptance_criteria>
</task>

</tasks>

<threat_model>
## Trust Boundaries

| Boundary | Description |
|----------|-------------|
| NavigationService -> User | 导航结果影响用户编辑体验 |

## STRIDE Threat Register

| Threat ID | Category | Component | Disposition | Mitigation Plan |
|-----------|----------|-----------|-------------|-----------------|
| T-06-P05-01 | Denial of Service | recentMappings 缓存无界增长 | mitigate | MAX_RECENT = 50 限制缓存大小 |
| T-06-P05-02 | Information Disclosure | 缓存包含文件路径 | accept | 文件路径信息在 VS Code 扩展中不敏感 |
</threat_model>

<verification>
1. `npm run compile` 无编译错误
2. `npm run lint` 无错误
3. FastNavigationService 文件已删除
4. index.ts 和 extension.ts 无 FastNavigationService 引用
</verification>

<success_criteria>
- FastNavigationService 的所有功能已合并到 UnifiedNavigationService
- fastNavigationService.ts 文件已删除
- index.ts 不再导出 FastNavigationService
- extension.ts 无 FastNavigationService 引用
- 编译和 lint 通过
</success_criteria>

<output>
After completion, create `.planning/phases/06-module-aware-mapping-engine-refactor/06-P05-SUMMARY.md`
</output>
