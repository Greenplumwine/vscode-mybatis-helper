import * as vscode from "vscode";
import * as path from "path";
import * as fs from "fs/promises"; // Use Promise version of fs module

// File mapping cache interface
export interface FileMapping {
	mapperPath: string;
	xmlPath: string;
	lastUpdated: Date;
}

// File mapper class
export class FileMapper {
	private mappings: Map<string, string> = new Map(); // key: mapperPath, value: xmlPath
	private reverseMappings: Map<string, string> = new Map(); // key: xmlPath, value: mapperPath
	private lastScanned: Date | null = null;
	private isScanning: boolean = false;
	private scanInterval: NodeJS.Timeout | null = null;
	private readonly scanTimeoutMs = 3000; // Scanning timeout
	private lastScanRequestTime: Date | null = null; // Last time scan was requested
	private scanTimeoutId: NodeJS.Timeout | null = null; // Timeout ID for scan
	private fileWatcher: vscode.FileSystemWatcher | null = null; // File system watcher
	private lastJumpTime: Map<string, number> = new Map(); // 用于节流机制，记录每种跳转类型的最后执行时间
	private readonly jumpThrottleMs = 1000; // 跳转操作的节流时间（毫秒）

	constructor() {
		// Initialize file scanning interval
		this.scanInterval = setInterval(() => {
			this.scheduleScan();
		}, 60000); // Scan every 60 seconds (increased from 30s to reduce load)

		// Initial scan
		this.scheduleScan();

		// Add event listeners for file changes to handle incremental updates
		this.setupFileWatchers();
	}

	/**
	 * Setup file watchers to handle incremental updates
	 */
	private setupFileWatchers(): void {
		try {
			// Watch for changes in Java and XML files
			this.fileWatcher = vscode.workspace.createFileSystemWatcher(
				"**/*.{java,xml}",
				false, // ignoreCreateEvents
				true, // ignoreChangeEvents
				true // ignoreDeleteEvents
			);

			this.fileWatcher.onDidCreate((uri) => {
				// Only trigger a scan if file is in the workspace
				if (this.isFileInWorkspace(uri.fsPath)) {
					this.scheduleScan();
				}
			});

			this.fileWatcher.onDidDelete((uri) => {
				// Remove deleted file from mappings
				if (uri.fsPath.endsWith(".java")) {
					const xmlPath = this.mappings.get(uri.fsPath);
					if (xmlPath) {
						this.mappings.delete(uri.fsPath);
						this.reverseMappings.delete(xmlPath);
					}
				} else if (uri.fsPath.endsWith(".xml")) {
					const mapperPath = this.reverseMappings.get(uri.fsPath);
					if (mapperPath) {
						this.reverseMappings.delete(uri.fsPath);
						this.mappings.delete(mapperPath);
					}
				}
			});

			// Store the watcher in the extension context for proper disposal
			// This will be handled by the dispose method in extension.ts
		} catch (error) {
			console.error("Error setting up file watchers:", error);
		}
	}

	/**
	 * Check if a file is within the workspace
	 */
	private isFileInWorkspace(filePath: string): boolean {
		const workspaceFolders = vscode.workspace.workspaceFolders;
		if (!workspaceFolders) {
			return false;
		}

		return workspaceFolders.some((folder) =>
			filePath.startsWith(folder.uri.fsPath)
		);
	}

	/**
	 * Schedule a scan with throttling to prevent excessive scanning
	 */
	private scheduleScan(): void {
		const now = new Date();

		// Throttle scans to at least every 5 seconds
		if (
			this.lastScanRequestTime &&
			now.getTime() - this.lastScanRequestTime.getTime() < 5000
		) {
			return;
		}

		this.lastScanRequestTime = now;

		// If a scan is already in progress, do nothing
		if (this.isScanning) {
			return;
		}

		// Start the scan
		this.scanFolder().catch((err) => {
			console.error("Error during scheduled scan:", err);
		});
	}

