/**
 * 嵌套格式化模块类型定义
 * 
 * 设计模式：
 * - 策略模式 (Strategy Pattern): PipelineStep 接口
 * - 模板方法模式 (Template Method Pattern): 格式化流程骨架
 * 
 * @module features/formatting/types
 */

/**
 * SQL 区域信息
 * 
 * 表示 XML 中 <select/insert/update/delete> 标签内的 SQL 内容
 */
export interface SqlRegion {
  /** 标签类型：select/insert/update/delete/sql */
  readonly tagType: string;
  
  /** 标签 ID */
  readonly tagId: string;
  
  /** 在原文中的起始偏移 */
  readonly startOffset: number;
  
  /** 在原文中的结束偏移 */
  readonly endOffset: number;
  
  /** SQL 内容（会被格式化器修改） */
  sqlContent: string;
  
  /** 占位符（用于替换） */
  readonly placeholder: string;
  
  /** XML 缩进层级 */
  readonly xmlIndentLevel: number;
  
  /** 是否包含动态标签（<if>, <where> 等） */
  readonly hasDynamicTags: boolean;
}

/**
 * 格式化结果
 */
export interface FormattedResult {
  /** 格式化后的内容 */
  readonly content: string;
  
  /** 处理的 SQL 区域数量 */
  readonly sqlRegionCount: number;
  
  /** 格式化耗时（ms） */
  readonly duration: number;
}

/**
 * 格式化选项
 */
export interface FormattingOptions {
  /** 缩进空格数 */
  readonly tabSize: number;
  
  /** 是否使用空格而非 Tab */
  readonly insertSpaces: boolean;
  
  /** SQL 方言 */
  readonly sqlDialect: string;
  
  /** SQL 关键字大小写 */
  readonly keywordCase: 'upper' | 'lower' | 'preserve';
  
  /** 每行最大长度 */
  readonly maxLineLength?: number;
}

/**
 * 流水线上下文
 * 
 * 在各 PipelineStep 之间传递的状态
 */
export interface PipelineContext {
  /** 原始内容 */
  readonly originalContent: string;
  
  /** 格式化选项 */
  readonly options: FormattingOptions;
  
  /** SQL 区域列表（在提取步骤后填充） */
  sqlRegions: SqlRegion[];
  
  /** 当前内容（各步骤间传递） */
  currentContent: string;
}

/**
 * 流水线步骤接口
 * 
 * 每个格式化步骤实现此接口
 */
export interface PipelineStep {
  /** 步骤名称 */
  readonly name: string;
  
  /**
   * 执行格式化步骤
   * 
   * @param input - 输入内容
   * @param context - 流水线上下文
   * @returns 处理后的内容
   */
  execute(input: string, context: PipelineContext): Promise<string> | string;
}
