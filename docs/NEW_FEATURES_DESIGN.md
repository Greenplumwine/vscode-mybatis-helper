# MyBatis Helper 新功能设计文档

## 文档信息

| 项目 | 内容 |
|------|------|
| 版本 | 1.2 |
| 日期 | 2024-02-27 |
| 作者 | AI Assistant |
| 状态 | 草案（已更新） |

## 1. 背景

### 1.1 现有功能
- Java ↔ XML 跳转
- SQL 拦截器
- 企业级扫描器
- CodeLens
- **现有 SQL 补全（问题多，需重新设计）**

### 1.2 现有 SQL 补全问题
- 触发条件太严格（必须输入 `#`/`$`）
- 上下文检测不可靠（正则计算标签开闭）
- 获取方法名逻辑复杂（易出错）
- **结论：需要重新设计，不作为复用基础**

### 1.3 新增功能需求（9个）
1. **Mapper XML 自定义文件类型**（支持非标准目录）
2. **嵌套语法高亮**（XML + SQL）
3. Mapper XML 标签补全（DTD 优先）
4. **统一智能补全**（占位符 + foreach + 类型）⭐ 接口抽象
5. 快速创建 Mapper XML
6. Java → XML 方法生成（CodeLens 互斥 + 快捷键）
7. **嵌套格式化**（不依赖外部插件）
8. 重构同步
9. SQL 片段提取

---

## 2. 设计原则

### 2.1 复用现有功能
- **复用**：`MyBatisXmlParser`、`FileMapper`
- **不复用**：现有 `SQLCompletionProvider`

### 2.2 借力 VS Code 生态
- **sql-formatter**：SQL 格式化
- **xml-formatter**：XML 格式化

### 2.3 灵活适配
- 文件类型识别支持 VS Code 原生 files.associations 配置
- 功能可配置启用/禁用

---

## 3. 基础服务层

### 3.1 JavaMethodParser

```typescript
export interface JavaMethod {
  name: string;
  returnType: string;
  isCollection: boolean;
  parameters: JavaParameter[];
  annotations: string[];
  lineRange: { start: number; end: number };
}

export interface JavaParameter {
  name: string;
  type: string;
  annotations: string[];
  paramName?: string;
}

export class JavaMethodParser {
  parseFile(filePath: string): JavaMethod[];
  parseMethod(filePath: string, methodName: string): JavaMethod | null;
  getObjectProperties(className: string): Promise<string[]>;
  scanProjectClasses(): Promise<ClassInfo[]>;
}
```

### 3.2 增强 MyBatisXmlParser

```typescript
class MyBatisXmlParser {
  parseXmlMapper(filePath: string, content: string): XmlMapperInfo;
  findTagPosition(content: string, tagId: string): TagPosition | null;
  insertTag(content: string, tag: string, position: Position): string;
  replaceTag(content: string, oldTagId: string, newTag: string): string;
  findMethodAtLine(xmlInfo: XmlMapperInfo, line: number): XmlMapperMethod | null;
  findForeachContext(content: string, line: number): ForeachContext | null;
  extractSqlTags(content: string): SqlTagRegion[];  // 用于格式化
}

export interface SqlTagRegion {
  tagName: string;      // select/insert/update/delete
  startOffset: number;
  endOffset: number;
  sqlContent: string;
  xmlIndentLevel: number;
  placeholder?: string; // 用于格式化时替换
}
```

### 3.3 TemplateEngine

```typescript
export class TemplateEngine {
  render(template: string, data: Record<string, any>): string;
  getMethodTemplate(tagType: 'select' | 'insert' | 'update' | 'delete'): string;
  getMapperXmlTemplate(): string;
  getForeachTemplate(): string;
}
```

---

## 4. 功能实现设计

### 4.1 Mapper XML 自定义文件类型 ⭐ 支持非标准目录

**问题**：`filenamePatterns` 写死导致非标准目录无法识别

**解决方案 - 三层检测**：

```json
// package.json - 默认 patterns
{
  "contributes": {
    "languages": [{
      "id": "mybatis-mapper-xml",
      "aliases": ["MyBatis Mapper XML"],
      "extensions": [".xml"],
      "filenamePatterns": [
        "**/mapper/**/*.xml",
        "**/mappers/**/*.xml",
        "**/*Mapper.xml"
      ],
      "configuration": "./language-configuration.json"
    }]
  }
}
```

**用户自定义方式**：

用户可通过 VS Code 原生的 `files.associations` 配置：

```json
// settings.json
{
  "files.associations": {
    "**/dao/**/*.xml": "mybatis-mapper-xml",
    "**/repository/**/*.xml": "mybatis-mapper-xml"
  }
}
```

**动态检测兜底**（自动识别内容）：

```typescript
export class MyBatisLanguageDetector {
  private readonly MYBATIS_SIGNATURE = /<mapper\s+namespace=["'];
  
  async detectOnOpen(document: vscode.TextDocument) {
    // 如果已经是 mybatis-mapper-xml，跳过
    if (document.languageId === 'mybatis-mapper-xml') return;
    
    // 如果是 xml，检测内容是否包含 <mapper namespace
    if (document.languageId === 'xml') {
      const content = document.getText();
      if (this.MYBATIS_SIGNATURE.test(content)) {
        await vscode.languages.setTextDocumentLanguage(
          document, 
          'mybatis-mapper-xml'
        );
      }
    }
  }
}
```

---

### 4.2 嵌套语法高亮

**技术方案**：TextMate 语法注入