	/**
	 * Scan current workspace folder
	 */
	private async scanFolder(): Promise<void> {
		if (this.isScanning) {
			return;
		}

		this.isScanning = true;

		// Set up timeout to prevent hanging scans
		this.scanTimeoutId = setTimeout(() => {
			console.warn("File scanning timed out, cleaning up...");
			this.isScanning = false;
			this.scanTimeoutId = null;
		}, this.scanTimeoutMs * 10); // 10 times the scan timeout ms

		try {
			const workspaceFolders = vscode.workspace.workspaceFolders;
			if (!workspaceFolders || workspaceFolders.length === 0) {
				vscode.window.showWarningMessage(
					vscode.l10n.t("fileMapper.noJavaProject")
				);
				return;
			}

			// Clear existing mappings
			this.mappings.clear();
			this.reverseMappings.clear();

			console.log("Starting file system scan...");
			const startTime = Date.now();

			// Scan all Java and XML files with parallelization limit to reduce load
			const promises: Promise<void>[] = [];
			const maxConcurrentScans = Math.min(workspaceFolders.length, 2); // Limit concurrent scans
			const scanBatches: string[][] = [];

			// Split folders into batches
			for (let i = 0; i < workspaceFolders.length; i += maxConcurrentScans) {
				const batch = workspaceFolders
					.slice(i, i + maxConcurrentScans)
					.map((folder) => folder.uri.fsPath);
				scanBatches.push(batch);
			}

			// Process batches sequentially
			for (const batch of scanBatches) {
				const batchPromises = batch.map((folderPath) =>
					this.findFiles(folderPath)
				);
				await Promise.all(batchPromises);
			}

			this.lastScanned = new Date();
			const endTime = Date.now();
			console.log(`File system scan completed in ${endTime - startTime}ms`);
		} catch (error) {
			console.error("Error scanning folder:", error);
			// Only show error message if it's not a timeout (we already logged that)
			if (!(error instanceof Error && error.message.includes("timeout"))) {
				vscode.window.showErrorMessage(
					vscode.l10n.t("fileMapper.refreshFailed")
				);
			}
		} finally {
			// Clear timeout and reset scanning flag
			if (this.scanTimeoutId) {
				clearTimeout(this.scanTimeoutId);
				this.scanTimeoutId = null;
			}
			this.isScanning = false;
		}
	}

	/**
	 * Find Java and XML files in a folder
	 */
	private async findFiles(folderPath: string): Promise<void> {
		try {
			// Find all Java files - exclude target directory
			const javaFiles = await vscode.workspace.findFiles(
				new vscode.RelativePattern(folderPath, "**/*.java"),
				"**/target/**"
			);
			// Find all XML files - exclude target directory
			const xmlFiles = await vscode.workspace.findFiles(
				new vscode.RelativePattern(folderPath, "**/*.xml"),
				"**/target/**"
			);

			// Create mappings between Mapper interfaces and XML files
			for (const javaFile of javaFiles) {
				const javaFilePath = javaFile.fsPath;
				if (await this.isMapperInterface(javaFilePath)) {
					const xmlPath = await this.findXmlForMapper(javaFilePath, xmlFiles);
					if (xmlPath) {
						this.mappings.set(javaFilePath, xmlPath);
						this.reverseMappings.set(xmlPath, javaFilePath);
					}
				}
			}
		} catch (error) {
			console.error("Error finding files:", error);
		}
	}

