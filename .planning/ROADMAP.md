# Roadmap: MyBatis Helper v1.0.0

## Overview

This roadmap outlines the path from current state to v1.0.0 release, focusing on stabilization, security, and developer experience improvements.

**Current Version:** 0.0.8
**Target Version:** 1.0.0
**Estimated Completion:** 2025 Q2

---

## Phase 1: Security & Stability

**Goal:** Address security concerns and critical bugs
**Duration:** 1-2 weeks

### 1.1 Security Audit
- [ ] Review all `execSync` usages for command injection risks
- [ ] Add path sanitization for user-controlled inputs
- [ ] Validate regex patterns for ReDoS vulnerabilities
- [ ] Add security tests

### 1.2 Error Handling
- [ ] Add comprehensive error boundaries
- [ ] Improve error messages for users
- [ ] Add telemetry for error tracking (optional)

### 1.3 Testing Foundation
- [ ] Set up test infrastructure
- [ ] Add unit tests for parsers
- [ ] Add integration tests for navigation

**Deliverables:**
- Security audit report
- Error handling improvements
- Test coverage > 30%

**Success Criteria:**
- No high/critical security issues
- All user-facing errors have helpful messages
- CI passes with tests

---

## Phase 2: Performance Optimization

**Goal:** Improve performance for large projects
**Duration:** 1-2 weeks

### 2.1 Cache Improvements
- [ ] Add LRU eviction to IndexCacheManager
- [ ] Implement cache size limits
- [ ] Add cache statistics for debugging

### 2.2 Async Operations
- [ ] Convert sync file operations to async
- [ ] Optimize scanner hot paths
- [ ] Add progress indicators for long operations

### 2.3 Memory Optimization
- [ ] Review memory usage patterns
- [ ] Fix potential memory leaks
- [ ] Add memory usage telemetry

**Deliverables:**
- Optimized caching system
- Async file operations
- Performance benchmarks

**Success Criteria:**
- Large project scan time < 30s
- Memory usage stable over time
- No UI blocking during scans

---

## Phase 3: Developer Experience

**Goal:** Polish and improve user experience
**Duration:** 2 weeks
**Status:** In Progress
**Plans:** 1 of 3 complete

### Plans

**Wave 1:**
- [x] 03-01-PLAN.md - Documentation and Sample Project
  - Update README with Quick Start section and GIF placeholders
  - Create docs/TROUBLESHOOTING.md with common issues
  - Create docs/FEATURES.md with detailed feature docs
  - Create docs/CONFIGURATION.md with all options
  - Create samples/basic-mybatis-project/ with working example

**Wave 2:**
- [ ] 03-02-PLAN.md - Welcome Page and Configuration Wizard
  - Create VS Code webview welcome page (shows on first install)
  - Feature cards, quick setup checklist, action buttons
  - "Don't show again" checkbox with command palette reopen
  - Multi-step configuration wizard (4 steps)
  - Project type detection, XML directories, naming convention, SQL mode

**Wave 3:**
- [ ] 03-03-PLAN.md - Configuration Validation and Enhanced Diagnostics
  - Real-time validation on configuration changes
  - On-demand "Validate Configuration" command
  - Enhanced "Diagnose" command with structured output
  - Validation for paths, regex patterns, enum values
  - Actionable fix suggestions in output

### 3.1 Documentation
- [x] Update README with GIFs/screenshots
- [x] Add troubleshooting guide
- [x] Create feature documentation

### 3.2 Configuration
- [ ] Review and simplify configuration options
- [ ] Add configuration validation
- [ ] Create configuration wizard

### 3.3 Onboarding
- [x] Add welcome page on first install
- [x] Create sample project
- [x] Add getting started guide

**Deliverables:**
- Updated documentation
- Configuration improvements
- Onboarding flow

**Success Criteria:**
- New user can set up in < 5 minutes
- Configuration errors reduced by 50%
- Documentation covers all features

---

## Phase 4: Feature Completion

**Goal:** Complete remaining features for v1.0.0
**Duration:** 2 weeks

### 4.1 Completion Enhancements
- [ ] Improve SQL completion context awareness
- [ ] Add more type handler suggestions
- [ ] Enhance property completion accuracy

### 4.2 Formatting Improvements
- [ ] Add more SQL dialect options
- [ ] Improve nested SQL/XML formatting
- [ ] Add formatting configuration UI

### 4.3 Code Generation
- [ ] Add more template options
- [ ] Support custom templates
- [ ] Improve generated code quality

**Deliverables:**
- Enhanced completion system
- Improved formatting
- Better code generation

**Success Criteria:**
- Completion accuracy > 85%
- Formatting handles 95% of cases
- Generated code compiles without modification

---

## Phase 5: Release Preparation

**Goal:** Prepare for v1.0.0 release
**Duration:** 1 week

### 5.1 Quality Assurance
- [ ] Full regression testing
- [ ] Performance benchmarking
- [ ] Security re-audit

### 5.2 Release Assets
- [ ] Create changelog
- [ ] Prepare release notes
- [ ] Update marketplace listing

### 5.3 Post-Release
- [ ] Monitor error telemetry
- [ ] Respond to user feedback
- [ ] Plan v1.1.0 features

**Deliverables:**
- v1.0.0 release
- Release notes
- Updated marketplace listing

**Success Criteria:**
- No critical bugs in first week
- User satisfaction > 4.0 stars
- Download growth maintained

---

## Backlog (Post-v1.0.0)

Items for future consideration:

1. **MyBatis-Plus Support** - Specific features for MyBatis-Plus
2. **Database Integration** - Schema-aware completion
3. **SQL Execution** - Execute and view results in VS Code
4. **Multi-root Workspaces** - Full support for complex projects
5. **AI Features** - SQL optimization suggestions
6. **Team Features** - Shared configurations

---

## Progress Tracking

| Phase | Status | Completion |
|-------|--------|------------|
| Phase 1: Security & Stability | Completed | 100% |
| Phase 2: Performance Optimization | Completed | 100% |
| Phase 3: Developer Experience | In Progress | 33% |
| Phase 4: Feature Completion | Not Started | 0% |
| Phase 5: Release Preparation | Not Started | 0% |

---

## Notes

- Phases can be worked on in parallel where dependencies allow
- User feedback may reprioritize items
- Security issues take precedence over features
- Each phase requires verification before proceeding

---

*Last updated: 2026-03-25*
