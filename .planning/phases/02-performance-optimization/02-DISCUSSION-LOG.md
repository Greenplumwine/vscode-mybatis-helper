# Phase 02: Performance Optimization - Discussion Log

> **Audit trail only.** Do not use as input to planning, research, or execution agents.
> Decisions are captured in CONTEXT.md — this log preserves the alternatives considered.

**Date:** 2026-03-25
**Phase:** 02-performance-optimization
**Areas discussed:** Cache eviction strategy, Async conversion priority, Performance monitoring, Regex cache limit

---

## Cache Eviction Strategy

| Option | Description | Selected |
|--------|-------------|----------|
| A) LRU eviction | Memory controlled, automatic management | |
| B) Scheduled cleanup | Simple implementation, batch processing | ✓ |
| C) No eviction, only monitoring | Keep O(1) performance | |
| D) WeakMap/Soft references | Automatic GC | |

**User's choice:** B
**Notes:** User selected scheduled cleanup (every 30 minutes) for FastMappingEngine indexes. Rationale: VS Code extension lifecycle is relatively short; scheduled cleanup balances memory and performance while preserving O(1) lookup.

---

## Async Conversion Priority

| Option | Description | Selected |
|--------|-------------|----------|
| A) Convert all to async | Thoroughly non-blocking | |
| B) Hot paths only | High ROI, low risk | ✓ |
| C) Use Worker threads | True parallelism | |

**User's choice:** B
**Notes:** Convert sync file operations with priority: (1) fastScanner.ts file traversal, (2) classFileWatcher.ts monitoring, (3) other auxiliary functions. Scanner already runs in Worker threads; focus on hot paths that block during large scans.

---

## Performance Monitoring

| Option | Description | Selected |
|--------|-------------|----------|
| A) Detailed metrics collection | Comprehensive data | |
| B) Simple logging + debug command | Low overhead, user controllable | ✓ |
| C) VS Code telemetry API | Ecosystem integration | |
| D) Test-only collection | Zero runtime overhead | |

**User's choice:** B
**Notes:** Simple logging approach aligns with Phase 1 three-tier error handling. Log scan times, cache hit rates, memory usage. Add "MyBatis Helper: Show Performance Stats" command for user-initiated viewing.

---

## Regex Cache Limit

| Option | Description | Selected |
|--------|-------------|----------|
| A) LRU (like IndexCacheManager) | Automatic management | |
| B) Fixed size limit (100) | Simple, predictable | |
| C) Two-level cache (hot/cold) | Efficient, keeps frequently used | ✓ |
| D) No limit, only monitoring | No performance impact | |

**User's choice:** C
**Notes:** Two-level cache with hot cache (50 entries) and cold cache (50 entries). Promotion on cold hit; eviction moves hot→cold→evict. Efficiently handles frequently used patterns (SQL keywords, XML tags) while limiting memory.

---

## Claude's Discretion

None — user made explicit choices for all gray areas.

## Deferred Ideas

None — discussion stayed within phase scope.
