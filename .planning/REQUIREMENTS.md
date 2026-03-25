# Requirements: MyBatis Helper v1.0.0

## Overview

Consolidated requirements for the MyBatis Helper VS Code Extension v1.0.0 release.

---

## Functional Requirements

### F1: Java-XML Navigation
**Status:** Implemented | **Priority:** P0

| ID | Requirement | Priority |
|----|-------------|----------|
| F1.1 | Jump from Java mapper interface to XML file (Ctrl+Alt+J) | P0 |
| F1.2 | Jump from XML to Java mapper interface (Ctrl+Alt+X) | P0 |
| F1.3 | CodeLens showing XML method count on Java interfaces | P0 |
| F1.4 | Support custom name matching rules (Mapper/Dao patterns) | P1 |
| F1.5 | Path priority configuration for file lookup | P1 |

### F2: SQL Interceptor
**Status:** Implemented | **Priority:** P0

| ID | Requirement | Priority |
|----|-------------|----------|
| F2.1 | Capture SQL logs from debug console | P0 |
| F2.2 | Capture SQL logs from terminal | P0 |
| F2.3 | Parse SQL and parameters from log output | P0 |
| F2.4 | Display SQL history in sidebar view | P0 |
| F2.5 | Copy SQL from history tree | P1 |
| F2.6 | Pause/resume SQL interception | P1 |
| F2.7 | Custom regex rules for SQL extraction | P2 |

### F3: Code Completion
**Status:** Implemented | **Priority:** P1

| ID | Requirement | Priority |
|----|-------------|----------|
| F3.1 | MyBatis XML tag completion | P1 |
| F3.2 | SQL keyword completion | P1 |
| F3.3 | Java property completion in XML | P1 |
| F3.4 | Type handler completion | P2 |
| F3.5 | Foreach variable completion | P2 |

### F4: Formatting
**Status:** Implemented | **Priority:** P1

| ID | Requirement | Priority |
|----|-------------|----------|
| F4.1 | SQL formatting inside XML CDATA | P1 |
| F4.2 | XML formatting with proper nesting | P1 |
| F4.3 | Configurable SQL dialect (MySQL, PostgreSQL, Oracle, etc.) | P1 |
| F4.4 | Keyword case configuration | P2 |

### F5: Code Generation
**Status:** Implemented | **Priority:** P1

| ID | Requirement | Priority |
|----|-------------|----------|
| F5.1 | Generate XML method from Java method (Ctrl+Shift+G) | P1 |
| F5.2 | Create mapper XML from Java interface | P1 |
| F5.3 | Template-based code generation | P2 |

### F6: Internationalization
**Status:** Implemented | **Priority:** P2

| ID | Requirement | Priority |
|----|-------------|----------|
| F6.1 | English language support | P0 |
| F6.2 | Chinese (Simplified) support | P1 |
| F6.3 | Additional 7 language bundles | P2 |

---

## Non-Functional Requirements

### N1: Performance
| ID | Requirement | Target |
|----|-------------|--------|
| N1.1 | Extension activation time | < 3s |
| N1.2 | Navigation response time | < 500ms |
| N1.3 | SQL interception latency | < 50ms |
| N1.4 | Large project scan time | < 30s (EnterpriseScanner) |

### N2: Reliability
| ID | Requirement | Target |
|----|-------------|--------|
| N2.1 | Extension activation success rate | > 95% |
| N2.2 | Navigation accuracy | > 98% |
| N2.3 | SQL parsing accuracy | > 90% |

### N3: Compatibility
| ID | Requirement | Target |
|----|-------------|--------|
| N3.1 | VS Code version | ^1.93.0 |
| N3.2 | redhat.java extension | Required |
| N3.3 | Operating systems | Windows, macOS, Linux |

### N4: Security
| ID | Requirement | Priority |
|----|-------------|----------|
| N4.1 | Path traversal protection | P0 |
| N4.2 | Input sanitization for execSync | P0 |
| N4.3 | Safe regex patterns (no ReDoS) | P1 |

---

## User Stories

### US1: Developer Navigation
> As a Java developer using MyBatis, I want to quickly jump between my Java mapper interface and XML files so that I can efficiently understand and modify my data access layer.

**Acceptance Criteria:**
- Keyboard shortcut works from Java to XML
- Keyboard shortcut works from XML to Java
- CodeLens shows method count on interfaces
- Navigation works with custom naming patterns

### US2: SQL Debugging
> As a developer debugging database issues, I want to see the actual SQL being executed with parameters so that I can identify and fix performance or correctness issues.

**Acceptance Criteria:**
- SQL appears in sidebar view automatically
- Parameters are parsed and displayed
- SQL can be copied to clipboard
- Interception can be paused/resumed

### US3: Code Assistance
> As a developer writing MyBatis XML, I want intelligent code completion so that I can write correct XML faster with fewer errors.

**Acceptance Criteria:**
- Tag completion works for MyBatis elements
- SQL keywords are suggested
- Java properties are suggested
- Completion is context-aware

---

## Out of Scope

The following are explicitly out of scope for v1.0.0:

1. Database connection and query execution
2. Schema/database structure visualization
3. MyBatis-Plus specific features
4. Spring Boot integration beyond basic support
5. Automatic SQL optimization suggestions
6. Multi-root workspace support (future consideration)

---

## Technical Debt Items

| ID | Item | Priority | Effort |
|----|------|----------|--------|
| TD1 | Remove legacy FileMapper class | P2 | Low |
| TD2 | Add cache eviction policy | P2 | Medium |
| TD3 | Convert sync file operations to async | P2 | Medium |
| TD4 | Add comprehensive unit tests | P1 | High |
| TD5 | Security audit for execSync usage | P0 | Medium |

---

*Last updated: 2026-03-25*
