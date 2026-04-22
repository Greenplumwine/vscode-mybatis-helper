# Milestones: MyBatis Helper

Historical record of shipped milestones.

---

## v1.0.0 MVP

**Shipped:** 2026-03-30
**Phases:** 1-5 | **Plans:** 15 | **Tasks:** 50+

### What Was Built

A production-ready VS Code extension for MyBatis development with complete tool chain support including SQL log interception, Java-XML bidirectional navigation, intelligent code completion, and SQL/XML formatting.

### Key Accomplishments

1. **Security Hardening** - Fixed command injection vulnerabilities, replaced all `execSync` with `execFileSync`, added path validation utilities, created 18 unit tests
2. **Performance Optimization** - Implemented two-level regex cache, scheduled cache cleanup, async file operations, performance monitoring with stats command
3. **Developer Experience** - Created comprehensive documentation (9 languages), sample project, welcome page with onboarding flow, 4-step configuration wizard, real-time configuration validation
4. **Feature Completion** - Java type information integration with @Param parsing, 2-level property navigation (user.address.city), JDK type filtering, SQL Server/SQLite dialect support, smart SQL template generation
5. **Release Preparation** - Full regression testing, CHANGELOG.md, RELEASE_NOTES.md, version 1.0.0, build verification

### Stats

- **Code:** ~26,541 lines TypeScript
- **Tests:** 18 unit tests
- **Languages:** 9 language bundles
- **Commits:** 26 (milestone period)
- **Timeline:** 2025-09-05 → 2026-03-30

### Files

- Archive: `.planning/milestones/v1.0.0-ROADMAP.md`
- Requirements: `.planning/milestones/v1.0.0-REQUIREMENTS.md`

---

## v1.0.4 模块感知重构

**Shipped:** 2026-04-22
**Phases:** 6 | **Plans:** 6 | **Tasks:** 16

### What Was Built

模块感知 Mapper 映射引擎重构，彻底解决多服务/多模块项目中同名 Mapper 接口的导航歧义问题。

### Key Accomplishments

1. **模块解析器（ModuleResolver）** — 新增独立模块解析逻辑，支持 Maven/Gradle 多模块结构的自动识别和文件归属判定
2. **索引重构** — FastMappingEngine 采用 `namespace + moduleContext` 复合键索引，提升同名 namespace 场景查询准确性
3. **查询上下文解析（QueryContextResolver）** — 统一 Java ↔ XML 导航的上下文传递机制，提供精准模块上下文
4. **导航服务合并** — 移除 FastNavigationService，功能合并至 UnifiedNavigationService，简化架构
5. **扫描器集成** — FastScanner 和 EnterpriseScanner 集成模块解析能力，扫描结果自动附带模块上下文
6. **安全与质量** — 完成 12 项安全威胁审计（全部关闭），UAT 5 项通过

### Stats

- **Code:** ~1,000 lines changed (+1,004 / -798)
- **Commits:** 25 (milestone period)
- **Timeline:** 2026-04-02 → 2026-04-22
- **Known deferred items at close:** 8 (see STATE.md Deferred Items)

### Files

- Archive: `.planning/phases/06-module-aware-mapping-engine-refactor/`
- Audit: `.planning/v1.0.0-MILESTONE-AUDIT.md`

---

*Last updated: 2026-04-22*
