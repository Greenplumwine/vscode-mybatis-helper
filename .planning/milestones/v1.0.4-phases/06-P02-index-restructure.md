---
phase: 06-module-aware-mapping-engine-refactor
plan: P02
type: execute
wave: 1
depends_on:
  - P01
files_modified:
  - src/features/mapping/fastMappingEngine.ts
  - src/features/mapping/types.ts
autonomous: true
requirements:
  - P2-01
  - P2-02
  - P2-03
must_haves:
  truths:
    - FastMappingEngine 使用复合键 `${moduleId}::${namespace}` 作为主索引
    - 同名 namespace 在不同模块中可独立索引，不冲突
    - 复合键查询保持 O(1) 时间复杂度
    - 无模块信息时，fallback 路径（referencePath 相似度匹配）正常工作
    - 单模块项目行为无回归（使用 "default" 作为 moduleId）
  artifacts:
    - path: src/features/mapping/fastMappingEngine.ts
      provides: 改造后的 FastMappingEngine，使用复合键索引
      contains: "moduleNamespaceIndex", "getCompositeKey", "namespaceToModules"
    - path: src/features/mapping/types.ts
      provides: QueryContext 接口（如果 P04 尚未完成，先在此添加基础定义）
  key_links:
    - from: buildMapping
      to: moduleNamespaceIndex
      via: getCompositeKey(moduleId, namespace)
    - from: getByNamespace
      to: moduleNamespaceIndex
      via: context?.moduleId -> getCompositeKey -> O(1) lookup
    - from: getByNamespace fallback
      to: namespaceToModules
      via: context?.referencePath -> findBestMatchByPath
---

<objective>
改造 FastMappingEngine 的索引结构，将 namespace 单键索引改为 (moduleId, namespace) 复合键索引。引入 moduleNamespaceIndex（O(1) 查找）、namespaceToModules 反向索引（用于无模块上下文时的 fallback），以及 getCompositeKey 辅助方法。

Purpose: 从根本上消除多服务同名 Mapper 的索引冲突问题，让引擎内部承担歧义消解责任，而非分散给调用方。
Output: 改造后的 fastMappingEngine.ts（索引结构 + 查询接口更新）
</objective>

<execution_context>
@$HOME/.claude/get-shit-done/workflows/execute-plan.md
</execution_context>

<context>
@.planning/phases/06-module-aware-mapping-engine-refactor/06-RESEARCH.md
@src/features/mapping/fastMappingEngine.ts
@src/features/mapping/types.ts
</context>

<tasks>

<task id="T1">
  <description>在 types.ts 中新增 QueryContext 接口（基础版本）</description>
  <read_first>
    - src/features/mapping/types.ts
  </read_first>
  <action>
在 src/features/mapping/types.ts 中 ModuleContext 接口之后（如果 P01 已完成）或文件末尾添加 QueryContext 接口：

```typescript
/**
 * 查询上下文接口
 * 用于传递模块信息或参考路径以辅助歧义消解
 */
export interface QueryContext {
  /** 模块 ID（优先使用） */
  moduleId?: string;
  /** 参考文件路径（fallback 使用） */
  referencePath?: string;
}
```

如果 P01 已完成且 ModuleContext 已存在，确保 QueryContext 添加在 ModuleContext 之后。
如果 P01 尚未执行，先添加 ModuleContext 再添加 QueryContext（但 P01 和 P02 同属 Wave 1，P01 应先完成）。
  </action>
  <acceptance_criteria>
    - grep "export interface QueryContext" src/features/mapping/types.ts 返回匹配
    - grep "moduleId?: string" src/features/mapping/types.ts 返回匹配
    - grep "referencePath?: string" src/features/mapping/types.ts 返回匹配
  </acceptance_criteria>
</task>

<task id="T2">
  <description>改造 FastMappingEngine 索引结构（步骤 1-8）</description>
  <read_first>
    - src/features/mapping/fastMappingEngine.ts（完整文件，重点关注索引定义区和 buildMapping 方法）
    - src/features/mapping/types.ts
  </read_first>
  <action>
