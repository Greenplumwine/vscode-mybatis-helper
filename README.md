![mybatis](static/icon/mybatis-helper-icon.png)

# MyBatis Helper

[中文文档](README_CN.md) | English Documentation

A powerful VSCode extension that provides comprehensive assistance for MyBatis developers, significantly improving development efficiency.

## Project Overview

MyBatis Helper is a VSCode extension designed specifically for MyBatis developers to enhance productivity in MyBatis projects. The extension provides features like console log interception, SQL conversion, and quick file navigation to help developers build and debug MyBatis applications more efficiently.

## Features

### 1. SQL Log Interception and Conversion

Real-time interception of MyBatis SQL statements from application logs, automatic parameter parsing, and generation of executable complete SQL.

**Core Features:**
- 🎯 **Smart Listening**: Automatically recognizes MyBatis logs from Debug Console or Terminal output
- 🔍 **Parameter Parsing**: Replaces `?` placeholders with actual parameter values to generate directly executable SQL
- ⚡ **Real-time Display**: Displays captured SQL in the sidebar SQL History view in real-time
- 📊 **Execution Time**: Automatically extracts and displays SQL execution duration
- 🎨 **Syntax Highlighting**: Supports SQL syntax highlighting and formatting for multiple databases
- 📋 **One-click Copy**: Supports copying formatted SQL or SQL with parameter comments
- 🕐 **History Records**: Automatically saves the last 500 SQL statements (configurable)
- ⏸️ **Pause Anytime**: Can pause/resume SQL interception at any time for convenient history review
- 🌍 **Multi-language Support**: SQL detail panel supports internationalized display

**Supported Databases:**
- MySQL / MariaDB
- PostgreSQL
- Oracle
- SQL Server
- SQLite
- DB2
- H2
- Dameng / Kingbase (supported through universal rules)

### 2. Quick File Navigation

- One-click bidirectional jump between Mapper interfaces and XML files without manual file searching
- **Smart Navigation Enhancement**: Enhanced mapping algorithm and intelligent recognition, significantly improving accuracy and speed of file navigation
- Smart project structure scanning, automatically establishes mapping between Mapper interfaces and XML files
- Supports standard Maven/Gradle project structures and custom project layouts
- Optimized mapping algorithm for large complex projects, quickly locates target files
- Supports searching for corresponding Mapper interfaces and XML files by fully qualified class name
- Automatic mapping cache refresh, ensures correct navigation even when file locations change
- On-demand activation: Only processes mapping logic when a Java project is detected
- Precise file lookup: Replaces full folder scanning with targeted file lookup for specific files, improving navigation efficiency
- Navigation throttling: Prevents performance issues caused by frequent navigation operations
- XML namespace validation: Ensures XML files are correctly associated with Mapper interfaces
- Method name extraction and position locating: Precisely locates corresponding method positions
- **Precise Method Navigation**: Supports precise positioning to specific methods during navigation, not just opening files
- **Refactored Navigation Logic**: Adopts independent navigator pattern (JavaToXmlNavigator and XmlToJavaNavigator), improving code maintainability
- **Priority Use of Java Plugin API**: Prioritizes APIs provided by Red Hat Java plugin for precise navigation, improving navigation accuracy

### 3. CodeLens Support

- **Mapper Interface Only Support**: Optimized CodeLens implementation, only displays in Java Mapper interface files
- **CodeLens in Java Files**: Displays "Jump to XML" CodeLens hints above methods in Java Mapper interfaces
- **Smart Display Control**: CodeLens only displays when valid mapping relationships are detected and methods exist in corresponding XML, avoiding invalid jump hints
- **Click to Jump**: Users can directly execute jump operations by clicking CodeLens hints, without using shortcuts or right-click menus
- Provides configuration options allowing users to enable or disable CodeLens functionality, enabled by default

### 4. Internationalization Support

- Supports multi-language interface, automatically switches display language based on VSCode language settings (supports English and Chinese)

### 5. SQL Input IntelliSense

