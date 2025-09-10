![mybatis](static/icon/mybatis-helper-icon.png)

# MyBatis Helper

一个功能强大的 VSCode 插件，为 MyBatis 开发者提供全方位的辅助功能，大幅提升开发效率。

## 项目概述

MyBatis Helper 是一款专为 MyBatis 开发者设计的 VSCode 插件，旨在提升 MyBatis 项目的开发效率。该插件通过提供控制台日志拦截、SQL 转换以及文件快速跳转等功能，帮助开发者更便捷地进行 MyBatis 应用的开发和调试。插件采用 `onStartupFinished` 机制激活，确保在 VSCode 启动完成后自动初始化。

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

### 3. CodeLens 支持

- **Java 文件中的 CodeLens**：在 Java Mapper 接口的方法上方显示"跳转到 XML"的 CodeLens 提示
- **XML 文件中的 CodeLens**：在 XML 映射文件的 SQL 语句上方显示"跳转到 Mapper"的 CodeLens 提示
- **智能显示控制**：CodeLens 仅在检测到有效映射关系时显示，避免显示无效的跳转提示
- **点击直接跳转**：用户点击 CodeLens 提示可直接执行跳转操作，无需使用快捷键或右键菜单
- 提供配置选项允许用户启用或禁用 CodeLens 功能，默认启用

### 4. 国际化支持

- 支持多语言界面，能够根据 VSCode 的语言设置自动切换显示语言（支持英文和中文）

### 5. 用户友好的界面

- 简洁明了的命令菜单，所有功能一目了然
- 精心设计的快捷键体系，操作高效便捷
- 编辑器右键菜单深度集成，触手可及
- 实时状态反馈，操作结果即时可见
- 符合 VSCode 设计规范的用户体验，无缝融入开发环境
- SQL 结果可视化显示：提供 Webview 面板展示格式化和高亮的 SQL 结果
- Webview 交互功能：包含复制按钮、刷新按钮、搜索功能等
- 随机 nonce 生成：为 Webview 提供安全保障

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
4. 插件会自动打开对应的 XML 文件

#### 从 XML 文件跳转到 Java Mapper 接口

1. 将光标放在 XML 文件的 SQL 语句的 id 属性值上
2. 按下快捷键 `Alt+M`（Windows/Linux）或 `Option+M`（macOS）
3. 或者，右键点击并选择 "跳转到 Mapper 接口" 上下文菜单选项
4. 插件会自动打开对应的 Java Mapper 接口文件

#### 使用命令面板

1. 按下 `Ctrl+Shift+P`（Windows/Linux）或 `Command+Shift+P`（macOS）打开命令面板
2. 输入 "MyBatis" 查看所有可用命令
3. 选择相应的命令执行操作

### 3. 使用 CodeLens

1. 确保在 VSCode 设置中启用了 CodeLens 功能（默认已启用）
2. 打开 Java Mapper 接口文件
3. 在方法定义上方会出现 "跳转到 XML" 的 CodeLens
4. 点击该 CodeLens 直接跳转到对应的 XML 文件

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

### 日志格式要求

插件会自动识别标准的 MyBatis 日志格式：

```
Preparing: SELECT * FROM user WHERE id = ?
Parameters: 1(Integer)
```

如果您使用的是自定义日志格式，可以在插件设置中配置 `customLogPattern` 参数以适应您的日志输出格式。

### 项目结构支持

插件支持以下常见的项目结构和布局：

#### 标准 Maven/Gradle 项目

- `src/main/java` 目录下的 Mapper 接口
- `src/main/resources` 目录下的 XML 文件
- 保持相同包路径结构的 Mapper 和 XML 文件

#### 自定义项目结构

- 支持不同目录下的 Mapper 接口和 XML 文件
- 支持通过 namespace 属性映射的非标准布局
- 支持多模块 Maven/Gradle 项目

对于复杂项目结构，建议在项目导入后执行一次 "刷新映射关系" 命令，以确保插件能正确建立所有映射。

## 性能优化

为确保插件在大型项目中也能高效运行，我们采用了多种性能优化技术：

