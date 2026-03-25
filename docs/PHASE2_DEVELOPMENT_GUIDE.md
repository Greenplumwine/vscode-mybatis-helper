# MyBatis Helper Phase 2 开发指南

> **文档版本**: 1.0  
> **创建日期**: 2026-02-27  
> **状态**: 待开发

---

## 概述

Phase 2 专注于**智能代码补全、格式化、代码生成**等高级功能，基于已完成的 Phase 1 基础服务层进行开发。

### Phase 1 已完成基础
- ✅ LanguageDetector - 语言类型检测
- ✅ JavaMethodParser - Java 方法解析
- ✅ MyBatisXmlParser - XML 解析（含 XXE 防护）
- ✅ TagHierarchyResolver - DTD 标签层级解析
- ✅ TemplateEngine - 模板引擎
- ✅ FastMappingEngine - O(1) 映射索引
- ✅ UnifiedNavigationService - 统一导航服务

### Phase 2 新增依赖
```bash
# 格式化功能需要
npm install sql-formatter xml-formatter
```

---

## 功能模块清单

### 模块 1: 统一智能补全 (UnifiedCompletionProvider)

**优先级**: P0 (核心功能)  
**现状**: 现有 SQLCompletionProvider 需要重构  
**目标**: 基于策略模式的可扩展补全框架

#### 1.1 架构设计

```
┌─────────────────────────────────────────────────────────────┐
│              UnifiedCompletionProvider                      │
│              (vscode.CompletionItemProvider)                │
├─────────────────────────────────────────────────────────────┤
│ - strategies: CompletionStrategy[]                          │
│ - contextBuilder: CompletionContextBuilder                  │
├─────────────────────────────────────────────────────────────┤
│ + provideCompletionItems()                                  │
│ - buildContext(): CompletionContext                         │
│ - selectStrategy(): CompletionStrategy                      │
└─────────────────────────────────────────────────────────────┘
                              │
        ┌─────────────────────┼─────────────────────┐
        │                     │                     │
        ▼                     ▼                     ▼
┌───────────────┐   ┌─────────────────┐   ┌─────────────────┐
│ CompletionStrategy (interface)                              │
├───────────────┤   ├─────────────────┤   ├─────────────────┤
│ triggerChars  │   │   priority      │   │  canComplete()  │
│ provideItems  │   └─────────────────┘   └─────────────────┘
└───────────────┘
        ▲
        │ extends
   ┌────┴────┬────────┬────────┬────────┐
   │         │        │        │        │
   ▼         ▼        ▼        ▼        ▼
Placeholder Foreach  Property  Type    TypeHandler
Strategy   Strategy  Strategy  Strategy Strategy
```

#### 1.2 文件结构

```
src/features/completion/
├── types.ts                          # 公共类型定义
├── contextBuilder.ts                 # 上下文构建器
├── unifiedCompletionProvider.ts      # 统一 Provider
├── index.ts                          # 模块导出
└── strategies/                       # 策略实现目录
    ├── index.ts
    ├── baseStrategy.ts               # 抽象基类
    ├── placeholderStrategy.ts        # 占位符补全
    ├── foreachVariableStrategy.ts    # foreach 变量
    ├── propertyStrategy.ts           # 对象属性
    ├── typeStrategy.ts               # 类型补全
    └── typeHandlerStrategy.ts        # TypeHandler
```

#### 1.3 核心接口定义

```typescript
// types.ts

/**
 * 补全策略接口
 */
export interface CompletionStrategy {
  /** 触发字符列表 */
  readonly triggerCharacters: readonly string[];
  
  /** 优先级，数值越大优先级越高 */
  readonly priority: number;
  
  /** 策略名称 */
  readonly name: string;
  
  /**
   * 判断当前上下文是否支持此策略
   */
  canComplete(context: CompletionContext): boolean | Promise<boolean>;
  
  /**
   * 提供补全项
   */
  provideCompletionItems(
    context: CompletionContext
  ): Promise<vscode.CompletionItem[]>;
}

/**
 * 补全上下文
 */
export interface CompletionContext {
  /** 当前文档 */
  readonly document: vscode.TextDocument;
  
  /** 光标位置 */
  readonly position: vscode.Position;
  
  /** 触发字符 */
  readonly triggerCharacter: string | undefined;
  
  /** 光标前行文本 */
  readonly linePrefix: string;
  
  /** 光标后行文本 */
  readonly lineSuffix: string;
  
  /** XML 解析信息 */
  readonly xmlInfo?: XmlMapperInfo;
  
  /** 当前 Java 方法信息 */
  readonly javaMethod?: JavaMethod;
  
  /** foreach 上下文 */
  readonly foreachContext?: ForeachContext;
}

/**
 * Foreach 上下文
 */
export interface ForeachContext {
  collection: string;
  item: string;
  index?: string;
}
```

