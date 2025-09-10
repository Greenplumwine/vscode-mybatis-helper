import * as vscode from 'vscode';
import * as fs from 'fs/promises';
import * as path from 'path';
import { getPluginConfig } from '../utils';
import { PerformanceUtils } from '../utils/performanceUtils';
import { RegexUtils } from '../utils/performanceUtils';
import { FileUtils } from '../utils/performanceUtils';
import type { FileMapping } from '../types';
import { FileOpenMode } from '../types';

/**
 * Utility class for mapping Java Mapper interfaces to XML files and vice versa
 * Handles file searching, caching, and jumping between corresponding files
 */
export class FileMapper {
	// 缓存映射关系
	private readonly mappings: Map<string, string> = new Map(); // java -> xml
	private readonly reverseMappings: Map<string, string> = new Map(); // xml -> java

	// 文件扫描配置
	private readonly scanInterval: number;
	private readonly scanTimeoutMs: number;
	private scanTimer: NodeJS.Timeout | null = null;

	// 文件系统监听器
	private fileWatcher: vscode.FileSystemWatcher | null = null;

	// 跳转节流配置
	private readonly jumpThrottleMs: number;
	private lastJumpTime: { [key: string]: number } = {};
	
	// 防抖处理函数缓存
	private debounceHandlers: Map<string, (uri: vscode.Uri) => void> = new Map();

	// 文件打开模式
	private readonly fileOpenMode: FileOpenMode;

	// 单例工具类实例
	private performanceUtils: PerformanceUtils;
	private regexUtils: RegexUtils;
	private fileUtils: FileUtils;

	constructor() {
		// 初始化工具类单例实例
		this.performanceUtils = PerformanceUtils.getInstance();
		this.regexUtils = RegexUtils.getInstance();
		this.fileUtils = FileUtils.getInstance();

		// 从配置获取参数
		const config = getPluginConfig();
		this.scanInterval = 30000; // 使用默认值
		this.scanTimeoutMs = 30000; // 使用默认值
		this.jumpThrottleMs = 500; // 使用默认值
		this.fileOpenMode = config.fileOpenMode || FileOpenMode.USE_EXISTING;

		// 初始化
		this.setupFileWatchers();
		this.scheduleScan();
	}

	/**
	 * Schedule a delayed folder scan
	 */
	private scheduleScan(): void {
		// 使用防抖功能避免频繁扫描
		this.performanceUtils.debounce(
			async () => {
				const startTime = Date.now();
				try {
					await this.scanFolder();
				} finally {
					this.performanceUtils.recordExecutionTime('FileMapper.scanFolder', Date.now() - startTime);
				}
			},
			this.scanInterval
		);
	}

	/**
	 * Scan the workspace folder to find Java and XML files
	 */
	private async scanFolder(): Promise<void> {
		const startTime = Date.now();
		try {
			// 检查工作区是否已加载
			if (!vscode.workspace.workspaceFolders || vscode.workspace.workspaceFolders.length === 0) {
				return;
			}

			// 直接执行异步操作
			const startTimeFindFiles = Date.now();
			const javaFiles = await vscode.workspace.findFiles('**/*.java');
			const xmlFiles = await vscode.workspace.findFiles('**/*.xml');
			this.performanceUtils.recordExecutionTime('FileMapper.findFiles', Date.now() - startTimeFindFiles);

			// 直接处理文件列表
			for (const javaFile of javaFiles) {
				// 检查文件是否在工作区内
				if (!this.isFileInWorkspace(javaFile.fsPath)) {
					continue;
				}

				// 只处理可能是Mapper接口的文件
				if (await this.isMapperInterface(javaFile.fsPath)) {
					const xmlPath = await this.findXmlForMapper(javaFile.fsPath, xmlFiles);
					if (xmlPath) {
						this.mappings.set(javaFile.fsPath, xmlPath);
						this.reverseMappings.set(xmlPath, javaFile.fsPath);
					}
				}
		}
		} catch (error) {
			console.error('Error scanning folder:', error);
		} finally {
			this.performanceUtils.recordExecutionTime('FileMapper.scanFolder', Date.now() - startTime);
		}
	}

