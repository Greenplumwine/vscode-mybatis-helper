// VS Code 1.73+ 版本内置了国际化支持，直接使用vscode.l10n.t()方法
import * as vscode from "vscode";
import * as fs from "fs";
import { ConsoleLogInterceptor } from "./features/consoleloginterceptor";
import { SQLResultDisplayer } from "./features/sqlresultdisplayer";
import { FileMapper } from "./features/filemapper";
import { MyBatisCodeLensProvider } from "./features/codeLensProvider";
import { SQLQuery } from "./types";
import { PerformanceUtils, JavaExtensionAPI, AdvancedCacheManager, IncrementalScanner, MappingIndexManager } from "./utils";

let isJavaProject: boolean = false;
let consoleLogInterceptor: ConsoleLogInterceptor | undefined;
let sqlResultDisplayer: SQLResultDisplayer | undefined;
let fileMapper: FileMapper | undefined;
let statusBarItem: vscode.StatusBarItem | undefined;
let codeLensProvider: MyBatisCodeLensProvider | undefined;

// 性能监控工具实例
const perfUtils = PerformanceUtils.getInstance();
const javaExtApi = JavaExtensionAPI.getInstance();
const cacheManager = AdvancedCacheManager.getInstance();
const incrementalScanner = IncrementalScanner.getInstance();
const mappingIndexManager = MappingIndexManager.getInstance();

// 初始化性能优化组件
async function initializePerformanceComponents(context: vscode.ExtensionContext) {
  try {
    // 初始化 Java 扩展 API
    await javaExtApi.initialize(context);
    
    // 初始化映射索引管理器
    await mappingIndexManager.initialize();
    
    console.log("Performance components initialized successfully");
  } catch (error) {
    console.error("Failed to initialize performance components:", error);
  }
}

// Display sample logs in console log panel for testing log interception functionality
function displaySampleLogsForTesting() {
	// Create sample log output channel
	const testLogChannel = vscode.window.createOutputChannel("MyBatis Test Logs");

	// Sample MyBatis logs
	const sampleLogs = [
		"==>  Preparing: SELECT * FROM users WHERE id = ?",
		"==> Parameters: 123(Integer)",
		"<==    Columns: id, name, email",
		"<==        Row: 123, John Doe, john.doe@example.com",
		"<==      Total: 1",
		"==>  Preparing: INSERT INTO products (name, price) VALUES (?, ?)",
		"==> Parameters: Laptop(String), 999.99(Double)",
		"<==    Updates: 1",
	];

	// Display sample logs
	sampleLogs.forEach((log) => {
		console.log(log);
		testLogChannel.appendLine(log);
	});

	// Show the log channel
	testLogChannel.show();
}