#### 1.4 策略实现详情

##### 1.4.1 PlaceholderStrategy（占位符补全）

```typescript
/**
 * SQL 占位符补全策略
 * 触发：#{ 或 ${
 * 提供：方法参数列表
 */
export class PlaceholderStrategy extends BaseCompletionStrategy {
  readonly triggerCharacters = ['#', '$', '{'] as const;
  readonly priority = 70;
  readonly name = 'Placeholder';
  
  canComplete(context: CompletionContext): boolean {
    // 检查是否是 #{ 或 ${
    return /#\{$/.test(context.linePrefix) || /\$\{$/.test(context.linePrefix);
  }
  
  async provideCompletionItems(context: CompletionContext): Promise<vscode.CompletionItem[]> {
    if (!context.javaMethod) return [];
    
    const marker = context.linePrefix.endsWith('#{') ? '#' : '$';
    
    return context.javaMethod.parameters.map((param, index) => ({
      label: `${marker}{${param.name}}`,
      kind: vscode.CompletionItemKind.Variable,
      detail: `${param.type} ${param.name}`,
      documentation: param.paramName 
        ? new vscode.MarkdownString(`@Param("${param.paramName}")`)
        : undefined,
      insertText: `{${param.name}}`,
      sortText: param.paramName ? `0${index}` : `1${index}`
    }));
  }
}
```

##### 1.4.2 ForeachVariableStrategy（foreach 变量）

```typescript
/**
 * Foreach 变量补全策略
 * 触发：#{（在 foreach 标签内）
 * 提供：item, index 变量
 */
export class ForeachVariableStrategy extends BaseCompletionStrategy {
  readonly triggerCharacters = ['#', '$', '{'] as const;
  readonly priority = 90; // 比 PlaceholderStrategy 高
  readonly name = 'ForeachVariable';
  
  canComplete(context: CompletionContext): boolean {
    return context.foreachContext !== undefined && 
           /#\{$/.test(context.linePrefix);
  }
  
  async provideCompletionItems(context: CompletionContext): Promise<vscode.CompletionItem[]> {
    const { foreachContext } = context;
    if (!foreachContext) return [];
    
    const items: vscode.CompletionItem[] = [];
    
    // item 变量（最高优先级）
    items.push({
      label: foreachContext.item,
      kind: vscode.CompletionItemKind.Variable,
      detail: `foreach item (${foreachContext.collection} → ${foreachContext.item})`,
      sortText: '0',
      insertText: `{${foreachContext.item}}`
    });
    
    // index 变量
    if (foreachContext.index) {
      items.push({
        label: foreachContext.index,
        kind: vscode.CompletionItemKind.Variable,
        detail: 'foreach index',
        sortText: '1',
        insertText: `{${foreachContext.index}}`
      });
    }
    
    return items;
  }
}
```

##### 1.4.3 PropertyStrategy（对象属性）

```typescript
/**
 * 对象属性补全策略
 * 触发：.
 * 提供：对象类型的属性列表
 */
export class PropertyStrategy extends BaseCompletionStrategy {
  readonly triggerCharacters = ['.'] as const;
  readonly priority = 80;
  readonly name = 'Property';
  
  canComplete(context: CompletionContext): boolean {
    // 匹配 #{user. 或 ${user.
    return /#\{(\w+)\.$/.test(context.linePrefix) ||
           /\$\{(\w+)\.$/.test(context.linePrefix);
  }
  
  async provideCompletionItems(context: CompletionContext): Promise<vscode.CompletionItem[]> {
    // 提取对象名，获取属性列表
    // 需要 JavaMethodParser.getObjectProperties() 支持
  }
}
```

##### 1.4.4 TypeStrategy（类型补全）

