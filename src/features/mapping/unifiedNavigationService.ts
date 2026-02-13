/**
 * 统一导航服务
 * 
 * 兼容 FastScanner 和 EnterpriseScanner
 * 提供更智能的导航回退策略
 */

import * as vscode from 'vscode';
import { FastMappingEngine } from './fastMappingEngine';
import { MyBatisXmlParser } from './xmlParser';
import { MapperMapping, MethodMapping } from './types';

interface NavigationOptions {
  openSideBySide?: boolean;
  revealType?: vscode.TextEditorRevealType;
}

const DEFAULT_OPTIONS: NavigationOptions = {
  revealType: vscode.TextEditorRevealType.InCenter
};

export class UnifiedNavigationService {
  private static instance: UnifiedNavigationService;
  private mappingEngine: FastMappingEngine;
  private logger: any;
  private xmlParser: MyBatisXmlParser;

  private constructor() {
    this.mappingEngine = FastMappingEngine.getInstance();
    this.xmlParser = MyBatisXmlParser.getInstance();
  }

  public static getInstance(): UnifiedNavigationService {
    if (!UnifiedNavigationService.instance) {
      UnifiedNavigationService.instance = new UnifiedNavigationService();
    }
    return UnifiedNavigationService.instance;
  }

  public async initialize(): Promise<void> {
    const { Logger } = await import('../../utils/logger.js');
    this.logger = Logger.getInstance();
    await this.xmlParser.initialize();
  }

  // ========== Java → XML 导航 ==========

  public async navigateJavaToXml(
    javaPath: string, 
    methodName?: string,
    options: NavigationOptions = DEFAULT_OPTIONS
  ): Promise<boolean> {
    const startTime = Date.now();
    this.logger?.debug(`[Navigate] Java→XML: ${javaPath}, method: ${methodName}`);

    try {
      // 1. 索引查找
      let mapping = this.mappingEngine.getByJavaPath(javaPath);
      
      this.logger?.debug(`[Navigate] Mapping found: ${mapping ? 'yes' : 'no'}, xmlPath: ${mapping?.xmlPath || 'none'}`);

      // 2. 如果没有映射，尝试动态解析 Java 文件
      if (!mapping) {
        this.logger?.info(`[Navigate] No mapping found for ${javaPath}, trying dynamic parse...`);
        mapping = await this.parseAndMapJavaFile(javaPath) ?? undefined;
      }

      if (!mapping) {
        vscode.window.showWarningMessage(vscode.l10n.t("warning.notMyBatisMapper"));
        return false;
      }

      // 3. 如果没有 XML 路径，尝试通过 namespace 查找
      if (!mapping.xmlPath) {
        this.logger?.info(`[Navigate] No XML path in mapping, searching by namespace: ${mapping.namespace}`);
        const xmlPath = await this.findXmlByNamespace(mapping.namespace);
        
        if (xmlPath) {
          this.logger?.info(`[Navigate] Found XML: ${xmlPath}`);
          this.mappingEngine.updateXmlPath(javaPath, xmlPath);
          mapping = this.mappingEngine.getByJavaPath(javaPath)!;
        } else {
          this.logger?.warn(`[Navigate] XML not found for namespace: ${mapping.namespace}`);
          vscode.window.showWarningMessage(vscode.l10n.t("fileMapper.noXmlFile"));
          return false;
        }
      }

      // 4. 验证 XML 文件是否存在
      try {
        await vscode.workspace.fs.stat(vscode.Uri.file(mapping.xmlPath!));
      } catch (e) {
        this.logger?.warn(`[Navigate] XML file not found: ${mapping.xmlPath}`);
        // 尝试重新查找
        const xmlPath = await this.findXmlByNamespace(mapping.namespace);
        if (xmlPath && xmlPath !== mapping.xmlPath) {
          this.mappingEngine.updateXmlPath(javaPath, xmlPath);
          mapping.xmlPath = xmlPath;
        } else {
          vscode.window.showWarningMessage(vscode.l10n.t("error.xmlNotFound"));
          return false;
        }
      }

      // 5. 执行跳转
      const targetPosition = methodName 
        ? this.findMethodPositionInXml(mapping, methodName)
        : undefined;

      await this.openAndReveal(mapping.xmlPath!, targetPosition, options);

      this.logger?.debug(`[Navigate] Java→XML completed in ${Date.now() - startTime}ms`);
      return true;

    } catch (error) {
      this.logger?.error('[Navigate] Java→XML navigation failed:', error as Error);
      vscode.window.showErrorMessage(vscode.l10n.t("error.navigationFailed"));
      return false;
    }
  }