按以下步骤改造 src/features/mapping/fastMappingEngine.ts 的索引结构和初始化部分：

**步骤 1：更新 import，引入 QueryContext**
将第 12-21 行的 import 改为：
```typescript
import {
  MapperMapping,
  MethodMapping,
  JavaMapperInfo,
  XmlMapperInfo,
  Position,
  QueryContext,
} from "./types";
```

**步骤 2：更新 MappingIndex 接口，添加 moduleId 字段**
在第 26 行的 interface MappingIndex 中添加 moduleId 字段：
```typescript
interface MappingIndex {
  namespace: string;
  moduleId: string;  // 新增
  javaPath: string;
  xmlPath?: string;
  className: string;
  simpleClassName: string;
  packageName: string;
  methods: Map<string, MethodMapping>;
  methodParameters?: Map<string, JavaParameter[]>;
  lastUpdated: number;
}
```

**步骤 3：替换核心索引定义**
将第 50-66 行的索引定义替换为：
```typescript
  // ========== 核心索引 ==========

  /** 主索引：compositeKey(moduleId::namespace) -> MappingIndex (O(1)) */
  private moduleNamespaceIndex: Map<string, MappingIndex> = new Map();

  /** 反向索引：namespace -> moduleId[] (用于无模块上下文时的查找) */
  private namespaceToModules: Map<string, string[]> = new Map();

  /** 反向索引：javaPath -> compositeKey */
  private javaPathIndex: Map<string, string> = new Map();

  /** 反向索引：xmlPath -> compositeKey */
  private xmlPathIndex: Map<string, string> = new Map();

  /** 类名索引：simpleClassName -> Set<compositeKey> */
  private classNameIndex: Map<string, Set<string>> = new Map();

  /** 包名索引：packagePrefix -> Set<compositeKey> */
  private packageIndex: Map<string, Set<string>> = new Map();
```

**步骤 4：添加 compositeKey 辅助方法**
在 constructor 之后（第 103 行之后）添加：
```typescript
  private getCompositeKey(moduleId: string, namespace: string): string {
    return `${moduleId}::${namespace}`;
  }
```

**步骤 5：改造 buildMapping 方法**
将 buildMapping 方法签名改为接受 moduleId：
```typescript
  public buildMapping(
    javaInfo: JavaMapperInfo,
    xmlInfo?: XmlMapperInfo,
    moduleId: string = "default",
  ): MappingIndex {
```

在方法体内，创建 mapping 对象时添加 moduleId：
```typescript
    const mapping: MappingIndex = {
      namespace,
      moduleId,
      javaPath: javaInfo.filePath,
      // ... 其余字段不变
    };
```

**步骤 6：改造 buildMappings 方法**
将 buildMappings 的签名改为：
```typescript
  public buildMappings(
    pairs: Array<{ java: JavaMapperInfo; xml?: XmlMapperInfo; moduleId?: string }>,
  ): void {
```

循环体改为：
```typescript
    for (const { java, xml, moduleId } of pairs) {
      this.buildMapping(java, xml, moduleId || "default");
    }
```

**步骤 7：改造 updateIndexes 方法**
将 updateIndexes 替换为：
```typescript
  private updateIndexes(mapping: MappingIndex): void {
    const { namespace, moduleId, javaPath, xmlPath, simpleClassName, packageName } = mapping;
    const compositeKey = this.getCompositeKey(moduleId, namespace);

    // 主索引 - O(1) 直接存储
    this.moduleNamespaceIndex.set(compositeKey, mapping);

    // namespace -> modules 反向索引
    const existingModules = this.namespaceToModules.get(namespace);
    if (existingModules) {
      if (!existingModules.includes(moduleId)) {
        existingModules.push(moduleId);
      }
    } else {
      this.namespaceToModules.set(namespace, [moduleId]);
    }

    // 反向索引
    this.javaPathIndex.set(javaPath.normalize("NFC").toLowerCase(), compositeKey);
    if (xmlPath) {
      this.xmlPathIndex.set(xmlPath.normalize("NFC").toLowerCase(), compositeKey);
    }

    // 类名索引 - 存储 compositeKey
    const existingClasses = this.classNameIndex.get(simpleClassName);
    if (existingClasses) {
      existingClasses.add(compositeKey);
    } else {
      this.classNameIndex.set(simpleClassName, new Set([compositeKey]));
    }

    // 包名索引
    this.addToPackageIndex(compositeKey, packageName);
  }
```