	/**
	 * Setup file watchers to handle incremental updates
	 */
	private setupFileWatchers(): void {
		const startTime = Date.now();
		try {
			// 检查工作区是否已加载
			if (!vscode.workspace.workspaceFolders || vscode.workspace.workspaceFolders.length === 0) {
				return;
			}

			// Watch for changes in Java and XML files
			this.fileWatcher = vscode.workspace.createFileSystemWatcher(
				'**/*.{java,xml}',
				false, // ignoreCreateEvents
				true, // ignoreChangeEvents
				true // ignoreDeleteEvents
			);

			// 使用防抖处理文件创建事件
			const handleFileCreate = this.performanceUtils.debounce((uri: vscode.Uri) => {
				// Only trigger a scan if file is in the workspace
				if (this.isFileInWorkspace(uri.fsPath)) {
					this.scheduleScan();
				}
			}, 1000);

			this.fileWatcher.onDidCreate(handleFileCreate);

			this.fileWatcher.onDidDelete((uri) => {
				// Remove deleted file from mappings
				const startTimeDelete = Date.now();
				try {
					if (uri.fsPath.endsWith('.java')) {
						const xmlPath = this.mappings.get(uri.fsPath);
						if (xmlPath) {
							this.mappings.delete(uri.fsPath);
							this.reverseMappings.delete(xmlPath);
						}
					} else if (uri.fsPath.endsWith('.xml')) {
						const mapperPath = this.reverseMappings.get(uri.fsPath);
						if (mapperPath) {
							this.reverseMappings.delete(uri.fsPath);
							this.mappings.delete(mapperPath);
						}
					}
				} finally {
					this.performanceUtils.recordExecutionTime('FileMapper.onDidDelete', Date.now() - startTimeDelete);
				}
			});

			// 处理文件变更事件，用于重新扫描相关文件
			this.fileWatcher.onDidChange((uri) => {
				// 使用防抖处理文件变更事件
				const debouncedChangeHandler = this.debounceHandlers.get(uri.fsPath);
				if (debouncedChangeHandler) {
					debouncedChangeHandler(uri);
				} else {
					const handleFileChange = this.performanceUtils.debounce((changedUri: vscode.Uri) => {
						if (this.isFileInWorkspace(changedUri.fsPath)) {
							// 仅清除与变更文件相关的映射
							if (changedUri.fsPath.endsWith('.java')) {
								const xmlPath = this.mappings.get(changedUri.fsPath);
								if (xmlPath) {
									this.mappings.delete(changedUri.fsPath);
									this.reverseMappings.delete(xmlPath);
								}
							} else if (changedUri.fsPath.endsWith('.xml')) {
								const mapperPath = this.reverseMappings.get(changedUri.fsPath);
								if (mapperPath) {
									this.reverseMappings.delete(changedUri.fsPath);
									this.mappings.delete(mapperPath);
								}
							}
							// 重新扫描可能受影响的文件
							this.scheduleScan();
						}
					}, 500);
					this.debounceHandlers.set(uri.fsPath, handleFileChange);
					handleFileChange(uri);
				}
			});

			// Store the watcher in the extension context for proper disposal
			// This will be handled by the dispose method in extension.ts
		} catch (error) {
			console.error('Error setting up file watchers:', error);
		} finally {
			this.performanceUtils.recordExecutionTime('FileMapper.setupFileWatchers', Date.now() - startTime);
		}
	}

	/**
	 * Check if a file is within the workspace
	 */
	private isFileInWorkspace(filePath: string): boolean {
		const startTime = Date.now();
		try {
			const workspaceFolders = vscode.workspace.workspaceFolders || [];
			return workspaceFolders.some((folder) => 
				filePath.startsWith(folder.uri.fsPath)
			);
		} finally {
			this.performanceUtils.recordExecutionTime('FileMapper.isFileInWorkspace', Date.now() - startTime);
		}
	}

