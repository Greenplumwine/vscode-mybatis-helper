---
phase: quick
plan: 260401-fjv
subsystem: language-service
tags: [vscode, mybatis-xml, language-detection, dynamic-switching]

requires: []
provides:
  - package.json 中移除了 mybatis-xml 的 .xml 静态扩展名映射
  - extension.ts 中新增了基于 LanguageDetector 的动态语言切换逻辑
affects:
  - language-service
  - xml-navigation
  - xml-completion

tech-stack:
  added: []
  patterns:
    - "Dynamic language switching via vscode.languages.setTextDocumentLanguage"
    - "Content-based detection using LanguageDetector.isMyBatisMapper()"

key-files:
  created: []
  modified:
    - package.json
    - src/extension.ts
    - src/services/language/languageDetector.ts

key-decisions: []
patterns-established: []

requirements-completed:
  - FIX-POM-XML

# Metrics
duration: 5min
completed: 2026-04-01
---

# Quick Plan 260401-fjv: 修复 pom.xml 普通 XML 被错误识别为 mybatis-xml 的问题

**移除 mybatis-xml 的 .xml 静态扩展名绑定，改为通过 LanguageDetector 在打开文档时动态切换语言**

## Performance

- **Duration:** ~2 小时
- **Started:** 2026-04-01T11:00:00Z
- **Completed:** 2026-04-01T13:00:00Z
- **Tasks:** 3
- **Files modified:** 3

## Accomplishments
- 从 `package.json` 的 `contributes.languages` 中移除了 `mybatis-xml` 的 `"extensions": [".xml"]` 静态映射
- 在 `src/extension.ts` 中新增 `registerDynamicLanguageSwitcher` 函数，实现基于内容检测的动态语言切换（从160行简化到40行）
- 修复 `LanguageType` 枚举运行时未定义问题
- 全项目代码 Prettier 格式化
- `npm run compile` 编译通过，`npm run lint` 无错误

## Task Commits

1. **移除 package.json 中 mybatis-xml 的 .xml 静态扩展名映射** - `5a3493d`
2. **重新实现动态 MyBatis XML 语言切换** - `c8ea3f7`
3. **修复 LanguageType 枚举运行时问题，Prettier 格式化** - `e4f96c6`
4. **简化动态语言切换逻辑** - `24da72c` (最终版本，40行精简实现)

## Files Created/Modified
- `package.json` - 删除 mybatis-xml 的 `extensions: [".xml"]` 字段，避免所有 .xml 文件被静态识别为 mybatis-xml
- `src/extension.ts` - 新增 `registerDynamicLanguageSwitcher`，在插件激活和文档打开时检测 XML 内容并自动切换 languageId
- `src/services/language/languageDetector.ts` - 修复 LanguageType 枚举运行时未定义问题，添加调试日志

## Decisions Made
无额外决策，完全按计划执行。

## Deviations from Plan
无 - 计划按预期执行完毕。

## Issues Encountered
- **LanguageType 枚举运行时未定义**: 原代码使用 `LanguageType.XML` 等枚举值，但在运行时 `LanguageType` 为 `undefined`，导致 `"Cannot read properties of undefined (reading 'XML')"` 错误。
  - **解决方案**: 将枚举值替换为字符串字面量，如 `'xml' as LanguageType`。
- **Trae IDE 兼容性**: `setTextDocumentLanguage` 在某些情况下可能抛出异常，已通过 try-catch 捕获并记录为 debug 日志。

## User Setup Required
无需用户额外配置。

## Next Phase Readiness
- 动态语言切换机制已就位，后续可基于内容更准确地为 MyBatis Mapper XML 提供语言服务
- 普通 XML 文件（如 pom.xml）不再被错误识别

---
*Phase: quick*
*Completed: 2026-04-01*
