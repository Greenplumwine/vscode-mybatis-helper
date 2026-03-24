# External Integrations

**Analysis Date:** 2026-03-24

## APIs & External Services

**MyBatis DTD:**
- Service: MyBatis official DTD repository
- URL: `http://mybatis.org/dtd/mybatis-3-mapper.dtd`
- Purpose: XML validation and tag hierarchy parsing
- Client: Custom `HttpClient` wrapper around axios
- Fallback: Built-in tag hierarchy for offline environments

**HTTP Client:**
- Library: axios ^1.13.6
- Features: Timeout (15s default), retry with exponential backoff (max 3 retries), request/response interceptors
- User-Agent: `MyBatis-Helper-VSCode-Extension/1.0.0`

## Data Storage

**Databases:**
- None - Extension operates on file system only

**File Storage:**
- Local filesystem via VS Code workspace API
- Index cache: Stored in workspace storage (`context.globalStorageUri`)
- DTD cache: Cached locally after download

**Caching:**
- In-memory mapping engine indices
- File-based index cache for incremental updates
- DTD file caching for offline use

## Authentication & Identity

**Auth Provider:**
- None required - Extension works with local files only

## Monitoring & Observability

**Error Tracking:**
- Custom logger utility (`src/utils/logger.ts`)
- VS Code output channel for extension logs
- Configurable log levels: `info`, `debug`

**Logs:**
- Output channel: "MyBatis Helper"
- Structured logging with context
- File change tracking and performance metrics

## CI/CD & Deployment

**Hosting:**
- VS Code Extension Marketplace
- Publisher: Greenplumwine

**CI Pipeline:**
- Not detected in repository
- Scripts available:
  - `vscode:prepublish` - Pre-publish compilation
  - `compile` - TypeScript compilation
  - `lint` - ESLint checking
  - `test` - VS Code extension testing

## VS Code Extension Dependencies

**Required Extensions:**
- `redhat.java` - Java language support extension
  - Used for: Java AST parsing, classpath resolution, symbol navigation
  - API access via `JavaExtensionAPI` utility

**Integrated APIs:**
- `vscode.languages` - Language features (CodeLens, Completion, Formatting)
- `vscode.workspace` - File system watchers, workspace state
- `vscode.commands` - Command registration and execution
- `vscode.window` - UI interactions (status bar, notifications, webview panels)
- `vscode.l10n` - Internationalization

## Environment Configuration

**Required Settings:**
- No mandatory environment variables
- All configuration via VS Code settings UI

**Key Configuration Categories:**
- `mybatis-helper.enableCodeLens` - Toggle CodeLens visibility
- `mybatis-helper.fileOpenMode` - File opening behavior
- `mybatis-helper.customXmlDirectories` - Additional XML search paths
- `mybatis-helper.sqlInterceptor.*` - SQL interception and history settings
- `mybatis-helper.formatting.sql.*` - SQL formatting preferences
- `mybatis-helper.completion.*` - IntelliSense completion settings

**Extension Dependencies (Runtime):**
- Node.js built-in modules: `fs/promises`, `path`, `os`, `crypto`, `worker_threads`, `events`
- VS Code Extension Host APIs

## Webhooks & Callbacks

**Incoming:**
- File system watchers for `.java` and `.xml` files
- VS Code configuration change events
- Java extension activation events

**Outgoing:**
- None - Extension is self-contained

## Network Requirements

**External Connections:**
- Optional: `http://mybatis.org/dtd/mybatis-3-mapper.dtd` (DTD download)
- Can operate fully offline with built-in DTD fallback

**Proxy Support:**
- Inherits VS Code proxy settings via axios

---

*Integration audit: 2026-03-24*
