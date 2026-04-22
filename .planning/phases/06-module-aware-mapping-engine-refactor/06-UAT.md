---
status: testing
phase: 06-module-aware-mapping-engine-refactor
source:
  - 06-P02-SUMMARY.md
  - 06-P03-SUMMARY.md
  - 06-P04-SUMMARY.md
  - PLAN.md
started: 2026-04-22T02:45:00Z
updated: 2026-04-22T02:45:00Z
---

## Current Test

number: 1
name: 多模块同名 Mapper 正确跳转
expected: |
  打开一个包含两个子模块的 Maven 多模块项目（如 service-a 和 service-b），
  两个模块中都有 namespace 为 com.example.mapper.UserMapper 的 Java Mapper 接口和对应 XML。
  在 service-a 的 UserMapper.java 中点击某个方法，应跳转到 service-a 的 UserMapper.xml；
  在 service-b 的 UserMapper.java 中点击同一方法，应跳转到 service-b 的 UserMapper.xml。
  反向从 XML 跳转到 Java 也应遵循同样的模块边界。
awaiting: user response

## Tests

### 1. 多模块同名 Mapper 正确跳转
expected: |
  打开 Maven 多模块项目（含 service-a、service-b），两模块都有同名 UserMapper。
  Java → XML 跳转和 XML → Java 跳转均遵循模块边界，不会串到另一个模块的对应文件。
result: [pending]

### 2. 单模块项目导航无回归
expected: |
  打开一个普通的单模块 Spring Boot 项目（只有一层 pom.xml）。
  Java Mapper 接口和 XML Mapper 之间的双向跳转行为与重构前完全一致，
  不会出现找不到映射或跳转到错误文件的情况。
result: [pending]

### 3. XML CodeLens 正常显示并可跳转
expected: |
  打开任意 MyBatis XML Mapper 文件，namespace 行上方显示 "Jump to Java: XxxMapper" CodeLens，
  每个 SQL 语句（select/insert/update/delete）上方显示 "Jump to Method: methodName" CodeLens。
  点击 CodeLens 能正确跳转到对应的 Java 方法定义位置。
result: [pending]

### 4. 参数和属性补全不受影响
expected: |
  在 XML 的 SQL 语句中输入 #{ 或 ${ 时，能正确提示 Java 方法的参数名（含 @Param 注解名）。
  输入 #{obj. 时能正确提示对象属性列表。
  resultType=" 时能正常提示 Java 类型补全。
  所有补全行为与重构前一致。
result: [pending]

### 5. 插件激活与扫描正常完成
expected: |
  打开一个多模块项目，等待插件激活完成（状态栏显示扫描进度）。
  扫描完成后，打开 Output 面板选择 "MyBatis Helper" 通道，
  应看到类似 "Built X mappings in Yms" 的日志，无报错。
  点击任意 Java/XML Mapper 文件，导航功能立即可用，无需等待。
result: [pending]

### 6. 无模块信息的简单项目兼容
expected: |
  打开一个无 pom.xml / build.gradle 的简单 Java 项目（只有目录结构）。
  插件激活后，Java-XML 导航功能仍然可用，
  fallback 到 "default" 模块处理，不会出现无法跳转的情况。
result: [pending]

## Summary

total: 6
passed: 0
issues: 0
pending: 6
skipped: 0
blocked: 0

## Gaps

[none yet]