**步骤 8：改造 addToPackageIndex 和 removeFromPackageIndex**
将 addToPackageIndex 改为接受 compositeKey：
```typescript
  private addToPackageIndex(compositeKey: string, packageName: string): void {
    const parts = packageName.split(".");
    let prefix = "";

    for (let i = 0; i < parts.length; i++) {
      prefix = prefix ? `${prefix}.${parts[i]}` : parts[i];
      const existing = this.packageIndex.get(prefix);
      if (existing) {
        existing.add(compositeKey);
      } else {
        this.packageIndex.set(prefix, new Set([compositeKey]));
      }
    }
  }
```

将 removeFromPackageIndex 改为：
```typescript
  private removeFromPackageIndex(compositeKey: string, packageName: string): void {
    const parts = packageName.split(".");
    let prefix = "";

    for (let i = 0; i < parts.length; i++) {
      prefix = prefix ? `${prefix}.${parts[i]}` : parts[i];
      const existing = this.packageIndex.get(prefix);
      if (existing) {
        existing.delete(compositeKey);
        if (existing.size === 0) {
          this.packageIndex.delete(prefix);
        }
      }
    }
  }
```
  </action>
  <acceptance_criteria>
    - grep "moduleNamespaceIndex: Map<string, MappingIndex>" src/features/mapping/fastMappingEngine.ts 返回匹配
    - grep "namespaceToModules: Map<string, string[]>" src/features/mapping/fastMappingEngine.ts 返回匹配
    - grep "getCompositeKey" src/features/mapping/fastMappingEngine.ts 返回匹配
    - grep "moduleId: string" src/features/mapping/fastMappingEngine.ts 返回匹配
    - grep "moduleId: string = \"default\"" src/features/mapping/fastMappingEngine.ts 返回匹配
    - grep "moduleNamespaceIndex.size" src/features/mapping/fastMappingEngine.ts 返回匹配（至少 2 处）
    - npm run compile 无错误
  </acceptance_criteria>
</task>

<task id="T3">
  <description>改造 FastMappingEngine 查询方法（步骤 9-12）</description>
  <read_first>
    - src/features/mapping/fastMappingEngine.ts（重点看查询方法区）
  </read_first>
  <action>
按以下步骤改造 src/features/mapping/fastMappingEngine.ts 的查询方法：

**步骤 9：改造 getByNamespace 方法**
将 getByNamespace 方法完全替换为：
```typescript
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
          .map((m) => this.moduleNamespaceIndex.get(this.getCompositeKey(m, namespace)))
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

**步骤 10：改造 getByJavaPath 方法**
将 getByJavaPath 替换为：
```typescript
  public getByJavaPath(javaPath: string): MapperMapping | undefined {
    const normalizedPath = javaPath.normalize("NFC").toLowerCase();
    const compositeKey = this.javaPathIndex.get(normalizedPath);
    if (!compositeKey) {
      return undefined;
    }
    const mapping = this.moduleNamespaceIndex.get(compositeKey);
    return mapping ? this.toMapperMapping(mapping) : undefined;
  }
```

**步骤 11：改造 getByXmlPath 方法**
将 getByXmlPath 替换为：
```typescript
  public getByXmlPath(xmlPath: string): MapperMapping | undefined {
    const normalizedPath = xmlPath.normalize("NFC").toLowerCase();
    const compositeKey = this.xmlPathIndex.get(normalizedPath);
    if (!compositeKey) {
      return undefined;
    }
    const mapping = this.moduleNamespaceIndex.get(compositeKey);
    return mapping ? this.toMapperMapping(mapping) : undefined;
  }