// This method is called when your extension is activated
// Your extension is activated the very first time the command is executed
export function activate(context: vscode.ExtensionContext) {
	console.log("MyBatis Helper extension activating...");

	// 初始化性能优化组件
	initializePerformanceComponents(context);

	// 创建状态栏项
	statusBarItem = vscode.window.createStatusBarItem(vscode.StatusBarAlignment.Left, 100);
	statusBarItem.text = `$(database) MyBatis Helper`;
	statusBarItem.tooltip = vscode.l10n.t("extension.description");
	statusBarItem.command = "mybatis-helper.showCommands";
	statusBarItem.show();
	context.subscriptions.push(statusBarItem);

	// 立即注册所有命令，不要等到检查完项目类型
	activatePluginFeatures(context);

	// 显示插件启动提示
	vscode.window.showInformationMessage(vscode.l10n.t("info.extensionActivated"));

	// 后台异步快速检查项目类型并显示进度
	runFastProjectTypeCheck().catch(error => {
		console.error("Error during project initialization:", error);
		updateStatusBar(vscode.l10n.t("status.nonJavaProject"), false);
	});

	// 设置文件系统监听器来检测Java文件的添加/删除
const watcher = vscode.workspace.createFileSystemWatcher("**/*.{java,xml}");

// 使用防抖处理文件变更检测，避免频繁检查
const debouncedCheckProject = perfUtils.debounce(() => {
	checkIfJavaProject();
}, 2000);

// 处理文件创建
watcher.onDidCreate(() => {
	if (!isJavaProject) {
		// 异步检查，不阻塞主线程
		debouncedCheckProject();
	}
});

// 处理文件删除
watcher.onDidDelete(() => {
	if (isJavaProject) {
		// 异步检查，不阻塞主线程
		debouncedCheckProject();
	}
});

	// 注册监听器以便清理
	context.subscriptions.push(watcher);

	console.log("MyBatis Helper extension activated and commands registered.");

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
async function runFastProjectTypeCheck() {
	const startTime = Date.now();
	try {
		// 显示检查项目类型的进度
		updateStatusBar(vscode.l10n.t("status.checkingJavaProject"));

		// 先快速检查根目录下是否有常见的Java项目文件
		const projectFiles = await vscode.workspace.findFiles(
			"{pom.xml,build.gradle,build.gradle.kts,settings.gradle}",
			null,
			1
		);
		const hasProjectFiles = projectFiles.length > 0;

		if (hasProjectFiles) {
			console.log("Java project detected (fast check).");
			isJavaProject = true;
			// 显示建立映射的进度
			updateStatusBar(vscode.l10n.t("status.buildingMappings"));
			// 立即尝试刷新映射（如果fileMapper已初始化）
			if (fileMapper) {
				fileMapper.refreshAllMappings().catch(error => {
					console.error("Error during initial mapping refresh:", error);
				}).finally(() => {
					updateStatusBar(vscode.l10n.t("status.mappingsComplete"), false);
				});
			} else {
				// 如果fileMapper未初始化，也更新为完成状态，等待后续激活
				updateStatusBar(vscode.l10n.t("status.mappingsComplete"), false);
			}
			// 后台执行完整检查以确保准确性
			setTimeout(() => checkIfJavaProject(), 1000);
			return;
		}

		// 如果没有找到项目文件，再进行标准检查
		await checkIfJavaProject();
	} catch (error) {
		console.error("Error in fast project type check:", error);
		updateStatusBar(vscode.l10n.t("status.nonJavaProject"), false);
	} finally {
		perfUtils.logExecutionTime("runFastProjectTypeCheck", () => {
			// Execution time logging
			return true;
		});
	}
}

/**
 * 检查工作区是否包含Java文件
 */
async function checkIfJavaProject() {
	const startTime = Date.now();
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
			console.log("MyBatis Helper activated for Java project");
			// 显示建立映射的进度
			updateStatusBar(vscode.l10n.t("status.buildingMappings"));
			
			// 如果fileMapper已初始化，刷新映射
			if (fileMapper) {
				try {
					await fileMapper.refreshAllMappings();
					// 映射完成后更新状态栏
					updateStatusBar(vscode.l10n.t("status.mappingsComplete"), false);
				} catch (error) {
					console.error("Error refreshing mappings:", error);
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
			console.log("Not a Java project, MyBatis Helper features disabled");
			updateStatusBar(vscode.l10n.t("status.nonJavaProject"), false);
			vscode.window.showInformationMessage(
				vscode.l10n.t("info.javaProjectDeactivated")
			);
		} else if (!newIsJavaProject && !isJavaProject) {
			// 确认是非Java项目
			updateStatusBar(vscode.l10n.t("status.nonJavaProject"), false);
			vscode.window.showInformationMessage(
				vscode.l10n.t("status.nonJavaProject")
			);
		} else if (newIsJavaProject && isJavaProject) {
			// 仍然是Java项目，更新状态栏为完成状态
			updateStatusBar(vscode.l10n.t("status.mappingsComplete"), false);
		}
	} catch (error) {
		console.error("Error checking project type:", error);
		isJavaProject = false;
		updateStatusBar(vscode.l10n.t("status.nonJavaProject"), false);
	} finally {
		perfUtils.logExecutionTime("checkIfJavaProject", () => {
			// Execution time logging
			return true;
		});
	}
}

function activatePluginFeatures(context: vscode.ExtensionContext) {
	// Initialize console log interceptor
	if (!consoleLogInterceptor) {
		consoleLogInterceptor = new ConsoleLogInterceptor();
	}

	// Initialize file mapper
	if (!fileMapper) {
		fileMapper = new FileMapper();
	}

	// Initialize SQL result displayer
	if (!sqlResultDisplayer) {
		sqlResultDisplayer = new SQLResultDisplayer(context.extensionUri);
	}

	// Initialize CodeLens provider
	if (!codeLensProvider && fileMapper) {
		codeLensProvider = new MyBatisCodeLensProvider(fileMapper);
		const codeLensRegistration = vscode.languages.registerCodeLensProvider(
			["java", "xml"],
			codeLensProvider
		);
		context.subscriptions.push(codeLensRegistration);
	}

	// Register commands
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

	// Toggle log interceptor command
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

	// Clear SQL history command
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

	// Jump to XML command
	const jumpToXmlCommand = vscode.commands.registerCommand(
		"mybatis-helper.jumpToXml",
		async (filePath?: string, methodName?: string) => {
			const startTime = Date.now();
			try {
				if (!fileMapper) {
					vscode.window.showErrorMessage(
						vscode.l10n.t("error.fileMapperNotInitialized")
					);
					return;
				}

				// If filePath is provided (from CodeLens), use it
				if (filePath && filePath.endsWith(".java")) {
					// 使用Java到XML导航器
					await fileMapper['javaToXmlNavigator'].navigateToXml(filePath, methodName);
				}
				// Check if current file is a Java file (快捷键触发的情况)
				else {
					const editor = vscode.window.activeTextEditor;
					if (!editor || editor.document.languageId !== "java") {
						vscode.window.showInformationMessage(vscode.l10n.t("fileMapper.notJavaFile"));
						return;
					}
					
					// 从当前编辑器获取Java文件路径和方法名
					const javaFilePath = editor.document.uri.fsPath;
					const currentMethodName = fileMapper.extractMethodNamePublic(editor);
					await fileMapper['javaToXmlNavigator'].navigateToXml(javaFilePath, currentMethodName);
				}
			} catch (error) {
				console.error("Error jumping to XML file:", error);
				vscode.window.showErrorMessage(
					vscode.l10n.t("error.cannotOpenFile", { error: error instanceof Error ? error.message : "Unknown error" })
				);
			} finally {
				perfUtils.recordExecutionTime("jumpToXml", Date.now() - startTime);
			}
		}
	);

	// Jump to Mapper command
	const jumpToMapperCommand = vscode.commands.registerCommand(
		"mybatis-helper.jumpToMapper",
		async (filePath?: string, methodName?: string) => {
			const startTime = Date.now();
			try {
				if (!fileMapper) {
					vscode.window.showErrorMessage(
						vscode.l10n.t("error.fileMapperNotInitialized")
					);
					return;
				}

				// If filePath is provided (from CodeLens), use it
				if (filePath && filePath.endsWith(".xml")) {
					// 使用XML到Java导航器
					await fileMapper['xmlToJavaNavigator'].navigateToJava(filePath, methodName);
				}
				// Check if current file is a XML file (快捷键触发的情况)
				else {
					const editor = vscode.window.activeTextEditor;
					if (!editor || editor.document.languageId !== "xml") {
						vscode.window.showInformationMessage(vscode.l10n.t("fileMapper.notXmlFile"));
						return;
					}
					
					// 从当前编辑器获取XML文件路径和方法名
					const xmlFilePath = editor.document.uri.fsPath;
					const currentMethodName = fileMapper.extractMethodNamePublic(editor);
					await fileMapper['xmlToJavaNavigator'].navigateToJava(xmlFilePath, currentMethodName);
				}
			} catch (error) {
				console.error("Error jumping to mapper file:", error);
				vscode.window.showErrorMessage(
					vscode.l10n.t("error.cannotOpenFile", { error: error instanceof Error ? error.message : "Unknown error" })
				);
			} finally {
				perfUtils.recordExecutionTime("jumpToMapper", Date.now() - startTime);
			}
		}
	);

	// Register refresh mappings command
	const refreshMappingsCommand = vscode.commands.registerCommand(
		"mybatis-helper.refreshMappings",
		async () => {
			const startTime = Date.now();
			try {
				if (!isJavaProject) {
					vscode.window.showInformationMessage(vscode.l10n.t("status.nonJavaProject"));
					return;
				}
				if (fileMapper) {
					// 显示建立映射的进度
					updateStatusBar(vscode.l10n.t("status.buildingMappings"));
					try {
						if (fileMapper) { await fileMapper.refreshAllMappings(); }
						// 映射完成后更新状态栏
						updateStatusBar(vscode.l10n.t("status.mappingsComplete"), false);
						vscode.window.showInformationMessage(
							vscode.l10n.t("info.mybatisMappingsRefreshed")
						);
					} catch (error) {
						console.error("Error refreshing mappings:", error);
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
			} finally {
				perfUtils.recordExecutionTime("refreshMappings", Date.now() - startTime);
			}
		}
	);

	// Show SQL output command
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

	// Register configuration change listener with debounce
	const debouncedConfigChangeHandler = perfUtils.debounce((e: vscode.ConfigurationChangeEvent) => {
		if (e.affectsConfiguration("mybatis-helper")) {
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
						console.error("Error auto-refreshing mappings:", error);
					});
				}
			}
		}
	}, 500);

	context.subscriptions.push(
		vscode.workspace.onDidChangeConfiguration(debouncedConfigChangeHandler)
	);
}

