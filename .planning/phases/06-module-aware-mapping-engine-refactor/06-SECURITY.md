---
status: secured
phase: 06-module-aware-mapping-engine-refactor
threats_total: 12
threats_closed: 12
threats_open: 0
audited: 2026-04-22T12:30:00Z
---

# Phase 06 Security Review

## Threat Register

| Threat ID | Category | Component | Disposition | Status | Evidence |
|-----------|----------|-----------|-------------|--------|----------|
| T-06-P01-01 | Tampering | ModuleResolver 读取 pom.xml/build.gradle | mitigate | CLOSED | `path.join` + `fs.access` 验证已实施 (moduleResolver.ts:110-134) |
| T-06-P01-02 | Denial of Service | 正则解析大构建文件 | accept | CLOSED | 构建文件通常 < 100KB，风险可接受 |
| T-06-P02-01 | Tampering | QueryContext.moduleId 被伪造 | accept | CLOSED | moduleId 仅用于索引查找，不执行文件操作 |
| T-06-P02-02 | Information Disclosure | namespaceToModules 暴露模块结构 | accept | CLOSED | 模块结构信息来自公开的构建文件，无敏感信息 |
| T-06-P03-01 | Tampering | moduleId 在扫描阶段被错误解析 | mitigate | CLOSED | ModuleResolver 使用规范化路径计算 moduleId (moduleResolver.ts:351-370) |
| T-06-P03-02 | Denial of Service | 大项目模块解析阻塞扫描 | accept | CLOSED | ModuleResolver 在 initialize 中一次性解析，扫描阶段仅做 Map 查找 |
| T-06-P04-01 | Information Disclosure | QueryContext 包含文件路径 | accept | CLOSED | referencePath 仅用于引擎内部路径相似度计算，不外传 |
| T-06-P04-02 | Denial of Service | inferFromActiveEditor 频繁调用 | accept | CLOSED | 仅导航触发时调用，非高频操作 |
| T-06-P05-01 | Denial of Service | recentMappings 缓存无界增长 | mitigate | CLOSED | MAX_RECENT = 20，LRU 淘汰已实施 (unifiedNavigationService.ts:35-695) |
| T-06-P05-02 | Information Disclosure | 缓存包含文件路径 | accept | CLOSED | 文件路径信息在 VS Code 扩展环境中不敏感 |
| T-06-P06-01 | Denial of Service | 清理时误删必要代码 | mitigate | CLOSED | 通过编译和 lint 验证；grep 检查关键接口 |
| T-06-P06-02 | Information Disclosure | 无 | — | CLOSED | 本阶段无新增安全影响 |

## Mitigation Verification Details

### T-06-P01-01: ModuleResolver 路径验证
- **缓解措施**: `discoverModulesInWorkspace` 中使用 `path.join(workspacePath, "pom.xml")` 构建路径，然后 `fs.access(pomPath)` 验证文件存在性后再读取。
- **代码位置**: `src/features/mapping/moduleResolver.ts:110-134`
- **验证结果**: ✅ 所有构建文件读取前均通过 `fs.access` 验证

### T-06-P03-01: moduleId 规范化计算
- **缓解措施**: `calculateModuleId` 方法使用 `path.sep` 规范化分隔符，基于 workspace folder 计算相对路径作为 moduleId。
- **代码位置**: `src/features/mapping/moduleResolver.ts:351-370`
- **验证结果**: ✅ moduleId 计算逻辑一致，不受路径分隔符差异影响

### T-06-P05-01: 缓存大小限制
- **缓解措施**: `UnifiedNavigationService` 中 `recentMappings` 使用 `MAX_RECENT = THRESHOLDS.MAX_RECENT_MAPPINGS`（值为 20），超出时删除最早条目。
- **代码位置**: `src/features/mapping/unifiedNavigationService.ts:35-695`
- **验证结果**: ✅ LRU 淘汰逻辑已实施

### T-06-P06-01: 代码清理验证
- **缓解措施**: `npm run compile` 无编译错误，`npm run lint` 通过。
- **验证结果**: ✅ 编译通过，旧代码已清理

## Accepted Risks

| Threat ID | Reason |
|-----------|--------|
| T-06-P01-02 | 构建文件通常 < 100KB，正则解析不会导致 ReDoS |
| T-06-P02-01 | moduleId 仅用于索引查找，不执行文件操作；错误 moduleId 只会导致查找不到 |
| T-06-P02-02 | 模块结构信息来自公开的构建文件，无敏感信息 |
| T-06-P03-02 | ModuleResolver 在 initialize 中一次性解析，扫描阶段仅做 Map 查找 |
| T-06-P04-01 | referencePath 仅用于引擎内部路径相似度计算，不外传 |
| T-06-P04-02 | 仅导航触发时调用，非高频操作 |
| T-06-P05-02 | 文件路径信息在 VS Code 扩展环境中不敏感 |

## Audit Trail

| Date | Auditor | Action | Result |
|------|---------|--------|--------|
| 2026-04-22 | Claude | 威胁注册表审查 | 12/12 威胁已处置 |
| 2026-04-22 | Claude | 缓解措施代码验证 | 4 个 mitigate 威胁均找到对应代码 |

---
*Security review completed. threats_open: 0*