	/**
	 * Check if a Java file is a Mapper interface
	 */
	private async isMapperInterface(javaFilePath: string): Promise<boolean> {
		const startTime = Date.now();
		try {
			// 使用FileUtils的带缓存文件检查
			const content = await this.fileUtils.safeReadFile(javaFilePath);
			if (!content) return false;

			// 使用RegexUtils的缓存正则表达式
			const isInterface = this.regexUtils.safeMatch(content, /interface\s+\w+/);
			const hasMyBatisAnnotation = this.regexUtils.safeMatch(content, 
				/@Mapper|@Select|@Insert|@Update|@Delete/
			);
			const hasMyBatisImport = this.regexUtils.safeMatch(content, 
				/import\s+org\.apache\.ibatis|import\s+org\.mybatis/
			);

			return !!isInterface && (!!hasMyBatisAnnotation || !!hasMyBatisImport);
		} catch (error) {
			console.error('Error checking Mapper interface:', error);
			return false;
		} finally {
			this.performanceUtils.recordExecutionTime('FileMapper.isMapperInterface', Date.now() - startTime);
		}
	}

	/**
	 * Find XML file for a Mapper interface
	 */
	private async findXmlForMapper(
		javaFilePath: string,
		xmlFiles: vscode.Uri[]
	): Promise<string | undefined> {
		const startTime = Date.now();
		try {
			// 快速路径：先尝试从类名和路径猜测XML位置
			const quickXmlPath = await this.findXmlByQuickPath(javaFilePath);
			if (quickXmlPath) {
				return quickXmlPath;
			}

			// Get class name from file path
			const fileName = path.basename(javaFilePath, '.java');

			// Priority 1: Check XML files in mapper/mappers directories first
			const mapperDirXmlFiles = xmlFiles.filter(
				(xmlFile) =>
					xmlFile.fsPath.includes('/mapper/') ||
					xmlFile.fsPath.includes('/mappers/')
			);

			// Try to find in mapper/mappers directories first
			for (const xmlFile of mapperDirXmlFiles) {
				const xmlFileName = path.basename(xmlFile.fsPath, '.xml');
				if (xmlFileName === fileName || xmlFileName === fileName + 'Mapper') {
					// 使用缓存的正则表达式
					const namespace = await this.fileUtils.parseXmlNamespace(xmlFile.fsPath);
					if (namespace) {
						const javaPackage = await this.fileUtils.parseJavaPackage(javaFilePath);
						if (javaPackage && namespace === javaPackage + '.' + fileName) {
							return xmlFile.fsPath;
						}
					} else {
						// If namespace cannot be read, use file name match as fallback
						return xmlFile.fsPath;
					}
				}
			}

			// 直接处理文件列表
			let result: string | undefined;
			for (const xmlFile of xmlFiles.filter(f => !f.fsPath.includes('/mapper/') && !f.fsPath.includes('/mappers/'))) {
				const xmlFileName = path.basename(xmlFile.fsPath, '.xml');
				if (xmlFileName === fileName || xmlFileName === fileName + 'Mapper') {
					// Use namespace verification
					const namespace = await this.fileUtils.parseXmlNamespace(xmlFile.fsPath);
					if (namespace) {
						const javaPackage = await this.fileUtils.parseJavaPackage(javaFilePath);
						if (javaPackage && namespace === javaPackage + '.' + fileName) {
							result = xmlFile.fsPath;
							break;
						}
					} else {
						result = xmlFile.fsPath;
						break;
					}
				}
			}

			return result;
		} catch (error) {
			console.error('Error finding XML for Mapper:', error);
			return undefined;
		} finally {
			this.performanceUtils.recordExecutionTime('FileMapper.findXmlForMapper', Date.now() - startTime);
		}
	}

	/**
	 * Try to find XML file by quick path heuristics (without scanning all files)
	 */
	private async findXmlByQuickPath(javaFilePath: string): Promise<string | undefined> {
		const startTime = Date.now();
		try {
			// 尝试通过路径对应关系快速找到XML文件
			const dirName = path.dirname(javaFilePath);
			const fileName = path.basename(javaFilePath, '.java');
			const possibleXmlPaths = [
				path.join(dirName, fileName + '.xml'),
				path.join(dirName, 'mapper', fileName + '.xml'),
				path.join(dirName.replace(/java(\\|\/)main(\\|\/)java/, 'java$1main$1resources'), 'mapper', fileName + '.xml'),
				path.join(dirName.replace(/java(\\|\/)main(\\|\/)java/, 'java$1main$1resources'), fileName + '.xml')
			];

			// 检查这些可能的路径是否存在
			for (const xmlPath of possibleXmlPaths) {
				if (await this.fileUtils.fileExists(xmlPath)) {
					return xmlPath;
				}
			}

			return undefined;
		} finally {
			this.performanceUtils.recordExecutionTime('FileMapper.findXmlByQuickPath', Date.now() - startTime);
		}
	}