```typescript
/**
 * Java 类型补全策略
 * 触发："（在 resultType/parameterType/javaType/ofType 属性中）
 * 提供：项目中的类名
 */
export class TypeStrategy extends BaseCompletionStrategy {
  readonly triggerCharacters = ['"', "'"] as const;
  readonly priority = 100;
  readonly name = 'Type';
  
  private static readonly TYPE_ATTRIBUTES = [
    'resultType', 'parameterType', 'javaType', 'ofType'
  ];
  
  canComplete(context: CompletionContext): boolean {
    return this.isInAttribute(context, TypeStrategy.TYPE_ATTRIBUTES);
  }
  
  async provideCompletionItems(context: CompletionContext): Promise<vscode.CompletionItem[]> {
    const partial = this.extractPartialValue(context);
    const classes = await this.javaParser.scanProjectClasses();
    
    return classes
      .filter(cls => cls.simpleName.toLowerCase().includes(partial))
      .map(cls => ({
        label: cls.simpleName,
        kind: vscode.CompletionItemKind.Class,
        detail: cls.fullyQualifiedName,
        insertText: cls.fullyQualifiedName
      }));
  }
}
```

##### 1.4.5 TypeHandlerStrategy（TypeHandler 补全）

```typescript
/**
 * TypeHandler 补全策略
 * 触发："（在 typeHandler 属性中）
 * 提供：常用 TypeHandler 列表
 */
export class TypeHandlerStrategy extends BaseCompletionStrategy {
  readonly triggerCharacters = ['"', "'"] as const;
  readonly priority = 100;
  readonly name = 'TypeHandler';
  
  private static readonly HANDLERS = [
    { name: 'String', fqcn: 'org.apache.ibatis.type.StringTypeHandler' },
    { name: 'Integer', fqcn: 'org.apache.ibatis.type.IntegerTypeHandler' },
    { name: 'Long', fqcn: 'org.apache.ibatis.type.LongTypeHandler' },
    { name: 'Boolean', fqcn: 'org.apache.ibatis.type.BooleanTypeHandler' },
    { name: 'Date', fqcn: 'org.apache.ibatis.type.DateTypeHandler' },
    { name: 'LocalDateTime', fqcn: 'org.apache.ibatis.type.LocalDateTimeTypeHandler' },
    { name: 'BigDecimal', fqcn: 'org.apache.ibatis.type.BigDecimalTypeHandler' }
  ];
  
  canComplete(context: CompletionContext): boolean {
    return this.isInAttribute(context, ['typeHandler']);
  }
  
  async provideCompletionItems(context: CompletionContext): Promise<vscode.CompletionItem[]> {
    const partial = this.extractPartialValue(context);
    
    return TypeHandlerStrategy.HANDLERS
      .filter(h => h.name.toLowerCase().includes(partial))
      .map(h => ({
        label: h.name,
        kind: vscode.CompletionItemKind.Class,
        detail: h.fqcn,
        insertText: h.fqcn
      }));
  }
}
```

#### 1.5 注册与激活

```typescript
// extension.ts

import { UnifiedCompletionProvider } from './features/completion/unifiedCompletionProvider';

export function activate(context: vscode.ExtensionContext) {
  // ... 其他初始化
  
  const completionProvider = new UnifiedCompletionProvider(
    javaMethodParser,
    myBatisXmlParser,
    fileMapper
  );
  
  const disposable = vscode.languages.registerCompletionItemProvider(
    [{ scheme: "file", pattern: "**/*.xml" }],
    completionProvider,
    ...completionProvider.triggerCharacters
  );
  
  context.subscriptions.push(disposable);
}
```

---

### 模块 2: Mapper XML 标签补全

**优先级**: P0  
**依赖**: TagHierarchyResolver（已完成）

#### 2.1 功能描述

| 场景 | 触发字符 | 补全内容 |
|------|---------|---------|
| 标签开始 | `<` | 所有可用标签（按上下文过滤）|
| 属性名 | ` ` | 当前标签的属性 |
| 属性值 | `"` | 属性可选值 |
| 智能子标签 | 在 `<select>` 内输入 `<` | 优先 `<if>`, `<where>`, `<foreach>` |
| 代码片段 | `fore` | foreach 模板 |

#### 2.2 文件结构

```
src/features/completion/
├── tagCompletionProvider.ts          # 标签补全 Provider
└── dtd/                              # 已存在，复用
    ├── tagHierarchyResolver.ts
    └── types.ts
```

