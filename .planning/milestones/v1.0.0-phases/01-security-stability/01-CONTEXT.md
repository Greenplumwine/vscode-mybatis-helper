# Phase 01: Security & Stability - Context

**Gathered:** 2026-03-25
**Status:** Ready for planning

<domain>
## Phase Boundary

Address security concerns and critical bugs in the MyBatis Helper VS Code extension. This phase focuses on:

1. **Security Audit** - Fix command injection vulnerabilities in execSync usages
2. **Error Handling** - Implement comprehensive error boundaries with user-appropriate feedback
3. **Testing Foundation** - Set up test infrastructure with Jest and VS Code Test CLI

**Explicitly NOT in scope:**
- New features or capabilities
- Performance optimizations (Phase 2)
- Documentation improvements (Phase 3)
- UI/UX changes

</domain>

<decisions>
## Implementation Decisions

### Security Fixes
- **D-01:** Replace all `execSync` with string interpolation to `execFileSync` with array arguments
  - Files to modify: `enterpriseConfigResolver.ts` (lines 869, 888, 922)
  - Reference implementation exists in `classParsingWorker.ts` (line 112)
  - Must validate paths with `sanitizeClassPath()` before execution

### Error Handling Strategy
- **D-02:** Implement three-tier error handling:
  - **Critical errors** (scan failure, navigation failure) → VS Code notification to user
  - **General errors** (single file parse failure) → Log to output channel
  - **Silent degradation** (worker thread fallback) → Debug level logging only

### Testing Infrastructure
- **D-03:** Use dual testing framework approach:
  - **Jest** for pure logic unit tests (parsers, utilities, regex)
  - **VS Code Test CLI** for integration tests (commands, navigation, UI)
  - Target: >30% coverage for critical paths (parsers, mapping engine)

### Debug Logging
- **D-04:** No action needed - existing log level configuration (default INFO) already handles debug output appropriately

</decisions>

<canonical_refs>
## Canonical References

**Downstream agents MUST read these before planning or implementing.**

### Security
- `.planning/codebase/CONCERNS.md` §Security Issues - Detailed security audit findings
- `src/features/mapping/classParsingWorker.ts` lines 47-66 - Reference `sanitizeClassPath()` implementation
- `src/features/mapping/enterpriseConfigResolver.ts` lines 770, 866, 921 - execSync usages to fix

### Error Handling Patterns
- `src/features/mapping/fastScanner.ts` lines 211-213, 252-254, 370-371 - Current silent error patterns
- `src/features/mapping/enterpriseScanner.ts` lines 341-343 - Worker thread fallback pattern

### Testing
- `package.json` scripts section - Current test configuration
- `.planning/REQUIREMENTS.md` §N2 Reliability - Success criteria for testing

</canonical_refs>

<code_context>
## Existing Code Insights

### Reusable Assets
- `sanitizeClassPath()` in `classParsingWorker.ts` - Path validation logic can be extracted to shared utility
- `logger` utility in `src/utils/logger.ts` - Use for consistent error logging
- `RegexUtils` in `src/utils/performanceUtils.ts` - Has regex caching, needs LRU eviction

### Established Patterns
- Worker thread pattern in `classParsingWorker.ts` - Error handling with retries
- `FastMappingEngine` - In-memory Maps for indexes, no eviction policy
- Silent error handling in scanners - Need to add logging while maintaining compatibility

### Integration Points
- `extension.ts` - Error boundaries should be added around activation
- `src/features/mapping/` - All scanner files need error handling updates
- `src/services/parsing/` - Parser error handling needs standardization

</code_context>

<specifics>
## Specific Implementation Notes

### Security Fix Priority
1. `enterpriseConfigResolver.ts:869` - `jar tf "${jarPath}"` (HIGH - user-controlled jar path)
2. `enterpriseConfigResolver.ts:888` - `javap -v -classpath "${jarPath}"` (HIGH)
3. `enterpriseConfigResolver.ts:922` - `javap -v "${classPath}"` (MEDIUM - already validated)

### Test Coverage Targets
- `javaMethodParser.ts` - All public methods
- `xmlParser.ts` - Parse and extract methods
- `fastMappingEngine.ts` - Index building and lookup
- `sqlInterceptorService.ts` - SQL parsing and history management

### Error Classification
**Critical (notify user):**
- Extension activation failure
- Full scan failure
- Navigation command failure

**General (log only):**
- Single file parse error
- Class file analysis failure
- XML parse warning

**Debug only:**
- Worker thread fallback
- Cache miss
- Retry attempts

</specifics>

<deferred>
## Deferred Ideas

None - discussion stayed within phase scope.

</deferred>

---

*Phase: 01-security-stability*
*Context gathered: 2026-03-25*
