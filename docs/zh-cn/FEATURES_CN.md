# MyBatis Helper - 功能指南

本文档详细介绍 MyBatis Helper VS Code 扩展的所有功能。

---

## 目录

1. [Java-XML 导航](#java-xml-导航)
2. [SQL 拦截器](#sql-拦截器)
3. [代码补全](#代码补全)
4. [代码生成](#代码生成)
5. [格式化](#格式化)
6. [CodeLens](#codelens)

---

## Java-XML 导航

### 双向跳转

在 Java Mapper 接口和 XML 映射文件之间快速跳转。

**Java 到 XML：**
- 快捷键：`Ctrl+Alt+J`（Windows/Linux）或 `Ctrl+Option+J`（macOS）
- 右键菜单："跳转到 XML 文件"
- CodeLens：点击 "跳转到 XML" 提示

**XML 到 Java：**
- 快捷键：`Ctrl+Alt+M`（Windows/Linux）或 `Ctrl+Option+M`（macOS）
- 右键菜单："跳转到 Mapper 接口"

### 精确方法定位

导航不仅打开文件，还会定位到具体的方法位置。

### 智能映射检测

扩展自动：
- 扫描项目结构建立映射关系
- 识别标准 Maven/Gradle 结构
- 支持自定义项目布局
- 缓存映射以提高性能

---

## SQL 拦截器

### 实时 SQL 捕获

自动拦截 MyBatis 执行的 SQL 语句。

**支持的日志来源：**
- Debug Console
- Integrated Terminal
- 自动检测（推荐）

**捕获的信息：**
- SQL 语句（带参数替换）
- 执行时间
- 参数列表
- 时间戳

### SQL 历史视图

侧边栏显示捕获的 SQL 列表：
- 最近 500 条 SQL（可配置）
- 实时更新
- 点击展开详情

### SQL 详情面板

**格式化 SQL：**
- 语法高亮
- 格式化显示
- 可直接复制执行

**原始 SQL：**
- 带 `?` 占位符的原始语句
- 参数列表

**复制选项：**
- 复制格式化 SQL
- 复制带参数注释的 SQL

### 监听模式

| 模式 | 说明 | 适用场景 |
|------|------|----------|
| `auto` | 自动检测 | 推荐 |
| `debugConsole` | 仅 Debug Console | 使用 internalConsole |
| `terminal` | 仅 Terminal | 使用 integratedTerminal |

---

## 代码补全

### 参数补全

在 XML 中输入 `#{` 或 `${}` 时自动提示：
- 方法参数名称
- 参数类型
- 嵌套对象属性（如 `#{user.name}`）

### 触发条件

- 在 `<select>`, `<insert>`, `<update>`, `<delete>` 标签内
- 输入 `#{` 或 `${` 后
- 基于对应的 Java 方法参数

---

## 代码生成

### 从 Java 生成 XML

在 Java Mapper 接口中：
1. 右键点击方法
2. 选择 "生成 XML 方法"
3. 自动在对应 XML 中创建 SQL 框架

### 创建 Mapper XML

1. 打开命令面板
2. 运行 "MyBatis Helper: Create Mapper XML"
3. 选择 Java Mapper 接口
4. 自动生成 XML 文件框架

---

## 格式化

### SQL 格式化

支持的数据库：
- MySQL / MariaDB
- PostgreSQL
- Oracle
- SQL Server
- SQLite
- DB2
- H2

**配置：**
```json
{
  "mybatis-helper.databaseType": "mysql"
}
```

### XML 格式化

嵌套 SQL 的 XML 格式化支持。

---

## CodeLens

### 显示条件

仅在以下情况显示：
- 文件是 Java Mapper 接口
- 检测到有效的 XML 映射
- 方法在 XML 中存在

### 使用方式

点击 "跳转到 XML" 直接跳转，无需快捷键。

### 配置

```json
{
  "mybatis-helper.enableCodeLens": true
}
```

---

## 欢迎页面

首次安装后显示：
- 功能介绍卡片
- 快速设置检查清单
- 操作按钮（打开示例、配置、查看文档）

## 配置向导

4 步配置向导：
1. 项目类型检测（Maven/Gradle）
2. XML 目录配置
3. 命名约定选择
4. SQL 拦截模式

## 配置验证

实时验证配置：
- 路径是否存在
- 正则是否有效
- 枚举值是否正确

## 诊断命令

运行 "MyBatis Helper: Diagnose" 查看：
- 环境信息
- 项目检测
- 映射状态
- SQL 拦截器状态
- 配置验证结果
- 建议

---

*最后更新：2026-03-25*