```json
// syntaxes/mybatis-mapper-xml.tmLanguage.json
{
  "scopeName": "text.xml.mybatis",
  "patterns": [
    { "include": "text.xml" },
    { "include": "#mybatis-sql-tags" }
  ],
  "repository": {
    "mybatis-sql-tags": {
      "patterns": [{
        "name": "meta.tag.mybatis.sql",
        "begin": "(<)(select|insert|update|delete)(?=[^>]*?>)"
        "end": "(</)(select|insert|update|delete)(>)",
        "contentName": "source.sql.embedded.mybatis",
        "patterns": [
          { "include": "source.sql" },
          { "include": "#mybatis-dynamic-tags" }
        ]
      }]
    },
    "mybatis-dynamic-tags": {
      "patterns": [{
        "name": "meta.tag.mybatis.dynamic",
        "begin": "(<)(if|choose|when|otherwise|where|set|trim|foreach|bind|include)"
        "end": "(</)\\2(>|/>)",
        "patterns": [
          { "include": "source.sql" },
          { "include": "#mybatis-dynamic-tags" }
        ]
      }]
    }
  }
}
```

**性能优化**：
1. 惰性匹配（只在需要时启用 SQL 高亮）
2. 限制递归深度（max 5 层嵌套）
3. 大文件（>5000行）降级为简单高亮

---

### 4.3 Mapper XML 标签补全 ⭐ DTD 优先 + 智能触发

**策略：DTD 优先，离线兜底**

```
┌─────────────────────────────────────────────────────────────┐
│  获取标签层级关系                                             │
├─────────────────────────────────────────────────────────────┤
│  1. 从 XML 文件提取 DOCTYPE 引用的 DTD 路径                  │
│     └── 尝试加载 DTD（网络 → 本地缓存 → 内置）                │
│         └── 成功 → 解析 DTD 获取最新层级结构                  │
│         └── 失败 → 进入第 2 步                               │
│  2. 使用插件内置的离线层级定义（枚举兜底）                     │
│     └── 确保离线环境可用                                     │
└─────────────────────────────────────────────────────────────┘
```

**DTD 解析器实现**：

