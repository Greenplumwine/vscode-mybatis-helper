import * as vscode from 'vscode';
import * as fs from 'fs/promises';
import * as syncFs from 'fs';
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
	 * Try to find XML file by quick path heuristics (without scanning all files)
	 */	
	private async findXmlByQuickPath(javaFilePath: string): Promise<string | undefined> {
		const startTime = Date.now();
		try {
			// 尝试通过路径对应关系快速找到XML文件
			const dirName = path.dirname(javaFilePath);
			const fileName = path.basename(javaFilePath, '.java');
			// 增强的路径模式，支持更多常见的项目结构
			const possibleXmlPaths = [
				// 同一目录
				path.join(dirName, fileName + '.xml'),
				// 同一目录下的mapper子目录
				path.join(dirName, 'mapper', fileName + '.xml'),
				// Maven/Gradle标准结构 - resources/mapper
				path.join(dirName.replace(/java(\\|\/)main(\\|\/)java/, 'java$1main$1resources'), 'mapper', fileName + '.xml'),
				// Maven/Gradle标准结构 - resources根目录
				path.join(dirName.replace(/java(\\|\/)main(\\|\/)java/, 'java$1main$1resources'), fileName + '.xml'),
				// Maven/Gradle标准结构 - resources/xml目录
				path.join(dirName.replace(/java(\\|\/)main(\\|\/)java/, 'java$1main$1resources'), 'xml', fileName + '.xml'),
				// Maven/Gradle标准结构 - resources/com/...目录（与Java包路径对应）
				path.join(this.getResourcesPathFromJavaPath(javaFilePath), fileName + '.xml'),
				// 上层目录的resources目录
				path.join(path.dirname(dirName), 'resources', 'mapper', fileName + '.xml'),
				path.join(path.dirname(dirName), 'resources', fileName + '.xml'),
				path.join(path.dirname(dirName), 'resources', 'xml', fileName + '.xml'),
				// 上层目录的xml目录
				path.join(path.dirname(dirName), 'xml', fileName + '.xml'),
				// 项目根目录的xml目录
				path.join(this.getProjectRoot(javaFilePath), 'xml', fileName + '.xml'),
				path.join(this.getProjectRoot(javaFilePath), 'resources', 'xml', fileName + '.xml')
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
				// 同一目录
				path.join(dirName, fileName + '.xml'),
				// 同一目录下的mapper子目录
				path.join(dirName, 'mapper', fileName + '.xml'),
				// Maven/Gradle标准结构 - resources/mapper
				path.join(dirName.replace(/java(\\|\/)main(\\|\/)java/, 'java$1main$1resources'), 'mapper', fileName + '.xml'),
				// Maven/Gradle标准结构 - resources根目录
				path.join(dirName.replace(/java(\\|\/)main(\\|\/)java/, 'java$1main$1resources'), fileName + '.xml'),
				// Maven/Gradle标准结构 - resources/xml目录
				path.join(dirName.replace(/java(\\|\/)main(\\|\/)java/, 'java$1main$1resources'), 'xml', fileName + '.xml'),
				// Maven/Gradle标准结构 - resources/com/...目录（与Java包路径对应）
				path.join(this.getResourcesPathFromJavaPath(javaFilePath), fileName + '.xml'),
				// 上层目录的resources目录
				path.join(path.dirname(dirName), 'resources', 'mapper', fileName + '.xml'),
				path.join(path.dirname(dirName), 'resources', fileName + '.xml'),
				path.join(path.dirname(dirName), 'resources', 'xml', fileName + '.xml'),
				// 上层目录的xml目录
				path.join(path.dirname(dirName), 'xml', fileName + '.xml'),
				// 项目根目录的xml目录
				path.join(this.getProjectRoot(javaFilePath), 'xml', fileName + '.xml'),
				path.join(this.getProjectRoot(javaFilePath), 'resources', 'xml', fileName + '.xml')
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

			// 获取Java包名
			const javaPackage = await this.fileUtils.parseJavaPackage(javaFilePath);
			const fullClassName = javaPackage ? `${javaPackage}.${fileName}` : fileName;

			// 增强的目录搜索策略
			// Priority 1: 检查用户配置的XML目录（如果有）
			const config = getPluginConfig();
			const customXmlDirs = config.customXmlDirectories || [];
			for (const customDir of customXmlDirs) {
				for (const workspaceFolder of vscode.workspace.workspaceFolders || []) {
					const customDirPath = path.join(workspaceFolder.uri.fsPath, customDir);
					if (await this.fileUtils.fileExists(customDirPath)) {
						const possibleXmlPath = path.join(customDirPath, fileName + '.xml');
						if (await this.fileUtils.fileExists(possibleXmlPath)) {
							const namespace = await this.fileUtils.parseXmlNamespace(possibleXmlPath);
							if (!namespace || namespace === fullClassName) {
								return possibleXmlPath;
							}
						}
					}
				}
			}

			// Priority 2: Check XML files in common mapper directories first
			const commonXmlDirPatterns = ['/mapper/', '/mappers/', '/xml/', '/dao/', '/mybatis/'];
			const priorityDirXmlFiles = xmlFiles.filter(
				(xmlFile) => commonXmlDirPatterns.some(pattern => xmlFile.fsPath.includes(pattern))
			);

			// Try to find in priority directories first
			for (const xmlFile of priorityDirXmlFiles) {
				const xmlFileName = path.basename(xmlFile.fsPath, '.xml');
				if (xmlFileName === fileName || xmlFileName === fileName + 'Mapper') {
					const namespace = await this.fileUtils.parseXmlNamespace(xmlFile.fsPath);
					if (namespace) {
						if (namespace === fullClassName) {
							return xmlFile.fsPath;
						}
					} else {
						// If namespace cannot be read, use file name match as fallback
						return xmlFile.fsPath;
					}
				}
			}

			// Priority 3: 基于包名的智能查找
			if (javaPackage) {
				// 将包名转换为目录路径
				const packagePath = javaPackage.replace(/\./g, path.sep);
				// 搜索与Java包路径对应的XML文件
				for (const xmlFile of xmlFiles) {
					const xmlFilePath = xmlFile.fsPath;
					const xmlFileName = path.basename(xmlFilePath, '.xml');
					// 检查文件名匹配和路径是否包含包路径
					if ((xmlFileName === fileName || xmlFileName === fileName + 'Mapper') && 
						xmlFilePath.includes(packagePath)) {
						const namespace = await this.fileUtils.parseXmlNamespace(xmlFilePath);
						if (namespace === fullClassName) {
							return xmlFilePath;
						}
					}
				}
			}

			// Priority 4: 直接处理剩余的文件列表
			let result: string | undefined;
			for (const xmlFile of xmlFiles.filter(f => 
				!commonXmlDirPatterns.some(pattern => f.fsPath.includes(pattern)) &&
				(!javaPackage || !f.fsPath.includes(javaPackage.replace(/\./g, path.sep)))
			)) {
				const xmlFileName = path.basename(xmlFile.fsPath, '.xml');
				if (xmlFileName === fileName || xmlFileName === fileName + 'Mapper') {
					// Use namespace verification
					const namespace = await this.fileUtils.parseXmlNamespace(xmlFile.fsPath);
					if (namespace) {
						if (namespace === fullClassName) {
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
	 * 搜索XML文件的命名空间
	 */	
	private async searchXmlByNamespace(namespace: string): Promise<string | undefined> {
		const startTime = Date.now();
		try {
			// 提取类名和包名
			const className = namespace.substring(namespace.lastIndexOf('.') + 1);
			const packageName = namespace.substring(0, namespace.lastIndexOf('.'));
			const packagePath = packageName.replace(/\./g, path.sep);

			// 优先搜索常见的XML目录和与包路径相关的目录
			const searchPatterns = [
				`{**/mapper/**/*.xml,**/mappers/**/*.xml,**/xml/**/*.xml,**/dao/**/*.xml,**/mybatis/**/*.xml}`,
				`**/${packagePath}/**/*.xml`,
				`**/${className}.xml`,
				`**/${className}Mapper.xml`,
				`**/*.xml`
			];

			// 按优先级搜索
			for (const pattern of searchPatterns) {
				const xmlFiles = await vscode.workspace.findFiles(pattern);
				for (const xmlFile of xmlFiles) {
					const fileNamespace = await this.fileUtils.parseXmlNamespace(xmlFile.fsPath);
					if (fileNamespace === namespace) {
						return xmlFile.fsPath;
					}
				}
			}

			return undefined;
		} catch (error) {
			console.error('Error searching XML by namespace:', error);
			return undefined;
		} finally {
			this.performanceUtils.recordExecutionTime('FileMapper.searchXmlByNamespace', Date.now() - startTime);
		}
	}

	/**
	 * 获取与Java文件对应的resources路径（保留包路径结构）
	 */	private getResourcesPathFromJavaPath(javaFilePath: string): string {
		// 尝试多种常见的项目结构
		const patterns = [
			// Maven/Gradle标准结构
			{ java: /java(\\|\/)main(\\|\/)java/, resources: 'java$1main$1resources' },
			// 简单项目结构
			{ java: /src(\\|\/)main(\\|\/)java/, resources: 'src$1main$1resources' },
			{ java: /src(\\|\/)java/, resources: 'src$1resources' },
			{ java: /java/, resources: 'resources' }
		];

		for (const pattern of patterns) {
			const replacedPath = javaFilePath.replace(pattern.java, pattern.resources);
			if (replacedPath !== javaFilePath) {
				return path.dirname(replacedPath);
			}
		}

		// 默认返回同级目录
		return path.dirname(javaFilePath);
	}

	/**
	 * 获取项目根目录
	 */	private getProjectRoot(filePath: string): string {
		// 从文件路径向上查找项目根目录标识（如pom.xml、build.gradle等）
		let currentDir = path.dirname(filePath);
		const rootMarkers = ['pom.xml', 'build.gradle', 'build.gradle.kts', 'package.json', '.git'];

		while (currentDir !== path.parse(currentDir).root) {
			for (const marker of rootMarkers) {
				try {
					// 同步检查文件是否存在
					syncFs.accessSync(path.join(currentDir, marker));
					return currentDir;
				} catch {
					// 文件不存在，继续检查下一个
				}
			}
			currentDir = path.dirname(currentDir);
		}

		// 如果找不到项目根目录，返回当前文件的目录
		return path.dirname(filePath);
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
				const methodMatch = this.regexUtils.getRegex("^(public|private|protected|default)?\s*(static\s+)?[\w<>\[\]]+(<[^>]+>)?\s+(\w+)\s*\([^)]*\)", 
					""
				).exec(line);
				return methodMatch ? methodMatch[4] : null;
			} else if (filePath.endsWith('.xml')) {
				// 使用RegexUtils的缓存正则表达式处理单引号和双引号的id属性
				const idMatch = this.regexUtils.getRegex(
					`id\s*=\s*(?:"([^\"]*)"|\'([^\']*)\')`, 
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
		} finally {
			this.performanceUtils.recordExecutionTime('FileMapper.jumpToFile', Date.now() - startTime);
		}
	}

	/**
	 * Find an existing editor for a file
	 */	
	private findExistingEditor(uri: vscode.Uri): vscode.TextEditor | undefined {
		const startTime = Date.now();
		try {
			return vscode.window.visibleTextEditors.find(
				(editor) => editor.document.uri.fsPath === uri.fsPath
			);
		} finally {
			this.performanceUtils.recordExecutionTime('FileMapper.findExistingEditor', Date.now() - startTime);
		}
	}

	/**
	 * Jump to the corresponding XML file
	 */	
	public async jumpToXml(): Promise<void> {
		const startTime = Date.now();
		try {
			// 检查是否应该节流
			if (this.shouldThrottleJump('jumpToXml')) {
				return;
			}

			const editor = vscode.window.activeTextEditor;
			if (!editor || !editor.document.uri.fsPath.endsWith('.java')) {
				return;
			}

			const javaFilePath = editor.document.uri.fsPath;

			// 尝试从缓存获取对应的XML文件
			let xmlPath = this.mappings.get(javaFilePath);

			// 如果缓存中没有，则尝试查找
			if (!xmlPath) {
				// 使用新的智能查找方式
				const quickPath = await this.findXmlByQuickPath(javaFilePath);
				if (quickPath) {
					xmlPath = quickPath;
					// 更新缓存
					this.mappings.set(javaFilePath, xmlPath);
					this.reverseMappings.set(xmlPath, javaFilePath);
				} else {
					// 如果快速路径没找到，搜索所有XML文件
					const xmlFiles = await vscode.workspace.findFiles('**/*.xml');
					xmlPath = await this.findXmlForMapper(javaFilePath, xmlFiles);
					if (xmlPath) {
						// 更新缓存
						this.mappings.set(javaFilePath, xmlPath);
						this.reverseMappings.set(xmlPath, javaFilePath);
					} else {
						// 找不到对应的XML文件
						vscode.window.showInformationMessage('No corresponding XML file found');
						return;
					}
				}
			}

			// 提取方法名
			const methodName = this.extractMethodName(editor);
			if (methodName) {
				// 查找方法在XML中的位置
				const position = await this.findMethodPosition(xmlPath, methodName);
				if (position) {
					await this.jumpToFile(xmlPath, position);
					return;
				}
			}

			// 直接跳转到文件开头
			await this.jumpToFile(xmlPath);
		} catch (error) {
			console.error('Error jumping to XML:', error);
		} finally {
			this.performanceUtils.recordExecutionTime('FileMapper.jumpToXml', Date.now() - startTime);
		}
	}

	/**
	 * Jump to the corresponding Mapper interface
	 */	
	public async jumpToMapper(): Promise<void> {
		const startTime = Date.now();
		try {
			// 检查是否应该节流
			if (this.shouldThrottleJump('jumpToMapper')) {
				return;
			}

			const editor = vscode.window.activeTextEditor;
			if (!editor || !editor.document.uri.fsPath.endsWith('.xml')) {
				return;
			}

			const xmlFilePath = editor.document.uri.fsPath;

			// 尝试从缓存获取对应的Mapper文件
			let mapperPath = this.reverseMappings.get(xmlFilePath);

			// 如果缓存中没有，则尝试查找
			if (!mapperPath) {
				// 解析XML命名空间
				const namespace = await this.fileUtils.parseXmlNamespace(xmlFilePath);
				if (namespace) {
					// 使用新的命名空间搜索方法
					mapperPath = await this.searchXmlByNamespace(namespace);
					if (mapperPath) {
						// 更新缓存
						this.reverseMappings.set(xmlFilePath, mapperPath);
						this.mappings.set(mapperPath, xmlFilePath);
					} else {
						// 找不到对应的Mapper文件
						vscode.window.showInformationMessage('No corresponding Mapper file found');
						return;
					}
				} else {
					// 找不到命名空间
					vscode.window.showInformationMessage('Cannot parse namespace from XML file');
					return;
				}
			}

			// 提取SQL ID
			const sqlId = this.extractMethodName(editor);
			if (sqlId) {
				// 由于Java文件没有像XML那样的ID属性，我们只能跳转到文件
				// 可以在未来增强此功能，查找对应的方法定义
			}

			// 跳转到Mapper文件
			await this.jumpToFile(mapperPath);
		} catch (error) {
			console.error('Error jumping to Mapper:', error);
		} finally {
			this.performanceUtils.recordExecutionTime('FileMapper.jumpToMapper', Date.now() - startTime);
		}
	}

	/**
	 * Refresh all mappings between Java and XML files
	 */	
	public async refreshAllMappings(): Promise<void> {
		const startTime = Date.now();
		try {
			// 清除现有映射
			this.mappings.clear();
			this.reverseMappings.clear();

			// 重新扫描
			await this.scanFolder();
		} finally {
			this.performanceUtils.recordExecutionTime('FileMapper.refreshAllMappings', Date.now() - startTime);
		}
	}

	/**
	 * Public method to jump to a specific file
	 */	
	public async publicJumpToFile(filePath: string, methodNameOrPosition?: string | vscode.Position): Promise<void> {
		const startTime = Date.now();
		try {
			let position: vscode.Position | null = null;
			// 检查第二个参数的类型
			if (typeof methodNameOrPosition === 'string' && filePath.endsWith('.xml')) {
				// 如果是方法名，查找位置
				position = await this.findMethodPosition(filePath, methodNameOrPosition);
			} else if (methodNameOrPosition instanceof vscode.Position) {
				// 如果是位置，直接使用
				position = methodNameOrPosition;
			}
			await this.jumpToFile(filePath, position);
		} finally {
			this.performanceUtils.recordExecutionTime('FileMapper.publicJumpToFile', Date.now() - startTime);
		}
	}

	/**
	 * Public method to find Java file by class name
	 */	
	public async findJavaFileByClassNamePublic(className: string): Promise<string | undefined> {
		const startTime = Date.now();
		try {
			return await this.findJavaFileByClassName(className);
		} finally {
			this.performanceUtils.recordExecutionTime('FileMapper.findJavaFileByClassNamePublic', Date.now() - startTime);
		}
	}

	/**
	 * Public method to get all mappings
	 */	
	public getMappings(): Map<string, string> {
		return new Map(this.mappings);
	}

	/**
	 * Public method to get all reverse mappings
	 */	
	public getReverseMappings(): Map<string, string> {
		return new Map(this.reverseMappings);
	}

	/**
	 * Dispose resources
	 */	
	public dispose(): void {
		// 清理定时器
		if (this.scanTimer) {
			clearTimeout(this.scanTimer);
			this.scanTimer = null;
		}

		// 清理文件监听器
		if (this.fileWatcher) {
			this.fileWatcher.dispose();
			this.fileWatcher = null;
		}

		// 清理防抖处理函数缓存
		this.debounceHandlers.clear();
	}

	/**
	 * Public method to get possible XML paths for a Java file (for backward compatibility)
	 */
	public getPossibleXmlPathsPublic(javaFilePath: string): string[] {
		// 直接返回静态的路径列表，不进行异步文件检查
		const dirName = path.dirname(javaFilePath);
		const fileName = path.basename(javaFilePath, '.java');
		return [
			// 同一目录
			path.join(dirName, fileName + '.xml'),
			// 同一目录下的mapper子目录
			path.join(dirName, 'mapper', fileName + '.xml'),
			// Maven/Gradle标准结构 - resources/mapper
			path.join(dirName.replace(/java(\|\/)main(\|\/)java/, 'java$1main$1resources'), 'mapper', fileName + '.xml'),
			// Maven/Gradle标准结构 - resources根目录
			path.join(dirName.replace(/java(\|\/)main(\|\/)java/, 'java$1main$1resources'), fileName + '.xml'),
			// Maven/Gradle标准结构 - resources/xml目录
			path.join(dirName.replace(/java(\|\/)main(\|\/)java/, 'java$1main$1resources'), 'xml', fileName + '.xml'),
			// Maven/Gradle标准结构 - resources/com/...目录（与Java包路径对应）
			path.join(this.getResourcesPathFromJavaPath(javaFilePath), fileName + '.xml'),
			// 上层目录的resources目录
			path.join(path.dirname(dirName), 'resources', 'mapper', fileName + '.xml'),
			path.join(path.dirname(dirName), 'resources', fileName + '.xml'),
			path.join(path.dirname(dirName), 'resources', 'xml', fileName + '.xml'),
			// 上层目录的xml目录
			path.join(path.dirname(dirName), 'xml', fileName + '.xml'),
			// 项目根目录的xml目录
			path.join(this.getProjectRoot(javaFilePath), 'xml', fileName + '.xml'),
			path.join(this.getProjectRoot(javaFilePath), 'resources', 'xml', fileName + '.xml')
		];
	}

	/**
	 * Public method to get all mappings (for backward compatibility)
	 */
	public getMappingsPublic(): { mapperPath: string; xmlPath: string }[] {
		const result: { mapperPath: string; xmlPath: string }[] = [];
		this.mappings.forEach((xmlPath, mapperPath) => {
			result.push({ mapperPath, xmlPath });
		});
		return result;
	}

	/**
	 * Public method to get execution time recorder (for backward compatibility)
	 */
	public getExecutionTimeRecorder(): (operation: string, duration: number) => void {
		return (operation: string, duration: number) => {
			this.performanceUtils.recordExecutionTime(operation, duration);
		};
	}

	/**
	 * Public method to extract namespace from XML file (for backward compatibility)
	 */
	public async extractNamespacePublic(xmlPath: string): Promise<string | undefined> {
		const namespace = await this.fileUtils.parseXmlNamespace(xmlPath);
		return namespace || undefined;
	}
}
