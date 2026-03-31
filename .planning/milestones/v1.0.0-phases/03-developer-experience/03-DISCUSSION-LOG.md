# Phase 03: Developer Experience - Discussion Log

> **Audit trail only.** Do not use as input to planning, research, or execution agents.
> Decisions are captured in CONTEXT.md — this log preserves the alternatives considered.

**Date:** 2026-03-25
**Phase:** 03-developer-experience
**Areas discussed:** Welcome Page, Configuration Validation, Documentation, Sample Project, Troubleshooting, Configuration Wizard

---

## Welcome Page Design

| Option | Description | Selected |
|--------|-------------|----------|
| Webview panel | Full VS Code webview with rich UI | ✓ |
| Simple notification | Toast notification with limited content | |
| Command palette only | No welcome, just add to command list | |

**Decision:** Use VS Code webview-based welcome page with card-based layout, following VS Code's built-in welcome style.

---

## Configuration Validation

| Option | Description | Selected |
|--------|-------------|----------|
| Two-tier validation | Real-time basic + on-demand full | ✓ |
| Real-time only | Validate everything on every change | |
| On-demand only | Only validate when user triggers | |

**Decision:** Two-tier approach - real-time for basic checks, on-demand command for full validation.

---

## Documentation Format

| Option | Description | Selected |
|--------|-------------|----------|
| GIFs + screenshots | Animated demos + static images | ✓ |
| Static screenshots only | Images only, no animation | |
| Video links | External YouTube/video links | |

**Decision:** Use animated GIFs for main features (under 5s, 800px max), static screenshots for configuration.

---

## Sample Project

| Option | Description | Selected |
|--------|-------------|----------|
| Minimal project | Basic UserMapper example | ✓ |
| Full CRUD example | Complete application with tests | |
| Multiple examples | Several different patterns | |

**Decision:** Create minimal sample in `samples/basic-mybatis-project/` with UserMapper demonstrating all features.

---

## Troubleshooting Approach

| Option | Description | Selected |
|--------|-------------|----------|
| Hybrid (auto + manual) | Diagnostic command + troubleshooting doc | ✓ |
| Auto-diagnose only | Only command-based diagnostics | |
| Manual guide only | Only markdown documentation | |

**Decision:** Hybrid approach - enhance existing diagnose command + create TROUBLESHOOTING.md.

---

## Configuration Wizard

| Option | Description | Selected |
|--------|-------------|----------|
| Multi-step QuickPick | VS Code native input flow | ✓ |
| Webview form | Rich HTML form in webview | |
| JSON template | Provide template for manual editing | |

**Decision:** Use VS Code QuickPick-based multi-step wizard for native feel.

---

## Claude's Discretion

None - all areas had explicit decisions.

---

## Deferred Ideas

None - discussion stayed within phase scope.
