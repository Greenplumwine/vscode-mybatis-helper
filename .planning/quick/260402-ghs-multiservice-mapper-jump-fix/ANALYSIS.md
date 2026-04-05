# 多服务同名 Mapper 跳转问题分析

## 问题根源

### 1. 问题场景
多服务/多模块项目结构：
```
project/
├── service-a/
│   ├── src/main/java/com/a/mapper/UserMapper.java
│   └── src/main/resources/mapper/UserMapper.xml
├── service-b/
│   ├── src/main/java/com/b/mapper/UserMapper.java
│   └── src/main/resources/mapper/UserMapper.xml
```

### 2. 问题定位

**问题 1: `UnifiedNavigationService.findXmlByNamespace`**
- 当通过 namespace 查找 XML 时，如果找到多个同名文件，没有考虑 Java 文件的路径
- 只验证 namespace 是否匹配，没有考虑模块边界

**问题 2: `FastMappingEngine.getByClassName`**
- 使用简单类名索引，当多个 namespace 有相同简单类名时，只返回第一个
- 没有路径相似度匹配逻辑

**问题 3: `FastScanner.findBestMatchByFileName`**
- 虽然实现了文件名相似度匹配，但只基于文件名前缀
- 没有考虑完整路径的模块匹配

## 修复方案

### 方案 1: 增强路径相似度匹配
在 `findXmlByNamespace` 方法中，当找到多个候选 XML 时，优先选择与 Java 文件路径最相似的。

### 方案 2: 模块边界检测
通过检测 Java 文件所在模块（如 `service-a/src`），优先匹配同模块下的 XML 文件。

### 实现思路
1. 提取 Java 文件所在模块路径（如 `service-a`）
2. 遍历候选 XML 文件，计算每个 XML 文件路径与 Java 文件模块的匹配度
3. 优先选择路径包含相同模块名的 XML

## 修复文件
1. `src/features/mapping/UnifiedNavigationService.ts` - 增强 `findXmlByNamespace`
2. `src/features/mapping/FastMappingEngine.ts` - 增强 `getByClassName`
3. `src/features/mapping/fastScanner.ts` - 增强 `findBestMatchByFileName`
