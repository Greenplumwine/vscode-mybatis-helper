# Architecture

**Analysis Date:** 2026-03-25

## Pattern Overview

**Overall:** Layered architecture with singleton services and event-driven communication

**Key Characteristics:**
- Singleton pattern for all core services (FastMappingEngine, UnifiedNavigationService, SQLInterceptorService)
- EventEmitter-based communication between components
- Dual scanner system with runtime selection (FastScanner vs EnterpriseScanner)
- Worker thread system for CPU-intensive operations
- Provider pattern for VS Code extension points

## Layers

**Extension Layer:**
- Purpose: VS Code lifecycle management and feature coordination
- Location: `src/extension.ts`
- Contains: Activation logic, command registration, provider registration, file watching
- Depends on: All feature modules, services
- Used by: VS Code host

**Feature Layer:**
- Purpose: Core business logic organized by feature domain
- Location: `src/features/`
- Contains: Mapping, completion, formatting, SQL interception
- Depends on: Services layer, VS Code API
- Used by: Extension layer, VS Code UI

**Service Layer:**
- Purpose: Shared business logic and parsing utilities
- Location: `src/services/`
- Contains: XML parsing, Java method parsing, DTD resolution, language detection, templates
- Depends on: Types, utilities
- Used by: Feature layer

**Utility Layer:**
- Purpose: Cross-cutting concerns and helpers
- Location: `src/utils/`
- Contains: Logger, Java extension API wrapper, performance utilities, string utilities
- Depends on: VS Code API
- Used by: All layers

**Types Layer:**
- Purpose: Shared TypeScript type definitions
- Location: `src/types/`
- Contains: Domain models, interfaces, enums
- Used by: All layers

## Data Flow

**Extension Activation Flow:**

1. `activate()` in `src/extension.ts` called by VS Code
2. Initialize base services (LanguageDetector, TagHierarchyResolver, MyBatisXmlParser)
3. Wait for `redhat.java` extension activation
4. Initialize JavaExtensionAPI
5. Detect project type (standard vs multi-module vs microservice)
6. Initialize appropriate scanner (FastScanner or EnterpriseScanner)
7. Initialize FastMappingEngine and UnifiedNavigationService
8. Register CodeLens providers (FastCodeLensProvider, XmlCodeLensProvider)
9. Register command handlers
10. Start file watching for incremental updates

**Java to XML Navigation Flow:**

1. User triggers jump from Java file
2. `UnifiedNavigationService.navigateJavaToXml()` called
3. Lookup mapping in `FastMappingEngine` via `getByJavaPath()` - O(1)
4. If no mapping, dynamically parse Java file and search for XML
5. Open XML file and navigate to method position
6. Position determined by XML statement location stored in mapping

**XML to Java Navigation Flow:**

1. User triggers jump from XML file
2. `UnifiedNavigationService.navigateXmlToJava()` called
3. Parse XML to extract namespace
4. Lookup mapping in `FastMappingEngine` via `getByNamespace()` - O(1)
5. If no mapping, search filesystem for Java file by namespace
6. Use VS Code Java symbol API to find exact method position
7. Open Java file and reveal method

**SQL Interception Flow:**

1. `SQLInterceptorService` registers DebugAdapterTrackerFactory
2. Debug session starts, tracker receives output events
3. Log lines matched against configured rules (builtin + custom)
4. SQL, parameters, and execution time extracted via regex
5. `SQLParser` fills parameters into SQL template
6. Complete query stored in history array
7. TreeView refreshed via event emission

**Incremental Update Flow:**

1. FileSystemWatcher detects file change
2. 300ms debounce timer fires
3. Scanner rescans single file (rescanJavaFile/rescanXmlFile)
4. FastMappingEngine updates indexes
5. CodeLens providers refreshed via events

## Key Abstractions

