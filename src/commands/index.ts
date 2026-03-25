/**
 * 命令模块
 * 
 * 本模块包含所有 VS Code 命令的实现：
 * - generateXmlMethod: 为方法生成 XML
 * - createMapperXml: 创建 Mapper XML 文件
 * 
 * @module commands
 */

export { generateXmlMethodCommand } from './generateXmlMethod';
export { createMapperXmlCommand } from './createMapperXml';
export { showPerformanceStatsCommand } from './showPerformanceStats';
export { runConfigurationWizard } from './configurationWizard';

// 重新导出实例
import { generateXmlMethodCommand } from './generateXmlMethod';
import { createMapperXmlCommand } from './createMapperXml';
import { showPerformanceStatsCommand } from './showPerformanceStats';
import { runConfigurationWizard } from './configurationWizard';

export const commands = {
  generateXmlMethod: generateXmlMethodCommand,
  createMapperXml: createMapperXmlCommand,
  showPerformanceStats: showPerformanceStatsCommand,
  runConfigurationWizard
};
