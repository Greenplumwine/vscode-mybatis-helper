---
phase: quick
plan: 260401-fjv
type: execute
wave: 1
depends_on: []
files_modified:
  - package.json
  - src/extension.ts
autonomous: true
requirements:
  - FIX-POM-XML
must_haves:
  truths:
    - "pom.xml 等普通 XML 文件不再被默认识别为 mybatis-xml 语言"
    - "包含 <!DOCTYPE mapper 或 <mapper namespace 的 .xml 文件会被动态切换为 mybatis-xml 语言"
    - "插件激活时扫描已打开的 XML 文档，打开新 XML 文档时触发检测"
  artifacts:
    - path: "package.json"
      provides: "移除 mybatis-xml 的 .xml 扩展名静态映射"
      contains: '"languages"'
    - path: "src/extension.ts"
      provides: "动态语言切换注册逻辑"
      min_lines: 30
  key_links:
    - from: "src/extension.ts"
      to: "src/services/language/languageDetector.ts"
      via: "languageDetector.isMyBatisMapper()"
      pattern: "isMyBatisMapper"
---

<objective>
修复 pom.xml 等普通 XML 文件被错误识别为 MyBatis XML 的问题。

Purpose: 避免所有 .xml 文件都被静态绑定到 mybatis-xml 语言，导致普通 XML 文件获得错误的语法高亮和语言服务。
Output: package.json 移除 `.xml` 静态扩展名映射，extension.ts 增加基于内容检测的动态语言切换逻辑。
</objective>

<execution_context>
@$HOME/.claude/get-shit-done/workflows/execute-plan.md
@$HOME/.claude/get-shit-done/templates/summary.md
</execution_context>

<context>
@package.json
@src/extension.ts
@src/services/language/languageDetector.ts

<interfaces>
From src/services/language/languageDetector.ts:
```typescript
export class LanguageDetector {
  public static getInstance(): LanguageDetector;
  public isMyBatisMapper(document: vscode.TextDocument): boolean;
}
```

From package.json (languages contribution):
```json
{
  "id": "mybatis-xml",
  "aliases": ["MyBatis XML", "mybatis-xml"],
  "extensions": [".xml"],
  "firstLine": "^\\s*<[\\?\\!]\\s*DOCTYPE\\s+mapper",
  "configuration": "./language-configuration.json"
}
```
</interfaces>
</context>

<tasks>

<task type="auto">
  <name>Task 1: 移除 package.json 中 mybatis-xml 的 .xml 静态扩展名映射</name>
  <files>package.json</files>
  <action>
    在 package.json 的 `contributes.languages` 数组中，找到 `id` 为 `mybatis-xml` 的语言定义，删除其中的 `"extensions": [".xml"]` 字段。
    保留 `"firstLine"`、`"configuration"`、`"aliases"` 等其他字段不变。
    这样 VS Code 不会再因为文件扩展名是 .xml 就自动将该文件识别为 mybatis-xml。
  </action>
  <verify>
    <automated>grep -n '"extensions"' package.json | grep 'mybatis-xml' -B5 -A1 || echo "OK: no extensions binding for mybatis-xml"</automated>
  </verify>
  <done>package.json 中 mybatis-xml 语言定义不再包含 `"extensions": [".xml"]`</done>
</task>

<task type="auto">
  <name>Task 2: 在 extension.ts 中注册动态 MyBatis XML 语言切换器</name>
  <files>src/extension.ts</files>
  <action>
    在 `src/extension.ts` 中新增一个 `registerDynamicLanguageSwitcher(context: vscode.ExtensionContext)` 函数，并在 `activatePluginFeatures(context)` 末尾调用它。

    该函数需完成以下行为：
    1. 导入 `languageDetector`（已在 extension.ts 中通过 `LanguageDetector` 导入，可直接使用 `LanguageDetector.getInstance()`）。
    2. 定义一个内部异步函数 `switchLanguage(document: vscode.TextDocument)`：
       - 仅处理 `document.fileName.toLowerCase().endsWith('.xml')` 的文件。
       - 调用 `languageDetector.isMyBatisMapper(document)` 检测内容。
       - 如果是 MyBatis Mapper 且当前 `document.languageId !== 'mybatis-xml'`，调用 `vscode.languages.setTextDocumentLanguage(document, 'mybatis-xml')`。
       - 如果不是 MyBatis Mapper 且当前 `document.languageId === 'mybatis-xml'`，调用 `vscode.languages.setTextDocumentLanguage(document, 'xml')`。
       - 使用 try/catch 捕获 `setTextDocumentLanguage` 可能抛出的错误（如文档已关闭）。
    3. 插件激活时遍历已打开的文档：
       ```typescript
       vscode.workspace.textDocuments.forEach(switchLanguage);
       ```
    4. 订阅新文档打开事件：
       ```typescript
       context.subscriptions.push(
         vscode.workspace.onDidOpenTextDocument(switchLanguage)
       );
       ```
    5. 将事件监听器的 dispose 推入 `context.subscriptions`，确保插件停用时自动清理。

    注意：`vscode.languages.setTextDocumentLanguage` 返回 `Promise<TextDocument>`，无需 await 也可以工作，但建议 await 并在 catch 中忽略错误日志等级为 debug。
  </action>
  <verify>
    <automated>grep -n 'switchLanguage\|isMyBatisMapper\|setTextDocumentLanguage\|onDidOpenTextDocument' src/extension.ts | head -20</automated>
  </verify>
  <done>
    - extension.ts 中存在 `registerDynamicLanguageSwitcher` 函数
    - `activatePluginFeatures` 中调用了该函数
    - 代码包含 `vscode.workspace.onDidOpenTextDocument` 和 `vscode.languages.setTextDocumentLanguage` 调用
    - 使用 `languageDetector.isMyBatisMapper(document)` 作为判断条件
  </done>
</task>

<task type="auto">
  <name>Task 3: 编译验证无语法错误</name>
  <files>src/extension.ts</files>
  <action>
    运行 `npm run compile` 确保 TypeScript 编译通过，没有新增的类型或语法错误。
    如果有缺少导入的错误，检查是否已正确引用 `LanguageDetector` 或 `languageDetector`。
  </action>
  <verify>
    <automated>npm run compile</automated>
  </verify>
  <done>`npm run compile` 返回 exit code 0，没有与 extension.ts 相关的编译错误</done>
</task>

</tasks>

<verification>
- `package.json` 中 mybatis-xml 的 `extensions` 字段已移除
- `src/extension.ts` 包含动态语言切换逻辑，能正确识别并切换 MyBatis XML 文件
- `npm run compile` 编译通过
</verification>

<success_criteria>
- pom.xml 打开时 languageId 保持为 `xml`，不会变成 `mybatis-xml`
- 包含 `<!DOCTYPE mapper` 或 `<mapper namespace=` 的 XML 文件打开后 languageId 自动变为 `mybatis-xml`
- 插件激活时已打开的 XML 文档会被扫描并正确切换语言
- TypeScript 编译无错误
</success_criteria>

<output>
After completion, create `.planning/quick/260401-fjv-pom-xml-xml-mybatis-xml/260401-fjv-SUMMARY.md`
</output>
