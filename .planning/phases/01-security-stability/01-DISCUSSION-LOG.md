# Phase 01: Security & Stability - Discussion Log

> **Audit trail only.** Do not use as input to planning, research, or execution agents.
> Decisions are captured in CONTEXT.md — this log preserves the alternatives considered.

**Date:** 2026-03-25
**Phase:** 01-security-stability
**Areas discussed:** Command injection fix strategy, Error handling strategy, Testing framework choice, Debug logging cleanup

---

## Command Injection Fix Strategy

| Option | Description | Selected |
|--------|-------------|----------|
| A) execFileSync with array args | Thoroughly prevent injection, industry standard | ✓ |
| B) Path validation + string form | Smaller changes, slightly higher risk | |
| C) Use parameterized library (execa) | Modern approach, adds new dependency | |

**User's choice:** A
**Notes:** User selected option A to replace all execSync with string interpolation to execFileSync with array arguments. Reference implementation exists in classParsingWorker.ts.

---

## Error Handling Strategy

| Option | Description | Selected |
|--------|-------------|----------|
| A) Log only, keep silent | Users not disturbed, problems traceable | |
| B) User-visible error notifications | Users informed timely, may be too disturbing | |
| C) Hybrid strategy | Balance experience and transparency | ✓ |

**User's choice:** C
**Notes:** Hybrid strategy with three tiers: Critical errors (scan/navigation failure) → VS Code notification; General errors (single file parse) → log only; Silent degradation (worker fallback) → debug log only.

---

## Testing Framework Choice

| Option | Description | Selected |
|--------|-------------|----------|
| A) Only @vscode/test-cli | No new dependencies, already configured | |
| B) Only Jest | Mature ecosystem, snapshot testing | |
| C) Both Jest + VS Code Test CLI | Jest for unit tests, VS Code for integration | ✓ |

**User's choice:** C
**Notes:** Dual framework approach: Jest for pure logic (Java method parser, XML parser, regex utils); VS Code Test CLI for commands and integration tests.

---

## Debug Logging Cleanup

| Option | Description | Selected |
|--------|-------------|----------|
| A) Directly delete | Clean code, no legacy | |
| B) Make configurable | Keep debugging capability | |
| C) Change to trace level | Keep logs, default hidden | |
| D) No action needed | Existing log level config handles it | ✓ |

**User's choice:** D
**Notes:** User confirmed existing log level configuration (default INFO) already handles debug output appropriately. No additional action needed for file-specific debug logs like SysJobMapper.

---

## Claude's Discretion

None — user made explicit choices for all gray areas.

## Deferred Ideas

None — discussion stayed within phase scope.
