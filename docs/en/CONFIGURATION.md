# MyBatis Helper - Configuration Guide

Complete reference for all MyBatis Helper configuration options.

---

## Table of Contents

1. [Quick Reference](#quick-reference)
2. [Database Configuration](#database-configuration)
3. [SQL Interceptor Configuration](#sql-interceptor-configuration)
4. [Navigation Configuration](#navigation-configuration)
5. [Formatting Configuration](#formatting-configuration)
6. [Completion Configuration](#completion-configuration)
7. [Advanced Configuration](#advanced-configuration)
8. [Configuration Examples](#configuration-examples)

---

## Quick Reference

| Configuration | Type | Default | Description |
|--------------|------|---------|-------------|
| `databaseType` | string | `mysql` | SQL dialect for formatting |
| `sqlInterceptor.listenMode` | string | `auto` | Where to listen for SQL logs |
| `sqlInterceptor.autoStart` | boolean | `true` | Auto-start SQL interception |
| `enableCodeLens` | boolean | `true` | Show "Jump to XML" hints |
| `customXmlDirectories` | array | `[]` | Additional XML search paths |
| `nameMatchingRules` | array | `[...]` | Custom file matching patterns |
| `pathPriority` | object | `{...}` | Directory priority settings |

---

## Database Configuration

### `mybatis-helper.databaseType`

Sets the SQL dialect for syntax highlighting and formatting.

**Type:** `string`

**Default:** `"mysql"`

**Options:**
- `mysql` - MySQL / MariaDB
- `postgresql` - PostgreSQL
- `oracle` - Oracle Database
- `sqlserver` - Microsoft SQL Server
- `sqlite` - SQLite
- `db2` - IBM DB2
- `h2` - H2 Database

**Example:**
```json
{
  "mybatis-helper.databaseType": "postgresql"
}
```

---

## SQL Interceptor Configuration

### `mybatis-helper.sqlInterceptor.listenMode`

Controls where the extension listens for MyBatis SQL logs.

**Type:** `string`

**Default:** `"auto"`

**Options:**

| Value | Description |
|-------|-------------|
| `auto` | Automatically detect based on Java debug configuration |
| `debugConsole` | Listen to Debug Console only |
| `terminal` | Listen to Terminal only |

**Example:**
```json
{
  "mybatis-helper.sqlInterceptor.listenMode": "auto"
}
```

**Auto Mode Logic:**
- Reads `java.debug.settings.console` setting
- `internalConsole` → Listen to Debug Console
- `integratedTerminal` → Listen to Terminal
- `externalTerminal` → Shows warning (not supported)

---

### `mybatis-helper.sqlInterceptor.autoStart`

Automatically start SQL interception when extension activates.

**Type:** `boolean`

**Default:** `true`

**Example:**
```json
{
  "mybatis-helper.sqlInterceptor.autoStart": true
}
```

---

### `mybatis-helper.sqlInterceptor.maxHistorySize`

Maximum number of SQL statements to keep in history.

**Type:** `number`

**Default:** `500`

**Range:** `10` - `1000`

**Example:**
```json
{
  "mybatis-helper.sqlInterceptor.maxHistorySize": 500
}
```

---

### `mybatis-helper.sqlInterceptor.autoScrollBehavior`

Controls auto-scroll behavior when new SQL is added.

**Type:** `string`

**Default:** `"onlyWhenNotInteracting"`

**Options:**

| Value | Description |
|-------|-------------|
| `always` | Always scroll to latest SQL |
| `onlyWhenNotInteracting` | Only scroll when not interacting with list |
| `never` | Never auto-scroll |

**Example:**
```json
{
  "mybatis-helper.sqlInterceptor.autoScrollBehavior": "onlyWhenNotInteracting"
}
```

---

### `mybatis-helper.sqlInterceptor.builtinRules`

Enable/disable built-in SQL parsing rules.

**Type:** `object`

**Default:**
```json
{
  "mybatis-standard": true,
  "mybatis-debug": true
}
```

**Example:**
```json
{
  "mybatis-helper.sqlInterceptor.builtinRules": {
    "mybatis-standard": true,
    "mybatis-debug": false
  }
}
```

---

### `mybatis-helper.sqlInterceptor.customRules`

Add custom SQL parsing rules for non-standard log formats.

**Type:** `array`

**Default:** `[]`

**Rule Properties:**

| Property | Required | Description |
|----------|----------|-------------|
| `name` | Yes | Unique rule name |
| `enabled` | Yes | Whether rule is active |
| `description` | No | Human-readable description |
| `lineMatchRegex` | Yes | Regex to identify relevant log lines |
| `sqlExtractRegex` | Yes | Regex to extract SQL (one capture group) |
| `parametersExtractRegex` | No | Regex to extract parameter string |
| `executionTimeExtractRegex` | No | Regex to extract execution time |
| `paramParseRegex` | No | Regex to parse individual parameters |

**Example:**
```json
{
  "mybatis-helper.sqlInterceptor.customRules": [
    {
      "name": "company-format",
      "enabled": true,
      "description": "Company internal log format",
      "lineMatchRegex": "(EXEC_SQL|BIND_PARAMS)",
      "sqlExtractRegex": "EXEC_SQL\\s*(.+)",
      "parametersExtractRegex": "BIND_PARAMS\\s*(.+)",
      "executionTimeExtractRegex": "COST\\s*(\\d+)\\s*ms",
      "paramParseRegex": "([^|]+)\\|([^,]+)"
    }
  ]
}
```

---

## Navigation Configuration

### `mybatis-helper.enableCodeLens`

Show "Jump to XML" hints above Java methods.

**Type:** `boolean`

**Default:** `true`

**Example:**
```json
{
  "mybatis-helper.enableCodeLens": true
}
```

---

### `mybatis-helper.fileOpenMode`

Controls how files are opened during navigation.

**Type:** `string`

**Default:** `"useExisting"`

**Options:**

| Value | Description |
|-------|-------------|
| `useExisting` | Use already opened editor if available |
| `noSplit` | Never split editor window |
| `alwaysSplit` | Always open in split window |

**Example:**
```json
{
  "mybatis-helper.fileOpenMode": "useExisting"
}
```

---

### `mybatis-helper.customXmlDirectories`

Additional directories to search for XML mapper files.

**Type:** `array` of `string`

**Default:** `[]`

**Example:**
```json
{
  "mybatis-helper.customXmlDirectories": [
    "src/main/resources/custom-mappers",
    "config/mybatis",
    "database/mappings"
  ]
}
```

---

### `mybatis-helper.nameMatchingRules`

Custom rules for matching Java files to XML files.

**Type:** `array`

**Default:**
```json
[
  {
    "name": "Default Mapper",
    "enabled": true,
    "javaPattern": "*Mapper",
    "xmlPattern": "${javaName}",
    "description": "Match UserMapper.java with UserMapper.xml"
  },
  {
    "name": "Default Dao",
    "enabled": true,
    "javaPattern": "*Dao",
    "xmlPattern": "${javaName}",
    "description": "Match UserDao.java with UserDao.xml"
  }
]
```

**Rule Properties:**

| Property | Description |
|----------|-------------|
| `name` | Rule identifier |
| `enabled` | Whether rule is active |
| `javaPattern` | Pattern for Java filename (`*` = wildcard) |
| `xmlPattern` | Pattern for XML filename |
| `description` | Human-readable description |

**Pattern Variables:**
- `${javaName}` - Java filename without extension and suffix

**Example:**
```json
{
  "mybatis-helper.nameMatchingRules": [
    {
      "name": "Repository Pattern",
      "enabled": true,
      "javaPattern": "*Repository",
      "xmlPattern": "${javaName}Mapper",
      "description": "UserRepository.java → UserRepositoryMapper.xml"
    },
    {
      "name": "Service Pattern",
      "enabled": false,
      "javaPattern": "*Service",
      "xmlPattern": "${javaName}Dao",
      "description": "UserService.java → UserServiceDao.xml"
    }
  ]
}
```

---

### `mybatis-helper.ignoreSuffixes`

Suffixes to remove when matching filenames.

**Type:** `array` of `string`

**Default:** `["Mapper", "Dao"]`

**Example:**
```json
{
  "mybatis-helper.ignoreSuffixes": ["Mapper", "Dao", "Repository"]
}
```

---

### `mybatis-helper.pathPriority`

Configure directory priority for file lookup.

**Type:** `object`

**Default:**
```json
{
  "enabled": true,
  "priorityDirectories": ["/src/", "/main/", "/resources/"],
  "excludeDirectories": ["/build/", "/target/", "/out/", "/.git/"]
}
```

**Properties:**

| Property | Type | Description |
|----------|------|-------------|
| `enabled` | `boolean` | Enable path priority |
| `priorityDirectories` | `array` | Directories to prioritize |
| `excludeDirectories` | `array` | Directories to exclude |

**Example:**
```json
{
  "mybatis-helper.pathPriority": {
    "enabled": true,
    "priorityDirectories": [
      "/src/main/java/",
      "/src/main/resources/mappers/"
    ],
    "excludeDirectories": [
      "/build/",
      "/target/",
      "/out/",
      "/.git/",
      "/node_modules/"
    ]
  }
}
```

---

## Formatting Configuration

### `mybatis-helper.formatting.sql.dialect`

SQL dialect for formatting.

**Type:** `string`

**Default:** `"mysql"`

**Options:** `mysql`, `postgresql`, `oracle`, `sqlite`, `tsql`, `db2`

**Example:**
```json
{
  "mybatis-helper.formatting.sql.dialect": "postgresql"
}
```

---

### `mybatis-helper.formatting.sql.keywordCase`

Case for SQL keywords.

**Type:** `string`

**Default:** `"upper"`

**Options:**
- `upper` - UPPERCASE
- `lower` - lowercase
- `preserve` - Keep original case

**Example:**
```json
{
  "mybatis-helper.formatting.sql.keywordCase": "upper"
}
```

---

### `mybatis-helper.formatting.sql.maxLineLength`

Maximum line length for formatted SQL.

**Type:** `number`

**Default:** `120`

**Range:** `40` - `500`

**Example:**
```json
{
  "mybatis-helper.formatting.sql.maxLineLength": 120
}
```

---

## Completion Configuration

### `mybatis-helper.completion.enableSmartCompletion`

Enable intelligent SQL completion in XML files.

**Type:** `boolean`

**Default:** `true`

**Example:**
```json
{
  "mybatis-helper.completion.enableSmartCompletion": true
}
```

When enabled, typing `#{` or `${` in XML files will show parameter suggestions based on the Java method signature.

---

## Advanced Configuration

### `mybatis-helper.logOutputLevel`

Extension logging level.

**Type:** `string`

**Default:** `"info"`

**Options:** `info`, `debug`

**Example:**
```json
{
  "mybatis-helper.logOutputLevel": "debug"
}
```

---

## Configuration Examples

### Minimal Configuration

```json
{
  "mybatis-helper.databaseType": "mysql"
}
```

### Standard Spring Boot Project

```json
{
  "mybatis-helper.databaseType": "mysql",
  "mybatis-helper.sqlInterceptor.listenMode": "auto",
  "mybatis-helper.sqlInterceptor.autoStart": true,
  "mybatis-helper.enableCodeLens": true,
  "mybatis-helper.customXmlDirectories": [
    "src/main/resources/mapper"
  ]
}
```

### Large Enterprise Project

```json
{
  "mybatis-helper.databaseType": "oracle",
  "mybatis-helper.sqlInterceptor.listenMode": "debugConsole",
  "mybatis-helper.sqlInterceptor.maxHistorySize": 1000,
  "mybatis-helper.enableCodeLens": true,
  "mybatis-helper.customXmlDirectories": [
    "core/src/main/resources/mappers",
    "api/src/main/resources/mappers"
  ],
  "mybatis-helper.pathPriority": {
    "enabled": true,
    "priorityDirectories": [
      "/src/main/java/",
      "/src/main/resources/"
    ],
    "excludeDirectories": [
      "/build/",
      "/target/",
      "/node_modules/",
      "/.gradle/"
    ]
  },
  "mybatis-helper.nameMatchingRules": [
    {
      "name": "Core Mapper",
      "enabled": true,
      "javaPattern": "*Mapper",
      "xmlPattern": "${javaName}",
      "description": "Core module mappers"
    },
    {
      "name": "Repository Pattern",
      "enabled": true,
      "javaPattern": "*Repository",
      "xmlPattern": "${javaName}Mapper",
      "description": "Repository to Mapper XML"
    }
  ]
}
```

### Custom Log Format Project

```json
{
  "mybatis-helper.databaseType": "postgresql",
  "mybatis-helper.sqlInterceptor.listenMode": "terminal",
  "mybatis-helper.sqlInterceptor.customRules": [
    {
      "name": "company-format",
      "enabled": true,
      "description": "Company internal format",
      "lineMatchRegex": "SQL_EXEC|PARAM_BIND",
      "sqlExtractRegex": "SQL_EXEC\\s*(.+)",
      "parametersExtractRegex": "PARAM_BIND\\s*(.+)",
      "paramParseRegex": "([^,]+)\\(([^)]+)\\)"
    }
  ]
}
```

---

## Settings Location

Configuration can be set at different levels:

### User Settings (Global)

Applies to all VS Code workspaces:
- **File:** `~/.vscode/settings.json`
- **UI:** `Ctrl+,` → Search "MyBatis Helper"

### Workspace Settings

Applies to current workspace only:
- **File:** `.vscode/settings.json` in project root
- **UI:** `Ctrl+,` → Workspace tab → Search "MyBatis Helper"

### Workspace Settings Priority

Workspace settings override user settings.

---

*Last updated: 2026-03-25*
