# Phase 03: Developer Experience - Context

**Gathered:** 2026-03-25
**Status:** Ready for planning

<domain>
## Phase Boundary

Polish and improve user experience for the MyBatis Helper VS Code extension. This phase focuses on:

1. **Documentation** - Update README with visuals, add troubleshooting guide, create feature documentation
2. **Configuration** - Review and simplify configuration options, add validation, create configuration wizard
3. **Onboarding** - Add welcome page on first install, create sample project, add getting started guide

**Explicitly NOT in scope:**
- New features or capabilities (Phase 4)
- Performance optimizations (Phase 2 - completed)
- Security fixes (Phase 1 - completed)
- Release preparation (Phase 5)

**Success Criteria from ROADMAP:**
- New user can set up in < 5 minutes
- Configuration errors reduced by 50%
- Documentation covers all features

</domain>

<decisions>
## Implementation Decisions

### Welcome Page Design
- **D-01:** Create VS Code webview-based welcome page
  - Show on first install (using global state flag)
  - Include: feature overview, keyboard shortcuts, quick setup checklist
  - "Don't show again" checkbox with option to reopen from command palette
  - Follow VS Code's built-in welcome page style (clean, card-based layout)
  - Support all 9 languages via l10n

### Configuration Validation
- **D-02:** Implement two-tier validation:
  - **Real-time validation:** Basic format checks (path exists, regex valid) via configuration change listener
  - **On-demand validation:** Full validation via "MyBatis Helper: Validate Configuration" command
  - Show validation results in output channel with actionable fixes
  - Validate: customXmlDirectories (exist), nameMatchingRules (valid patterns), sqlInterceptor.customRules (valid regex)

### Documentation Approach
- **D-03:** README enhancements:
  - Use animated GIFs for main features (navigation, SQL interception, completion)
  - Keep GIFs under 5 seconds, 800px width max
  - Static screenshots for configuration examples
  - Add "Quick Start" section at top (before feature list)
  - Move detailed configuration to separate docs/ folder

### Sample Project
- **D-04:** Create minimal MyBatis sample:
  - Location: `samples/basic-mybatis-project/`
  - Include: UserMapper.java, UserMapper.xml, pom.xml (Maven), simple test
  - Demonstrates: bidirectional navigation, SQL interception, code completion
  - Add "Open Sample Project" command to welcome page

### Troubleshooting Guide
- **D-05:** Hybrid approach:
  - **Auto-diagnose:** "MyBatis Helper: Diagnose" command (exists, enhance it)
    - Check Java extension installation
    - Check mapper file detection
    - Check SQL interceptor configuration
    - Output: structured report with fix suggestions
  - **Manual guide:** `docs/TROUBLESHOOTING.md` for common issues
    - Navigation not working
    - SQL not appearing in history
    - Performance issues on large projects

### Configuration Wizard
- **D-06:** Multi-step input wizard for first-time setup:
  - Trigger: From welcome page or command palette
  - Steps:
    1. Detect project type (Maven/Gradle) - auto-detect, confirm
    2. Configure XML directories - suggest common paths, allow custom
    3. Name matching rules - preset options (Mapper/Dao/Custom)
    4. SQL interceptor mode - auto/debugConsole/terminal
  - Save to workspace settings

</decisions>

<canonical_refs>
## Canonical References

**Downstream agents MUST read these before planning or implementing.**

### VS Code Extension API
- `src/extension.ts` - Extension activation and command registration
- `.planning/codebase/INTEGRATIONS.md` - VS Code API usage patterns

### Configuration
- `package.json` contributes.configuration - Current configuration schema
- `src/utils/logger.ts` - Configuration access patterns

### Internationalization
- `l10n/bundle.l10n.json` - Existing string keys and patterns
- `package.nls.json` - Configuration description strings

### Existing Features to Document
- `src/features/mapping/` - Navigation features
- `src/features/completion/` - Code completion
- `src/features/sql-interceptor/` - SQL interception
- `src/features/formatting/` - Formatting

### Sample Code Structure
- `src/commands/generateXmlMethod.ts` - Code generation example
- `src/services/template/` - Template system

</canonical_refs>

<code_context>
## Existing Code Insights

### Reusable Assets
- `Logger` utility - For diagnostic output
- `FastMappingEngine.getDiagnostics()` - For mapper detection status
- `SQLInterceptorService` - For SQL interception status
- Existing `mybatis-helper.diagnose` command - Base for enhanced diagnostics
- `vscode.window.createWebviewPanel()` - For welcome page
- `vscode.workspace.getConfiguration()` - For config access

### Established Patterns
- Command registration in `extension.ts` - Follow existing pattern
- l10n with `vscode.l10n.t()` - All user-facing strings
- Output channel for results - `vscode.window.createOutputChannel()`
- QuickPick for multi-step wizards - `vscode.window.showQuickPick()`

### Integration Points
- `extension.ts` - Register new commands, activate welcome page
- `package.json` - Add configuration wizard command
- New `docs/` folder for documentation
- New `samples/` folder for sample project

</code_context>

<specifics>
## Specific Implementation Notes

### Welcome Page Content Structure
```
┌─────────────────────────────────────┐
│  Welcome to MyBatis Helper          │
│                                     │
│  [Feature Cards - 3 columns]        │
│  ┌─────────┐ ┌─────────┐ ┌────────┐ │
│  │Navigate │ │ Capture │ │ Complete│ │
│  │Java↔XML │ │ SQL Logs│ │ Code   │ │
│  └─────────┘ └─────────┘ └────────┘ │
│                                     │
│  Quick Setup: [3 checkboxes]        │
│  ☐ Java extension installed         │
│  ☐ Mapper files detected            │
│  ☐ SQL interceptor configured       │
│                                     │
│  [Open Sample] [Configure] [Docs]   │
│                                     │
│  [☐ Don't show on startup]          │
└─────────────────────────────────────┘
```

### Configuration Wizard Flow
```
Step 1: Project Type
> Detected: Maven project (pom.xml found)
> Confirm or select different: [Maven] [Gradle] [Other]

Step 2: XML Directories
> Suggested: src/main/resources/mappers/
> Add more: [input]

Step 3: Naming Convention
> Select pattern:
  • *Mapper.java → *Mapper.xml (standard)
  • *Dao.java → *Mapper.xml (DAO style)
  • *Mapper.java → *.xml (simple)
  • Custom

Step 4: SQL Interception
> Mode: [Auto-detect] [Debug Console] [Terminal]
```

### Diagnostic Command Output Format
```
MyBatis Helper Diagnostics
==========================

Environment:
  ✓ VS Code: 1.93.0
  ✓ Java Extension: installed and active
  ✓ OS: Darwin (macOS)

Project Detection:
  ✓ Workspace: /Users/.../my-project
  ✓ Build tool: Maven (pom.xml found)
  ✓ Java files: 45 found
  ✓ XML files: 12 found

Mapper Mappings:
  ✓ Mappings built: 12 Java ↔ XML pairs
  ⚠ Unmapped Java: 3 files (UserMapper, OrderMapper, ProductMapper)
    Suggestion: Check XML files exist in configured directories

SQL Interceptor:
  ✓ Status: Running
  ✓ Mode: Auto-detect (Debug Console)
  ✓ History entries: 24

Configuration:
  ✓ Custom XML directories: 1 configured
  ⚠ Name matching rules: Using defaults
    Suggestion: Run "Configure MyBatis Helper" to customize
```

</specifics>

<deferred>
## Deferred Ideas

None - discussion stayed within phase scope.

</deferred>

---

*Phase: 03-developer-experience*
*Context gathered: 2026-03-25*