- Automatically provides completion suggestions based on Java Mapper interface method parameters when typing `#{` or `${}` in Mapper XML files
- Supports completion hints for basic types, custom object properties, and collection types
- Provides context-aware completion suggestions, automatically filters parameters based on current method
- Supports nested object property completion, such as `#{user.name}`
- Completion items include parameter name and type information

### 6. User-friendly Interface

- Clean and clear command menu, all functions at a glance
- Carefully designed shortcut system, efficient and convenient operations
- Deep integration with editor right-click menu, within easy reach
- Real-time status feedback, operation results visible immediately
- User experience conforming to VSCode design specifications, seamlessly integrated into the development environment
- SQL result visualization: Provides Webview panel for displaying formatted and highlighted SQL results
- Webview interactive features: Includes copy button, refresh button, search functionality, etc.
- Random nonce generation: Provides security assurance for Webview

### 7. Plugin Log System

- Provides four log levels: DEBUG/INFO/WARN/ERROR
- Logs output to dedicated "MyBatis Helper" output channel
- Supports dynamic log level adjustment
- Detailed recording of plugin runtime status and error information
- Facilitates developer debugging and troubleshooting

## Installation

### Method 1: Install from VSCode Extension Marketplace

1. Open the Extensions panel in VSCode (Shortcut: `Ctrl+Shift+X` or `Command+Shift+X`)
2. Enter "MyBatis Helper" in the search box
3. Find the extension and click the "Install" button
4. After installation completes, the extension will automatically activate without restarting VSCode

### Method 2: Manual Installation

1. Download the latest release from GitHub repository
2. Execute the "Install from VSIX..." command in VSCode
3. Select the downloaded VSIX file
4. Restart VSCode after installation completes

## User Guide

### 1. SQL Log Interception Feature Details

#### Quick Start

1. **Start SQL Interception**
   - The extension automatically starts SQL interception by default (can be disabled via configuration)
   - Click the MyBatis Helper icon in the left activity bar to open the SQL History view
   - If not automatically started, click the ▶️ button in the toolbar to manually start

2. **Run Your Application**
   - Start your Java/MyBatis application in VSCode (Debug or Run mode)
   - Ensure MyBatis log level is DEBUG (need to see `Preparing:` and `Parameters:` in logs)

3. **View SQL**
   - SQL will automatically display in the left "SQL History" view
   - Click any SQL item to view the detail panel (formatted SQL, raw SQL, parameter list, etc.)

#### Interface Description

**SQL History Sidebar:**
```
┌─────────────────────────────────┐
│ 🔄  ⏸️  🗑️                      │  ← Toolbar: Refresh / Pause/Resume / Clear
├─────────────────────────────────┤
│ ⚡ Just now (3 params)          │  ← SQL item: execution time, parameter count
│ SELECT * FROM user...           │     Hover to show full SQL preview
│                                 │
│ 📋 2 min ago (0 params)         │
│ UPDATE user SET name...         │
└─────────────────────────────────┘
```

**SQL Detail Panel:**
- **Formatted SQL**: Syntax highlighted, formatted executable SQL
- **Raw SQL**: Raw SQL with `?` placeholders
- **Parameter List**: Displays each parameter's index, value, and type
- **Copy Buttons**:
  - Copy formatted SQL
  - Copy SQL with parameter comments (useful for troubleshooting)

#### Toolbar Buttons

| Icon | Function | Description |
|------|----------|-------------|
| 🔄 | Refresh | Refresh SQL history list |
| ⏸️ | Pause | Pause SQL interception (no longer capture new SQL) |
| ▶️ | Resume | Resume SQL interception |
| 🗑️ | Clear | Clear all SQL history records |

#### Listen Mode Configuration

Choose the appropriate listen mode based on how your Java application runs:

```json
{
  "mybatis-helper.sqlInterceptor.listenMode": "auto"
}
```

| Mode | Description | Use Case |
|------|-------------|----------|
| `auto` | **Default**, automatically detects Java Debug configuration | Recommended |
| `debugConsole` | Force listen to Debug Console | When running Java with `internalConsole` |
| `terminal` | Force listen to Terminal | When running Java with `integratedTerminal` |

