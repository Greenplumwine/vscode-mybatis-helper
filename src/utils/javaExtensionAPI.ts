import * as vscode from 'vscode';

/**
 * Java 扩展 API 集成模块
 */
export class JavaExtensionAPI {
  private static instance: JavaExtensionAPI;
  private javaExtApi: any = null;
  private extensionContext: vscode.ExtensionContext | null = null;
  private isActivated: boolean = false;
  private logger: any; // 将在初始化时获取Logger实例

  private constructor() {}

  /**
   * 获取JavaExtensionAPI的单例实例
   * @returns JavaExtensionAPI实例
   */
  public static getInstance(): JavaExtensionAPI {
    if (!JavaExtensionAPI.instance) {
      JavaExtensionAPI.instance = new JavaExtensionAPI();
    }
    return JavaExtensionAPI.instance;
  }

  /**
   * 初始化 Java 扩展 API 连接
   * @param context VS Code扩展上下文
   */
  public async initialize(context: vscode.ExtensionContext): Promise<void> {
    this.extensionContext = context;
    
    // 延迟导入Logger，避免循环依赖
    const { Logger } = await import('./logger.js');
    this.logger = Logger.getInstance();
    
    // 尝试激活并获取 Java 扩展 API
    try {
      const javaExt = vscode.extensions.getExtension('redhat.java');
      if (javaExt) {
        this.logger.info('Found Java extension, attempting to activate...');
        
        if (!javaExt.isActive) {
          this.logger.debug('Java extension not active, activating...');
          await javaExt.activate();
        }
        
        // 检查 javaExt.exports 是否存在且不为 null
        if (javaExt.exports) {
          this.logger.debug('Java extension exports found, initializing API...');
          
          // 验证 API 是否符合预期，避免调用不存在的函数
          // Red Hat Java插件的API通常通过getAPI方法获取，版本号为1
          if (typeof javaExt.exports.getAPI === 'function') {
            this.javaExtApi = javaExt.exports.getAPI(1);
            this.isActivated = true;
            this.logger.info('Java extension API initialized successfully');
          } else {
            // 兼容旧版API
            this.javaExtApi = javaExt.exports;
            this.isActivated = true;
            this.logger.info('Java extension API initialized with legacy mode');
          }
        } else {
          this.logger.warn('Java extension exports is null or undefined');
          this.isActivated = false;
          this.javaExtApi = null;
        }
      } else {
        this.logger.warn('Java extension not found');
        this.isActivated = false;
        this.javaExtApi = null;
      }
    } catch (error) {
      this.logger.error(vscode.l10n.t('error.javaExtensionInitFailed', { error: String(error) }));
      this.isActivated = false;
      this.javaExtApi = null;
    }
  }

  /**
   * 检查 Java 扩展 API 是否已激活
   * @returns Java扩展API是否已激活
   */
  public get isReady(): boolean {
    return this.isActivated && this.javaExtApi !== null;
  }

  /**
   * 获取项目中的所有 Mapper 接口
   * @returns Mapper接口列表，包含类名和文件路径
   */
  public async getMapperInterfaces(): Promise<Array<{ className: string, filePath: string }>> {
    if (!this.isReady) {
      this.logger.warn('Java extension API not ready, cannot get Mapper interfaces');
      return [];
    }
    
    try {
      this.logger.debug('Getting Mapper interfaces...');
      
      // 使用 Java 扩展 API 获取项目中的接口信息
      // 注意：这里需要根据实际的 Java 扩展 API 进行调整
      // 目前使用基于VS Code API的实现，将来可以替换为Java扩展API
      
      // 查找所有Java文件
      const javaFiles = await vscode.workspace.findFiles('**/*.java', '**/{node_modules,.git,target,build,out}/**');
      const mapperInterfaces: Array<{ className: string, filePath: string }> = [];
      
      for (const javaFile of javaFiles) {
        try {
          const document = await vscode.workspace.openTextDocument(javaFile);
          const content = document.getText();
          
          // 检查是否是Mapper接口
          const isInterface = /interface\s+\w+/.test(content);
          const hasMyBatisAnnotation = /@Mapper|@Select|@Insert|@Update|@Delete/.test(content);
          const hasMyBatisImport = /import\s+org\.apache\.ibatis|import\s+org\.mybatis/.test(content);
          
          if (isInterface && (hasMyBatisAnnotation || hasMyBatisImport)) {
            // 提取类名
            const classNameMatch = content.match(/interface\s+(\w+)/);
            if (classNameMatch && classNameMatch[1]) {
              // 提取包名
              const packageMatch = content.match(/package\s+([^;]+);/);
              const packageName = packageMatch ? packageMatch[1] : '';
              const fullClassName = packageName ? `${packageName}.${classNameMatch[1]}` : classNameMatch[1];
              
              mapperInterfaces.push({
                className: fullClassName,
                filePath: javaFile.fsPath
              });
            }
          }
        } catch (error) {
          this.logger.error(`Error processing Java file ${javaFile.fsPath}:`, error as Error);
        }
      }
      
      this.logger.debug(`Found ${mapperInterfaces.length} Mapper interfaces`);
      return mapperInterfaces;
    } catch (error) {
      this.logger.error(vscode.l10n.t('error.mapperInterfacesFailed', { error: String(error) }));
      return [];
    }
  }

