/**
 * MyBatis Helper 插件入口文件
 * 负责插件的激活、初始化和功能注册
 */

// VS Code 1.73+ 版本内置了国际化支持，直接使用vscode.l10n.t()方法
import * as vscode from "vscode";
import { ConsoleLogInterceptor } from "./features/sql-logging/consoleloginterceptor";
import { SQLResultDisplayer } from "./features/sql-logging/sqlresultdisplayer";
import { FileMapper } from "./features/mapping/filemapper";
import { MyBatisCodeLensProvider } from "./features/code-lens/codeLensProvider";
import { SQLCompletionProvider } from "./features/sql-completion/sqlCompletionProvider";
import { JavaExtensionAPI } from "./utils/javaExtensionAPI";
import { Logger } from "./utils/logger";

/** 是否为Java项目 */
let isJavaProject: boolean = false;
/** 控制台日志拦截器实例 */
let consoleLogInterceptor: ConsoleLogInterceptor | undefined;
/** SQL结果展示器实例 */
let sqlResultDisplayer: SQLResultDisplayer | undefined;
/** 文件映射器实例 */
let fileMapper: FileMapper | undefined;
/** 状态栏项实例 */
let statusBarItem: vscode.StatusBarItem | undefined;
/** CodeLens提供器实例 */
let codeLensProvider: MyBatisCodeLensProvider | undefined;
/** SQL补全提供器实例 */
let sqlCompletionProvider: SQLCompletionProvider | undefined;
/** Java扩展API实例 */
let javaExtApi: JavaExtensionAPI;
/** 日志实例 */
let logger: Logger;

/**
 * 插件激活函数
 * 当插件第一次被调用时执行，负责初始化插件的核心功能
 * @param context VS Code扩展上下文，包含插件的资源和生命周期管理
 */
export function activate(context: vscode.ExtensionContext) {
  // 初始化日志系统
  logger = Logger.getInstance();
  logger.info("MyBatis Helper extension activating...");

  // 注册日志配置变化监听器
  context.subscriptions.push(logger.registerConfigListener());

  // 创建状态栏项
	statusBarItem = vscode.window.createStatusBarItem(vscode.StatusBarAlignment.Left, 100);
  statusBarItem.text = `$(database) MyBatis Helper`;
  statusBarItem.tooltip = vscode.l10n.t("extension.description");
  statusBarItem.command = "mybatis-helper.showCommands";
  statusBarItem.show();
  context.subscriptions.push(statusBarItem);

  // 立即激活插件功能，包括SQL补全提供器
  activatePluginFeatures(context);

  // 监听 Java 插件的激活事件，用于初始化需要Java支持的功能
	const javaExt = vscode.extensions.getExtension('redhat.java');
  if (javaExt) {
    if (javaExt.isActive) {
      // Java 插件已激活，立即初始化需要Java支持的功能
			logger.info("Java extension already active, initializing Java-dependent features...");
      initializePlugin(context);
    } else {
      // 等待 Java 插件激活
      logger.info("Waiting for Java extension to activate...");
      const checkJavaExtensionActivation = () => {
				const javaExt = vscode.extensions.getExtension('redhat.java');
        if (javaExt?.isActive) {
					logger.info("Java extension activated, initializing Java-dependent features...");
          initializePlugin(context);
          clearInterval(interval);
        }
      };

      // 每秒检查一次Java扩展是否激活
      const interval = setInterval(checkJavaExtensionActivation, 1000);
      context.subscriptions.push({ dispose: () => clearInterval(interval) });
    }
  } else {
		logger.warn("Java extension not found, some MyBatis Helper features may be limited");
    updateStatusBar(vscode.l10n.t("status.javaExtensionNotFound"), false);
  }
}

/**
 * 初始化插件功能
 */
