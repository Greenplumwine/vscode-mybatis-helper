/**
 * 命令模块
 *
 * 本模块包含所有 VS Code 命令的实现：
 * - generateXmlMethod: 为方法生成 XML
 * - createMapperXml: 创建 Mapper XML 文件
 * - validateConfiguration: 验证配置
 * - diagnose: 诊断系统状态
 *
 * @module commands
 */

export { generateXmlMethodCommand } from './generateXmlMethod';
export { createMapperXmlCommand } from './createMapperXml';
export { showPerformanceStatsCommand } from './showPerformanceStats';
export { runConfigurationWizard } from './configurationWizard';
export { validateConfigurationCommand } from './validateConfiguration';
export { diagnoseCommand } from './diagnose';

// 重新导出实例
import { generateXmlMethodCommand } from './generateXmlMethod';
import { createMapperXmlCommand } from './createMapperXml';
import { showPerformanceStatsCommand } from './showPerformanceStats';
import { runConfigurationWizard } from './configurationWizard';
import { validateConfigurationCommand } from './validateConfiguration';
import { diagnoseCommand } from './diagnose';

export const commands = {
  generateXmlMethod: generateXmlMethodCommand,
  createMapperXml: createMapperXmlCommand,
  showPerformanceStats: showPerformanceStatsCommand,
  runConfigurationWizard,
  validateConfiguration: validateConfigurationCommand,
  diagnose: diagnoseCommand
};