#### 2.3 核心逻辑

```typescript
export class TagCompletionProvider implements vscode.CompletionItemProvider {
  static readonly triggerCharacters = ['<', ' ', '"'];
  
  private hierarchyResolver = TagHierarchyResolver.getInstance();
  
  async provideCompletionItems(document, position, context) {
    const hierarchy = await this.hierarchyResolver.resolveTagHierarchy();
    const triggerChar = context.triggerCharacter;
    const xmlContext = this.parseXmlContext(document, position);
    
    switch (triggerChar) {
      case '<':
        return this.provideTagNames(hierarchy, xmlContext.parentTag);
      case ' ':
        return this.provideAttributes(hierarchy, xmlContext.currentTag);
      case '"':
        return this.provideAttributeValues(
          hierarchy, 
          xmlContext.currentTag, 
          xmlContext.currentAttribute
        );
    }
  }
}
```

---

### 模块 3: 嵌套格式化 (NestedFormattingProvider)

**优先级**: P0  
**新增依赖**: `sql-formatter`, `xml-formatter`

#### 3.1 处理流程

```
原始内容
    │
    ▼
┌──────────────────────┐
│ 1. SQL 提取与保护     │  ← 将 <select> 等标签内的 SQL 替换为占位符
│    SqlExtractor      │
└──────────────────────┘
    │
    ▼
┌──────────────────────┐
│ 2. XML 格式化        │  ← 使用 xml-formatter 格式化结构
│    XmlFormatter      │
└──────────────────────┘
    │
    ▼
┌──────────────────────┐
│ 3. SQL 格式化        │  ← 使用 sql-formatter 格式化每个 SQL 块
│    SqlFormatter      │
└──────────────────────┘
    │
    ▼
┌──────────────────────┐
│ 4. 缩进调整          │  ← 调整 SQL 缩进以匹配 XML 层级
│    IndentAdjuster    │
└──────────────────────┘
    │
    ▼
┌──────────────────────┐
│ 5. 恢复与合并        │  ← 将格式化后的 SQL 替换回占位符位置
│    SqlExtractor      │
└──────────────────────┘
    │
    ▼
格式化后内容
```

#### 3.2 文件结构

```
src/features/formatting/
├── types.ts                          # 类型定义
├── nestedFormattingProvider.ts       # 主 Provider
├── index.ts
└── pipeline/
    ├── index.ts                      # FormattingPipeline
    ├── sqlExtractor.ts               # SQL 提取器
    ├── xmlFormatter.ts               # XML 格式化器
    ├── sqlFormatter.ts               # SQL 格式化器
    └── indentAdjuster.ts             # 缩进调整器
```

#### 3.3 核心接口

```typescript
// types.ts

export interface SqlRegion {
  tagType: string;           // select/insert/update/delete
  tagId: string;
  startOffset: number;
  endOffset: number;
  sqlContent: string;
  xmlIndentLevel: number;
  hasDynamicTags: boolean;
  placeholder: string;
}

export interface FormattingOptions {
  tabSize: number;
  insertSpaces: boolean;
  sqlDialect: string;
  keywordCase: 'upper' | 'lower' | 'preserve';
  maxLineLength?: number;
}

export interface PipelineStep {
  readonly name: string;
  execute(input: string, context: PipelineContext): Promise<string> | string;
}
```

#### 3.4 注册

```typescript
// extension.ts

import { NestedFormattingProvider } from './features/formatting/nestedFormattingProvider';

const formattingProvider = new NestedFormattingProvider();

vscode.languages.registerDocumentFormattingEditProvider(
  { scheme: 'file', pattern: '**/*.xml' },
  formattingProvider
);
```

---

### 模块 4: Java → XML 方法生成

**优先级**: P1  
**依赖**: CodeLensProvider, TemplateEngine

#### 4.1 功能描述

CodeLens 增强：
- XML 存在该方法 → 显示 "$(arrow-right) Jump to XML"
- XML 不存在该方法 → 显示 "$(add) Generate XML Method"

快捷键：`Ctrl+Shift+G` / `Cmd+Shift+G`（快速生成）

#### 4.2 实现

