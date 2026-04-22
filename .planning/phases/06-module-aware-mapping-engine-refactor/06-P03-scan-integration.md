---
phase: 06-module-aware-mapping-engine-refactor
plan: P03
type: execute
wave: 2
depends_on:
  - P02
files_modified:
  - src/features/mapping/fastScanner.ts
  - src/features/mapping/enterpriseScanner.ts
autonomous: true
requirements:
  - P3-01
must_haves:
  truths:
    - FastScanner 在扫描阶段通过 ModuleResolver 获取模块上下文
    - EnterpriseScanner 在扫描阶段通过 ModuleResolver 获取模块上下文
    - 扫描器将 moduleId 传递给 FastMappingEngine.buildMapping
    - 单模块项目无回归（使用默认 moduleId）
  artifacts:
    - path: src/features/mapping/fastScanner.ts
      provides: 改造后的 FastScanner，集成 ModuleResolver
      contains: "ModuleResolver", "resolveModuleForPath", "moduleId"
    - path: src/features/mapping/enterpriseScanner.ts
      provides: 改造后的 EnterpriseScanner，集成 ModuleResolver
      contains: "ModuleResolver", "resolveModuleForPath", "moduleId"
  key_links:
    - from: FastScanner.buildMappingsFromResults
      to: FastMappingEngine.buildMappings
      via: moduleId 参数
    - from: EnterpriseScanner.buildMappingsFromResults
      to: FastMappingEngine.buildMappings
      via: moduleId 参数
---

<objective>
在 FastScanner 和 EnterpriseScanner 中集成 ModuleResolver，使扫描阶段能够识别每个文件所属的模块，并将模块上下文传递给 FastMappingEngine。

Purpose: 让索引在建立时就携带正确的模块信息，避免后续查询时的歧义消解负担。
Output: 改造后的 fastScanner.ts 和 enterpriseScanner.ts
</objective>

<execution_context>
@$HOME/.claude/get-shit-done/workflows/execute-plan.md
</execution_context>

<context>
@.planning/phases/06-module-aware-mapping-engine-refactor/06-RESEARCH.md
@src/features/mapping/fastScanner.ts
@src/features/mapping/enterpriseScanner.ts
@src/features/mapping/fastMappingEngine.ts
@src/features/mapping/moduleResolver.ts（P01 输出）
</context>

<tasks>

<task id="T1">
  <description>改造 FastScanner 集成 ModuleResolver</description>
  <read_first>
    - src/features/mapping/fastScanner.ts
    - src/features/mapping/moduleResolver.ts
    - src/features/mapping/fastMappingEngine.ts
  </read_first>
  <action>
按以下步骤改造 src/features/mapping/fastScanner.ts：

**步骤 1：添加 ModuleResolver import**
在第 16 行（EnhancedJavaAPI import 之后）添加：
```typescript
import { ModuleResolver } from "./moduleResolver";
```

**步骤 2：添加 moduleResolver 字段**
在 FastScanner 类的字段声明区（第 43-49 行，locationResolver 之后）添加：
```typescript
  private moduleResolver: ModuleResolver;
```

**步骤 3：在 constructor 中初始化 moduleResolver**
在第 57 行（locationResolver 初始化之后）添加：
```typescript
    this.moduleResolver = ModuleResolver.getInstance();
```

**步骤 4：在 initialize 方法中初始化 moduleResolver**
在第 73 行（locationResolver.initialize() 之后）添加：
```typescript
    await this.moduleResolver.initialize();
```

**步骤 5：改造 parseJavaMapperFast 方法，添加模块解析**
在 parseJavaMapperFast 方法的返回值中，添加 moduleId 字段。但由于该方法返回 JavaMapperInfo（不含 moduleId），我们需要在 buildMappingsFromResults 中解析模块。