**Auto Mode Detection Logic:**
- Reads `java.debug.settings.console` configuration
- `internalConsole` → Listen to Debug Console
- `integratedTerminal` → Listen to Terminal
- `externalTerminal` → Shows not supported (external terminal cannot be monitored)

#### Supported Log Formats

The extension has two built-in rules that automatically recognize logs in the following formats:

**Standard MyBatis Format:**
```
==>  Preparing: SELECT * FROM user WHERE id = ? AND name = ?
==> Parameters: 123(Integer), admin(String)
<==      Total: 1
```

**With Timestamp Format:**
```
2024-01-15 10:30:25.123 [main] DEBUG c.m.UserMapper.selectById - ==>  Preparing: SELECT * FROM user WHERE id = ?
2024-01-15 10:30:25.124 [main] DEBUG c.m.UserMapper.selectById - ==> Parameters: 123(Integer)
```

**Chinese Bracket Format (Compatible):**
```
==> Parameters: admin（String）, 25(Integer)
```

#### Complete Configuration Options

```json
{
  "mybatis-helper.sqlInterceptor.listenMode": "auto",
  "mybatis-helper.sqlInterceptor.autoStart": true,
  "mybatis-helper.sqlInterceptor.maxHistorySize": 500,
  "mybatis-helper.sqlInterceptor.autoScrollBehavior": "onlyWhenNotInteracting",
  "mybatis-helper.sqlInterceptor.builtinRules": {
    "mybatis-universal": true,
    "mybatis-sqlsession": true
  }
}
```

**Configuration Description:**

| Configuration Item | Type | Default Value | Description |
|-------------------|------|---------------|-------------|
| `listenMode` | string | `auto` | Listen mode: `auto`/`debugConsole`/`terminal` |
| `autoStart` | boolean | `true` | Whether to automatically start SQL interception when extension activates |
| `maxHistorySize` | number | `500` | Maximum number of SQL history records (10-1000) |
| `autoScrollBehavior` | string | `onlyWhenNotInteracting` | Auto-scroll behavior: `always`/`onlyWhenNotInteracting`/`never` |
| `builtinRules` | object | - | Built-in rule switches |

#### Custom Log Parsing Rules

If built-in rules cannot match your log format, you can add custom rules:

```json
{
  "mybatis-helper.sqlInterceptor.customRules": [
    {
      "name": "my-custom-rule",
      "enabled": true,
      "description": "Match custom log format",
      "lineMatchRegex": "(SQL:|PARAMS:)",
      "sqlExtractRegex": "SQL:\\s*(.+)",
      "parametersExtractRegex": "PARAMS:\\s*(.+)",
      "executionTimeExtractRegex": "TIME:\\s*(\\d+)",
      "paramParseRegex": "([^|]+)\\|([^,]+)"
    }
  ]
}
```

**Rule Field Description:**

| Field | Required | Description |
|-------|----------|-------------|
| `name` | ✅ | Rule unique name |
| `enabled` | ✅ | Whether enabled |
| `lineMatchRegex` | ✅ | Regex to match log lines, used to identify relevant logs |
| `sqlExtractRegex` | ✅ | Regex to extract SQL, must have one capture group |
| `parametersExtractRegex` | ❌ | Regex to extract parameter string |
| `executionTimeExtractRegex` | ❌ | Regex to extract execution time (milliseconds) |
| `paramParseRegex` | ❌ | Regex to parse individual parameters, two capture groups: value and type |

**Parameter Parsing Regex Examples:**

Assuming parameter format is `value(type)`, such as `admin(String), 123(Integer)`:
```regex
([^,]+)\(([^)]+)\)
```

Assuming parameter format is `type:value`, such as `String:admin, Integer:123`:
```regex
([^:]+):(.+)
```

Assuming parameters have no type, only values, such as `admin, 123`:
```regex
([^,]+)
```
(Type will be displayed as `unknown` in this case)

