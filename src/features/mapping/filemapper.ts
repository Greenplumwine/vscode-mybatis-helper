import * as vscode from 'vscode';
import * as fs from 'fs/promises';
import * as path from 'path';
import { getPluginConfig } from '../../utils';
import { JavaExtensionAPI } from "../../utils/javaExtensionAPI";
import { FileOpenMode } from "../../types";
import { JavaToXmlNavigator } from "./navigator/javaToXmlNavigator";
import { XmlToJavaNavigator } from "./navigator/xmlToJavaNavigator";
import { Logger } from "../../utils/logger";

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
	private logger: Logger;

	constructor() {
		// 初始化配置
		const config = vscode.workspace.getConfiguration("mybatis-helper");
		this.scanInterval = config.get<number>("scanInterval", 5000);
		this.scanTimeoutMs = config.get<number>("scanTimeoutMs", 30000);
		this.jumpThrottleMs = config.get<number>("jumpThrottleMs", 1000);
		this.fileOpenMode = config.get<FileOpenMode>("fileOpenMode", FileOpenMode.USE_EXISTING);

		// 初始化日志实例
		this.logger = Logger.getInstance();

		// 初始化导航器实例
		this.javaToXmlNavigator = new JavaToXmlNavigator(this);
		this.xmlToJavaNavigator = new XmlToJavaNavigator(this);
	}

	/**
	 * Schedule a delayed folder scan
	 */
	private scheduleScan(): void {
		// 直接执行扫描，不使用防抖
		this.scanFolder();
	}

	/**
	 * Scan the workspace folder to find Java and XML files
	 */
	private async scanFolder(): Promise<void> {
		try {
			// 检查工作区是否已加载
			if (!vscode.workspace.workspaceFolders || vscode.workspace.workspaceFolders.length === 0) {
				return;
			}

			this.logger.info('Scanning workspace for Java and XML files...');
			
			// 添加排除规则，避免扫描.git目录、构建输出目录和临时文件
			const javaFiles = await vscode.workspace.findFiles(
				'**/*.java', 
				'**/{node_modules,.git,target,build,out}/**'
			);
			const xmlFiles = await vscode.workspace.findFiles(
				'**/*.xml', 
				'**/{node_modules,.git,target,build,out}/**'
			);

			this.logger.debug(`Found ${javaFiles.length} Java files and ${xmlFiles.length} XML files`);

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
						this.logger.debug(`Mapped Java file ${javaFile.fsPath} to XML file ${xmlPath}`);
					}
				}
			}
			this.logger.info('Workspace scan completed');
		} catch (error) {
			this.logger.error('Error scanning folder:', error as Error);
		}
	}

	/**
	 * Setup file watchers to handle incremental updates
	 */
	private setupFileWatchers(): void {
		try {
			// 检查工作区是否已加载
			if (!vscode.workspace.workspaceFolders || vscode.workspace.workspaceFolders.length === 0) {
				return;
			}

			this.logger.info('Setting up file watchers...');
			
			// Watch for changes in Java and XML files
			// 添加排除规则，避免监听.git目录、构建输出目录和临时文件
			this.fileWatcher = vscode.workspace.createFileSystemWatcher(
				new vscode.RelativePattern(
					vscode.workspace.workspaceFolders[0], 
					'**/*.{java,xml}'
				),
				false, // ignoreCreateEvents
				true, // ignoreChangeEvents
				true // ignoreDeleteEvents
			);

			// 处理文件创建事件
			const handleFileCreate = (uri: vscode.Uri) => {
				// Only trigger a scan if file is in the workspace and not in excluded directories
				if (this.isFileInWorkspace(uri.fsPath) && 
					!uri.fsPath.includes('/.git/') && 
					!uri.fsPath.includes('\\.git\\') &&
					!uri.fsPath.endsWith('.git') &&
					!uri.fsPath.includes('/target/') &&
					!uri.fsPath.includes('\\target\\') &&
					!uri.fsPath.includes('/build/') &&
					!uri.fsPath.includes('\\build\\') &&
					!uri.fsPath.includes('/out/') &&
					!uri.fsPath.includes('\\out\\')) {
					this.logger.debug(`File created: ${uri.fsPath}, scheduling scan...`);
					this.scheduleScan();
				}
			};

			this.fileWatcher.onDidCreate(handleFileCreate);

			this.fileWatcher.onDidDelete((uri) => {
				// Remove deleted file from mappings
				this.logger.debug(`File deleted: ${uri.fsPath}, updating mappings...`);
				if (uri.fsPath.endsWith('.java')) {
					const xmlPath = this.mappings.get(uri.fsPath);
					if (xmlPath) {
						this.mappings.delete(uri.fsPath);
						this.reverseMappings.delete(xmlPath);
						this.logger.debug(`Removed mapping: ${uri.fsPath} -> ${xmlPath}`);
					}
				} else if (uri.fsPath.endsWith('.xml')) {
					const mapperPath = this.reverseMappings.get(uri.fsPath);
					if (mapperPath) {
						this.reverseMappings.delete(uri.fsPath);
						this.mappings.delete(mapperPath);
						this.logger.debug(`Removed mapping: ${mapperPath} -> ${uri.fsPath}`);
					}
				}
			});

			// 处理文件变更事件，用于重新扫描相关文件
			this.fileWatcher.onDidChange((uri) => {
				// Skip files in excluded directories
				if (uri.fsPath.includes('/.git/') || 
					uri.fsPath.includes('\\.git\\') ||
					uri.fsPath.endsWith('.git') ||
					uri.fsPath.includes('/target/') ||
					uri.fsPath.includes('\\target\\') ||
					uri.fsPath.includes('/build/') ||
					uri.fsPath.includes('\\build\\') ||
					uri.fsPath.includes('/out/') ||
					uri.fsPath.includes('\\out\\')) {
					return;
				}
				
				this.logger.debug(`File changed: ${uri.fsPath}, updating mappings...`);
				
				if (this.isFileInWorkspace(uri.fsPath)) {
					// 仅清除与变更文件相关的映射
					if (uri.fsPath.endsWith('.java')) {
						const xmlPath = this.mappings.get(uri.fsPath);
						if (xmlPath) {
							this.mappings.delete(uri.fsPath);
							this.reverseMappings.delete(xmlPath);
							this.logger.debug(`Removed mapping: ${uri.fsPath} -> ${xmlPath}`);
						}
					} else if (uri.fsPath.endsWith('.xml')) {
						const mapperPath = this.reverseMappings.get(uri.fsPath);
						if (mapperPath) {
							this.reverseMappings.delete(uri.fsPath);
							this.mappings.delete(mapperPath);
							this.logger.debug(`Removed mapping: ${mapperPath} -> ${uri.fsPath}`);
						}
					}
					// 重新扫描可能受影响的文件
					this.scheduleScan();
				}
			});

			this.logger.info('File watchers setup completed');
		} catch (error) {
			this.logger.error('Error setting up file watchers:', error as Error);
		}
	}

	/**
	 * Check if a file is within the workspace
	 */
	private isFileInWorkspace(filePath: string): boolean {
		const workspaceFolders = vscode.workspace.workspaceFolders || [];
		return workspaceFolders.some((folder) => 
			filePath.startsWith(folder.uri.fsPath)
		);
	}

	/**
	 * Check if a Java file is a Mapper interface
	 */
	private async isMapperInterface(javaFilePath: string): Promise<boolean> {
		try {
			const content = await fs.readFile(javaFilePath, 'utf-8');
			if (!content) return false;

			const isInterface = /interface\s+\w+/.test(content);
			const hasMyBatisAnnotation = /@Mapper|@Select|@Insert|@Update|@Delete/.test(content);
			const hasMyBatisImport = /import\s+org\.apache\.ibatis|import\s+org\.mybatis/.test(content);

			return !!isInterface && (!!hasMyBatisAnnotation || !!hasMyBatisImport);
		} catch (error) {
			this.logger.error('Error checking Mapper interface:', error as Error);
			return false;
		}
	}

	/**
	 * Parse Java package from file content
	 */
	private async parseJavaPackage(filePath: string): Promise<string | undefined> {
		try {
			const content = await fs.readFile(filePath, 'utf-8');
			const packageMatch = content.match(/package\s+([^;]+);/);
			return packageMatch ? packageMatch[1] : undefined;
		} catch (error) {
			this.logger.error('Error parsing Java package:', error as Error);
			return undefined;
		}
	}

	/**
	 * Parse XML namespace from file content
	 */
	private async parseXmlNamespace(filePath: string): Promise<string | undefined> {
		try {
			const content = await fs.readFile(filePath, 'utf-8');
			const namespaceMatch = content.match(/namespace\s*=\s*["']([^"']+)["']/);
			return namespaceMatch ? namespaceMatch[1] : undefined;
		} catch (error) {
			this.logger.error('Error parsing XML namespace:', error as Error);
			return undefined;
		}
	}



	/**
	 * Extract method parameters from a Java Mapper interface
	 * @param namespace The full class name of the Mapper interface
	 * @param methodName The method name to extract parameters for
	 * @returns Array of parameter names and types, or undefined if method not found
	 */
	public async extractMethodParametersPublic(namespace: string, methodName: string): Promise<Array<{ name: string; type: string }> | undefined> {
		try {
			// Find the Java file by class name
			const javaFilePath = await this.findJavaFileByClassName(namespace);
			if (!javaFilePath) {
				this.logger.debug(`Java file not found for namespace: ${namespace}`);
				return undefined;
			}

			// Read the Java file content
			const content = await fs.readFile(javaFilePath, 'utf-8');
			
			// Escape method name to handle special regex characters
			const escapedMethodName = methodName.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
			this.logger.debug(`[extractMethodParametersPublic] Escaped method name: ${escapedMethodName}`);
			
			// Find the method in the file, including any leading javadoc comments
			const methodRegex = new RegExp(
				`(?:/\\*\\*[\\s\\S]*?\\*/)?\\s*(?:public|private|protected|default)\\s*(?:static|final)?\\s*[\\w<>,\\[\\]\\s]+\\s+${escapedMethodName}\\s*\\(([^)]*)\\)\\s*(?:throws\\s+[\\w.]+)?\\s*\\{?`,
				'g'
			);
			
			this.logger.debug(`[extractMethodParametersPublic] Method regex pattern: ${methodRegex.source}`);
			
			const match = methodRegex.exec(content);
			if (!match || !match[1]) {
				this.logger.debug(`Method ${methodName} not found in ${namespace}`);
				return undefined;
			}
			
			// Extract parameters
			const paramsStr = match[1].trim();
			this.logger.debug(`[extractMethodParametersPublic] Found method signature: ${match[0]}`);
			this.logger.debug(`[extractMethodParametersPublic] Found parameters string: '${paramsStr}'`);
			if (!paramsStr) {
				// No parameters
				this.logger.debug(`[extractMethodParametersPublic] No parameters found`);
				return [];
			}
			
			// Extract @param annotations from the javadoc
			const paramAnnotations: Map<number, string> = new Map();
			const javadocMatch = /\/\*\*[\s\S]*?\*\//.exec(match[0]);
			if (javadocMatch) {
				const javadoc = javadocMatch[0];
				const paramAnnotationRegex = /@param\s+(\w+)\s+/g;
				let annotationMatch;
				let paramIndex = 0;
				
				while ((annotationMatch = paramAnnotationRegex.exec(javadoc)) !== null) {
					const paramNameFromAnnotation = annotationMatch[1];
					paramAnnotations.set(paramIndex, paramNameFromAnnotation);
					paramIndex++;
				}
			}
			
			// Parse parameters
			const params: Array<{ name: string; type: string }> = [];
			const paramRegex = /\s*([\w<>,\[\]\s,]+)\s+([\w]+)\s*/g;
			let paramMatch;
			let paramIndex = 0;
			
			while ((paramMatch = paramRegex.exec(paramsStr)) !== null) {
				const type = paramMatch[1].trim();
				let name = paramMatch[2].trim();
				
				// Check if there's a @param annotation for this parameter
				if (paramAnnotations.has(paramIndex)) {
					name = paramAnnotations.get(paramIndex)!;
				}
				
				params.push({ name, type });
				paramIndex++;
			}
			
			return params;
		} catch (error) {
			this.logger.error(`Error extracting method parameters: ${error instanceof Error ? error.message : String(error)}`);
			this.logger.error(`Error stack: ${error instanceof Error ? error.stack : 'No stack trace'}`);
			return undefined;
		}
	}

	/**
	 * Try to find XML file by quick path heuristics (without scanning all files)
	 */	
	private async findXmlByQuickPath(javaFilePath: string): Promise<string | undefined> {
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

			this.logger.debug(`Searching for XML files in ${possibleXmlPaths.length} possible locations for ${javaFilePath}`);
			
			// 检查这些可能的路径是否存在
			for (const xmlPath of possibleXmlPaths) {
				try {
					await fs.access(xmlPath);
					this.logger.debug(`Found XML file at: ${xmlPath}`);
					return xmlPath;
				} catch {
					// File doesn't exist, continue checking next path
				}
			}

			return undefined;
		} catch (error) {
			this.logger.error('Error finding XML by quick path:', error as Error);
			return undefined;
		}
	}

	/**
	 * Get possible XML paths for a given Java file
	 */	
	private async getPossibleXmlPaths(javaFilePath: string): Promise<string[]> {
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
				try {
					await fs.access(xmlPath);
					existingPaths.push(xmlPath);
				} catch {
					// File doesn't exist, continue checking next path
				}
			}
			return existingPaths;
		} catch (error) {
			this.logger.error('Error getting possible XML paths:', error as Error);
			return [];
		}
	}

	/**
	 * Find XML file for a Mapper interface
	 */	
	private async findXmlForMapper(
		javaFilePath: string,
		xmlFiles: vscode.Uri[]
	): Promise<string | undefined> {
		try {
			// 快速路径：先尝试从类名和路径猜测XML位置
			this.logger.debug(`Finding XML file for mapper: ${javaFilePath}`);
			const quickXmlPath = await this.findXmlByQuickPath(javaFilePath);
			if (quickXmlPath) {
				this.logger.debug(`Found XML file via quick path: ${quickXmlPath}`);
				return quickXmlPath;
			}

			// Get class name from file path
			const fileName = path.basename(javaFilePath, '.java');

			// 获取Java包名
			const javaPackage = await this.parseJavaPackage(javaFilePath);
			const fullClassName = javaPackage ? `${javaPackage}.${fileName}` : fileName;

			// 增强的目录搜索策略
			// Priority 1: 检查用户配置的XML目录（如果有）
			const config = getPluginConfig();
			const customXmlDirs = config.customXmlDirectories || [];
			for (const customDir of customXmlDirs) {
				for (const workspaceFolder of vscode.workspace.workspaceFolders || []) {
					const customDirPath = path.join(workspaceFolder.uri.fsPath, customDir);
					try {
						await fs.access(customDirPath);
						const possibleXmlPath = path.join(customDirPath, fileName + '.xml');
						try {
							await fs.access(possibleXmlPath);
							const namespace = await this.parseXmlNamespace(possibleXmlPath);
							if (!namespace || namespace === fullClassName) {
								this.logger.debug(`Found XML file in custom directory: ${possibleXmlPath}`);
								return possibleXmlPath;
							}
						} catch {
							// File doesn't exist, continue checking
						}
					} catch {
						// Directory doesn't exist, continue checking
					}
				}
			}

			// Priority 2: Check XML files in common mapper directories first
			const commonXmlDirPatterns = ['/mapper/', '/mappers/', '/xml/', '/dao/', '/mybatis/'];
			const priorityDirXmlFiles = xmlFiles.filter(
				(xmlFile) => commonXmlDirPatterns.some(pattern => xmlFile.fsPath.includes(pattern))
			);

			// 定义路径优先级排序函数，优先选择src目录下的文件，避免build目录
			const sortByPathPriority = (a: vscode.Uri, b: vscode.Uri): number => {
				const config = getPluginConfig();
				const pathPriority = config.pathPriority;
				
				// 如果禁用了路径优先级排序，则返回0表示优先级相同
				if (!pathPriority.enabled) {
					return 0;
				}
				
				const aPath = a.fsPath;
				const bPath = b.fsPath;
				
				// 检查是否在优先目录中
				let aPriorityScore = 0;
				let bPriorityScore = 0;
				
				for (const priorityDir of pathPriority.priorityDirectories) {
					if (aPath.includes(priorityDir)) {
						aPriorityScore++;
					}
					if (bPath.includes(priorityDir)) {
						bPriorityScore++;
					}
				}
				
				// 如果优先级分数不同，按分数排序
				if (aPriorityScore !== bPriorityScore) {
					return bPriorityScore - aPriorityScore; // 高分数优先
				}
				
				// 检查是否在排除目录中
				let aInExclude = false;
				let bInExclude = false;
				
				for (const excludeDir of pathPriority.excludeDirectories) {
					if (aPath.includes(excludeDir)) {
						aInExclude = true;
					}
					if (bPath.includes(excludeDir)) {
						bInExclude = true;
					}
				}
				
				// 排除目录优先级较低
				if (aInExclude && !bInExclude) return 1;
				if (!aInExclude && bInExclude) return -1;
				
				// 如果优先级相同，按路径深度排序，优先选择更符合项目结构的路径
				const aDepth = aPath.split('/').length + aPath.split('\\').length;
				const bDepth = bPath.split('/').length + bPath.split('\\').length;
				return aDepth - bDepth;
			};

			// 对优先级目录中的文件进行排序
			priorityDirXmlFiles.sort(sortByPathPriority);

			// Try to find in priority directories first
			for (const xmlFile of priorityDirXmlFiles) {
				const xmlFileName = path.basename(xmlFile.fsPath, '.xml');
				// 使用自定义名称匹配规则
				if (this.checkNameMatchingRules(fileName, xmlFileName) || 
				    this.checkNameWithIgnoredSuffixes(fileName, xmlFileName)) {
					// Use namespace verification
					const namespace = await this.parseXmlNamespace(xmlFile.fsPath);
					if (namespace) {
						if (namespace === fullClassName) {
							this.logger.debug(`Found XML file via namespace match: ${xmlFile.fsPath}`);
							return xmlFile.fsPath;
						}
					} else {
						// If namespace cannot be read, use file name match as fallback
						this.logger.debug(`Found XML file via file name match: ${xmlFile.fsPath}`);
						return xmlFile.fsPath;
					}
				}
			}

			// Priority 3: 基于包名的智能查找
			if (javaPackage) {
				// 将包名转换为目录路径
				const packagePath = javaPackage.replace(/\./g, path.sep);
				// 搜索与Java包路径对应的XML文件
				const packageXmlFiles = xmlFiles.filter(xmlFile => xmlFile.fsPath.includes(packagePath));
				// 对包路径中的文件进行排序
				packageXmlFiles.sort(sortByPathPriority);
				
				for (const xmlFile of packageXmlFiles) {
					const xmlFileName = path.basename(xmlFile.fsPath, '.xml');
					// 检查文件名匹配和路径是否包含包路径
					if ((this.checkNameMatchingRules(fileName, xmlFileName) || 
					     this.checkNameWithIgnoredSuffixes(fileName, xmlFileName)) && 
						xmlFile.fsPath.includes(packagePath)) {
						const namespace = await this.parseXmlNamespace(xmlFile.fsPath);
						if (namespace === fullClassName) {
							this.logger.debug(`Found XML file via package path match: ${xmlFile.fsPath}`);
							return xmlFile.fsPath;
						}
					}
				}
			}

			// Priority 4: 直接处理剩余的文件列表
			const remainingFiles = xmlFiles.filter(f => 
				!commonXmlDirPatterns.some(pattern => f.fsPath.includes(pattern)) &&
				(!javaPackage || !f.fsPath.includes(javaPackage.replace(/\./g, path.sep)))
			);
			
			// 对剩余文件进行排序
			remainingFiles.sort(sortByPathPriority);
			
			let result: string | undefined;
			for (const xmlFile of remainingFiles) {
				const xmlFileName = path.basename(xmlFile.fsPath, '.xml');
				// 使用自定义名称匹配规则
				if (this.checkNameMatchingRules(fileName, xmlFileName) || 
				    this.checkNameWithIgnoredSuffixes(fileName, xmlFileName)) {
					// Use namespace verification
					const namespace = await this.parseXmlNamespace(xmlFile.fsPath);
					if (namespace) {
						if (namespace === fullClassName) {
							result = xmlFile.fsPath;
							this.logger.debug(`Found XML file via namespace match: ${result}`);
							break;
						}
					} else {
						result = xmlFile.fsPath;
						this.logger.debug(`Found XML file via file name match: ${result}`);
						break;
					}
				}
			}

			return result;
		} catch (error) {
			this.logger.error('Error finding XML for Mapper:', error as Error);
			return undefined;
		}
	}

	/**
	 * 搜索XML文件的命名空间
	 */	
	private async searchXmlByNamespace(namespace: string): Promise<string | undefined> {
		try {
			// 提取类名和包名
			const className = namespace.substring(namespace.lastIndexOf('.') + 1);
			const packageName = namespace.substring(0, namespace.lastIndexOf('.'));
			const packagePath = packageName.replace(/\./g, path.sep);

			this.logger.debug(`Searching XML files for namespace: ${namespace}`);
			
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
				const xmlFiles = await vscode.workspace.findFiles(pattern, '**/{node_modules,.git,target,build,out}/**');
				for (const xmlFile of xmlFiles) {
					// 检查文件路径是否有效，避免尝试访问Git相关文件
					if (xmlFile.fsPath.includes('/.git/') || 
						xmlFile.fsPath.includes('\\.git\\') ||
						xmlFile.fsPath.endsWith('.git')) {
						continue;
					}
					
					const fileNamespace = await this.parseXmlNamespace(xmlFile.fsPath);
					if (fileNamespace === namespace) {
						this.logger.debug(`Found XML file with namespace ${namespace} at: ${xmlFile.fsPath}`);
						return xmlFile.fsPath;
					}
				}
			}

			this.logger.debug(`No XML file found for namespace: ${namespace}`);
			return undefined;
		} catch (error) {
			this.logger.error('Error searching XML by namespace:', error as Error);
			return undefined;
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

		// 使用同步的方式检查文件是否存在
		const fsSync = require('fs');
		while (currentDir !== path.parse(currentDir).root) {
			for (const marker of rootMarkers) {
				try {
					if (fsSync.existsSync(path.join(currentDir, marker))) {
						return currentDir;
					}
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
		try {
			this.logger.debug(`Finding Java file by class name: ${className}`);
			
			// 从类名中提取简单类名（最后一个点之后的部分）
			const simpleClassName = className.substring(className.lastIndexOf('.') + 1);
			this.logger.debug(`Simple class name: ${simpleClassName}`);
			
			// 查找所有Java文件
			const javaFiles = await vscode.workspace.findFiles('**/*.java', '**/{node_modules,.git,target,build,out}/**');
			
			for (const javaFile of javaFiles) {
				const fileName = path.basename(javaFile.fsPath, '.java');
				
				// 首先检查文件名是否匹配
				if (fileName === simpleClassName) {
					// 如果输入的是简单类名（不包含点），直接返回该文件
					if (!className.includes('.')) {
						this.logger.debug(`Found Java file: ${javaFile.fsPath} for simple class name: ${className}`);
						return javaFile.fsPath;
					}
					
					// 读取文件内容，解析包声明
					const fileContent = await vscode.workspace.fs.readFile(javaFile);
					const contentStr = Buffer.from(fileContent).toString('utf-8');
					
					// 匹配包声明，如：package com.example.mapper;
					const packageMatch = contentStr.match(/^\s*package\s+([^;]+);/m);
					if (packageMatch) {
						const packageName = packageMatch[1].trim();
						const fullClassName = `${packageName}.${fileName}`;
						
						// 检查完整类名是否匹配
						if (fullClassName === className) {
							this.logger.debug(`Found Java file: ${javaFile.fsPath} for class: ${className}`);
							return javaFile.fsPath;
						}
						this.logger.debug(`Found file ${javaFile.fsPath} with package ${packageName}, full class name ${fullClassName}, expected ${className}`);
					}
				}
			}
			
			this.logger.debug(`No Java file found for class: ${className}`);
			return undefined;
		} catch (error) {
			this.logger.error('Error finding Java file by class name:', error as Error);
			return undefined;
		}
	}

	/**
	 * Check if we should throttle jump requests
	 */	
	private shouldThrottleJump(type: string): boolean {
		// 简单的节流实现
		const now = Date.now();
		const lastJumpTime = this.lastJumpTime[type] || 0;
		if (now - lastJumpTime < this.jumpThrottleMs) {
			this.logger.debug(`Throttling jump request for type: ${type}`);
			return true; // 应该节流
		}
		this.lastJumpTime[type] = now;
		return false;
	}

	/**
	 * 提取命名空间
	 */
	private async extractNamespace(xmlPath: string): Promise<string | null> {
		try {
			const content = await fs.readFile(xmlPath, 'utf-8');
			const namespaceMatch = content.match(/namespace\s*=\s*["']([^"']+)["']/);
			return namespaceMatch ? namespaceMatch[1] : null;
		} catch (error) {
			this.logger.error('Error extracting namespace:', error as Error);
			return null;
		}
	}

	/**
	 * Extract method name or SQL ID from current cursor position
	 */	
	private extractMethodName(editor: vscode.TextEditor): string | null {
		try {
			const position = editor.selection.active;
			const line = editor.document.lineAt(position.line).text;
			const filePath = editor.document.uri.fsPath;

			this.logger.debug(`Extracting method name from line: ${line}, file: ${filePath}, position: ${position.line}:${position.character}`);

			if (filePath.endsWith('.java')) {
				// 方法1：使用更准确的正则表达式匹配Java方法定义
				const methodRegex = /^(?!\s*\*\s+)(?=.*\b(?:public|private|protected)\s+)(?:\s*(?:public|private|protected)\s+)?(?:static\s+)?[\w<>,\s]+\s+(\w+)\s*\([^)]*\)/;
				const methodMatch = methodRegex.exec(line);
				
				if (methodMatch) {
					this.logger.debug(`Found Java method: ${methodMatch[1]} in line: ${line}`);
					return methodMatch[1];
				} 
				
				// 方法2：尝试匹配更简单的方法定义（无修饰符）
				const simpleMethodRegex = /^(?!\s*\*\s+)(?:\s*|@\w+(?:\([^)]*\))?\s*)[\w<>,\s]+\s+(\w+)\s*\([^)]*\)\s*[;{]/;
				const simpleMatch = simpleMethodRegex.exec(line);
				if (simpleMatch) {
					this.logger.debug(`Found simple Java method: ${simpleMatch[1]} in line: ${line}`);
					return simpleMatch[1];
				}
				
				// 方法3：尝试匹配接口方法定义（如：List<User> findAll();）
				const interfaceMethodRegex = /^(?!\s*\*\s+)\s*[\w<>,\s]+\s+(\w+)\s*\([^)]*\)\s*[;{]/;
				const interfaceMatch = interfaceMethodRegex.exec(line);
				if (interfaceMatch) {
					this.logger.debug(`Found interface method: ${interfaceMatch[1]} in line: ${line}`);
					return interfaceMatch[1];
				}
				
				// 方法4：如果当前行没有找到方法，尝试查找当前光标所在的方法块
				// 从当前行向上查找，直到找到方法定义
				let currentLineNum = position.line;
				const document = editor.document;
				// 添加负向前瞻断言，跳过注释行
				const methodBlockRegex = /^(?!\s*\*\s+)(?!\s*\/\/)\s*(?:(?:public|private|protected)\s+)?(?:static\s+)?[\w<>,\s]+\s+(\w+)\s*\([^)]*\)\s*[;{]/;
				
				// 添加循环限制，最多向上查找50行，防止无限循环
				const maxLinesToCheck = 50;
				let linesChecked = 0;
				
				while (currentLineNum >= 0 && linesChecked < maxLinesToCheck) {
					const currentLine = document.lineAt(currentLineNum).text;
					// 跳过注释行和空行
					if (currentLine.trim() === '' || currentLine.trim().startsWith('//') || currentLine.trim().startsWith('/*')) {
						currentLineNum--;
						linesChecked++;
						continue;
					}
					
					const blockMatch = methodBlockRegex.exec(currentLine);
					if (blockMatch) {
						this.logger.debug(`Found method in block: ${blockMatch[1]} at line ${currentLineNum}`);
						return blockMatch[1];
					}
					currentLineNum--;
					linesChecked++;
				}
				
				if (linesChecked >= maxLinesToCheck) {
					this.logger.debug(`Reached maximum lines to check (${maxLinesToCheck}), stopping search`);
				}
				
				this.logger.debug(`No Java method found in line: ${line} or surrounding blocks`);
				return null;
			} else if (filePath.endsWith('.xml')) {
				// 方法1：使用更准确的正则表达式处理XML标签中的id属性
				const idMatch = /<\w+\s+[^>]*id\s*=\s*["']([^"']+)["'][^>]*>/.exec(line);
				
				if (idMatch) {
					this.logger.debug(`Found XML id attribute: ${idMatch[1]} in line: ${line}`);
					return idMatch[1];
				}
				
				// 方法2：处理单引号和双引号的id属性，支持换行
				const altMatch = /id\s*=\s*(?:"([^"]*)"|\'([^\']*)\')/i.exec(line);
				if (altMatch) {
					const matchedId = altMatch[1] || altMatch[2];
					this.logger.debug(`Found XML id attribute via alternative approach: ${matchedId} in line: ${line}`);
					return matchedId;
				} 
				
				// 方法3：如果当前行没有找到id属性，尝试查找当前光标所在的标签
				let currentLineNum = position.line;
				const document = editor.document;
				const xmlTagRegex = /<(?:select|update|insert|delete|selectKey)\s+[^>]*id\s*=\s*["']([^"']+)["'][^>]*>/;
				
				// 添加循环限制，最多向上查找50行，防止无限循环
				const maxLinesToCheck = 50;
				let linesChecked = 0;
				
				while (currentLineNum >= 0 && linesChecked < maxLinesToCheck) {
					const currentLine = document.lineAt(currentLineNum).text;
					const tagMatch = xmlTagRegex.exec(currentLine);
					if (tagMatch) {
						this.logger.debug(`Found XML tag with id: ${tagMatch[1]} at line ${currentLineNum}`);
						return tagMatch[1];
					}
					currentLineNum--;
					linesChecked++;
				}
				
				if (linesChecked >= maxLinesToCheck) {
					this.logger.debug(`Reached maximum lines to check (${maxLinesToCheck}), stopping search`);
				}
				
				this.logger.debug(`No XML id attribute found in line: ${line} or surrounding tags`);
				return null;
			}
			this.logger.debug(`File is neither Java nor XML, cannot extract method name: ${filePath}`);
			return null;
		} catch (error) {
			this.logger.error('Error extracting method name:', error as Error);
			return null;
		}
	}

	/**
	 * Find the position of a method in an XML file
	 */
	private async findMethodPosition(xmlPath: string, methodName: string): Promise<vscode.Position | null> {
		try {
			// 检查文件路径是否有效，避免尝试访问Git相关文件
			if (xmlPath.includes('/.git/') || 
				xmlPath.includes('\\.git\\') ||
				xmlPath.endsWith('.git')) {
				return null;
			}

			// 检查文件是否存在
			try {
				await fs.access(xmlPath);
			} catch {
				return null;
			}

			// 读取XML文件内容
			const content = await fs.readFile(xmlPath, 'utf-8');
			if (!content) {
				return null;
			}

			// 将内容拆分为行
			const lines = content.split('\n');

			// 使用更准确的正则表达式匹配MyBatis XML中的SQL语句定义
			// 匹配各种MyBatis标签（select, update, insert, delete, selectKey）
			// 支持各种引号类型、空格和换行符
			// 注意：使用字符串拼接避免TypeScript将\2解释为八进制转义序列
			const methodRegex = new RegExp(
				'<(select|update|insert|delete|selectKey)\\s+[^>]*id\\s*=\\s*([\'"])' + 
				methodName + '\\2',
				'gi'
			);

			// 先在整个文件中查找匹配
			const match = methodRegex.exec(content);
			if (match) {
				// 计算匹配位置所在的行
				const matchIndex = match.index;
				const linesBeforeMatch = content.substring(0, matchIndex).split('\n').length - 1;
				const line = lines[linesBeforeMatch];
				
				// 找到方法名在该行的位置
				const methodIndex = line.indexOf(methodName);
				if (methodIndex !== -1) {
					this.logger.debug(`Found method ${methodName} at line ${linesBeforeMatch}, column ${methodIndex}`);
					return new vscode.Position(linesBeforeMatch, methodIndex);
				}
				this.logger.debug(`Found method ${methodName} at line ${linesBeforeMatch}, but could not find exact position`);
				return new vscode.Position(linesBeforeMatch, 0);
			}

			// 如果使用整个文件查找失败，尝试逐行查找
			for (let i = 0; i < lines.length; i++) {
				const line = lines[i];
				const lineMatch = methodRegex.exec(line);
				if (lineMatch) {
					// 找到匹配行，返回位置
					// 尝试找到方法名的确切位置
					const methodIndex = line.indexOf(methodName);
					if (methodIndex !== -1) {
						this.logger.debug(`Found method ${methodName} at line ${i}, column ${methodIndex} (line-by-line search)`);
						return new vscode.Position(i, methodIndex);
					}
					this.logger.debug(`Found method ${methodName} at line ${i} (line-by-line search), but could not find exact position`);
					return new vscode.Position(i, 0);
				}
			}

			this.logger.debug(`Method ${methodName} not found in ${xmlPath}`);
			return null;
		} catch (error) {
			this.logger.error('Error finding method position:', error as Error);
			return null;
		}
	}

	/**
	 * Find the position of a method in a Java file
	 */	
	private async findJavaMethodPosition(javaPath: string, methodName: string): Promise<vscode.Position | null> {
		try {
			// 检查文件路径是否有效，避免尝试访问Git相关文件
			if (javaPath.includes('/.git/') || 
				javaPath.includes('\\.git\\') ||
				javaPath.endsWith('.git')) {
				return null;
			}

			// 检查文件是否存在
			try {
				await fs.access(javaPath);
			} catch {
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
					this.logger.warn('Failed to use Java Extension API to find method position:', error as Error);
				}
			}

			// 如果Java扩展API不可用或查找失败，则使用正则表达式方式
			// 读取Java文件内容
			const content = await fs.readFile(javaPath, 'utf-8');
			if (!content) {
				return null;
			}

			// 将内容拆分为行
			const lines = content.split('\n');
			
			// 添加调试日志
			this.logger.debug(`Searching for method ${methodName} in ${javaPath}`);

			// 使用更准确的正则表达式匹配Java方法定义
			// 匹配各种访问修饰符、返回类型和方法签名格式
			// 支持泛型返回类型、数组返回类型、带注解的方法等
			const methodRegex = new RegExp(
				`(?:(?:public|private|protected)\\s+)?(?:static\\s+)?(?:final\\s+)?(?:synchronized\\s+)?[\\w<>\\[\\]\\?\\s,]*\\b${methodName}\\s*\\(`,
				'g'
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
					this.logger.debug(`Found method ${methodName} at line ${i}, column ${methodIndex}`);
					if (methodIndex !== -1) {
						return new vscode.Position(i, methodIndex);
					}
					return new vscode.Position(i, 0);
				}
			}

			// 如果没有精确匹配，尝试模糊匹配
			const fuzzyRegex = new RegExp(`\\b${methodName}\\s*\\(`, 'g');
			
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
					this.logger.debug(`Found method ${methodName} at line ${i}, column ${methodIndex} with fuzzy matching`);
					if (methodIndex !== -1) {
						return new vscode.Position(i, methodIndex);
					}
					return new vscode.Position(i, 0);
				}
			}

			// 如果仍然找不到，尝试更宽松的匹配模式
			const looseRegex = new RegExp(`${methodName}\\s*\\(`, 'g');
			
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
					this.logger.debug(`Found method ${methodName} at line ${i}, column ${methodIndex} with loose matching`);
					if (methodIndex !== -1) {
						return new vscode.Position(i, methodIndex);
					}
					return new vscode.Position(i, 0);
				}
			}
			
			this.logger.debug(`Method ${methodName} not found in ${javaPath}`);
			return null;
		} catch (error) {
			this.logger.error('Error finding Java method position:', error as Error);
			return null;
		}
	}

	/**
	 * Jump to a specific file and position
	 */	
	private async jumpToFile(filePath: string, position?: vscode.Position | null): Promise<void> {
		try {
			this.logger.debug(`Jumping to file: ${filePath} at position: ${position}`);
			
			// 检查文件路径是否有效，避免尝试访问Git相关文件
			if (filePath.includes('/.git/') || 
				filePath.includes('\\.git\\') ||
				filePath.endsWith('.git')) {
				this.logger.warn(`Attempted to jump to Git-related file path: ${filePath}`);
				return;
			}

			// 检查文件是否存在
			try {
				await fs.access(filePath);
			} catch {
				this.logger.error(`File not found: ${filePath}`);
				vscode.window.showErrorMessage(vscode.l10n.t("error.cannotOpenFile", { error: `File not found: ${filePath}` }));
				return;
			}

			const uri = vscode.Uri.file(filePath);
			this.logger.debug(`File URI: ${uri.toString()}`);

			// 查找是否已存在对应的编辑器
			const existingEditor = this.findExistingEditor(uri);
			this.logger.debug(`Existing editor found: ${!!existingEditor}`);

			// 根据文件打开模式决定如何打开文件
			let viewColumn = undefined;
			switch (this.fileOpenMode) {
				case FileOpenMode.NO_SPLIT:
					// 不拆分窗口
					viewColumn = undefined;
					this.logger.debug(`Using NO_SPLIT mode`);
					break;
				case FileOpenMode.USE_EXISTING:
					// 优先使用已存在的编辑器
					if (existingEditor) {
						this.logger.debug(`Using existing editor`);
						// 聚焦到已存在的编辑器
						vscode.window.showTextDocument(existingEditor.document, {
							preserveFocus: false,
							preview: false
						});
						// 如果指定了位置，则设置光标位置
						if (position) {
							this.logger.debug(`Setting cursor position: ${position}`);
							existingEditor.selection = new vscode.Selection(position, position);
							existingEditor.revealRange(new vscode.Range(position, position), vscode.TextEditorRevealType.AtTop);
						}
						return;
					}
					// 如果没有已存在的编辑器，则在当前列打开
					this.logger.debug(`No existing editor found, opening in current column`);
					break;
				default:
					// 默认行为
					this.logger.debug(`Using default mode`);
					break;
			}

			// 打开文件
			this.logger.debug(`Opening file with viewColumn: ${viewColumn}`);
			const editor = await vscode.window.showTextDocument(uri, {
				viewColumn: viewColumn,
				preserveFocus: false,
				preview: false
			});

			// 如果指定了位置，则设置光标位置
			if (position) {
				this.logger.debug(`Setting cursor position: ${position}`);
				editor.selection = new vscode.Selection(position, position);
				editor.revealRange(new vscode.Range(position, position), vscode.TextEditorRevealType.AtTop);
			}
			
			this.logger.debug(`Successfully jumped to file`);
		} catch (error) {
			this.logger.error('Error jumping to file:', error as Error);
		}
	}

	/**
	 * Find an existing editor for a file
	 */	
	private findExistingEditor(uri: vscode.Uri): vscode.TextEditor | undefined {
		return vscode.window.visibleTextEditors.find(
			(editor) => editor.document.uri.fsPath === uri.fsPath
		);
	}

	/**
	 * Jump to the corresponding XML file
	 */	
	public async jumpToXml(): Promise<void> {
		try {
			this.logger.debug("Called jumpToXml via shortcut key");

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
			this.logger.error('Error jumping to XML:', error as Error);
		}
	}

	/**
	 * Jump to the corresponding Mapper interface
	 */	
	public async jumpToMapper(): Promise<void> {
		try {
			this.logger.debug("Called jumpToMapper via shortcut key");

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
			this.logger.error('Error jumping to mapper:', error as Error);
		}
	}

	/**
	 * Refresh all mappings between Java and XML files
	 */	
	public async refreshAllMappings(): Promise<void> {
		try {
			this.logger.debug('Refreshing all mappings between Java and XML files...');
			
			// 清除现有映射
			this.mappings.clear();
			this.reverseMappings.clear();
			this.logger.debug('Cleared existing mappings');

			// 重新扫描
			await this.scanFolder();
			this.logger.debug('Mapping refresh completed successfully');
			this.logger.info(`Established ${this.mappings.size} mappings between Java and XML files`);
		} catch (error) {
			this.logger.error('Error refreshing mappings:', error as Error);
		}
	}

	/**
	 * Public method to jump to a specific file
	 */	
	public async publicJumpToFile(filePath: string, methodNameOrPosition?: string | vscode.Position): Promise<void> {
		try {
			this.logger.debug(`publicJumpToFile called with: filePath=${filePath}, methodNameOrPosition=${methodNameOrPosition}`);
			
			// 如果filePath是XML文件且methodNameOrPosition是字符串（方法名）
			// 则需要跳转到对应的Java Mapper文件中的方法
			if (filePath.endsWith('.xml') && typeof methodNameOrPosition === 'string') {
				this.logger.debug("Processing XML to Java jump request");
				
				// 解析XML文件的命名空间
				const namespace = await this.parseXmlNamespace(filePath);
				if (namespace) {
					this.logger.debug(`XML namespace found: ${namespace}`);
					
					// 从命名空间中提取类名
					const className = namespace.substring(namespace.lastIndexOf(".") + 1);
					this.logger.debug(`Class name extracted: ${className}`);
					
					// 查找对应的Java文件
					const javaFilePath = await this.findJavaFileByClassName(className);
					if (javaFilePath) {
						this.logger.debug(`Java file found: ${javaFilePath}`);
						
						// 查找Java文件中方法的位置
						const position = await this.findJavaMethodPosition(javaFilePath, methodNameOrPosition);
						this.logger.debug(`Java method position found: ${position}`);
						
						// 跳转到Java文件
						await this.jumpToFile(javaFilePath, position);
						return;
					} else {
						this.logger.debug(`Java file not found for namespace: ${namespace}`);
					}
				} else {
					this.logger.debug("No namespace found in XML file");
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
					this.logger.debug(`Finding Java method position for ${methodNameOrPosition} in ${filePath}`);
					position = await this.findJavaMethodPosition(filePath, methodNameOrPosition);
					this.logger.debug(`Found Java method position: ${position}`);
				}
			} else if (methodNameOrPosition instanceof vscode.Position) {
				// 如果是位置，直接使用
				position = methodNameOrPosition;
			}
			
			// 添加调试日志
			this.logger.debug(`Jumping to file: ${filePath}, position: ${position}`);
			await this.jumpToFile(filePath, position);
		} catch (error) {
			this.logger.error('Error in publicJumpToFile:', error as Error);
		}
	}

	/**
	 * Public method to find Java file by class name
	 */	
	public async findJavaFileByClassNamePublic(className: string): Promise<string | undefined> {
		try {
			return await this.findJavaFileByClassName(className);
		} catch (error) {
			this.logger.error('Error finding Java file by class name:', error as Error);
			return undefined;
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
		const namespace = await this.parseXmlNamespace(xmlPath);
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
	 * Extract all properties from an object type, including nested properties
	 * @param type The object type to extract properties from
	 * @returns Array of property names in format "type.property"
	 */
	private async extractObjectProperties(type: string): Promise<string[]> {
		try {
			// Get Java Extension API instance
			const javaExtApi = JavaExtensionAPI.getInstance();
			if (javaExtApi.isReady) {
				this.logger.debug(`Using Java Extension API to extract properties for type: ${type}`);
				
				// Get the raw Java extension API
				const rawJavaApi = javaExtApi.getJavaExtApi();
				
				// Check if the API has the expected methods
				if (rawJavaApi && typeof rawJavaApi.classpath === 'object' && typeof rawJavaApi.classpath.findClass === 'function') {
					try {
						// Use Java extension API to find the class
						const classInfo = await rawJavaApi.classpath.findClass(type);
						if (classInfo && classInfo.fields) {
							// Extract field names from class info
							const fields = classInfo.fields.map((field: any) => field.name);
							this.logger.debug(`Found ${fields.length} fields for type ${type}: ${fields.join(', ')}`);
							return fields;
						}
					} catch (apiError) {
						this.logger.warn(`Java Extension API failed to get fields for type ${type}: ${apiError instanceof Error ? apiError.message : String(apiError)}`);
						// Fall through to file parsing if API call fails
					}
				}
			}
			
			// Fallback: Try to find and parse the Java file to extract fields
			this.logger.debug(`Falling back to file parsing for type: ${type}`);
			
			// Find the Java file for this type
			const javaFilePath = await this.findJavaFileByClassName(type);
			if (javaFilePath) {
				this.logger.debug(`Found Java file for type ${type}: ${javaFilePath}`);
				
				// Read the Java file content
				const content = await fs.readFile(javaFilePath, 'utf-8');
				
				// Extract fields from the class
				const fields: string[] = [];
				// Match class fields with various modifiers, including those with annotations
				const fieldRegex = /(?:@\w+(?:\([^)]*\))?\s*)?\s*(?:public|private|protected|static|final|transient|volatile)\s+[\w<>,\[\]\s]+\s+(\w+)\s*[=;]/g;
				let fieldMatch;
				
				while ((fieldMatch = fieldRegex.exec(content)) !== null) {
					const fieldName = fieldMatch[1].trim();
					// Skip special fields like serialVersionUID
					if (fieldName !== 'serialVersionUID') {
						fields.push(fieldName);
					}
				}
				
				this.logger.debug(`Extracted ${fields.length} fields from file for type ${type}: ${fields.join(', ')}`);
				return fields;
			}
			
			// If no Java file found, return empty array
			this.logger.debug(`No Java file found for type: ${type}`);
			return [];
		} catch (error) {
			this.logger.error(`Error extracting object properties: ${error instanceof Error ? error.message : String(error)}`);
			return [];
		}
	}

	/**
	 * Public method to extract namespace from XML file (for backward compatibility)
	 */
	public async extractNamespacePublic(xmlPath: string): Promise<string | undefined> {
		const namespace = await this.parseXmlNamespace(xmlPath);
		return namespace || undefined;
	}

	/**
	 * 将glob模式转换为正则表达式
	 * @param glob glob模式字符串
	 * @returns 转换后的正则表达式字符串
	 */
	private globToRegex(glob: string): string {
		// 直接使用字符串拼接，避免模板字符串的$&问题
		let regexStr = '^';
		
		// 遍历glob字符串的每个字符
		for (let i = 0; i < glob.length; i++) {
			const char = glob[i];
			
			// 处理${javaName}变量
			if (char === '$' && i + 1 < glob.length && glob[i + 1] === '{') {
				const endIndex = glob.indexOf('}', i + 2);
				if (endIndex !== -1) {
					const varName = glob.substring(i + 2, endIndex);
					if (varName === 'javaName') {
						regexStr += '\\$\\{javaName\\}';
						i = endIndex;
						continue;
					}
				}
			}
			
			// 转义正则特殊字符
			switch (char) {
				case '.':
				case '+':
				case '^':
				case '$':
				case '{':
				case '}':
				case '(': 
				case ')':
				case '|':
				case '[':
				case ']':
				case '\\':
				case '/':
					regexStr += '\\' + char;
					break;
				// 处理glob通配符
				case '?':
					regexStr += '.';
					break;
				case '*':
					regexStr += '.*';
					break;
				default:
					regexStr += char;
					break;
			}
		}
		
		regexStr += '$';
		return regexStr;
	}

	/**
	 * 根据自定义规则检查文件名是否匹配
	 */
	private checkNameMatchingRules(javaFileName: string, xmlFileName: string): boolean {
		const config = getPluginConfig();
		const nameMatchingRules = config.nameMatchingRules;

		// 如果没有配置规则，使用默认匹配逻辑
		if (!nameMatchingRules || nameMatchingRules.length === 0) {
			return xmlFileName === javaFileName || 
			       xmlFileName === javaFileName + 'Mapper' ||
			       xmlFileName === javaFileName + 'Dao' ||
			       javaFileName === xmlFileName + 'Mapper' ||
			       javaFileName === xmlFileName + 'Dao';
		}

		// 使用配置的规则进行匹配
		for (const rule of nameMatchingRules) {
			// 将glob模式转换为正则表达式
			const javaPattern = this.globToRegex(rule.javaPattern);
			const xmlPattern = this.globToRegex(rule.xmlPattern);
			
			const javaRegex = new RegExp(javaPattern);
			const xmlRegex = new RegExp(xmlPattern);
			
			if (javaRegex.test(javaFileName) && xmlRegex.test(xmlFileName)) {
				return true;
			}
		}

		return false;
	}

	/**
	 * 检查文件名是否匹配，忽略常见的后缀
	 */
	private checkNameWithIgnoredSuffixes(javaFileName: string, xmlFileName: string): boolean {
		const ignoredSuffixes = ['Mapper', 'Dao', 'Service', 'Impl'];
		
		// 移除Java文件名的后缀
		let strippedJavaName = javaFileName;
		for (const suffix of ignoredSuffixes) {
			if (strippedJavaName.endsWith(suffix)) {
				strippedJavaName = strippedJavaName.slice(0, -suffix.length);
				break;
			}
		}

		// 移除XML文件名的后缀
		let strippedXmlName = xmlFileName;
		for (const suffix of ignoredSuffixes) {
			if (strippedXmlName.endsWith(suffix)) {
				strippedXmlName = strippedXmlName.slice(0, -suffix.length);
				break;
			}
		}

		return strippedJavaName === strippedXmlName;
	}
}