```typescript
// src/features/completion/tagHierarchyResolver.ts

export interface TagHierarchy {
  parentTag: string;
  allowedChildren: string[];
  allowedAttributes: string[];
}

export class TagHierarchyResolver {
  // 内置离线定义（兜底枚举）
  private static readonly FALLBACK_HIERARCHY: Record<string, TagHierarchy> = {
    'mapper': {
      parentTag: 'root',
      allowedChildren: ['select', 'insert', 'update', 'delete', 'resultMap', 'sql', 'cache', 'cache-ref'],
      allowedAttributes: ['namespace']
    },
    'select': {
      parentTag: 'mapper',
      allowedChildren: ['if', 'where', 'foreach', 'choose', 'when', 'otherwise', 'bind', 'include', 'trim'],
      allowedAttributes: ['id', 'resultType', 'resultMap', 'parameterType', 'useCache', 'flushCache']
    },
    'insert': {
      parentTag: 'mapper',
      allowedChildren: ['selectKey', 'if', 'trim', 'foreach', 'choose', 'bind'],
      allowedAttributes: ['id', 'parameterType', 'useGeneratedKeys', 'keyProperty']
    },
    'update': {
      parentTag: 'mapper',
      allowedChildren: ['if', 'set', 'trim', 'foreach', 'choose', 'bind'],
      allowedAttributes: ['id', 'parameterType']
    },
    'delete': {
      parentTag: 'mapper',
      allowedChildren: ['if', 'where', 'foreach', 'choose', 'bind'],
      allowedAttributes: ['id', 'parameterType']
    },
    'if': {
      parentTag: '*',
      allowedChildren: ['if', 'choose', 'when', 'otherwise', 'bind', 'include', 'trim', 'where', 'set', 'foreach'],
      allowedAttributes: ['test']
    },
    'foreach': {
      parentTag: '*',
      allowedChildren: ['if', 'choose', 'bind', 'include'],
      allowedAttributes: ['collection', 'item', 'index', 'open', 'separator', 'close']
    },
    'choose': {
      parentTag: '*',
      allowedChildren: ['when', 'otherwise'],
      allowedAttributes: []
    },
    'when': {
      parentTag: 'choose',
      allowedChildren: ['if', 'choose', 'bind', 'include'],
      allowedAttributes: ['test']
    },
    'otherwise': {
      parentTag: 'choose',
      allowedChildren: ['if', 'choose', 'bind', 'include'],
      allowedAttributes: []
    },
    'where': {
      parentTag: '*',
      allowedChildren: ['if', 'foreach', 'choose', 'bind', 'include'],
      allowedAttributes: []
    },
    'set': {
      parentTag: '*',
      allowedChildren: ['if', 'foreach', 'choose', 'bind', 'include'],
      allowedAttributes: []
    },
    'trim': {
      parentTag: '*',
      allowedChildren: ['if', 'foreach', 'choose', 'bind', 'include'],
      allowedAttributes: ['prefix', 'suffix', 'prefixOverrides', 'suffixOverrides']
    },
    'bind': {
      parentTag: '*',
      allowedChildren: [],
      allowedAttributes: ['name', 'value']
    },
    'include': {
      parentTag: '*',
      allowedChildren: ['property'],
      allowedAttributes: ['refid']
    },
    'sql': {
      parentTag: 'mapper',
      allowedChildren: ['if', 'where', 'foreach', 'choose', 'bind', 'include'],
      allowedAttributes: ['id']
    },
    'resultMap': {
      parentTag: 'mapper',
      allowedChildren: ['constructor', 'id', 'result', 'association', 'collection', 'discriminator'],
      allowedAttributes: ['id', 'type', 'autoMapping', 'extends']
    }
  };
  
  // DTD 缓存
  private dtdCache = new Map<string, DtdParseResult>();
  private extensionContext: vscode.ExtensionContext;
  
  constructor(context: vscode.ExtensionContext) {
    this.extensionContext = context;
  }
  
  async resolve(document: vscode.TextDocument): Promise<Record<string, TagHierarchy>> {
    // 1. 尝试从 DTD 解析
    const dtdResult = await this.tryResolveFromDtd(document);
    if (dtdResult) {
      return dtdResult;
    }
    
    // 2. 返回离线兜底
    return TagHierarchyResolver.FALLBACK_HIERARCHY;
  }
  
  private async tryResolveFromDtd(
    document: vscode.TextDocument
  ): Promise<Record<string, TagHierarchy> | null> {
    // 1. 提取 DTD 路径
    const dtdPath = this.extractDtdPath(document.getText());
    if (!dtdPath) return null;
    
    // 2. 检查缓存
    if (this.dtdCache.has(dtdPath)) {
      return this.dtdCache.get(dtdPath)!.hierarchy;
    }
    
    // 3. 尝试加载 DTD
    try {
      const dtdContent = await this.loadDtd(dtdPath);
      const parsed = this.parseDtd(dtdContent);
      
      // 4. 缓存结果
      this.dtdCache.set(dtdPath, parsed);
      
      return parsed.hierarchy;
    } catch (error) {
      logger.warn(`Failed to load DTD from ${dtdPath}, using fallback`);
      return null;
    }
  }
  
  private extractDtdPath(xmlContent: string): string | null {
    // 提取 DOCTYPE 中的 DTD 路径
    // <!DOCTYPE mapper PUBLIC "-//mybatis.org//DTD Mapper 3.0//EN" 
    //   "http://mybatis.org/dtd/mybatis-3-mapper.dtd">
    const match = xmlContent.match(/<!DOCTYPE\s+\w+\s+PUBLIC\s+["'][^"']+["']\s+["']([^"']+)["']/);
    return match ? match[1] : null;
  }
  
  private async loadDtd(dtdPath: string): Promise<string> {
    // 1. 如果是 http/https，尝试下载并缓存到本地
    if (dtdPath.startsWith('http')) {
      return await this.loadDtdFromUrl(dtdPath);
    }
    
    // 2. 如果是本地路径，直接读取
    if (path.isAbsolute(dtdPath)) {
      return await fs.readFile(dtdPath, 'utf-8');
    }
    
    // 3. 相对路径，基于工作区解析
    const workspacePath = path.join(
      vscode.workspace.workspaceFolders![0].uri.fsPath, 
      dtdPath
    );
    return await fs.readFile(workspacePath, 'utf-8');
  }
  
  private async loadDtdFromUrl(url: string): Promise<string> {
    const cachePath = this.getDtdCachePath(url);
    
    // 1. 检查本地缓存
    if (await this.fileExists(cachePath)) {
      const stat = await fs.stat(cachePath);
      const age = Date.now() - stat.mtime.getTime();
      
      // 缓存 7 天内有效
      if (age < 7 * 24 * 60 * 60 * 1000) {
        return await fs.readFile(cachePath, 'utf-8');
      }
    }
    
    // 2. 下载 DTD
    try {
      const response = await fetch(url, { timeout: 5000 });
      if (!response.ok) throw new Error(`HTTP ${response.status}`);
      
      const content = await response.text();
      
      // 3. 保存到缓存
      await fs.mkdir(path.dirname(cachePath), { recursive: true });
      await fs.writeFile(cachePath, content);
      
      return content;
    } catch (error) {
      // 下载失败，尝试使用过期缓存（如果有）
      if (await this.fileExists(cachePath)) {
        logger.warn(`Using expired DTD cache for ${url}`);
        return await fs.readFile(cachePath, 'utf-8');
      }
      throw error;
    }
  }
  
  private parseDtd(dtdContent: string): DtdParseResult {
    const hierarchy: Record<string, TagHierarchy> = {};
    
    // 解析 <!ELEMENT ... >
    const elementRegex = /<!ELEMENT\s+(\w+)\s+\(([^)]+)\)>/g;
    let match;
    
    while ((match = elementRegex.exec(dtdContent)) !== null) {
      const [, tagName, childrenDef] = match;
      hierarchy[tagName] = {
        parentTag: this.inferParent(tagName, dtdContent),
        allowedChildren: this.parseChildrenDef(childrenDef),
        allowedAttributes: this.extractAttributes(dtdContent, tagName)
      };
    }
    
    return { hierarchy, timestamp: Date.now() };
  }
  
  private parseChildrenDef(childrenDef: string): string[] {
    // 解析 (cache-ref | cache | resultMap* | ... )
    // 去除修饰符 * ? + 和括号
    return childrenDef
      .split('|')
      .map(s => s.trim().replace(/[*?+]/g, '').replace(/[()]/g, ''))
      .filter(s => s && s !== '#PCDATA');
  }
  
  private extractAttributes(dtdContent: string, tagName: string): string[] {
    // 解析 <!ATTLIST tagName attr1 ... attr2 ... >
    const attrRegex = new RegExp(
      `<!ATTLIST\\s+${tagName}\\s+((?:\\w+\\s+[^>]+\\s*)*)>`,
      'i'
    );
    const match = dtdContent.match(attrRegex);
    
    if (!match) return [];
    
    // 提取属性名
    const attrDef = match[1];
    const attrNames: string[] = [];
    const attrRegex2 = /(\w+)\s+/g;
    let m;
    
    while ((m = attrRegex2.exec(attrDef)) !== null) {
      attrNames.push(m[1]);
    }
    
    return attrNames;
  }
  
  private inferParent(tagName: string, dtdContent: string): string {
    // 从 DTD 推断父标签（哪个元素包含此标签）
    const regex = new RegExp(`<!ELEMENT\\s+(\\w+)\\s+\\([^)]*\\b${tagName}\\b`, 'i');
    const match = dtdContent.match(regex);
    return match ? match[1] : '*';
  }
  
  private getDtdCachePath(url: string): string {
    const hash = crypto.createHash('md5').update(url).digest('hex');
    return path.join(
      this.extensionContext.globalStoragePath, 
      'dtd-cache', 
      `${hash}.dtd`
    );
  }
  
  private async fileExists(filePath: string): Promise<boolean> {
    try {
      await fs.access(filePath);
      return true;
    } catch {
      return false;
    }
  }
}

interface DtdParseResult {
  hierarchy: Record<string, TagHierarchy>;
  timestamp: number;
}
```

