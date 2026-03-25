# Technology Stack

**Analysis Date:** 2026-03-24

## Languages

**Primary:**
- TypeScript 5.9.2 - All extension logic, parsers, and services
- JSON - Configuration files, localization bundles

**Secondary:**
- Java - Target language for MyBatis development (extension operates on Java source files)
- XML - MyBatis mapper files, Maven/Gradle configuration

## Runtime

**Environment:**
- Node.js (bundled with VS Code Electron runtime)
- VS Code Extension Host API ^1.93.0

**Package Manager:**
- pnpm (evident from pnpm-lock.yaml)
- Lockfile: present

## Frameworks

**Core:**
- VS Code Extension API ^1.93.0 - Extension lifecycle, commands, language providers, TreeViews
- Node.js Worker Threads - Class file parsing in background threads (`src/features/mapping/classParsingWorker.ts`)

**Testing:**
- @vscode/test-cli ^0.0.11 - VS Code extension test runner
- @vscode/test-electron ^2.5.2 - Electron-based test environment
- Mocha ^10.0.10 - Test framework (types only, inferred from devDependencies)

**Build/Dev:**
- TypeScript ^5.9.2 - Compilation with strict mode enabled
- ESLint ^9.32.0 with @typescript-eslint - Linting

## Key Dependencies

**Critical:**
- `fast-xml-parser` ^5.3.4 - Core XML parsing for MyBatis mapper files
  - Used in: `src/services/parsing/mybatisXmlParser.ts`
  - Purpose: Parse XML structure, extract SQL statements, namespace mappings

- `sql-formatter` ^15.7.2 - SQL formatting for intercepted queries
  - Used in: `src/features/formatting/pipeline/sqlFormatter.ts`
  - Purpose: Format SQL with configurable dialects (MySQL, PostgreSQL, Oracle, etc.)

- `xml-formatter` ^3.6.7 - XML document formatting
  - Used in: `src/features/formatting/pipeline/xmlFormatter.ts`
  - Purpose: Format MyBatis XML mapper files

- `axios` ^1.13.6 - HTTP client for external requests
  - Used in: `src/utils/httpClient.ts`
  - Purpose: DTD resolution, potential future API integrations

**Infrastructure:**
- `redhat.java` - Extension dependency (hard requirement)
  - Purpose: Java language support, classpath resolution
  - Activated via: `src/extension.ts` lines 130-151

## Configuration

**TypeScript:**
- `tsconfig.json`: Node16 module resolution, ES2022 target, strict mode
- Source: `src/`, Output: `out/`
- Source maps enabled

**ESLint:**
- Config: `eslint.config.mjs` (flat config format)
- Parser: @typescript-eslint/parser
- Plugins: @typescript-eslint
- Rules: naming-convention, curly, eqeqeq, no-throw-literal, semi

**Build:**
- Compile: `tsc -p ./`
- Watch: `tsc -watch -p ./`
- Prepublish: `pnpm run compile`

## Platform Requirements

**Development:**
- VS Code ^1.93.0
- Node.js (matching VS Code's bundled version)
- pnpm for package management
- JDK (for `javap` command - used in class file parsing worker)

**Production:**
- VS Code ^1.93.0 or later
- `redhat.java` extension must be installed
- JDK with `javap` in PATH (for enterprise scanner features)
- Maven or Gradle project structure (pom.xml or build.gradle for activation)

## Extension Architecture

**Activation Events:**
- `workspaceContains:**/pom.xml`
- `workspaceContains:**/build.gradle`

**Entry Point:**
- `out/extension.js` (compiled from `src/extension.ts`)

**Contributions:**
- 14 commands (jumpToXml, jumpToMapper, generateXmlMethod, etc.)
- Custom language: `mybatis-xml`
- TreeView: `mybatisSQLHistory`
- Activity bar container: `mybatisHelperView`
- Formatting provider for XML/MyBatis XML
- Completion providers for MyBatis XML

---

*Stack analysis: 2026-03-24*
