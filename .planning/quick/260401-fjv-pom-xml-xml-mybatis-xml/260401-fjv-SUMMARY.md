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

- **Duration:** 5 分钟
- **Started:** 2026-04-01T03:20:00Z
- **Completed:** 2026-04-01T03:25:00Z
- **Tasks:** 3
- **Files modified:** 2

## Accomplishments
- 从 `package.json` 的 `contributes.languages` 中移除了 `mybatis-xml` 的 `"extensions": [".xml"]` 静态映射
- 在 `src/extension.ts` 中新增 `registerDynamicLanguageSwitcher` 函数，实现基于内容检测的动态语言切换
- `npm run compile` 编译通过，无新增错误

## Task Commits

1. **Task 1: 移除 package.json 中 mybatis-xml 的 .xml 静态扩展名映射** - `847d64a` (fix)
2. **Task 2: 在 extension.ts 中注册动态 MyBatis XML 语言切换器** - `faa3915` (feat)

## Files Created/Modified
- `package.json` - 删除 mybatis-xml 的 `extensions: [".xml"]` 字段，避免所有 .xml 文件被静态识别为 mybatis-xml
- `src/extension.ts` - 新增 `registerDynamicLanguageSwitcher`，在插件激活和文档打开时检测 XML 内容并自动切换 languageId

## Decisions Made
无额外决策，完全按计划执行。

## Deviations from Plan
无 - 计划按预期执行完毕。

## Issues Encountered
无。

## User Setup Required
无需用户额外配置。

## Next Phase Readiness
- 动态语言切换机制已就位，后续可基于内容更准确地为 MyBatis Mapper XML 提供语言服务
- 普通 XML 文件（如 pom.xml）不再被错误识别

---
*Phase: quick*
*Completed: 2026-04-01*