**步骤 6：改造 buildMappingsFromResults 方法**
将 buildMappingsFromResults 方法替换为：
```typescript
  private buildMappingsFromResults(
    javaMappers: JavaMapperInfo[],
    xmlMappers: XmlMapperInfo[],
  ): void {
    const startTime = Date.now();

    // 1. 建立 XML namespace 快速查找表（含 moduleId）
    const xmlByNamespace = new Map<string, XmlMapperInfo[]>();
    const xmlBySimpleName = new Map<string, XmlMapperInfo[]>();

    for (const xml of xmlMappers) {
      const existingByNs = xmlByNamespace.get(xml.namespace);
      if (existingByNs) {
        existingByNs.push(xml);
      } else {
        xmlByNamespace.set(xml.namespace, [xml]);
      }

      const simpleName = xml.namespace.substring(
        xml.namespace.lastIndexOf(".") + 1,
      );
      const existing = xmlBySimpleName.get(simpleName);
      if (existing) {
        existing.push(xml);
      } else {
        xmlBySimpleName.set(simpleName, [xml]);
      }
    }

    // 2. 匹配 Java 和 XML（带模块上下文）
    const matchedPairs: Array<{ java: JavaMapperInfo; xml?: XmlMapperInfo; moduleId?: string }> = [];
    const unmatchedJava: JavaMapperInfo[] = [];

    for (const java of javaMappers) {
      // 解析 Java 文件所属模块
      const module = this.moduleResolver.resolveModuleForPath(java.filePath);
      const moduleId = module?.moduleId || "default";

      // 策略1: namespace 直接匹配（考虑同 namespace 多模块）
      let xml: XmlMapperInfo | undefined;
      const xmlCandidates = xmlByNamespace.get(java.className);
      if (xmlCandidates) {
        if (xmlCandidates.length === 1) {
          xml = xmlCandidates[0];
        } else if (xmlCandidates.length > 1) {
          // 多个相同 namespace 的 XML，优先选择与 Java 同模块的
          const sameModuleXml = xmlCandidates.find((x) => {
            const xmlModule = this.moduleResolver.resolveModuleForPath(x.filePath);
            return xmlModule?.moduleId === moduleId;
          });
          if (sameModuleXml) {
            xml = sameModuleXml;
          } else {
            //  fallback: 使用路径相似度
            xml = this.findBestMatchByFileName(java, xmlCandidates);
          }
        }
      }

      // 策略2: 简单类名匹配
      if (!xml) {
        const simpleName = java.className.substring(
          java.className.lastIndexOf(".") + 1,
        );
        const candidates = xmlBySimpleName.get(simpleName);
        if (candidates && candidates.length === 1) {
          xml = candidates[0];
        } else if (candidates && candidates.length > 1) {
          // 优先选择同模块
          const sameModuleXml = candidates.find((x) => {
            const xmlModule = this.moduleResolver.resolveModuleForPath(x.filePath);
            return xmlModule?.moduleId === moduleId;
          });
          if (sameModuleXml) {
            xml = sameModuleXml;
          } else {
            xml = this.findBestMatchByFileName(java, candidates);
          }
        }
      }

      matchedPairs.push({ java, xml, moduleId });

      if (xml) {
        // 从待匹配列表中移除该 XML（避免重复匹配）
        const candidates = xmlByNamespace.get(java.className);
        if (candidates) {
          const index = candidates.indexOf(xml);
          if (index >= 0) {
            candidates.splice(index, 1);
          }
        }
      }
    }

    // 3. 批量建立映射（传递 moduleId）
    this.mappingEngine.buildMappings(matchedPairs);

    this.logger?.debug(`Built mappings in ${Date.now() - startTime}ms`);
  }
```

**步骤 7：改造 rescanJavaFile 方法**
将 rescanJavaFile 替换为：
```typescript
  public async rescanJavaFile(filePath: string): Promise<void> {
    try {
      const mapper = await this.parseJavaMapperFast(filePath);
      if (mapper) {
        const existingMapping = this.mappingEngine.getByJavaPath(filePath);
        let xml: XmlMapperInfo | undefined;

        if (existingMapping?.xmlPath) {
          const parsedXml = await this.xmlParser.parseXmlMapper(
            existingMapping.xmlPath,
          );
          xml = parsedXml ?? undefined;
        }

        // 解析模块上下文
        const module = this.moduleResolver.resolveModuleForPath(filePath);
        const moduleId = module?.moduleId || "default";

        this.mappingEngine.buildMapping(mapper, xml, moduleId);
        this.emit("javaUpdated", mapper);
      } else {
        this.mappingEngine.removeMapping(filePath);
        this.emit("javaRemoved", filePath);
      }
    } catch (error) {
      this.logger?.debug(`Failed to rescan Java file ${filePath}:`, error);
    }
  }
```