  // ========== XML → Java 导航 ==========

  public async navigateXmlToJava(
    xmlPath: string,
    sqlId?: string,
    options: NavigationOptions = DEFAULT_OPTIONS
  ): Promise<boolean> {
    const startTime = Date.now();
    this.logger?.debug(`[Navigate] XML→Java: ${xmlPath}, sqlId: ${sqlId}`);

    try {
      // 1. 索引查找
      let mapping = this.mappingEngine.getByXmlPath(xmlPath);
      
      this.logger?.debug(`[Navigate] Mapping found by XML path: ${mapping ? 'yes' : 'no'}`);

      // 2. 如果未找到，解析 XML 获取 namespace
      if (!mapping) {
        this.logger?.info(`[Navigate] No mapping found, parsing XML...`);
        const xmlInfo = await this.xmlParser.parseXmlMapper(xmlPath);

        if (!xmlInfo?.namespace) {
          this.logger?.warn('[Navigate] XML 文件缺少 namespace');
          vscode.window.showWarningMessage(vscode.l10n.t("fileMapper.noNamespace"));
          return false;
        }

        this.logger?.info(`[Navigate] XML namespace: ${xmlInfo.namespace}`);

        // 3. 通过 namespace 查找映射
        mapping = this.mappingEngine.getByNamespace(xmlInfo.namespace);
        this.logger?.debug(`[Navigate] Mapping found by namespace: ${mapping ? 'yes' : 'no'}`);

        // 4. 如果仍未找到，尝试动态查找或创建映射
        if (!mapping) {
          this.logger?.info(`[Navigate] Trying to find Java by namespace: ${xmlInfo.namespace}`);
          mapping = await this.findJavaByNamespace(xmlInfo.namespace) ?? undefined;
          
          if (mapping) {
            // 更新 XML 路径到现有映射
            this.mappingEngine.updateXmlPath(mapping.javaPath, xmlPath);
            this.logger?.info(`[Navigate] Updated mapping with XML path`);
          }
        }
      }

      if (!mapping) {
        this.logger?.warn('[Navigate] 未找到对应的 Java Mapper 文件');
        vscode.window.showWarningMessage(vscode.l10n.t("fileMapper.noMapperInterface"));
        return false;
      }

      // 5. 验证 Java 文件是否存在
      try {
        await vscode.workspace.fs.stat(vscode.Uri.file(mapping.javaPath));
      } catch (e) {
        this.logger?.warn(`[Navigate] Java file not found: ${mapping.javaPath}`);
        vscode.window.showWarningMessage(vscode.l10n.t("error.javaNotFound"));
        return false;
      }

      // 6. 执行跳转
      let targetPosition: { line: number; column: number } | undefined;
      
      if (sqlId) {
        targetPosition = this.findSqlIdPositionInJava(mapping, sqlId);
        
        // 如果索引中没有位置（返回 undefined），使用 Java 符号 API 动态查找
        if (!targetPosition) {
          this.logger?.debug(`[Navigate] Method position not in index, finding dynamically: ${sqlId}`);
          targetPosition = await this.findMethodPositionDynamically(mapping.javaPath, sqlId);
        }
      }

      await this.openAndReveal(mapping.javaPath, targetPosition, options);

      this.logger?.debug(`[Navigate] XML→Java completed in ${Date.now() - startTime}ms`);
      return true;

    } catch (error) {
      this.logger?.error('[Navigate] XML→Java navigation failed:', error as Error);
      vscode.window.showErrorMessage(vscode.l10n.t("error.navigationFailed"));
      return false;
    }
  }

  // ========== 动态解析和映射 ==========

