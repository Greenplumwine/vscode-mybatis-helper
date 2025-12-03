![mybatis](static/icon/mybatis-helper-icon.png)

# MyBatis Helper

一个功能强大的 VSCode 插件，为 MyBatis 开发者提供全方位的辅助功能，大幅提升开发效率。

## 项目概述

MyBatis Helper 是一款专为 MyBatis 开发者设计的 VSCode 插件，旨在提升 MyBatis 项目的开发效率。该插件通过提供控制台日志拦截、SQL 转换以及文件快速跳转等功能，帮助开发者更便捷地进行 MyBatis 应用的开发和调试。

## 功能特点

### 1. 控制台日志拦截与 SQL 转换

- 实时拦截 IDE 控制台中的 MyBatis 日志，自动解析参数化查询
- 将 MyBatis 参数化查询转换为可直接复制执行的完整 SQL 语句
- 智能识别并支持 MySQL、PostgreSQL、Oracle、SQL Server、达梦、人大金仓等多种数据库的 SQL 语法
- 精确提取并显示 SQL 执行时间、参数类型和值等关键信息
- 在独立的 "MyBatis SQL" 输出通道中展示格式化、高亮的 SQL 语句
- 自动保存 SQL 历史记录，方便回溯查询
- 支持一键清空 SQL 历史记录
- 支持用户自定义日志格式配置，以适应不同的日志输出模式
- 日志批处理机制：提高对大量日志的处理效率
- 批量处理延迟配置：可配置的批量处理延迟时间

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

### 1. 日志拦截与 SQL 转换

1. 确保在 VSCode 设置中启用了日志拦截器功能（默认已启用）
2. 运行你的 MyBatis 应用程序，查看控制台输出
3. 插件会自动识别并解析 MyBatis 的 SQL 日志
4. 解析后的 SQL 将通过 Webview 面板进行可视化显示
5. 你可以一键复制格式化后的 SQL 语句到剪贴板

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

| 快捷键                     | 功能                                | 适用场景                       |
| -------------------------- | ----------------------------------- | ------------------------------ |
| `Alt+L`                    | 切换日志拦截                        | 任何编辑器窗口（当插件激活时） |
| `Alt+X`                    | 从 Mapper 跳转到 XML                | 在 Java Mapper 接口文件中      |
| `Alt+M`                    | 从 XML 跳转到 Mapper                | 在 Mapper XML 文件中           |
| `Ctrl+Shift+P` + `MyBatis` | 打开命令面板并搜索 MyBatis 相关命令 | 任何编辑器窗口                 |

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

### 启用日志拦截器

- 配置项：`mybatis-helper.enableLogInterceptor`
- 说明：控制是否启用控制台日志拦截功能
- 默认值：`true`

### 自定义日志格式

- 配置项：`mybatis-helper.customLogPattern`
- 说明：当内置的日志格式无法满足需求时，可以自定义日志格式正则表达式
- 默认值：`''` (空字符串，使用内置的日志格式)

### 启用 CodeLens

- 配置项：`mybatis-helper.enableCodeLens`
- 说明：控制是否启用 CodeLens 功能
- 默认值：`true`

### SQL 历史记录大小

- 配置项：`mybatis-helper.sqlHistorySize`
- 说明：控制 SQL 历史记录的最大条目数
- 默认值：`100`

### 最大缓存大小

- 配置项：`mybatis-helper.maxCacheSize`
- 说明：控制文件映射缓存的最大条目数
- 默认值：`1000`

### 批量处理延迟时间

- 配置项：`mybatis-helper.batchProcessDelay`
- 说明：日志批量处理的延迟时间（毫秒）
- 默认值：`200`

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

### 完整配置示例

以下是一个完整的配置示例，展示了如何组合使用各种配置选项：

```json
{
  "mybatis-helper.databaseType": "mysql",
  "mybatis-helper.enableLogInterceptor": true,
  "mybatis-helper.customLogPattern": "",
  "mybatis-helper.enableCodeLens": true,
  "mybatis-helper.sqlHistorySize": 100,
  "mybatis-helper.maxCacheSize": 1000,
  "mybatis-helper.batchProcessDelay": 200,
  "mybatis-helper.fileOpenMode": "useExisting",
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
    },
    {
      "name": "Custom Repository",
      "enabled": true,
      "javaPattern": "*Repository",
      "xmlPattern": "${javaName}Mapper",
      "description": "Match UserRepository.java with UserRepositoryMapper.xml"
    }
  ],
  "mybatis-helper.ignoreSuffixes": ["Mapper", "Dao", "Repository"],
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

### Q: 如何配置自定义名称匹配规则？

A: 在VSCode设置中搜索`mybatis-helper.nameMatchingRules`，点击"在settings.json中编辑"，然后按照示例格式添加你的自定义规则。每个规则包含`name`、`enabled`、`javaPattern`、`xmlPattern`和`description`字段。

### Q: 如何使用通配符和变量？

A: 在`javaPattern`和`xmlPattern`中可以使用`*`匹配任意数量的字符，使用`?`匹配单个字符。在`xmlPattern`中可以使用`${javaName}`变量，它会被替换为Java文件名的基础部分（去掉后缀）。

### Q: 路径优先级配置如何提高匹配准确性？

A: 路径优先级配置通过以下方式提高匹配准确性：
1. 优先搜索包含`priorityDirectories`路径的文件
2. 排除包含`excludeDirectories`路径的文件
3. 根据路径深度和优先级对匹配结果进行排序

### Q: 如何调试文件匹配问题？

A: 可以通过以下方式调试文件匹配问题：
1. 检查VSCode开发者控制台的输出信息
2. 确认自定义名称匹配规则的配置是否正确
3. 验证路径优先级配置是否合理
4. 确认忽略后缀配置是否符合项目实际情况

### Q: 插件支持哪些版本的 VSCode？

**A:** 插件需要 VSCode 1.100.3 或更高版本才能正常运行。

---

**Q: 插件会影响 VSCode 的性能吗？**   

**A:** 我们已经对插件进行了全面优化，正常使用情况下不会对 VSCode 性能产生明显影响。在大型项目中，首次加载时可能会有短暂的扫描过程。

--- 

**Q: 如何自定义插件界面语言？**
**A:** 您可以在插件设置中找到 "Language" 选项，选择您偏好的界面语言。

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
- [Lingma](https://lingma.aliyun.com/)

---

希望这个插件能帮助您更高效地开发 MyBatis 应用！如有任何问题或建议，请随时在 [GitHub](https://github.com/Greenplumwine/vscode-mybatis-helper) 或 [Gitee](https://gitee.com/Greenplumwine/vscode-mybatis-helper) 上提交 Issue 或与我们联系。