	/**
	 * Get possible XML paths for a given Java file
	 */
	private async getPossibleXmlPaths(javaFilePath: string): Promise<string[]> {
		const startTime = Date.now();
		try {
			// 生成可能的XML路径
			const dirName = path.dirname(javaFilePath);
			const fileName = path.basename(javaFilePath, '.java');
			const possiblePaths = [
				path.join(dirName, fileName + '.xml'),
				path.join(dirName, 'mapper', fileName + '.xml'),
				path.join(dirName.replace(/java(\\|\/)main(\\|\/)java/, 'java$1main$1resources'), 'mapper', fileName + '.xml'),
				path.join(dirName.replace(/java(\\|\/)main(\\|\/)java/, 'java$1main$1resources'), fileName + '.xml'),
				path.join(path.dirname(dirName), 'resources', 'mapper', fileName + '.xml'),
				path.join(path.dirname(dirName), 'resources', fileName + '.xml')
			];
			// 过滤掉不存在的文件
			const existingPaths: string[] = [];
			for (const xmlPath of possiblePaths) {
				if (await this.fileUtils.fileExists(xmlPath)) {
					existingPaths.push(xmlPath);
				}
			}
			return existingPaths;
		} catch (error) {
			console.error('Error getting possible XML paths:', error);
			return [];
		} finally {
			this.performanceUtils.recordExecutionTime('FileMapper.getPossibleXmlPaths', Date.now() - startTime);
		}
	}

	/**
	 * Find Java file by class name
	 */
	private async findJavaFileByClassName(className: string): Promise<string | undefined> {
		const startTime = Date.now();
		try {
			// 使用智能文件查找
			const possibleJavaFiles = await this.fileUtils.smartFindFiles(
				vscode.workspace.workspaceFolders?.[0]?.uri.fsPath || '',
				className,
				['.java'],
				5
			);
			return possibleJavaFiles[0];
		} finally {
			this.performanceUtils.recordExecutionTime('FileMapper.findJavaFileByClassName', Date.now() - startTime);
		}
	}

	/**
	 * Search XML files by namespace
	 */
	private async searchXmlByNamespace(namespace: string): Promise<string | undefined> {
		const startTime = Date.now();
		try {
			// 优先搜索mapper/mappers目录
			const mapperXmlFiles = await vscode.workspace.findFiles(
				'{**/mapper/**/*.xml,**/mappers/**/*.xml}'
			);

			// 直接处理文件列表
			let result: string | undefined;
			for (const xmlFile of mapperXmlFiles) {
				const fileNamespace = await this.fileUtils.parseXmlNamespace(xmlFile.fsPath);
				if (fileNamespace === namespace) {
					result = xmlFile.fsPath;
					break;
				}
			}

			// 如果在mapper目录没找到，搜索所有XML文件
			if (!result) {
				const allXmlFiles = await vscode.workspace.findFiles('**/*.xml');
				for (const xmlFile of allXmlFiles) {
					const fileNamespace = await this.fileUtils.parseXmlNamespace(xmlFile.fsPath);
					if (fileNamespace === namespace) {
						result = xmlFile.fsPath;
						break;
					}
				}
			}

			return result;
		} catch (error) {
			console.error('Error searching XML by namespace:', error);
			return undefined;
		} finally {
			this.performanceUtils.recordExecutionTime('FileMapper.searchXmlByNamespace', Date.now() - startTime);
		}
	}

	/**
	 * Check if we should throttle jump requests
	 */
	private shouldThrottleJump(type: string): boolean {
		const startTime = Date.now();
		try {
			// 简单的节流实现
			const now = Date.now();
			const lastJumpTime = this.lastJumpTime[type] || 0;
			if (now - lastJumpTime < this.jumpThrottleMs) {
				return true; // 应该节流
			}
			this.lastJumpTime[type] = now;
			return false;
		} finally {
			this.performanceUtils.recordExecutionTime('FileMapper.shouldThrottleJump', Date.now() - startTime);
		}
	}