**步骤 8：改造 rescanXmlFile 方法**
将 rescanXmlFile 替换为：
```typescript
  public async rescanXmlFile(filePath: string): Promise<void> {
    try {
      const mapper = await this.xmlParser.parseXmlMapper(filePath);
      if (mapper && mapper.namespace) {
        // 解析 XML 文件所属模块
        const xmlModule = this.moduleResolver.resolveModuleForPath(filePath);
        const xmlModuleId = xmlModule?.moduleId || "default";

        // 尝试通过 namespace + moduleId 精确查找
        const existingMapping = this.mappingEngine.getByNamespace(
          mapper.namespace,
          { moduleId: xmlModuleId },
        );

        if (existingMapping) {
          this.mappingEngine.updateXmlPath(existingMapping.javaPath, filePath);
          this.mappingEngine.updateMethodPositions(
            existingMapping.javaPath,
            mapper.statements,
          );
          this.emit("xmlUpdated", mapper);
        } else {
          // fallback: 通过 referencePath 查找
          const javaMapping = this.mappingEngine.getByClassName(
            mapper.namespace,
            { referencePath: filePath },
          );
          if (javaMapping) {
            const javaMapper = await this.parseJavaMapperFast(
              javaMapping.javaPath,
            );
            if (javaMapper) {
              const javaModule = this.moduleResolver.resolveModuleForPath(javaMapping.javaPath);
              const moduleId = javaModule?.moduleId || "default";
              this.mappingEngine.buildMapping(javaMapper, mapper, moduleId);
              this.emit("xmlUpdated", mapper);
            }
          }
        }
      }
    } catch (error) {
      this.logger?.debug(`Failed to rescan XML file ${filePath}:`, error);
    }
  }
```
  </action>
  <acceptance_criteria>
    - grep "ModuleResolver" src/features/mapping/fastScanner.ts 返回匹配
    - grep "moduleResolver" src/features/mapping/fastScanner.ts 返回匹配（至少 2 处）
    - grep "resolveModuleForPath" src/features/mapping/fastScanner.ts 返回匹配（至少 2 处）
    - grep "moduleId" src/features/mapping/fastScanner.ts 返回匹配（至少 5 处）
    - grep "buildMappings(matchedPairs)" src/features/mapping/fastScanner.ts 返回匹配
    - npm run compile 无错误
  </acceptance_criteria>
</task>

<task id="T2">
  <description>改造 EnterpriseScanner 集成 ModuleResolver</description>
  <read_first>
    - src/features/mapping/enterpriseScanner.ts
    - src/features/mapping/moduleResolver.ts
    - src/features/mapping/fastMappingEngine.ts
    - src/features/mapping/fastScanner.ts（T1 改造后参考）
  </read_first>
  <action>
按以下步骤改造 src/features/mapping/enterpriseScanner.ts：

**步骤 1：添加 ModuleResolver import**
在第 15 行（XmlLocationResolver import 之后）添加：
```typescript
import { ModuleResolver } from "./moduleResolver";
```

**步骤 2：添加 moduleResolver 字段**
在 EnterpriseScanner 类的字段声明区（第 51-58 行，isScanning 之前）添加：
```typescript
  private moduleResolver: ModuleResolver;
```

**步骤 3：在 constructor 中初始化 moduleResolver**
在第 66 行（locationResolver 初始化之后）添加：
```typescript
    this.moduleResolver = ModuleResolver.getInstance();
```

**步骤 4：在 initialize 方法中初始化 moduleResolver**
在第 85 行（locationResolver.initialize() 之后）添加：
```typescript
    await this.moduleResolver.initialize();
```

