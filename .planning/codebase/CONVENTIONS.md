# Coding Conventions

**Analysis Date:** 2026-03-24

## Naming Patterns

### Files
- **Implementation files**: camelCase (e.g., `fastMappingEngine.ts`, `javaMethodParser.ts`)
- **Type definition files**: camelCase (e.g., `types.ts`)
- **Index/barrel files**: `index.ts` for module exports
- **Worker files**: descriptive name + `Worker.ts` suffix (e.g., `classParsingWorker.ts`)

### Classes
- **PascalCase** for class names
- Suffix pattern for specific roles:
  - Services: `*Service` (e.g., `SQLInterceptorService`, `FastMappingEngine`)
  - Providers: `*Provider` (e.g., `UnifiedCompletionProvider`, `TagCompletionProvider`)
  - Commands: `*Command` (e.g., `GenerateXmlMethodCommand`)
  - Strategies: `*Strategy` (e.g., `TypeStrategy`, `PlaceholderStrategy`)
  - Resolvers: `*Resolver` (e.g., `TagHierarchyResolver`, `XmlLocationResolver`)

### Interfaces
- **PascalCase** with descriptive names
- Examples: `CompletionStrategy`, `JavaMapperInfo`, `XmlMapperInfo`, `MethodMapping`

### Variables and Properties
- **camelCase** for variables, properties, and parameters
- **UPPER_SNAKE_CASE** for constants (e.g., `DEBOUNCE_DELAY = 300`)
- Private class members use `private` keyword explicitly
- Readonly properties marked with `readonly` modifier

### Functions and Methods
- **camelCase** for function and method names
- **Verb-first naming** for actions: `getInstance()`, `buildMapping()`, `scanProjectClasses()`
- **Boolean predicates** start with `is`, `has`, `can`: `isInAttribute()`, `hasSqlForMethod()`, `canComplete()`

### Enums
- **PascalCase** for enum names
- **UPPER_SNAKE_CASE** for enum values:
```typescript
export enum LogLevel {
    DEBUG = 'DEBUG',
    INFO = 'INFO',
    WARN = 'WARN',
    ERROR = 'ERROR'
}
```

## Code Style

### Formatting
- **Tool**: ESLint with TypeScript plugin (`@typescript-eslint`)
- **Indentation**: 2 spaces (inferred from source)
- **Quotes**: Double quotes for strings
- **Semicolons**: Required (enforced by ESLint rule `semi: "warn"`)
- **Line endings**: LF (Unix-style)

### ESLint Configuration
Located in `eslint.config.mjs`:
```javascript
rules: {
    "@typescript-eslint/naming-convention": ["warn", {
        selector: "import",
        format: ["camelCase", "PascalCase"],
    }],
    curly: "warn",
    eqeqeq: "warn",
    "no-throw-literal": "warn",
    semi: "warn",
}
```

### TypeScript Strictness
- **Strict mode enabled**: `"strict": true` in `tsconfig.json`
- **Target**: ES2022
- **Module**: Node16

## Import Organization

### Order
1. **Node.js built-ins** (e.g., `import * as path from "path"`)
2. **VS Code API** (e.g., `import * as vscode from "vscode"`)
3. **Third-party dependencies** (e.g., `import { XMLParser } from "fast-xml-parser"`)
4. **Internal modules** (relative paths)
   - Utils
   - Types
   - Services
   - Features

### Path Aliases
- No custom path aliases configured
- Use relative imports: `../../utils/logger`, `./types`

### Import Style
- Prefer namespace imports for VS Code and Node.js: `import * as vscode from "vscode"`
- Named imports for specific exports: `import { Logger } from "../../utils/logger"`

## Error Handling

### Patterns
1. **Try-catch with logging**:
```typescript
try {
    await scanner.scan();
} catch (error) {
    logger.error(vscode.l10n.t("scan.error", { error: String(error) }));
    updateStatusBar(vscode.l10n.t("status.nonJavaProject"), false);
}
```

2. **Graceful degradation**:
```typescript
const classes = await this.javaParser.scanProjectClasses?.() ?? [];
```

3. **Error type checking**:
```typescript
error instanceof Error ? error.message : 'Unknown error'
```

4. **Silent failure for optional operations**:
```typescript
try {
    await fs.access(pomPath);
} catch (e) {} // Intentionally empty
```

### Error Logging
- Use `Logger` class with appropriate level:
  - `logger.debug()` - Development diagnostics
  - `logger.info()` - General information
  - `logger.warn()` - Non-critical issues
  - `logger.error()` - Critical errors with optional Error object

