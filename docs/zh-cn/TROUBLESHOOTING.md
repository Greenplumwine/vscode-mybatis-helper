# MyBatis Helper - 故障排除指南

本指南帮助您解决 MyBatis Helper VS Code 扩展的常见问题。

---

## 目录

1. [导航不工作](#导航不工作)
2. [SQL 未出现在历史记录中](#sql-未出现在历史记录中)
3. [大型项目性能问题](#大型项目性能问题)
4. [配置问题](#配置问题)
5. [扩展未激活](#扩展未激活)
6. [CodeLens 不显示](#codelens-不显示)

---

## 导航不工作

### 问题：跳转到 XML/Java 命令无响应

#### 检查 1：Java 扩展是否安装

MyBatis Helper 需要 Red Hat Java 扩展 (`redhat.java`)。

**解决方案：**
1. 打开扩展面板 (`Ctrl+Shift+X`)
2. 搜索 "Extension Pack for Java"
3. 如未安装则安装
4. 重新加载 VS Code

#### 检查 2：文件类型检测

**解决方案：**
1. 检查 VS Code 右下角的语言模式
2. Java 文件：应显示 "Java"
3. XML 文件：应显示 "XML" 或 "MyBatis XML"
4. 如不正确，点击选择正确的语言模式

#### 检查 3：Mapper 检测

扩展需要识别您的文件为 Mapper。

**解决方案：**
1. 确保 Java 接口遵循命名约定 (`*Mapper.java`, `*Dao.java`)
2. 确保 XML 文件有正确的命名空间：`<mapper namespace="com.example.UserMapper">`
3. 检查命名空间是否与完全限定类名匹配

#### 检查 4：刷新映射

**解决方案：**
1. 打开命令面板 (`Ctrl+Shift+P`)
2. 运行 "MyBatis Helper: Refresh Mappings"
3. 等待索引完成

#### 检查 5：自定义项目结构

如果您的项目结构非标准：

**解决方案：**
在设置中添加自定义 XML 目录：
```json
{
  "mybatis-helper.customXmlDirectories": [
    "src/main/resources/custom-mappers",
    "config/mybatis"
  ]
}
```

---

## SQL 未出现在历史记录中

### 问题：SQL 历史视图为空

#### 检查 1：日志级别配置

MyBatis 必须以 DEBUG 级别记录才能捕获 SQL。

**Spring Boot (application.properties)：**
```properties
logging.level.com.example.mapper=DEBUG
logging.level.org.apache.ibatis=DEBUG
```

**MyBatis XML 配置：**
```xml
<settings>
    <setting name="logImpl" value="SLF4J"/>
</settings>
```

#### 检查 2：监听模式

**解决方案：**
在设置中尝试不同的监听模式：
```json
{
  "mybatis-helper.sqlInterceptor.listenMode": "debugConsole"
}
```

可选值：`auto`, `debugConsole`, `terminal`

#### 检查 3：SQL 拦截器状态

**解决方案：**
1. 检查 SQL 历史视图工具栏
2. 确保显示 ⏸️（暂停）按钮，表示正在运行
3. 如果显示 ▶️（播放），点击启动拦截器

#### 检查 4：日志格式

**解决方案：**
确保日志格式匹配内置规则：
```
==>  Preparing: SELECT * FROM user WHERE id = ?
==> Parameters: 123(Integer)
```

如果不匹配，添加自定义规则：
```json
{
  "mybatis-helper.sqlInterceptor.customRules": [
    {
      "name": "my-format",
      "enabled": true,
      "lineMatchRegex": "SQL:",
      "sqlExtractRegex": "SQL:\\s*(.+)"
    }
  ]
}
```

---

## 大型项目性能问题

### 问题：扩展在大型项目中运行缓慢

#### 解决方案 1：使用 Enterprise Scanner

对于大型/单体项目：
```json
{
  "mybatis-helper.scanner.type": "enterprise",
  "mybatis-helper.scanner.maxWorkers": 4
}
```

#### 解决方案 2：排除大目录

```json
{
  "mybatis-helper.pathPriority.excludeDirectories": [
    "/build/",
    "/target/",
    "/node_modules/",
    "/.git/"
  ]
}
```

#### 解决方案 3：增加内存

在 VS Code 设置中：
```json
{
  "java.jdt.ls.vmargs": "-XX:+UseParallelGC -XX:GCTimeRatio=4 -XX:AdaptiveSizePolicyWeight=90 -Dsun.zip.disableMemoryMapping=true -Xmx4G -Xms100m"
}
```

---

## 配置问题

### 问题：配置不生效

#### 检查 1：配置位置

**解决方案：**
- 用户设置：适用于所有项目
- 工作区设置：仅当前项目（推荐）

#### 检查 2：配置验证

**解决方案：**
1. 打开命令面板
2. 运行 "MyBatis Helper: Validate Configuration"
3. 查看输出通道中的问题

#### 检查 3：JSON 格式

**解决方案：**
确保 settings.json 格式正确：
```json
{
  "mybatis-helper.databaseType": "mysql",
  "mybatis-helper.sqlInterceptor.listenMode": "auto"
}
```

---

## 扩展未激活

### 问题：MyBatis Helper 命令不可用

#### 检查 1：激活事件

**解决方案：**
扩展在检测到以下文件时激活：
- `pom.xml`（Maven 项目）
- `build.gradle`（Gradle 项目）

确保项目根目录有这些文件之一。

#### 检查 2：手动激活

**解决方案：**
1. 打开命令面板
2. 运行 "Developer: Reload Window"
3. 等待扩展激活

---

## CodeLens 不显示

### 问题：Java Mapper 接口中没有 "跳转到 XML" 提示

#### 检查 1：CodeLens 启用

**解决方案：**
```json
{
  "mybatis-helper.enableCodeLens": true,
  "editor.codeLens": true
}
```

#### 检查 2：有效映射

**解决方案：**
CodeLens 仅在检测到有效映射时显示：
1. 确保 XML 文件存在
2. 确保命名空间正确
3. 确保方法名匹配

#### 检查 3：刷新映射

**解决方案：**
1. 运行 "MyBatis Helper: Refresh Mappings"
2. 等待索引完成
3. 重新打开 Java 文件

---

## 获取帮助

如果以上解决方案无法解决您的问题：

1. **查看日志**：打开 "MyBatis Helper" 输出通道查看详细日志
2. **运行诊断**：使用 "MyBatis Helper: Diagnose" 命令
3. **提交 Issue**：在 [GitHub](https://github.com/jingzepei/mybatis-helper) 上提交问题

---

*最后更新：2026-03-25*