	/**
	 * Check if a Java file is a Mapper interface
	 */
	private async isMapperInterface(javaFilePath: string): Promise<boolean> {
		try {
			// Read file content
			const content = await fs.readFile(javaFilePath, "utf-8");
			// Check if it's an interface and has MyBatis annotations or imports
			const isInterface = /interface\s+\w+/.test(content);
			const hasMyBatisAnnotation =
				/@Mapper|@Select|@Insert|@Update|@Delete/.test(content);
			const hasMyBatisImport =
				/import\s+org\.apache\.ibatis|import\s+org\.mybatis/.test(content);

			return isInterface && (hasMyBatisAnnotation || hasMyBatisImport);
		} catch (error) {
			console.error("Error checking Mapper interface:", error);
			return false;
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
			// Get class name from file path
			const fileName = path.basename(javaFilePath, ".java");

			// Priority 1: Check XML files in mapper/mappers directories first
			const mapperDirXmlFiles = xmlFiles.filter(
				(xmlFile) =>
					xmlFile.fsPath.includes("/mapper/") ||
					xmlFile.fsPath.includes("/mappers/")
			);

			// Try to find in mapper/mappers directories first
			for (const xmlFile of mapperDirXmlFiles) {
				const xmlFileName = path.basename(xmlFile.fsPath, ".xml");
				if (xmlFileName === fileName || xmlFileName === fileName + "Mapper") {
					// Further verification by checking namespace
					const namespace = await this.getXmlNamespace(xmlFile.fsPath);
					if (namespace) {
						const javaPackage = await this.getJavaPackage(javaFilePath);
						if (javaPackage && namespace === javaPackage + "." + fileName) {
							return xmlFile.fsPath;
						}
					} else {
						// If namespace cannot be read, use file name match as fallback
						return xmlFile.fsPath;
					}
				}
			}

			// Priority 2: Check other directories if not found in mapper/mappers
			for (const xmlFile of xmlFiles) {
				// Skip files already checked in mapper/mappers directories
				if (
					xmlFile.fsPath.includes("/mapper/") ||
					xmlFile.fsPath.includes("/mappers/")
				) {
					continue;
				}

				const xmlFileName = path.basename(xmlFile.fsPath, ".xml");
				if (xmlFileName === fileName || xmlFileName === fileName + "Mapper") {
					// Further verification by checking namespace
					const namespace = await this.getXmlNamespace(xmlFile.fsPath);
					if (namespace) {
						const javaPackage = await this.getJavaPackage(javaFilePath);
						if (javaPackage && namespace === javaPackage + "." + fileName) {
							return xmlFile.fsPath;
						}
					} else {
						// If namespace cannot be read, use file name match as fallback
						return xmlFile.fsPath;
					}
				}
			}
		} catch (error) {
			console.error("Error finding XML for Mapper:", error);
		}
		return undefined;
	}

	/**
	 * Get Java package name
	 */
	private async getJavaPackage(javaFilePath: string): Promise<string | null> {
		try {
			const content = await fs.readFile(javaFilePath, "utf-8");
			const packageMatch = content.match(/package\s+([\w\.]+);/);
			return packageMatch ? packageMatch[1] : null;
		} catch (error) {
			console.error("Error getting Java package:", error);
			return null;
		}
	}