async function initializePlugin(context: vscode.ExtensionContext) {
  // 初始化 Java 扩展 API
  javaExtApi = JavaExtensionAPI.getInstance();
  await javaExtApi.initialize(context);

  if (!javaExtApi.isReady) {
    logger.error("Failed to initialize Java extension API");
    updateStatusBar(vscode.l10n.t("status.javaApiNotReady"), false);
    return;
  }

  // 注册所有命令和功能
  activatePluginFeatures(context);

  // 使用进度通知替代信息通知显示插件启动提示
	vscode.window.withProgress({
      location: vscode.ProgressLocation.Notification,
      title: vscode.l10n.t("info.extensionActivated"),
		cancellable: false
	}, async (progress) => {
      // 后台异步快速检查项目类型并显示进度
      try {
        await runFastProjectTypeCheck();
      } catch (error) {
        logger.error("Error during project initialization:", error as Error);
        updateStatusBar(vscode.l10n.t("status.nonJavaProject"), false);
      }
	});

  // 设置文件系统监听器来检测Java文件的添加/删除
  const watcher = vscode.workspace.createFileSystemWatcher("**/*.{java,xml}");

  // 处理文件创建
  watcher.onDidCreate(() => {
    // 异步检查，不阻塞主线程
    checkIfJavaProject();
  });

  // 处理文件删除
  watcher.onDidDelete(() => {
    // 异步检查，不阻塞主线程
    checkIfJavaProject();
  });

  // 注册监听器以便清理
  context.subscriptions.push(watcher);

  logger.info("MyBatis Helper extension activated and commands registered.");

  // 注册命令列表命令
  const showCommandsCommand = vscode.commands.registerCommand(
    "mybatis-helper.showCommands",
    async () => {
      if (!isJavaProject) {
				vscode.window.showInformationMessage(vscode.l10n.t("status.nonJavaProject"));
        return;
      }

      const commands = [
				{ command: "mybatis-helper.jumpToXml", label: vscode.l10n.t("command.jumpToXml.title") },
				{ command: "mybatis-helper.jumpToMapper", label: vscode.l10n.t("command.jumpToMapper.title") },
				{ command: "mybatis-helper.refreshMappings", label: vscode.l10n.t("command.refreshMappings.title") },
				{ command: "mybatis-helper.toggleLogInterceptor", label: vscode.l10n.t("command.toggleLogInterceptor.title") },
				{ command: "mybatis-helper.showSqlOutput", label: vscode.l10n.t("command.showSqlOutput.title") },
				{ command: "mybatis-helper.clearSqlHistory", label: vscode.l10n.t("command.clearSqlHistory.title") }
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
}

/**
 * 更新状态栏显示
 */
function updateStatusBar(message: string, isWorking: boolean = true) {
  if (statusBarItem) {
    statusBarItem.text = isWorking
      ? `$(database) MyBatis Helper: ${message}`
      : `$(database) MyBatis Helper: ${message}`;
    statusBarItem.show();
  }
}

/**
 * 快速检查项目类型，使用轻量级方法
 */
async function runFastProjectTypeCheck(): Promise<void> {
  try {
    // 快速检查工作区根目录下的常见Java项目文件
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

    // 如果找到Java构建文件或同时找到Java和XML文件，则认为是Java项目
    if (hasBuildFiles || (hasJavaFiles && hasXmlFiles)) {
      isJavaProject = true;
      logger.info("Fast project type check: Java project detected");
      updateStatusBar(vscode.l10n.t("status.buildingMappings"));

      // 如果fileMapper已初始化，刷新映射
      if (fileMapper) {
        try {
          await fileMapper.refreshAllMappings();
        } catch (error) {
          logger.error("Error during initial mapping refresh:", error as Error);
        } finally {
          updateStatusBar(vscode.l10n.t("status.mappingsComplete"), false);
        }
      } else {
        // 如果fileMapper未初始化，也更新为完成状态，等待后续激活
        updateStatusBar(vscode.l10n.t("status.mappingsComplete"), false);
      }
      // 后台执行完整检查以确保准确性
      setTimeout(() => checkIfJavaProject(), 1000);
      return;
    } else {
      // 确认是非Java项目
      isJavaProject = false;
      updateStatusBar(vscode.l10n.t("status.nonJavaProject"), false);
    }

    // 如果没有找到项目文件，再进行标准检查
    await checkIfJavaProject();
  } catch (error) {
    logger.error("Error in fast project type check:", error as Error);
    updateStatusBar(vscode.l10n.t("status.nonJavaProject"), false);
  }
}

/**
 * 检查工作区是否包含Java文件
 */
async function checkIfJavaProject() {
  try {
    // 限制搜索深度和数量以提高性能
    const [javaFiles, xmlFiles] = await Promise.all([
      vscode.workspace.findFiles("**/*.java", null, 100),
			vscode.workspace.findFiles("**/*.xml", null, 100)
    ]);
    const newIsJavaProject = javaFiles.length > 0 && xmlFiles.length > 0;

    if (newIsJavaProject && !isJavaProject) {
      // 项目状态从非Java变为Java
      isJavaProject = true;
      logger.info("MyBatis Helper activated for Java project");
      // 显示建立映射的进度
      updateStatusBar(vscode.l10n.t("status.buildingMappings"));

      // 如果fileMapper已初始化，刷新映射
      if (fileMapper) {
        try {
          await fileMapper.refreshAllMappings();
          // 映射完成后更新状态栏
          updateStatusBar(vscode.l10n.t("status.mappingsComplete"), false);
        } catch (error) {
          logger.error("Error refreshing mappings:", error as Error);
          updateStatusBar(vscode.l10n.t("status.nonJavaProject"), false);
        }
      } else {
        // 即使没有fileMapper，也要更新状态
        updateStatusBar(vscode.l10n.t("status.mappingsComplete"), false);
      }

      vscode.window.showInformationMessage(
				vscode.l10n.t("info.javaProjectActivated")
      );
    } else if (!newIsJavaProject && isJavaProject) {
      // 项目状态从Java变为非Java
      isJavaProject = false;
      logger.info("Not a Java project, MyBatis Helper features disabled");
      updateStatusBar(vscode.l10n.t("status.nonJavaProject"), false);
      vscode.window.showInformationMessage(
				vscode.l10n.t("info.javaProjectDeactivated")
      );
    } else if (!newIsJavaProject && !isJavaProject) {
      // 确认是非Java项目
      updateStatusBar(vscode.l10n.t("status.nonJavaProject"), false);
    } else if (newIsJavaProject && isJavaProject) {
      // 仍然是Java项目，更新状态栏为完成状态
      updateStatusBar(vscode.l10n.t("status.mappingsComplete"), false);
    }
  } catch (error) {
    logger.error("Error checking project type:", error as Error);
    isJavaProject = false;
    updateStatusBar(vscode.l10n.t("status.nonJavaProject"), false);
  }
}

// Track if commands have been registered to prevent duplicate registration
let commandsRegistered = false;
let implementationProviderRegistered = false;

function activatePluginFeatures(context: vscode.ExtensionContext) {
	logger.debug(`[extension] activatePluginFeatures called, context: ${context}`);
  // Initialize console log interceptor
  if (!consoleLogInterceptor) {
    logger.debug(`[extension] Initializing console log interceptor`);
    consoleLogInterceptor = new ConsoleLogInterceptor();
  }

  // Initialize file mapper
  if (!fileMapper) {
    logger.debug(`[extension] Initializing file mapper`);
    fileMapper = new FileMapper();
    logger.debug(`[extension] File mapper initialized: ${fileMapper}`);
  }

  // Initialize SQL result displayer
  if (!sqlResultDisplayer) {
    logger.debug(`[extension] Initializing SQL result displayer`);
    sqlResultDisplayer = new SQLResultDisplayer(context.extensionUri);
  }

  // Initialize CodeLens provider
  if (!codeLensProvider && fileMapper) {
    logger.debug(`[extension] Initializing CodeLens provider`);
    codeLensProvider = new MyBatisCodeLensProvider(fileMapper);
    const codeLensRegistration = vscode.languages.registerCodeLensProvider(
      ["java", "xml"],
			codeLensProvider
    );
    context.subscriptions.push(codeLensRegistration);
  }

  // Initialize Implementation provider for Java -> XML
  if (!implementationProviderRegistered && fileMapper) {
    const implementationRegistration =
      vscode.languages.registerImplementationProvider(
        { language: "java", scheme: "file" },
        {
          provideImplementation: async (document, position) => {
            if (!fileMapper) {
              return;
            }

            const methodName = fileMapper.extractMethodNameFromDocumentPublic(
              document,
              position,
            );
            if (!methodName) {
              return;
            }

            const javaFilePath = document.uri.fsPath;
            const xmlPath =
              await fileMapper.resolveXmlPathForJavaPublic(javaFilePath);
            if (!xmlPath) {
              return;
            }

            const xmlPosition = await fileMapper.findMethodPositionPublic(
              xmlPath,
              methodName,
            );
            const targetUri = vscode.Uri.file(xmlPath);
            const targetPosition = xmlPosition ?? new vscode.Position(0, 0);
            return new vscode.Location(targetUri, targetPosition);
          },
        },
      );
    context.subscriptions.push(implementationRegistration);
    implementationProviderRegistered = true;
  }

  // Initialize SQL Completion provider
  if (!sqlCompletionProvider && fileMapper) {
    logger.debug(`[extension] Initializing SQL Completion provider`);
    sqlCompletionProvider = new SQLCompletionProvider(fileMapper);
		logger.debug(`[extension] SQLCompletionProvider created: ${sqlCompletionProvider}`);
		const completionRegistration = vscode.languages.registerCompletionItemProvider(
        ["xml"],
        sqlCompletionProvider,
        "#",
			"$"
    );
		logger.debug(`[extension] CompletionItemProvider registered for XML files with trigger characters: #, $`);
    context.subscriptions.push(completionRegistration);
		logger.debug(`[extension] CompletionItemProvider added to context subscriptions`);
  }
  logger.debug(`[extension] SQL Completion provider initialization completed`);

  // Register commands only once
  if (!commandsRegistered) {
    // Register refreshDataCommand
    const refreshDataCommand = vscode.commands.registerCommand(
      "mybatis-helper.refreshData",
      async () => {
        if (isJavaProject && fileMapper) {
          await fileMapper.refreshAllMappings();
          vscode.window.showInformationMessage(
					vscode.l10n.t("info.mybatisMappingsRefreshed")
          );
        } else {
          vscode.window.showWarningMessage(
						vscode.l10n.t("warning.notJavaProjectOrFileMapperNotInitialized")
          );
        }
			}
    );

    // Register toggleLogInterceptorCommand
    const toggleLogInterceptorCommand = vscode.commands.registerCommand(
      "mybatis-helper.toggleLogInterceptor",
      () => {
        if (consoleLogInterceptor) {
          const isActive = consoleLogInterceptor.toggleIntercepting();
          vscode.window.showInformationMessage(
            isActive
              ? vscode.l10n.t("info.logInterceptorActivated")
							: vscode.l10n.t("info.logInterceptorDeactivated")
          );
        }
			}
    );

    // Register clearSqlHistoryCommand
    const clearSqlHistoryCommand = vscode.commands.registerCommand(
      "mybatis-helper.clearSqlHistory",
      async () => {
        if (consoleLogInterceptor) {
          consoleLogInterceptor.clearSQLHistory();
          vscode.window.showInformationMessage(
							vscode.l10n.t("info.sqlHistoryCleared")
          );
          // 同时清除结果展示器的缓存
          if (sqlResultDisplayer) {
            sqlResultDisplayer.clearAllCaches();
          }
        } else {
          vscode.window.showErrorMessage(
						vscode.l10n.t("error.logInterceptorNotInitialized")
          );
        }
			}
    );

    // Register jumpToXmlCommand
    const jumpToXmlCommand = vscode.commands.registerCommand(
      "mybatis-helper.jumpToXml",
      async (filePath?: any, methodName?: string) => {
        try {
          if (!fileMapper) {
            const errorMsg = vscode.l10n.t("error.fileMapperNotInitialized");
            logger.error(errorMsg);
            vscode.window.showErrorMessage(errorMsg);
            return;
          }

          logger.debug(`Jump to XML command triggered, filePath: ${filePath}, methodName: ${methodName}`);
          let editor = vscode.window.activeTextEditor;

          // If filePath is provided (from CodeLens), open file and move cursor
          if (filePath) {
            const javaFilePath =
              typeof filePath === "string" ? filePath : String(filePath);
            logger.debug(
              `Using provided filePath: ${javaFilePath}, methodName: ${methodName}`,
            );
            const position = methodName
              ? await fileMapper.findJavaMethodPositionPublic(
                  javaFilePath,
                  methodName,
                )
              : undefined;
            await fileMapper.jumpToFilePublic(javaFilePath, position);
            editor = vscode.window.activeTextEditor;
          } else {
            if (!editor) {
              const errorMsg = "No active editor found";
              logger.error(errorMsg);
              vscode.window.showErrorMessage(errorMsg);
              return;
            }

					logger.debug(`Current editor language: ${editor.document.languageId}, file path: ${editor.document.uri.fsPath}`);

            if (editor.document.languageId !== "java") {
              const errorMsg = vscode.l10n.t("fileMapper.notJavaFile");
              logger.error(errorMsg);
              vscode.window.showInformationMessage(errorMsg);
              return;
            }
          }

          if (!editor) {
            const errorMsg = "No active editor found";
            logger.error(errorMsg);
            vscode.window.showErrorMessage(errorMsg);
            return;
          }

          // 使用 VS Code 内置实现跳转
          await vscode.commands.executeCommand(
            "editor.action.goToImplementation",
          );
        } catch (error) {
          logger.error("Error jumping to XML file:", error as Error);
          vscode.window.showErrorMessage(
					vscode.l10n.t("error.cannotOpenFile", { error: error instanceof Error ? error.message : "Unknown error" })
          );
        }
		}
    );

    // Register jumpToMapperCommand
    const jumpToMapperCommand = vscode.commands.registerCommand(
      "mybatis-helper.jumpToMapper",
      async (filePath?: any, methodName?: string) => {
        try {
          if (!fileMapper) {
            vscode.window.showErrorMessage(
						vscode.l10n.t("error.fileMapperNotInitialized")
            );
            return;
          }

          // If filePath is provided (from CodeLens), use it
          if (filePath) {
            // Ensure filePath is a string
					const xmlFilePath = typeof filePath === 'string' ? filePath : String(filePath);
            // 使用XML到Java导航器
					logger.debug(`Jumping from XML file to Java: ${xmlFilePath}, method: ${methodName}`);
					await fileMapper['xmlToJavaNavigator'].navigateToJava(xmlFilePath, methodName);
          } else {
            const editor = vscode.window.activeTextEditor;
            if (!editor || editor.document.languageId !== "xml") {
						vscode.window.showInformationMessage(vscode.l10n.t("fileMapper.notXmlFile"));
              return;
            }

            // 从当前编辑器获取XML文件路径和方法名
            const xmlFilePath = editor.document.uri.fsPath;
					const currentMethodName = fileMapper.extractMethodNamePublic(editor);
					logger.debug(`Jumping from XML file to Java: ${xmlFilePath}, method: ${currentMethodName}`);
					await fileMapper['xmlToJavaNavigator'].navigateToJava(xmlFilePath, currentMethodName);
          }
        } catch (error) {
          logger.error("Error jumping to mapper file:", error as Error);
          vscode.window.showErrorMessage(
					vscode.l10n.t("error.cannotOpenFile", { error: error instanceof Error ? error.message : "Unknown error" })
          );
        }
		}
    );

    // Register refreshMappingsCommand
    const refreshMappingsCommand = vscode.commands.registerCommand(
      "mybatis-helper.refreshMappings",
      async () => {
        if (!isJavaProject) {
					vscode.window.showInformationMessage(vscode.l10n.t("status.nonJavaProject"));
          return;
        }
        if (fileMapper) {
          // 显示建立映射的进度
          updateStatusBar(vscode.l10n.t("status.buildingMappings"));
          logger.info("Refreshing MyBatis mappings...");
          try {
            await fileMapper.refreshAllMappings();
            // 映射完成后更新状态栏
            updateStatusBar(vscode.l10n.t("status.mappingsComplete"), false);
            logger.info("MyBatis mappings refreshed successfully");
            vscode.window.showInformationMessage(
							vscode.l10n.t("info.mybatisMappingsRefreshed")
            );
          } catch (error) {
            logger.error("Error refreshing mappings:", error as Error);
            updateStatusBar(vscode.l10n.t("status.nonJavaProject"), false);
            vscode.window.showErrorMessage(
							vscode.l10n.t("error.mappingRefreshFailed", { error: error instanceof Error ? error.message : "Unknown error" })
            );
          }
        } else {
					vscode.window.showErrorMessage(vscode.l10n.t("error.fileMapperNotInitialized"));
          // 即使没有初始化fileMapper，也要更新状态栏
          updateStatusBar(vscode.l10n.t("status.mappingsComplete"), false);
        }
			}
    );

    // Register showSqlOutputCommand
    const showSqlOutputCommand = vscode.commands.registerCommand(
      "mybatis-helper.showSqlOutput",
      () => {
        if (consoleLogInterceptor) {
          consoleLogInterceptor.showSQLOutput();
        } else {
					vscode.window.showErrorMessage(vscode.l10n.t("error.logInterceptorNotInitialized"));
        }
			}
    );

    // Subscribe to commands for cleanup
    context.subscriptions.push(
      refreshDataCommand,
      toggleLogInterceptorCommand,
      clearSqlHistoryCommand,
      jumpToXmlCommand,
      jumpToMapperCommand,
      refreshMappingsCommand,
			showSqlOutputCommand
    );

    // Register configuration change listener
    const configChangeHandler = (e: vscode.ConfigurationChangeEvent) => {
      if (e.affectsConfiguration("mybatis-helper")) {
        logger.debug("MyBatis Helper configuration changed");
        // Handle configuration changes
        if (consoleLogInterceptor) {
          const enableLogInterceptor = vscode.workspace
            .getConfiguration("mybatis-helper")
            .get<boolean>("enableLogInterceptor", true);
          if (
						enableLogInterceptor !== consoleLogInterceptor.getInterceptingState()
          ) {
            consoleLogInterceptor.toggleIntercepting();
            vscode.window.showInformationMessage(
              enableLogInterceptor
                ? vscode.l10n.t("info.logInterceptorActivatedByConfig")
								: vscode.l10n.t("info.logInterceptorDeactivatedByConfig")
            );
          }
        }

        // If file mapper exists, refresh mappings when configuration changes
        if (fileMapper && isJavaProject) {
          const autoRefreshMappings = vscode.workspace
            .getConfiguration("mybatis-helper")
            .get<boolean>("autoRefreshMappings", true);
          if (autoRefreshMappings) {
            // Don't show progress for automatic refresh
            fileMapper.refreshAllMappings().catch((error: any) => {
              logger.error("Error auto-refreshing mappings:", error as Error);
            });
          }
        }
      }
    };

    context.subscriptions.push(
			vscode.workspace.onDidChangeConfiguration(configChangeHandler)
    );

    // Mark commands as registered
    commandsRegistered = true;
  }
}

function deactivatePluginFeatures() {
  // Clean up resources with error handling
  try {
    logger.info("Cleaning up MyBatis Helper resources...");

    // 清理控制台日志拦截器
    if (consoleLogInterceptor) {
      try {
        consoleLogInterceptor.dispose();
      } catch (error) {
				logger.error("Error disposing console log interceptor:", error as Error);
      }
      consoleLogInterceptor = undefined;
    }

    // 清理SQL结果显示器
    if (sqlResultDisplayer) {
      try {
        sqlResultDisplayer.dispose();
      } catch (error) {
        logger.error("Error disposing SQL result displayer:", error as Error);
      }
      sqlResultDisplayer = undefined;
    }

    // 清理文件映射器
    if (fileMapper) {
      try {
        fileMapper.dispose();
      } catch (error) {
        logger.error("Error disposing file mapper:", error as Error);
      }
      fileMapper = undefined;
    }

    // Clean up CodeLens provider
    codeLensProvider = undefined;

    // Clean up SQL Completion provider
    sqlCompletionProvider = undefined;

    // 更新状态栏显示
    updateStatusBar(vscode.l10n.t("status.nonJavaProject"), false);
  } catch (error) {
    logger.error("Error during plugin feature deactivation:", error as Error);
  }
}

// This method is called when your extension is deactivated
export function deactivate() {
  deactivatePluginFeatures();
  logger.info("MyBatis Helper extension deactivated");
}