**FastMappingEngine:**
- Purpose: O(1) bidirectional lookup between Java and XML mappers
- Location: `src/features/mapping/fastMappingEngine.ts`
- Pattern: Singleton with multiple Map indexes
- Indexes:
  - `namespaceIndex`: namespace -> MappingIndex
  - `javaPathIndex`: normalized path -> namespace
  - `xmlPathIndex`: normalized path -> namespace
  - `classNameIndex`: simpleClassName -> Set<namespace>
  - `packageIndex`: packagePrefix -> Set<namespace>

**UnifiedNavigationService:**
- Purpose: Coordinate navigation between Java and XML with fallback strategies
- Location: `src/features/mapping/unifiedNavigationService.ts`
- Pattern: Singleton with dynamic lookup fallback
- Strategies:
  - Index lookup (O(1))
  - Dynamic file parsing
  - Filesystem search by namespace
  - Filesystem search by class name

**SQLInterceptorService:**
- Purpose: Capture and parse SQL from debug console and terminal
- Location: `src/features/sql-interceptor/sqlInterceptorService.ts`
- Pattern: Singleton with event emitters and regex rule engine
- Listens to: Debug adapter messages, terminal shell execution
- Emits: onSQLRecorded, onHistoryCleared, onStateChanged

**Scanner Architecture:**
- FastScanner: Standard projects, file-based scanning with parallel batch processing
- EnterpriseScanner: Large/monorepo projects with 6-layer scanning (source -> submodules -> jars -> classes -> runtime -> env)
- Selection based on project type detection (multi-module, microservice markers, jar dependencies)

## Entry Points

**Extension Entry:**
- Location: `src/extension.ts`
- Triggers: Workspace contains `pom.xml` or `build.gradle`
- Responsibilities: Service initialization, command registration, provider registration

**Command Handlers:**
- Location: `src/extension.ts` lines 743-1042
- Commands: jumpToXml, jumpToMapper, refreshMappings, showSqlHistory, generateXmlMethod, createMapperXml, etc.

**CodeLens Providers:**
- FastCodeLensProvider: `src/features/mapping/fastCodeLensProvider.ts` - Java files
- XmlCodeLensProvider: `src/features/mapping/xmlCodeLensProvider.ts` - XML files

**Completion Providers:**
- UnifiedCompletionProvider: `src/features/completion/unifiedCompletionProvider.ts` - Parameter completion (#, $, {)
- TagCompletionProvider: `src/features/completion/tagCompletionProvider.ts` - XML tag completion (<, space)

## Worker Thread System

**Purpose:** Parse compiled `.class` files without blocking main thread

**Worker File:** `src/features/mapping/classParsingWorker.ts`

**Operation:**
1. EnterpriseScanner identifies class files in target directories
2. Spawns Worker thread with file list
3. Worker uses `javap -v` to extract bytecode
4. Parses `@MapperScan` annotations from bytecode
5. Returns config array to main thread

**Security:**
- Path sanitization via `sanitizeClassPath()`
- Command injection prevention via `execFileSync` with array args
- Extension validation (.class only)

## Error Handling

**Strategy:** Graceful degradation with logging

**Patterns:**
- Try-catch blocks with logger.error() for all async operations
- Fallback to alternative strategies (index -> dynamic parse -> filesystem search)
- User-facing messages via vscode.window.showWarningMessage/showErrorMessage
- Non-blocking error handling for scanning (continues with partial results)

## Cross-Cutting Concerns

**Logging:**
- Centralized Logger singleton: `src/utils/logger.ts`
- Configurable levels (info/debug)
- All major operations logged with timing info

**Configuration:**
- VS Code settings namespace: `mybatis-helper`
- Key configs: databaseType, sqlInterceptor.listenMode, nameMatchingRules, pathPriority
- Hot reload via onDidChangeConfiguration

**Internationalization:**
- 9 language bundles in `l10n/`
- Keys defined in `l10n/bundle.l10n.json`
- Usage: `vscode.l10n.t("key")`

---

*Architecture analysis: 2026-03-25*
