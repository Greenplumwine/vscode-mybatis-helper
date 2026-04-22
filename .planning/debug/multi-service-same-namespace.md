---
status: fixed
trigger: >
  多个 Spring Boot 服务同名 Mapper 和 XML 跳转不准确。
  服务 B 可以正常跳转，服务 A 不行，两个服务使用相同包名。
  Issue: https://github.com/Greenplumwine/vscode-mybatis-helper/issues/7
symptoms:
  expected: >
    在多服务项目中，每个服务的 Mapper 应该能正确跳转到自己对应的 XML 文件，
    即使不同服务有相同包名和类名的 Mapper。
  actual: >
    服务 A 的 Mapper 跳转不准确，可能跳转到服务 B 的 XML 文件，或无法跳转。
  error_messages: 无明确错误信息，但跳转位置不正确
  timeline: 用户报告最新版本修复后问题依然存在
  reproduction: >
    1. 创建多服务 Spring Boot 项目
    2. 服务 A 和服务 B 使用相同的包名（如 com.example.mapper）
    3. 两个服务有同名的 Mapper 接口和 XML 文件
    4. 尝试从服务 A 的 Mapper 跳转到 XML

hypothesis: >
  1. calculatePathScore 在比较模块名时可能找错了目录层级
  2. getByNamespace 在没有 referencePath 时返回第一个匹配项
  3. navigateXmlToJava 时 xmlPath 作为 referencePath 传递可能有问题

tests:
  - description: 验证路径相似度计算逻辑在多服务场景下的正确性
    status: pending

next_action: 分析路径匹配算法的具体实现问题

evidence:
  - timestamp: 2026-04-21T14:15:00+08:00
    finding: >
      FastNavigationService.findXmlByNamespace(namespace) 调用 getByNamespace 时未传入 javaPath 参考路径
    file: src/features/mapping/fastNavigationService.ts:268
  - timestamp: 2026-04-21T14:16:00+08:00
    finding: >
      UnifiedNavigationService.findXmlByNamespace(namespace, javaPath) 中检查索引时也未将 javaPath 传给 getByNamespace
    file: src/features/mapping/unifiedNavigationService.ts:388
  - timestamp: 2026-04-21T14:17:00+08:00
    finding: >
      FastNavigationService.navigateJavaToXml 调用 findXmlByNamespace(mapping.namespace) 未传入 javaPath
    file: src/features/mapping/fastNavigationService.ts:95
  - timestamp: 2026-04-21T14:26:00+08:00
    finding: >
      xmlCodeLensProvider.ts 中 provideCodeLenses 调用 getByNamespace(xmlInfo.namespace) 未传入 filePath 参考路径，
      导致多服务场景下 CodeLens 可能显示错误的 Java 文件路径
    file: src/features/mapping/xmlCodeLensProvider.ts:62
  - timestamp: 2026-04-21T14:27:00+08:00
    finding: >
      fastScanner.ts rescanXmlFile 中 getByNamespace(mapper.namespace) 和 getByClassName(mapper.namespace)
      均未传入 filePath 参考路径，重新扫描 XML 时可能关联到错误的 Java 映射
    file: src/features/mapping/fastScanner.ts:881,896
  - timestamp: 2026-04-21T14:28:00+08:00
    finding: >
      enterpriseScanner.ts rescanXmlFile 中 getByNamespace(mapper.namespace) 未传入 filePath 参考路径
    file: src/features/mapping/enterpriseScanner.ts:594
  - timestamp: 2026-04-21T14:29:00+08:00
    finding: >
      UnifiedNavigationService.findJavaByNamespace 中 getByClassName(namespace) 未传入参考路径参数，
      且方法签名未接收 referencePath
    file: src/features/mapping/unifiedNavigationService.ts:332

eliminated:
  - hypothesis: calculatePathScore 路径相似度算法本身有问题
    reason: 算法逻辑正确，模块名匹配和共同路径段计算在多服务场景下能正确区分

resolution:
  root_cause: >
    多服务同名 Mapper 跳转不准确的原因是：在 Java→XML 导航时，
    findXmlByNamespace() 调用 getByNamespace() 没有传入 javaPath 作为 referencePath 参数。
    当 namespaceIndex 中存在多个相同 namespace 的映射时，getByNamespace 返回数组第一个元素，
    可能属于另一个服务，导致跳转到错误的 XML 文件。
  fix: >
    第一轮：修复 Java→XML 导航时的 referencePath 传递
    1. FastNavigationService.findXmlByNamespace 添加 javaPath 参数并传给 getByNamespace
    2. UnifiedNavigationService.findXmlByNamespace 在检查索引时将 javaPath 传给 getByNamespace
    3. 两处 navigateJavaToXml 调用 findXmlByNamespace 时传入 javaPath
    
    第二轮：全面审计并修复所有遗漏的 getByNamespace/getByClassName 调用点
    4. xmlCodeLensProvider.ts provideCodeLenses 传入 filePath 给 getByNamespace
    5. fastScanner.ts rescanXmlFile 传入 filePath 给 getByNamespace 和 getByClassName
    6. enterpriseScanner.ts rescanXmlFile 传入 filePath 给 getByNamespace
    7. UnifiedNavigationService.findJavaByNamespace 添加 referencePath 参数并传给 getByClassName
    8. navigateXmlToJava 调用 findJavaByNamespace 时传入 xmlPath
  verification: TypeScript 编译通过
  files_changed:
    - src/features/mapping/fastNavigationService.ts
    - src/features/mapping/unifiedNavigationService.ts
    - src/features/mapping/xmlCodeLensProvider.ts
    - src/features/mapping/fastScanner.ts
    - src/features/mapping/enterpriseScanner.ts
---

# Debug Session: 多服务同名 Mapper 跳转问题

## Current Focus

**假设：** 路径相似度计算在多服务场景下无法正确区分同名 namespace 的映射

**测试：** 验证 `findBestMatchByPath` 和 `calculatePathScore` 方法的逻辑

**预期：** 应该能正确选择同一服务下的 Mapper 和 XML 配对

**下一步：** 详细分析 `calculatePathScore` 方法的模块名匹配逻辑

## Evidence Log

## Eliminated Hypotheses
