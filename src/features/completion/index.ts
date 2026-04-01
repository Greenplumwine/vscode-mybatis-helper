/**
 * 统一智能补全模块
 *
 * 本模块提供 MyBatis XML 文件的智能补全功能，基于策略模式实现可扩展的补全框架。
 *
 * 设计模式：
 * - 策略模式 (Strategy Pattern): CompletionStrategy 接口定义可互换的补全算法
 * - 建造者模式 (Builder Pattern): CompletionContextBuilder 构建复杂上下文
 * - 外观模式 (Facade Pattern): UnifiedCompletionProvider 提供统一接口
 *
 * 支持的补全类型：
 * 1. SQL 占位符（#{}, ${}）- PlaceholderStrategy
 * 2. Foreach 变量（item, index）- ForeachVariableStrategy
 * 3. 对象属性（#{user.}）- PropertyStrategy
 * 4. Java 类型（resultType, parameterType）- TypeStrategy
 * 5. TypeHandler（typeHandler）- TypeHandlerStrategy
 *
 * 使用示例：
 * ```typescript
 * import { UnifiedCompletionProvider } from './features/completion';
 *
 * const provider = new UnifiedCompletionProvider(
 *   javaParser,
 *   xmlParser,
 *   fileMapper
 * );
 *
 * vscode.languages.registerCompletionItemProvider(
 *   { language: 'mybatis-mapper-xml' },
 *   provider,
 *   ...provider.triggerCharacters
 * );
 * ```
 *
 * @module features/completion
 */

// 类型定义导出
export type {
  CompletionStrategy,
  CompletionContext,
  JavaMethod,
  JavaParameter,
  XmlMapperInfo,
  XmlMapperMethod,
  ForeachContext,
  ClassInfo,
  StrategyFactory,
  JavaMethodParser,
  MyBatisXmlParser,
  FileMapper,
} from "./types";

// 核心类导出
export { UnifiedCompletionProvider } from "./unifiedCompletionProvider";
export { CompletionContextBuilder } from "./contextBuilder";

// 策略相关导出
export {
  BaseCompletionStrategy,
  PlaceholderStrategy,
  ForeachVariableStrategy,
  PropertyStrategy,
  TypeStrategy,
  TypeHandlerStrategy,
  StrategyPriorities,
} from "./strategies";

// 标签补全
export { TagCompletionProvider } from "./tagCompletionProvider";