**触发策略**：

| 场景 | 触发字符 | 补全内容 |
|------|---------|---------|
| 标签开始 | `<` | 所有可用标签（按上下文过滤）|
| 属性名 | ` `（空格）| 当前标签的属性 |
| 属性值 | `"` | 属性可选值 |
| 智能子标签 | 在 `<select>` 内输入 `<` | 优先 `<if>`, `<where>`, `<foreach>` |
| 代码片段 | `fore` | foreach 模板 |
| 强制触发 | `Ctrl+Space` | 所有补全 |

```typescript
export class TagCompletionProvider implements CompletionItemProvider {
  // 注册时指定多个触发字符
  static readonly triggerCharacters = ['<', ' ', '"'];
  
  private hierarchyResolver = new TagHierarchyResolver();
  
  async provideCompletionItems(document, position, context) {
    // 获取层级关系（DTD 优先，离线兜底）
    const hierarchy = await this.hierarchyResolver.resolve(document);
    
    const triggerChar = context.triggerCharacter;
    const xmlContext = this.parseXmlContext(document, position);
    
    switch (triggerChar) {
      case '<':
        return this.provideTagNames(hierarchy, xmlContext.parentTag);
      case ' ':
        if (xmlContext.isInTag) {
          return this.provideAttributes(hierarchy, xmlContext.currentTag);
        }
        return [];
      case '"':
        if (xmlContext.isInAttributeValue) {
          return this.provideAttributeValues(
            hierarchy,
            xmlContext.currentTag, 
            xmlContext.currentAttribute
          );
        }
        return [];
      default:
        return [];
    }
  }
  
  private provideTagNames(
    hierarchy: Record<string, TagHierarchy>, 
    parentTag: string | null
  ): CompletionItem[] {
    const tagHierarchy = parentTag 
      ? hierarchy[parentTag]
      : hierarchy['mapper'];
    
    if (!tagHierarchy) return [];
    
    return tagHierarchy.allowedChildren.map(tag => ({
      label: tag,
      kind: CompletionItemKind.Keyword,
      insertText: new SnippetString(this.getTagSnippet(tag))
    }));
  }
}
```

---

### 4.4 统一智能补全 ⭐ 接口抽象 + 策略模式

**设计目标**：通过接口抽象，支持后续灵活扩展和调整