**步骤 5：改造 buildMappingsFromResults 方法**
将 buildMappingsFromResults 替换为：
```typescript
  private buildMappingsFromResults(
    javaMappers: JavaMapperInfo[],
    xmlMappers: XmlMapperInfo[],
  ): void {
    const startTime = Date.now();

    // 建立XML索引
    const xmlByNamespace = new Map<string, XmlMapperInfo[]>();
    const xmlBySimpleName = new Map<string, XmlMapperInfo[]>();

    for (const xml of xmlMappers) {
      const existingByNs = xmlByNamespace.get(xml.namespace);
      if (existingByNs) {
        existingByNs.push(xml);
      } else {
        xmlByNamespace.set(xml.namespace, [xml]);
      }

      const simpleName = xml.namespace.substring(
        xml.namespace.lastIndexOf(".") + 1,
      );
      const existing = xmlBySimpleName.get(simpleName);
      if (existing) {
        existing.push(xml);
      } else {
        xmlBySimpleName.set(simpleName, [xml]);
      }
    }

    // 匹配Java和XML（带模块上下文）
    const matchedPairs: Array<{ java: JavaMapperInfo; xml?: XmlMapperInfo; moduleId?: string }> = [];

    for (const java of javaMappers) {
      // 解析 Java 文件所属模块
      const module = this.moduleResolver.resolveModuleForPath(java.filePath);
      const moduleId = module?.moduleId || "default";

      // 策略1: namespace直接匹配
      let xml: XmlMapperInfo | undefined;
      const xmlCandidates = xmlByNamespace.get(java.className);
      if (xmlCandidates) {
        if (xmlCandidates.length === 1) {
          xml = xmlCandidates[0];
        } else if (xmlCandidates.length > 1) {
          // 优先选择同模块的 XML
          const sameModuleXml = xmlCandidates.find((x) => {
            const xmlModule = this.moduleResolver.resolveModuleForPath(x.filePath);
            return xmlModule?.moduleId === moduleId;
          });
          if (sameModuleXml) {
            xml = sameModuleXml;
          } else {
            xml = this.findBestMatchByFileName(java, xmlCandidates);
          }
        }
      }

      // 策略2: 简单类名匹配
      if (!xml) {
        const simpleName = java.className.substring(
          java.className.lastIndexOf(".") + 1,
        );
        const candidates = xmlBySimpleName.get(simpleName);
        if (candidates && candidates.length === 1) {
          xml = candidates[0];
        } else if (candidates && candidates.length > 1) {
          const sameModuleXml = candidates.find((x) => {
            const xmlModule = this.moduleResolver.resolveModuleForPath(x.filePath);
            return xmlModule?.moduleId === moduleId;
          });
          if (sameModuleXml) {
            xml = sameModuleXml;
          } else {
            xml = this.findBestMatchByFileName(java, candidates);
          }
        }
      }

      matchedPairs.push({ java, xml, moduleId });

      if (xml) {
        const candidates = xmlByNamespace.get(java.className);
        if (candidates) {
          const index = candidates.indexOf(xml);
          if (index >= 0) {
            candidates.splice(index, 1);
          }
        }
      }
    }

    // 批量建立映射
    this.mappingEngine.buildMappings(matchedPairs);

    this.logger?.debug(`Built ${matchedPairs.length} mappings in ${Date.now() - startTime}ms`);
  }
```

**步骤 6：改造 rescanJavaFile 方法**
将 rescanJavaFile 替换为：
```typescript
  public async rescanJavaFile(filePath: string): Promise<void> {
    try {
      const mapper = await this.parseJavaMapperFast(filePath);
      if (mapper) {
        const existingMapping = this.mappingEngine.getByJavaPath(filePath);
        let xml: XmlMapperInfo | undefined;

        if (existingMapping?.xmlPath) {
          xml =
            (await this.xmlParser.parseXmlMapper(existingMapping.xmlPath)) ||
            undefined;
        }

        // 解析模块上下文
        const module = this.moduleResolver.resolveModuleForPath(filePath);
        const moduleId = module?.moduleId || "default";

        this.mappingEngine.buildMapping(mapper, xml, moduleId);
        this.emit("javaUpdated", mapper);
      } else {
        this.mappingEngine.removeMapping(filePath);
        this.emit("javaRemoved", filePath);
      }
    } catch (error) {
      this.logger?.debug(`Failed to rescan Java file ${filePath}:`, error);
    }
  }
```

