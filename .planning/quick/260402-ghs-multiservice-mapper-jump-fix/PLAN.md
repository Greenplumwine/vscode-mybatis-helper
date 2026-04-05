# Quick Task Plan: 修复多服务同名 Mapper 跳转问题

## Goal
修复多模块/多服务项目中，同名 Mapper 接口和 XML 文件之间的跳转不准确问题。

## 任务清单

### 任务 1: 增强 UnifiedNavigationService.findXmlByNamespace
- **文件**: `src/features/mapping/UnifiedNavigationService.ts`
- **修改**: 在找到多个候选 XML 时，使用路径相似度匹配算法优先选择同模块下的 XML
- **关键逻辑**:
  - 提取 Java 文件所在的模块/服务路径（向上查找到 `src` 或项目根目录）
  - 为每个候选 XML 计算路径相似度得分
  - 优先选择得分最高的 XML

### 任务 2: 增强 FastMappingEngine.getByClassName
- **文件**: `src/features/mapping/FastMappingEngine.ts`
- **修改**: 当通过类名找到多个候选时，如果调用方提供了参考路径，使用路径相似度选择最佳匹配

### 任务 3: 增强 FastScanner.findBestMatchByFileName
- **文件**: `src/features/mapping/fastScanner.ts`
- **修改**: 扩展相似度计算，包含完整路径而不仅是文件名

### 任务 4: 代码编译和验证
- 运行 `npm run compile` 确保无语法错误
- 运行 `npm run lint` 确保代码规范

## 依赖关系
```
任务 1 (UnifiedNavigationService)
    |
任务 2 (FastMappingEngine)
    |
任务 3 (FastScanner)
    |
任务 4 (验证)
```

## 验证标准
- 编译无错误
- Lint 检查通过
