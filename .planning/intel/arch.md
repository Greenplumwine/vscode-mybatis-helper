---
updated_at: "2026-04-21T07:04:29.959Z"
---

## Architecture Overview

MyBatis Helper is a VS Code extension built on a layered architecture with clear separation between feature, service, and utility layers. The extension provides Java-XML bidirectional navigation, SQL log interception, code completion, and formatting for MyBatis development.

The architecture follows a **Singleton + EventEmitter pattern** for core services, with **Strategy Pattern** for completion providers and **Pipeline Pattern** for formatting. Dual scanner architecture (FastScanner vs EnterpriseScanner) adapts to project scale at runtime.

## Key Components

| Component | Path | Responsibility |
|-----------|------|---------------|
| Extension Entry | `src/extension.ts` | Activation, service initialization, command/provider registration |
| FastMappingEngine | `src/features/mapping/fastMappingEngine.ts` | O(1) namespace lookup with bidirectional indexes |
| FastScanner | `src/features/mapping/fastScanner.ts` | Standard project file scanning, parallel batch processing |
| EnterpriseScanner | `src/features/mapping/enterpriseScanner.ts` | Large/monorepo scanning with 6-layer config resolution |
| UnifiedNavigationService | `src/features/mapping/unifiedNavigationService.ts` | Java <-> XML navigation coordinator |
| SQLInterceptorService | `src/features/sql-interceptor/sqlInterceptorService.ts` | Debug console/terminal SQL log capture |
| UnifiedCompletionProvider | `src/features/completion/unifiedCompletionProvider.ts` | Strategy-based XML completion |
| NestedFormattingProvider | `src/features/formatting/nestedFormattingProvider.ts` | SQL/XML nested formatting via pipeline |
| MyBatisXmlParser | `src/services/parsing/mybatisXmlParser.ts` | XML parsing with DTD resolution |
| JavaMethodParser | `src/services/language/javaMethodParser.ts` | Java method signature parsing |
| LanguageDetector | `src/services/language/languageDetector.ts` | MyBatis XML detection with strategy pattern |
| TemplateEngine | `src/services/template/templateEngine.ts` | Code generation templates |

## Data Flow

1. **Activation**: `extension.ts activate()` -> detect project type -> choose FastScanner or EnterpriseScanner
2. **Scanning**: Scanner -> `FastMappingEngine` builds namespace/className/package indexes
3. **Navigation**: User triggers jump -> `UnifiedNavigationService` queries `FastMappingEngine` indexes -> open target file
4. **SQL Interception**: `SQLInterceptorService` listens to debug console/terminal -> parses with regex rules -> populates `SQLHistoryTreeProvider`
5. **Completion**: `UnifiedCompletionProvider` -> `CompletionContextBuilder` -> strategy selection -> item generation
6. **Formatting**: `NestedFormattingProvider` -> `FormattingPipeline` (SQL extraction -> SQL format -> XML format -> indent adjust)

## Conventions

- **Naming**: Singleton classes use `getInstance()`; exported instances use lowercase camelCase (e.g., `logger`, `templateEngine`)
- **File Organization**: Barrel `index.ts` files in each module directory re-export public API
- **Import Pattern**: Internal modules use relative paths; Node built-ins use `* as` namespace imports
- **Path Normalization**: Extensive `.toLowerCase()` usage for cross-platform path handling
- **Language ID**: Custom `mybatis-xml` language ID registered with tmLanguage grammar
- **Localization**: `vscode.l10n.t()` with keys defined in `l10n/bundle.l10n.json`; 8 non-English bundles
- **Debounce**: File watchers use 300ms debounce via `Map<string, NodeJS.Timeout>`
