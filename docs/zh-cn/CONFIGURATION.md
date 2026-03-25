# MyBatis Helper - 配置说明

本文档详细介绍 MyBatis Helper 的所有配置选项。

---

## 目录

1. [快速参考](#快速参考)
2. [数据库配置](#数据库配置)
3. [SQL 拦截器配置](#sql-拦截器配置)
4. [导航配置](#导航配置)
5. [格式化配置](#格式化配置)
6. [完整配置示例](#完整配置示例)

---

## 快速参考

| 配置项 | 类型 | 默认值 | 说明 |
|--------|------|--------|------|
| `databaseType` | string | `mysql` | 数据库类型 |
| `sqlInterceptor.listenMode` | string | `auto` | SQL 监听模式 |
| `sqlInterceptor.autoStart` | boolean | `true` | 自动启动拦截 |
| `enableCodeLens` | boolean | `true` | 启用 CodeLens |
| `showWelcome` | boolean | `true` | 显示欢迎页面 |

---

## 数据库配置

### databaseType

设置项目使用的数据库类型，影响 SQL 格式化和语法高亮。

```json
{
  "mybatis-helper.databaseType": "mysql"
}
```

**可选值：**
- `mysql` - MySQL
- `postgresql` - PostgreSQL
- `oracle` - Oracle
- `sqlserver` - SQL Server
- `sqlite` - SQLite
- `db2` - DB2
- `h2` - H2
- `mariadb` - MariaDB

---

## SQL 拦截器配置

### sqlInterceptor.listenMode

选择 SQL 日志的监听来源。

```json
{
  "mybatis-helper.sqlInterceptor.listenMode": "auto"
}
```

**可选值：**
- `auto` - 自动检测（推荐）
- `debugConsole` - 仅监听 Debug Console
- `terminal` - 仅监听 Terminal

### sqlInterceptor.autoStart

控制插件激活时是否自动启动 SQL 拦截。

```json
{
  "mybatis-helper.sqlInterceptor.autoStart": true
}
```

### sqlInterceptor.maxHistorySize

SQL 历史记录最大条数。

```json
{
  "mybatis-helper.sqlInterceptor.maxHistorySize": 500
}
```

**范围：** 10 - 1000

### sqlInterceptor.autoScrollBehavior

自动滚动行为。

```json
{
  "mybatis-helper.sqlInterceptor.autoScrollBehavior": "onlyWhenNotInteracting"
}
```

**可选值：**
- `always` - 始终自动滚动
- `onlyWhenNotInteracting` - 仅未交互时滚动
- `never` - 从不自动滚动

### sqlInterceptor.customRules

自定义 SQL 解析规则。

```json
{
  "mybatis-helper.sqlInterceptor.customRules": [
    {
      "name": "custom-rule",
      "enabled": true,
      "lineMatchRegex": "SQL:",
      "sqlExtractRegex": "SQL:\\s*(.+)",
      "parametersExtractRegex": "PARAMS:\\s*(.+)",
      "paramParseRegex": "([^,]+)\\(([^)]+)\\)"
    }
  ]
}
```

**字段说明：**
- `name` - 规则名称
- `enabled` - 是否启用
- `lineMatchRegex` - 匹配日志行的正则
- `sqlExtractRegex` - 提取 SQL 的正则
- `parametersExtractRegex` - 提取参数的正则
- `paramParseRegex` - 解析单个参数的正则

---

## 导航配置

### customXmlDirectories

自定义 XML 文件目录。

```json
{
  "mybatis-helper.customXmlDirectories": [
    "src/main/resources/mappers",
    "config/mybatis"
  ]
}
```

### nameMatchingRules

自定义名称匹配规则。

```json
{
  "mybatis-helper.nameMatchingRules": [
    {
      "name": "Default Mapper",
      "enabled": true,
      "javaPattern": "*Mapper",
      "xmlPattern": "${javaName}",
      "description": "匹配 UserMapper.java 和 User.xml"
    }
  ]
}
```

### pathPriority

路径优先级配置。

```json
{
  "mybatis-helper.pathPriority": {
    "enabled": true,
    "priorityDirectories": [
      "/src/main/resources/mapper/"
    ],
    "excludeDirectories": [
      "/build/",
      "/target/"
    ]
  }
}
```

### fileOpenMode

文件打开模式。

```json
{
  "mybatis-helper.fileOpenMode": "useExisting"
}
```

**可选值：**
- `useExisting` - 使用已有窗口
- `noSplit` - 不拆分窗口
- `alwaysSplit` - 始终拆分窗口

### enableCodeLens

启用 CodeLens 功能。

```json
{
  "mybatis-helper.enableCodeLens": true
}
```

### showWelcome

显示欢迎页面。

```json
{
  "mybatis-helper.showWelcome": true
}
```

---

## 格式化配置

### formatting.sql.dialect

SQL 格式化方言。

```json
{
  "mybatis-helper.formatting.sql.dialect": "mysql"
}
```

---

## 完整配置示例

```json
{
  "mybatis-helper.databaseType": "mysql",
  "mybatis-helper.enableCodeLens": true,
  "mybatis-helper.showWelcome": true,
  "mybatis-helper.fileOpenMode": "useExisting",

  "mybatis-helper.sqlInterceptor.listenMode": "auto",
  "mybatis-helper.sqlInterceptor.autoStart": true,
  "mybatis-helper.sqlInterceptor.maxHistorySize": 500,
  "mybatis-helper.sqlInterceptor.autoScrollBehavior": "onlyWhenNotInteracting",

  "mybatis-helper.customXmlDirectories": [
    "src/main/resources/mappers"
  ],

  "mybatis-helper.nameMatchingRules": [
    {
      "name": "Default Mapper",
      "enabled": true,
      "javaPattern": "*Mapper",
      "xmlPattern": "${javaName}"
    }
  ],

  "mybatis-helper.pathPriority": {
    "enabled": true,
    "priorityDirectories": [
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

---

*最后更新：2026-03-25*
