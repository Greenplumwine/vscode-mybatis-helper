# Phase 04: Feature Completion - Context

**Gathered:** 2026-03-26
**Status:** Ready for planning

<domain>
## Phase Boundary

Complete remaining features for MyBatis Helper v1.0.0 release. This phase focuses on:

1. **Completion Enhancements** - Improve SQL completion context awareness and property completion accuracy
2. **Formatting Improvements** - Add more SQL dialect options, improve nested SQL/XML formatting
3. **Code Generation** - Add more template options, support custom templates, improve generated code quality

**Explicitly NOT in scope:**
- New major capabilities (database integration, SQL execution, etc.)
- UI/UX overhauls (Phase 3 completed this)
- Performance infrastructure (Phase 2 completed this)
- Security fixes (Phase 1 completed this)

**Success Criteria from ROADMAP:**
- Completion accuracy > 85%
- Formatting handles 95% of cases
- Generated code compiles without modification

</domain>

<decisions>
## Implementation Decisions

### Completion Accuracy - Java Type Information

- **D-01:** Use Java Language Server (JLS) direct communication for type information
  - Abandon pure regex-based class structure parsing
  - Call JLS protocol to resolve types from classpath (including JAR dependencies)
  - Provides compiler-level accuracy for generics, nested classes, inheritance

- **D-02:** Pre-parse method parameters during Mapper scanning phase
  - Extract method signatures and @Param annotations when building FastMappingEngine indexes
  - Build cache: parameter name → type → property list
  - @Param alias mapping: paramName → "aliasName" for #{aliasName} completion
  - Example: `selectById(@Param("userId") Long id)` → provides #{userId} completion

### Completion Accuracy - Property Navigation

- **D-03:** Support 2-level property navigation for attribute completion
  - Level 1: `#{user.name}`, `#{user.id}` (direct properties)
  - Level 2: `#{user.address.city}`, `#{user.address.zip}` (nested properties)
  - Do NOT implement 3+ levels (rarely used, high complexity)
  - Exclude JDK types (String, Integer, etc.) from expansion to prevent noise

### Completion Accuracy - Performance Strategy

- **D-04:** Adaptive parsing strategy based on project size
  - Small projects (<50 Java files): Full JLS type resolution + 2-level property expansion
  - Medium projects (50-500 files): JLS for complex types, cached property lists
  - Large projects (>500 files): Level 1 only, aggressive caching
  - Requirement: maintain <500ms response time (from REQUIREMENTS.md N1.2)

### Formatting Configuration

- **D-05:** Keep SQL dialect and keyword case configuration in settings.json only
  - No additional UI for formatting configuration
  - Current implementation in `nestedFormattingProvider.ts` is sufficient
  - Support dialects: MySQL, PostgreSQL, Oracle (already implemented)
  - Optional: Add SQL Server and SQLite if low effort

### Code Generation Templates

- **D-06:** Use preset templates only (no custom template system for v1.0.0)
  - Current templates: MapperXML, Select, Insert, Update, Delete, ResultMap
  - Improvements to make:
    - Better table name inference from method name
    - Smarter initial SQL structure (e.g., include WHERE clause for selectByXxx methods)
    - Proper resultMap reference generation for complex return types
  - Future consideration (post-v1.0.0): Template customization system

### Range Formatting

- **D-07:** Implement proper range formatting
  - Current `provideDocumentRangeFormattingEdits` in `nestedFormattingProvider.ts` has TODO comment
  - Implement actual range-aware formatting instead of delegating to full-document format

</decisions>

<canonical_refs>
## Canonical References

**Downstream agents MUST read these before planning or implementing.**

### Completion System
- `src/features/completion/unifiedCompletionProvider.ts` - Strategy coordinator
- `src/features/completion/strategies/propertyStrategy.ts` - Property completion to enhance
- `src/features/completion/contextBuilder.ts` - Context building for completion
- `src/features/mapping/fastMappingEngine.ts` - Index building (add @Param parsing here)