```

**步骤 12：改造 getByClassName 方法**
将 getByClassName 替换为：
```typescript
  public getByClassName(
    className: string,
    context?: QueryContext,
  ): MapperMapping | undefined {
    // 1. 尝试作为全限定类名直接匹配 namespace
    const modules = this.namespaceToModules.get(className);
    if (modules && modules.length > 0) {
      if (modules.length === 1) {
        const key = this.getCompositeKey(modules[0], className);
        const mapping = this.moduleNamespaceIndex.get(key);
        if (mapping) {
          return this.toMapperMapping(mapping);
        }
      }

      // 有多个模块，尝试用 context 选择
      if (context?.moduleId) {
        const key = this.getCompositeKey(context.moduleId, className);
        const mapping = this.moduleNamespaceIndex.get(key);
        if (mapping) {
          return this.toMapperMapping(mapping);
        }
      }

      if (context?.referencePath) {
        const candidates = modules
          .map((m) => this.moduleNamespaceIndex.get(this.getCompositeKey(m, className)))
          .filter((m): m is MappingIndex => !!m);
        const bestMatch = this.findBestMatchByPath(candidates, context.referencePath);
        if (bestMatch) {
          return this.toMapperMapping(bestMatch);
        }
      }

      // 无上下文，返回第一个
      const key = this.getCompositeKey(modules[0], className);
      const mapping = this.moduleNamespaceIndex.get(key);
      if (mapping) {
        return this.toMapperMapping(mapping);
      }
    }

    // 2. 尝试作为简单类名查找
    const compositeKeys = this.classNameIndex.get(className);
    if (compositeKeys && compositeKeys.size > 0) {
      const candidates: MappingIndex[] = [];
      for (const key of compositeKeys) {
        const mapping = this.moduleNamespaceIndex.get(key);
        if (mapping) {
          candidates.push(mapping);
        }
      }

      if (candidates.length === 1) {
        return this.toMapperMapping(candidates[0]);
      }

      if (context?.referencePath && candidates.length > 1) {
        const bestMatch = this.findBestMatchByPath(candidates, context.referencePath);
        if (bestMatch) {
          return this.toMapperMapping(bestMatch);
        }
      }

      return this.toMapperMapping(candidates[0]);
    }

    return undefined;
  }
```

确认 findBestMatchByPath 方法签名兼容（接受 MappingIndex[] 和 referencePath: string）。
  </action>
  <acceptance_criteria>
    - grep "context?: QueryContext" src/features/mapping/fastMappingEngine.ts 返回匹配（至少 2 处：getByNamespace 和 getByClassName）
    - grep "getByNamespace" src/features/mapping/fastMappingEngine.ts 返回匹配
    - grep "getByJavaPath" src/features/mapping/fastMappingEngine.ts 返回匹配
    - grep "getByXmlPath" src/features/mapping/fastMappingEngine.ts 返回匹配
    - grep "getByClassName" src/features/mapping/fastMappingEngine.ts 返回匹配
    - grep "namespaceToModules.get" src/features/mapping/fastMappingEngine.ts 返回匹配（至少 3 处）
    - npm run compile 无错误
  </acceptance_criteria>
</task>

<task id="T4">
  <description>改造 FastMappingEngine 维护方法（步骤 13-23）</description>
  <read_first>
    - src/features/mapping/fastMappingEngine.ts（重点看维护方法区：removeMapping、updateXmlPath、syncXmlMethods 等）
  </read_first>
  <action>
按以下步骤改造 src/features/mapping/fastMappingEngine.ts 的维护方法：

**步骤 13：改造 removeMapping 方法**
将 removeMapping 替换为：
```typescript
  public removeMapping(javaPath: string): boolean {
    const normalizedPath = javaPath.normalize("NFC").toLowerCase();
    const compositeKey = this.javaPathIndex.get(normalizedPath);
    if (!compositeKey) {
      return false;
    }

    const mapping = this.moduleNamespaceIndex.get(compositeKey);
    if (!mapping) {
      return false;
    }

    // 从主索引移除
    this.moduleNamespaceIndex.delete(compositeKey);

    // 从 namespaceToModules 移除
    const modules = this.namespaceToModules.get(mapping.namespace);
    if (modules) {
      const idx = modules.indexOf(mapping.moduleId);
      if (idx >= 0) {
        modules.splice(idx, 1);
        if (modules.length === 0) {
          this.namespaceToModules.delete(mapping.namespace);
        }
      }
    }

    // 清理其他索引
    this.javaPathIndex.delete(normalizedPath);
    if (mapping.xmlPath) {
      this.xmlPathIndex.delete(mapping.xmlPath.normalize("NFC").toLowerCase());
    }

    // 清理类名索引
    const classNames = this.classNameIndex.get(mapping.simpleClassName);
    if (classNames) {
      classNames.delete(compositeKey);
      if (classNames.size === 0) {
        this.classNameIndex.delete(mapping.simpleClassName);
      }
    }

    // 清理包名索引
    this.removeFromPackageIndex(compositeKey, mapping.packageName);

    this.emit("mappingRemoved", javaPath);
    return true;
  }
