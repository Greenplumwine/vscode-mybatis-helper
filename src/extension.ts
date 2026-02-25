/**
 * MyBatis Helper 插件入口文件（高性能版本）
 * 负责插件的激活、初始化和功能注册
 * 
 * 优化亮点：
 * 1. 使用 FastMappingEngine - O(1) 索引查找
 * 2. 使用 FastScanner - 分层扫描策略
 * 3. 使用 FastNavigationService - 高性能导航
 */

import * as vscode from "vscode";
import * as path from "path";
import * as fs from "fs/promises";
import {
  SQLInterceptorService,
  SQLHistoryTreeProvider,
  SQLDetailPanel,
  SQLQueryRecord
} from "./features/sql-interceptor";
import { FileMapper } from "./features/mapping/filemapper";
import { SQLCompletionProvider } from "./features/sql-completion/sqlCompletionProvider";
import { JavaExtensionAPI } from "./utils/javaExtensionAPI";
import { Logger } from "./utils/logger";

// 导入高性能新架构组件
import {
  FastScanner,
  FastMappingEngine,
  FastCodeLensProvider,
  EnterpriseScanner,
  EnterpriseConfigResolver,
  UnifiedNavigationService,
  XmlCodeLensProvider
} from "./features/mapping";

/** 是否为Java项目 */
let isJavaProject: boolean = false;
/** SQL拦截器服务 */
let sqlInterceptorService: SQLInterceptorService | undefined;
/** SQL历史TreeView提供者 */
let sqlHistoryTreeProvider: SQLHistoryTreeProvider | undefined;
/** 文件映射器实例 */
let fileMapper: FileMapper | undefined;
/** 状态栏项实例 */
let statusBarItem: vscode.StatusBarItem | undefined;

/** SQL补全提供器实例 */
let sqlCompletionProvider: SQLCompletionProvider | undefined;
/** Java扩展API实例 */
let javaExtApi: JavaExtensionAPI;
/** 日志实例 */
let logger: Logger;

// ========== 高性能新架构组件 ==========
/** 高性能扫描器（基础版） */
let fastScanner: FastScanner;
/** 企业级扫描器（支持微服务/云原生） */
let enterpriseScanner: EnterpriseScanner;
/** 当前使用的扫描器类型 */
let useEnterpriseScanner: boolean = false;
/** 统一导航服务（兼容两种扫描器） */
let navigationService: UnifiedNavigationService;
/** 高性能映射引擎 */
let fastMappingEngine: FastMappingEngine;
/** Java CodeLens提供器 */
let fastCodeLensProvider: FastCodeLensProvider | undefined;
/** XML CodeLens提供器 */
let xmlCodeLensProvider: XmlCodeLensProvider | undefined;

// 文件监听防抖定时器
const debounceTimers = new Map<string, NodeJS.Timeout>();
const DEBOUNCE_DELAY = 300;

// 标志位防止重复注册
let commandsRegistered = false;
let providersRegistered = false;
let fileWatcherStarted = false;

/**
 * 插件激活函数
 */
export function activate(context: vscode.ExtensionContext) {
  logger = Logger.getInstance();
  logger.info(vscode.l10n.t("extension.activating"));

  // 设置激活状态，让 view container 显示
  vscode.commands.executeCommand('setContext', 'mybatis-helper.activated', true);

  context.subscriptions.push(logger.registerConfigListener());

  statusBarItem = vscode.window.createStatusBarItem(vscode.StatusBarAlignment.Left, 100);
  statusBarItem.text = `$(file-code) MyBatis`;
  statusBarItem.tooltip = vscode.l10n.t("extension.description");
  statusBarItem.command = "mybatis-helper.showCommands";
  statusBarItem.show();
  context.subscriptions.push(statusBarItem);

  activatePluginFeatures(context);

  const javaExt = vscode.extensions.getExtension('redhat.java');
  if (javaExt) {
    if (javaExt.isActive) {
      logger.info(vscode.l10n.t("java.extension.active"));
      initializePlugin(context);
    } else {
      logger.info(vscode.l10n.t("java.extension.waiting"));
      const checkJavaExtensionActivation = () => {
        const javaExt = vscode.extensions.getExtension('redhat.java');
        if (javaExt?.isActive) {
          logger.info(vscode.l10n.t("java.extension.activated"));
          initializePlugin(context);
          clearInterval(interval);
        }
      };
      const interval = setInterval(checkJavaExtensionActivation, 1000);
      context.subscriptions.push({ dispose: () => clearInterval(interval) });
    }
  } else {
    logger.warn(vscode.l10n.t("java.extension.notFound"));
    updateStatusBar(vscode.l10n.t("status.javaExtensionNotFound"), false);
  }
}