### Java Language Server Integration
- `src/features/mapping/classParsingWorker.ts` - Worker thread pattern (reference for JLS calls)
- `.planning/codebase/INTEGRATIONS.md` - VS Code API usage patterns
- `redhat.java` extension API documentation (LSP commands)

### Formatting
- `src/features/formatting/nestedFormattingProvider.ts` - Main formatting provider
- `src/features/formatting/pipeline/sqlFormatter.ts` - SQL formatting pipeline
- `package.json` contributes.configuration - Current formatting options

### Code Generation
- `src/services/template/templateEngine.ts` - Template engine (preset templates only)
- `src/commands/generateXmlMethod.ts` - Command implementation
- `src/utils/stringUtils.ts` - camelToSnakeCase, removePrefix utilities

### Requirements
- `.planning/REQUIREMENTS.md` §F3 Code Completion - Functional requirements
- `.planning/REQUIREMENTS.md` §N1 Performance - <500ms response requirement

</canonical_refs>

<code_context>
## Existing Code Insights

### Reusable Assets
- `UnifiedCompletionProvider` - Strategy pattern already in place, just add new strategies
- `CompletionContextBuilder` - Extend to include cached type information
- `TemplateEngine` - Singleton pattern with strategy-based templates
- `NestedFormattingProvider` - Range formatting TODO at line 163-171
- `FastMappingEngine` - Add method parameter parsing during index building

### Established Patterns
- Strategy pattern for completion - Follow existing 7 strategies implementation
- LSP integration via `redhat.java` - Already a hard dependency
- Worker threads for heavy operations - Use for JLS type resolution if needed
- Debounced operations - Apply to completion provider for performance

### Integration Points
- `extension.ts` - Register enhanced completion providers
- `FastMappingEngine.buildIndexes()` - Add @Param parsing hook
- `NestedFormattingProvider` - Implement range formatting
- `TemplateEngine` - Enhance preset templates (no custom template support)

</code_context>

<specifics>
## Specific Implementation Notes

### @Param Annotation Parsing

Extract both parameter name and alias during scanning:

```typescript
interface MethodParameter {
  name: string;           // actual parameter name
  paramAlias?: string;    // @Param("alias") value
  type: string;           // fully qualified type
  genericType?: string;   // for List<User>, this is "User"
}

// Example parsing result for:
// User selectById(@Param("userId") Long id, @Param("status") Integer status)
[
  { name: "id", paramAlias: "userId", type: "java.lang.Long" },
  { name: "status", paramAlias: "status", type: "java.lang.Integer" }
]
```

### JLS Type Resolution

Use `java.execute.workspaceCommand` to query type information:

```typescript
// Query class members (fields and methods)
const result = await vscode.commands.executeCommand(
  'java.execute.workspaceCommand',
  'java.getClassMembers',
  className
);
```

### Adaptive Strategy Implementation

```typescript
// In UnifiedCompletionProvider or PropertyStrategy
private getMaxPropertyDepth(): number {
  const fileCount = FastMappingEngine.getJavaFileCount();
  if (fileCount < 50) return 2;
  if (fileCount < 500) return 1;
  return 0; // Level 1 only for large projects
}
```

### Template Improvements

Current table name inference in `SelectTemplateStrategy.convertToTableName()`:
- Strips prefixes: select, find, get, query, search, list
- Converts CamelCase to snake_case

Enhancement ideas:
- Add prefix stripping for "By" suffix: `findByUserIdAndStatus` → `user` (not `by_user_id_and_status`)
- Consider return type for better resultType inference
- Generate WHERE clause hints for methods with "By" in name

</specifics>

<deferred>
## Deferred Ideas

### Post-v1.0.0 Considerations

1. **Custom Template System** - Freemarker/Handlebars-based user-defined templates
2. **Database-Aware Completion** - Connect to database schema for table/column suggestions
3. **AI-Assisted SQL Generation** - Smart SQL generation based on method name patterns
4. **Advanced Range Formatting** - Format only selected SQL statements within XML
5. **Template Marketplace** - Share custom templates with community

### Reviewed and Deferred

None — discussion stayed within phase scope.

</deferred>

---

*Phase: 04-feature-completion*
*Context gathered: 2026-03-26*