**步骤 7：改造 rescanXmlFile 方法**
将 rescanXmlFile 替换为：
```typescript
  public async rescanXmlFile(filePath: string): Promise<void> {
    try {
      const mapper = await this.xmlParser.parseXmlMapper(filePath);
      if (mapper && mapper.namespace) {
        // 解析 XML 文件所属模块
        const xmlModule = this.moduleResolver.resolveModuleForPath(filePath);
        const xmlModuleId = xmlModule?.moduleId || "default";

        // 尝试通过 namespace + moduleId 精确查找
        const existingMapping = this.mappingEngine.getByNamespace(
          mapper.namespace,
          { moduleId: xmlModuleId },
        );

        if (existingMapping) {
          this.mappingEngine.updateXmlPath(existingMapping.javaPath, filePath);
          this.mappingEngine.updateMethodPositions(
            existingMapping.javaPath,
            mapper.statements,
          );
          this.emit("xmlUpdated", mapper);
        } else {
          // fallback: 通过 referencePath 查找
          const javaMapping = this.mappingEngine.getByClassName(
            mapper.namespace,
            { referencePath: filePath },
          );
          if (javaMapping) {
            const javaMapper = await this.parseJavaMapperFast(
              javaMapping.javaPath,
            );
            if (javaMapper) {
              const javaModule = this.moduleResolver.resolveModuleForPath(javaMapping.javaPath);
              const moduleId = javaModule?.moduleId || "default";
              this.mappingEngine.buildMapping(javaMapper, mapper, moduleId);
              this.emit("xmlUpdated", mapper);
            }
          }
        }
      }
    } catch (error) {
      this.logger?.debug(`Failed to rescan XML file ${filePath}:`, error);
    }
  }
```

**步骤 8：添加 findBestMatchByFileName 方法（如果不存在）**
检查 enterpriseScanner.ts 是否已有 findBestMatchByFileName 方法。如果没有，从 fastScanner.ts 复制该方法实现到 enterpriseScanner.ts 中。
  </action>
  <acceptance_criteria>
    - grep "ModuleResolver" src/features/mapping/enterpriseScanner.ts 返回匹配
    - grep "moduleResolver" src/features/mapping/enterpriseScanner.ts 返回匹配（至少 2 处）
    - grep "resolveModuleForPath" src/features/mapping/enterpriseScanner.ts 返回匹配（至少 2 处）
    - grep "moduleId" src/features/mapping/enterpriseScanner.ts 返回匹配（至少 5 处）
    - grep "buildMappings(matchedPairs)" src/features/mapping/enterpriseScanner.ts 返回匹配
    - npm run compile 无错误
  </acceptance_criteria>
</task>

</tasks>

<threat_model>
## Trust Boundaries

| Boundary | Description |
|----------|-------------|
| Scanner -> Engine | 扫描器传递 moduleId 给引擎 |

## STRIDE Threat Register

| Threat ID | Category | Component | Disposition | Mitigation Plan |
|-----------|----------|-----------|-------------|-----------------|
| T-06-P03-01 | Tampering | moduleId 在扫描阶段被错误解析 | mitigate | ModuleResolver 使用规范化路径计算 moduleId，确保一致性 |
| T-06-P03-02 | Denial of Service | 大项目模块解析阻塞扫描 | accept | ModuleResolver 在 initialize 中一次性解析，扫描阶段仅做 Map 查找 |
</threat_model>

<verification>
1. `npm run compile` 无编译错误
2. `npm run lint` 无错误
3. grep 验证两个扫描器都包含 ModuleResolver 引用和 resolveModuleForPath 调用
</verification>

<success_criteria>
- FastScanner 和 EnterpriseScanner 都导入并初始化了 ModuleResolver
- buildMappingsFromResults 方法为每个 Java 文件解析 moduleId 并传递给引擎
- rescanJavaFile 和 rescanXmlFile 方法使用模块上下文进行精确查找
- 编译和 lint 通过
</success_criteria>

<output>
After completion, create `.planning/phases/06-module-aware-mapping-engine-refactor/06-P03-SUMMARY.md`
</output>