	/**
	 * Extract method name or SQL ID from current cursor position
	 */
	private extractMethodName(editor: vscode.TextEditor): string | null {
		const startTime = Date.now();
		try {
			const position = editor.selection.active;
			const line = editor.document.lineAt(position.line).text;
			const filePath = editor.document.uri.fsPath;

			if (filePath.endsWith('.java')) {
				// 使用RegexUtils的缓存正则表达式
				const methodMatch = this.regexUtils.getRegex("^(public|private|protected|default)?\\s*(static\\s+)?[\\w<>\\[\\]]+(<[^>]+>)?\\s+(\\w+)\\s*\\([^)]*\\)", 
					""
				).exec(line);
				return methodMatch ? methodMatch[4] : null;
			} else if (filePath.endsWith('.xml')) {
				// 使用RegexUtils的缓存正则表达式处理单引号和双引号的id属性
				const idMatch = this.regexUtils.getRegex(
					`id\\s*=\\s*(?:"([^"]*)"|\\'([^\\']*)\\')`, 
					"i"
				).exec(line);
				return idMatch ? (idMatch[1] || idMatch[2]) : null;
			}
			return null;
		} finally {
			this.performanceUtils.recordExecutionTime('FileMapper.extractMethodName', Date.now() - startTime);
		}
	}

	/**
	 * Find the position of a method in an XML file
	 */
	private async findMethodPosition(xmlPath: string, methodName: string): Promise<vscode.Position | null> {
		const startTime = Date.now();
		try {
			// 检查文件是否存在
			if (!await this.fileUtils.fileExists(xmlPath)) {
				return null;
			}

			// 读取XML文件内容
			const content = await this.fileUtils.safeReadFile(xmlPath);
			if (!content) {
				return null;
			}

			// 将内容拆分为行
			const lines = content.split('\n');

			// 使用缓存的正则表达式来匹配方法节点
			const methodRegex = this.regexUtils.getRegex(
				`<\\w+\\s+id\\s*=\\s*(?:"${methodName}"|'${methodName}')`, 
				"i"
			);

			// 逐行查找匹配
			for (let i = 0; i < lines.length; i++) {
				const line = lines[i];
				const match = methodRegex.exec(line);
				if (match) {
					// 找到匹配行，返回位置
					return new vscode.Position(i, 0);
				}
			}

			return null;
		} catch (error) {
			console.error('Error finding method position:', error);
			return null;
		} finally {
			this.performanceUtils.recordExecutionTime('FileMapper.findMethodPosition', Date.now() - startTime);
		}
	}

	/**
	 * Jump to a specific file and position
	 */
	private async jumpToFile(filePath: string, position?: vscode.Position | null): Promise<void> {
		const startTime = Date.now();
		try {
			// 检查文件是否存在
			if (!await this.fileUtils.fileExists(filePath)) {
				vscode.window.showErrorMessage(`File not found: ${filePath}`);
				return;
			}

			const uri = vscode.Uri.file(filePath);

			// 查找是否已存在对应的编辑器
			const existingEditor = this.findExistingEditor(uri);

			// 根据文件打开模式决定如何打开文件
			let viewColumn = undefined;
			switch (this.fileOpenMode) {
				case FileOpenMode.NO_SPLIT:
					// 不拆分窗口
					viewColumn = undefined;
					break;
				case FileOpenMode.USE_EXISTING:
					// 优先使用已存在的编辑器
					if (existingEditor) {
						// 聚焦到已存在的编辑器
						vscode.window.showTextDocument(existingEditor.document, {
							preserveFocus: false,
							preview: false
						});
						// 如果指定了位置，则设置光标位置
						if (position) {
							existingEditor.selection = new vscode.Selection(position, position);
							existingEditor.revealRange(new vscode.Range(position, position), vscode.TextEditorRevealType.AtTop);
						}
						return;
					}
					// 如果没有已存在的编辑器，则在当前列打开
					break;
				default:
					// 默认行为
					break;
			}

			// 打开文件
			const editor = await vscode.window.showTextDocument(uri, {
				viewColumn: viewColumn,
				preserveFocus: false,
				preview: false
			});

			// 如果指定了位置，则设置光标位置
			if (position) {
				editor.selection = new vscode.Selection(position, position);
				editor.revealRange(new vscode.Range(position, position), vscode.TextEditorRevealType.AtTop);
			}
		} catch (error) {
			console.error('Error jumping to file:', error);
			vscode.window.showErrorMessage(`Failed to open file: ${error instanceof Error ? error.message : String(error)}`);
		} finally {
			this.performanceUtils.recordExecutionTime('FileMapper.jumpToFile', Date.now() - startTime);
		}
	}