```typescript
// src/features/completion/types.ts

export interface CompletionStrategy {
  readonly triggerCharacters: string[];
  readonly priority: number; // 优先级，高优先级的先匹配
  
  // 是否支持当前上下文
  canComplete(context: CompletionContext): boolean | Promise<boolean>;
  
  // 提供补全项
  provideCompletionItems(context: CompletionContext): Promise<vscode.CompletionItem[]>;
}

export interface CompletionContext {
  document: vscode.TextDocument;
  position: vscode.Position;
  triggerCharacter: string | undefined;
  linePrefix: string;
  lineSuffix: string;
  xmlInfo?: XmlMapperInfo;
  javaMethod?: JavaMethod;
  foreachContext?: ForeachContext;
}

// 统一 Provider
export class UnifiedCompletionProvider implements vscode.CompletionItemProvider {
  private strategies: CompletionStrategy[] = [];
  
  constructor(
    private javaParser: JavaMethodParser,
    private xmlParser: MyBatisXmlParser
  ) {
    // 注册各种策略（按优先级排序）
    this.registerStrategy(new TypeCompletionStrategy(javaParser));      // 优先级 100
    this.registerStrategy(new ForeachVariableStrategy(xmlParser));      // 优先级 90
    this.registerStrategy(new PropertyCompletionStrategy(javaParser));  // 优先级 80
    this.registerStrategy(new PlaceholderCompletionStrategy(javaParser)); // 优先级 70
  }
  
  registerStrategy(strategy: CompletionStrategy) {
    this.strategies.push(strategy);
    // 按优先级排序
    this.strategies.sort((a, b) => b.priority - a.priority);
  }
  
  async provideCompletionItems(document, position, token, context) {
    const ctx = await this.buildContext(document, position, context);
    
    for (const strategy of this.strategies) {
      if (await strategy.canComplete(ctx)) {
        return strategy.provideCompletionItems(ctx);
      }
    }
    
    return [];
  }
  
  private async buildContext(
    document: vscode.TextDocument,
    position: vscode.Position,
    triggerContext: vscode.CompletionContext
  ): Promise<CompletionContext> {
    const lineText = document.lineAt(position.line).text;
    const beforeCursor = lineText.substring(0, position.character);
    const afterCursor = lineText.substring(position.character);
    
    const ctx: CompletionContext = {
      document,
      position,
      triggerCharacter: triggerContext.triggerCharacter,
      linePrefix: beforeCursor,
      lineSuffix: afterCursor
    };
    
    // 预解析 XML（如果适用）
    if (document.languageId === 'mybatis-mapper-xml') {
      ctx.xmlInfo = await this.xmlParser.parseXmlMapper(
        document.fileName,
        document.getText()
      );
      
      // 找到当前方法
      const method = this.xmlParser.findMethodAtLine(ctx.xmlInfo, position.line);
      if (method) {
        const javaPath = this.findJavaFile(document.fileName, ctx.xmlInfo.namespace);
        if (javaPath) {
          ctx.javaMethod = await this.javaParser.parseMethod(javaPath, method.id);
        }
      }
      
      // 检测 foreach 上下文
      ctx.foreachContext = this.xmlParser.findForeachContext(
        document.getText(),
        position.line
      );
    }
    
    return ctx;
  }
}

// ==================== 具体策略实现 ====================

// 1. 类型补全（resultType, parameterType, typeHandler）
export class TypeCompletionStrategy implements CompletionStrategy {
  readonly triggerCharacters = ['"', "'"];
  readonly priority = 100;
  
  constructor(private javaParser: JavaMethodParser) {}
  
  async canComplete(ctx: CompletionContext): Promise<boolean> {
    return /\s(resultType|parameterType|typeHandler|javaType)=["'][^"']*$/.test(ctx.linePrefix);
  }
  
  async provideCompletionItems(ctx: CompletionContext): Promise<vscode.CompletionItem[]> {
    const match = ctx.linePrefix.match(/\s(resultType|parameterType|typeHandler|javaType)=["']([^"']*)$/);
    const attrName = match![1];
    const partial = match![2].toLowerCase();
    
    if (attrName === 'typeHandler') {
      return this.getTypeHandlerCompletions(partial);
    }
    
    // resultType/parameterType/javaType
    const classes = await this.javaParser.scanProjectClasses();
    return classes
      .filter(cls => cls.simpleName.toLowerCase().includes(partial))
      .map(cls => ({
        label: cls.simpleName,
        detail: cls.fullyQualifiedName,
        insertText: cls.fullyQualifiedName,
        kind: vscode.CompletionItemKind.Class
      }));
  }
  
  private getTypeHandlerCompletions(partial: string): vscode.CompletionItem[] {
    const handlers = [
      { name: 'String', fqcn: 'org.apache.ibatis.type.StringTypeHandler' },
      { name: 'Integer', fqcn: 'org.apache.ibatis.type.IntegerTypeHandler' },
      { name: 'Long', fqcn: 'org.apache.ibatis.type.LongTypeHandler' },
      { name: 'Date', fqcn: 'org.apache.ibatis.type.DateTypeHandler' },
      { name: 'LocalDateTime', fqcn: 'org.apache.ibatis.type.LocalDateTimeTypeHandler' }
    ];
    
    return handlers
      .filter(h => h.name.toLowerCase().includes(partial))
      .map(h => ({
        label: h.name,
        detail: h.fqcn,
        insertText: h.fqcn,
        kind: vscode.CompletionItemKind.Class
      }));
  }
}

// 2. foreach 变量补全
export class ForeachVariableStrategy implements CompletionStrategy {
  readonly triggerCharacters = ['#', '$', '{'];
  readonly priority = 90;
  
  constructor(private xmlParser: MyBatisXmlParser) {}
  
  async canComplete(ctx: CompletionContext): Promise<boolean> {
    // 在 foreach 内且输入 #{ 或 ${
    return ctx.foreachContext !== undefined && 
           /#\{$/.test(ctx.linePrefix);
  }
  
  async provideCompletionItems(ctx: CompletionContext): Promise<vscode.CompletionItem[]> {
    const completions: vscode.CompletionItem[] = [];
    const foreach = ctx.foreachContext!;
    
    // 优先提示 item
    completions.push({
      label: foreach.item,
      kind: vscode.CompletionItemKind.Variable,
      detail: `foreach item (${foreach.collection} → ${foreach.item})`,
      sortText: '0',
      insertText: `{${foreach.item}}`
    });
    
    // 提示 index
    if (foreach.index) {
      completions.push({
        label: foreach.index,
        kind: vscode.CompletionItemKind.Variable,
        detail: 'foreach index',
        sortText: '1',
        insertText: `{${foreach.index}}`
      });
    }
    
    return completions;
  }
}

// 3. 属性补全（#{user.）
export class PropertyCompletionStrategy implements CompletionStrategy {
  readonly triggerCharacters = ['.'];
  readonly priority = 80;
  
  constructor(private javaParser: JavaMethodParser) {}
  
  async canComplete(ctx: CompletionContext): Promise<boolean> {
    return /#\{(\w+)\.$/.test(ctx.linePrefix);
  }
  
  async provideCompletionItems(ctx: CompletionContext): Promise<vscode.CompletionItem[]> {
    const match = ctx.linePrefix.match(/#\{(\w+)\.$/);
    const objectName = match![1];
    
    if (!ctx.javaMethod) return [];
    
    const param = ctx.javaMethod.parameters.find(p => p.name === objectName);
    if (!param) return [];
    
    const properties = await this.javaParser.getObjectProperties(param.type);
    return properties.map(prop => ({
      label: prop,
      kind: vscode.CompletionItemKind.Field,
      detail: `Property of ${param.type}`,
      insertText: prop
    }));
  }
}

// 4. 占位符补全（#{, ${）
export class PlaceholderCompletionStrategy implements CompletionStrategy {
  readonly triggerCharacters = ['#', '$', '{'];
  readonly priority = 70;
  
  constructor(private javaParser: JavaMethodParser) {}
  
  async canComplete(ctx: CompletionContext): Promise<boolean> {
    return /#\{$/.test(ctx.linePrefix) || /\$\{$/.test(ctx.linePrefix);
  }
  
  async provideCompletionItems(ctx: CompletionContext): Promise<vscode.CompletionItem[]> {
    if (!ctx.javaMethod) return [];
    
    const marker = ctx.linePrefix.endsWith('#{') ? '#' : '$';
    
    return ctx.javaMethod.parameters.map(param => ({
      label: `${marker}{${param.name}}`,
      kind: vscode.CompletionItemKind.Variable,
      detail: `${param.type} ${param.name}`,
      documentation: param.paramName 
        ? new vscode.MarkdownString(`@Param("${param.paramName}")`)
        : undefined,
      insertText: `{${param.name}}`,
      sortText: param.paramName ? '0' : '1' // @Param 标注的参数优先
    }));
  }
}
```