  /**
   * 通过类名查找对应的 Java 文件
   * @param className 完整类名或简单类名
   * @returns Java文件路径，如果未找到则返回undefined
   */
  public async findJavaFileByClassName(className: string): Promise<string | undefined> {
    if (!this.isReady) {
      this.logger.warn('Java extension API not ready, using fallback method to find Java file');
      return this.findJavaFileByClassNameFallback(className);
    }
    
    try {
      this.logger.debug(`Finding Java file by class name: ${className}`);
      
      // 使用 Java 扩展 API 查找文件
      // 注意：这里需要根据实际的 Java 扩展 API 进行调整
      // 目前使用基于VS Code API的实现，将来可以替换为Java扩展API
      
      // 查找所有Java文件
      const javaFiles = await vscode.workspace.findFiles('**/*.java', '**/{node_modules,.git,target,build,out}/**');
      
      // 优先匹配完整类名
      for (const javaFile of javaFiles) {
        try {
          const document = await vscode.workspace.openTextDocument(javaFile);
          const content = document.getText();
          
          // 提取包名
          const packageMatch = content.match(/package\s+([^;]+);/);
          const packageName = packageMatch ? packageMatch[1] : '';
          
          // 提取类名
          const classNameMatch = content.match(/(?:class|interface)\s+(\w+)/);
          if (classNameMatch && classNameMatch[1]) {
            const fullClassName = packageName ? `${packageName}.${classNameMatch[1]}` : classNameMatch[1];
            if (fullClassName === className) {
              this.logger.debug(`Found Java file for class ${className}: ${javaFile.fsPath}`);
              return javaFile.fsPath;
            }
          }
        } catch (error) {
          this.logger.error(`Error processing Java file ${javaFile.fsPath}:`, error as Error);
        }
      }
      
      // 如果没有找到完整类名匹配，尝试匹配简单类名
      this.logger.debug(`No exact match found for ${className}, trying simple class name`);
      const simpleClassName = className.substring(className.lastIndexOf('.') + 1);
      
      for (const javaFile of javaFiles) {
        try {
          const document = await vscode.workspace.openTextDocument(javaFile);
          const content = document.getText();
          
          // 提取类名
          const classNameMatch = content.match(/(?:class|interface)\s+(\w+)/);
          if (classNameMatch && classNameMatch[1] === simpleClassName) {
            this.logger.debug(`Found Java file for simple class name ${simpleClassName}: ${javaFile.fsPath}`);
            return javaFile.fsPath;
          }
        } catch (error) {
          this.logger.error(`Error processing Java file ${javaFile.fsPath}:`, error as Error);
        }
      }
      
      this.logger.debug(`No Java file found for class: ${className}`);
      return undefined;
    } catch (error) {
      this.logger.error(vscode.l10n.t('error.javaFileNotFound', { className, error: String(error) }));
      return undefined;
    }
  }