/**
 * 初始化插件功能
 */
async function initializePlugin(context: vscode.ExtensionContext) {
  javaExtApi = JavaExtensionAPI.getInstance();
  await javaExtApi.initialize(context);

  if (!javaExtApi.isReady) {
    logger.error(vscode.l10n.t("java.extension.initFailed"));
    updateStatusBar(vscode.l10n.t("status.javaApiNotReady"), false);
    return;
  }

  // 初始化高性能映射功能
  await initializeFastMappingFeatures(context);

  activatePluginFeatures(context);

  vscode.window.withProgress({
    location: vscode.ProgressLocation.Notification,
    title: vscode.l10n.t("info.extensionActivated"),
    cancellable: false
  }, async (progress) => {
    try {
      await runFastProjectTypeCheck();
    } catch (error) {
      logger.error(vscode.l10n.t("scan.error", { error: String(error) }));
      updateStatusBar(vscode.l10n.t("status.nonJavaProject"), false);
    }
  });

  const watcher = vscode.workspace.createFileSystemWatcher("**/*.{java,xml}");
  watcher.onDidCreate(() => checkIfJavaProject());
  watcher.onDidDelete(() => checkIfJavaProject());
  context.subscriptions.push(watcher);

  logger.info(vscode.l10n.t("extension.activated"));

  // 注册重建索引命令
  const rebuildIndexCommand = vscode.commands.registerCommand(
    "mybatis-helper.rebuildIndex",
    async () => {
      try {
        const { classFileWatcher } = await import('./features/mapping/classFileWatcher.js');
        await classFileWatcher.rebuildIndex();
        vscode.window.showInformationMessage(vscode.l10n.t("info.indexCacheRebuilt"));
      } catch (error) {
        vscode.window.showErrorMessage(vscode.l10n.t("error.rebuildIndexFailed", { error: String(error) }));
      }
    }
  );
  context.subscriptions.push(rebuildIndexCommand);

  const showCommandsCommand = vscode.commands.registerCommand(
    "mybatis-helper.showCommands",
    async () => {
      if (!isJavaProject) {
        vscode.window.showInformationMessage(vscode.l10n.t("status.nonJavaProject"));
        return;
      }

      const commands = [
        { command: "mybatis-helper.showSqlHistory", label: vscode.l10n.t("command.showSqlHistory.title") },
        { command: "mybatis-helper.jumpToXml", label: vscode.l10n.t("command.jumpToXml.title") },
        { command: "mybatis-helper.jumpToMapper", label: vscode.l10n.t("command.jumpToMapper.title") },
        { command: "mybatis-helper.refreshMappings", label: vscode.l10n.t("command.refreshMappings.title") },
        { command: "mybatis-helper.refreshSQLHistory", label: vscode.l10n.t("command.refreshSQLHistory.title") },
        { command: "mybatis-helper.copySqlFromTree", label: vscode.l10n.t("command.copySqlFromTree.title") }
      ];

      const selected = await vscode.window.showQuickPick(
        commands.map(cmd => cmd.label),
        { placeHolder: vscode.l10n.t("extension.displayName") + " - " + vscode.l10n.t("status.mappingsComplete") }
      );

      if (selected) {
        const command = commands.find(cmd => cmd.label === selected);
        if (command) {
          await vscode.commands.executeCommand(command.command);
        }
      }
    }
  );
  context.subscriptions.push(showCommandsCommand);

  // 注册打开 SQL History 面板的命令
  const showSqlHistoryCommand = vscode.commands.registerCommand(
    "mybatis-helper.showSqlHistory",
    async () => {
      await vscode.commands.executeCommand("mybatisSQLHistory.focus");
    }
  );
  context.subscriptions.push(showSqlHistoryCommand);
}

/**
 * 初始化高性能映射功能
 */