```

**步骤 14：改造 removeXmlMapping 方法**
将 removeXmlMapping 替换为：
```typescript
  public removeXmlMapping(xmlPath: string): boolean {
    const normalizedPath = xmlPath.normalize("NFC").toLowerCase();
    const compositeKey = this.xmlPathIndex.get(normalizedPath);
    if (!compositeKey) {
      return false;
    }

    const mapping = this.moduleNamespaceIndex.get(compositeKey);
    if (!mapping) {
      return false;
    }

    this.xmlPathIndex.delete(normalizedPath);
    mapping.xmlPath = undefined;

    // 清除所有方法的 xmlPosition
    for (const methodMapping of mapping.methods.values()) {
      methodMapping.xmlPosition = undefined;
    }

    mapping.lastUpdated = Date.now();
    this.emit("mappingUpdated", this.toMapperMapping(mapping));
    return true;
  }
```

**步骤 15：改造 updateXmlPath 方法**
将 updateXmlPath 替换为：
```typescript
  public updateXmlPath(javaPath: string, xmlPath: string): boolean {
    const normalizedPath = javaPath.normalize("NFC").toLowerCase();
    const compositeKey = this.javaPathIndex.get(normalizedPath);
    if (!compositeKey) {
      return false;
    }

    const mapping = this.moduleNamespaceIndex.get(compositeKey);
    if (!mapping) {
      return false;
    }

    // 移除旧的 xmlPath 索引
    if (mapping.xmlPath) {
      this.xmlPathIndex.delete(mapping.xmlPath.normalize("NFC").toLowerCase());
    }

    // 更新映射
    mapping.xmlPath = xmlPath;
    mapping.lastUpdated = Date.now();

    // 添加新的 xmlPath 索引
    this.xmlPathIndex.set(xmlPath.normalize("NFC").toLowerCase(), compositeKey);

    this.emit("mappingUpdated", this.toMapperMapping(mapping));
    return true;
  }
```

**步骤 16：改造 syncXmlMethods 方法**
将 syncXmlMethods 替换为：
```typescript
  public syncXmlMethods(
    javaPath: string,
    xmlStatements: Map<string, Position>,
  ): boolean {
    const normalizedPath = javaPath.normalize("NFC").toLowerCase();
    const compositeKey = this.javaPathIndex.get(normalizedPath);
    if (!compositeKey) {
      return false;
    }

    const mapping = this.moduleNamespaceIndex.get(compositeKey);
    if (!mapping) {
      return false;
    }

    // 1. 收集 XML 中存在的方法名
    const xmlMethodNames = new Set(xmlStatements.keys());

    // 2. 删除 XML 中已不存在的方法映射
    for (const [methodName, methodMapping] of mapping.methods.entries()) {
      if (!xmlMethodNames.has(methodName)) {
        methodMapping.xmlPosition = undefined;
      }
    }

    // 3. 更新或添加方法
    for (const [methodName, xmlPosition] of xmlStatements.entries()) {
      const methodMapping = mapping.methods.get(methodName);
      if (methodMapping) {
        methodMapping.xmlPosition = xmlPosition;
      } else {
        mapping.methods.set(methodName, {
          methodName: methodName,
          sqlId: methodName,
          javaPosition: { line: 0, column: 0 },
          xmlPosition: xmlPosition,
        });
      }
    }

    mapping.lastUpdated = Date.now();
    this.emit("mappingUpdated", this.toMapperMapping(mapping));
    return true;
  }