- **异步编程模型**: 所有 I/O 操作和计算密集型任务均异步执行，避免阻塞 VSCode 主线程
- **增量处理**: 对大型文件或项目结构采用增量处理策略，避免一次性加载所有数据
- **缓存机制**: 实现智能缓存策略，减少重复计算和文件读取操作
- **事件驱动架构**: 采用事件驱动的方式处理用户交互，确保界面响应迅速
- **按需激活**: 仅在检测到 Java 项目时才完全激活插件功能
- **精确文件查找**: 通过针对特定文件的精确查找替代全文件夹扫描，显著提高跳转效率
- **扫描节流控制**: 防止频繁的扫描操作
- **批量处理机制**: 对日志等数据进行批量处理，提高效率

**性能指标**:

- 插件启动时间不超过 2 秒
- 大型项目（1000+ 文件）扫描时间不超过 10 秒
- 单次 SQL 转换处理时间不超过 100 毫秒
- 内存占用峰值不超过 100MB

## 已知问题与限制

在使用插件过程中，可能会遇到以下限制和问题：

- **日志格式限制**: 某些非标准的自定义 MyBatis 日志格式可能无法被正确解析
- **大型项目性能**: 在非常大的项目中，首次扫描和建立映射关系可能需要一定时间
- **复杂项目结构**: 对于非常规项目结构，可能需要手动刷新映射关系或调整项目布局
- **特殊字符处理**: 在处理包含特殊字符的 SQL 参数时，可能会偶尔出现格式化问题
- **Java 项目检测**: 在某些特殊情况下，可能会出现误判，导致在非 Java 项目中错误激活插件或在 Java 项目中未能正确激活

我们正在持续改进插件，以解决这些问题并提升用户体验。

## 常见问题解答

#### 日志拦截相关问题

**Q: 为什么我的日志没有被拦截和解析？**
**A:** 请检查以下几点：

- 确保 MyBatis 日志级别设置正确（通常需要设置为 DEBUG 或 TRACE 级别）
- 确认日志格式符合标准的 MyBatis 输出格式，或已在设置中配置了正确的自定义日志格式
- 检查日志拦截功能是否已开启（可通过 `Alt+L` 切换状态）
- 对于自定义日志框架，请确保输出格式与标准格式兼容

**Q: 解析出的 SQL 格式有问题怎么办？**
**A:** 这可能是因为您使用的数据库方言与默认设置不匹配。请尝试在插件设置中调整数据库类型配置。

#### 文件跳转相关问题

**Q: 为什么找不到对应的 XML 文件或 Mapper 接口？**
**A:** 请尝试以下解决方案：

- 执行 "MyBatis: 刷新映射关系" 命令，重新扫描项目结构
- 检查 XML 文件中的 namespace 属性是否正确指向了 Mapper 接口
- 确认 Mapper 接口和 XML 文件命名是否符合匹配规则
- 对于复杂项目，可能需要手动调整文件结构以符合标准规范

**Q: 为什么没有显示 CodeLens 提示？**
**A:** 请确认：

- CodeLens 功能已在插件设置中启用（mybatisHelper.enableCodeLens 设为 true）
- VSCode 中已启用 CodeLens 功能（editor.codeLens 设置为 true）
- 文件中确实存在有效的映射关系

**Q: 快捷键不生效怎么办？**
**A:** 可能是快捷键冲突导致的。请尝试：

- 在 VSCode 键盘快捷方式设置中检查是否有冲突
- 重新配置插件快捷键
- 使用命令面板执行相应功能

#### 其他常见问题

**Q: 插件支持哪些版本的 VSCode？**
**A:** 插件需要 VSCode 1.100.3 或更高版本才能正常运行。

**Q: 插件会影响 VSCode 的性能吗？**
**A:** 我们已经对插件进行了全面优化，正常使用情况下不会对 VSCode 性能产生明显影响。在大型项目中，首次加载时可能会有短暂的扫描过程。

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

如果您发现了问题或者有新的功能建议，也欢迎在 GitHub 上提交 Issue。

## 许可证

本插件采用 MIT 许可证开源。详细信息请查看 [LICENSE](LICENSE) 文件。

## 致谢

感谢所有为本项目做出贡献的开发者和用户，以及以下开源技术的支持：

- [Visual Studio Code Extension API](https://code.visualstudio.com/api)
- [TypeScript](https://www.typescriptlang.org/)
- [MyBatis](https://mybatis.org/mybatis-3/)

---

希望这个插件能帮助您更高效地开发 MyBatis 应用！如有任何问题或建议，请随时在 [GitHub](https://github.com/Greenplumwine/vscode-mybatis-helper) 或 [Gitee](https://gitee.com/Greenplumwine/vscode-mybatis-helper) 上提交 Issue 或与我们联系。
