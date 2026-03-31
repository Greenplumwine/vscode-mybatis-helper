---
created: 2026-03-31T06:52:13.820Z
title: 构建高性能 Java 解析器替代 JDTLS，提升解析速度与准确度
area: parsing
files:
  - src/services/parsing/
  - src/features/mapping/
---

## Problem

当前 MyBatis Helper 依赖 Red Hat Java 扩展（JDTLS）进行 Java 代码解析，存在以下问题：

1. **性能瓶颈**：JDTLS 需要完整加载 Java 项目，启动慢，内存占用高
2. **依赖过重**：必须等待 Java 扩展完全初始化后才能使用 MyBatis 功能
3. **解析精度有限**：对于复杂的泛型、注解处理、类型推断等场景支持不够完善
4. **跨平台问题**：JDTLS 在不同操作系统上的表现不一致
5. **可控性差**：无法针对 MyBatis 场景做专门优化

具体影响：
- 大型项目启动时需要等待数十秒甚至更久
- 内存占用随项目规模线性增长
- 某些复杂的 Mapper 接口方法签名无法正确解析

## Solution

### 方案对比

| 方案 | 语言 | 优点 | 缺点 |
|------|------|------|------|
| 优化 JDTLS 集成 | Java | 利用现有生态 | 仍受限于 JDTLS 架构 |
| 自研解析器 (Go) | Go | 高性能、易部署 | 需实现完整 Java 语法解析 |
| 自研解析器 (Rust) | Rust | 极致性能、内存安全 | 学习曲线陡峭、开发周期长 |
| 自研解析器 (C/C++) | C/C++ | 性能最优 | 维护成本高、安全性风险 |

### 推荐方向：Rust 实现专用 Java 解析器

**原因**：
- 性能接近 C/C++，但内存安全
- 优秀的并发处理能力，适合大型项目扫描
- 可编译为 WASM 或动态链接库供 Node.js 调用
- 现代工具链和包管理

### 核心功能模块

1. **轻量级 Java 源码解析器**
   - 使用 `tree-sitter` 或自研递归下降解析器
   - 支持 Java 8-21 语法特性
   - 专注于 MyBatis 相关语法（接口、注解、方法签名）

2. **类型推断引擎**
   - 基于文件级和项目级的类型解析
   - 支持泛型、通配符、嵌套类型
   - 与 Maven/Gradle 依赖解析集成

3. **增量更新机制**
   - 文件变更监听
   - 增量解析，只更新变更部分
   - 缓存策略优化

4. **VS Code 集成**
   - 通过 Node-API 或 WASM 与扩展通信
   - 保持现有 API 接口兼容
   - 渐进式替换 JDTLS 依赖

### 预期收益

- **速度提升**：解析速度提升 5-10 倍
- **内存降低**：内存占用减少 50% 以上
- **准确度提升**：针对 MyBatis 场景专门优化
- **独立性**：不再依赖 Red Hat Java 扩展

### 参考资源

- [tree-sitter-java](https://github.com/tree-sitter/tree-sitter-java)
- [rust-analyzer](https://github.com/rust-lang/rust-analyzer) - 优秀的 LSP 实现参考
- [javalang](https://github.com/c2nes/javalang) - Python Java 解析器参考