```

**步骤 17：改造 getMethodMapping、addMethodMapping、hasSqlForMethod、getMethodParameters、updateMethodParameters**
这些方法的改造模式相同：通过 javaPathIndex 获取 compositeKey，再通过 moduleNamespaceIndex 获取 mapping。

getMethodMapping：
```typescript
  public getMethodMapping(
    javaPath: string,
    methodName: string,
  ): MethodMapping | undefined {
    const normalizedPath = javaPath.normalize("NFC").toLowerCase();
    const compositeKey = this.javaPathIndex.get(normalizedPath);
    if (!compositeKey) {
      return undefined;
    }
    const mapping = this.moduleNamespaceIndex.get(compositeKey);
    return mapping?.methods.get(methodName);
  }
```

addMethodMapping：
```typescript
  public addMethodMapping(javaPath: string, methodName: string): boolean {
    const normalizedPath = javaPath.normalize("NFC").toLowerCase();
    const compositeKey = this.javaPathIndex.get(normalizedPath);
    if (!compositeKey) {
      return false;
    }
    const mapping = this.moduleNamespaceIndex.get(compositeKey);
    if (!mapping) {
      return false;
    }
    // ... 其余逻辑不变
  }
```

hasSqlForMethod：
```typescript
  public hasSqlForMethod(namespace: string, methodName: string): boolean {
    const modules = this.namespaceToModules.get(namespace);
    if (!modules || modules.length === 0) {
      return false;
    }
    // 遍历所有相同 namespace 的映射
    for (const moduleId of modules) {
      const key = this.getCompositeKey(moduleId, namespace);
      const mapping = this.moduleNamespaceIndex.get(key);
      if (mapping) {
        // 检查方法是否有 SQL
        const methodWithParams = mapping.methods.get(methodName);
        if (methodWithParams && methodWithParams.xmlPosition !== undefined) {
          return true;
        }
        const methodNameWithoutParams = methodName.split("(")[0];
        const methodWithoutParams = mapping.methods.get(methodNameWithoutParams);
        if (methodWithoutParams && methodWithoutParams.xmlPosition !== undefined) {
          return true;
        }
      }
    }
    return false;
  }
```

getMethodParameters：
```typescript
  public getMethodParameters(
    javaPath: string,
    methodName: string,
  ): JavaParameter[] | undefined {
    const normalizedPath = javaPath.normalize("NFC").toLowerCase();
    const compositeKey = this.javaPathIndex.get(normalizedPath);
    if (!compositeKey) {
      return undefined;
    }
    const mapping = this.moduleNamespaceIndex.get(compositeKey);
    return mapping?.methodParameters?.get(methodName);
  }
```

updateMethodParameters：
```typescript
  public updateMethodParameters(
    javaPath: string,
    methodName: string,
    parameters: JavaParameter[],
  ): boolean {
    const normalizedPath = javaPath.normalize("NFC").toLowerCase();
    const compositeKey = this.javaPathIndex.get(normalizedPath);
    if (!compositeKey) {
      return false;
    }
    const mapping = this.moduleNamespaceIndex.get(compositeKey);
    if (!mapping) {
      return false;
    }
    // ... 其余逻辑不变
  }