---

### 4.5 快速创建 Mapper XML

```typescript
export class CreateMapperXmlCommand {
  async execute(javaPath: string) {
    const javaMethods = await this.javaParser.parseFile(javaPath);
    const namespace = this.extractNamespace(javaPath);
    
    const content = this.templateEngine.render(
      this.templateEngine.getMapperXmlTemplate(),
      { namespace, methods: javaMethods }
    );
    
    const xmlPath = this.determineXmlPath(javaPath);
    await fs.writeFile(xmlPath, content);
    this.fileMapper.registerMapping(javaPath, xmlPath);
    
    const doc = await vscode.workspace.openTextDocument(xmlPath);
    await vscode.window.showTextDocument(doc);
  }
}
```

---

### 4.6 Java → XML 方法生成 ⭐ CodeLens 互斥

**需求**：
- XML 存在该方法 → 显示"Jump to XML"
- XML 不存在该方法 → 显示"Generate XML Method"
- 支持快捷键快速生成

```typescript
// FastCodeLensProvider 增强
export class EnhancedCodeLensProvider implements CodeLensProvider {
  async provideCodeLenses(document: TextDocument): Promise<CodeLens[]> {
    if (!this.isMapperInterface(document)) return [];
    
    const javaPath = document.fileName;
    const methods = await this.javaParser.parseFile(javaPath);
    const xmlPath = this.fileMapper.getXmlPathForJava(javaPath);
    
    const lenses: CodeLens[] = [];
    
    for (const method of methods) {
      const range = new Range(
        method.lineRange.start, 0, 
        method.lineRange.start, 0
      );
      
      // 检查 XML 中是否已存在该方法
      const existsInXml = xmlPath && await this.xmlParser.methodExists(xmlPath, method.name);
      
      if (existsInXml) {
        lenses.push(new CodeLens(range, {
          title: '$(arrow-right) Jump to XML',
          command: 'mybatis-helper.jumpToXml',
          arguments: [{ javaPath, methodName: method.name }]
        }));
      } else {
        lenses.push(new CodeLens(range, {
          title: '$(add) Generate XML Method',
          command: 'mybatis-helper.generateXmlMethod',
          arguments: [{ javaPath, methodName: method.name }],
          tooltip: 'Generate this method in Mapper XML'
        }));
      }
    }
    
    return lenses;
  }
}
```

**快捷键配置**：

```json
// package.json
{
  "contributes": {
    "keybindings": [
      {
        "command": "mybatis-helper.generateXmlMethod",
        "key": "ctrl+shift+g",
        "mac": "cmd+shift+g",
        "when": "editorLangId == java && editorTextFocus"
      },
      {
        "command": "mybatis-helper.generateXmlMethod",
        "key": "ctrl+shift+g",
        "mac": "cmd+shift+g",
        "when": "editorHasSelection && editorLangId == java"
      }
    ]
  }
}
```

```typescript
// generateXmlMethodCommand 处理快捷键
export class GenerateXmlMethodCommand {
  async execute(args?: { javaPath?: string; methodName?: string }) {
    const editor = vscode.window.activeTextEditor;
    if (!editor) return;
    
    let javaPath = args?.javaPath;
    let methodName = args?.methodName;
    
    // 如果是快捷键触发，从当前选择/光标推断
    if (!javaPath) {
      javaPath = editor.document.fileName;
      
      // 如果有选中，使用选中的方法名
      if (editor.selection && !editor.selection.isEmpty) {
        methodName = editor.document.getText(editor.selection);
      } else {
        // 否则从光标位置推断方法
        const line = editor.selection.active.line;
        methodName = await this.inferMethodNameAtLine(javaPath, line);
      }
    }
    
    // 执行生成...
  }
}
```

