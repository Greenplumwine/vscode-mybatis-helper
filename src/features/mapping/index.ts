// 导出类型定义
export * from './types';

// ========== 高性能新架构（推荐）==========
export { FastMappingEngine } from './fastMappingEngine';
export { FastScanner } from './fastScanner';
export { FastNavigationService } from './fastNavigationService';
export { FastCodeLensProvider } from './fastCodeLensProvider';

// ========== 企业级架构（微服务/云原生）==========
export { EnterpriseConfigResolver } from './enterpriseConfigResolver';
export { EnterpriseScanner } from './enterpriseScanner';

// ========== 统一导航服务（修复版）==========
export { UnifiedNavigationService } from './unifiedNavigationService';
export { XmlCodeLensProvider } from './xmlCodeLensProvider';

// ========== 共享组件==========
export { EnhancedJavaAPI } from './enhancedJavaAPI';
export { MyBatisXmlParser } from './xmlParser';
export { XmlLocationResolver } from './xmlLocationResolver';
export { FileMapper } from './filemapper';
