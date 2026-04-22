---
phase: 06-module-aware-mapping-engine-refactor
plan: P01
type: execute
wave: 1
depends_on: []
files_modified:
  - src/features/mapping/moduleResolver.ts
  - src/features/mapping/types.ts
autonomous: true
requirements:
  - P1-01
  - P1-02
  - P1-03
must_haves:
  truths:
    - ModuleResolver 能识别 Maven 多模块项目的模块边界
    - ModuleResolver 能识别 Gradle 多项目结构的模块边界
    - 无构建文件的项目返回默认模块（moduleId 为 "default"）
    - 模块 ID 使用 workspace root 相对路径，确保团队协作一致性
  artifacts:
    - path: src/features/mapping/moduleResolver.ts
      provides: ModuleResolver 类，包含模块解析逻辑
      exports: ["ModuleResolver", "ModuleContext"]
    - path: src/features/mapping/types.ts
      provides: ModuleContext 接口定义
      contains: "interface ModuleContext"
  key_links:
    - from: ModuleResolver.resolveModuleForPath
      to: pom.xml / build.gradle / settings.gradle
      via: fs.readFile + 正则匹配
    - from: ModuleContext.moduleId
      to: workspace root 相对路径
---

<objective>
创建 ModuleResolver，显式识别项目模块边界。ModuleResolver 通过解析 pom.xml、settings.gradle、settings.gradle.kts 等构建文件，确定模块层级结构，为后续复合键索引提供模块上下文。

Purpose: 消除多服务同名 Mapper 的歧义问题根源——当前引擎不知道文件属于哪个模块，只能依赖路径相似度猜测。
Output: moduleResolver.ts（新文件）+ types.ts（新增 ModuleContext 接口）
</objective>

<execution_context>
@$HOME/.claude/get-shit-done/workflows/execute-plan.md
</execution_context>

<context>
@.planning/phases/06-module-aware-mapping-engine-refactor/06-RESEARCH.md
@src/features/mapping/types.ts
@src/features/mapping/fastMappingEngine.ts
</context>

<tasks>

<task id="T1">
  <description>在 types.ts 中新增 ModuleContext 接口</description>
  <read_first>
    - src/features/mapping/types.ts
  </read_first>
  <action>
在 src/features/mapping/types.ts 末尾添加以下接口定义（在文件最后一个 export 之后）：

```typescript
/**
 * 模块上下文接口
 * 表示文件所属的模块边界信息
 */
export interface ModuleContext {
  /** 模块唯一标识（相对于 workspace root 的路径） */
  moduleId: string;
  /** 模块根目录的绝对路径 */
  modulePath: string;
  /** 模块类型 */
  type: "maven" | "gradle" | "simple";
  /** 构建文件路径（如 pom.xml 或 build.gradle） */
  buildFile?: string;
  /** 源码根目录列表 */
  sourceRoots: string[];
  /** 资源根目录列表 */
  resourceRoots: string[];
}
```

确保接口前有一个空行，与前面的代码保持一致的格式。
  </action>
  <acceptance_criteria>
    - grep "export interface ModuleContext" src/features/mapping/types.ts 返回匹配
    - grep "moduleId: string" src/features/mapping/types.ts 返回匹配
    - grep "type: \"maven\" | \"gradle\" | \"simple\"" src/features/mapping/types.ts 返回匹配
  </acceptance_criteria>
</task>

<task id="T2">
  <description>创建 ModuleResolver 类</description>
  <read_first>
    - src/features/mapping/types.ts
    - src/features/mapping/fastMappingEngine.ts（仅看 import 和类型使用方式）
  </read_first>
  <action>
创建 src/features/mapping/moduleResolver.ts，内容如下：