  /**
   * 动态解析 Java 文件并创建映射
   */
  private async parseAndMapJavaFile(javaPath: string): Promise<MapperMapping | null> {
    try {
      const document = await vscode.workspace.openTextDocument(javaPath);
      const content = document.getText();

      // 检查是否是 Mapper 接口
      if (!/interface\s+\w+/.test(content)) {
        return null;
      }

      const hasMyBatisMarker = 
        /@Mapper\b/.test(content) ||
        /import\s+org\.apache\.ibatis/.test(content) ||
        /import\s+org\.mybatis/.test(content) ||
        content.includes('Mapper');

      if (!hasMyBatisMarker) {
        return null;
      }

      // 解析包名和类名
      const packageMatch = content.match(/package\s+([^;]+);/);
      const packageName = packageMatch ? packageMatch[1] : '';

      const classMatch = content.match(/interface\s+(\w+)/);
      if (!classMatch) return null;

      const simpleClassName = classMatch[1];
      const className = packageName ? `${packageName}.${simpleClassName}` : simpleClassName;

      // 提取方法
      const methods = this.extractMethodsFromContent(content);

      // 创建映射
      const javaInfo = {
        filePath: javaPath,
        className,
        packageName,
        methods
      };

      // 尝试查找对应的 XML
      const xmlPath = await this.findXmlByNamespace(className);
      let xmlInfo = undefined;
      
      if (xmlPath) {
        const parsedXml = await this.xmlParser.parseXmlMapper(xmlPath);
        if (parsedXml) {
          xmlInfo = parsedXml;
        }
      }

      // 建立映射
      return this.mappingEngine.buildMapping(javaInfo, xmlInfo);

    } catch (error) {
      this.logger?.debug(`[ParseAndMap] Failed to parse ${javaPath}:`, error);
      return null;
    }
  }

  /**
   * 通过 namespace 查找 Java 文件
   */
  private async findJavaByNamespace(namespace: string): Promise<MapperMapping | null> {
    const simpleClassName = namespace.substring(namespace.lastIndexOf('.') + 1);
    
    // 1. 在索引中查找
    let mapping = this.mappingEngine.getByClassName(namespace);
    if (mapping) {
      return mapping;
    }

    // 2. 搜索文件系统
    const searchPatterns = [
      `**/${simpleClassName}.java`,
      `**/*${simpleClassName}*.java`
    ];

    for (const pattern of searchPatterns) {
      const files = await vscode.workspace.findFiles(
        pattern,
        '**/{node_modules,.git,target,build,out}/**',
        10
      );

      for (const file of files) {
        try {
          const content = await vscode.workspace.fs.readFile(file);
          const text = Buffer.from(content).toString('utf-8');

          // 验证包名和类名
          const packageMatch = text.match(/package\s+([^;]+);/);
          const actualPackage = packageMatch ? packageMatch[1] : '';
          const fullClassName = actualPackage 
            ? `${actualPackage}.${simpleClassName}`
            : simpleClassName;

          if (fullClassName === namespace || actualPackage === namespace.substring(0, namespace.lastIndexOf('.'))) {
            // 找到匹配的 Java 文件，创建映射
            return await this.parseAndMapJavaFile(file.fsPath);
          }
        } catch (e) {
          // 忽略错误
        }
      }
    }

    return null;
  }