async function initializeFastMappingFeatures(context: vscode.ExtensionContext): Promise<void> {
  logger.info(vscode.l10n.t("extension.initializingFeatures"));

  // 检测项目类型，决定使用哪种扫描器
  const projectType = await detectProjectType();
  useEnterpriseScanner = projectType.isMultiModule || 
                         projectType.isMicroservice || 
                         projectType.hasJarDependencies;

  if (useEnterpriseScanner) {
    logger.info(vscode.l10n.t("scanner.usingEnterprise", { type: projectType.type }));
  }

  // 初始化高性能组件
  fastMappingEngine = FastMappingEngine.getInstance();
  
  if (useEnterpriseScanner) {
    enterpriseScanner = EnterpriseScanner.getInstance({
      enableLayer1: true,
      enableLayer2: true,
      enableLayer3: true,
      enableLayer4: true,   // 启用字节码解析，自动检测 javap 可用性
      enableLayer5: true,
      enableLayer6: true,
      maxXmlFiles: 5000,
      maxJavaFiles: 10000,
      batchSize: 50
    });
    await enterpriseScanner.initialize();
  } else {
    fastScanner = FastScanner.getInstance({
      maxXmlFiles: 2000,
      maxJavaFiles: 5000,
      batchSize: 50,
      parallelLimit: 10
    });
    await fastScanner.initialize();
  }
  
  navigationService = UnifiedNavigationService.getInstance();
  fastCodeLensProvider = new FastCodeLensProvider();
  xmlCodeLensProvider = new XmlCodeLensProvider();

  await fastMappingEngine.initialize();
  await navigationService.initialize();

  // 注册 Java CodeLens 提供器
  const javaCodeLensRegistration = vscode.languages.registerCodeLensProvider(
    { scheme: "file", pattern: "**/*.java" },
    fastCodeLensProvider
  );
  context.subscriptions.push(javaCodeLensRegistration);

  // 注册 XML CodeLens 提供器
  const xmlCodeLensRegistration = vscode.languages.registerCodeLensProvider(
    { scheme: "file", pattern: "**/*.xml" },
    xmlCodeLensProvider
  );
  context.subscriptions.push(xmlCodeLensRegistration);

  // 监听映射变化事件，刷新 CodeLens
  fastMappingEngine.on('mappingBuilt', () => {
    fastCodeLensProvider?.refresh();
    xmlCodeLensProvider?.refresh();
  });
  fastMappingEngine.on('mappingUpdated', () => {
    fastCodeLensProvider?.refresh();
    xmlCodeLensProvider?.refresh();
  });
  fastMappingEngine.on('mappingRemoved', () => {
    fastCodeLensProvider?.refresh();
    xmlCodeLensProvider?.refresh();
  });

  // 初始化并启动 class 文件监听器（用于增量索引更新）
  if (useEnterpriseScanner && vscode.workspace.workspaceFolders) {
    try {
      const { classFileWatcher } = await import('./features/mapping/classFileWatcher.js');
      const { indexCacheManager } = await import('./features/mapping/indexCache.js');
      
      await classFileWatcher.initialize();
      await indexCacheManager.initialize(vscode.workspace.workspaceFolders[0].uri.fsPath);
      await classFileWatcher.startWatching(vscode.workspace.workspaceFolders);
      
      logger.info('Class file watcher and index cache initialized');
    } catch (error) {
      logger.debug('Failed to initialize class file watcher:', error);
    }
  }

  logger.info(vscode.l10n.t("extension.featuresInitialized"));
}

/**
 * 检测项目类型
 */