---

### 4.7 嵌套格式化 ⭐ 不依赖 Red Hat XML

**设计**：不依赖任何外部插件，直接使用 npm 包

```typescript
// dependencies: xml-formatter, sql-formatter
import { format as formatXml } from 'xml-formatter';
import { format as formatSql } from 'sql-formatter';

export class NestedFormattingProvider implements DocumentFormattingEditProvider {
  constructor(private xmlParser: MyBatisXmlParser) {}
  
  async provideDocumentFormattingEdits(
    document: TextDocument, 
    options: FormattingOptions
  ): Promise<TextEdit[]> {
    const originalContent = document.getText();
    
    // Phase 1: 识别并保护 SQL 区域
    const { maskedContent, sqlRegions } = this.maskSqlRegions(originalContent);
    
    // Phase 2: 用 xml-formatter 格式化 XML 结构
    const formattedXml = formatXml(maskedContent, {
      indentation: ' '.repeat(options.tabSize),
      collapseContent: false, // 保留 SQL 占位符的换行
      lineSeparator: '\n'
    });
    
    // Phase 3: 恢复并格式化 SQL
    let result = formattedXml;
    for (const region of sqlRegions.reverse()) {
      // 获取配置的 SQL 方言
      const sqlDialect = this.getSqlDialect();
      
      const formattedSql = formatSql(region.sqlContent, {
        language: sqlDialect,
        keywordCase: 'upper',
        indent: ' '.repeat(options.tabSize),
        linesBetweenQueries: 1
      });
      
      // 调整 SQL 缩进以匹配 XML 层级
      const indentedSql = this.adjustIndent(
        formattedSql, 
        region.xmlIndentLevel,
        options.tabSize
      );
      
      result = result.replace(region.placeholder!, indentedSql);
    }
    
    return [new TextEdit(this.fullRange(document), result)];
  }
  
  private maskSqlRegions(content: string): { 
    maskedContent: string; 
    sqlRegions: SqlTagRegion[] 
  } {
    const regions = this.xmlParser.extractSqlTags(content);
    let maskedContent = content;
    const processedRegions: SqlTagRegion[] = [];
    
    // 从后往前处理，避免偏移
    for (let i = regions.length - 1; i >= 0; i--) {
      const region = regions[i];
      const placeholder = `\n___MYBATIS_SQL_${i}___\n`;
      
      maskedContent = 
        maskedContent.substring(0, region.startOffset) +
        placeholder +
        maskedContent.substring(region.endOffset);
      
      processedRegions.unshift({
        ...region,
        placeholder
      });
    }
    
    return { maskedContent, sqlRegions: processedRegions };
  }
  
  private getSqlDialect(): string {
    // 从配置读取，默认 mysql
    const config = vscode.workspace.getConfiguration('mybatis-helper.formatting');
    return config.get<string>('sql.dialect', 'mysql');
  }
  
  private adjustIndent(
    sql: string, 
    xmlIndentLevel: number, 
    tabSize: number
  ): string {
    const baseIndent = ' '.repeat((xmlIndentLevel + 1) * tabSize);
    const lines = sql.split('\n');
    
    return lines
      .map((line, index) => {
        if (index === 0) return line;
        if (line.trim() === '') return '';
        return baseIndent + line.trimStart();
      })
      .join('\n');
  }
}
```

**格式化前**：
```xml
<select id="findUser">select id,name from user where status=#{status}<if test="name!=null">and name like concat('%',#{name},'%')</if></select>
```

**格式化后**：
```xml
<select id="findUser">
  SELECT
    id,
    name
  FROM user
  WHERE status = #{status}
  <if test="name != null">
    AND name LIKE CONCAT('%', #{name}, '%')
  </if>
</select>
```

---

### 4.8 重构同步

```typescript
export class MapperRenameProvider implements RenameProvider {
  async provideRenameEdits(document, position, newName) {
    const oldName = this.getMethodNameAtPosition(document, position);
    const xmlPath = this.fileMapper.getXmlPathForJava(document.fileName);
    
    const xmlContent = await fs.readFile(xmlPath, 'utf-8');
    const tagPosition = this.xmlParser.findTagPosition(xmlContent, oldName);
    
    const edit = new WorkspaceEdit();
    edit.replace(document.uri, javaRange, newName);
    edit.replace(Uri.file(xmlPath), xmlRange, `id="${newName}"`);
    
    return edit;
  }
}
```

---

### 4.9 SQL 片段提取

```typescript
export class ExtractSqlFragmentCommand {
  async execute(xmlPath: string, range: Range, includeId: string) {
    const content = await fs.readFile(xmlPath, 'utf-8');
    const selectedSql = this.getTextInRange(content, range);
    
    const sqlFragment = `<sql id="${includeId}">\n  ${selectedSql}\n</sql>`;
    let newContent = this.xmlParser.insertTag(content, sqlFragment, { after: 'namespace' });
    
    newContent = this.replaceRange(
      newContent, 
      range, 
      `<include refid="${includeId}"/>`
    );
    
    await fs.writeFile(xmlPath, newContent);
  }
}
```

---

## 5. 目录结构

