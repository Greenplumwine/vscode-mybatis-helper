# Architecture

**Analysis Date:** 2026-03-24

## Pattern Overview

**Overall:** VS Code Extension Architecture with Plugin Pattern

**Key Characteristics:**
- Event-driven architecture using VS Code Extension API
- Singleton pattern for core services (FastMappingEngine, FastScanner, etc.)
- Strategy pattern for completion providers
- Pipeline pattern for formatting
- Layered scanning strategy for enterprise projects

## Layers

**Extension Entry Layer:**
- Purpose: Plugin activation, lifecycle management, command registration
- Location: `src/extension.ts`
- Contains: Activation handlers, command registrations, provider registrations
- Depends on: All feature modules, services
- Used by: VS Code host

**Feature Layer:**
- Purpose: Core functionality implementation organized by feature
- Location: `src/features/`
- Contains: Mapping, completion, formatting, SQL interception
- Depends on: Services layer, Utils layer
- Used by: Extension entry layer

**Services Layer:**
- Purpose: Shared business logic and parsing services
- Location: `src/services/`
- Contains: Language detection, XML parsing, Java method parsing, template generation
- Depends on: Utils layer
- Used by: Feature layer

**Utils Layer:**
- Purpose: Cross-cutting utilities and helpers
- Location: `src/utils/`
- Contains: Logger, performance utilities, HTTP client, text processing
- Depends on: VS Code API
- Used by: All layers

**Types Layer:**
- Purpose: Shared TypeScript type definitions
- Location: `src/types/`
- Contains: Core interfaces (SQLQuery, DatabaseType, PluginConfig)
- Depends on: None
- Used by: All layers

## Data Flow

**Java-to-XML Navigation Flow:**

1. User triggers jump command from Java file
2. `UnifiedNavigationService` receives request with document and position
3. Navigation service queries `FastMappingEngine` for namespace mapping
4. If mapping exists, resolves XML file path and method location
5. Opens XML file at specific SQL ID location

**XML-to-Java Navigation Flow:**

1. User triggers jump command from XML file
2. `UnifiedNavigationService` parses XML namespace and SQL ID
3. Queries `FastMappingEngine` for corresponding Java Mapper class
4. Resolves Java file path and method position
5. Opens Java file at method declaration

**Mapping Build Flow:**

1. `FastScanner` or `EnterpriseScanner` scans workspace files
2. XML files parsed by `MyBatisXmlParser` to extract namespace and SQL IDs
3. Java files analyzed via `EnhancedJavaAPI` to extract method signatures
4. `FastMappingEngine` builds bidirectional indexes (namespace -> paths, paths -> namespace)
5. Event emitters notify CodeLens providers to refresh

**SQL Interception Flow:**

1. `SQLInterceptorService` listens to debug console or terminal output
2. Parses MyBatis SQL logs using configurable regex patterns
3. Extracts SQL statements, parameters, execution times
4. Stores in memory history via `SQLHistoryTreeProvider`
5. Displays in custom TreeView panel

## State Management

**Mapping State:**
- Managed by: `FastMappingEngine` (singleton)
- Storage: In-memory Maps (namespaceIndex, javaPathIndex, xmlPathIndex)
- Persistence: None (rebuilt on activation)
- Updates: Incremental via file watchers

**Configuration State:**
- Managed by: VS Code workspace configuration
- Storage: VS Code settings.json
- Access: Via `vscode.workspace.getConfiguration()`
- Key configs: `mybatis-helper.*` namespace

**SQL History State:**
- Managed by: `SQLInterceptorService` (singleton)
- Storage: In-memory array with configurable max size
- Persistence: None (cleared on extension reload)

## Key Abstractions

**FastMappingEngine:**
- Purpose: O(1) lookup for Java-XML mappings
- Location: `src/features/mapping/fastMappingEngine.ts`
- Pattern: Singleton with EventEmitter
- Indexes: namespace -> mapping, javaPath -> namespace, xmlPath -> namespace

**UnifiedNavigationService:**
- Purpose: Bidirectional navigation between Java and XML
- Location: `src/features/mapping/unifiedNavigationService.ts`
- Pattern: Singleton
- Dependencies: FastMappingEngine, XmlLocationResolver

**UnifiedCompletionProvider:**
- Purpose: Context-aware code completion in XML files
- Location: `src/features/completion/unifiedCompletionProvider.ts`
- Pattern: Strategy pattern with multiple completion strategies
- Strategies: PlaceholderStrategy, PropertyStrategy, TypeStrategy, ForeachVariableStrategy

**NestedFormattingProvider:**
- Purpose: Format MyBatis XML with SQL inside
- Location: `src/features/formatting/nestedFormattingProvider.ts`
- Pattern: Pipeline pattern
- Pipeline steps: SQL extraction, SQL formatting, XML formatting, indent adjustment

## Entry Points

**Extension Activation:**
- Location: `src/extension.ts` - `activate()` function
- Triggers: Workspace contains pom.xml or build.gradle
- Responsibilities: Initialize services, register commands/providers, detect project type

**Command Handlers:**
- Location: `src/extension.ts` and `src/commands/`
- Commands: `mybatis-helper.jumpToXml`, `mybatis-helper.jumpToMapper`, `mybatis-helper.generateXmlMethod`, etc.
- Registration: Via `vscode.commands.registerCommand()`

**Language Providers:**
- CodeLens: `FastCodeLensProvider`, `XmlCodeLensProvider`
- Completion: `UnifiedCompletionProvider`, `TagCompletionProvider`
- Formatting: `NestedFormattingProvider`
- Registration: Via `vscode.languages.register*Provider()`

## Error Handling

**Strategy:** Centralized logging with user-facing messages

**Patterns:**
- All errors logged via `Logger` utility
- User notifications via `vscode.window.showErrorMessage()`
- Graceful degradation (e.g., fallback scanners if primary fails)
- Try-catch blocks at command handler level

## Cross-Cutting Concerns

**Logging:**
- Framework: Custom `Logger` class (`src/utils/logger.ts`)
- Levels: debug, info, warn, error
- Output: VS Code OutputChannel

**Internationalization:**
- Framework: VS Code l10n API
- Location: `l10n/bundle.l10n.*.json`
- Usage: `vscode.l10n.t("key")`

**Performance:**
- Worker threads for class parsing (`classParsingWorker.ts`)
- Debounced file watching (300ms delay)
- Parallel scanning with configurable limits
- Index caching for enterprise projects

---

*Architecture analysis: 2026-03-24*