```

**步骤 18：改造 findJavaForXml 方法**
```typescript
  public findJavaForXml(
    xmlPath: string,
    namespace: string,
  ): MapperMapping | undefined {
    // 1. 已经有映射 - O(1)
    const existing = this.getByXmlPath(xmlPath);
    if (existing) {
      return existing;
    }

    // 2. 通过 namespace 查找，传入 xmlPath 作为参考路径
    const byNamespace = this.getByNamespace(namespace, { referencePath: xmlPath });
    if (byNamespace) {
      this.updateXmlPath(byNamespace.javaPath, xmlPath);
      return this.getByJavaPath(byNamespace.javaPath);
    }

    // 3. 尝试通过简单类名匹配
    const simpleClassName = namespace.substring(namespace.lastIndexOf(".") + 1);
    const candidateKeys = this.classNameIndex.get(simpleClassName);
    if (candidateKeys && candidateKeys.size > 0) {
      const candidates: MappingIndex[] = [];
      for (const key of candidateKeys) {
        const mapping = this.moduleNamespaceIndex.get(key);
        if (mapping) {
          candidates.push(mapping);
        }
      }

      if (candidates.length === 1) {
        this.updateXmlPath(candidates[0].javaPath, xmlPath);
        return this.getByJavaPath(candidates[0].javaPath);
      } else if (candidates.length > 1) {
        const bestMatch = this.findBestMatchByPath(candidates, xmlPath);
        if (bestMatch) {
          this.updateXmlPath(bestMatch.javaPath, xmlPath);
          return this.getByJavaPath(bestMatch.javaPath);
        }
      }
    }

    return undefined;
  }
```

**步骤 19：改造 searchMappings 方法**
```typescript
  public searchMappings(query: string): MapperMapping[] {
    const results: MapperMapping[] = [];
    const lowerQuery = query.toLowerCase();

    for (const mapping of this.moduleNamespaceIndex.values()) {
      if (
        mapping.namespace.toLowerCase().includes(lowerQuery) ||
        mapping.simpleClassName.toLowerCase().includes(lowerQuery) ||
        mapping.javaPath.toLowerCase().includes(lowerQuery) ||
        mapping.xmlPath?.toLowerCase().includes(lowerQuery)
      ) {
        results.push(this.toMapperMapping(mapping));
      }
    }

    return results;
  }
```

**步骤 20：改造 findByPackagePrefix 方法**
```typescript
  public findByPackagePrefix(packagePrefix: string): MapperMapping[] {
    const compositeKeys = this.packageIndex.get(packagePrefix);
    if (!compositeKeys) {
      return [];
    }

    const results: MapperMapping[] = [];
    for (const key of compositeKeys) {
      const mapping = this.moduleNamespaceIndex.get(key);
      if (mapping) {
        results.push(this.toMapperMapping(mapping));
      }
    }
    return results;
  }
```

**步骤 21：改造 cleanupStaleEntries 方法**
```typescript
  private async cleanupStaleEntries(): Promise<number> {
    let removed = 0;
    const fs = await import("fs/promises");

    for (const mapping of this.moduleNamespaceIndex.values()) {
      try {
        if (mapping.javaPath) {
          await fs.access(mapping.javaPath);
        }
        if (mapping.xmlPath) {
          await fs.access(mapping.xmlPath);
        }
      } catch {
        this.removeMapping(mapping.javaPath);
        removed++;
      }
    }

    if (removed > 0) {
      this.logger?.info(`Cleaned up ${removed} stale mappings`);
    }

    this.logger?.debug(
      `Cache stats: ${this.moduleNamespaceIndex.size} mappings, ${this.stats.totalMethods} methods`,
    );

    return removed;
  }
```

**步骤 22：改造 getAllMappings、getStats、clear、getDiagnostics**
getAllMappings：
```typescript
  public getAllMappings(): MapperMapping[] {
    const results: MapperMapping[] = [];
    for (const mapping of this.moduleNamespaceIndex.values()) {
      results.push(this.toMapperMapping(mapping));
    }
    return results;
  }
```

getStats：
```typescript
  public getStats() {
    let withXml = 0;
    let totalMethods = 0;

    for (const mapping of this.moduleNamespaceIndex.values()) {
      if (mapping.xmlPath) {
        withXml++;
      }
      totalMethods += mapping.methods.size;
    }

    return {
      total: this.moduleNamespaceIndex.size,
      withXml,
      totalMethods,
      uniqueClassNames: this.classNameIndex.size,
      cacheHits: this.stats.cacheHits,
      cacheMisses: this.stats.cacheMisses,
    };
  }