```
src/
├── features/
│   ├── mapping/
│   │   ├── xmlParser.ts              # 增强（添加 extractSqlTags）
│   │   ├── filemapper.ts
│   │   └── javaMethodParser.ts
│   │
│   ├── completion/
│   │   ├── types.ts                           # ⭐ CompletionStrategy 接口
│   │   ├── tagCompletionProvider.ts           # XML 标签补全
│   │   ├── tagHierarchyResolver.ts            # ⭐ DTD 解析器
│   │   └── unifiedCompletionProvider.ts       # ⭐ 统一智能补全（策略模式）
│   │       ├── placeholderStrategy.ts
│   │       ├── foreachVariableStrategy.ts
│   │       ├── propertyStrategy.ts
│   │       └── typeStrategy.ts
│   │
│   ├── formatting/
│   │   └── nestedFormattingProvider.ts        # 嵌套格式化
│   │
│   ├── highlighting/
│   │   └── languageDetector.ts                # ⭐ 语言类型检测
│   │
│   ├── refactoring/
│   │   └── mapperRenameProvider.ts
│   │
│   ├── generation/
│   │   ├── templateEngine.ts
│   │   └── templates/
│   │       ├── method-select.sql
│   │       ├── method-insert.sql
│   │       ├── method-update.sql
│   │       ├── method-delete.sql
│   │       └── mapper.xml
│   │
│   └── commands/
│       ├── createMapperXmlCommand.ts
│       ├── generateXmlMethodCommand.ts
│       └── extractSqlFragmentCommand.ts
│
├── syntaxes/
│   └── mybatis-mapper-xml.tmLanguage.json
│
├── language-configuration.json
├── extension.ts
└── package.json
```

---

## 6. 开发顺序

### Phase 1: 基础服务 + 语言类型（2周）
1. 新建 `JavaMethodParser`
2. 增强 `MyBatisXmlParser`（位置信息、extractSqlTags、foreach 上下文）
3. 新建 `TemplateEngine`
4. **新建**：`MyBatisLanguageDetector`（动态内容检测兜底）
5. **新建**：嵌套语法高亮
6. **测试**：确保现有功能不被破坏

### Phase 2: 补全功能（2周）
7. **新建**：`TagHierarchyResolver`（DTD 优先 + 离线兜底）
8. **新建**：`TagCompletionProvider`（智能触发）
9. **新建**：`CompletionStrategy` 接口 + `UnifiedCompletionProvider`（⭐ 策略模式）

### Phase 3: 生成与格式化（2周）
10. 快速创建 Mapper XML
11. Java → XML 方法生成（CodeLens 互斥 + 快捷键）
12. 嵌套格式化

### Phase 4: 重构（1周）
13. 重构同步
14. SQL 片段提取

**总计：约 7-8 周**

---

## 7. 配置项

```json
// settings.json
{
  "mybatis-helper.formatting.sql.dialect": "mysql",
  "mybatis-helper.formatting.sql.keywordCase": "upper",
  "mybatis-helper.completion.enableSmartCompletion": true,
  "mybatis-helper.codeLens.showGenerateButton": true
}
```

### 7.1 `formatting.sql.dialect` 配置分析

**问题**：是否需要这个配置？

**删除的影响**：
- sql-formatter 默认使用通用 SQL 语法
- 特定数据库语法可能格式化错误：
  - MySQL 的反引号 `` ` `` vs PostgreSQL 的双引号 `"`
  - `LIMIT` vs `TOP` vs `ROWNUM`
  - 日期函数差异：`NOW()` vs `GETDATE()` vs `CURRENT_TIMESTAMP`

**保留的好处**：
1. **格式化更准确**：根据数据库方言正确处理关键字和语法
2. **用户控制权**：明确知道使用什么数据库
3. **可扩展**：未来可支持自动检测（从 jdbc url）

**推荐**：保留，默认 `"mysql"`（MyBatis 最常用），支持：
- `mysql`
- `postgresql`
- `oracle`
- `sqlite`
- `tsql` (SQL Server)

---

## 8. 验收标准

- [ ] 9 个功能全部可用（自定义文件类型、语法高亮、标签补全、智能补全、创建 XML、方法生成、嵌套格式化、重构同步、SQL 片段提取）
- [ ] 支持 files.associations 配置非标准路径的 Mapper XML
- [ ] 语法高亮性能：5000+ 行文件无卡顿
- [ ] 格式化效果：SQL 关键字大写、正确缩进
- [ ] CodeLens 正确显示跳转/生成按钮
- [ ] 快捷键 `Ctrl+Shift+G` 可快速生成方法
- [ ] 响应时间 < 200ms
- [ ] 国际化完整（8种语言）

---

## 9. 关键更新总结

| 反馈 | 设计调整 |
|------|----------|
| filenamePatterns 写死 | 删除自定义配置，引导用户使用 VS Code 原生 `files.associations`，保留动态内容检测兜底 |
| 标签层级关系 | **DTD 优先策略**：先尝试加载 XML 引用的 DTD（网络/缓存），失败则使用内置枚举兜底 |
| 标签补全难触发 | 多层触发策略：`<`/` `/`"` + 智能上下文过滤 + `fore` 代码片段 |
| 统一智能补全 | ⭐ **接口抽象**：定义 `CompletionStrategy` 接口，各补全类型独立实现策略 |
| Java→XML 需要 CodeLens | 互斥显示：存在则跳转，不存在则生成；支持 `Ctrl+Shift+G` 快捷键 |
| 嵌套格式化依赖 | ⭐ **移除 Red Hat XML 依赖**：直接使用 `xml-formatter` + `sql-formatter` npm 包 |
| sql.dialect 配置 | 保留，默认 `"mysql"`，支持多种数据库方言 |

请审阅这些更新，如有疑问请继续提出！