#### FAQ

**Q: SQL history is empty, no SQL captured?**

**A:** Please troubleshoot in the following steps:

1. **Check Log Level**: Ensure MyBatis log level is DEBUG, need to see `Preparing:` and `Parameters:` in logs
   ```properties
   # application.properties
   logging.level.com.example.mapper=DEBUG
   ```

2. **Check Listen Mode**: Try switching to different listen modes
   ```json
   {
     "mybatis-helper.sqlInterceptor.listenMode": "debugConsole"
   }
   ```

3. **Check Extension Status**: Check the toolbar in the left SQL History view, confirm the extension is started (shows ⏸️ pause button)

4. **Check Log Format**: Confirm if log format is supported by built-in rules, or add custom rules

**Q: Parameter count shows 0, but there are parameters in the log?**

**A:** The parameter parsing regex may not match your log format:

1. Check if parameter format is `value(type)` or another format
2. Check if Chinese brackets `（）` are used
3. Add custom rules to match your format:
   ```json
   {
     "mybatis-helper.sqlInterceptor.customRules": [{
       "name": "my-format",
       "enabled": true,
       "lineMatchRegex": "Parameters:",
       "parametersExtractRegex": "Parameters:\\s*(.+)",
       "paramParseRegex": "([^,]+)\\(([^)]+)\\)"
     }]
   }
   ```

**Q: How to view SQL for a specific Mapper only?**

**A:** Current version supports viewing all SQL, does not support filtering by Mapper. Can be indirectly achieved through:
1. View SQL context in SQL detail panel
2. Determine table/Mapper based on SQL content
3. Clear history, then only execute specific operations to isolate SQL

### 2. Quick File Navigation

#### Jump from Java Mapper Interface to XML File

1. Place cursor on the method name or interface name in Java Mapper interface
2. Press shortcut `Alt+X` (Windows/Linux) or `Option+X` (macOS)
3. Or, right-click and select "Jump to XML File" context menu option
4. The extension will automatically open the corresponding XML file and locate the corresponding SQL statement method

#### Jump from XML File to Java Mapper Interface

1. Place cursor on the id attribute value of the SQL statement in XML file
2. Press shortcut `Alt+M` (Windows/Linux) or `Option+M` (macOS)
3. Or, right-click and select "Jump to Mapper Interface" context menu option
4. The extension will automatically open the corresponding Java Mapper interface file and locate the corresponding method definition

#### Using Command Palette

1. Press `Ctrl+Shift+P` (Windows/Linux) or `Command+Shift+P` (macOS) to open command palette
2. Enter "MyBatis" to view all available commands
3. Select corresponding command to execute operation

### 3. Using CodeLens

1. Ensure CodeLens functionality is enabled in VSCode settings (enabled by default)
2. Open Java Mapper interface file
3. "Jump to XML" CodeLens will appear above method definitions
4. Click this CodeLens to directly jump to the SQL statement in the corresponding XML file

### Shortcut Keys

| Shortcut | Function | Use Case |
|----------|----------|----------|
| `Alt+X` | Jump from Mapper to XML | In Java Mapper interface files |
| `Alt+M` | Jump from XML to Mapper | In Mapper XML files |
| `Ctrl+Shift+P` + `MyBatis` | Open command palette and search MyBatis related commands | Any editor window |

### Command Palette Commands

Enter "MyBatis" in command palette (`Ctrl+Shift+P` or `Command+Shift+P`) to view all commands:

| Command | Description |
|---------|-------------|
| `MyBatis Helper: Pause SQL Interceptor` | Pause SQL interception |
| `MyBatis Helper: Resume SQL Interceptor` | Resume SQL interception |
| `MyBatis Helper: Clear SQL History` | Clear SQL history |
| `MyBatis Helper: Refresh SQL History` | Refresh SQL history |
| `MyBatis Helper: Jump to XML` | Jump to XML file |
| `MyBatis Helper: Jump to Mapper` | Jump to Mapper interface |
| `MyBatis Helper: Refresh Mappings` | Refresh Mapper mapping cache |

