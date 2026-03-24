# Codebase Structure

**Analysis Date:** 2026-03-24

## Directory Layout

```
[project-root]/
├── .planning/          # Planning documents (this directory)
├── .vscode-test/       # VS Code test environment
├── docs/               # Documentation
├── icons/              # Extension icons (SVG)
├── l10n/               # Localization files (i18n)
│   ├── bundle.l10n.json
│   ├── bundle.l10n.zh-cn.json
│   └── ... (other languages)
├── node_modules/       # Dependencies
├── out/                # Compiled JavaScript output
├── src/                # Source code
│   ├── commands/       # VS Code commands
│   ├── features/       # Core features
│   ├── services/       # Shared services
│   ├── types/          # Type definitions
│   └── utils/          # Utilities
├── static/             # Static assets
├── syntaxes/           # TextMate grammar files
├── CHANGELOG.md        # Version history
├── package.json        # Extension manifest
├── tsconfig.json       # TypeScript config
└── README.md           # Documentation
```

## Directory Purposes

**src/commands/:**
- Purpose: VS Code command implementations
- Contains: `generateXmlMethod.ts`, `createMapperXml.ts`, `index.ts`
- Key files: `src/commands/generateXmlMethod.ts`, `src/commands/createMapperXml.ts`

**src/features/:**
- Purpose: Core feature implementations organized by domain
- Contains:
  - `completion/` - Smart code completion for XML
  - `formatting/` - XML and SQL formatting
  - `mapping/` - Java-XML mapping and navigation
  - `sql-completion/` - SQL statement completion
  - `sql-interceptor/` - SQL log interception
  - `mybatis-common/` - Shared MyBatis utilities
- Key files: `src/features/mapping/fastMappingEngine.ts`, `src/features/completion/unifiedCompletionProvider.ts`

**src/services/:**
- Purpose: Business logic and parsing services
- Contains:
  - `language/` - Language detection
  - `parsing/` - XML and Java parsing
  - `template/` - Code generation templates
  - `types/` - Service-specific types
- Key files: `src/services/parsing/mybatisXmlParser.ts`, `src/services/parsing/dtdResolver.ts`

**src/types/:**
- Purpose: Shared TypeScript interfaces and enums
- Contains: `index.ts` with core type definitions
- Key types: `SQLQuery`, `DatabaseType`, `PluginConfig`, `NameMatchingRule`

**src/utils/:**
- Purpose: Cross-cutting utilities
- Contains: `logger.ts`, `performanceUtils.ts`, `javaExtensionAPI.ts`, `constants.ts`, etc.
- Key files: `src/utils/logger.ts`, `src/utils/javaExtensionAPI.ts`

**l10n/:**
- Purpose: Internationalization strings
- Contains: `bundle.l10n.json` and language-specific variants
- Languages: English, Chinese (Simplified/Traditional), Japanese, German, French, Spanish, Russian

**out/:**
- Purpose: Compiled JavaScript output
- Generated: Yes (from TypeScript compilation)
- Committed: No (in .gitignore)

## Key File Locations

**Entry Points:**
- `src/extension.ts`: Main extension entry point (activation)
- `out/extension.js`: Compiled entry point (referenced in package.json)

**Configuration:**
- `package.json`: Extension manifest with commands, configuration, views
- `tsconfig.json`: TypeScript compiler options
- `language-configuration.json`: Language-specific VS Code settings

**Core Logic:**
- `src/features/mapping/fastMappingEngine.ts`: O(1) mapping lookup engine
- `src/features/mapping/fastScanner.ts`: High-performance file scanner
- `src/features/mapping/unifiedNavigationService.ts`: Bidirectional navigation
- `src/features/completion/unifiedCompletionProvider.ts`: Smart completion
- `src/features/formatting/nestedFormattingProvider.ts`: XML/SQL formatting

**Testing:**
- `.vscode-test.mjs`: Test runner configuration
- `out/test/`: Compiled test files (if any)

## Naming Conventions

**Files:**
- TypeScript: `camelCase.ts` (e.g., `fastMappingEngine.ts`)
- Index files: `index.ts` for module exports
- Test files: Not currently present

**Directories:**
- Lowercase with hyphens: `sql-interceptor/`, `mybatis-common/`
- Feature-based organization

**Classes:**
- PascalCase: `FastMappingEngine`, `UnifiedNavigationService`
- Suffix pattern: `*Provider`, `*Service`, `*Engine`, `*Resolver`

**Interfaces:**
- PascalCase with descriptive names: `MapperMapping`, `MethodMapping`, `SqlStatementInfo`

## Where to Add New Code

**New Command:**
- Implementation: `src/commands/{commandName}.ts`
- Registration: `src/extension.ts` in `activatePluginFeatures()`
- Manifest: Add to `package.json` contributes.commands

**New Feature Module:**
- Implementation: `src/features/{featureName}/`
- Exports: `src/features/{featureName}/index.ts`
- Registration: Import and register in `src/extension.ts`

**New Completion Strategy:**
- Implementation: `src/features/completion/strategies/{strategyName}Strategy.ts`
- Export: Add to `src/features/completion/strategies/index.ts`
- Registration: Auto-discovered by `UnifiedCompletionProvider`

**New Service:**
- Implementation: `src/services/{category}/{serviceName}.ts`
- Export: Add to `src/services/{category}/index.ts` and `src/services/index.ts`

**New Utility:**
- Implementation: `src/utils/{utilityName}.ts`
- Export: Add to `src/utils/index.ts`

**New Type Definition:**
- Add to: `src/types/index.ts` or create new file in `src/types/`

## Special Directories

**.vscode-test/:**
- Purpose: VS Code test runner environment
- Generated: Yes (by @vscode/test-cli)
- Committed: No (in .gitignore)

**out/:**
- Purpose: TypeScript compilation output
- Generated: Yes (by `tsc`)
- Committed: No (in .gitignore)

**syntaxes/:**
- Purpose: TextMate grammar for MyBatis XML language
- Contains: `mybatis-xml.tmLanguage.json`
- Referenced: In `package.json` contributes.grammars

**static/:**
- Purpose: Static assets like icons
- Contains: Icon files referenced by package.json

---

*Structure analysis: 2026-03-24*