	/**
	 * Find an existing editor for the given URI
	 */
	private findExistingEditor(uri: vscode.Uri): vscode.TextEditor | undefined {
		const startTime = Date.now();
		try {
			return vscode.window.visibleTextEditors.find(editor => 
				editor.document.uri.toString() === uri.toString()
			);
		} finally {
			this.performanceUtils.recordExecutionTime('FileMapper.findExistingEditor', Date.now() - startTime);
		}
	}

	/**
	 * Jump from Java Mapper to corresponding XML file
	 */
	public async jumpToXml(): Promise<void> {
		const startTime = Date.now();
		try {
			// 检查是否需要节流
			if (this.shouldThrottleJump('xml')) {
				return;
			}

			const editor = vscode.window.activeTextEditor;
			if (!editor || !editor.document.uri.fsPath.endsWith('.java')) {
				vscode.window.showInformationMessage('Please open a Java Mapper interface file first');
				return;
			}

			const javaFilePath = editor.document.uri.fsPath;

			// 先尝试从缓存中获取
			let xmlPath = this.mappings.get(javaFilePath);

			// 如果缓存中没有，则扫描文件
			if (!xmlPath) {
				// 使用性能工具进行时间跟踪
				// 查找对应的XML文件
				const xmlFiles = await vscode.workspace.findFiles('**/*.xml');
				xmlPath = await this.findXmlForMapper(javaFilePath, xmlFiles);

				// 如果找到了，更新缓存
				if (xmlPath) {
					this.mappings.set(javaFilePath, xmlPath);
					this.reverseMappings.set(xmlPath, javaFilePath);
				}
			}

			if (!xmlPath) {
				vscode.window.showInformationMessage('Could not find corresponding XML file');
				return;
			}

			// 提取方法名并尝试定位到XML中的对应位置
			const methodName = this.extractMethodName(editor);
			let position = undefined;

			if (methodName) {
				position = await this.findMethodPosition(xmlPath, methodName);
			}

			// 跳转到XML文件
			await this.jumpToFile(xmlPath, position);
		} catch (error) {
			console.error('Error jumping to XML:', error);
			vscode.window.showErrorMessage(`Failed to jump to XML file: ${error instanceof Error ? error.message : String(error)}`);
		} finally {
			this.performanceUtils.recordExecutionTime('FileMapper.jumpToXml', Date.now() - startTime);
		}
	}

	/**
	 * Jump from XML file to corresponding Java Mapper interface
	 */
	public async jumpToMapper(): Promise<void> {
		const startTime = Date.now();
		try {
			// 检查是否需要节流
			if (this.shouldThrottleJump('mapper')) {
				return;
			}

			const editor = vscode.window.activeTextEditor;
			if (!editor || !editor.document.uri.fsPath.endsWith('.xml')) {
				vscode.window.showInformationMessage('Please open a MyBatis XML file first');
				return;
			}

			const xmlFilePath = editor.document.uri.fsPath;

			// 先尝试从缓存中获取
			let mapperPath = this.reverseMappings.get(xmlFilePath);

			// 如果缓存中没有，则从XML的namespace查找
			if (!mapperPath) {
				// 使用性能工具进行时间跟踪
				// 获取XML命名空间
				const namespace = await this.fileUtils.parseXmlNamespace(xmlFilePath);

				if (namespace) {
					// 从namespace提取类名
					const className = namespace.substring(namespace.lastIndexOf('.') + 1);
					// 查找对应的Java文件
					mapperPath = await this.findJavaFileByClassName(className);

					// 如果找到了，更新缓存
					if (mapperPath) {
						this.mappings.set(mapperPath, xmlFilePath);
						this.reverseMappings.set(xmlFilePath, mapperPath);
					}
				}
			}

			if (!mapperPath) {
				vscode.window.showInformationMessage('Could not find corresponding Mapper interface');
				return;
			}

			// 提取SQL ID并尝试定位到Java中的对应方法
			const sqlId = this.extractMethodName(editor);
			let position = undefined;

			if (sqlId) {
				// 在Java文件中查找对应方法
				// 读取Java文件内容
				const content = await this.fileUtils.safeReadFile(mapperPath);
				if (content) {
					const lines = content.split('\n');
					const methodRegex = this.regexUtils.getRegex(
						`\\b${sqlId}\\s*\\(`, 
						""
					);

					// 逐行查找匹配
					for (let i = 0; i < lines.length; i++) {
						const line = lines[i];
						const match = methodRegex.exec(line);
						if (match) {
							position = new vscode.Position(i, 0);
							break;
						}
					}
				}
			}

			// 跳转到Mapper接口
			await this.jumpToFile(mapperPath, position);
		} catch (error) {
			console.error('Error jumping to Mapper:', error);
			vscode.window.showErrorMessage(`Failed to jump to Mapper interface: ${error instanceof Error ? error.message : String(error)}`);
		} finally {
			this.performanceUtils.recordExecutionTime('FileMapper.jumpToMapper', Date.now() - startTime);
		}
	}