```typescript
/**
 * 模块解析器
 *
 * 通过解析构建文件（pom.xml、settings.gradle 等）识别项目模块边界。
 * 为每个文件确定其所属的模块上下文。
 */

import * as vscode from "vscode";
import * as path from "path";
import * as fs from "fs/promises";
import { ModuleContext } from "./types";
import { Logger } from "../../utils/logger";

export class ModuleResolver {
  private static instance: ModuleResolver;
  private modules: Map<string, ModuleContext> = new Map();
  private logger!: Logger;
  private initialized = false;

  private constructor() {}

  public static getInstance(): ModuleResolver {
    if (!ModuleResolver.instance) {
      ModuleResolver.instance = new ModuleResolver();
    }
    return ModuleResolver.instance;
  }

  public async initialize(): Promise<void> {
    if (this.initialized) {
      return;
    }
    const { Logger } = await import("../../utils/logger.js");
    this.logger = Logger.getInstance();
    await this.discoverModules();
    this.initialized = true;
  }

  /**
   * 重新发现模块（用于构建文件变更后）
   */
  public async refresh(): Promise<void> {
    this.modules.clear();
    await this.discoverModules();
  }

  /**
   * 为给定文件路径解析所属模块
   */
  public resolveModuleForPath(filePath: string): ModuleContext | undefined {
    let bestMatch: ModuleContext | undefined;
    let bestMatchLength = 0;

    for (const module of this.modules.values()) {
      // 检查文件路径是否以模块路径开头
      const modulePathWithSep = module.modulePath.endsWith(path.sep)
        ? module.modulePath
        : module.modulePath + path.sep;

      if (
        filePath === module.modulePath ||
        filePath.startsWith(modulePathWithSep)
      ) {
        // 选择最长匹配的模块（嵌套模块场景：子模块优先）
        if (module.modulePath.length > bestMatchLength) {
          bestMatch = module;
          bestMatchLength = module.modulePath.length;
        }
      }
    }

    return bestMatch;
  }

  /**
   * 获取所有已发现的模块
   */
  public getAllModules(): ModuleContext[] {
    return Array.from(this.modules.values());
  }

  /**
   * 获取模块数量
   */
  public getModuleCount(): number {
    return this.modules.size;
  }

  // ========== 模块发现 ==========

  private async discoverModules(): Promise<void> {
    const workspaceFolders = vscode.workspace.workspaceFolders;
    if (!workspaceFolders) {
      return;
    }

    for (const folder of workspaceFolders) {
      await this.discoverModulesInWorkspace(folder.uri.fsPath);
    }

    this.logger?.info(
      `Discovered ${this.modules.size} modules: ${Array.from(this.modules.keys()).join(", ")}`,
    );
  }

  private async discoverModulesInWorkspace(
    workspacePath: string,
  ): Promise<void> {
    // 1. 尝试 Maven 多模块
    const pomPath = path.join(workspacePath, "pom.xml");
    try {
      await fs.access(pomPath);
      const pomContent = await fs.readFile(pomPath, "utf-8");
      if (pomContent.includes("<modules>")) {
        await this.parseMavenModules(workspacePath, pomContent);
        return;
      }
    } catch {
      // 不是 Maven 或不是多模块
    }

    // 2. 尝试 Gradle 多项目
    const settingsPath = path.join(workspacePath, "settings.gradle");
    const settingsKtsPath = path.join(workspacePath, "settings.gradle.kts");
    let settingsFile: string | null = null;
    try {
      await fs.access(settingsPath);
      settingsFile = settingsPath;
    } catch {
      try {
        await fs.access(settingsKtsPath);
        settingsFile = settingsKtsPath;
      } catch {
        // 无 settings.gradle
      }
    }

    if (settingsFile) {
      const content = await fs.readFile(settingsFile, "utf-8");
      if (content.includes("include")) {
        await this.parseGradleModules(workspacePath, content);
        return;
      }
    }

    // 3. 单模块项目（无多模块结构）
    const hasPom = await this.fileExists(path.join(workspacePath, "pom.xml"));
    const hasBuildGradle = await this.fileExists(
      path.join(workspacePath, "build.gradle"),
    );
    const hasBuildGradleKts = await this.fileExists(
      path.join(workspacePath, "build.gradle.kts"),
    );

    if (hasPom || hasBuildGradle || hasBuildGradleKts) {
      // 有构建文件的单模块项目
      const buildFile = hasPom
        ? path.join(workspacePath, "pom.xml")
        : hasBuildGradle
          ? path.join(workspacePath, "build.gradle")
          : path.join(workspacePath, "build.gradle.kts");

      this.addModule({
        moduleId: ".", // workspace root 相对路径
        modulePath: workspacePath,
        type: hasPom ? "maven" : "gradle",
        buildFile,
        sourceRoots: [path.join(workspacePath, "src", "main", "java")],
        resourceRoots: [path.join(workspacePath, "src", "main", "resources")],
      });
    } else {
      // 无构建文件的简单项目
      this.addModule({
        moduleId: "default",
        modulePath: workspacePath,
        type: "simple",
        sourceRoots: [path.join(workspacePath, "src", "main", "java")],
        resourceRoots: [path.join(workspacePath, "src", "main", "resources")],
      });
    }
  }

  // ========== Maven 解析 ==========

  private async parseMavenModules(
    parentPath: string,
    pomContent: string,
  ): Promise<void> {
    // 解析 <modules> 中的 <module> 元素
    const moduleRegex = /<module>([^<]+)<\/module>/g;
    const childModules: string[] = [];
    let match;
    while ((match = moduleRegex.exec(pomContent)) !== null) {
      const moduleName = match[1].trim();
      if (moduleName) {
        childModules.push(moduleName);
      }
    }

    if (childModules.length === 0) {
      // 没有子模块，将自身作为单模块
      this.addModule({
        moduleId: ".",
        modulePath: parentPath,
        type: "maven",
        buildFile: path.join(parentPath, "pom.xml"),
        sourceRoots: [path.join(parentPath, "src", "main", "java")],
        resourceRoots: [path.join(parentPath, "src", "main", "resources")],
      });
      return;
    }

    // 添加 parent 模块（如果 parent 本身也是模块）
    const hasSrcDir = await this.directoryExists(
      path.join(parentPath, "src"),
    );
    if (hasSrcDir) {
      this.addModule({
        moduleId: ".",
        modulePath: parentPath,
        type: "maven",
        buildFile: path.join(parentPath, "pom.xml"),
        sourceRoots: [path.join(parentPath, "src", "main", "java")],
        resourceRoots: [path.join(parentPath, "src", "main", "resources")],
      });
    }

    // 递归解析子模块
    for (const moduleName of childModules) {
      const childPath = path.join(parentPath, moduleName);
      const childPomPath = path.join(childPath, "pom.xml");

      try {
        await fs.access(childPomPath);
        const childPomContent = await fs.readFile(childPomPath, "utf-8");

        // 计算相对于 workspace root 的 moduleId
        const moduleId = this.calculateModuleId(childPath);

        this.addModule({
          moduleId,
          modulePath: childPath,
          type: "maven",
          buildFile: childPomPath,
          sourceRoots: [path.join(childPath, "src", "main", "java")],
          resourceRoots: [path.join(childPath, "src", "main", "resources")],
        });

        // 递归检查子模块是否还有子模块
        if (childPomContent.includes("<modules>")) {
          await this.parseMavenModules(childPath, childPomContent);
        }
      } catch {
        this.logger?.warn(`Maven module not found: ${childPomPath}`);
      }
    }
  }

  // ========== Gradle 解析 ==========

  private async parseGradleModules(
    rootPath: string,
    settingsContent: string,
  ): Promise<void> {
    // 解析 include 语句
    // 支持: include 'module', include("module"), include 'module1', 'module2'
    const includeRegex = /include\s*(?:\(|\s)\s*['"]([^'"]+)['"]/g;
    const childModules: string[] = [];
    let match;
    while ((match = includeRegex.exec(settingsContent)) !== null) {
      const moduleName = match[1].trim();
      if (moduleName) {
        childModules.push(moduleName);
      }
    }

    // 也尝试解析 Kotlin DSL 格式
    const includeKtsRegex = /include\s*\(\s*["']([^"']+)["']\s*\)/g;
    while ((match = includeKtsRegex.exec(settingsContent)) !== null) {
      const moduleName = match[1].trim();
      if (moduleName && !childModules.includes(moduleName)) {
        childModules.push(moduleName);
      }
    }

    if (childModules.length === 0) {
      // 没有子模块，将自身作为单模块
      this.addModule({
        moduleId: ".",
        modulePath: rootPath,
        type: "gradle",
        buildFile: path.join(rootPath, "settings.gradle"),
        sourceRoots: [path.join(rootPath, "src", "main", "java")],
        resourceRoots: [path.join(rootPath, "src", "main", "resources")],
      });
      return;
    }

    // 添加 root 项目
    const hasSrcDir = await this.directoryExists(path.join(rootPath, "src"));
    if (hasSrcDir) {
      this.addModule({
        moduleId: ".",
        modulePath: rootPath,
        type: "gradle",
        buildFile:
          (await this.fileExists(path.join(rootPath, "settings.gradle")))
            ? path.join(rootPath, "settings.gradle")
            : path.join(rootPath, "settings.gradle.kts"),
        sourceRoots: [path.join(rootPath, "src", "main", "java")],
        resourceRoots: [path.join(rootPath, "src", "main", "resources")],
      });
    }

    // 解析子模块
    for (const moduleName of childModules) {
      const modulePath = path.join(rootPath, moduleName);
      const buildGradlePath = path.join(modulePath, "build.gradle");
      const buildGradleKtsPath = path.join(modulePath, "build.gradle.kts");

      let buildFile: string | undefined;
      if (await this.fileExists(buildGradlePath)) {
        buildFile = buildGradlePath;
      } else if (await this.fileExists(buildGradleKtsPath)) {
        buildFile = buildGradleKtsPath;
      }

      if (buildFile) {
        const moduleId = this.calculateModuleId(modulePath);
        this.addModule({
          moduleId,
          modulePath,
          type: "gradle",
          buildFile,
          sourceRoots: [path.join(modulePath, "src", "main", "java")],
          resourceRoots: [path.join(modulePath, "src", "main", "resources")],
        });
      }
    }
  }

  // ========== 辅助方法 ==========

  private addModule(module: ModuleContext): void {
    this.modules.set(module.moduleId, module);
    this.logger?.debug(
      `Registered module: ${module.moduleId} -> ${module.modulePath}`,
    );
  }

  private calculateModuleId(modulePath: string): string {
    const workspaceFolders = vscode.workspace.workspaceFolders;
    if (!workspaceFolders) {
      return modulePath;
    }

    // 找到对应的 workspace folder
    for (const folder of workspaceFolders) {
      const folderPath = folder.uri.fsPath;
      if (modulePath === folderPath) {
        return ".";
      }
      if (modulePath.startsWith(folderPath + path.sep)) {
        return modulePath.substring(folderPath.length + 1);
      }
    }

    // 如果不在任何 workspace folder 中，使用绝对路径的最后一部分
    return path.basename(modulePath);
  }

  private async fileExists(filePath: string): Promise<boolean> {
    try {
      await fs.access(filePath);
      return true;
    } catch {
      return false;
    }
  }

  private async directoryExists(dirPath: string): Promise<boolean> {
    try {
      const stat = await fs.stat(dirPath);
      return stat.isDirectory();
    } catch {
      return false;
    }
  }
}
```