```typescript
// FastCodeLensProvider.ts 增强

export class EnhancedCodeLensProvider implements vscode.CodeLensProvider {
  async provideCodeLenses(document: vscode.TextDocument): Promise<vscode.CodeLens[]> {
    // ... 现有代码
    
    for (const method of methods) {
      const existsInXml = await this.xmlParser.methodExists(xmlPath, method.name);
      
      if (existsInXml) {
        lenses.push(new vscode.CodeLens(range, {
          title: '$(arrow-right) Jump to XML',
          command: 'mybatis-helper.jumpToXml',
          arguments: [{ javaPath, methodName: method.name }]
        }));
      } else {
        lenses.push(new vscode.CodeLens(range, {
          title: '$(add) Generate XML Method',
          command: 'mybatis-helper.generateXmlMethod',
          arguments: [{ javaPath, methodName: method.name }]
        }));
      }
    }
  }
}
```

---

### 模块 5: 快速创建 Mapper XML

**优先级**: P1  
**依赖**: TemplateEngine

#### 5.1 功能

右键菜单：
- 在 Java Mapper 文件上右键 → "Create Mapper XML"
- 自动生成 XML 文件框架

```typescript
export class CreateMapperXmlCommand {
  async execute(javaPath: string) {
    const javaInfo = await this.javaParser.parseFile(javaPath);
    const namespace = javaInfo.className;
    
    const content = this.templateEngine.render('mapperXml', {
      namespace,
      methods: javaInfo.methods
    });
    
    const xmlPath = this.determineXmlPath(javaPath);
    await fs.writeFile(xmlPath, content);
    
    // 注册映射
    this.fileMapper.registerMapping(javaPath, xmlPath);
    
    // 打开文件
    const doc = await vscode.workspace.openTextDocument(xmlPath);
    await vscode.window.showTextDocument(doc);
  }
}
```

---

## 开发顺序建议

```
第一阶段（核心功能）:
1. 统一智能补全 (UnifiedCompletionProvider + 策略)
2. Mapper XML 标签补全 (TagCompletionProvider)
3. 嵌套格式化 (NestedFormattingProvider)

第二阶段（增强功能）:
4. Java → XML 方法生成 (CodeLens 增强)
5. 快速创建 Mapper XML

第三阶段（高级功能）:
6. 重构同步 (Rename Provider)
7. SQL 片段提取
```

---

## 配置项

```json
// package.json 新增配置
{
  "contributes": {
    "configuration": {
      "properties": {
        "mybatis-helper.completion.enableSmartCompletion": {
          "type": "boolean",
          "default": true,
          "description": "Enable smart SQL completion"
        },
        "mybatis-helper.formatting.sql.dialect": {
          "type": "string",
          "default": "mysql",
          "enum": ["mysql", "postgresql", "oracle", "sqlite", "tsql"]
        },
        "mybatis-helper.formatting.sql.keywordCase": {
          "type": "string",
          "default": "upper",
          "enum": ["upper", "lower", "preserve"]
        }
      }
    }
  }
}
```

---

## 测试计划

### 单元测试

```typescript
// __tests__/placeholderStrategy.test.ts

describe('PlaceholderStrategy', () => {
  let strategy: PlaceholderStrategy;
  
  beforeEach(() => {
    strategy = new PlaceholderStrategy();
  });
  
  test('should complete for #{', async () => {
    const context = createMockContext({ 
      linePrefix: 'SELECT * FROM user WHERE id = #{' 
    });
    expect(await strategy.canComplete(context)).toBe(true);
  });
  
  test('should not complete in foreach (delegated)', async () => {
    const context = createMockContext({
      linePrefix: '#{',
      foreachContext: { item: 'item', index: 'index', collection: 'list' }
    });
    expect(await strategy.canComplete(context)).toBe(false);
  });
});
```

### 集成测试

1. 打开 Java Mapper 文件，输入 `#{` 应显示参数列表
2. 在 `<foreach>` 标签内输入 `#{` 应优先显示 item/index
3. 格式化 XML 文件，SQL 应正确缩进
4. CodeLens 应正确显示 "Jump to XML" 或 "Generate XML Method"

---

## 文档维护

**最后更新**: 2026-02-27  
**维护者**: MyBatis Helper Team

如有问题，请参考：
- Phase 1 文档: `AGENTS.md`
- 设计文档: `docs/features/SMART_COMPLETION_DESIGN.md`
- 设计文档: `docs/features/NESTED_FORMATTING_DESIGN.md`