  /**
   * 通过 namespace 查找 XML 文件
   */
  private async findXmlByNamespace(namespace: string): Promise<string | undefined> {
    // 1. 检查索引
    const existingMapping = this.mappingEngine.getByNamespace(namespace);
    if (existingMapping?.xmlPath) {
      return existingMapping.xmlPath;
    }

    // 2. 基于类名猜测路径
    const className = namespace.substring(namespace.lastIndexOf('.') + 1);
    const workspaceFolders = vscode.workspace.workspaceFolders;
    if (!workspaceFolders) return undefined;

    // 常见路径模式（按优先级排序）
    const possiblePatterns = [
      `**/mapper/**/${className}.xml`,
      `**/mappers/**/${className}.xml`,
      `**/resources/**/${className}.xml`,
      `**/xml/**/${className}.xml`,
      `**/${className}.xml`,
      // 模糊匹配
      `**/mapper/**/*${className}*.xml`,
      `**/resources/mapper/**/*.xml`
    ];

    for (const folder of workspaceFolders) {
      for (const pattern of possiblePatterns) {
        try {
          const files = await vscode.workspace.findFiles(
            new vscode.RelativePattern(folder, pattern),
            '**/{node_modules,.git,target,build,out}/**',
            5
          );

          for (const file of files) {
            try {
              // 验证 namespace
              const xmlInfo = await this.xmlParser.parseXmlMapper(file.fsPath);
              
              if (xmlInfo?.namespace === namespace) {
                this.logger?.info(`[FindXml] Found by namespace match: ${file.fsPath}`);
                return file.fsPath;
              }

              // 如果没有 namespace 或 namespace 匹配简单类名，也接受
              if (!xmlInfo?.namespace || xmlInfo.namespace === className) {
                this.logger?.info(`[FindXml] Found by filename match: ${file.fsPath}`);
                return file.fsPath;
              }
            } catch (e) {
              // 解析失败，跳过
            }
          }
        } catch (e) {
          // 搜索失败，跳过
        }
      }
    }

    return undefined;
  }

  // ========== 辅助方法 ==========

  private extractMethodsFromContent(content: string): Array<{ name: string; position: { line: number; column: number } }> {
    const methods: Array<{ name: string; position: { line: number; column: number } }> = [];
    const lines = content.split('\n');
    const methodRegex = /^(?:\s*)(?:public|private|protected)?\s*(?:static|final|abstract)?\s*[\w<>,\s]+\s+(\w+)\s*\([^)]*\)\s*(?:throws\s+[\w,\s]+)?\s*[;{]/;

    for (let i = 0; i < lines.length; i++) {
      const match = methodRegex.exec(lines[i]);
      if (match) {
        methods.push({
          name: match[1],
          position: { line: i, column: lines[i].indexOf(match[1]) }
        });
      }
    }

    return methods;
  }

  private findMethodPositionInXml(mapping: MapperMapping, methodName: string): { line: number; column: number } | undefined {
    const methodMapping = mapping.methods.get(methodName);
    return methodMapping?.xmlPosition;
  }

  private findSqlIdPositionInJava(mapping: MapperMapping, sqlId: string): { line: number; column: number } | undefined {
    const methodMapping = mapping.methods.get(sqlId);
    if (!methodMapping) return undefined;
    
    // 如果 javaPosition 是默认值 {0, 0}，需要动态查找方法位置
    if (methodMapping.javaPosition.line === 0 && methodMapping.javaPosition.column === 0) {
      return undefined; // 返回 undefined 以触发动态查找
    }
    
    return methodMapping.javaPosition;
  }

  /**
   * 使用 Java 符号 API 动态查找方法位置
   */
  private async findMethodPositionDynamically(javaPath: string, methodName: string): Promise<{ line: number; column: number } | undefined> {
    try {
      const symbols = await vscode.commands.executeCommand<vscode.DocumentSymbol[]>(
        'vscode.executeDocumentSymbolProvider',
        vscode.Uri.file(javaPath)
      );

      if (!symbols) return undefined;

      // 在符号树中查找方法
      for (const symbol of symbols) {
        // 检查直接子方法
        if (symbol.kind === vscode.SymbolKind.Method) {
          const baseName = symbol.name.split('(')[0]; // 去掉参数
          if (baseName === methodName) {
            const position = symbol.selectionRange || symbol.range;
            return { line: position.start.line, column: position.start.character };
          }
        }
        
        // 检查类的子方法
        if (symbol.children) {
          for (const child of symbol.children) {
            if (child.kind === vscode.SymbolKind.Method) {
              const baseName = child.name.split('(')[0]; // 去掉参数
              if (baseName === methodName) {
                const position = child.selectionRange || child.range;
                return { line: position.start.line, column: position.start.character };
              }
            }
          }
        }
      }
    } catch (error) {
      this.logger?.debug(`[findMethodPositionDynamically] Failed to get symbols:`, error);
    }

    return undefined;
  }