## Async/Await Usage

### Patterns
1. **Always use async/await**, never raw promises:
```typescript
async provideCompletionItems(
    document: vscode.TextDocument,
    position: vscode.Position
): Promise<vscode.CompletionItem[]> {
    const context = await this.contextBuilder.build(document, position);
    // ...
}
```

2. **Parallel execution with Promise.all**:
```typescript
const [javaFiles, xmlFiles] = await Promise.all([
    vscode.workspace.findFiles("**/*.java", null, 100),
    vscode.workspace.findFiles("**/*.xml", null, 100)
]);
```

3. **Proper async initialization**:
```typescript
public async initialize(): Promise<void> {
    const { Logger } = await import('../../utils/logger.js');
    this.logger = Logger.getInstance();
}
```

4. **Cancellation token checking**:
```typescript
if (token.isCancellationRequested) {
    return [];
}
```

## TypeScript Patterns

### Type Definitions
1. **Explicit return types** on public methods:
```typescript
public getByNamespace(namespace: string): MapperMapping | undefined
public getStats(): { total: number; withXml: number; totalMethods: number }
```

2. **Readonly properties** for immutable data:
```typescript
readonly triggerCharacters: readonly string[];
readonly priority: number;
readonly name: string;
```

3. **Interface segregation**:
```typescript
export interface CompletionStrategy {
    readonly triggerCharacters: readonly string[];
    readonly priority: number;
    readonly name: string;
    canComplete(context: CompletionContext): boolean | Promise<boolean>;
    provideCompletionItems(context: CompletionContext): Promise<vscode.CompletionItem[]>;
}
```

### Access Modifiers
- Explicitly mark `public`, `private`, `protected`
- Private members prefixed with `private` keyword (not underscore convention)

### Singleton Pattern
```typescript
export class Logger {
    private static instance: Logger;

    public static getInstance(): Logger {
        if (!Logger.instance) {
            Logger.instance = new Logger();
        }
        return Logger.instance;
    }

    private constructor() { }
}
```

### Null/Undefined Handling
- Use `undefined` rather than `null` where possible
- Optional chaining: `mapping?.xmlPath`
- Nullish coalescing: `paramType ?? ''`

## Comments and Documentation

### JSDoc/TSDoc
- Comprehensive JSDoc for all public APIs
- Include `@module` tags for file-level documentation
- Use `@example` for complex usage patterns

```typescript
/**
 * 补全策略抽象基类
 *
 * 设计模式：
 * - 模板方法模式 (Template Method Pattern)
 * - 策略模式 (Strategy Pattern)
 *
 * @module features/completion/strategies/baseStrategy
 */
```

### Inline Comments
- Chinese comments for business logic explanations
- English for technical documentation
- Section separators for large files:
```typescript
// ========== 核心索引 ==========
// ========== 缓存 ==========
// ========== 统计 ==========
```

## Module Design

### Barrel Exports
Each directory has an `index.ts` that re-exports public APIs:
```typescript
// src/services/index.ts
export * from './types';
export * from './parsing';
export * from './language';
export * from './template';
```

### Feature Organization
Features follow a consistent structure:
```
features/
├── completion/
│   ├── index.ts           # Public exports
│   ├── types.ts           # Feature-specific types
│   ├── contextBuilder.ts  # Core implementation
│   ├── unifiedCompletionProvider.ts
│   └── strategies/        # Strategy implementations
│       ├── index.ts
│       ├── baseStrategy.ts
│       └── *Strategy.ts
```

## Constants

### Time Constants
Located in `src/utils/constants.ts`:
```typescript
export const TIME = {
    SECOND: 1000,
    THIRTY_SECONDS: 30 * 1000,
    MINUTE: 60 * 1000,
    // ...
} as const;
```

### Cache Limits
```typescript
export const CACHE_LIMITS = {
    DEFAULT_MAX_HISTORY: 1000,
    DEFAULT_MAX_CACHE_SIZE: 5000,
    DEFAULT_TTL: 5 * 60 * 1000, // 5 minutes
} as const;
```

## String Localization

- Use VS Code's `l10n` API for all user-facing strings:
```typescript
vscode.l10n.t("extension.activating")
vscode.l10n.t("scan.error", { error: String(error) })
```

- String keys defined in `l10n/bundle.l10n.json`
- Supports 9 language bundles

---

*Convention analysis: 2026-03-24*
