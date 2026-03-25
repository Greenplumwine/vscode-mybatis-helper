# External Integrations

**Analysis Date:** 2026-03-24

## APIs & External Services

**Red Hat Java Extension (redhat.java):**
- Purpose: Hard dependency for Java language support
- Integration point: `src/utils/javaExtensionAPI.ts`
- API version: 1 (via `javaExt.exports.getAPI(1)`)
- Fallback: Graceful degradation to file-based search when unavailable
- Used for:
  - Classpath resolution
  - Java file navigation
  - Project structure detection

**HTTP/Network (axios):**
- Client: `src/utils/httpClient.ts`
- Features: Retry with exponential backoff, timeout handling
- User-Agent: `MyBatis-Helper-VSCode-Extension/1.0.0`
- Current usage: DTD resolution for XML validation
- Potential: External API integrations (not currently used)

## Data Storage

**Databases:**
- None - No persistent database storage

**File Storage:**
- Local filesystem only
- Index cache: `IndexCacheManager` at `src/features/mapping/indexCache.ts`
- Cache location: `context.globalStorageUri.fsPath`
- No eviction policy (unbounded growth noted in CLAUDE.md)

**Caching:**
- In-memory Maps for mapping engine (`FastMappingEngine`)
- Regex pattern caching (unbounded)
- DTD tag hierarchy caching
- All caches are in-memory, cleared on extension reload

## Authentication & Identity

**Auth Provider:**
- None - No authentication required

## Monitoring & Observability

**Error Tracking:**
- Custom Logger class: `src/utils/logger.ts`
- Output channel: `MyBatis Helper`
- Log levels: info, debug (configurable via `mybatis-helper.logOutputLevel`)

**Logs:**
- VS Code Output Channel for extension logs
- Debug console integration for SQL interception
- Terminal output monitoring for SQL logs

## CI/CD & Deployment

**Hosting:**
- VS Code Marketplace
- Publisher: `Greenplumwine`

**CI Pipeline:**
- None detected

**Build Process:**
- Local TypeScript compilation
- `vscode:prepublish` script runs compile

## External Tools

**javap (JDK tool):**
- Purpose: Parse `.class` files to extract @MapperScan annotations
- Integration: `src/features/mapping/classParsingWorker.ts`
- Execution: `execFileSync('javap', ['-v', classPath])`
- Security: Path sanitization via `sanitizeClassPath()` function
- Fallback: Graceful handling when javap unavailable

**Worker Threads:**
- File: `src/features/mapping/classParsingWorker.ts`
- Purpose: Non-blocking class file parsing
- Communication: Message passing with parentPort

## VS Code APIs Used

**Core APIs:**
- `vscode.extensions.getExtension()` - Java extension detection
- `vscode.workspace.findFiles()` - File discovery
- `vscode.workspace.openTextDocument()` - File reading
- `vscode.window.showTextDocument()` - File display
- `vscode.window.createStatusBarItem()` - Status bar
- `vscode.window.registerTreeDataProvider()` - SQL History view
- `vscode.workspace.createFileSystemWatcher()` - File change monitoring

**Language APIs:**
- `vscode.languages.registerCodeLensProvider()` - Java/XML CodeLens
- `vscode.languages.registerCompletionItemProvider()` - Smart completion
- `vscode.languages.registerDocumentFormattingEditProvider()` - XML formatting

**Command APIs:**
- `vscode.commands.registerCommand()` - All 14 extension commands
- `vscode.commands.executeCommand()` - Context variables, settings

**Localization:**
- `vscode.l10n.t()` - 9 language bundles in `l10n/` directory
- Bundles: de, es, fr, ja, ru, zh-cn, zh-tw, plus base bundle.l10n.json

## Environment Configuration

**Required Configuration:**
- None mandatory - Extension auto-configures

**Optional Settings (namespace: `mybatis-helper`):**
- `databaseType` - SQL dialect for formatting
- `sqlInterceptor.listenMode` - auto/debugConsole/terminal
- `nameMatchingRules` - Custom Java-XML matching patterns
- `pathPriority` - Directory priority for file lookup
- `formatting.sql.dialect` - SQL dialect (mysql, postgresql, oracle, sqlite, tsql, db2)
- `formatting.sql.keywordCase` - upper/lower/preserve
- `formatting.sql.maxLineLength` - 40-500 characters
- `completion.enableSmartCompletion` - Enable/disable smart completion

**Activation Context Variables:**
- `mybatis-helper.activated` - Extension active state
- `mybatis-helper.sqlInterceptorRunning` - Interceptor state

## Webhooks & Callbacks

**Incoming:**
- None

**Outgoing:**
- None

## Security Considerations

**Path Handling:**
- Extensive use of `.toLowerCase()` for path normalization
- Unicode NFC normalization for macOS compatibility
- Path traversal protection in class parsing worker

**Command Execution:**
- `execFileSync` with array arguments (not shell strings)
- Path sanitization before javap execution
- Timeout and buffer limits on external processes

---

*Integration audit: 2026-03-24*