## Supported Databases

MyBatis Helper supports multiple mainstream databases, each with specific SQL syntax highlighting and formatting rules. You can select the appropriate database type for your project in the extension settings:

- MySQL
- PostgreSQL
- Oracle
- SQL Server
- SQLite
- DB2
- H2
- MariaDB

## Project Configuration

MyBatis Helper provides flexible configuration options that users can personalize according to their needs:

### Database Type

- Configuration Item: `mybatis-helper.databaseType`
- Description: Set the database type used by the current project, different databases have specific SQL syntax highlighting and formatting rules
- Default Value: `mysql`
- Optional Values: `mysql`, `postgresql`, `oracle`, `sqlserver`, `sqlite`, `db2`, `h2`, `mariadb`

### Enable CodeLens

- Configuration Item: `mybatis-helper.enableCodeLens`
- Description: Control whether to enable CodeLens functionality
- Default Value: `true`

### SQL Log Interceptor Configuration

#### Enable Auto Start

- Configuration Item: `mybatis-helper.sqlInterceptor.autoStart`
- Description: Control whether to automatically start SQL interception when extension activates
- Default Value: `true`
- Optional Values: `true` | `false`

#### Listen Mode

- Configuration Item: `mybatis-helper.sqlInterceptor.listenMode`
- Description: Select the source for SQL log listening
- Default Value: `auto`
- Optional Values:
  - `auto`: Automatically select based on Java Debug configuration (recommended)
  - `debugConsole`: Force listen to Debug Console
  - `terminal`: Force listen to Terminal

#### Max History Records

- Configuration Item: `mybatis-helper.sqlInterceptor.maxHistorySize`
- Description: Control the maximum number of SQL history records
- Default Value: `500`
- Optional Values: `10` - `1000`

#### Auto Scroll Behavior

- Configuration Item: `mybatis-helper.sqlInterceptor.autoScrollBehavior`
- Description: Control auto-scroll behavior when new SQL is added to history
- Default Value: `onlyWhenNotInteracting`
- Optional Values:
  - `always`: Always auto-scroll to latest SQL
  - `onlyWhenNotInteracting`: Only auto-scroll when user is not interacting with the list
  - `never`: Never auto-scroll

#### Built-in Rules Switch

- Configuration Item: `mybatis-helper.sqlInterceptor.builtinRules`
- Description: Enable or disable built-in SQL parsing rules
- Default Value:
  ```json
  {
    "mybatis-universal": true,
    "mybatis-sqlsession": true
  }
  ```

#### Custom Parsing Rules

- Configuration Item: `mybatis-helper.sqlInterceptor.customRules`
- Description: Add custom SQL log parsing rules for non-standard log formats
- Default Value: `[]` (empty array)
- Example:
  ```json
  [
    {
      "name": "custom-rule",
      "enabled": true,
      "lineMatchRegex": "SQL:",
      "sqlExtractRegex": "SQL:\\s*(.+)"
    }
  ]
  ```

### File Open Mode

- Configuration Item: `mybatis-helper.fileOpenMode`
- Description: Control file jump behavior mode
- Default Value: `useExisting`
- Optional Values:
  - `useExisting`: Use already opened window, if not exists then don't split window
  - `noSplit`: Never split window
  - `alwaysSplit`: Always split window

## Advanced Configuration Examples

### SQL Log Interception Complete Configuration Example

