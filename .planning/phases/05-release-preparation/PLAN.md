# Phase 5: Release Preparation Plan

## Phase Goal

Prepare MyBatis Helper extension for v1.0.0 release with comprehensive quality assurance, release assets, and post-release planning.

## Context

- Current version: 0.0.8
- Target version: 1.0.0
- Previous phases completed: 4/4 (100%)
- Extension has security fixes, performance optimizations, developer experience improvements, and feature completion

## Plan 05-01: Quality Assurance

### Goal

Perform comprehensive testing and validation before release.

### Tasks

1. **Regression Testing**
   - [ ] Test Java → XML navigation on sample project
   - [ ] Test XML → Java navigation on sample project
   - [ ] Test SQL code completion in XML files
   - [ ] Test property completion with #{...} placeholders
   - [ ] Test SQL formatting with different dialects
   - [ ] Test XML method generation from Java
   - [ ] Test welcome page and configuration wizard
   - [ ] Test configuration validation

2. **Performance Benchmarking**
   - [ ] Run performance stats command
   - [ ] Verify cache cleanup is working
   - [ ] Test with large sample project (if available)
   - [ ] Document baseline performance metrics

3. **Security Re-audit**
   - [ ] Review all execFileSync usages
   - [ ] Verify path sanitization is in place
   - [ ] Check for any new command injection risks
   - [ ] Run `pnpm audit` for dependency vulnerabilities

### Verification

- [ ] All manual tests pass
- [ ] No critical security issues
- [ ] Performance stats show reasonable numbers

---

## Plan 05-02: Release Assets

### Goal

Create all necessary documentation and assets for v1.0.0 release.

### Tasks

1. **Create CHANGELOG.md**
   - [ ] Create CHANGELOG.md at repository root
   - [ ] Document all changes from v0.0.8 to v1.0.0
   - [ ] Follow Keep a Changelog format
   - [ ] Categorize: Added, Changed, Fixed, Security

2. **Prepare Release Notes**
   - [ ] Create .planning/RELEASE_NOTES.md
   - [ ] Highlight key features for v1.0.0
   - [ ] List breaking changes (if any)
   - [ ] Add upgrade guide

3. **Update Marketplace Listing**
   - [ ] Review and update package.json
   - [ ] Update keywords for better discoverability
   - [ ] Ensure all contributes sections are accurate
   - [ ] Verify icon and screenshots paths

### Verification

- [ ] CHANGELOG.md exists and is properly formatted
- [ ] Release notes are complete
- [ ] package.json is ready for publish

---

## Plan 05-03: Pre-Release Checklist

### Goal

Execute final checklist before publishing.

### Tasks

1. **Version Update**
   - [ ] Update version in package.json to 1.0.0
   - [ ] Update version constant in extension.ts if exists
   - [ ] Verify CHANGELOG.md has v1.0.0 section

2. **Build Verification**
   - [ ] Run `pnpm install` to ensure clean node_modules
   - [ ] Run `pnpm run compile` - must pass
   - [ ] Run `pnpm run lint` - must pass
   - [ ] Run `pnpm run test` - must pass
   - [ ] Run `pnpm run vscode:prepublish` - must pass

3. **Final Documentation Review**
   - [ ] Review README.md for accuracy
   - [ ] Check all documentation links work
   - [ ] Verify sample project is complete

### Verification

- [ ] Version is 1.0.0 in all places
- [ ] All build commands pass
- [ ] Documentation is accurate

---

## Success Criteria

1. All manual regression tests pass
2. Security audit shows no high/critical issues
3. CHANGELOG.md is complete and accurate
4. Build passes without errors
5. Ready for marketplace publish

## Risk Mitigation

| Risk | Mitigation |
|------|------------|
| Missed bugs | Comprehensive manual testing checklist |
| Security issues | Re-audit all external command calls |
| Build failures | Test full prepublish pipeline |
| Documentation gaps | Review all user-facing docs |

## Deliverables

- QA test results
- CHANGELOG.md
- RELEASE_NOTES.md
- Updated package.json (v1.0.0)
- Successful build artifacts
