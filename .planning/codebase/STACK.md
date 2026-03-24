# Technology Stack

**Analysis Date:** 2026-03-24

## Languages

**Primary:**
- TypeScript 5.9.2 - Core extension logic and VS Code API integration
- JavaScript (ES2022) - Compiled output (`out/` directory)

**Secondary:**
- JSON - Configuration files, localization bundles, syntax definitions
- XML - MyBatis mapper file parsing and processing
- Java - Language support and bytecode analysis

## Runtime

**Environment:**
- Node.js (VS Code Extension Host)
- VS Code Engine: ^1.93.0

**Package Manager:**
- pnpm (evidenced by `pnpm-lock.yaml`)
- Lockfile: `pnpm-lock.yaml` present

## Frameworks

**Core:**
- VS Code Extension API (`vscode`) - Extension host integration
- TypeScript Compiler (tsc) - Build and type checking

**Testing:**
- Mocha ^10.0.10 - Test framework
- `@vscode/test-cli` ^0.0.11 - VS Code extension testing CLI
- `@vscode/test-electron` ^2.5.2 - Electron-based VS Code testing

**Build/Dev:**
- TypeScript ^5.9.2 - Primary compiler
- ESLint ^9.32.0 with `@typescript-eslint/*` ^8.39.0 - Linting

## Key Dependencies

**Critical:**
- `fast-xml-parser` ^5.3.4 - High-performance XML parsing for MyBatis mapper files
- `sql-formatter` ^15.7.2 - SQL statement formatting with dialect support
- `xml-formatter` ^3.6.7 - XML document formatting
- `axios` ^1.13.6 - HTTP client for DTD fetching and external requests

**Infrastructure:**
- `redhat.java` (extension dependency) - Java language support integration
- Node.js built-ins: `fs/promises`, `path`, `os`, `crypto`, `worker_threads`

## Configuration

**Environment:**
- No `.env` file detected
- Configuration via VS Code settings API (`vscode.workspace.getConfiguration`)
- Extension settings namespace: `mybatis-helper`

**Build:**
- `tsconfig.json` - TypeScript compiler configuration
  - Target: ES2022
  - Module: Node16
  - OutDir: `out/`
  - RootDir: `src/`
  - Strict mode enabled
- `eslint.config.mjs` - ESLint flat config with TypeScript support

**Extension Manifest:**
- `package.json` - VS Code extension manifest with commands, keybindings, configuration schema
- `language-configuration.json` - MyBatis XML language configuration (brackets, auto-closing, folding)
- `syntaxes/mybatis-xml.tmLanguage.json` - TextMate grammar for syntax highlighting

## Platform Requirements

**Development:**
- VS Code ^1.93.0 or compatible (Cursor, Windsurf, etc.)
- Node.js runtime (bundled with VS Code)
- pnpm for package management

**Production:**
- VS Code extension marketplace deployment
- Target: VS Code desktop (Electron)
- Supports: Windows, macOS, Linux (via VS Code)

## Notable Technical Features

**Performance Optimizations:**
- Worker threads for class file parsing (`classParsingWorker.ts`)
- Incremental indexing with file watchers
- Multi-layer scanning strategy (EnterpriseScanner)
- Index caching for large projects

**Internationalization:**
- VS Code l10n API with 9 language bundles:
  - English (default), Chinese (Simplified/Traditional), German, Spanish, French, Japanese, Russian

**Language Support:**
- Custom language ID: `mybatis-xml`
- File pattern: `**/*.xml` with DOCTYPE detection
- Syntax highlighting for MyBatis-specific tags

---

*Stack analysis: 2026-03-24*