	/**
	 * Public method to refresh all mappings (for extension use)
	 */
	public async refreshAllMappings(): Promise<void> {
		await this.scanFolder();
	}

	/**
	 * Public method to jump to a specific file (for extension use)
	 */
	public async publicJumpToFile(filePath: string, methodName?: string): Promise<void> {
		let position: vscode.Position | null = null;
		if (methodName) {
			position = await this.findMethodPosition(filePath, methodName);
		}
		await this.jumpToFile(filePath, position);
	}

	/**
	 * Public method to find Java file by class name (for extension use)
	 */
	public async findJavaFileByClassNamePublic(className: string): Promise<string | undefined> {
		const javaFiles = await vscode.workspace.findFiles('**/*.java');
		for (const javaFile of javaFiles) {
			if (path.basename(javaFile.fsPath, '.java') === className) {
				return javaFile.fsPath;
			}
		}
		return undefined;
	}

	/**
	 * Public method to extract namespace from XML file (for extension use)
	 */
	public async extractNamespacePublic(xmlPath: string): Promise<string | undefined> {
		const namespace = await this.fileUtils.parseXmlNamespace(xmlPath);
		return namespace || undefined;
	}

	/**
	 * Public method to get all mappings (for extension use)
	 */
	public getMappingsPublic(): { mapperPath: string; xmlPath: string }[] {
		const result: { mapperPath: string; xmlPath: string }[] = [];
		this.mappings.forEach((xmlPath, mapperPath) => {
			result.push({ mapperPath, xmlPath });
		});
		return result;
	}

	/**
	 * Public method to get execution time recorder (for extension use)
	 */
	public getExecutionTimeRecorder(): (operation: string, duration: number) => void {
		return (operation: string, duration: number) => {
			this.performanceUtils.recordExecutionTime(operation, duration);
		};
	}

	/**
	 * Public method to get possible XML paths for a Java file (for extension use)
	 */
	public getPossibleXmlPathsPublic(javaFilePath: string): string[] {
		const dirName = path.dirname(javaFilePath);
		const fileName = path.basename(javaFilePath, '.java');
		return [
			path.join(dirName, fileName + '.xml'),
			path.join(dirName, 'mapper', fileName + '.xml'),
			path.join(dirName.replace(/java(\\|\/)main(\\|\/)java/, 'java$1main$1resources'), 'mapper', fileName + '.xml'),
			path.join(dirName.replace(/java(\\|\/)main(\\|\/)java/, 'java$1main$1resources'), fileName + '.xml')
		];
	}

	/**
	 * Dispose resources when extension is deactivated
	 */
	public dispose(): void {
		if (this.scanTimer) {
			clearTimeout(this.scanTimer);
			this.scanTimer = null;
		}

		if (this.fileWatcher) {
			this.fileWatcher.dispose();
			this.fileWatcher = null;
		}

		// 清空缓存
		this.mappings.clear();
		this.reverseMappings.clear();
	}
}
