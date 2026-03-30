# MyBatis Helper v1.0.0 发布说明

## 概述

MyBatis Helper v1.0.0 是一个重要的里程碑版本，带来了全面的功能增强、性能优化和开发者体验改进。这个版本从 v0.0.8 开始经历了 4 个主要阶段的开发，包括安全修复、性能优化、开发者体验改进和功能完善。

## 主要亮点

### 🚀 Java 类型信息集成
- **@Param 注解解析**：正确处理 MyBatis 的 @Param 注解，实现参数名到类型的映射
- **嵌套属性补全**：支持 `user.address.city` 这样的多级属性导航
- **JDK 类型过滤**：智能过滤 String、Integer 等 JDK 类型，避免无意义的属性展开
- **Java 语言服务器集成**：利用 VS Code Java 扩展提供准确的类型信息

### ⚡ 性能优化
- **两级正则缓存**：热缓存（50）+ 冷缓存（50）策略，显著提升重复匹配性能
- **定时缓存清理**：FastMappingEngine 每 30 分钟自动清理过期缓存
- **异步文件操作**：扫描器热路径采用异步 I/O，避免阻塞 UI
- **性能监控**：内置性能统计命令，实时监控扩展性能

### 🛡️ 安全加固
- **命令注入防护**：将所有 `execSync` 替换为 `execFileSync`，使用数组参数避免注入
- **路径清理**：新增路径安全工具类，验证和清理用户输入路径
- **安全测试**：18 个单元测试覆盖路径安全功能

### ✨ 开发者体验
- **欢迎页面**：首次安装时显示功能介绍和快速设置清单
- **配置向导**：4 步配置向导，引导用户完成初始设置
- **配置验证**：实时验证配置并提供可操作的修复建议
- **诊断工具**：增强的诊断命令，提供系统健康检查
- **示例项目**：包含完整的 MyBatis 示例项目

### 🎨 代码质量
- **格式化增强**：新增 SQL Server 和 SQLite 方言支持
- **模板改进**：更智能的表名推断和 SQL 结构生成
- **范围格式化**：实现完整的范围格式化功能

## 升级指南

### 从 v0.0.8 升级

v1.0.0 与 v0.0.8 完全向后兼容，用户可以直接升级。新功能会自动启用：

1. **Java 类型信息**：无需配置，自动利用 Java 语言服务器
2. **性能优化**：自动生效，无需手动干预
3. **欢迎页面**：仅在首次安装时显示，可在命令面板中重新打开

### 配置变更

v1.0.0 新增以下配置选项：

```json
{
  "mybatis-helper.formatting.sql.dialect": "mysql",
  "mybatis-helper.formatting.sql.keywordCase": "upper",
  "mybatis-helper.formatting.sql.maxLineLength": 120,
  "mybatis-helper.completion.enableSmartCompletion": true,
  "mybatis-helper.showWelcome": true
}
```

## 已知问题

- 首次启动时，Java 类型信息可能需要几秒钟初始化
- 超大型项目（>1000 个 Mapper 文件）的扫描可能需要较长时间

## 反馈与支持

- **GitHub Issues**: https://github.com/Greenplumwine/vscode-mybatis-helper/issues
- **Gitee Issues**: https://gitee.com/greenplumwine/vscode-mybatis-helper/issues

## 致谢

感谢所有提供反馈和建议的用户。v1.0.0 的发布离不开社区的支持！

---

**完整变更日志**: 参见 [CHANGELOG.md](../CHANGELOG.md)
