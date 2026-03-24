# Coding Conventions

**Analysis Date:** 2026-03-24

## Naming Patterns

### Files
- **TypeScript source files:** `camelCase.ts` (e.g., `fastScanner.ts`, `xmlParser.ts`)
- **Index barrel files:** `index.ts` for module exports
- **Test files:** Located in `__tests__/` subdirectory with `.test.js` extension
- **Configuration files:** `eslint.config.mjs`, `tsconfig.json`

### Classes
- **PascalCase** for class names
- Examples: `FastScanner`, `FastMappingEngine`, `Logger`, `MyBatisXmlParser`
- Service classes often use singleton pattern with `getInstance()` method

### Interfaces
- **PascalCase** with descriptive names
- Examples: `MethodMapping`, `MapperMapping`, `JavaMapperInfo`, `Position`
- Located in `src/features/mapping/types.ts` and `src/types/index.ts`

### Functions/Methods
- **camelCase** for all functions and methods
- Examples: `scan()`, `initialize()`, `getNavigationInfo()`, `shouldLog()`
- Private methods use standard visibility modifiers (TypeScript `private`)

### Variables
- **camelCase** for variables and constants
- Private class members prefixed with underscore not used; use `private` keyword
- Boolean flags use descriptive names: `isScanning`, `useEnterpriseScanner`, `commandsRegistered`

### Constants
- **UPPER_SNAKE_CASE** for true constants
- Example: `DEBOUNCE_DELAY = 300`, `DEFAULT_CONFIG`
- Constants imported from `src/utils/constants.ts` (e.g., `SCAN_LIMITS`)

## Code Style

### Formatting
- **Tool:** ESLint with TypeScript plugin
- **Config:** `eslint.config.mjs` (flat config format)
- **Semicolons:** Required (enforced by `semi: "warn"`)
- **Quotes:** Double quotes for strings
- **Indentation:** 2 spaces (inferred from codebase)

### Linting Rules
Key ESLint rules from `eslint.config.mjs`:
```javascript
rules: {
    "@typescript-eslint/naming-convention": ["warn", {
        selector: "import",
        format: ["camelCase", "PascalCase"],
    }],
    curly: "warn",           // Require curly braces for all control statements
    eqeqeq: "warn",          // Require === and !==
    "no-throw-literal": "warn",
    semi: "warn",            // Require semicolons
}
```

### TypeScript Configuration
From `tsconfig.json`:
- **Target:** ES2022
- **Module:** Node16
- **Strict mode:** Enabled (`"strict": true`)
- **Source maps:** Enabled
- **Root directory:** `src`
- **Output directory:** `out`

## Import Organization

### Order Pattern (observed in `src/extension.ts`):
1. **VSCode API:** `import * as vscode from "vscode";`
2. **Node.js built-ins:** `import * as path from "path";`
3. **Third-party dependencies:** (none in this project)
4. **Internal features:** Relative imports from `./features/`
5. **Internal services:** Relative imports from `./services/`
6. **Internal utils:** Relative imports from `./utils/`
7. **Internal commands:** Relative imports from `./commands/`

### Import Style
- Use namespace imports for modules: `import * as vscode from "vscode";`
- Use named imports for specific exports: `import { Logger } from "./utils/logger";`
- Barrel exports via `index.ts` files for clean module APIs

## Documentation Practices

### File Headers
All source files include JSDoc header with:
- File purpose/description
- Key features/optimizations (for complex files)
- Design patterns used (for command files)

Example from `src/extension.ts`:
```typescript
/**
 * MyBatis Helper 插件入口文件（高性能版本）
 * 负责插件的激活、初始化和功能注册
 *
 * 优化亮点：
 * 1. 使用 FastMappingEngine - O(1) 索引查找
 * 2. 使用 FastScanner - 分层扫描策略
 * 3. 使用 FastNavigationService - 高性能导航
 */
```

### Class Documentation
Classes include JSDoc with:
- Purpose description
- Key characteristics or design notes

Example:
```typescript
/**
 * 日志系统类
 * 提供分级日志输出功能
 */
export class Logger {
```

### Method Documentation
Public methods include JSDoc with:
- `@param` tags with types and descriptions
- `@returns` description where applicable

Example:
```typescript
/**
 * 获取日志系统实例
 * @returns Logger 实例
 */
public static getInstance(): Logger {
```

### Inline Comments
- Use Chinese comments for business logic
- Use English for technical/algorithmic comments
- Section dividers for code organization: `// ========== 高性能新架构组件 ==========`

## Error Handling

### Patterns
1. **Try-catch with logging:** All async operations wrapped in try-catch
2. **Error propagation:** Errors logged and re-thrown or handled gracefully
3. **User feedback:** VSCode messages for user-facing errors

Example:
```typescript
try {
    await scanner.scan();
} catch (error) {
    logger.error(vscode.l10n.t("scan.error", { error: String(error) }));
    updateStatusBar(vscode.l10n.t("status.nonJavaProject"), false);
}
```

## Logging

### Framework
Custom `Logger` class in `src/utils/logger.ts`

### Log Levels
- `DEBUG` - Detailed diagnostic information
- `INFO` - General operational information
- `WARN` - Warning conditions
- `ERROR` - Error conditions

### Patterns
- Use `logger?.debug()` for optional chaining when logger may not be initialized
- Include context in log messages using `vscode.l10n.t()` for i18n
- Metadata objects for structured logging: `logger.debug('message', { key: value })`

## Internationalization (i18n)

### Pattern
- All user-facing strings use `vscode.l10n.t()`
- Translation keys in dot-notation: `"extension.activating"`, `"scan.error"`
- Translation files in `l10n/` directory: `bundle.l10n.json`, `bundle.l10n.zh-cn.json`, etc.

## Module Design

### Exports
- Barrel files (`index.ts`) for clean module APIs
- Named exports preferred over default exports
- Service classes exported as both class and singleton instance

Example from `src/services/index.ts`:
```typescript
export * from './types';
export * from './parsing';
export * from './language';
export * from './template';
```

### Singleton Pattern
Services use singleton pattern with `getInstance()`:
```typescript
private static instance: FastScanner;
public static getInstance(config?: Partial<ScanConfig>): FastScanner {
    if (!FastScanner.instance) {
        FastScanner.instance = new FastScanner(config);
    }
    return FastScanner.instance;
}
```

## Git Workflow

### Scripts (from `package.json`)
```bash
pnpm run compile      # Compile TypeScript
pnpm run watch        # Watch mode compilation
pnpm run lint         # Run ESLint on src/
pnpm run pretest      # Compile + lint before tests
```

### Pre-commit
- `pretest` script runs compile and lint
- No explicit pre-commit hooks configured

---

*Convention analysis: 2026-03-24*
