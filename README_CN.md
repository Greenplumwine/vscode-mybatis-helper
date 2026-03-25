![mybatis](static/icon/mybatis-helper-icon.png)

# MyBatis Helper
中文文档 | [English Documentation](README.md)

一个功能强大的 VS Code 插件，为 MyBatis 开发者提供全方位的辅助功能，大幅提升开发效率。

## 快速开始

3 个简单步骤开始使用 MyBatis Helper：

1. **安装前置条件**
   - 从 VS Code 市场安装 [Extension Pack for Java](https://marketplace.visualstudio.com/items?itemName=vscjava.vscode-java-pack)
   - 打开你的 MyBatis 项目（包含 `pom.xml` 或 `build.gradle`）

2. **使用功能**
   - **导航**：按 `Ctrl+Alt+J`（Windows/Linux）或 `Ctrl+Option+J`（macOS）从 Java 跳转到 XML
   - **SQL 拦截**：打开 MyBatis Helper 侧边栏（数据库图标）查看捕获的 SQL
   - **代码补全**：在 XML 文件中输入 `#{` 查看参数建议

3. **尝试示例**
   - 打开 [`samples/basic-mybatis-project/`](samples/basic-mybatis-project/) 中的示例项目
   - 运行 `mvn test` 查看 SQL 拦截效果

> **初次使用 MyBatis Helper？** 查看 [功能指南](docs/FEATURES.md) 了解详细文档。

## 项目概述

MyBatis Helper 是一款专为 MyBatis 开发者设计的 VS Code 插件，旨在提升 MyBatis 项目的开发效率。该插件通过提供控制台日志拦截、SQL 转换以及文件快速跳转等功能，帮助开发者更便捷地进行 MyBatis 应用的开发和调试。

## 文档

- [功能指南](docs/FEATURES_CN.md) - 详细功能文档
- [配置说明](docs/CONFIGURATION_CN.md) - 所有配置选项
- [故障排除](docs/TROUBLESHOOTING_CN.md) - 常见问题和解决方案

## 功能特点

![navigation](static/images/navigation-demo.gif)
*Java 到 XML 导航 - 按 `Ctrl+Alt+J` 跳转*

![sql-interceptor](static/images/sql-interceptor-demo.gif)
*SQL 拦截器 - 捕获和查看执行的 SQL*

![completion](static/images/completion-demo.gif)
*代码补全 - 智能参数建议*

### 1. SQL 日志拦截与转换

实时拦截应用程序日志中的 MyBatis SQL 语句，自动解析参数并生成可执行的完整 SQL。

**核心功能：**
- 🎯 **智能监听**：自动识别 Debug Console 或 Terminal 输出的 MyBatis 日志
- 🔍 **参数解析**：将 `?` 占位符替换为实际参数值，生成可直接执行的 SQL
- ⚡ **实时展示**：在侧边栏 SQL 历史中实时显示捕获的 SQL
- 📊 **执行时间**：自动提取并显示 SQL 执行耗时
- 🎨 **语法高亮**：支持多种数据库的 SQL 语法高亮和格式化
- 📋 **一键复制**：支持复制格式化 SQL 或带参数注释的 SQL
- 🕐 **历史记录**：自动保存最近 500 条 SQL（可配置）
- ⏸️ **随时暂停**：可随时暂停/恢复 SQL 拦截，方便查看历史
- 🌍 **多语言支持**：SQL 详情面板支持国际化显示

**支持的数据库：**
- MySQL / MariaDB
- PostgreSQL
- Oracle
- SQL Server
- SQLite
- DB2
- H2
- 达梦 / 人大金仓（通过通用规则支持）

### 2. 文件快速跳转

- Mapper 接口与 XML 文件之间的一键双向跳转，无需手动查找文件
- **智能跳转增强**：增强的映射算法和智能识别功能，大幅提升文件间跳转的准确性和速度
- 智能扫描项目结构，自动建立 Mapper 接口与 XML 文件的映射关系
- 支持标准 Maven/Gradle 项目结构及自定义项目布局
- 针对大型复杂项目优化的映射算法，快速定位目标文件
- 支持通过全限定类名搜索对应的 Mapper 接口和 XML 文件
- 自动刷新映射缓存，确保文件位置变更时仍能正确跳转
- 按需激活：仅在检测到 Java 项目时才开始执行映射关系处理逻辑
- 精确文件查找：通过针对特定文件的精确查找替代全文件夹扫描，提高跳转效率
- 跳转节流控制：防止频繁跳转操作导致性能问题
- XML 命名空间验证：确保 XML 文件与 Mapper 接口正确关联
- 方法名提取与位置定位：精确定位到对应的方法位置
- **精确方法跳转**：支持在跳转时精确定位到对应的具体方法，而仅仅是打开文件
- **重构跳转逻辑**：采用独立的导航器模式（JavaToXmlNavigator和XmlToJavaNavigator），提高代码可维护性
- **优先使用Java插件API**：优先使用Red Hat Java插件提供的API进行精确导航，提升跳转准确性

### 3. CodeLens 支持

- **仅对 Mapper 接口提供支持**：优化的 CodeLens 实现，仅在 Java Mapper 接口文件中显示
- **Java 文件中的 CodeLens**：在 Java Mapper 接口的方法上方显示"跳转到 XML"的 CodeLens 提示
- **智能显示控制**：CodeLens 仅在检测到有效映射关系并且方法在对应XML中存在时显示，避免显示无效的跳转提示
- **点击直接跳转**：用户点击 CodeLens 提示可直接执行跳转操作，无需使用快捷键或右键菜单
- 提供配置选项允许用户启用或禁用 CodeLens 功能，默认启用

### 4. 国际化支持

- 支持多语言界面，能够根据 VSCode 的语言设置自动切换显示语言（支持英文和中文）

### 5. SQL 输入智能补全

- 在 Mapper XML 文件中输入 `#{` 或 `${` 时，自动提供基于 Java Mapper 接口方法参数的补全建议
- 支持基本类型、自定义对象属性和集合类型的补全提示
- 提供上下文感知的补全建议，根据当前方法自动过滤参数
- 支持嵌套对象属性补全，如 `#{user.name}`
- 补全项包含参数名称和类型信息

### 6. 用户友好的界面

- 简洁明了的命令菜单，所有功能一目了然
- 精心设计的快捷键体系，操作高效便捷
- 编辑器右键菜单深度集成，触手可及
- 实时状态反馈，操作结果即时可见
- 符合 VSCode 设计规范的用户体验，无缝融入开发环境
- SQL 结果可视化显示：提供 Webview 面板展示格式化和高亮的 SQL 结果
- Webview 交互功能：包含复制按钮、刷新按钮、搜索功能等
- 随机 nonce 生成：为 Webview 提供安全保障

### 7. 插件日志系统

- 提供 DEBUG/INFO/WARN/ERROR 四个日志级别
- 日志输出到专用的 "MyBatis Helper" 输出通道
- 支持动态调整日志级别
- 详细记录插件运行状态和错误信息
- 便于开发者调试和排查问题

## 安装方法

### 方法一：从 VSCode 扩展市场安装

1. 在 VSCode 中打开扩展面板 (快捷键: `Ctrl+Shift+X` 或 `Command+Shift+X`)
2. 在搜索框中输入 "MyBatis Helper"
3. 找到插件后点击 "安装" 按钮
4. 安装完成后，插件会自动激活，无需重启 VSCode

### 方法二：手动安装

1. 从 GitHub 仓库下载最新的发布版本
2. 在 VSCode 中执行 "安装从 VSIX..." 命令
3. 选择下载的 VSIX 文件
4. 安装完成后重启 VSCode

## 使用指南

### 1. SQL 日志拦截功能详解

#### 快速开始

1. **启动 SQL 拦截**
   - 插件默认自动启动 SQL 拦截（可通过配置关闭）
   - 点击左侧活动栏的 MyBatis Helper 图标，打开 SQL 历史视图
   - 如未自动启动，点击工具栏的 ▶️ 按钮手动启动

2. **运行应用程序**
   - 在 VSCode 中启动你的 Java/MyBatis 应用程序（Debug 或 Run 模式）
   - 确保 MyBatis 日志级别为 DEBUG（需要输出 `Preparing:` 和 `Parameters:` 日志）

3. **查看 SQL**
   - SQL 会自动显示在左侧 "SQL 历史" 视图中
   - 点击任意 SQL 项可查看详情面板（格式化 SQL、原始 SQL、参数列表等）

#### 界面说明

**SQL 历史侧边栏：**
```
┌─────────────────────────────────┐
│ 🔄  ⏸️  🗑️                      │  ← 工具栏：刷新 / 暂停/恢复 / 清空
├─────────────────────────────────┤
│ ⚡ Just now (3 params)          │  ← SQL 项：执行时间、参数数量
│ SELECT * FROM user...           │     鼠标悬停显示完整 SQL 预览
│                                 │
│ 📋 2 min ago (0 params)         │
│ UPDATE user SET name...         │
└─────────────────────────────────┘
```

**SQL 详情面板：**
- **格式化 SQL**：语法高亮、格式化的可执行 SQL
- **原始 SQL**：带 `?` 占位符的原始 SQL
- **参数列表**：显示每个参数的序号、值和类型
- **复制按钮**：
  - 复制格式化 SQL
  - 复制带参数注释的 SQL（用于排查问题）

#### 工具栏按钮

| 图标 | 功能 | 说明 |
|------|------|------|
| 🔄 | 刷新 | 刷新 SQL 历史列表 |
| ⏸️ | 暂停 | 暂停 SQL 拦截（不再捕获新 SQL） |
| ▶️ | 恢复 | 恢复 SQL 拦截 |
| 🗑️ | 清空 | 清空所有 SQL 历史记录 |

#### 监听模式配置

根据你的 Java 应用程序运行方式选择合适的监听模式：

```json
{
  "mybatis-helper.sqlInterceptor.listenMode": "auto"
}
```

| 模式 | 说明 | 适用场景 |
|------|------|----------|
| `auto` | **默认**，自动检测 Java Debug 配置 | 推荐使用 |
| `debugConsole` | 强制监听 Debug Console | 使用 `internalConsole` 运行 Java 时 |
| `terminal` | 强制监听 Terminal | 使用 `integratedTerminal` 运行 Java 时 |

**Auto 模式检测逻辑：**
- 读取 `java.debug.settings.console` 配置
- `internalConsole` → 监听 Debug Console
- `integratedTerminal` → 监听 Terminal
- `externalTerminal` → 提示不支持（外部终端无法监听）

#### 支持的日志格式

插件内置两种规则，自动识别以下格式的日志：

**标准 MyBatis 格式：**
```
==>  Preparing: SELECT * FROM user WHERE id = ? AND name = ?
==> Parameters: 123(Integer), admin(String)
<==      Total: 1
```

**带时间戳格式：**
```
2024-01-15 10:30:25.123 [main] DEBUG c.m.UserMapper.selectById - ==>  Preparing: SELECT * FROM user WHERE id = ?
2024-01-15 10:30:25.124 [main] DEBUG c.m.UserMapper.selectById - ==> Parameters: 123(Integer)
```

**中文括号格式（兼容）：**
```
==> Parameters: admin（String）, 25(Integer)
```

#### 完整配置选项

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

**配置说明：**

| 配置项 | 类型 | 默认值 | 说明 |
|--------|------|--------|------|
| `listenMode` | string | `auto` | 监听模式：`auto`/`debugConsole`/`terminal` |
| `autoStart` | boolean | `true` | 插件激活时是否自动启动 SQL 拦截 |
| `maxHistorySize` | number | `500` | SQL 历史记录最大条数（10-1000） |
| `autoScrollBehavior` | string | `onlyWhenNotInteracting` | 自动滚动行为：`always`/`onlyWhenNotInteracting`/`never` |
| `builtinRules` | object | - | 内置规则开关 |

#### 自定义日志解析规则

如果内置规则无法匹配你的日志格式，可以添加自定义规则：

```json
{
  "mybatis-helper.sqlInterceptor.customRules": [
    {
      "name": "my-custom-rule",
      "enabled": true,
      "description": "匹配自定义日志格式",
      "lineMatchRegex": "(SQL:|PARAMS:)",
      "sqlExtractRegex": "SQL:\\s*(.+)",
      "parametersExtractRegex": "PARAMS:\\s*(.+)",
      "executionTimeExtractRegex": "TIME:\\s*(\\d+)",
      "paramParseRegex": "([^,]+)\\(([^)]+)\\)"
    }
  ]
}
```

**规则字段说明：**

| 字段 | 必填 | 说明 |
|------|------|------|
| `name` | ✅ | 规则唯一名称 |
| `enabled` | ✅ | 是否启用 |
| `lineMatchRegex` | ✅ | 匹配日志行的正则，用于识别相关日志 |
| `sqlExtractRegex` | ✅ | 提取 SQL 的正则，必须有一个捕获组 |
| `parametersExtractRegex` | ❌ | 提取参数字符串的正则 |
| `executionTimeExtractRegex` | ❌ | 提取执行时间（毫秒）的正则 |
| `paramParseRegex` | ❌ | 解析单个参数的正则，两个捕获组：值和类型 |

**参数解析正则示例：**

假设参数格式为 `value(type)`，如 `admin(String), 123(Integer)`：
```regex
([^,]+)\(([^)]+)\)
```

假设参数格式为 `type:value`，如 `String:admin, Integer:123`：
```regex
([^:]+):(.+)
```

假设参数没有类型，只有值，如 `admin, 123`：
```regex
([^,]+)
```
（此时类型会显示为 `unknown`）

#### 常见问题

**Q: SQL 历史为空，没有捕获到 SQL**

A: 请检查以下几点：
1. MyBatis 日志级别是否为 DEBUG（需要在日志中看到 `Preparing:` 和 `Parameters:`）
2. 监听模式是否正确（尝试切换 `auto`/`debugConsole`/`terminal`）
3. 插件是否已启动（查看工具栏按钮状态）
4. 日志格式是否被内置规则支持（可添加自定义规则）

**Q: 参数显示为 0，但日志中有参数**

A: 可能是参数解析正则不匹配你的日志格式。检查：
1. 参数格式是 `value(type)` 还是其他格式
2. 是否使用了中文括号 `（）`
3. 尝试添加自定义规则匹配你的格式

**Q: SQL 历史中的 SQL 和实际执行的不一致**

A: 可能是并发处理导致。插件使用 100ms 去重窗口防止重复处理，如果同一 SQL 在 100ms 内多次出现，只会记录一次。

**Q: 如何导出 SQL 历史？**

A: 当前版本不支持直接导出，但可以通过以下方式获取：
1. 点击 SQL 项打开详情面板
2. 使用复制按钮复制单条 SQL
3. 或使用 VSCode 的开发者工具查看输出通道

**Q: 支持非 MyBatis 的 SQL 日志吗？**

A: 可以通过自定义规则支持其他 ORM 框架，只要日志包含 SQL 语句和参数信息即可。需要配置合适的正则表达式来提取 SQL 和参数。

### 2. 文件快速跳转

#### 从 Java Mapper 接口跳转到 XML 文件

1. 将光标放在 Java Mapper 接口的方法名或接口名上
2. 按下快捷键 `Alt+X`（Windows/Linux）或 `Option+X`（macOS）
3. 或者，右键点击并选择 "跳转到 XML 文件" 上下文菜单选项
4. 插件会自动打开对应的 XML 文件，并定位到对应的 SQL 语句方法

#### 从 XML 文件跳转到 Java Mapper 接口

1. 将光标放在 XML 文件的 SQL 语句的 id 属性值上
2. 按下快捷键 `Alt+M`（Windows/Linux）或 `Option+M`（macOS）
3. 或者，右键点击并选择 "跳转到 Mapper 接口" 上下文菜单选项
4. 插件会自动打开对应的 Java Mapper 接口文件，并定位到对应的方法定义

#### 使用命令面板

1. 按下 `Ctrl+Shift+P`（Windows/Linux）或 `Command+Shift+P`（macOS）打开命令面板
2. 输入 "MyBatis" 查看所有可用命令
3. 选择相应的命令执行操作

### 3. 使用 CodeLens

1. 确保在 VSCode 设置中启用了 CodeLens 功能（默认已启用）
2. 打开 Java Mapper 接口文件
3. 在方法定义上方会出现 "跳转到 XML" 的 CodeLens
4. 点击该 CodeLens 直接跳转到对应的 XML 文件中的 SQL 语句

### 快捷键说明

| 快捷键 | 功能 | 适用场景 |
|--------|------|----------|
| `Alt+X` | 从 Mapper 跳转到 XML | 在 Java Mapper 接口文件中 |
| `Alt+M` | 从 XML 跳转到 Mapper | 在 Mapper XML 文件中 |
| `Ctrl+Shift+P` + `MyBatis` | 打开命令面板并搜索 MyBatis 相关命令 | 任何编辑器窗口 |

### 命令面板命令

在命令面板（`Ctrl+Shift+P` 或 `Command+Shift+P`）中输入 "MyBatis" 可查看所有命令：

| 命令 | 说明 |
|------|------|
| `MyBatis Helper: Pause SQL Interceptor` | 暂停 SQL 拦截 |
| `MyBatis Helper: Resume SQL Interceptor` | 恢复 SQL 拦截 |
| `MyBatis Helper: Clear SQL History` | 清空 SQL 历史 |
| `MyBatis Helper: Refresh SQL History` | 刷新 SQL 历史 |
| `MyBatis Helper: Jump to XML` | 跳转到 XML 文件 |
| `MyBatis Helper: Jump to Mapper` | 跳转到 Mapper 接口 |
| `MyBatis Helper: Refresh Mappings` | 刷新 Mapper 映射缓存 |

## 支持的数据库

MyBatis Helper 支持多种主流数据库，每种数据库都有特定的 SQL 语法高亮和格式化规则。您可以在插件设置中选择适合您项目的数据库类型：

- MySQL
- PostgreSQL
- Oracle
- SQL Server
- SQLite
- DB2
- H2
- MariaDB

## 项目配置

MyBatis Helper 提供了灵活的配置选项，用户可以根据自己的需求进行个性化设置：

### 数据库类型

- 配置项：`mybatis-helper.databaseType`
- 说明：设置当前项目使用的数据库类型，不同数据库有特定的 SQL 语法高亮和格式化规则
- 默认值：`mysql`
- 可选值：`mysql`, `postgresql`, `oracle`, `sqlserver`, `sqlite`, `db2`, `h2`, `mariadb`

### SQL 日志拦截器配置

#### 启用自动启动

- 配置项：`mybatis-helper.sqlInterceptor.autoStart`
- 说明：控制插件激活时是否自动启动 SQL 拦截
- 默认值：`true`
- 可选值：`true` | `false`

#### 监听模式

- 配置项：`mybatis-helper.sqlInterceptor.listenMode`
- 说明：选择 SQL 日志的监听来源
- 默认值：`auto`
- 可选值：
  - `auto`：自动根据 Java Debug 配置选择（推荐）
  - `debugConsole`：强制监听 Debug Console
  - `terminal`：强制监听 Terminal

#### 最大历史记录数

- 配置项：`mybatis-helper.sqlInterceptor.maxHistorySize`
- 说明：控制 SQL 历史记录的最大条数
- 默认值：`500`
- 可选值：`10` - `1000`

#### 自动滚动行为

- 配置项：`mybatis-helper.sqlInterceptor.autoScrollBehavior`
- 说明：当新的 SQL 添加到历史记录时，控制自动滚动行为
- 默认值：`onlyWhenNotInteracting`
- 可选值：
  - `always`：始终自动滚动到最新的 SQL
  - `onlyWhenNotInteracting`：仅在用户未与列表交互时自动滚动
  - `never`：从不自动滚动

#### 内置规则开关

- 配置项：`mybatis-helper.sqlInterceptor.builtinRules`
- 说明：启用或禁用内置的 SQL 解析规则
- 默认值：
  ```json
  {
    "mybatis-universal": true,
    "mybatis-sqlsession": true
  }
  ```

#### 自定义解析规则

- 配置项：`mybatis-helper.sqlInterceptor.customRules`
- 说明：添加自定义的 SQL 日志解析规则，用于非标准日志格式
- 默认值：`[]`（空数组）
- 示例：
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

### 启用 CodeLens

- 配置项：`mybatis-helper.enableCodeLens`
- 说明：控制是否启用 CodeLens 功能
- 默认值：`true`

### 文件打开模式

- 配置项：`mybatis-helper.fileOpenMode`
- 说明：控制文件跳转时的行为模式
- 默认值：`useExisting`
- 可选值：
  - `useExisting`: 使用已打开的窗口，如果不存在则不拆分窗口
  - `noSplit`: 始终不拆分窗口
  - `alwaysSplit`: 始终拆分窗口

## 高级配置示例

### 自定义名称匹配规则示例

如果你的项目使用特定的命名约定，可以通过自定义名称匹配规则来提高匹配准确性：

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

### 路径优先级配置示例

如果你的项目有特定的目录结构，可以通过路径优先级配置来优化文件查找：

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

### SQL 日志拦截完整配置示例

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
      "description": "公司内部日志格式",
      "lineMatchRegex": "(EXEC_SQL|BIND_PARAMS)",
      "sqlExtractRegex": "EXEC_SQL\\s*(.+)",
      "parametersExtractRegex": "BIND_PARAMS\\s*(.+)",
      "executionTimeExtractRegex": "COST\\s*(\\d+)\\s*ms",
      "paramParseRegex": "([^|]+)\\|([^,]+)"
    }
  ]
}
```

### 完整配置示例

以下是一个包含所有功能的完整配置示例：

```json
{
  "mybatis-helper.databaseType": "mysql",
  "mybatis-helper.enableCodeLens": true,
  "mybatis-helper.fileOpenMode": "useExisting",
  
  // SQL 日志拦截配置
  "mybatis-helper.sqlInterceptor.listenMode": "auto",
  "mybatis-helper.sqlInterceptor.autoStart": true,
  "mybatis-helper.sqlInterceptor.maxHistorySize": 500,
  "mybatis-helper.sqlInterceptor.autoScrollBehavior": "onlyWhenNotInteracting",
  "mybatis-helper.sqlInterceptor.builtinRules": {
    "mybatis-universal": true,
    "mybatis-sqlsession": true
  },
  "mybatis-helper.sqlInterceptor.customRules": [],
  
  // 文件跳转配置
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

## 常见问题

### SQL 日志拦截相关问题

#### Q: SQL 历史为空，没有捕获到 SQL？

**A:** 请按以下步骤排查：

1. **检查日志级别**：确保 MyBatis 日志级别为 DEBUG，需要在日志中看到 `Preparing:` 和 `Parameters:`
   ```properties
   # application.properties
   logging.level.com.example.mapper=DEBUG
   ```

2. **检查监听模式**：尝试切换不同的监听模式
   ```json
   {
     "mybatis-helper.sqlInterceptor.listenMode": "debugConsole"
   }
   ```

3. **检查插件状态**：查看左侧 SQL 历史视图的工具栏，确认插件已启动（显示 ⏸️ 暂停按钮）

4. **检查日志格式**：确认日志格式是否被内置规则支持，或添加自定义规则

#### Q: 参数显示为 0，但日志中有参数？

**A:** 可能是参数解析正则不匹配你的日志格式：

1. 检查参数格式是 `value(type)` 还是其他格式
2. 检查是否使用了中文括号 `（）`
3. 添加自定义规则匹配你的格式：
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

#### Q: 如何只查看特定 Mapper 的 SQL？

**A:** 当前版本支持查看所有 SQL，不支持按 Mapper 过滤。可以通过以下方式间接实现：
1. 在 SQL 详情面板中查看 SQL 上下文
2. 根据 SQL 内容判断所属表/Mapper
3. 清空历史后，只执行特定操作来隔离 SQL

### 文件跳转相关问题

#### Q: 如何配置自定义名称匹配规则？

**A:** 在 VSCode 设置中搜索 `mybatis-helper.nameMatchingRules`，点击"在 settings.json 中编辑"，然后按照示例格式添加你的自定义规则。每个规则包含 `name`、`enabled`、`javaPattern`、`xmlPattern` 和 `description` 字段。

#### Q: 如何使用通配符和变量？

**A:** 在 `javaPattern` 和 `xmlPattern` 中可以使用 `*` 匹配任意数量的字符，使用 `?` 匹配单个字符。在 `xmlPattern` 中可以使用 `${javaName}` 变量，它会被替换为 Java 文件名的基础部分（去掉后缀）。

#### Q: 路径优先级配置如何提高匹配准确性？

**A:** 路径优先级配置通过以下方式提高匹配准确性：
1. 优先搜索包含 `priorityDirectories` 路径的文件
2. 排除包含 `excludeDirectories` 路径的文件
3. 根据路径深度和优先级对匹配结果进行排序

#### Q: 如何调试文件匹配问题？

**A:** 可以通过以下方式调试文件匹配问题：
1. 检查 VSCode 开发者控制台的输出信息
2. 确认自定义名称匹配规则的配置是否正确
3. 验证路径优先级配置是否合理
4. 确认忽略后缀配置是否符合项目实际情况

### 其他问题

#### Q: 插件支持哪些版本的 VSCode？

**A:** 插件需要 VSCode 1.100.3 或更高版本才能正常运行。

#### Q: 插件会影响 VSCode 的性能吗？

**A:** 我们已经对插件进行了全面优化，正常使用情况下不会对 VSCode 性能产生明显影响。在大型项目中，首次加载时可能会有短暂的扫描过程。

#### Q: 如何自定义插件界面语言？

**A:** 插件会自动根据 VSCode 的语言设置切换显示语言，支持英文和中文。

## 贡献代码

我们非常欢迎社区贡献！如果您有兴趣参与 MyBatis Helper 插件的开发，请按照以下步骤操作：

1. Fork GitHub 仓库：[https://github.com/jingzepei/mybatis-helper](https://github.com/jingzepei/mybatis-helper)
2. 克隆您的 Fork 到本地开发环境
3. 创建一个新的分支进行开发
4. 提交您的更改并确保通过所有测试
5. 推送到您的 Fork 并创建 Pull Request

贡献指南：

- 遵循现有的代码风格和命名规范
- 为新功能添加适当的文档和测试
- 在 Pull Request 中详细描述您的更改内容和目的
- 对于大型更改，建议先创建 Issue 进行讨论

如果您发现了问题或者有新的功能建议，也欢迎在 GitHub 或 Gitee 上提交 Issue。

## 许可证

本插件采用 MIT 许可证开源。详细信息请查看 [LICENSE](LICENSE) 文件。

## 致谢

感谢所有为本项目做出贡献的开发者和用户，以及以下开源技术的支持：

- [Visual Studio Code Extension API](https://code.visualstudio.com/api)
- [TypeScript](https://www.typescriptlang.org/)
- [MyBatis](https://mybatis.org/mybatis-3/)
- ~~Lingma~~（不在使用了，因为现在越来越拉跨，越来越智障）
- [trae](https://www.trae.cn/)
---

希望这个插件能帮助您更高效地开发 MyBatis 应用！如有任何问题或建议，请随时在 [GitHub](https://github.com/Greenplumwine/vscode-mybatis-helper) 或 [Gitee](https://gitee.com/Greenplumwine/vscode-mybatis-helper) 上提交 Issue 或与我们联系。
