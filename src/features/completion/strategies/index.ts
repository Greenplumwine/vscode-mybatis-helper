/**
 * 补全策略模块导出
 * 
 * 设计模式：
 * - 外观模式 (Facade Pattern): 统一导出所有策略，简化导入
 * 
 * @module features/completion/strategies
 */

export { BaseCompletionStrategy } from './baseStrategy';
export { PlaceholderStrategy } from './placeholderStrategy';
export { ForeachVariableStrategy } from './foreachVariableStrategy';
export { ForeachCollectionStrategy } from './foreachCollectionStrategy';
export { ForeachItemPropertyStrategy } from './foreachItemPropertyStrategy';
export { PropertyStrategy } from './propertyStrategy';
export { TypeStrategy } from './typeStrategy';
export { TypeHandlerStrategy } from './typeHandlerStrategy';

// 策略优先级常量（从高到低）
export const StrategyPriorities = {
  /** 类型补全 */
  TYPE: 100,
  /** TypeHandler 补全 */
  TYPE_HANDLER: 100,
  /** Foreach 变量补全 */
  FOREACH_VARIABLE: 90,
  /** 对象属性补全 */
  PROPERTY: 80,
  /** SQL 占位符补全 */
  PLACEHOLDER: 70
} as const;