async function detectProjectType(): Promise<{
  type: string;
  isMultiModule: boolean;
  isMicroservice: boolean;
  hasJarDependencies: boolean;
}> {
  const result = {
    type: 'standard',
    isMultiModule: false,
    isMicroservice: false,
    hasJarDependencies: false
  };

  try {
    const workspaceFolders = vscode.workspace.workspaceFolders;
    if (!workspaceFolders) return result;

    for (const folder of workspaceFolders) {
      // 检测多模块项目（Maven）
      const pomPath = path.join(folder.uri.fsPath, 'pom.xml');
      try {
        await fs.access(pomPath);
        const pomContent = await fs.readFile(pomPath, 'utf-8');
        if (pomContent.includes('<modules>')) {
          result.isMultiModule = true;
          result.type = 'maven-multi-module';
        }
      } catch (e) {}

      // 检测多模块项目（Gradle）
      const settingsPath = path.join(folder.uri.fsPath, 'settings.gradle');
      const settingsKtsPath = path.join(folder.uri.fsPath, 'settings.gradle.kts');
      try {
        const settingsFile = await fs.access(settingsPath).then(() => settingsPath)
          .catch(() => fs.access(settingsKtsPath).then(() => settingsKtsPath).catch(() => null));
        
        if (settingsFile) {
          const content = await fs.readFile(settingsFile, 'utf-8');
          if (content.includes('include')) {
            result.isMultiModule = true;
            result.type = 'gradle-multi-module';
          }
        }
      } catch (e) {}

      // 检测微服务项目特征
      const bootstrapYml = path.join(folder.uri.fsPath, 'bootstrap.yml');
      const bootstrapYaml = path.join(folder.uri.fsPath, 'bootstrap.yaml');
      const dockerfile = path.join(folder.uri.fsPath, 'Dockerfile');
      const k8sDir = path.join(folder.uri.fsPath, 'k8s');
      
      try {
        if (
          await fs.access(bootstrapYml).then(() => true).catch(() => false) ||
          await fs.access(bootstrapYaml).then(() => true).catch(() => false) ||
          await fs.access(dockerfile).then(() => true).catch(() => false) ||
          await fs.access(k8sDir).then(() => true).catch(() => false)
        ) {
          result.isMicroservice = true;
          result.type = 'microservice';
        }
      } catch (e) {}

      // 检测是否有 jar 依赖（本地 lib 目录或 Maven/Gradle 依赖）
      const libDir = path.join(folder.uri.fsPath, 'lib');
      const libsDir = path.join(folder.uri.fsPath, 'libs');
      try {
        const libExists = await fs.access(libDir).then(() => true).catch(() => false);
        const libsExists = await fs.access(libsDir).then(() => true).catch(() => false);
        if (libExists || libsExists) {
          result.hasJarDependencies = true;
        }
      } catch (e) {}
      
      // 对于 Maven/Gradle 项目，默认认为有 JAR 依赖（用于扫描 @MapperScan）
      if (!result.hasJarDependencies) {
        const hasPom = await fs.access(path.join(folder.uri.fsPath, 'pom.xml')).then(() => true).catch(() => false);
        const hasBuildGradle = await fs.access(path.join(folder.uri.fsPath, 'build.gradle')).then(() => true).catch(() => false);
        const hasBuildGradleKts = await fs.access(path.join(folder.uri.fsPath, 'build.gradle.kts')).then(() => true).catch(() => false);
        
        if (hasPom || hasBuildGradle || hasBuildGradleKts) {
          result.hasJarDependencies = true;
        }
      }
    }
  } catch (error) {
    logger?.debug(vscode.l10n.t("scan.error", { error: String(error) }));
  }

  return result;
}

/**
 * 获取当前使用的扫描器
 */
function getCurrentScanner(): FastScanner | EnterpriseScanner | undefined {
  return useEnterpriseScanner ? enterpriseScanner : fastScanner;
}

/**
 * 启动文件监听（增量更新）
 */
function startFileWatching(): void {
  if (fileWatcherStarted) {
    return;
  }

  const fileWatcher = vscode.workspace.createFileSystemWatcher('**/*.{java,xml}');

  const handleFileChange = (uri: vscode.Uri, type: 'create' | 'change' | 'delete') => {
    // 排除构建目录和临时文件
    if (shouldIgnoreFile(uri.fsPath)) {
      return;
    }

    logger.debug(vscode.l10n.t("file.change", { type, path: uri.fsPath }));

    // 清除之前的定时器
    const existingTimer = debounceTimers.get(uri.fsPath);
    if (existingTimer) {
      clearTimeout(existingTimer);
    }

    // 设置新的防抖定时器
    const timer = setTimeout(async () => {
      try {
        const scanner = getCurrentScanner();
        
        if (type === 'delete') {
          if (uri.fsPath.endsWith('.java')) {
            fastMappingEngine.removeMapping(uri.fsPath);
          } else {
            fastMappingEngine.removeXmlMapping(uri.fsPath);
          }
        } else if (uri.fsPath.endsWith('.java')) {
          if (useEnterpriseScanner && enterpriseScanner) {
            await enterpriseScanner.rescanJavaFile(uri.fsPath);
          } else if (fastScanner) {
            await fastScanner.rescanJavaFile(uri.fsPath);
          }
        } else if (uri.fsPath.endsWith('.xml')) {
          if (useEnterpriseScanner && enterpriseScanner) {
            await enterpriseScanner.rescanXmlFile(uri.fsPath);
          } else if (fastScanner) {
            await fastScanner.rescanXmlFile(uri.fsPath);
          }
        }
        // 刷新 CodeLens
        fastCodeLensProvider?.refresh();
        xmlCodeLensProvider?.refresh();
      } catch (error) {
        logger.error(vscode.l10n.t("file.changeError", { path: uri.fsPath, error: String(error) }));
      }
      debounceTimers.delete(uri.fsPath);
    }, DEBOUNCE_DELAY);

    debounceTimers.set(uri.fsPath, timer);
  };

  fileWatcher.onDidCreate(uri => handleFileChange(uri, 'create'));
  fileWatcher.onDidChange(uri => handleFileChange(uri, 'change'));
  fileWatcher.onDidDelete(uri => handleFileChange(uri, 'delete'));

  fileWatcherStarted = true;
  logger.info(vscode.l10n.t("status.fileWatchingStarted"));
}

