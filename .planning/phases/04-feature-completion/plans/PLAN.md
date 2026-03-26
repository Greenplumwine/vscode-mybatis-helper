# Phase 04: Feature Completion - 总体计划

**阶段目标：** 完成 MyBatis Helper v1.0.0 版本的剩余功能

**成功标准：**
- 代码补全准确率 > 85%
- 格式化覆盖率 > 95%
- 生成的代码编译成功率 > 95%

---

## 计划概览

| 计划 | 名称 | Wave | 依赖 | 目标 |
|------|------|------|------|------|
| 04-01 | Java 类型信息集成 | 1 | - | @Param 解析、JLS 通信、参数缓存 |
| 04-02 | 属性补全增强 | 2 | 04-01 | 2 级属性导航、JDK 类型过滤、自适应策略 |
| 04-03 | 格式化改进 | 3 | - | SQL Server/SQLite 方言、范围格式化 |
| 04-04 | 模板质量改进 | 4 | - | 智能表名推断、WHERE 子句提示、resultMap 引用 |

---

## Wave 结构

```
Wave 1: 04-01 (Java 类型信息集成)
    |
Wave 2: 04-02 (属性补全增强)
    |
Wave 3: 04-03 (格式化改进)
    |
Wave 4: 04-04 (模板质量改进)
```

**并行性说明：**
- Wave 1 和 Wave 3 可以并行执行（无依赖关系）
- Wave 2 依赖 Wave 1（需要参数解析功能）
- Wave 4 独立，可以在任何时候执行

---

## 详细计划

### Plan 04-01: Java 类型信息集成

**目标：** 实现 Java 类型信息集成，提升代码补全准确性

**文件修改：**
- `src/features/mapping/fastMappingEngine.ts`
- `src/services/parsing/javaMethodParser.ts`
- `src/features/completion/types.ts`

**关键决策实现：**
- D-01: 使用 Java Language Server 直接通信获取类型信息
- D-02: 在 Mapper 扫描阶段预解析方法参数和 @Param 注解

**任务：**
1. 实现 @Param 注解解析
2. 集成 JLS 类型解析
3. 在 FastMappingEngine 中缓存参数信息

**验证标准：**
- @Param 注解解析准确率 > 95%
- JLS 类型解析响应时间 < 500ms
- 参数缓存命中率 > 80%

---

### Plan 04-02: 属性补全增强

**目标：** 增强属性补全策略，支持多级属性导航和自适应性能策略

**文件修改：**
- `src/features/completion/strategies/propertyStrategy.ts`
- `src/features/completion/unifiedCompletionProvider.ts`
- `src/features/completion/types.ts`

**关键决策实现：**
- D-03: 支持 2 级属性导航，JDK 类型不展开
- D-04: 基于项目大小的自适应策略（小/中/大项目不同深度）

**任务：**
1. 实现 2 级属性导航
2. 实现 JDK 类型过滤
3. 实现自适应性能策略

**验证标准：**
- 2 级属性导航准确率 > 90%
- JDK 类型过滤覆盖率 100%
- 各项目规模下响应时间符合要求

---

### Plan 04-03: 格式化改进

**目标：** 改进格式化功能，添加新 SQL 方言支持并实现真正的范围格式化

**文件修改：**
- `src/features/formatting/pipeline/sqlFormatter.ts`
- `src/features/formatting/nestedFormattingProvider.ts`
- `package.json`

**关键决策实现：**
- D-05: 添加 SQL Server 和 SQLite 方言支持
- D-07: 实现真正的范围格式化（替代 TODO 简化实现）

**任务：**
1. 添加 SQL Server 和 SQLite 方言支持
2. 实现范围格式化
3. 优化格式化性能和边界处理

**验证标准：**
- SQL Server 格式化准确率 > 90%
- SQLite 格式化准确率 > 90%
- 范围格式化正确率 > 95%

---

### Plan 04-04: 模板质量改进

**目标：** 改进代码生成模板，提升生成代码的质量和准确性

**文件修改：**
- `src/services/template/templateEngine.ts`
- `src/utils/stringUtils.ts`
- `src/commands/generateXmlMethod.ts`

**关键决策实现：**
- D-06: 改进表名推断（正确处理 By 后缀）
- D-06: 智能 SQL 结构生成（WHERE 子句提示）
- D-06: 正确的 resultMap 引用生成

**任务：**
1. 改进表名推断逻辑
2. 实现智能 SQL 结构生成
3. 实现 resultMap 引用生成

**验证标准：**
- 表名推断准确率 > 90%
- 生成的代码编译成功率 > 95%
- WHERE 子句提示准确率 > 85%

---

## 风险区域

### 高风险
1. **JLS 依赖风险** (04-01)
   - redhat.java 扩展可能未安装或不可用
   - 缓解：实现可靠的降级机制

2. **递归风险** (04-02)
   - 循环引用类型可能导致无限递归
   - 缓解：实现递归深度限制和循环检测

### 中风险
3. **方言差异风险** (04-03)
   - SQL Server T-SQL 语法复杂
   - 缓解：使用成熟的 sql-formatter 库

4. **命名约定风险** (04-04)
   - 不同团队的方法命名习惯不同
   - 缓解：提供配置选项覆盖默认行为

---

## 执行顺序

### 推荐的执行顺序：

**选项 A: 顺序执行（保守）**
```
04-01 → 04-02 → 04-03 → 04-04
```

**选项 B: 并行执行（高效）**
```
Wave 1: 04-01 + 04-03（并行）
Wave 2: 04-02（依赖 04-01）
Wave 3: 04-04（独立，可与 Wave 2 并行）
```

---

## 验收检查清单

- [ ] 04-01: @Param 解析正确，JLS 通信正常
- [ ] 04-02: 2 级属性导航工作，JDK 类型过滤生效
- [ ] 04-03: SQL Server/SQLite 方言支持，范围格式化正确
- [ ] 04-04: 表名推断改进，智能 SQL 生成
- [ ] 整体：补全准确率 > 85%
- [ ] 整体：格式化覆盖率 > 95%
- [ ] 整体：生成代码编译成功率 > 95%

---

## 计划文件

| 文件 | 描述 |
|------|------|
| `04-01-PLAN.md` | Java 类型信息集成计划 |
| `04-02-PLAN.md` | 属性补全增强计划 |
| `04-03-PLAN.md` | 格式化改进计划 |
| `04-04-PLAN.md` | 模板质量改进计划 |

---

*创建时间: 2026-03-26*
*阶段: 04-feature-completion*
