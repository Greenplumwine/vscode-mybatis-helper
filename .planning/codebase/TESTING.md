# Testing Patterns

**Analysis Date:** 2026-03-24

## Test Framework

### Runner
- **Framework:** VSCode Test CLI (`@vscode/test-cli`)
- **Version:** ^0.0.11
- **Electron Runner:** `@vscode/test-electron` ^2.5.2

### Assertion Library
- **Mocha** (via `@types/mocha` ^10.0.10)
- VSCode extension testing uses built-in assertion patterns

### Run Commands
```bash
pnpm run test         # Run all tests via vscode-test
pnpm run pretest      # Compile and lint before testing
```

## Test File Organization

### Location
- Test files located in `__tests__/` subdirectories within service folders
- Example: `src/services/__tests__/services.test.js`

### Naming
- Test files use `.test.js` extension
- Compiled test output in `out/` directory maintains same structure

### Current Test Coverage
**Limited test coverage detected:**
- Only one test file found: `src/services/__tests__/services.test.js` (compiled to `out/`)
- No TypeScript test source files (`.test.ts`) in the `src/` directory
- Most of the 71 TypeScript source files lack corresponding test files

## Test Structure

### Observed Pattern
Based on the compiled test file at `out/services/__tests__/services.test.js`, tests follow Mocha patterns:

```javascript
// Typical structure (inferred from compiled output)
describe('Service Tests', () => {
    it('should perform expected behavior', () => {
        // Test implementation
    });
});
```

### Setup Pattern
Tests likely use:
- `before()` / `after()` for suite-level setup
- `beforeEach()` / `afterEach()` for test-level setup
- VSCode test environment provides `vscode` API mocking

## Mocking

### Framework
No explicit mocking framework detected. VSCode extension tests typically:
- Use VSCode's test runner which provides API stubs
- May use manual mocks for external dependencies

### What to Mock
Based on codebase patterns:
- **VSCode API:** `vscode.workspace`, `vscode.window`, `vscode.commands`
- **File system:** Use VSCode's `workspace.fs` API or mock with temporary files
- **Java extension API:** Mock `redhat.java` extension interactions

### What NOT to Mock
- Internal service classes (test actual implementations)
- Type definitions and interfaces

## Test Types

### Unit Tests
**Current State:** Minimal
- No dedicated unit test files for core services
- Services like `FastScanner`, `FastMappingEngine`, `Logger` lack unit tests

**Recommended Approach:**
```typescript
// Example pattern for testing services
import { Logger, LogLevel } from '../../utils/logger';

describe('Logger', () => {
    let logger: Logger;

    beforeEach(() => {
        logger = Logger.getInstance();
    });

    it('should format messages correctly', () => {
        // Test implementation
    });
});
```

### Integration Tests
**Current State:** Not explicitly separated
- Extension activation tested via VSCode test runner
- File scanning and mapping integration not covered

**Key Integration Points to Test:**
1. **Scanner + MappingEngine:** Verify file scanning populates mappings
2. **NavigationService:** Test Java-to-XML and XML-to-Java navigation
3. **Completion Providers:** Test XML completion functionality

### E2E Tests
**Current State:** Not implemented
- No end-to-end test suite detected
- Extension testing relies on manual VSCode launch

**Recommended E2E Scenarios:**
1. Extension activation on Java project
2. Jump to XML from Java mapper
3. Jump to Java from XML
4. SQL history capture and display

## Coverage

### Requirements
No explicit coverage requirements configured.

### Coverage Tools
- V8 coverage available via `@bcoe/v8-coverage` (dependency)
- No coverage reporting script in `package.json`

### Coverage Gaps
**High Priority:**
- `src/extension.ts` (1128 lines) - No tests
- `src/features/mapping/fastScanner.ts` - No tests
- `src/features/mapping/fastMappingEngine.ts` - No tests
- `src/features/mapping/enterpriseScanner.ts` - No tests

**Medium Priority:**
- `src/commands/generateXmlMethod.ts` (13KB) - No tests
- `src/commands/createMapperXml.ts` (12KB) - No tests

**Lower Priority:**
- Utility functions in `src/utils/`
- Type definitions

## Testing Best Practices

### For VSCode Extensions
1. **Use `@vscode/test-electron`:** Provides real VSCode environment
2. **Test activation:** Verify `activate()` function properly initializes services
3. **Test commands:** Use `vscode.commands.executeCommand()` to test command handlers
4. **Clean up:** Always dispose of resources in `afterEach()`

### Example Test Pattern
```typescript
import * as assert from 'assert';
import * as vscode from 'vscode';

suite('Extension Test Suite', () => {
    vscode.window.showInformationMessage('Start all tests.');

    test('Extension should be present', () => {
        assert.ok(vscode.extensions.getExtension('publisher.mybatis-helper'));
    });

    test('Should activate', async () => {
        const ext = vscode.extensions.getExtension('publisher.mybatis-helper');
        await ext?.activate();
        assert.ok(ext?.isActive);
    });
});
```

## CI/CD Testing

### Current State
No CI/CD configuration detected in repository.

### Recommended CI Setup
```yaml
# Example GitHub Actions workflow
name: Test
on: [push, pull_request]
jobs:
  test:
    runs-on: ubuntu-latest
    steps:
      - uses: actions/checkout@v3
      - uses: actions/setup-node@v3
        with:
          node-version: '18'
      - run: pnpm install
      - run: pnpm run lint
      - run: pnpm run compile
      - run: xvfb-run -a pnpm run test
```

## Testing Checklist

### Before Committing
- [ ] Run `pnpm run lint` - no errors
- [ ] Run `pnpm run compile` - no TypeScript errors
- [ ] Run `pnpm run test` - all tests pass

### For New Features
- [ ] Add unit tests for new services/utilities
- [ ] Add integration tests for feature workflows
- [ ] Test error handling paths
- [ ] Verify i18n strings are tested

---

*Testing analysis: 2026-03-24*