/**
 * 检查是否应该忽略文件
 */
function shouldIgnoreFile(filePath: string): boolean {
  const ignorePatterns = [
    '/node_modules/',
    '/.git/',
    '\\.git\\',
    '/target/',
    '/build/',
    '/out/',
    '/dist/',
    '.tmp',
    '.temp',
    '~'
  ];

  return ignorePatterns.some(pattern => filePath.includes(pattern));
}

/**
 * 更新状态栏显示
 */
function updateStatusBar(message: string, isWorking: boolean = true) {
  if (statusBarItem) {
    statusBarItem.text = isWorking
      ? `$(file-code) MyBatis: ${message}`
      : `$(file-code) MyBatis: ${message}`;
    statusBarItem.show();
  }
}

/**
 * 快速检查项目类型
 */
async function runFastProjectTypeCheck(): Promise<void> {
  try {
    const quickCheckFiles = await vscode.workspace.findFiles(
      "{pom.xml,build.gradle,build.gradle.kts,*.java,*.xml}",
      "**/node_modules/**,**/.git/**,**/out/**,**/target/**,**/build/**",
      50
    );

    const hasJavaFiles = quickCheckFiles.some(file => file.path.endsWith(".java"));
    const hasXmlFiles = quickCheckFiles.some(file => file.path.endsWith(".xml"));
    const hasBuildFiles = quickCheckFiles.some(file =>
      file.path.endsWith("pom.xml") ||
      file.path.endsWith("build.gradle") ||
      file.path.endsWith("build.gradle.kts")
    );

    if (hasBuildFiles || (hasJavaFiles && hasXmlFiles)) {
      isJavaProject = true;
      logger.info(vscode.l10n.t("project.javaDetected"));
      updateStatusBar(vscode.l10n.t("status.buildingMappings"));

      // 执行高性能扫描（根据项目类型选择合适的扫描器）
      const scanner = getCurrentScanner();
      if (scanner) {
        try {
          await scanner.scan();
          // 启动增量更新监听
          startFileWatching();
          updateStatusBar(vscode.l10n.t("status.mappingsComplete"), false);
          
          // 输出诊断信息
          const diagnostics = fastMappingEngine.getDiagnostics();
          logger.info(vscode.l10n.t("info.mappingEngineDiagnostics", { diagnostics: JSON.stringify(diagnostics) }));
          
          // 如果使用企业级扫描器，输出额外信息
          if (useEnterpriseScanner && enterpriseScanner) {
            const configResolver = enterpriseScanner.getConfigResolver();
            const resolverDiags = configResolver.getDiagnostics();
            logger.info(vscode.l10n.t("info.enterpriseResolverDiagnostics", { diagnostics: JSON.stringify(resolverDiags) }));
          }
        } catch (error) {
          logger.error(vscode.l10n.t("scan.error", { error: String(error) }));
          updateStatusBar(vscode.l10n.t("status.nonJavaProject"), false);
        }
      } else {
        updateStatusBar(vscode.l10n.t("status.mappingsComplete"), false);
      }

      setTimeout(() => checkIfJavaProject(), 1000);
      return;
    } else {
      isJavaProject = false;
      updateStatusBar(vscode.l10n.t("status.nonJavaProject"), false);
    }

    await checkIfJavaProject();
  } catch (error) {
    logger.error(vscode.l10n.t("scan.error", { error: String(error) }));
    updateStatusBar(vscode.l10n.t("status.nonJavaProject"), false);
  }
}

/**
 * 检查工作区是否包含Java文件
 */
async function checkIfJavaProject() {
  try {
    const [javaFiles, xmlFiles] = await Promise.all([
      vscode.workspace.findFiles("**/*.java", null, 100),
      vscode.workspace.findFiles("**/*.xml", null, 100)
    ]);
    const newIsJavaProject = javaFiles.length > 0 && xmlFiles.length > 0;

    if (newIsJavaProject && !isJavaProject) {
      isJavaProject = true;
      logger.info(vscode.l10n.t("info.javaProjectActivated"));
      updateStatusBar(vscode.l10n.t("status.buildingMappings"));

      const scanner = getCurrentScanner();
      if (scanner) {
        try {
          await scanner.scan();
          startFileWatching();
          updateStatusBar(vscode.l10n.t("status.mappingsComplete"), false);
        } catch (error) {
          logger.error(vscode.l10n.t("scan.error", { error: String(error) }));
          updateStatusBar(vscode.l10n.t("status.nonJavaProject"), false);
        }
      } else {
        updateStatusBar(vscode.l10n.t("status.mappingsComplete"), false);
      }

      vscode.window.showInformationMessage(vscode.l10n.t("info.javaProjectActivated"));
    } else if (!newIsJavaProject && isJavaProject) {
      isJavaProject = false;
      logger.info(vscode.l10n.t("info.notJavaProject"));
      updateStatusBar(vscode.l10n.t("status.nonJavaProject"), false);
      vscode.window.showInformationMessage(vscode.l10n.t("info.javaProjectDeactivated"));
    } else if (!newIsJavaProject && !isJavaProject) {
      updateStatusBar(vscode.l10n.t("status.nonJavaProject"), false);
    } else if (newIsJavaProject && isJavaProject) {
      updateStatusBar(vscode.l10n.t("status.mappingsComplete"), false);
    }
  } catch (error) {
    logger.error(vscode.l10n.t("scan.error", { error: String(error) }));
    isJavaProject = false;
    updateStatusBar(vscode.l10n.t("status.nonJavaProject"), false);
  }
}

