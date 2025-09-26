import * as vscode from 'vscode';
import * as fs from 'fs/promises';
import * as syncFs from 'fs';
import * as path from 'path';
import { getPluginConfig } from '../utils';
import { PerformanceUtils, RegexUtils, FileUtils } from "../utils/performanceUtils";
import { JavaExtensionAPI } from "../utils/javaExtensionAPI";
import { FileOpenMode } from "../types";
import { JavaToXmlNavigator } from "./navigator/javaToXmlNavigator";
import { XmlToJavaNavigator } from "./navigator/xmlToJavaNavigator";

/**
 * FileMapper 类负责管理 Java Mapper 接口和 XML 文件之间的映射关系
 * 并提供跳转功能
 */
export class FileMapper {
	// 缓存映射关系
	private readonly mappings: Map<string, string> = new Map(); // java -> xml
	private readonly reverseMappings: Map<string, string> = new Map(); // xml -> java

	// 导航器实例
	private javaToXmlNavigator: JavaToXmlNavigator;
	private xmlToJavaNavigator: XmlToJavaNavigator;

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
		// 初始化配置
		const config = vscode.workspace.getConfiguration("mybatis-helper");
		this.scanInterval = config.get<number>("scanInterval", 5000);
		this.scanTimeoutMs = config.get<number>("scanTimeoutMs", 30000);
		this.jumpThrottleMs = config.get<number>("jumpThrottleMs", 1000);
		this.fileOpenMode = config.get<FileOpenMode>("fileOpenMode", FileOpenMode.USE_EXISTING);

		// 初始化工具类实例
		this.performanceUtils = PerformanceUtils.getInstance();
		this.regexUtils = RegexUtils.getInstance();
		this.fileUtils = FileUtils.getInstance();

		// 初始化导航器实例
		this.javaToXmlNavigator = new JavaToXmlNavigator(this);
		this.xmlToJavaNavigator = new XmlToJavaNavigator(this);

		// 初始化映射
		// this.initializeMappings(); // 移除不存在的方法调用
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
			// 添加排除规则，避免扫描.git目录和临时文件
			const javaFiles = await vscode.workspace.findFiles(
				'**/*.java', 
				'**/{node_modules,.git}/**'
			);
			const xmlFiles = await vscode.workspace.findFiles(
				'**/*.xml', 
				'**/{node_modules,.git}/**'
			);
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
			// 添加排除规则，避免监听.git目录和临时文件
			this.fileWatcher = vscode.workspace.createFileSystemWatcher(
				new vscode.RelativePattern(
					vscode.workspace.workspaceFolders[0], 
					'**/*.{java,xml}'
				),
				false, // ignoreCreateEvents
				true, // ignoreChangeEvents
				true // ignoreDeleteEvents
			);

