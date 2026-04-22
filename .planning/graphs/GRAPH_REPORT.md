# Graph Report - /Users/jingzepei/Desktop/myself_code/vscode-mybatis-helper  (2026-04-21)

## Corpus Check
- 89 files · ~87,164 words
- Verdict: corpus is large enough that graph structure adds value.

## Summary
- 905 nodes · 1993 edges · 51 communities detected
- Extraction: 66% EXTRACTED · 34% INFERRED · 0% AMBIGUOUS · INFERRED: 686 edges (avg confidence: 0.8)
- Token cost: 0 input · 0 output

## Community Hubs (Navigation)
- [[_COMMUNITY_Community 0|Community 0]]
- [[_COMMUNITY_Community 1|Community 1]]
- [[_COMMUNITY_Community 2|Community 2]]
- [[_COMMUNITY_Community 3|Community 3]]
- [[_COMMUNITY_Community 4|Community 4]]
- [[_COMMUNITY_Community 5|Community 5]]
- [[_COMMUNITY_Community 6|Community 6]]
- [[_COMMUNITY_Community 7|Community 7]]
- [[_COMMUNITY_Community 8|Community 8]]
- [[_COMMUNITY_Community 9|Community 9]]
- [[_COMMUNITY_Community 10|Community 10]]
- [[_COMMUNITY_Community 11|Community 11]]
- [[_COMMUNITY_Community 12|Community 12]]
- [[_COMMUNITY_Community 13|Community 13]]
- [[_COMMUNITY_Community 14|Community 14]]
- [[_COMMUNITY_Community 15|Community 15]]
- [[_COMMUNITY_Community 16|Community 16]]
- [[_COMMUNITY_Community 17|Community 17]]
- [[_COMMUNITY_Community 18|Community 18]]
- [[_COMMUNITY_Community 19|Community 19]]
- [[_COMMUNITY_Community 20|Community 20]]
- [[_COMMUNITY_Community 21|Community 21]]
- [[_COMMUNITY_Community 22|Community 22]]
- [[_COMMUNITY_Community 23|Community 23]]
- [[_COMMUNITY_Community 24|Community 24]]
- [[_COMMUNITY_Community 25|Community 25]]
- [[_COMMUNITY_Community 26|Community 26]]
- [[_COMMUNITY_Community 27|Community 27]]
- [[_COMMUNITY_Community 28|Community 28]]
- [[_COMMUNITY_Community 29|Community 29]]
- [[_COMMUNITY_Community 30|Community 30]]
- [[_COMMUNITY_Community 31|Community 31]]
- [[_COMMUNITY_Community 32|Community 32]]
- [[_COMMUNITY_Community 33|Community 33]]
- [[_COMMUNITY_Community 34|Community 34]]
- [[_COMMUNITY_Community 35|Community 35]]
- [[_COMMUNITY_Community 36|Community 36]]
- [[_COMMUNITY_Community 37|Community 37]]
- [[_COMMUNITY_Community 38|Community 38]]
- [[_COMMUNITY_Community 39|Community 39]]
- [[_COMMUNITY_Community 40|Community 40]]
- [[_COMMUNITY_Community 41|Community 41]]
- [[_COMMUNITY_Community 42|Community 42]]
- [[_COMMUNITY_Community 43|Community 43]]
- [[_COMMUNITY_Community 44|Community 44]]
- [[_COMMUNITY_Community 45|Community 45]]
- [[_COMMUNITY_Community 46|Community 46]]
- [[_COMMUNITY_Community 47|Community 47]]
- [[_COMMUNITY_Community 48|Community 48]]
- [[_COMMUNITY_Community 49|Community 49]]
- [[_COMMUNITY_Community 50|Community 50]]

## God Nodes (most connected - your core abstractions)
1. `FastMappingEngine` - 43 edges
2. `SQLInterceptorService` - 30 edges
3. `EnterpriseConfigResolver` - 29 edges
4. `FastScanner` - 25 edges
5. `EnhancedJavaMethodParser` - 25 edges
6. `SQLParser` - 22 edges
7. `UnifiedNavigationService` - 20 edges
8. `EnterpriseScanner` - 18 edges
9. `Logger` - 17 edges
10. `GenerateXmlMethodCommand` - 17 edges

## Surprising Connections (you probably didn't know these)
- `diagnoseConfiguration()` --calls--> `validateConfiguration()`  [INFERRED]
  /Users/jingzepei/Desktop/myself_code/vscode-mybatis-helper/src/commands/diagnose.ts → /Users/jingzepei/Desktop/myself_code/vscode-mybatis-helper/src/services/validation/configurationValidator.ts