function activatePluginFeatures(context: vscode.ExtensionContext) {
  logger.debug(vscode.l10n.t("extension.activatePluginFeatures"));

  if (!fileMapper) {
    fileMapper = new FileMapper();
  }

  // 初始化 SQL 拦截器
  if (!sqlInterceptorService) {
    sqlInterceptorService = SQLInterceptorService.getInstance();
    sqlInterceptorService.initialize().then(() => {
      logger.info('[Extension] SQL Interceptor initialized');
    });
    context.subscriptions.push(sqlInterceptorService);
  }

  // 注册 SQL History TreeView
  if (!sqlHistoryTreeProvider) {
    sqlHistoryTreeProvider = new SQLHistoryTreeProvider();
    vscode.window.registerTreeDataProvider('mybatisSQLHistory', sqlHistoryTreeProvider);
    context.subscriptions.push(sqlHistoryTreeProvider);
  }

  // 防止 Provider 重复注册
  if (!providersRegistered) {
    // 注册 SQL 补全提供器
    if (!sqlCompletionProvider && fileMapper) {
      sqlCompletionProvider = new SQLCompletionProvider(fileMapper);
      const completionRegistration = vscode.languages.registerCompletionItemProvider(
        ["xml"],
        sqlCompletionProvider,
        "#",
        "$"
      );
      context.subscriptions.push(completionRegistration);
    }

    providersRegistered = true;
  }

  if (!commandsRegistered) {
    // 注册跳转命令（使用 FastNavigationService）
    const jumpToXmlCommand = vscode.commands.registerCommand(
      "mybatis-helper.jumpToXml",
      async (filePath?: string, methodName?: string) => {
        try {
          if (!navigationService) {
            vscode.window.showErrorMessage(vscode.l10n.t("error.navigationNotInitialized"));
            return;
          }

          let targetPath: string;
          let targetMethod: string | undefined;

          if (filePath) {
            targetPath = typeof filePath === 'string' ? filePath : String(filePath);
            targetMethod = methodName;
          } else {
            const editor = vscode.window.activeTextEditor;
            if (!editor || editor.document.languageId !== "java") {
              vscode.window.showInformationMessage(vscode.l10n.t("fileMapper.notJavaFile"));
              return;
            }
            targetPath = editor.document.uri.fsPath;
            // 获取当前方法名
            const position = editor.selection.active;
            const navInfo = await navigationService.getNavigationInfo(editor.document, position);
            targetMethod = navInfo.methodName;
          }

          const success = await navigationService.navigateJavaToXml(targetPath, targetMethod);
          if (!success) {
            logger.warn(vscode.l10n.t("error.navigateFailed", { path: targetPath }));
          }
        } catch (error) {
          logger.error(vscode.l10n.t("error.navigateFailed", { path: filePath || 'unknown' }));
          vscode.window.showErrorMessage(
            vscode.l10n.t("error.cannotOpenFile", { error: error instanceof Error ? error.message : "Unknown error" })
          );
        }
      }
    );

    const jumpToMapperCommand = vscode.commands.registerCommand(
      "mybatis-helper.jumpToMapper",
      async (filePath?: string, sqlId?: string) => {
        try {
          if (!navigationService) {
            vscode.window.showErrorMessage(vscode.l10n.t("error.navigationNotInitialized"));
            return;
          }

          let targetPath: string;
          let targetSqlId: string | undefined;

          if (filePath) {
            targetPath = typeof filePath === 'string' ? filePath : String(filePath);
            targetSqlId = sqlId;
          } else {
            const editor = vscode.window.activeTextEditor;
            if (!editor || editor.document.languageId !== "xml") {
              vscode.window.showInformationMessage(vscode.l10n.t("fileMapper.notXmlFile"));
              return;
            }
            targetPath = editor.document.uri.fsPath;
            // 获取当前 SQL ID
            const position = editor.selection.active;
            const navInfo = await navigationService.getNavigationInfo(editor.document, position);
            targetSqlId = navInfo.methodName;
          }

          const success = await navigationService.navigateXmlToJava(targetPath, targetSqlId);
          if (!success) {
            logger.warn(vscode.l10n.t("error.navigateFailed", { path: targetPath }));
          }
        } catch (error) {
          logger.error(vscode.l10n.t("error.navigateFailed", { path: filePath || 'unknown' }));
          vscode.window.showErrorMessage(
            vscode.l10n.t("error.cannotOpenFile", { error: error instanceof Error ? error.message : "Unknown error" })
          );
        }
      }
    );

    const refreshMappingsCommand = vscode.commands.registerCommand(
      "mybatis-helper.refreshMappings",
      async () => {
        if (!isJavaProject) {
          vscode.window.showInformationMessage(vscode.l10n.t("status.nonJavaProject"));
          return;
        }

        const scanner = getCurrentScanner();
        if (scanner) {
          updateStatusBar(vscode.l10n.t("status.buildingMappings"));
          logger.info(vscode.l10n.t("extension.refreshingMappings"));
          try {
            await scanner.scan();
            updateStatusBar(vscode.l10n.t("status.mappingsComplete"), false);
            vscode.window.showInformationMessage(vscode.l10n.t("mappingsRefreshed"));
            
            // 输出诊断信息
            const diagnostics = fastMappingEngine.getDiagnostics();
            logger.info(vscode.l10n.t("info.refreshCompleted", { diagnostics: JSON.stringify(diagnostics) }));
          } catch (error) {
            logger.error(vscode.l10n.t("error.mappingRefreshFailed", { error: String(error) }));
            updateStatusBar(vscode.l10n.t("status.nonJavaProject"), false);
            vscode.window.showErrorMessage(
              vscode.l10n.t("error.mappingRefreshFailed", { error: error instanceof Error ? error.message : "Unknown error" })
            );
          }
        } else {
          vscode.window.showErrorMessage(vscode.l10n.t("error.mappingNotInitialized"));
          updateStatusBar(vscode.l10n.t("status.mappingsComplete"), false);
        }
      }
    );

    // 暂停 SQL 拦截器命令
    const pauseSQLInterceptorCommand = vscode.commands.registerCommand(
      "mybatis-helper.pauseSQLInterceptor",
      async () => {
        if (sqlInterceptorService && sqlInterceptorService.isRunning) {
          sqlInterceptorService.stop();
          vscode.commands.executeCommand('setContext', 'mybatis-helper.sqlInterceptorRunning', false);
        }
      }
    );

    // 恢复 SQL 拦截器命令
    const resumeSQLInterceptorCommand = vscode.commands.registerCommand(
      "mybatis-helper.resumeSQLInterceptor",
      async () => {
        if (sqlInterceptorService && !sqlInterceptorService.isRunning) {
          sqlInterceptorService.start();
          vscode.commands.executeCommand('setContext', 'mybatis-helper.sqlInterceptorRunning', true);
        }
      }
    );

    // 清除 SQL 历史命令
    const clearSqlHistoryCommand = vscode.commands.registerCommand(
      "mybatis-helper.clearSqlHistory",
      async () => {
        if (sqlInterceptorService) {
          sqlInterceptorService.clearHistory();
        }
      }
    );

    // 显示 SQL 详情命令
    const showSqlDetailCommand = vscode.commands.registerCommand(
      "mybatis-helper.showSqlDetail",
      async (query: SQLQueryRecord) => {
        if (query) {
          SQLDetailPanel.createOrShow(context.extensionUri, query);
        }
      }
    );

    // 从 TreeView 复制 SQL 命令
    const copySqlFromTreeCommand = vscode.commands.registerCommand(
      "mybatis-helper.copySqlFromTree",
      async (query: SQLQueryRecord) => {
        if (query && query.fullSQL) {
          await vscode.env.clipboard.writeText(query.fullSQL);
          vscode.window.showInformationMessage(vscode.l10n.t("sqlDetail.copied"));
        }
      }
    );

    // 打开 SQL 设置命令
    const openSQLSettingsCommand = vscode.commands.registerCommand(
      "mybatis-helper.openSQLSettings",
      async () => {
        await vscode.commands.executeCommand(
          "workbench.action.openSettings",
          "mybatis-helper.sqlInterceptor"
        );
      }
    );

    // 刷新 SQL History 命令
    const refreshSQLHistoryCommand = vscode.commands.registerCommand(
      "mybatis-helper.refreshSQLHistory",
      async () => {
        if (sqlHistoryTreeProvider) {
          sqlHistoryTreeProvider.refresh();
          vscode.window.showInformationMessage(vscode.l10n.t("sqlTree.historyRefreshed"));
        }
      }
    );

    // 诊断命令（开发调试用）
    const diagnoseCommand = vscode.commands.registerCommand(
      "mybatis-helper.diagnose",
      async () => {
        if (!fastMappingEngine || !navigationService) {
          vscode.window.showWarningMessage(vscode.l10n.t("diagnostics.notInitialized"));
          return;
        }

        const engineDiags = fastMappingEngine.getDiagnostics() as { 
            stats?: { total?: number; withXml?: number; totalMethods?: number; };
            indexSizes?: { namespace?: number; javaPath?: number; };
          };
        const navDiags = navigationService.getDiagnostics();
        
        const message = vscode.l10n.t("diagnostics.message", {
          total: engineDiags.stats?.total || 0,
          withXml: engineDiags.stats?.withXml || 0,
          totalMethods: engineDiags.stats?.totalMethods || 0,
          namespaceSize: engineDiags.indexSizes?.namespace || 0,
          javaPathSize: engineDiags.indexSizes?.javaPath || 0,
          navStatus: JSON.stringify(navDiags)
        });

        vscode.window.showInformationMessage(message, { modal: true });
        logger.info(vscode.l10n.t("diagnostics.info", { engine: JSON.stringify(engineDiags), nav: JSON.stringify(navDiags) }));
      }
    );

    context.subscriptions.push(
      jumpToXmlCommand,
      jumpToMapperCommand,
      refreshMappingsCommand,
      pauseSQLInterceptorCommand,
      resumeSQLInterceptorCommand,
      clearSqlHistoryCommand,
      showSqlDetailCommand,
      copySqlFromTreeCommand,
      openSQLSettingsCommand,
      refreshSQLHistoryCommand,
      diagnoseCommand
    );

    // 设置 SQL 拦截器运行状态上下文变量（用于控制 TreeView 按钮显示）
    if (sqlInterceptorService) {
      vscode.commands.executeCommand('setContext', 'mybatis-helper.sqlInterceptorRunning', sqlInterceptorService.isRunning);
      
      // 监听状态变化
      sqlInterceptorService.onStateChanged((isRunning) => {
        vscode.commands.executeCommand('setContext', 'mybatis-helper.sqlInterceptorRunning', isRunning);
      });
    }

    const configChangeHandler = (e: vscode.ConfigurationChangeEvent) => {
      if (e.affectsConfiguration("mybatis-helper")) {
        logger.debug(vscode.l10n.t("extension.configChanged"));

        // 配置变更时刷新映射（如果启用了自动刷新）
        if (fastScanner && isJavaProject) {
          const autoRefreshMappings = vscode.workspace
            .getConfiguration("mybatis-helper")
            .get<boolean>("autoRefreshMappings", true);
          if (autoRefreshMappings) {
            fastScanner.scan().catch((error: any) => {
              logger.error(vscode.l10n.t("error.mappingRefreshFailed", { error: String(error) }));
            });
          }
        }
      }
    };

    context.subscriptions.push(
      vscode.workspace.onDidChangeConfiguration(configChangeHandler)
    );

    commandsRegistered = true;
  }
}

function deactivatePluginFeatures() {
  try {
    logger.info(vscode.l10n.t("extension.cleaningUp"));

    if (fileMapper) {
      try {
        fileMapper.dispose();
      } catch (error) {
        logger.error(vscode.l10n.t("error.disposeFailed", { name: "file mapper", error: String(error) }));
      }
      fileMapper = undefined;
    }

    // 清理定时器
    for (const timer of debounceTimers.values()) {
      clearTimeout(timer);
    }
    debounceTimers.clear();

    sqlCompletionProvider = undefined;
    fastCodeLensProvider = undefined;
    xmlCodeLensProvider = undefined;

    updateStatusBar(vscode.l10n.t("status.nonJavaProject"), false);
  } catch (error) {
    logger.error(vscode.l10n.t("error.deactivationFailed", { error: String(error) }));
  }
}

export function deactivate() {
  deactivatePluginFeatures();
  
  // 停止 class 文件监听器
  try {
    const { classFileWatcher } = require('./features/mapping/classFileWatcher.js');
    classFileWatcher.stopWatching();
  } catch (error) {
    // 忽略错误
  }
  
  logger.info(vscode.l10n.t("extension.deactivated"));
}