```json
{
  "mybatis-helper.sqlInterceptor.listenMode": "auto",
  "mybatis-helper.sqlInterceptor.autoStart": true,
  "mybatis-helper.sqlInterceptor.maxHistorySize": 500,
  "mybatis-helper.sqlInterceptor.autoScrollBehavior": "onlyWhenNotInteracting",
  "mybatis-helper.sqlInterceptor.builtinRules": {
    "mybatis-universal": true,
    "mybatis-sqlsession": false
  },
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

### Custom Name Matching Rules Example

If your project uses specific naming conventions, you can improve matching accuracy through custom name matching rules:

```json
{
  "mybatis-helper.nameMatchingRules": [
    {
      "name": "Repository Pattern",
      "enabled": true,
      "javaPattern": "*Repository",
      "xmlPattern": "${javaName}",
      "description": "Match UserRepository.java with User.xml"
    },
    {
      "name": "Service Pattern",
      "enabled": true,
      "javaPattern": "*Service",
      "xmlPattern": "${javaName}Mapper",
      "description": "Match UserService.java with UserServiceMapper.xml"
    },
    {
      "name": "Controller Pattern",
      "enabled": false,
      "javaPattern": "*Controller",
      "xmlPattern": "${javaName}Dao",
      "description": "Match UserController.java with UserControllerDao.xml"
    }
  ],
  "mybatis-helper.ignoreSuffixes": ["Mapper", "Dao", "Repository", "Service", "Controller"]
}
```

### Path Priority Configuration Example

If your project has a specific directory structure, you can optimize file lookup through path priority configuration:

```json
{
  "mybatis-helper.pathPriority": {
    "enabled": true,
    "priorityDirectories": [
      "/src/main/java/",
      "/src/main/resources/",
      "/src/main/resources/mapper/",
      "/src/main/resources/dao/",
      "/src/main/resources/mybatis/"
    ],
    "excludeDirectories": [
      "/build/",
      "/target/",
      "/out/",
      "/.git/",
      "/node_modules/",
      "/test/",
      "/tests/"
    ]
  }
}
```

### Complete Configuration Example

Below is a complete configuration example showing how to combine various configuration options:

```json
{
  "mybatis-helper.databaseType": "mysql",
  "mybatis-helper.enableCodeLens": true,
  "mybatis-helper.fileOpenMode": "useExisting",
  
  // SQL Log Interception Configuration
  "mybatis-helper.sqlInterceptor.listenMode": "auto",
  "mybatis-helper.sqlInterceptor.autoStart": true,
  "mybatis-helper.sqlInterceptor.maxHistorySize": 500,
  "mybatis-helper.sqlInterceptor.autoScrollBehavior": "onlyWhenNotInteracting",
  "mybatis-helper.sqlInterceptor.builtinRules": {
    "mybatis-universal": true,
    "mybatis-sqlsession": true
  },
  "mybatis-helper.sqlInterceptor.customRules": [],
  
  // File Navigation Configuration
  "mybatis-helper.nameMatchingRules": [
    {
      "name": "Default Mapper",
      "enabled": true,
      "javaPattern": "*Mapper",
      "xmlPattern": "${javaName}",
      "description": "Match UserMapper.java with User.xml"
    },
    {
      "name": "Default Dao",
      "enabled": true,
      "javaPattern": "*Dao",
      "xmlPattern": "${javaName}",
      "description": "Match UserDao.java with User.xml"
    }
  ],
  "mybatis-helper.ignoreSuffixes": ["Mapper", "Dao"],
  "mybatis-helper.pathPriority": {
    "enabled": true,
    "priorityDirectories": [
      "/src/main/java/",
      "/src/main/resources/mapper/"
    ],
    "excludeDirectories": [
      "/build/",
      "/target/",
      "/.git/"
    ]
  }
}
```

## FAQ

### SQL Log Interception Related Questions

#### Q: SQL history is empty, no SQL captured?

**A:** Please troubleshoot in the following steps:

1. **Check Log Level**: Ensure MyBatis log level is DEBUG, need to see `Preparing:` and `Parameters:` in logs
   ```properties
   # application.properties
   logging.level.com.example.mapper=DEBUG
   ```

2. **Check Listen Mode**: Try switching to different listen modes
   ```json
   {
     "mybatis-helper.sqlInterceptor.listenMode": "debugConsole"
   }
   ```

3. **Check Extension Status**: Check the toolbar in the left SQL History view, confirm the extension is started (shows ⏸️ pause button)

4. **Check Log Format**: Confirm if log format is supported by built-in rules, or add custom rules

#### Q: Parameter count shows 0, but there are parameters in the log?

**A:** The parameter parsing regex may not match your log format:

1. Check if parameter format is `value(type)` or another format
2. Check if Chinese brackets `（）` are used
3. Add custom rules to match your format:
   ```json
   {
     "mybatis-helper.sqlInterceptor.customRules": [{
       "name": "my-format",
       "enabled": true,
       "lineMatchRegex": "Parameters:",
       "parametersExtractRegex": "Parameters:\\s*(.+)",
       "paramParseRegex": "([^,]+)\\(([^)]+)\\)"
     }]
   }
   ```

#### Q: How to view SQL for a specific Mapper only?

**A:** Current version supports viewing all SQL, does not support filtering by Mapper. Can be indirectly achieved through:
1. View SQL context in SQL detail panel
2. Determine table/Mapper based on SQL content
3. Clear history, then only execute specific operations to isolate SQL

### File Navigation Related Questions

#### Q: How to configure custom name matching rules?

**A:** Search for `mybatis-helper.nameMatchingRules` in VSCode settings, click "Edit in settings.json", then add your custom rules according to the example format. Each rule contains `name`, `enabled`, `javaPattern`, `xmlPattern`, and `description` fields.

#### Q: How to use wildcards and variables?

**A:** In `javaPattern` and `xmlPattern`, you can use `*` to match any number of characters, use `?` to match single characters. In `xmlPattern`, you can use `${javaName}` variable, which will be replaced with the base part of the Java filename (without suffix).

#### Q: How does path priority configuration improve matching accuracy?

**A:** Path priority configuration improves matching accuracy through:
1. Prioritizing files in `priorityDirectories` paths
2. Excluding files in `excludeDirectories` paths
3. Sorting match results based on path depth and priority

#### Q: How to debug file matching issues?

**A:** You can debug file matching issues through:
1. Check output information in VSCode developer console
2. Confirm if custom name matching rules are configured correctly
3. Verify if path priority configuration is reasonable
4. Confirm if ignore suffixes configuration matches actual project situation

### Other Questions

#### Q: Which versions of VSCode does the extension support?

**A:** The extension requires VSCode 1.100.3 or higher to run properly.

#### Q: Will the extension affect VSCode performance?

**A:** We have comprehensively optimized the extension, it will not significantly affect VSCode performance under normal use. In large projects, there may be a brief scanning process during first load.

#### Q: How to customize extension interface language?

**A:** The extension automatically switches display language based on VSCode language settings, supports English and Chinese.

## Contributing

We welcome community contributions! If you are interested in participating in the development of the MyBatis Helper extension, please follow these steps:

1. Fork the GitHub repository: [https://github.com/jingzepei/mybatis-helper](https://github.com/jingzepei/mybatis-helper)
2. Clone your Fork to local development environment
3. Create a new branch for development
4. Submit your changes and ensure all tests pass
5. Push to your Fork and create Pull Request

Contribution Guidelines:

- Follow existing code style and naming conventions
- Add appropriate documentation and tests for new features
- Describe your changes and purposes in detail in Pull Request
- For large changes, it is recommended to create an Issue first for discussion

If you find issues or have new feature suggestions, you are also welcome to submit Issues on GitHub or Gitee.

## License

This extension is open-sourced under the MIT License. For details, please check the [LICENSE](LICENSE) file.

## Acknowledgments

Thanks to all developers and users who have contributed to this project, and the support of the following open-source technologies:

- [Visual Studio Code Extension API](https://code.visualstudio.com/api)
- [TypeScript](https://www.typescriptlang.org/)
- [MyBatis](https://mybatis.org/mybatis-3/)
- [trae](https://www.trae.cn/)

---

Hope this extension can help you develop MyBatis applications more efficiently! If you have any questions or suggestions, please feel free to submit Issues or contact us on [GitHub](https://github.com/Greenplumwine/vscode-mybatis-helper) or [Gitee](https://gitee.com/Greenplumwine/vscode-mybatis-helper).