	/**
	 * Get XML namespace
	 */
	private async getXmlNamespace(xmlFilePath: string): Promise<string | null> {
		try {
			const content = await fs.readFile(xmlFilePath, "utf-8");
			const namespaceMatch = content.match(/namespace="([^"]+)"/);
			return namespaceMatch ? namespaceMatch[1] : null;
		} catch (error) {
			console.error("Error getting XML namespace:", error);
			return null;
		}
	}

	/**
	 * Get possible XML file paths for a given Java file
	 */
	public async getPossibleXmlPaths(javaFilePath: string): Promise<string[]> {
		try {
			const fileName = path.basename(javaFilePath, ".java");
			const dirName = path.dirname(javaFilePath);

			// Possible XML file paths
			const possiblePaths: string[] = [];

			// Path in the same directory
			possiblePaths.push(path.join(dirName, fileName + ".xml"));
			possiblePaths.push(path.join(dirName, fileName + "Mapper.xml"));

			// Path in resources directory
			const workspaceFolders = vscode.workspace.workspaceFolders;
			if (workspaceFolders && workspaceFolders.length > 0) {
				const workspacePath = workspaceFolders[0].uri.fsPath;
				const javaPackage = await this.getJavaPackage(javaFilePath);
				if (javaPackage) {
					const packagePath = javaPackage.replace(/\./g, "/");

					// Common resource locations
					const resourceLocations = [
						"src/main/resources",
						"src/test/resources",
					];

					for (const location of resourceLocations) {
						possiblePaths.push(
							path.join(workspacePath, location, packagePath, fileName + ".xml")
						);
						possiblePaths.push(
							path.join(
								workspacePath,
								location,
								packagePath,
								fileName + "Mapper.xml"
							)
						);
						possiblePaths.push(
							path.join(workspacePath, location, fileName + ".xml")
						);
						possiblePaths.push(
							path.join(workspacePath, location, fileName + "Mapper.xml")
						);
					}
				}
			}

			// Filter out non-existent files
			const existingPaths: string[] = [];
			for (const path of possiblePaths) {
				try {
					await fs.access(path);
					existingPaths.push(path);
				} catch {
					// File doesn't exist, skip
				}
			}

			return existingPaths;
		} catch (error) {
			console.error("Error getting possible XML paths:", error);
			return [];
		}
	}

	/**
	 * Find Java file by class name
	 */
	public async findJavaFileByClassName(
		className: string
	): Promise<string | null> {
		try {
			// Find all Java files with matching class name
			const javaFiles = await vscode.workspace.findFiles(
				`**/${className}.java`
			);
			if (javaFiles.length > 0) {
				return javaFiles[0].fsPath;
			}
			return null;
		} catch (error) {
			console.error("Error finding Java file by class name:", error);
			return null;
		}
	}

	/**
	 * Search XML file by namespace
	 */
	public async searchXmlByNamespace(namespace: string): Promise<string | null> {
		try {
			// Find all XML files - exclude target directory
			const xmlFiles = await vscode.workspace.findFiles(
				"**/*.xml",
				"**/target/**"
			);

			// Priority 1: Check XML files in mapper/mappers directories first
			const mapperDirXmlFiles = xmlFiles.filter(
				(xmlFile) =>
					xmlFile.fsPath.includes("/mapper/") ||
					xmlFile.fsPath.includes("/mappers/")
			);

			for (const xmlFile of mapperDirXmlFiles) {
				const fileNamespace = await this.getXmlNamespace(xmlFile.fsPath);
				if (fileNamespace === namespace) {
					return xmlFile.fsPath;
				}
			}

			// Priority 2: Check other directories if not found in mapper/mappers
			for (const xmlFile of xmlFiles) {
				if (
					xmlFile.fsPath.includes("/mapper/") ||
					xmlFile.fsPath.includes("/mappers/")
				) {
					continue;
				}
				const fileNamespace = await this.getXmlNamespace(xmlFile.fsPath);
				if (fileNamespace === namespace) {
					return xmlFile.fsPath;
				}
			}

			return null;
		} catch (error) {
			console.error("Error searching XML by namespace:", error);
			return null;
		}
	}

	/**
	 * Check if jump action should be throttled
	 */
	private shouldThrottleJump(jumpType: string): boolean {
		const now = Date.now();
		const lastTime = this.lastJumpTime.get(jumpType) || 0;
		const shouldThrottle = now - lastTime < this.jumpThrottleMs;
		if (!shouldThrottle) {
			this.lastJumpTime.set(jumpType, now);
		}
		return shouldThrottle;
	}

	/**
	 * Extract method name from current cursor position in editor
	 */
	private extractMethodName(editor: vscode.TextEditor): string | null {
		try {
			const document = editor.document;
			const position = editor.selection.active;
			let lineNumber = position.line;

			// Search upwards for method definition (search up to 50 lines back)
			const maxSearchLines = 50;
			const searchEndLine = Math.max(0, lineNumber - maxSearchLines);

			while (lineNumber >= searchEndLine) {
				const line = document.lineAt(lineNumber).text.trim();

				// For Java files - look for method signatures with more robust pattern
				if (document.languageId === "java") {
					// First try to match complete method signature
					let methodMatch = line.match(
						/^(public|private|protected|default)?\s*(static\s+)?[\w<>,\[\]]+\s+(\w+)\s*\([^)]*\)\s*(throws\s+[\w.]+(,\s*[\w.]+)*)?\s*(\{|\{?\s*\/\*.*\*\/|\{?\s*\/\/.*)$/
					);
					if (methodMatch && methodMatch[3]) {
						return methodMatch[3];
					}
					// Fallback to simpler pattern for cases with annotations or complex signatures
					methodMatch = line.match(
						/\s*(\w+)\s*\([^)]*\)\s*(\{|\{?\s*\/\*.*\*\/|\{?\s*\/\/.*)$/
					);
					if (methodMatch && methodMatch[1]) {
						return methodMatch[1];
					}
				}
				// For XML files - look for select/update/insert/delete tags with id
				else if (document.languageId === "xml") {
					// Look for XML tags with id attribute
					const tagMatch = line.match(
						/<(select|update|insert|delete)\s+[^>]*id="([^"]+)"/i
					);
					if (tagMatch && tagMatch[2]) {
						return tagMatch[2];
					}
					// Also look for closing tags in case cursor is near the end
					const closingTagMatch = line.match(
						/<\/(select|update|insert|delete)\s+[^>]*id="([^"]+)"/i
					);
					if (closingTagMatch && closingTagMatch[2]) {
						return closingTagMatch[2];
					}
				}
				lineNumber--;
			}
			console.log("No method name found at cursor position");
			return null;
		} catch (error) {
			console.error("Error extracting method name:", error);
			return null;
		}
	}

	/**
	 * Find position of method in target file
	 */
	private async findMethodPosition(
		filePath: string,
		methodName: string
	): Promise<vscode.Position | null> {
		try {
			const document = await vscode.workspace.openTextDocument(filePath);
			const content = document.getText();
			const fileExt = path.extname(filePath).toLowerCase();

			if (fileExt === ".java") {
				// For Java files - look for method signatures with more robust pattern
				// First try with complete method signature pattern
				let methodRegex = new RegExp(
					`^(public|private|protected|default)?\s*(static\s+)?[\w<>,\[\]]+\s+${methodName}\s*\([^)]*\)\s*(throws\s+[\w.]+(,\s*[\w.]+)*)?\s*(\{|\{?\s*\/\*.*\*\/|\{?\s*\/\/.*)$`,
					"gm"
				);
				let match = methodRegex.exec(content);

				if (match) {
					const line = document.positionAt(match.index).line;
					return new vscode.Position(line, 0);
				}

				// Fallback to simpler pattern for cases with annotations or complex signatures
				methodRegex = new RegExp(
					`\s*${methodName}\s*\([^)]*\)\s*(\{|\{?\s*\/\*.*\*\/|\{?\s*\/\/.*)$`,
					"gm"
				);
				match = methodRegex.exec(content);
				if (match) {
					const line = document.positionAt(match.index).line;
					return new vscode.Position(line, 0);
				}
			} else if (fileExt === ".xml") {
				// For XML files - look for select/update/insert/delete tags with matching id
				// Try different patterns to find XML tags with matching id
				let tagRegex = new RegExp(
					`<(select|update|insert|delete)\s+[^>]*id="${methodName}"`,
					"gmi"
				);
				let match = tagRegex.exec(content);

				if (match) {
					const line = document.positionAt(match.index).line;
					return new vscode.Position(line, 0);
				}

				// Try with spaces and other attributes
				tagRegex = new RegExp(
					`<(select|update|insert|delete)\s+([^>]*\s+)?id="${methodName}"`,
					"gmi"
				);
				match = tagRegex.exec(content);
				if (match) {
					const line = document.positionAt(match.index).line;
					return new vscode.Position(line, 0);
				}
			}
			console.log(`Method ${methodName} not found in ${filePath}`);
			return null;
		} catch (error) {
			console.error(
				`Error finding method position for ${methodName} in ${filePath}:`,
				error
			);
			return null;
		}
	}

	/**
	 * Jump to specified file with optional position
	 */
	public async jumpToFile(
		filePath: string,
		position?: vscode.Position
	): Promise<void> {
		try {
			// Check if file exists
			try {
				await fs.access(filePath);
			} catch {
				vscode.window.showErrorMessage(
					vscode.l10n.t("fileMapper.cannotOpenFile", { path: filePath })
				);
				return;
			}

			// Open file in VSCode
			const document = await vscode.workspace.openTextDocument(filePath);
			const editor = await vscode.window.showTextDocument(
				document,
				vscode.ViewColumn.Beside
			);

			// If position is specified, move cursor to that position
			if (position) {
				editor.selection = new vscode.Selection(position, position);
				editor.revealRange(
					new vscode.Range(position, position),
					vscode.TextEditorRevealType.AtTop
				);
			}
		} catch (error) {
			console.error("Error opening file:", error);
			vscode.window.showErrorMessage(
				vscode.l10n.t("fileMapper.cannotOpenFile", { path: filePath })
			);
		}
	}

	/**
	 * Jump to XML file corresponding to current Java file
	 */
	public async jumpToXml(): Promise<void> {
		// Throttle jump requests
		if (this.shouldThrottleJump("xml")) {
			return;
		}

		try {
			const editor = vscode.window.activeTextEditor;
			if (!editor) {
				vscode.window.showErrorMessage(vscode.l10n.t("fileMapper.noFileOpen"));
				return;
			}

			const javaFilePath = editor.document.uri.fsPath;

			// Check if file is a Java file
			if (!javaFilePath.endsWith(".java")) {
				vscode.window.showWarningMessage(
					vscode.l10n.t("fileMapper.notJavaFile")
				);
				return;
			}

			// Step 1: First check cache (do this before any potentially slow operations)
			let xmlPath = this.mappings.get(javaFilePath);

			// Step 2: Extract method name (do this after cache check but before file operations)
			const methodName = this.extractMethodName(editor);

			// Step 3: If not found in cache, try to find the specific file directly
			// without performing a full folder scan
			if (!xmlPath) {
				// Show information message for searching ONLY when performing file lookup
				const searchingMessage = vscode.window.showInformationMessage(
					vscode.l10n.t("status.searchingXml"),
					{ modal: false }
				);

				try {
					// Try to find possible XML paths for this specific file only
					const possibleXmlPaths = await this.getPossibleXmlPaths(javaFilePath);
					if (possibleXmlPaths.length > 0) {
						xmlPath = possibleXmlPaths[0];
						// Add to cache for future use
						this.mappings.set(javaFilePath, xmlPath);
						this.reverseMappings.set(xmlPath, javaFilePath);
					}
				} finally {
					// No need to dispose information messages, they will auto-dismiss
				}
			}

			if (xmlPath) {
				let targetPosition: vscode.Position | undefined;

				// If method name is found, try to find corresponding method in XML
				if (methodName) {
					const position = await this.findMethodPosition(xmlPath, methodName);
					if (position) {
						targetPosition = position;
					}
				}

				// Jump to file directly without additional messages when using cache
				await this.jumpToFile(xmlPath, targetPosition);
				vscode.window.showInformationMessage(
					vscode.l10n.t("status.xmlFileOpened"),
					{ modal: false }
				);
			} else {
				vscode.window.showErrorMessage(vscode.l10n.t("fileMapper.noXmlFile"));
			}
		} catch (error) {
			console.error("Error jumping to XML:", error);
			vscode.window.showErrorMessage(vscode.l10n.t("fileMapper.jumpFailed"));
		}
	}

	/**
	 * Jump to Mapper Java file corresponding to current XML file
	 */
	public async jumpToMapper(): Promise<void> {
		// Throttle jump requests
		if (this.shouldThrottleJump("mapper")) {
			return;
		}

		try {
			const editor = vscode.window.activeTextEditor;
			if (!editor) {
				vscode.window.showErrorMessage(vscode.l10n.t("fileMapper.noFileOpen"));
				return;
			}

			const xmlFilePath = editor.document.uri.fsPath;

			// Check if file is an XML file
			if (!xmlFilePath.endsWith(".xml")) {
				vscode.window.showWarningMessage(
					vscode.l10n.t("fileMapper.notXmlFile")
				);
				return;
			}

			// Step 1: First check cache (do this before any potentially slow operations)
			let mapperPath: string | null | undefined = this.reverseMappings.get(xmlFilePath);

			// Step 2: Extract method name (do this after cache check but before file operations)
			const methodName = this.extractMethodName(editor);

			// Step 3: If not found in cache, try to find the specific file directly
			// without performing a full folder scan
			if (!mapperPath) {
				// Show information message for searching ONLY when performing file lookup
				const searchingMessage = vscode.window.showInformationMessage(
					vscode.l10n.t("status.searchingMapper"),
					{ modal: false }
				);

				try {
					// Try to extract namespace and find by class name for this specific file only
					const namespace = await this.extractNamespace(xmlFilePath);
					if (namespace) {
						const className = namespace.substring(
							namespace.lastIndexOf(".") + 1
						);
						mapperPath = await this.findJavaFileByClassName(className);
						// Add to cache for future use
						if (mapperPath) {
							this.mappings.set(mapperPath, xmlFilePath);
							this.reverseMappings.set(xmlFilePath, mapperPath);
						}
					}
				} finally {
					// No need to dispose information messages, they will auto-dismiss
				}
			}

			if (mapperPath) {
				let targetPosition: vscode.Position | undefined;

				// If method name is found, try to find corresponding method in Java
				if (methodName) {
					const position = await this.findMethodPosition(
						mapperPath,
						methodName
					);
					if (position) {
						targetPosition = position;
					}
				}

				// Jump to file directly without additional messages when using cache
				await this.jumpToFile(mapperPath, targetPosition);
				vscode.window.showInformationMessage(
					vscode.l10n.t("status.mapperFileOpened"),
					{ modal: false }
				);
			} else {
				vscode.window.showErrorMessage(
					vscode.l10n.t("fileMapper.noMapperInterface")
				);
			}
		} catch (error) {
			console.error("Error jumping to Mapper:", error);
			vscode.window.showErrorMessage(vscode.l10n.t("fileMapper.jumpFailed"));
		}
	}

	/**
	 * Extract namespace from XML file
	 */
	public async extractNamespace(xmlFilePath: string): Promise<string | null> {
		try {
			// Read XML file content
			const content = await fs.readFile(xmlFilePath, "utf-8");
			// Extract namespace attribute from mapper tag
			const namespaceMatch = content.match(
				/<mapper\s+[^>]*namespace="([^"]+)"/i
			);

			return namespaceMatch ? namespaceMatch[1] : null;
		} catch (error) {
			console.error("Error extracting namespace:", error);
			return null;
		}
	}

	/**
	 * Get file mapping information
	 */
	public getMappings(): FileMapping[] {
		const result: FileMapping[] = [];

		this.mappings.forEach((xmlPath, mapperPath) => {
			result.push({
				mapperPath,
				xmlPath,
				lastUpdated: this.lastScanned || new Date(),
			});
		});

		return result;
	}

	/**
	 * Refresh file mappings
	 */
	public async refreshMappings(): Promise<void> {
		await this.scanFolder();
	}

	/**
	 * Dispose resources
	 */
	public dispose(): void {
		// Clear the scan interval
		if (this.scanInterval) {
			clearInterval(this.scanInterval);
			this.scanInterval = null;
		}

		// Clear any pending timeout
		if (this.scanTimeoutId) {
			clearTimeout(this.scanTimeoutId);
			this.scanTimeoutId = null;
		}

		// Dispose file watcher
		if (this.fileWatcher) {
			this.fileWatcher.dispose();
			this.fileWatcher = null;
		}

		// Clear mappings to free up memory
		this.mappings.clear();
		this.reverseMappings.clear();
	}
}