function deactivatePluginFeatures() {
	// Clean up resources with error handling
	try {
		// 清除性能监控缓存
		perfUtils.clearCache();

		// 清理控制台日志拦截器
		if (consoleLogInterceptor) {
			try {
				consoleLogInterceptor.dispose();
			} catch (error) {
				console.error("Error disposing console log interceptor:", error);
			}
			consoleLogInterceptor = undefined;
		}

		// 清理SQL结果显示器
		if (sqlResultDisplayer) {
			try {
				sqlResultDisplayer.dispose();
			} catch (error) {
				console.error("Error disposing SQL result displayer:", error);
			}
			sqlResultDisplayer = undefined;
		}

		// 清理文件映射器
		if (fileMapper) {
			try {
				fileMapper.dispose();
			} catch (error) {
				console.error("Error disposing file mapper:", error);
			}
			fileMapper = undefined;
		}

		// Clean up CodeLens provider
		codeLensProvider = undefined;

		// 更新状态栏显示
		updateStatusBar(vscode.l10n.t("status.nonJavaProject"), false);
	} catch (error) {
		console.error("Error during plugin feature deactivation:", error);
	}
}

// This method is called when your extension is deactivated
export function deactivate() {
	deactivatePluginFeatures();
	console.log("MyBatis Helper extension deactivated");
}
