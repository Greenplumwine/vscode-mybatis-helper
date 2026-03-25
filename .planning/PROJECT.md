# Project: MyBatis Helper VS Code Extension

## Overview

A VS Code extension for MyBatis development that provides SQL log interception, Java-XML bidirectional navigation, intelligent code completion, and SQL/XML formatting.

**Current State:** Mature extension with established feature set
**Version:** 0.0.8
**Repository:** https://github.com/Greenplumwine/vscode-mybatis-helper

---

## Goals

### Primary Goals
1. **Developer Experience** - Streamline MyBatis development workflow in VS Code
2. **Navigation** - Seamless Java ↔ XML mapper navigation
3. **Observability** - Real-time SQL log capture and analysis
4. **Productivity** - Intelligent code completion and code generation

### Success Metrics
- Extension activation success rate > 95%
- Navigation response time < 500ms
- SQL interception accuracy > 90%
- User-reported issue resolution time < 1 week

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
**Milestone:** v1.0.0 Preparation

### Recent Work (from git history)
- Enhanced completion system with debugging logs
- Removed unused file mapping functionality
- XML intelligent completion system
- Enterprise scanner optimization with worker threads
- Internationalization support (9 languages)
- SQL interceptor pause/resume functionality

### Technical Debt
- Legacy FileMapper class still present
- Synchronous file operations in scanner hot paths
- Unbounded regex cache
- No eviction policy in IndexCacheManager

---

## Decisions

### Architecture Decisions
1. **Dual Scanner System** - FastScanner for standard projects, EnterpriseScanner for large/monorepo
2. **Worker Threads** - Class file parsing in worker threads to avoid blocking
3. **In-Memory State** - No persistence, rebuilt on activation (simplicity vs durability)
4. **Strategy Pattern** - Completion providers use strategy pattern for extensibility

### Technology Choices
1. **fast-xml-parser** - Fast, lightweight XML parsing
2. **sql-formatter** - SQL formatting without heavy dependencies
3. **javap** - Class file parsing via system command
4. **No ORM** - Direct file system operations for performance

---

## Timeline

| Date | Milestone |
|------|-----------|
| 2024 Q1 | Initial development |
| 2024 Q2 | First marketplace release |
| 2024 Q3 | Enterprise scanner, worker threads |
| 2024 Q4 | Completion system, i18n |
| 2025 Q1 | Current - stabilization |
| 2025 Q2 | Target v1.0.0 release |

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

### Security Concerns
- `execSync` with user-controlled paths in worker threads
- Path traversal potential in file operations
- Need for input sanitization review

---

*Last updated: 2026-03-25*