			// 使用防抖处理文件创建事件
			const handleFileCreate = this.performanceUtils.debounce((uri: vscode.Uri) => {
				// Only trigger a scan if file is in the workspace and not in excluded directories
				if (this.isFileInWorkspace(uri.fsPath) && 
					!uri.fsPath.includes('/.git/') && 
					!uri.fsPath.includes('\\.git\\') &&
					!uri.fsPath.endsWith('.git')) {
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
						// Skip files in excluded directories
						if (changedUri.fsPath.includes('/.git/') || 
							changedUri.fsPath.includes('\\.git\\') ||
							changedUri.fsPath.endsWith('.git')) {
							return;
						}
						
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
				// �nhanced匹配规则，支持更多命名方式
				if (xmlFileName === fileName || 
					xmlFileName === fileName + 'Mapper' ||
					xmlFileName === fileName + 'Dao') {
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
					if ((xmlFileName === fileName || 
					     xmlFileName === fileName + 'Mapper' || 
					     xmlFileName === fileName + 'Dao') && 
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
				// 增强匹配规则
				if (xmlFileName === fileName || 
				    xmlFileName === fileName + 'Mapper' || 
				    xmlFileName === fileName + 'Dao') {
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
					// 检查文件路径是否有效，避免尝试访问Git相关文件
					if (xmlFile.fsPath.includes('/.git/') || 
						xmlFile.fsPath.includes('\\.git\\') ||
						xmlFile.fsPath.endsWith('.git')) {
						continue;
					}
					
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
	 * 提取命名空间
	 */
	private async extractNamespace(xmlPath: string): Promise<string | null> {
		const startTime = Date.now();
		try {
			const content = await this.fileUtils.safeReadFile(xmlPath);
			const namespaceMatch = content.match(/namespace=["']([^"']+)["']/);
			return namespaceMatch ? namespaceMatch[1] : null;
		} catch (error) {
			console.error('Error extracting namespace:', error);
			return null;
		} finally {
			this.performanceUtils.recordExecutionTime('FileMapper.extractNamespace', Date.now() - startTime);
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
				// 使用更准确的正则表达式匹配Java方法
				const methodMatch = this.regexUtils.getRegex(
					/^(?=.*\b(?:public|private|protected)\s+)(?:\s*(?:public|private|protected)\s+)?(?:static\s+)?[\w<>\[\],\s]+\s+(\w+)\s*\([^)]*\)/,
					""
				).exec(line);
				return methodMatch ? methodMatch[1] : null;
			} else if (filePath.endsWith('.xml')) {
				// 使用更准确的正则表达式处理XML标签中的id属性
				const idMatch = this.regexUtils.getRegex(
					/<\w+\s+[^>]*id\s*=\s*["']([^"']+)["'][^>]*>/,
					"i"
				).exec(line);
				
				if (idMatch) {
					return idMatch[1];
				}
				
				// 备用方案：处理单引号和双引号的id属性
				const altMatch = this.regexUtils.getRegex(
					`id\s*=\s*(?:"([^\"]*)"|\'([^\']*)\')`, 
					"i"
				).exec(line);
				return altMatch ? (altMatch[1] || altMatch[2]) : null;
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
			// 检查文件路径是否有效，避免尝试访问Git相关文件
			if (xmlPath.includes('/.git/') || 
				xmlPath.includes('\\.git\\') ||
				xmlPath.endsWith('.git')) {
				return null;
			}

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

			// 使用正则表达式匹配MyBatis XML中的SQL语句定义
			// 匹配类似 <select id="methodName"> 或 <update id="methodName"> 的模式
			const methodRegex = this.regexUtils.getRegex(
				`\\b(id\\s*=\\s*["']${methodName}["'])`, 
				"i"
			);

			// 逐行查找匹配
			for (let i = 0; i < lines.length; i++) {
				const line = lines[i];
				const match = methodRegex.exec(line);
				if (match) {
					// 找到匹配行，返回位置
					// 尝试找到方法名的确切位置
					const methodIndex = line.indexOf(methodName);
					if (methodIndex !== -1) {
						return new vscode.Position(i, methodIndex);
					}
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
	 * Find the position of a method in a Java file
	 */	
	private async findJavaMethodPosition(javaPath: string, methodName: string): Promise<vscode.Position | null> {
		const startTime = Date.now();
		try {
			// 检查文件路径是否有效，避免尝试访问Git相关文件
			if (javaPath.includes('/.git/') || 
				javaPath.includes('\\.git\\') ||
				javaPath.endsWith('.git')) {
				return null;
			}

			// 检查文件是否存在
			if (!await this.fileUtils.fileExists(javaPath)) {
				return null;
			}

			// 首先尝试使用Java扩展API查找方法位置
			const javaExtApi = JavaExtensionAPI.getInstance();
			if (javaExtApi.isReady) {
				try {
					// 注意：这里需要根据实际的 Java 扩展 API 进行调整
					// 目前使用模拟实现，将来可以替换为真实的API调用
					// 例如：const position = await this.javaExtApi.findMethodPosition(javaPath, methodName);
					// 如果成功获取到位置，则直接返回
				} catch (error) {
					console.warn('Failed to use Java Extension API to find method position:', error);
				}
			}

			// 如果Java扩展API不可用或查找失败，则使用正则表达式方式
			// 读取Java文件内容
			const content = await this.fileUtils.safeReadFile(javaPath);
			if (!content) {
				return null;
			}

			// 将内容拆分为行
			const lines = content.split('\n');
			
			// 添加调试日志
			console.log(`Searching for method ${methodName} in ${javaPath}`);

			// 使用更准确的正则表达式匹配Java方法定义
			// 匹配各种访问修饰符、返回类型和方法签名格式
			// 支持泛型返回类型、数组返回类型、带注解的方法等
			const methodRegex = this.regexUtils.getRegex(
				`(?:(?:public|private|protected)\\s+)?(?:static\\s+)?(?:final\\s+)?(?:synchronized\\s+)?[\\w<>\\[\\]\\?\\s,]*\\b${methodName}\\s*\\(`
			);

			// 逐行查找匹配
			for (let i = 0; i < lines.length; i++) {
				const line = lines[i];
				// 跳过注释行和空行
				if (line.trim().startsWith('//') || line.trim().startsWith('/*') || line.trim().startsWith('*') || line.trim() === '') {
					continue;
				}
				
				const match = methodRegex.exec(line);
				if (match) {
					// 找到匹配行，返回位置
					// 尝试找到方法名的确切位置
					const methodIndex = line.indexOf(methodName);
					console.log(`Found method ${methodName} at line ${i}, column ${methodIndex}`);
					if (methodIndex !== -1) {
						return new vscode.Position(i, methodIndex);
					}
					return new vscode.Position(i, 0);
				}
			}

			// 如果没有精确匹配，尝试模糊匹配
			const fuzzyRegex = this.regexUtils.getRegex(
				`\\b${methodName}\\s*\\(`
			);
			
			for (let i = 0; i < lines.length; i++) {
				const line = lines[i];
				// 跳过注释行和空行
				if (line.trim().startsWith('//') || line.trim().startsWith('/*') || line.trim().startsWith('*') || line.trim() === '') {
					continue;
				}
				
				const match = fuzzyRegex.exec(line);
				if (match) {
					// 找到匹配行，返回位置
					// 尝试找到方法名的确切位置
					const methodIndex = line.indexOf(methodName);
					console.log(`Found method ${methodName} at line ${i}, column ${methodIndex} with fuzzy matching`);
					if (methodIndex !== -1) {
						return new vscode.Position(i, methodIndex);
					}
					return new vscode.Position(i, 0);
				}
			}

			// 如果仍然找不到，尝试更宽松的匹配模式
			const looseRegex = this.regexUtils.getRegex(
				`${methodName}\\s*\\(`
			);
			
			for (let i = 0; i < lines.length; i++) {
				const line = lines[i];
				// 跳过注释行和空行
				if (line.trim().startsWith('//') || line.trim().startsWith('/*') || line.trim().startsWith('*') || line.trim() === '') {
					continue;
				}
				
				if (looseRegex.test(line)) {
					// 找到匹配行，返回位置
					// 尝试找到方法名的确切位置
					const methodIndex = line.indexOf(methodName);
					console.log(`Found method ${methodName} at line ${i}, column ${methodIndex} with loose matching`);
					if (methodIndex !== -1) {
						return new vscode.Position(i, methodIndex);
					}
					return new vscode.Position(i, 0);
				}
			}
			
			console.log(`Method ${methodName} not found in ${javaPath}`);
			return null;
		} catch (error) {
			console.error('Error finding Java method position:', error);
			return null;
		} finally {
			this.performanceUtils.recordExecutionTime('FileMapper.findJavaMethodPosition', Date.now() - startTime);
		}
	}

	/**
	 * Jump to a specific file and position
	 */	
	private async jumpToFile(filePath: string, position?: vscode.Position | null): Promise<void> {
		const startTime = Date.now();
		try {
			console.log("[FileMapper.jumpToFile] Jumping to file:", filePath, "at position:", position);
			
			// 检查文件路径是否有效，避免尝试访问Git相关文件
			if (filePath.includes('/.git/') || 
				filePath.includes('\\.git\\') ||
				filePath.endsWith('.git')) {
				console.warn(`[FileMapper.jumpToFile] Attempted to jump to Git-related file path: ${filePath}`);
				return;
			}

			// 检查文件是否存在
			if (!await this.fileUtils.fileExists(filePath)) {
				console.error(`[FileMapper.jumpToFile] File not found: ${filePath}`);
				vscode.window.showErrorMessage(`File not found: ${filePath}`);
				return;
			}

			const uri = vscode.Uri.file(filePath);
			console.log("[FileMapper.jumpToFile] File URI:", uri.toString());

			// 查找是否已存在对应的编辑器
			const existingEditor = this.findExistingEditor(uri);
			console.log("[FileMapper.jumpToFile] Existing editor found:", !!existingEditor);

			// 根据文件打开模式决定如何打开文件
			let viewColumn = undefined;
			switch (this.fileOpenMode) {
				case FileOpenMode.NO_SPLIT:
					// 不拆分窗口
					viewColumn = undefined;
					console.log("[FileMapper.jumpToFile] Using NO_SPLIT mode");
					break;
				case FileOpenMode.USE_EXISTING:
					// 优先使用已存在的编辑器
					if (existingEditor) {
						console.log("[FileMapper.jumpToFile] Using existing editor");
						// 聚焦到已存在的编辑器
						vscode.window.showTextDocument(existingEditor.document, {
							preserveFocus: false,
							preview: false
						});
						// 如果指定了位置，则设置光标位置
						if (position) {
							console.log("[FileMapper.jumpToFile] Setting cursor position:", position);
							existingEditor.selection = new vscode.Selection(position, position);
							existingEditor.revealRange(new vscode.Range(position, position), vscode.TextEditorRevealType.AtTop);
						}
						return;
					}
					// 如果没有已存在的编辑器，则在当前列打开
					console.log("[FileMapper.jumpToFile] No existing editor found, opening in current column");
					break;
				default:
					// 默认行为
					console.log("[FileMapper.jumpToFile] Using default mode");
					break;
			}

			// 打开文件
			console.log("[FileMapper.jumpToFile] Opening file with viewColumn:", viewColumn);
			const editor = await vscode.window.showTextDocument(uri, {
				viewColumn: viewColumn,
				preserveFocus: false,
				preview: false
			});

			// 如果指定了位置，则设置光标位置
			if (position) {
				console.log("[FileMapper.jumpToFile] Setting cursor position:", position);
				editor.selection = new vscode.Selection(position, position);
				editor.revealRange(new vscode.Range(position, position), vscode.TextEditorRevealType.AtTop);
			}
			
			console.log("[FileMapper.jumpToFile] Successfully jumped to file");
		} catch (error) {
			console.error('[FileMapper.jumpToFile] Error jumping to file:', error);
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
			console.log("[FileMapper.jumpToXml] Called via shortcut key");

			const editor = vscode.window.activeTextEditor;
			if (!editor || !editor.document.uri.fsPath.endsWith('.java')) {
				return;
			}

			const javaFilePath = editor.document.uri.fsPath;
			
			// 提取方法名
			const methodName = this.extractMethodName(editor);
			
			// 使用新的导航器进行跳转
			await this.javaToXmlNavigator.navigateToXml(javaFilePath, methodName || undefined);
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
			console.log("[FileMapper.jumpToMapper] Called via shortcut key");

			const editor = vscode.window.activeTextEditor;
			if (!editor || !editor.document.uri.fsPath.endsWith('.xml')) {
				return;
			}

			const xmlFilePath = editor.document.uri.fsPath;
			
			// 提取方法名
			const methodName = this.extractMethodName(editor);
			
			// 使用新的导航器进行跳转
			await this.xmlToJavaNavigator.navigateToJava(xmlFilePath, methodName || undefined);
		} catch (error) {
			console.error('Error jumping to mapper:', error);
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
			console.log("publicJumpToFile called with:", { filePath, methodNameOrPosition });
			
			// 如果filePath是XML文件且methodNameOrPosition是字符串（方法名）
			// 则需要跳转到对应的Java Mapper文件中的方法
			if (filePath.endsWith('.xml') && typeof methodNameOrPosition === 'string') {
				console.log("Processing XML to Java jump request");
				
				// 解析XML文件的命名空间
				const namespace = await this.fileUtils.parseXmlNamespace(filePath);
				if (namespace) {
					console.log("XML namespace found:", namespace);
					
					// 从命名空间中提取类名
					const className = namespace.substring(namespace.lastIndexOf(".") + 1);
					console.log("Class name extracted:", className);
					
					// 查找对应的Java文件
					const javaFilePath = await this.findJavaFileByClassName(className);
					if (javaFilePath) {
						console.log("Java file found:", javaFilePath);
						
						// 查找Java文件中方法的位置
						const position = await this.findJavaMethodPosition(javaFilePath, methodNameOrPosition);
						console.log("Java method position found:", position);
						
						// 跳转到Java文件
						await this.jumpToFile(javaFilePath, position);
						return;
					} else {
						console.log("Java file not found for namespace:", namespace);
					}
				} else {
					console.log("No namespace found in XML file");
				}
			}
			
			let position: vscode.Position | null = null;
			// 检查第二个参数的类型
			if (typeof methodNameOrPosition === 'string') {
				if (filePath.endsWith('.xml')) {
					// 如果是XML文件且参数是方法名，查找XML中的位置
					position = await this.findMethodPosition(filePath, methodNameOrPosition);
				} else if (filePath.endsWith('.java')) {
					// 如果是Java文件且参数是方法名，查找Java中的位置
					console.log(`Finding Java method position for ${methodNameOrPosition} in ${filePath}`);
					position = await this.findJavaMethodPosition(filePath, methodNameOrPosition);
					console.log(`Found Java method position:`, position);
				}
			} else if (methodNameOrPosition instanceof vscode.Position) {
				// 如果是位置，直接使用
				position = methodNameOrPosition;
			}
			
			// 添加调试日志
			console.log(`Jumping to file: ${filePath}, position:`, position);
			await this.jumpToFile(filePath, position);
		} catch (error) {
			console.error('Error in publicJumpToFile:', error);
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
	 * Public method to extract method name from editor
	 */	
	public extractMethodNamePublic(editor: vscode.TextEditor): string | undefined {
		const methodName = this.extractMethodName(editor);
		return methodName || undefined;
	}

	/**
	 * Public method to parse XML namespace
	 */
	public async parseXmlNamespacePublic(xmlPath: string): Promise<string | undefined> {
		const namespace = await this.fileUtils.parseXmlNamespace(xmlPath);
		return namespace || undefined;
	}


	/**
	 * Public method to find Java method position
	 */
	public async findJavaMethodPositionPublic(javaPath: string, methodName: string): Promise<vscode.Position | undefined> {
		const position = await this.findJavaMethodPosition(javaPath, methodName);
		return position || undefined;
	}

	/**
	 * Public method to jump to file
	 */
	public async jumpToFilePublic(filePath: string, position?: vscode.Position): Promise<void> {
		await this.jumpToFile(filePath, position);
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
		// (当前实现中没有定时器)

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