- `activate()` --calls--> `registerRealTimeValidation()`  [INFERRED]
  /Users/jingzepei/Desktop/myself_code/vscode-mybatis-helper/src/extension.ts → /Users/jingzepei/Desktop/myself_code/vscode-mybatis-helper/src/services/validation/realtimeValidator.ts
- `activatePluginFeatures()` --calls--> `shouldShowWelcomePage()`  [INFERRED]
  /Users/jingzepei/Desktop/myself_code/vscode-mybatis-helper/src/extension.ts → /Users/jingzepei/Desktop/myself_code/vscode-mybatis-helper/src/features/welcome/welcomePage.ts
- `activatePluginFeatures()` --calls--> `showWelcomePage()`  [INFERRED]
  /Users/jingzepei/Desktop/myself_code/vscode-mybatis-helper/src/extension.ts → /Users/jingzepei/Desktop/myself_code/vscode-mybatis-helper/src/features/welcome/welcomePage.ts
- `executeValidation()` --calls--> `validateBasic()`  [INFERRED]
  /Users/jingzepei/Desktop/myself_code/vscode-mybatis-helper/src/services/validation/realtimeValidator.ts → /Users/jingzepei/Desktop/myself_code/vscode-mybatis-helper/src/services/validation/configurationValidator.ts

## Communities

### Community 0 - "Community 0"
Cohesion: 0.05
Nodes (15): globToRegex(), validateBasic(), validateConfiguration(), validateCustomXmlDirectories(), validateDatabaseType(), validateListenMode(), validateNameMatchingRules(), validatePathPriority() (+7 more)

### Community 1 - "Community 1"
Cohesion: 0.04
Nodes (18): diagnoseCommand(), HttpClient, formatSQL(), highlightSQL(), safeRegexMatch(), JavaExtensionAPI, Logger, PerformanceUtils (+10 more)

### Community 2 - "Community 2"
Cohesion: 0.05
Nodes (9): EnhancedJavaAPI, EnterpriseConfigResolver, FormattingPipeline, IndexCacheManager, isValidClassName(), sanitizeClassPath(), sanitizeJarPath(), SqlFormatter (+1 more)

### Community 3 - "Community 3"
Cohesion: 0.05
Nodes (7): createItem(), ForeachCollectionStrategy, ForeachItemPropertyStrategy, ForeachVariableStrategy, PlaceholderStrategy, SQLInterceptorService, TypeHandlerStrategy

### Community 4 - "Community 4"
Cohesion: 0.06
Nodes (22): ClassFileWatcher, BuiltinDtdLoader, CacheDtdLoader, LocalFileDtdLoader, NetworkDtdLoader, TagHierarchyResolver, activate(), activatePluginFeatures() (+14 more)

### Community 5 - "Community 5"
Cohesion: 0.07
Nodes (5): SourceCodeParser, MyBatisXmlParser, createTextProcessor(), PathSafetyCache, TextProcessor

### Community 6 - "Community 6"
Cohesion: 0.08
Nodes (3): EnterpriseScanner, XmlLocationResolver, MyBatisXmlParser

### Community 7 - "Community 7"
Cohesion: 0.09
Nodes (20): camelToSnakeCase(), defaultIfEmpty(), extractTableNameFromMethod(), isEmpty(), removePrefix(), buildWhereClause(), DeleteTemplateStrategy, escapeXml() (+12 more)

### Community 8 - "Community 8"
Cohesion: 0.08
Nodes (9): User, UserMapper, UserMapperTest, getNonce(), getWelcomeContent(), handleCheckSetupStatus(), handleDontShowAgain(), shouldShowWelcomePage() (+1 more)

### Community 9 - "Community 9"
Cohesion: 0.09
Nodes (2): PerformanceMonitor, UnifiedCompletionProvider

### Community 10 - "Community 10"
Cohesion: 0.12
Nodes (2): GenerateXmlMethodCommand, NestedFormattingProvider

### Community 11 - "Community 11"
Cohesion: 0.12
Nodes (2): CompletionContextBuilder, JavaMethodParser

### Community 12 - "Community 12"
Cohesion: 0.1
Nodes (9): detectBuildTool(), diagnoseConfiguration(), diagnoseEnvironment(), diagnoseProject(), diagnoseSqlInterceptor(), generateRecommendations(), getOsName(), SQLHistoryTreeProvider (+1 more)