  /**
   * 降级方法：通过类名查找对应的 Java 文件（当Java扩展API不可用时）
   * @param className 完整类名或简单类名
   * @returns Java文件路径，如果未找到则返回undefined
   */
  private async findJavaFileByClassNameFallback(className: string): Promise<string | undefined> {
    try {
      this.logger.debug(`Using fallback method to find Java file for class: ${className}`);
      
      // 查找所有Java文件
      const javaFiles = await vscode.workspace.findFiles('**/*.java', '**/{node_modules,.git,target,build,out}/**');
      
      // 优先匹配完整类名
      for (const javaFile of javaFiles) {
        try {
          const document = await vscode.workspace.openTextDocument(javaFile);
          const content = document.getText();
          
          // 提取包名
          const packageMatch = content.match(/package\s+([^;]+);/);
          const packageName = packageMatch ? packageMatch[1] : '';
          
          // 提取类名
          const classNameMatch = content.match(/(?:class|interface)\s+(\w+)/);
          if (classNameMatch && classNameMatch[1]) {
            const fullClassName = packageName ? `${packageName}.${classNameMatch[1]}` : classNameMatch[1];
            if (fullClassName === className) {
              this.logger.debug(`Found Java file for class ${className}: ${javaFile.fsPath}`);
              return javaFile.fsPath;
            }
          }
        } catch (error) {
          this.logger.error(`Error processing Java file ${javaFile.fsPath}:`, error as Error);
        }
      }
      
      // 如果没有找到完整类名匹配，尝试匹配简单类名
      const simpleClassName = className.substring(className.lastIndexOf('.') + 1);
      
      for (const javaFile of javaFiles) {
        try {
          const document = await vscode.workspace.openTextDocument(javaFile);
          const content = document.getText();
          
          // 提取类名
          const classNameMatch = content.match(/(?:class|interface)\s+(\w+)/);
          if (classNameMatch && classNameMatch[1] === simpleClassName) {
            this.logger.debug(`Found Java file for simple class name ${simpleClassName}: ${javaFile.fsPath}`);
            return javaFile.fsPath;
          }
        } catch (error) {
          this.logger.error(`Error processing Java file ${javaFile.fsPath}:`, error as Error);
        }
      }
      
      this.logger.debug(`No Java file found for class: ${className}`);
      return undefined;
    } catch (error) {
      this.logger.error(`Error in fallback method for finding Java file:`, error as Error);
      return undefined;
    }
  }

  /**
   * 获取类的资源路径
   * @param className 完整类名
   * @returns 资源路径，如果未找到则返回undefined
   */
  public async getResourcePathForClass(className: string): Promise<string | undefined> {
    if (!this.isReady) {
      this.logger.warn('Java extension API not ready, cannot get resource path');
      return undefined;
    }
    
    try {
      this.logger.debug(`Getting resource path for class: ${className}`);
      
      // 使用 Java 扩展 API 获取资源路径
      // 注意：这里需要根据实际的 Java 扩展 API 进行调整
      // 目前使用基于VS Code API的实现，将来可以替换为Java扩展API
      
      // 查找对应的Java文件
      const javaFilePath = await this.findJavaFileByClassName(className);
      if (javaFilePath) {
        // 替换Java目录为resources目录
        const resourcePath = javaFilePath
          .replace(new RegExp('src\\\\main\\\\java', 'g'), 'src\\main\\resources')
          .replace(new RegExp('src/main/java', 'g'), 'src/main/resources')
          .replace(new RegExp('\\.java$', 'g'), '');
        
        this.logger.debug(`Resource path for class ${className}: ${resourcePath}`);
        return resourcePath;
      }
      
      this.logger.debug(`No resource path found for class: ${className}`);
      return undefined;
    } catch (error) {
      this.logger.error(vscode.l10n.t('error.resourcePathFailed', { className, error: String(error) }));
      return undefined;
    }
  }
  
  /**
   * 导航到指定Java文件的特定方法
   * @param javaFilePath Java文件路径
   * @param methodName 方法名
   * @returns 是否成功导航
   */
  public async navigateToMethod(javaFilePath: string, methodName: string): Promise<boolean> {
    if (!this.isReady) {
      this.logger.warn('Java extension API not ready, cannot navigate to method');
      return false;
    }
    
    try {
      this.logger.debug(`Navigating to method ${methodName} in ${javaFilePath} using Java Extension API`);
      
      // 使用 Java 扩展 API 导航到方法
      // 注意：这里需要根据实际的 Java 扩展 API 进行调整
      // 目前使用基于VS Code API的实现，将来可以替换为Java扩展API
      
      // 打开Java文件
      const uri = vscode.Uri.file(javaFilePath);
      const document = await vscode.workspace.openTextDocument(uri);
      const editor = await vscode.window.showTextDocument(document);
      
      // 查找方法位置
      const content = document.getText();
      const methodRegex = new RegExp(
        `(?:public|private|protected|default|static|final|abstract)\\s+.*\\s+${methodName}\\s*\\([^)]*\\)`,
        'g'
      );
      
      let match;
      while ((match = methodRegex.exec(content)) !== null) {
        const position = document.positionAt(match.index);
        
        // 设置光标位置并显示
        editor.selection = new vscode.Selection(position, position);
        editor.revealRange(new vscode.Range(position, position), vscode.TextEditorRevealType.AtTop);
        
        this.logger.debug(`Successfully navigated to method ${methodName} in ${javaFilePath}`);
        return true;
      }
      
      this.logger.debug(`Method ${methodName} not found in ${javaFilePath}`);
      return false;
    } catch (error) {
      this.logger.error(vscode.l10n.t('error.navigateToMethodFailed', { methodName, error: String(error) }));
      return false;
    }
  }

  /**
   * 获取Java扩展API实例
   * @returns Java扩展API实例
   */
  public getJavaExtApi(): any {
    return this.javaExtApi;
  }
}