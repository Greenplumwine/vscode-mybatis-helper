# Phase 02: Performance Optimization - Context

**Gathered:** 2026-03-25
**Status:** Ready for planning

<domain>
## Phase Boundary

Improve performance for large projects in the MyBatis Helper VS Code extension. This phase focuses on:

1. **Cache Improvements** - Add eviction policies and optimize cache usage
2. **Async Operations** - Convert sync file operations to async
3. **Memory Optimization** - Fix potential memory leaks and add monitoring

**Explicitly NOT in scope:**
- New features or capabilities
- UI/UX changes
- Error handling improvements (Phase 1)
- Security fixes (Phase 1)

**Success Criteria from ROADMAP:**
- Large project scan time < 30s
- Memory usage stable over time
- No UI blocking during scans

</domain>

<decisions>
## Implementation Decisions

### Cache Eviction Strategy
- **D-01:** Use scheduled cleanup strategy for FastMappingEngine indexes
  - Implement periodic cleanup (every 30 minutes) instead of LRU
  - Preserve O(1) lookup performance for core indexes
  - Cleanup removes stale entries based on file modification time
  - Rationale: VS Code extension lifecycle is relatively short; scheduled cleanup balances memory and performance

### Async Conversion Priority
- **D-02:** Convert sync file operations with priority order:
  1. **High priority:** `fastScanner.ts` file traversal operations
  2. **Medium priority:** `classFileWatcher.ts` file monitoring
  3. **Low priority:** Other auxiliary functions
  - Focus on hot paths that block during large project scans
  - Keep changes minimal and testable

### Performance Monitoring
- **D-03:** Use simple logging + debug command approach:
  - Log scan start/end times at `info` level
  - Log cache hit/miss rates at `debug` level
  - Log memory usage (via `process.memoryUsage()`) at `debug` level
  - Add command: "MyBatis Helper: Show Performance Stats"
  - Aligns with Phase 1 three-tier error handling strategy

### Regex Cache Limit
- **D-04:** Implement two-level cache for RegexUtils:
  - **Hot cache:** 50 most recently used regex patterns (Map, O(1) access)
  - **Cold cache:** 50 previously used patterns (Map, secondary storage)
  - **Promotion:** Cold cache hit moves to hot cache
  - **Eviction:** Hot cache full → oldest to cold; Cold cache full → evict oldest
  - Rationale: Efficiently handles frequently used patterns (SQL keywords, XML tags) while limiting memory

</decisions>

<canonical_refs>
## Canonical References

**Downstream agents MUST read these before planning or implementing.**

### Caching
- `.planning/codebase/CONCERNS.md` §Performance Issues - Unbounded Regex Cache
- `src/features/mapping/indexCache.ts` - Reference LRU implementation using Map insertion order
- `src/features/mapping/fastMappingEngine.ts` - Core indexes needing cleanup strategy
- `src/utils/performanceUtils.ts` - RegexUtils implementation

### Async Operations
- `src/features/mapping/fastScanner.ts` - Hot path file operations
- `src/features/mapping/classFileWatcher.ts` - File monitoring operations
- `src/features/mapping/classParsingWorker.ts` - Worker thread file operations

### Performance Monitoring
- `src/utils/logger.ts` - Logger utility for performance metrics
- `.planning/REQUIREMENTS.md` §N1 Performance - Success criteria

</canonical_refs>

<code_context>
## Existing Code Insights

### Reusable Assets
- `IndexCacheManager` in `indexCache.ts` - LRU implementation pattern using Map insertion order
- `Logger` utility - For performance logging
- Worker thread pattern in `classParsingWorker.ts` - Already async-capable

### Established Patterns
- Map-based indexes in `FastMappingEngine` - Need scheduled cleanup, not LRU
- Sync file operations in scanners - Use `fs/promises` for async conversion
- Regex caching in `performanceUtils.ts` - Currently unbounded, needs two-level cache

### Integration Points
- `extension.ts` - Register "Show Performance Stats" command
- `FastMappingEngine` - Add cleanup timer in initialization
- `RegexUtils` - Replace single Map with two-level cache structure

</code_context>

<specifics>
## Specific Implementation Notes

### Scheduled Cleanup Implementation
```typescript
// In FastMappingEngine
private cleanupInterval: NodeJS.Timeout | null = null;

public startCleanupTimer(intervalMs: number = 30 * 60 * 1000): void {
  this.cleanupInterval = setInterval(() => {
    this.cleanupStaleEntries();
  }, intervalMs);
}

private cleanupStaleEntries(): void {
  // Remove entries where files no longer exist or have been modified
}
```

### Two-Level Regex Cache
```typescript
private hotCache: Map<string, RegExp> = new Map();  // 50 entries
private coldCache: Map<string, RegExp> = new Map(); // 50 entries
private readonly HOT_CACHE_SIZE = 50;
private readonly COLD_CACHE_SIZE = 50;
```

### Performance Metrics to Log
- Scan duration: `scan.start`, `scan.end`, `scan.duration_ms`
- Cache stats: `cache.hits`, `cache.misses`, `cache.hit_rate`
- Memory: `memory.heap_used_mb`, `memory.heap_total_mb`

</specifics>

<deferred>
## Deferred Ideas

None - discussion stayed within phase scope.

</deferred>

---

*Phase: 02-performance-optimization*
*Context gathered: 2026-03-25*