### Community 13 - "Community 13"
Cohesion: 0.16
Nodes (1): FastScanner

### Community 14 - "Community 14"
Cohesion: 0.16
Nodes (1): EnhancedJavaMethodParser

### Community 15 - "Community 15"
Cohesion: 0.14
Nodes (4): ContentDetectionStrategy, ExtensionDetectionStrategy, LanguageDetector, MyBatisMapperDetectionStrategy

### Community 16 - "Community 16"
Cohesion: 0.13
Nodes (4): extractPartialValue(), isInAttribute(), isInSqlTag(), TypeStrategy

### Community 17 - "Community 17"
Cohesion: 0.21
Nodes (2): getPluginConfig(), SQLDetailPanel

### Community 18 - "Community 18"
Cohesion: 0.21
Nodes (1): FastCodeLensProvider

### Community 19 - "Community 19"
Cohesion: 0.27
Nodes (1): TagCompletionProvider

### Community 20 - "Community 20"
Cohesion: 0.24
Nodes (1): PropertyStrategy

### Community 21 - "Community 21"
Cohesion: 0.32
Nodes (11): buildNameMatchingRules(), checkDirectoryExists(), detectProjectType(), getDefaultXmlDirectories(), runConfigurationWizard(), saveConfiguration(), showCancelledMessage(), step1ProjectType() (+3 more)

### Community 22 - "Community 22"
Cohesion: 0.33
Nodes (1): CreateMapperXmlCommand

### Community 23 - "Community 23"
Cohesion: 0.46
Nodes (7): delay(), isJavapAvailable(), parseAnnotationsFromClassFile(), parseAnnotationsFromClassFileWithRetry(), parseMapperScanFromBytecode(), processClassFiles(), sanitizeClassPath()

### Community 24 - "Community 24"
Cohesion: 0.43
Nodes (1): SqlExtractor

### Community 25 - "Community 25"
Cohesion: 0.6
Nodes (1): IndentAdjuster

### Community 26 - "Community 26"
Cohesion: 1.0
Nodes (0): 

### Community 27 - "Community 27"
Cohesion: 1.0
Nodes (0): 

### Community 28 - "Community 28"
Cohesion: 1.0
Nodes (0): 

### Community 29 - "Community 29"
Cohesion: 1.0
Nodes (0): 

### Community 30 - "Community 30"
Cohesion: 1.0
Nodes (0): 

### Community 31 - "Community 31"
Cohesion: 1.0
Nodes (0): 

### Community 32 - "Community 32"
Cohesion: 1.0
Nodes (0): 

### Community 33 - "Community 33"
Cohesion: 1.0
Nodes (0): 

### Community 34 - "Community 34"
Cohesion: 1.0
Nodes (0): 

### Community 35 - "Community 35"
Cohesion: 1.0
Nodes (0): 

### Community 36 - "Community 36"
Cohesion: 1.0
Nodes (0): 

### Community 37 - "Community 37"
Cohesion: 1.0
Nodes (0): 

### Community 38 - "Community 38"
Cohesion: 1.0
Nodes (0): 

### Community 39 - "Community 39"
Cohesion: 1.0
Nodes (0): 

### Community 40 - "Community 40"
Cohesion: 1.0
Nodes (0): 

### Community 41 - "Community 41"
Cohesion: 1.0
Nodes (0): 

### Community 42 - "Community 42"
Cohesion: 1.0
Nodes (0): 

### Community 43 - "Community 43"
Cohesion: 1.0
Nodes (0): 

### Community 44 - "Community 44"
Cohesion: 1.0
Nodes (0): 

### Community 45 - "Community 45"
Cohesion: 1.0
Nodes (0): 

### Community 46 - "Community 46"
Cohesion: 1.0
Nodes (0): 

### Community 47 - "Community 47"
Cohesion: 1.0
Nodes (0): 

### Community 48 - "Community 48"
Cohesion: 1.0
Nodes (0): 

### Community 49 - "Community 49"
Cohesion: 1.0
Nodes (0): 

### Community 50 - "Community 50"
Cohesion: 1.0
Nodes (0): 

## Knowledge Gaps
- **Thin community `Community 26`** (1 nodes): `jest.config.js`
  Too small to be a meaningful cluster - may be noise or needs more connections extracted.
- **Thin community `Community 27`** (1 nodes): `eslint.config.mjs`
  Too small to be a meaningful cluster - may be noise or needs more connections extracted.
