# Roadmap: MyBatis Helper

## Milestones

- ✅ **v1.0.0 MVP** — Phases 1-5 (shipped 2026-03-30)

## Phases

<details>
<summary>✅ v1.0.0 MVP (Phases 1-5) — SHIPPED 2026-03-30</summary>

### Phase 1: Security & Stability (3 plans) — completed 2026-03-25
- [x] Security audit and command injection fixes
- [x] Testing infrastructure setup
- [x] Error handling improvements

### Phase 2: Performance Optimization (4 plans) — completed 2026-03-25
- [x] Cache optimization with LRU eviction
- [x] Async operations conversion
- [x] Performance monitoring
- [x] Memory optimization

### Phase 3: Developer Experience (3 plans) — completed 2026-03-26
- [x] Documentation and sample project
- [x] Welcome page and configuration wizard
- [x] Configuration validation and diagnostics

### Phase 4: Feature Completion (4 plans) — completed 2026-03-26
- [x] Java type information integration
- [x] Property completion enhancement
- [x] Formatting improvements
- [x] Template quality improvements

### Phase 5: Release Preparation (1 plan) — completed 2026-03-30
- [x] Quality assurance and release assets

</details>

## Progress

| Phase | Milestone | Plans Complete | Status | Completed |
| ----- | --------- | -------------- | ------ | --------- |
| 1. Security & Stability | v1.0.0 | 3/3 | Complete | 2026-03-25 |
| 2. Performance Optimization | v1.0.0 | 4/4 | Complete | 2026-03-25 |
| 3. Developer Experience | v1.0.0 | 3/3 | Complete | 2026-03-26 |
| 4. Feature Completion | v1.0.0 | 4/4 | Complete | 2026-03-26 |
| 5. Release Preparation | v1.0.0 | 1/1 | Complete | 2026-03-30 |

---

### Phase 6: 模块感知 Mapper 映射引擎重构 — Not planned yet
- [ ] 引入 ModuleResolver 显式识别模块边界
- [ ] 改造 FastMappingEngine 索引为 (moduleId, namespace) 复合键
- [ ] 扫描阶段集成模块上下文
- [ ] 统一 QueryContext 查询接口
- [ ] 合并 FastNavigationService 与 UnifiedNavigationService
- [ ] 清理 referencePath 补丁代码

---

*For detailed milestone information, see .planning/MILESTONES.md*

## Archived Phase Details

- **v1.0.0 Phases**: See `.planning/milestones/v1.0.0-phases/` for complete phase documentation