```

clear：
```typescript
  public clear(): void {
    this.moduleNamespaceIndex.clear();
    this.namespaceToModules.clear();
    this.javaPathIndex.clear();
    this.xmlPathIndex.clear();
    this.classNameIndex.clear();
    this.packageIndex.clear();
    this.fsCache.xmlFiles.clear();
    this.fsCache.javaFiles.clear();
    this.emit("mappingsCleared");
  }
```

getDiagnostics：
```typescript
  public getDiagnostics(): object {
    return {
      indexSizes: {
        moduleNamespace: this.moduleNamespaceIndex.size,
        namespaceToModules: this.namespaceToModules.size,
        javaPath: this.javaPathIndex.size,
        xmlPath: this.xmlPathIndex.size,
        className: this.classNameIndex.size,
        package: this.packageIndex.size,
      },
      cacheSizes: {
        xmlFiles: this.fsCache.xmlFiles.size,
        javaFiles: this.fsCache.javaFiles.size,
      },
      stats: this.getStats(),
    };
  }
```

**步骤 23：更新 stats 更新逻辑**
在 buildMapping 方法中，确保 stats.totalMappings 的统计方式正确。由于现在每个 mapping 是唯一的（compositeKey），不再需要遍历数组统计：

在 buildMapping 方法末尾（emit 之前）更新 stats：
```typescript
    this.stats.totalMappings = this.moduleNamespaceIndex.size;
    if (xmlInfo?.filePath) {
      // withXml 在 getStats 中动态计算
    }
    this.stats.totalMethods += methods.size;
```

注意：由于 buildMapping 可能被重复调用（更新现有映射），totalMethods 的统计可能不准确。建议在 getStats 中动态计算（步骤 22 已实现）。
  </action>
  <acceptance_criteria>
    - grep "removeMapping" src/features/mapping/fastMappingEngine.ts 返回匹配
    - grep "updateXmlPath" src/features/mapping/fastMappingEngine.ts 返回匹配
    - grep "syncXmlMethods" src/features/mapping/fastMappingEngine.ts 返回匹配
    - grep "getAllMappings" src/features/mapping/fastMappingEngine.ts 返回匹配
    - grep "getStats" src/features/mapping/fastMappingEngine.ts 返回匹配
    - grep "clear()" src/features/mapping/fastMappingEngine.ts 返回匹配
    - grep "getDiagnostics" src/features/mapping/fastMappingEngine.ts 返回匹配
    - grep "moduleNamespaceIndex.size" src/features/mapping/fastMappingEngine.ts 返回匹配（至少 2 处）
    - npm run compile 无错误
  </acceptance_criteria>
</task>

</tasks>

<threat_model>
## Trust Boundaries

| Boundary | Description |
|----------|-------------|
| QueryContext -> Engine | 外部传入的查询上下文 |

## STRIDE Threat Register

| Threat ID | Category | Component | Disposition | Mitigation Plan |
|-----------|----------|-----------|-------------|-----------------|
| T-06-P02-01 | Tampering | QueryContext.moduleId 被伪造 | accept | moduleId 仅用于索引查找，不执行文件操作；错误 moduleId 只会导致查找不到 |
| T-06-P02-02 | Information Disclosure | namespaceToModules 暴露模块结构 | accept | 模块结构信息来自公开的构建文件，无敏感信息 |
</threat_model>

<verification>
1. `npm run compile` 无编译错误
2. `npm run lint` 无错误
3. grep 验证所有新索引字段和关键方法存在
4. 确认旧接口 `getByNamespace(namespace, referencePath?)` 的兼容签名已移除，改为 `getByNamespace(namespace, context?)`
</verification>

<success_criteria>
- FastMappingEngine 使用 moduleNamespaceIndex（复合键 -> MappingIndex）作为主索引
- namespaceToModules 反向索引存在，用于 fallback 查找
- getByNamespace、getByClassName 接受 QueryContext 参数
- buildMapping/buildMappings 接受 moduleId 参数
- 所有查询方法通过 javaPathIndex/xmlPathIndex -> compositeKey -> moduleNamespaceIndex 的链路工作
- 编译和 lint 通过
</success_criteria>

<output>
After completion, create `.planning/phases/06-module-aware-mapping-engine-refactor/06-P02-SUMMARY.md`
</output>
