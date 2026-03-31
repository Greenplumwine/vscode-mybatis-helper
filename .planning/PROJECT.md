# Project: MyBatis Helper VS Code Extension

## Overview

A VS Code extension for MyBatis development that provides SQL log interception, Java-XML bidirectional navigation, intelligent code completion, and SQL/XML formatting.

**Current State:** v1.0.0 Released
**Version:** 1.0.0
**Repository:** https://github.com/Greenplumwine/vscode-mybatis-helper

---

## What This Is

MyBatis Helper is a production-ready VS Code extension that streamlines MyBatis development workflow. It provides seamless Java ↔ XML mapper navigation, real-time SQL log capture from debug console/terminal, intelligent code completion for MyBatis XML, and SQL/XML formatting support.

## Core Value

**Seamless MyBatis development experience in VS Code** - reducing context switching and improving productivity for Java developers working with MyBatis.

---

## Requirements

### Validated (Shipped in v1.0.0)

- ✓ Java-XML bidirectional navigation (Ctrl+Alt+J / Ctrl+Alt+X) — v1.0.0
- ✓ SQL log interception from debug console and terminal — v1.0.0
- ✓ CodeLens showing XML method count on Java interfaces — v1.0.0
- ✓ MyBatis XML tag and SQL keyword completion — v1.0.0
- ✓ Java property completion with 2-level navigation — v1.0.0
- ✓ SQL/XML formatting with 6 dialect support — v1.0.0
- ✓ Code generation from Java methods — v1.0.0
- ✓ Internationalization (9 languages) — v1.0.0
- ✓ Security hardened (path validation, execFileSync) — v1.0.0
- ✓ Performance optimized (caching, async operations) — v1.0.0

### Active (Next Milestone)

- [ ] MyBatis-Plus specific features
- [ ] Database schema-aware completion
- [ ] Enhanced SQL execution preview
- [ ] Multi-root workspace support

### Out of Scope

- Database connection management — use dedicated database tools
- SQL execution within VS Code — out of scope for now
- Schema visualization — use database management tools
- Video chat/screen sharing — use external tools

---

## Context

**Shipped v1.0.0 with 26,541 LOC TypeScript.**

Tech stack: TypeScript 5.x, VS Code Extension API, fast-xml-parser, sql-formatter

Current user base: ~1000+ VS Code marketplace installs

Key technical achievements:
- Dual scanner system (FastScanner + EnterpriseScanner)
- Worker threads for class file parsing
- In-memory O(1) namespace lookup
- Two-level regex cache with LRU eviction

---

## Key Decisions

| Decision | Status | Outcome |
|----------|--------|---------|
| Dual Scanner System | ✓ Good | Handles both standard and large projects well |
| Worker Threads for Parsing | ✓ Good | Prevents UI blocking during class parsing |
| In-Memory State (no persistence) | ✓ Good | Simplicity outweighs durability needs |
| Strategy Pattern for Completion | ✓ Good | Easy to extend with new completion types |
| Source + javap instead of JLS | ✓ Good | Works without vscode-java internals |
| Two-level regex cache | ✓ Good | Balances performance and memory |

---

## Constraints

### Technical Constraints
- Hard dependency on `redhat.java` extension
- VS Code engine ^1.93.0+
- TypeScript 5.x
- Must support Windows, macOS, Linux

### Business Constraints
- MIT License (open source)
- Single maintainer project
- Community-driven feature prioritization

---

## Stakeholders

| Role | Contact | Notes |
|------|---------|-------|
| Maintainer | Greenplumwine | Primary developer |
| Users | VS Code marketplace | ~1000+ installs |

---

## Domain

**Primary Domain:** Developer Tools / IDE Extensions
**Subdomain:** Java/MyBatis ORM Development
**Key Technologies:**
- VS Code Extension API
- TypeScript/Node.js
- XML parsing (fast-xml-parser)
- SQL parsing/formatting (sql-formatter)
- Java language server integration

---

## Project Scope

### In Scope
- Java-XML mapper navigation (bidirectional)
- SQL log interception from debug console/terminal
- MyBatis XML code completion
- SQL/XML formatting
- Code generation (XML methods, mapper files)
- Multi-language support (9 languages)

### Out of Scope
- Database connection management
- SQL execution
- Schema visualization
- MyBatis-Plus specific features (for now)

---

## Current Status

**Phase:** Maintenance & Incremental Improvements
**Milestone:** v1.0.0 Shipped

### Recent Work (from git history)
- v1.0.0 release with security hardening and performance optimization
- Enhanced completion system with Java type integration
- Documentation and sample project
- Welcome page and configuration wizard
- Configuration validation and diagnostics

### Technical Debt
- Legacy FileMapper class still present (superseded, low priority)
- Full range formatting implementation (partially done)
- More comprehensive test coverage (18 tests currently)

---

## Timeline

| Date | Milestone |
|------|-----------|
| 2024 Q1 | Initial development |
| 2024 Q2 | First marketplace release |
| 2024 Q3 | Enterprise scanner, worker threads |
| 2024 Q4 | Completion system, i18n |
| 2025 Q1 | Stabilization |
| 2026-03-30 | **v1.0.0 Released** |

---

## Notes

### Key Files
- `src/extension.ts` - Entry point
- `src/features/mapping/` - Navigation and mapping
- `src/features/completion/` - Code completion
- `src/features/sql-interceptor/` - SQL log capture
- `src/features/formatting/` - SQL/XML formatting

### Performance Considerations
- Debounced file watchers (300ms)
- Parallel scanning with configurable limits
- Worker threads for CPU-intensive tasks
- O(1) namespace lookup in FastMappingEngine

### Security Posture
- All `execSync` replaced with `execFileSync`
- Path validation for user-controlled inputs
- Safe regex patterns (no ReDoS vulnerabilities)

---

*Last updated: 2026-03-30 after v1.0.0 milestone*
