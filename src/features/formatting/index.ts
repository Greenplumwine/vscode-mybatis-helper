/**
 * 嵌套格式化模块
 *
 * 本模块提供 MyBatis XML 文件的嵌套格式化功能：
 * - XML 结构格式化（标签缩进、属性对齐）
 * - SQL 内容格式化（关键字大写、换行、缩进）
 * - 动态标签正确处理
 *
 * 设计模式：
 * - 责任链模式 (Chain of Responsibility): PipelineStep 顺序执行
 * - 外观模式 (Facade Pattern): NestedFormattingProvider 提供统一接口
 *
 * 使用示例：
 * ```typescript
 * import { NestedFormattingProvider } from './features/formatting';
 *
 * const formattingProvider = new NestedFormattingProvider();
 *
 * vscode.languages.registerDocumentFormattingEditProvider(
 *   { language: 'mybatis-mapper-xml' },
 *   formattingProvider
 * );
 * ```
 *
 * @module features/formatting
 */

// 类型导出
export type {
  SqlRegion,
  FormattedResult,
  FormattingOptions,
  PipelineContext,
  PipelineStep,
} from "./types";

// 核心类导出
export { NestedFormattingProvider } from "./nestedFormattingProvider";
export { FormattingPipeline } from "./pipeline";
