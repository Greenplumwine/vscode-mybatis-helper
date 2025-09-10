// VS Code 1.73+ 版本内置了国际化支持，直接使用vscode.l10n.t()方法
import * as vscode from "vscode";
import { ConsoleLogInterceptor } from "./features/consoleloginterceptor";
import { SQLResultDisplayer } from "./features/sqlresultdisplayer";
import { FileMapper } from "./features/filemapper";
import { MyBatisCodeLensProvider } from "./features/codeLensProvider";
import { SQLQuery } from "./types";

let isJavaProject: boolean = false;
let consoleLogInterceptor: ConsoleLogInterceptor | undefined;
let sqlResultDisplayer: SQLResultDisplayer | undefined;
let fileMapper: FileMapper | undefined;
let statusBarItem: vscode.StatusBarItem | undefined;
let codeLensProvider: MyBatisCodeLensProvider | undefined;
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

	// 处理文件创建
	watcher.onDidCreate(() => {
		if (!isJavaProject) {
			// 异步检查，不阻塞主线程
			setTimeout(() => checkIfJavaProject(), 1000);
		}
	});

	// 处理文件删除
	watcher.onDidDelete(() => {
		if (isJavaProject) {
			// 异步检查，不阻塞主线程
			setTimeout(() => checkIfJavaProject(), 1000);
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
			// 后台执行完整检查
			setTimeout(() => checkIfJavaProject(), 1000);
			return;
		}

		// 如果没有找到项目文件，再进行标准检查
		await checkIfJavaProject();
	} catch (error) {
		console.error("Error in fast project type check:", error);
		updateStatusBar(vscode.l10n.t("status.nonJavaProject"), false);
	}
}

/**
 * 检查工作区是否包含Java文件
 */