  private async openAndReveal(
    filePath: string,
    position?: { line: number; column: number },
    options?: NavigationOptions
  ): Promise<void> {
    const uri = vscode.Uri.file(filePath);
    
    const document = await vscode.workspace.openTextDocument(uri);
    const editor = await vscode.window.showTextDocument(document, {
      viewColumn: options?.openSideBySide ? vscode.ViewColumn.Beside : vscode.ViewColumn.One,
      preserveFocus: false,
      preview: false
    });

    if (position) {
      const vscodePosition = new vscode.Position(position.line, position.column);
      editor.selection = new vscode.Selection(vscodePosition, vscodePosition);
      editor.revealRange(
        new vscode.Range(vscodePosition, vscodePosition),
        options?.revealType || vscode.TextEditorRevealType.InCenter
      );
    }
  }

  /**
   * 获取导航信息（用于 CodeLens）
   */
  public async getNavigationInfo(
    document: vscode.TextDocument,
    position: vscode.Position
  ): Promise<{
    canNavigate: boolean;
    direction: 'java-to-xml' | 'xml-to-java' | null;
    targetPath?: string;
    methodName?: string;
  }> {
    const filePath = document.uri.fsPath;
    const isJava = filePath.endsWith('.java');

    if (isJava) {
      let mapping = this.mappingEngine.getByJavaPath(filePath);
      
      // 如果没有映射，尝试动态解析
      if (!mapping) {
        mapping = await this.parseAndMapJavaFile(filePath) ?? undefined;
      }

      if (!mapping) {
        return { canNavigate: false, direction: null };
      }

      const methodName = await this.extractCurrentMethodName(document, position);
      return {
        canNavigate: !!mapping.xmlPath,
        direction: 'java-to-xml',
        targetPath: mapping.xmlPath,
        methodName
      };
    } else {
      let mapping = this.mappingEngine.getByXmlPath(filePath);

      // 如果没有映射，尝试解析 XML
      if (!mapping) {
        const xmlInfo = await this.xmlParser.parseXmlMapper(filePath);
        if (xmlInfo?.namespace) {
          mapping = this.mappingEngine.getByNamespace(xmlInfo.namespace);
        }
      }

      if (!mapping) {
        return { canNavigate: false, direction: null };
      }

      const sqlId = await this.extractCurrentSqlId(document, position);
      return {
        canNavigate: true,
        direction: 'xml-to-java',
        targetPath: mapping.javaPath,
        methodName: sqlId
      };
    }
  }

  private async extractCurrentMethodName(document: vscode.TextDocument, position: vscode.Position): Promise<string | undefined> {
    try {
      const symbols = await vscode.commands.executeCommand<vscode.DocumentSymbol[]>(
        'vscode.executeDocumentSymbolProvider',
        document.uri
      );

      if (symbols) {
        for (const symbol of symbols) {
          if (symbol.kind === vscode.SymbolKind.Method && symbol.range.contains(position)) {
            return symbol.name;
          }
          for (const child of symbol.children || []) {
            if (child.kind === vscode.SymbolKind.Method && child.range.contains(position)) {
              return child.name;
            }
          }
        }
      }
    } catch (error) {
      // 降级到正则匹配
    }

    // 正则匹配当前行
    const line = document.lineAt(position.line).text;
    const methodRegex = /\s+(\w+)\s*\([^)]*\)\s*\{/;
    const match = methodRegex.exec(line);
    return match ? match[1] : undefined;
  }

  private async extractCurrentSqlId(document: vscode.TextDocument, position: vscode.Position): Promise<string | undefined> {
    const sqlIdRegex = /<(select|insert|update|delete)\s+[^>]*id\s*=\s*["']([^"']+)["']/;
    
    for (let i = position.line; i >= 0; i--) {
      const line = document.lineAt(i).text;
      const match = sqlIdRegex.exec(line);
      if (match) {
        return match[2];
      }
    }

    return undefined;
  }

  public canNavigate(filePath: string): boolean {
    if (filePath.endsWith('.java')) {
      const mapping = this.mappingEngine.getByJavaPath(filePath);
      return !!mapping?.xmlPath;
    } else if (filePath.endsWith('.xml')) {
      return this.mappingEngine.hasXmlMapping(filePath);
    }
    return false;
  }

  public getDiagnostics(): object {
    return {
      engineDiagnostics: this.mappingEngine.getDiagnostics()
    };
  }
}