注意：
1. 使用 `fs/promises` 进行异步文件操作
2. 模块 ID 使用 workspace root 相对路径
3. 嵌套模块场景选择最长路径匹配
4. 无构建文件项目使用 "default" 作为 moduleId
  </action>
  <acceptance_criteria>
    - grep "export class ModuleResolver" src/features/mapping/moduleResolver.ts 返回匹配
    - grep "resolveModuleForPath" src/features/mapping/moduleResolver.ts 返回匹配
    - grep "discoverModules" src/features/mapping/moduleResolver.ts 返回匹配
    - grep "parseMavenModules" src/features/mapping/moduleResolver.ts 返回匹配
    - grep "parseGradleModules" src/features/mapping/moduleResolver.ts 返回匹配
    - grep "moduleId: \"default\"" src/features/mapping/moduleResolver.ts 返回匹配
    - grep "calculateModuleId" src/features/mapping/moduleResolver.ts 返回匹配
  </acceptance_criteria>
</task>

</tasks>

<threat_model>
## Trust Boundaries

| Boundary | Description |
|----------|-------------|
| filePath -> ModuleResolver | 用户工作区文件路径传入模块解析器 |

## STRIDE Threat Register

| Threat ID | Category | Component | Disposition | Mitigation Plan |
|-----------|----------|-----------|-------------|-----------------|
| T-06-P01-01 | Tampering | ModuleResolver 读取 pom.xml/build.gradle | mitigate | 使用 `path.join` + `fs.access` 验证文件存在性，不执行用户控制的路径 |
| T-06-P01-02 | Denial of Service | 正则解析大构建文件 | accept | 构建文件通常 < 100KB，正则解析不会导致 ReDoS |
</threat_model>

<verification>
1. `npm run compile` 无编译错误
2. `npm run lint` 无错误
3. grep 验证 moduleResolver.ts 中所有关键方法存在
</verification>

<success_criteria>
- ModuleContext 接口已定义在 types.ts 中
- ModuleResolver 类已创建，包含完整的模块发现逻辑
- 支持 Maven 多模块、Gradle 多项目、单模块/无构建文件三种场景
- 模块 ID 使用 workspace root 相对路径
- 编译和 lint 通过
</success_criteria>

<output>
After completion, create `.planning/phases/06-module-aware-mapping-engine-refactor/06-P01-SUMMARY.md`
</output>