async function checkIfJavaProject() {
	try {
		// 限制搜索深度和数量以提高性能
		const javaFiles = await vscode.workspace.findFiles("**/*.java", null, 100);
		const xmlFiles = await vscode.workspace.findFiles("**/*.xml", null, 100);
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
					await fileMapper.refreshMappings();
					// 映射完成后更新状态栏
					updateStatusBar(vscode.l10n.t("status.mappingsComplete"), false);
				} catch (error) {
					console.error("Error refreshing mappings:", error);
					updateStatusBar(vscode.l10n.t("status.nonJavaProject"), false);
				}
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
		}
	} catch (error) {
		console.error("Error checking project type:", error);
		isJavaProject = false;
		updateStatusBar(vscode.l10n.t("status.nonJavaProject"), false);
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
				await fileMapper.refreshMappings();
				vscode.window.showInformationMessage(
					vscode.l10n.t("info.mybatisMappingsRefreshed")
				);
			} else {
				vscode.window.showWarningMessage(
					"Not in a Java project or file mapper not initialized"
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
			}
		}
	);

	// Clear SQL history command
	const clearSqlHistoryCommand = vscode.commands.registerCommand(
		"mybatis-helper.clearSqlHistory",
		() => {
			if (consoleLogInterceptor) {
				consoleLogInterceptor.clearSQLHistory();
			}
		}
	);

	// Jump to XML command
	const jumpToXmlCommand = vscode.commands.registerCommand(
		"mybatis-helper.jumpToXml",
		async (filePath?: string, methodName?: string) => {
			if (!fileMapper) {
				return;
			}

			// If filePath is provided (from CodeLens), use it
			if (filePath && filePath.endsWith(".java")) {
				// 直接跳转到XML文件，不创建虚拟编辑器
				// 先检查缓存中是否有对应的XML文件
				// 获取所有映射，然后查找对应的XML路径
				const mappings = fileMapper.getMappings();
				let xmlPath = null;
				
				// 遍历映射数组查找对应的XML路径
				for (const mapping of mappings) {
					if (mapping.mapperPath === filePath) {
						xmlPath = mapping.xmlPath;
						break;
					}
				}
				
				if (!xmlPath) {
					// 如果缓存中没有，尝试直接查找
					const possibleXmlPaths = await (fileMapper as any).getPossibleXmlPaths(filePath);
					if (possibleXmlPaths && possibleXmlPaths.length > 0) {
						xmlPath = possibleXmlPaths[0];
					}
				}

				if (xmlPath) {
					let targetPosition: vscode.Position | undefined = undefined;
					if (methodName) {
						// 直接调用findMethodPosition方法而不是使用类型断言
						const position = await fileMapper.findMethodPosition(xmlPath, methodName);
						// 处理可能的null返回值
						targetPosition = position || undefined;
					}
					// 直接调用jumpToFile方法，确保fileOpenMode配置正确应用
					await fileMapper.jumpToFile(xmlPath, targetPosition);
				} else {
					vscode.window.showErrorMessage(vscode.l10n.t("fileMapper.noXmlFile"));
				}
			}
			// Check if current file is a Java file
			else {
				const editor = vscode.window.activeTextEditor;
				if (!editor || editor.document.languageId !== "java") {
					vscode.window.showInformationMessage(vscode.l10n.t("fileMapper.notJavaFile"));
					return;
				}
				await fileMapper.jumpToXml();
			}
		}
	);

	// Jump to Mapper command
	const jumpToMapperCommand = vscode.commands.registerCommand(
		"mybatis-helper.jumpToMapper",
		async (filePath?: string, methodName?: string) => {
			if (!fileMapper) {
				return;
			}

			// If filePath is provided (from CodeLens), use it
			if (filePath && filePath.endsWith(".xml")) {
				// 直接跳转到Mapper文件，不创建虚拟编辑器
				// 先检查缓存中是否有对应的Mapper文件
				const mappings = fileMapper.getMappings();
				let mapperPath = null;
				
				// 遍历映射数组查找对应的Mapper路径
				for (const mapping of mappings) {
					if (mapping.xmlPath === filePath) {
						mapperPath = mapping.mapperPath;
						break;
					}
				}
				
				if (!mapperPath) {
					// 如果缓存中没有，尝试直接查找
					const namespace = await (fileMapper as any).extractNamespace(filePath);
					if (namespace) {
						const className = namespace.substring(namespace.lastIndexOf(".") + 1);
						mapperPath = await (fileMapper as any).findJavaFileByClassName(className);
					}
				}

				if (mapperPath) {
					let targetPosition: vscode.Position | undefined = undefined;
					if (methodName) {
						// 直接调用findMethodPosition方法而不是使用类型断言
						const position = await fileMapper.findMethodPosition(mapperPath, methodName);
						// 处理可能的null返回值
						targetPosition = position || undefined;
					}
					// 直接调用jumpToFile方法，确保fileOpenMode配置正确应用
					await fileMapper.jumpToFile(mapperPath, targetPosition);
				} else {
					vscode.window.showErrorMessage(vscode.l10n.t("fileMapper.noMapperInterface"));
				}
			}
			// Check if current file is an XML file
			else {
				const editor = vscode.window.activeTextEditor;
				if (!editor || editor.document.languageId !== "xml") {
					vscode.window.showInformationMessage(vscode.l10n.t("fileMapper.notXmlFile"));
					return;
				}
				await fileMapper.jumpToMapper();
			}
		}
	);

	// Register refresh mappings command
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
				try {
					await fileMapper.refreshMappings();
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
			}
		}
	);

	// Show SQL output command
	const showSqlOutputCommand = vscode.commands.registerCommand(
		"mybatis-helper.showSqlOutput",
		() => {
			if (consoleLogInterceptor) {
				consoleLogInterceptor.showSQLOutput();
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
	vscode.workspace.onDidChangeConfiguration((e) => {
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
				}
			}
		}
	});
}

function deactivatePluginFeatures() {
	// Clean up resources
	if (consoleLogInterceptor) {
		consoleLogInterceptor.dispose();
		consoleLogInterceptor = undefined;
	}

	if (sqlResultDisplayer) {
		sqlResultDisplayer.dispose();
		sqlResultDisplayer = undefined;
	}

	if (fileMapper) {
		fileMapper.dispose();
		fileMapper = undefined;
	}

	// Clean up CodeLens provider
	codeLensProvider = undefined;

	// 更新状态栏显示
	updateStatusBar(vscode.l10n.t("status.nonJavaProject"), false);
}

// This method is called when your extension is deactivated
export function deactivate() {
	deactivatePluginFeatures();
	console.log("MyBatis Helper extension deactivated");
}