- **Thin community `Community 28`** (1 nodes): `index.ts`
  Too small to be a meaningful cluster - may be noise or needs more connections extracted.
- **Thin community `Community 29`** (1 nodes): `types.ts`
  Too small to be a meaningful cluster - may be noise or needs more connections extracted.
- **Thin community `Community 30`** (1 nodes): `index.ts`
  Too small to be a meaningful cluster - may be noise or needs more connections extracted.
- **Thin community `Community 31`** (1 nodes): `types.ts`
  Too small to be a meaningful cluster - may be noise or needs more connections extracted.
- **Thin community `Community 32`** (1 nodes): `index.ts`
  Too small to be a meaningful cluster - may be noise or needs more connections extracted.
- **Thin community `Community 33`** (1 nodes): `index.ts`
  Too small to be a meaningful cluster - may be noise or needs more connections extracted.
- **Thin community `Community 34`** (1 nodes): `index.ts`
  Too small to be a meaningful cluster - may be noise or needs more connections extracted.
- **Thin community `Community 35`** (1 nodes): `types.ts`
  Too small to be a meaningful cluster - may be noise or needs more connections extracted.
- **Thin community `Community 36`** (1 nodes): `index.ts`
  Too small to be a meaningful cluster - may be noise or needs more connections extracted.
- **Thin community `Community 37`** (1 nodes): `types.ts`
  Too small to be a meaningful cluster - may be noise or needs more connections extracted.
- **Thin community `Community 38`** (1 nodes): `index.ts`
  Too small to be a meaningful cluster - may be noise or needs more connections extracted.
- **Thin community `Community 39`** (1 nodes): `constants.ts`
  Too small to be a meaningful cluster - may be noise or needs more connections extracted.
- **Thin community `Community 40`** (1 nodes): `pathSecurity.test.ts`
  Too small to be a meaningful cluster - may be noise or needs more connections extracted.
- **Thin community `Community 41`** (1 nodes): `stringUtils.test.ts`
  Too small to be a meaningful cluster - may be noise or needs more connections extracted.
- **Thin community `Community 42`** (1 nodes): `index.ts`
  Too small to be a meaningful cluster - may be noise or needs more connections extracted.
- **Thin community `Community 43`** (1 nodes): `index.ts`
  Too small to be a meaningful cluster - may be noise or needs more connections extracted.
- **Thin community `Community 44`** (1 nodes): `index.ts`
  Too small to be a meaningful cluster - may be noise or needs more connections extracted.
- **Thin community `Community 45`** (1 nodes): `index.ts`
  Too small to be a meaningful cluster - may be noise or needs more connections extracted.
- **Thin community `Community 46`** (1 nodes): `index.ts`
  Too small to be a meaningful cluster - may be noise or needs more connections extracted.
- **Thin community `Community 47`** (1 nodes): `templateEngine.test.ts`
  Too small to be a meaningful cluster - may be noise or needs more connections extracted.
- **Thin community `Community 48`** (1 nodes): `index.ts`
  Too small to be a meaningful cluster - may be noise or needs more connections extracted.
- **Thin community `Community 49`** (1 nodes): `types.ts`
  Too small to be a meaningful cluster - may be noise or needs more connections extracted.
- **Thin community `Community 50`** (1 nodes): `index.ts`
  Too small to be a meaningful cluster - may be noise or needs more connections extracted.

## Suggested Questions
_Questions this graph is uniquely positioned to answer:_

- **Why does `SQLInterceptorService` connect `Community 3` to `Community 12`?**
  _High betweenness centrality (0.026) - this node is a cross-community bridge._
- **Should `Community 0` be split into smaller, more focused modules?**
  _Cohesion score 0.05 - nodes in this community are weakly interconnected._
- **Should `Community 1` be split into smaller, more focused modules?**
  _Cohesion score 0.04 - nodes in this community are weakly interconnected._
- **Should `Community 2` be split into smaller, more focused modules?**
  _Cohesion score 0.05 - nodes in this community are weakly interconnected._
- **Should `Community 3` be split into smaller, more focused modules?**
  _Cohesion score 0.05 - nodes in this community are weakly interconnected._
- **Should `Community 4` be split into smaller, more focused modules?**
  _Cohesion score 0.06 - nodes in this community are weakly interconnected._
- **Should `Community 5` be split into smaller, more focused modules?**
  _Cohesion score 0.07 - nodes in this community are weakly interconnected._