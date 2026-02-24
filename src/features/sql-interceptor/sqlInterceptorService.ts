/**
 * SQL 日志拦截服务
 * 
 * 功能：
 * 1. 同时监听调试控制台和终端输出
 * 2. 支持灵活的正则规则配置
 * 3. 解析 SQL、参数、执行时间
 * 4. 提供 SQL 历史记录管理
 */

import * as vscode from 'vscode';
import { 
  SQLInterceptorConfig, 
  SQLInterceptorRule, 
  SQLQueryRecord, 
  ParsedLogLine,
  LogLineType 
} from './types';
import { logger } from '../../utils/logger';
import { SQLParser } from '../../language/sqlparser';
import { formatSQL } from '../../utils';

/**
 * 内置规则 - MyBatis 通用格式
 * 注意：所有正则都不需要 (?i)，因为 getCachedRegex 会自动添加 'i' 标志实现不区分大小写
 * 
 * 通用匹配策略：
 * 1. 不强制要求特定的前缀格式（时间、线程名、类名等都可变）
 * 2. 只匹配关键标识词：Preparing: / Parameters: / Total:
 * 3. 支持 ==> / <== 等 MyBatis 特有的前缀
 */
const BUILTIN_RULES: SQLInterceptorRule[] = [
  {
    name: 'mybatis-universal',
    enabled: true,
    description: 'Universal MyBatis log matcher - matches any format with Preparing:/Parameters: keywords. Supports: "Preparing: SELECT...", "Parameters: admin(String)", etc.',
    // 行匹配：包含 preparing: 或 parameters: 或 total: 的行（不区分大小写）
    lineMatchRegex: '(preparing[:：]|parameters[:：]|total[:：]|executed[:：])',
    // SQL提取：Preparing: 或 Preparing： 后的所有内容，支持 ==> 前缀
    sqlExtractRegex: '(?:==>\\s*)?[Pp]reparing[:：]\\s*(.+)',
    // 参数提取：Parameters: 或 Parameters： 后的所有内容，支持 ==> 前缀
    parametersExtractRegex: '(?:==>\\s*)?[Pp]arameters[:：]\\s*(.+)',
    // 执行时间提取：Total: / Executed: / Time: 后的数字
    executionTimeExtractRegex: '(?:<==\\s*)?(?:[Tt]otal|[Ee]xecuted|[Tt]ime)[:：]\\s*(\\d+)',
    // 参数解析：值(类型) 格式，如：admin(String), 123(Integer), 2024-01-01 12:00:00(Timestamp)
    // 支持中文括号（）：admin（String）
    paramParseRegex: '([^,（(]+)(?:\\(|（)([^)）]+)(?:\\)|）)',
    singleLineMode: true,
  },
  {
    name: 'mybatis-sqlsession',
    enabled: true,
    description: 'MyBatis SqlSession debug logs with class name prefix like c.r.s.m.S.selectXxx or o.a.i.s.SqlSession.selectXxx',
    // 匹配常见的类名前缀格式：c.r.s.m.S.selectXxx, o.a.i.l.s.d.S.selectXxx 等
    lineMatchRegex: '(?:[a-z]\\.[a-z]\\.[a-z]\\.[a-z]\\.[A-Z]|[A-Z][a-z]+Mapper\\.|[Ss]ql[Ss]ession[^\\s]*)\\s+(?:preparing|parameters)',
    sqlExtractRegex: '[Pp]reparing[:：]\\s*(.+)',
    parametersExtractRegex: '[Pp]arameters[:：]\\s*(.+)',
    executionTimeExtractRegex: '(?:[Tt]otal|[Ee]xecuted)[:：]\\s*(\\d+)',
    paramParseRegex: '([^,（(]+)(?:\\(|（)([^)）]+)(?:\\)|）)',
    singleLineMode: true,
  }
];

export class SQLInterceptorService {
  private static instance: SQLInterceptorService;
  private config: SQLInterceptorConfig;
  private isEnabled: boolean = false;
  private isStarted: boolean = false;  // 是否已经启动过监听
  private sqlHistory: SQLQueryRecord[] = [];
  private pendingQuery: Partial<SQLQueryRecord> | null = null;
  private pendingTimer: NodeJS.Timeout | null = null;
  private sqlParser: SQLParser;
  
  // 多行解析支持
  private lineBuffer: string[] = [];
  private lineBufferTimer: NodeJS.Timeout | null = null;
  private currentRuleForBuffer: SQLInterceptorRule | null = null;
  
  // 事件发射器
  private readonly _onSQLRecorded = new vscode.EventEmitter<SQLQueryRecord>();
  private readonly _onHistoryCleared = new vscode.EventEmitter<void>();
  private readonly _onStateChanged = new vscode.EventEmitter<boolean>();
  
  public readonly onSQLRecorded = this._onSQLRecorded.event;
  public readonly onHistoryCleared = this._onHistoryCleared.event;
  public readonly onStateChanged = this._onStateChanged.event;

  // 已编译的正则表达式缓存
  private regexCache: Map<string, RegExp> = new Map();
  
  // 资源订阅列表
  private disposables: vscode.Disposable[] = [];

  private constructor() {
    this.sqlParser = new SQLParser();
    this.config = this.loadDefaultConfig();
  }

  public static getInstance(): SQLInterceptorService {
    if (!SQLInterceptorService.instance) {
      SQLInterceptorService.instance = new SQLInterceptorService();
    }
    return SQLInterceptorService.instance;
  }

  /**
   * 加载默认配置
   */
  private loadDefaultConfig(): SQLInterceptorConfig {
    const workspaceConfig = vscode.workspace.getConfiguration('mybatis-helper');
    
    return {
      enabled: workspaceConfig.get('enableLogInterceptor', true),
      maxHistorySize: workspaceConfig.get('maxHistorySize', 100),
      showExecutionTime: workspaceConfig.get('showExecutionTime', true),
      databaseType: workspaceConfig.get('databaseType', 'mysql'),
      customRules: workspaceConfig.get('sqlInterceptor.customRules', []),
      builtinRules: {},
      listenMode: workspaceConfig.get('sqlInterceptor.listenMode', 'auto'),
      terminalFilter: workspaceConfig.get('sqlInterceptor.terminalFilter', ''),
      autoStart: workspaceConfig.get('sqlInterceptor.autoStart', true),
      autoScrollBehavior: workspaceConfig.get('sqlInterceptor.autoScrollBehavior', 'onlyWhenNotInteracting'),
    };
  }

  /**
   * 初始化服务
   */
  public async initialize(): Promise<void> {
    logger.info('[SQLInterceptor] Initializing...');
    
    // 加载配置
    await this.loadConfig();
    
    // 如果启用且配置了自动启动，则自动开始拦截
    if (this.config.enabled && this.config.autoStart) {
      this.start();
    } else if (this.config.enabled && !this.config.autoStart) {
      // 显示提示，告知用户需要手动启动
      logger.info('[SQLInterceptor] Auto-start is disabled, waiting for manual start');
      // 延迟显示，避免启动时消息过多
      setTimeout(() => {
        if (!this.isEnabled) {
          vscode.window.showInformationMessage(
            vscode.l10n.t('sqlInterceptor.autoStartDisabled'),
            vscode.l10n.t('sqlInterceptor.startNow')
          ).then(selection => {
            if (selection === vscode.l10n.t('sqlInterceptor.startNow')) {
              this.start();
            }
          });
        }
      }, 3000);
    }
    
    // 监听配置变化
    vscode.workspace.onDidChangeConfiguration(e => {
      if (e.affectsConfiguration('mybatis-helper')) {
        this.loadConfig();
      }
    });
    
    logger.info('[SQLInterceptor] Initialized');
  }

  /**
   * 加载配置
   */
  public async loadConfig(): Promise<void> {
    const workspaceConfig = vscode.workspace.getConfiguration('mybatis-helper');
    
    this.config = {
      enabled: workspaceConfig.get('enableLogInterceptor', true),
      maxHistorySize: workspaceConfig.get('maxHistorySize', 100),
      showExecutionTime: workspaceConfig.get('showExecutionTime', true),
      databaseType: workspaceConfig.get('databaseType', 'mysql'),
      customRules: workspaceConfig.get('sqlInterceptor.customRules', []),
      builtinRules: workspaceConfig.get('sqlInterceptor.builtinRules', {}),
      listenMode: workspaceConfig.get('sqlInterceptor.listenMode', 'auto'),
      terminalFilter: workspaceConfig.get('sqlInterceptor.terminalFilter', ''),
      autoStart: workspaceConfig.get('sqlInterceptor.autoStart', true),
      autoScrollBehavior: workspaceConfig.get('sqlInterceptor.autoScrollBehavior', 'onlyWhenNotInteracting'),
    };

    // 更新 SQL parser 数据库类型
    this.sqlParser.setDatabaseType(this.config.databaseType as any);
    
    // 清空正则缓存
    this.regexCache.clear();
    
    logger.debug('[SQLInterceptor] Config loaded:', this.config);
  }

  /**
   * 获取所有可用的规则（内置 + 自定义 + 从 customLogPattern 转换的规则）
   */
  public getAllRules(): SQLInterceptorRule[] {
    const builtinEnabled = BUILTIN_RULES.map(rule => ({
      ...rule,
      enabled: this.config.builtinRules[rule.name] !== false // 默认启用
    }));
    
    // 转换 customLogPattern 为规则（向后兼容）
    const patternRules = this.convertLogPatternToRules();
    
    return [...builtinEnabled, ...this.config.customRules, ...patternRules];
  }

  /**
   * 将 customLogPattern 转换为 SQLInterceptorRule
   * 支持占位符：
   * - %PREPARING% - SQL 准备语句
   * - %PARAMETERS% - 参数列表
   * - %EXECUTION_TIME% - 执行时间（毫秒）
   * - %SQL% - 简写，等同于 %PREPARING%
   * 
   * 例如：
   * - "Preparing: %PREPARING%"
   * - "Parameters: %PARAMETERS%, Time: %EXECUTION_TIME%ms"
   * - "%PREPARING% | %PARAMETERS%"
   */
  private convertLogPatternToRules(): SQLInterceptorRule[] {
    const workspaceConfig = vscode.workspace.getConfiguration('mybatis-helper');
    const customLogPattern = workspaceConfig.get<string>('customLogPattern', '');
    
    if (!customLogPattern) {
      return [];
    }

    try {
      logger.info(`[SQLInterceptor] Converting customLogPattern: ${customLogPattern}`);

      // 构建各个部分的正则
      let sqlExtractPattern = '';
      let paramsExtractPattern = '';
      let timeExtractPattern = '';

      // 处理 %PREPARING% / %SQL% 占位符
      let processedPattern = customLogPattern
        .replace(/%SQL%/gi, '%PREPARING%')
        .replace(/%PREPARING%/gi, '(.*Preparing.*)');

      // 处理 %PARAMETERS% 占位符
      processedPattern = processedPattern
        .replace(/%PARAMETERS%/gi, '(.*Parameters.*)');

      // 处理 %EXECUTION_TIME% 占位符
      processedPattern = processedPattern
        .replace(/%EXECUTION_TIME%/gi, '(\\d+)');

      // 提取 SQL 提取正则（查找 Preparing: 后的内容）
      if (customLogPattern.match(/%PREPARING%|%SQL%/i)) {
        sqlExtractPattern = '[Pp]reparing[:：]?\\s*(.+)';
      }

      // 提取参数正则（查找 Parameters: 后的内容）
      if (customLogPattern.match(/%PARAMETERS%/i)) {
        paramsExtractPattern = '[Pp]arameters[:：]?\\s*(.+)';
      }

      // 提取执行时间正则
      if (customLogPattern.match(/%EXECUTION_TIME%/i)) {
        timeExtractPattern = '(\\d+)';
      }

      // 构建行匹配正则：使用处理后的模式，并添加不区分大小写标志
      // 将用户输入中的特殊字符转义，但保留我们替换的捕获组
      const lineMatchRegex = processedPattern
        .replace(/\(\.\*Preparing\.\*\)/g, '.*Preparing.*')
        .replace(/\(\.\*Parameters\.\*\)/g, '.*Parameters.*')
        .replace(/\(\\\\d\+\)/g, '\\d+')
        .replace(/([.*+?^${}()|[\]\\])/g, '\\$1');

      const rule: SQLInterceptorRule = {
        name: 'custom-log-pattern',
        enabled: true,
        description: `Custom pattern: ${customLogPattern}`,
        lineMatchRegex: lineMatchRegex,
        sqlExtractRegex: sqlExtractPattern,
        parametersExtractRegex: paramsExtractPattern,
        executionTimeExtractRegex: timeExtractPattern,
        paramParseRegex: '([^,（(]+)(?:\\(|（)([^)）]+)(?:\\)|）)',
        singleLineMode: true,
      };

      logger.info(`[SQLInterceptor] Generated rule:`, rule);
      return [rule];
    } catch (error) {
      logger.error('[SQLInterceptor] Failed to convert customLogPattern:', error as Error);
      vscode.window.showWarningMessage(
        `Invalid customLogPattern: ${error instanceof Error ? error.message : String(error)}`
      );
      return [];
    }
  }

  /**
   * 根据名称获取规则
   */
  private getRuleByName(name: string): SQLInterceptorRule | undefined {
    return this.getAllRules().find(r => r.name === name);
  }

  /**
   * 开始拦截
   */
  public start(): void {
    if (this.isEnabled) {
      return;
    }
    
    this.isEnabled = true;
    
    // 只需要注册一次监听器
    if (!this.isStarted) {
      // 根据配置决定监听方式
      const listenMode = this.config.listenMode;
      
      if (listenMode === 'debugConsole') {
        this.listenToDebugConsole();
        logger.info('[SQLInterceptor] Debug Console listener registered');
      } else if (listenMode === 'terminal') {
        this.listenToTerminal();
        logger.info('[SQLInterceptor] Terminal listener registered');
      } else {
        // auto 模式 - 根据 Java 配置自动选择
        this.setupAutoListenMode();
      }
      
      this.isStarted = true;
    }
    
    this._onStateChanged.fire(true);
    logger.info('[SQLInterceptor] Started');
    
    // 只在非自动启动模式下显示提示（2秒后自动关闭）
    if (!this.config.autoStart) {
      this.showTemporaryMessage(vscode.l10n.t('sqlInterceptor.started'), 2000);
    }
  }

  /**
   * 设置自动监听模式
   * 根据 java.debug.settings.console 配置决定监听方式
   */
  private setupAutoListenMode(): void {
    // 读取 Java 插件的配置
    const javaDebugConfig = vscode.workspace.getConfiguration('java.debug.settings');
    const consoleType = javaDebugConfig.get<string>('console', 'internalConsole');
    
    logger.info(`[SQLInterceptor] Auto-detected console type: ${consoleType}`);
    
    switch (consoleType) {
      case 'internalConsole':
        // Java 在 Debug Console 中运行
        this.listenToDebugConsole();
        logger.info('[SQLInterceptor] Auto-configured: Listening to Debug Console');
        break;
        
      case 'integratedTerminal':
        // Java 在集成终端中运行
        this.listenToTerminal();
        logger.info('[SQLInterceptor] Auto-configured: Listening to Terminal');
        break;
        
      case 'externalTerminal':
        // Java 在外部终端中运行 - 无法监听
        logger.warn('[SQLInterceptor] Warning: Java is configured to run in external terminal, which cannot be monitored');
        vscode.window.showWarningMessage(
          vscode.l10n.t('sqlInterceptor.externalTerminalNotSupported')
        );
        break;
        
      default:
        // 未知配置，默认使用 auto 模式（优先监听 Debug Console）
        logger.warn(`[SQLInterceptor] Unknown console type: ${consoleType}, defaulting to auto (Debug Console)`);
        this.listenToDebugConsole();
    }
  }

  /**
   * 停止拦截
   */
  public stop(): void {
    if (!this.isEnabled) {
      return;
    }
    
    this.isEnabled = false;
    
    // 清理待处理的查询
    if (this.pendingTimer) {
      clearTimeout(this.pendingTimer);
      this.pendingTimer = null;
    }
    this.pendingQuery = null;
    
    this._onStateChanged.fire(false);
    logger.info('[SQLInterceptor] Stopped');
    
    this.showTemporaryMessage(vscode.l10n.t('sqlInterceptor.stopped'), 2000);
  }

  /**
   * 切换拦截状态
   */
  public toggle(): boolean {
    if (this.isEnabled) {
      this.stop();
    } else {
      this.start();
    }
    return this.isEnabled;
  }

  /**
   * 获取当前状态
   */
  public get isRunning(): boolean {
    return this.isEnabled;
  }

  /**
   * 监听调试控制台
   * 使用 DebugAdapterTracker 跟踪调试适配器的通信
   */
  private listenToDebugConsole(): void {
    // 注册 DebugAdapterTracker 工厂
    const trackerFactory: vscode.DebugAdapterTrackerFactory = {
      createDebugAdapterTracker: (session: vscode.DebugSession) => {
        logger.debug(`[SQLInterceptor] Creating tracker for session: ${session.name} (type: ${session.type})`);
        
        return {
          // 拦截从调试适配器发送给 VS Code 的消息
          onDidSendMessage: (message: any) => {
            if (!this.isEnabled) return;
            
            // 处理输出事件
            if (message.type === 'event' && message.event === 'output') {
              const body = message.body;
              if (body && body.output) {
                const category = body.category || 'console';
                // 处理所有类别的输出：console, stdout, stderr, important
                if (category === 'console' || 
                    category === 'stdout' || 
                    category === 'stderr' ||
                    category === 'important' ||
                    category === 'info') {
                  
                  // 按行处理
                  const lines = body.output.split('\n');
                  for (const line of lines) {
                    if (line.trim()) {
                      logger.debug(`[SQLInterceptor] Debug output: ${line.substring(0, 100)}...`);
                      this.processLogLine(line, 'debug');
                    }
                  }
                }
              }
            }
          },
          
          // 调试会话错误
          onError: (error: Error) => {
            logger.error(`[SQLInterceptor] Debug adapter error: ${error.message}`);
          },
          
          // 调试适配器退出
          onExit: (code: number | undefined, signal: string | undefined) => {
            logger.debug(`[SQLInterceptor] Debug adapter exited: code=${code}, signal=${signal}`);
          }
        };
      }
    };
    
    // 注册 tracker 工厂
    const trackerDisposal = vscode.debug.registerDebugAdapterTrackerFactory('*', trackerFactory);
    this.disposables.push(trackerDisposal);
    
    // 监听调试会话开始
    const startSessionDisposal = vscode.debug.onDidStartDebugSession(session => {
      logger.info(`[SQLInterceptor] Debug session started: ${session.name} (type: ${session.type})`);
    });
    this.disposables.push(startSessionDisposal);

    // 监听调试会话结束
    const terminateSessionDisposal = vscode.debug.onDidTerminateDebugSession(session => {
      logger.info(`[SQLInterceptor] Debug session terminated: ${session.name}`);
      // 清理当前查询
      this.pendingQuery = null;
    });
    this.disposables.push(terminateSessionDisposal);
    
    logger.info('[SQLInterceptor] Debug console tracker registered');
  }

  /**
   * 监听终端输出
   * 使用 VS Code 1.93+ 的 Shell Integration API
   */
  private listenToTerminal(): void {
    logger.info('[SQLInterceptor] Using Shell Integration API to listen terminal output');
    
    // 使用 Shell Integration API 监听终端命令执行
    // @ts-ignore - 这些 API 在 VS Code 1.93+ 中可用
    if (vscode.window.onDidStartTerminalShellExecution) {
      // @ts-ignore
      vscode.window.onDidStartTerminalShellExecution(async (event: any) => {
        if (!this.isEnabled) return;
        
        const terminal = event.terminal;
        const execution = event.execution;
        
        logger.debug(`[SQLInterceptor] Terminal shell execution started: ${terminal.name}`);
        
        // 检查终端名称是否符合过滤条件
        if (this.config.terminalFilter && 
            !terminal.name.includes(this.config.terminalFilter)) {
          logger.debug(`[SQLInterceptor] Terminal filtered out: ${terminal.name}`);
          return;
        }
        
        try {
          // 获取命令行
          let commandLine = '';
          if (execution.commandLine) {
            commandLine = execution.commandLine.value || '';
            logger.debug(`[SQLInterceptor] Command: ${commandLine}`);
          }
          
          // 读取命令输出
          // @ts-ignore - read() 方法返回 AsyncIterable
          if (execution.read) {
            const stream = execution.read();
            let output = '';
            
            for await (const chunk of stream) {
              if (chunk) {
                const text = chunk.toString();
                output += text;
                
                // 按行处理输出，解析 SQL 日志
                const lines = text.split('\n');
                for (const line of lines) {
                  if (line.trim()) {
                    this.processLogLine(line, 'terminal');
                  }
                }
              }
            }
            
            logger.debug(`[SQLInterceptor] Terminal execution completed, total output length: ${output.length}`);
          }
        } catch (error) {
          logger.error('[SQLInterceptor] Error reading terminal output:', error as Error);
        }
      }, null, this.disposables);
      
      logger.info('[SQLInterceptor] Terminal shell execution listener registered successfully');
    } else {
      logger.warn('[SQLInterceptor] Shell Integration API not available in this VS Code version');
    }
    
    // 保留原有的事件监听作为备选
    vscode.window.onDidOpenTerminal(terminal => {
      if (!this.isEnabled) return;
      logger.debug(`[SQLInterceptor] Terminal opened: ${terminal.name}`);
    }, null, this.disposables);
    
    // 监听任务输出
    vscode.tasks.onDidStartTaskProcess(e => {
      if (!this.isEnabled) return;
      logger.debug(`[SQLInterceptor] Task started: ${e.execution.task.name}`);
    }, null, this.disposables);
  }
  
  /**
   * 清理资源
   */
  public dispose(): void {
    // 停止拦截
    this.stop();
    
    // 清理所有订阅
    this.disposables.forEach(d => d.dispose());
    this.disposables = [];
    
    // 清理其他资源
    if (this.pendingTimer) {
      clearTimeout(this.pendingTimer);
      this.pendingTimer = null;
    }
    
    // 清理行缓冲
    this.clearLineBuffer();
    
    this.pendingQuery = null;
    this.sqlHistory = [];
    this.regexCache.clear();
    
    // 清理事件发射器
    this._onSQLRecorded.dispose();
    this._onHistoryCleared.dispose();
    this._onStateChanged.dispose();
    
    logger.info('[SQLInterceptor] Disposed');
  }

  /**
   * 处理日志行（支持多行解析）
   */
  public processLogLine(line: string, source: 'debug' | 'terminal'): void {
    if (!this.isEnabled || !line) return;

    try {
      // 先尝试单行解析
      const parsed = this.parseLogLine(line, source);
      
      if (!parsed || parsed.type === 'unknown') {
        // 如果单行解析失败，检查是否在多行缓冲中
        if (this.lineBuffer.length > 0) {
          this.lineBuffer.push(line);
          return;
        }
        return;
      }

      logger.debug(`[SQLInterceptor] processLogLine: parsed type=${parsed.type}, line=${line.substring(0, 80)}...`);

      // 根据规则类型决定处理方式
      const rule = this.getRuleByName(parsed.ruleName);
      
      if (rule?.singleLineMode === false) {
        // 多行模式：累积行直到收到参数或执行时间
        if (parsed.type === 'sql') {
          this.lineBuffer = [line];
          this.currentRuleForBuffer = rule;
          // 设置缓冲超时
          if (this.lineBufferTimer) {
            clearTimeout(this.lineBufferTimer);
          }
          this.lineBufferTimer = setTimeout(() => {
            this.flushLineBuffer(source);
          }, (rule.maxLineGap || 5) * 1000);
        } else if (parsed.type === 'parameters' || parsed.type === 'executionTime') {
          // 收到参数或执行时间，刷新缓冲
          this.lineBuffer.push(line);
          this.flushLineBuffer(source);
        }
      } else {
        // 单行模式：直接处理
        this.handleParsedLog(parsed, source);
      }
    } catch (error) {
      logger.error('[SQLInterceptor] Error processing log line:', error as Error);
    }
  }

  /**
   * 刷新行缓冲，处理累积的多行
   */
  private flushLineBuffer(source: 'debug' | 'terminal'): void {
    if (this.lineBufferTimer) {
      clearTimeout(this.lineBufferTimer);
      this.lineBufferTimer = null;
    }

    if (this.lineBuffer.length === 0 || !this.currentRuleForBuffer) {
      this.clearLineBuffer();
      return;
    }

    const rule = this.currentRuleForBuffer;
    const bufferText = this.lineBuffer.join('\n');

    // 尝试从缓冲中提取 SQL
    const sqlRegex = this.getCachedRegex(rule.sqlExtractRegex);
    const sqlMatch = sqlRegex.exec(bufferText);
    let sql: string | undefined;
    
    if (sqlMatch && sqlMatch[1]) {
      sql = sqlMatch[1].trim();
    }

    // 尝试提取参数
    let parameters: string | undefined;
    if (rule.parametersExtractRegex) {
      const paramRegex = this.getCachedRegex(rule.parametersExtractRegex);
      const paramMatch = paramRegex.exec(bufferText);
      if (paramMatch && paramMatch[1]) {
        parameters = paramMatch[1].trim();
      }
    }

    // 尝试提取执行时间
    let executionTime: number | undefined;
    if (rule.executionTimeExtractRegex) {
      const timeRegex = this.getCachedRegex(rule.executionTimeExtractRegex);
      const timeMatch = timeRegex.exec(bufferText);
      if (timeMatch && timeMatch[1]) {
        executionTime = parseInt(timeMatch[1], 10);
      }
    }

    // 构建解析结果并处理
    if (sql) {
      this.handleParsedLog({ type: 'sql', content: bufferText, ruleName: rule.name, sql }, source);
    }

    if (parameters && this.pendingQuery) {
      this.handleParsedLog({ type: 'parameters', content: bufferText, ruleName: rule.name, parameters }, source);
    }

    if (executionTime !== undefined && this.pendingQuery) {
      this.handleParsedLog({ type: 'executionTime', content: bufferText, ruleName: rule.name, executionTime }, source);
    }

    this.clearLineBuffer();
  }

  /**
   * 清除行缓冲
   */
  private clearLineBuffer(): void {
    this.lineBuffer = [];
    this.currentRuleForBuffer = null;
    if (this.lineBufferTimer) {
      clearTimeout(this.lineBufferTimer);
      this.lineBufferTimer = null;
    }
  }

  /**
   * 解析日志行
   */
  private parseLogLine(line: string, source: 'debug' | 'terminal'): ParsedLogLine | null {
    const rules = this.getAllRules().filter(r => r.enabled);
    
    for (const rule of rules) {
      // 检查行是否匹配规则
      const lineMatchRegex = this.getCachedRegex(rule.lineMatchRegex);
      if (!lineMatchRegex.test(line)) {
        continue;
      }

      // 重置正则 lastIndex
      lineMatchRegex.lastIndex = 0;

      logger.debug(`[SQLInterceptor] Rule '${rule.name}' matched line: ${line.substring(0, 60)}...`);

      // 尝试提取 SQL
      const sqlRegex = this.getCachedRegex(rule.sqlExtractRegex);
      const sqlMatch = sqlRegex.exec(line);
      if (sqlMatch && sqlMatch[1]) {
        logger.debug(`[SQLInterceptor] Extracted SQL: ${sqlMatch[1].substring(0, 50)}...`);
        return {
          type: 'sql',
          content: line,
          ruleName: rule.name,
          sql: sqlMatch[1].trim(),
        };
      }

      // 尝试提取参数
      if (rule.parametersExtractRegex) {
        const paramRegex = this.getCachedRegex(rule.parametersExtractRegex);
        const paramMatch = paramRegex.exec(line);
        if (paramMatch && paramMatch[1]) {
          logger.debug(`[SQLInterceptor] Extracted parameters: ${paramMatch[1]}`);
          return {
            type: 'parameters',
            content: line,
            ruleName: rule.name,
            parameters: paramMatch[1].trim(),
          };
        }
      }

      // 尝试提取执行时间
      if (rule.executionTimeExtractRegex) {
        const timeRegex = this.getCachedRegex(rule.executionTimeExtractRegex);
        const timeMatch = timeRegex.exec(line);
        if (timeMatch && timeMatch[1]) {
          logger.debug(`[SQLInterceptor] Extracted execution time: ${timeMatch[1]}ms`);
          return {
            type: 'executionTime',
            content: line,
            ruleName: rule.name,
            executionTime: parseInt(timeMatch[1], 10),
          };
        }
      }
    }

    return null;
  }

  // 用于检测重复 SQL 的缓存
  private lastProcessedSQL: string = '';
  private lastProcessedTime: number = 0;

  /**
   * 处理解析后的日志
   */
  private handleParsedLog(parsed: ParsedLogLine, source: 'debug' | 'terminal'): void {
    logger.debug(`[SQLInterceptor] handleParsedLog: type=${parsed.type}, rule=${parsed.ruleName}, hasPending=${!!this.pendingQuery}`);
    
    switch (parsed.type) {
      case 'sql':
        // 检测重复 SQL（100ms 内相同的 SQL 视为重复）
        const now = Date.now();
        const sqlKey = parsed.sql?.trim() || '';
        if (sqlKey === this.lastProcessedSQL && (now - this.lastProcessedTime) < 100) {
          logger.debug(`[SQLInterceptor] Duplicate SQL detected, skipping`);
          return;
        }
        this.lastProcessedSQL = sqlKey;
        this.lastProcessedTime = now;
        
        // 保存之前的查询（如果有）
        this.finalizePendingQuery();
        
        // 开始新的查询
        this.pendingQuery = {
          id: Date.now().toString(36) + Math.random().toString(36).substr(2),
          rawSQL: parsed.sql,
          source,
          matchedRule: parsed.ruleName,
          timestamp: new Date(),
        };
        
        logger.debug(`[SQLInterceptor] New SQL query started: ${parsed.sql?.substring(0, 50)}...`);
        
        // 设置超时，如果在指定时间内没有收到参数，则直接保存
        this.pendingTimer = setTimeout(() => {
          logger.debug(`[SQLInterceptor] Query timeout, finalizing without parameters`);
          this.finalizePendingQuery();
        }, 5000);
        break;

      case 'parameters':
        if (this.pendingQuery) {
          logger.debug(`[SQLInterceptor] Processing parameters: ${parsed.parameters}`);
          
          // 解析参数
          const params = this.parseParameters(
            parsed.parameters!, 
            this.getRuleByName(parsed.ruleName)
          );
          
          logger.debug(`[SQLInterceptor] Parsed ${params.length} parameters`);
          
          this.pendingQuery.parameters = params;
          
          // 尝试生成完整 SQL
          if (this.pendingQuery.rawSQL) {
            this.pendingQuery.fullSQL = this.buildFullSQL(
              this.pendingQuery.rawSQL,
              params
            );
            this.pendingQuery.formattedSQL = formatSQL(
              this.pendingQuery.fullSQL,
              this.config.databaseType as any
            );
            
            logger.debug(`[SQLInterceptor] Built full SQL: ${this.pendingQuery.fullSQL?.substring(0, 50)}...`);
          }
        } else {
          logger.warn(`[SQLInterceptor] Received parameters but no pending query!`);
        }
        break;

      case 'executionTime':
        if (this.pendingQuery) {
          this.pendingQuery.executionTime = parsed.executionTime;
          logger.debug(`[SQLInterceptor] Execution time: ${parsed.executionTime}ms`);
          // 收到执行时间， finalize 查询
          this.finalizePendingQuery();
        }
        break;
    }
  }

  /**
   * 解析参数
   */
  private parseParameters(
    paramsString: string, 
    rule?: SQLInterceptorRule
  ): Array<{ value: string; type: string }> {
    const params: Array<{ value: string; type: string }> = [];
    
    // 优先使用 paramValueOnlyRegex（无类型信息的情况）
    if (rule?.paramValueOnlyRegex) {
      const valueRegex = this.getCachedRegex(rule.paramValueOnlyRegex);
      let match;
      while ((match = valueRegex.exec(paramsString)) !== null) {
        params.push({
          value: match[1].trim(),
          type: rule.paramTypeMapping?.['unknown'] || 'unknown',
        });
      }
      return params;
    }
    
    // 使用 paramParseRegex（有类型信息的情况）
    const parseRegex = rule?.paramParseRegex 
      ? this.getCachedRegex(rule.paramParseRegex)
      : /([^\(]+)\(([^\)]+)\)/g;
    
    let match;
    while ((match = parseRegex.exec(paramsString)) !== null) {
      let type = match[2].trim();
      // 应用类型映射
      if (rule?.paramTypeMapping && rule.paramTypeMapping[type]) {
        type = rule.paramTypeMapping[type];
      }
      params.push({
        value: match[1].trim(),
        type,
      });
    }

    return params;
  }

  /**
   * 构建完整 SQL
   */
  private buildFullSQL(
    rawSQL: string, 
    params: Array<{ value: string; type: string }>
  ): string {
    // 使用唯一的 id 避免 SQLParser 缓存问题
    const uniqueId = Date.now().toString(36) + Math.random().toString(36).substr(2, 5);
    
    // 使用 SQLParser 填充参数
    const query = this.sqlParser.processSQLQuery({
      id: uniqueId,
      preparing: rawSQL,
      parameters: params,
      timestamp: new Date(),
    });
    
    return query.fullSQL || rawSQL;
  }

  /**
   * 完成待处理的查询
   */
  private finalizePendingQuery(): void {
    if (this.pendingTimer) {
      clearTimeout(this.pendingTimer);
      this.pendingTimer = null;
    }

    if (!this.pendingQuery || !this.pendingQuery.rawSQL) {
      this.pendingQuery = null;
      return;
    }

    const paramCount = this.pendingQuery.parameters?.length || 0;
    logger.debug(`[SQLInterceptor] Finalizing query with ${paramCount} parameters`);

    // 创建完整记录
    const record: SQLQueryRecord = {
      id: this.pendingQuery.id!,
      rawSQL: this.pendingQuery.rawSQL,
      fullSQL: this.pendingQuery.fullSQL,
      formattedSQL: this.pendingQuery.formattedSQL,
      parameters: this.pendingQuery.parameters,
      executionTime: this.pendingQuery.executionTime,
      source: this.pendingQuery.source as 'debug' | 'terminal',
      timestamp: this.pendingQuery.timestamp as Date,
      matchedRule: this.pendingQuery.matchedRule!,
    };

    // 添加到历史
    this.addToHistory(record);

    // 触发事件
    this._onSQLRecorded.fire(record);

    // 清理
    this.pendingQuery = null;
  }

  /**
   * 添加到历史
   */
  private addToHistory(record: SQLQueryRecord): void {
    // 检查是否是重复的 SQL（与最近的一条比较）
    const lastRecord = this.sqlHistory[0];
    if (lastRecord && 
        lastRecord.rawSQL === record.rawSQL && 
        lastRecord.fullSQL === record.fullSQL) {
      // 如果是重复的 SQL（1秒内），则更新最后一条记录的执行时间（如果有）
      const timeDiff = record.timestamp.getTime() - lastRecord.timestamp.getTime();
      if (timeDiff < 1000) {
        // 更新执行时间
        if (record.executionTime !== undefined) {
          lastRecord.executionTime = record.executionTime;
        }
        return; // 不添加重复记录
      }
    }
    
    this.sqlHistory.unshift(record);
    
    // 限制历史大小
    if (this.sqlHistory.length > this.config.maxHistorySize) {
      this.sqlHistory = this.sqlHistory.slice(0, this.config.maxHistorySize);
    }
  }

  /**
   * 获取历史记录
   */
  public getHistory(): SQLQueryRecord[] {
    return [...this.sqlHistory];
  }

  /**
   * 清除历史
   */
  public clearHistory(): void {
    this.sqlHistory = [];
    this._onHistoryCleared.fire();
    
    this.showTemporaryMessage(vscode.l10n.t('sqlInterceptor.historyCleared'), 1500);
  }

  /**
   * 获取缓存的正则表达式
   */
  private getCachedRegex(pattern: string): RegExp {
    let regex = this.regexCache.get(pattern);
    if (!regex) {
      try {
        // 使用 'gi' 标志：g 表示全局匹配，i 表示不区分大小写
        regex = new RegExp(pattern, 'gi');
        this.regexCache.set(pattern, regex);
      } catch (error) {
        logger.error(`[SQLInterceptor] Invalid regex pattern: ${pattern}`, error as Error);
        // 返回永不匹配的正则
        return /(?!)/;
      }
    }
    // 重置 lastIndex
    regex.lastIndex = 0;
    return regex;
  }

  /**
   * 测试日志解析（用于诊断）
   * @param logLine 要测试的日志行
   * @returns 解析结果
   */
  public testLogParse(logLine: string): { 
    matched: boolean; 
    ruleName?: string; 
    type?: string; 
    extracted?: string;
    error?: string;
  } {
    try {
      const rules = this.getAllRules().filter(r => r.enabled);
      
      for (const rule of rules) {
        const lineMatchRegex = this.getCachedRegex(rule.lineMatchRegex);
        if (!lineMatchRegex.test(logLine)) {
          continue;
        }
        lineMatchRegex.lastIndex = 0;

        // 尝试提取 SQL
        const sqlRegex = this.getCachedRegex(rule.sqlExtractRegex);
        const sqlMatch = sqlRegex.exec(logLine);
        if (sqlMatch && sqlMatch[1]) {
          return {
            matched: true,
            ruleName: rule.name,
            type: 'sql',
            extracted: sqlMatch[1].trim(),
          };
        }

        // 尝试提取参数
        if (rule.parametersExtractRegex) {
          const paramRegex = this.getCachedRegex(rule.parametersExtractRegex);
          const paramMatch = paramRegex.exec(logLine);
          if (paramMatch && paramMatch[1]) {
            return {
              matched: true,
              ruleName: rule.name,
              type: 'parameters',
              extracted: paramMatch[1].trim(),
            };
          }
        }

        // 只是匹配了行，但没有提取到内容
        return {
          matched: true,
          ruleName: rule.name,
          type: 'matched_no_extract',
          extracted: logLine,
        };
      }

      return { matched: false };
    } catch (error) {
      return { 
        matched: false, 
        error: error instanceof Error ? error.message : String(error) 
      };
    }
  }

  /**
   * 获取当前配置
   */
  public getConfig(): SQLInterceptorConfig {
    return { ...this.config };
  }

  /**
   * 获取所有规则（包括禁用的）
   */
  public getAllRulesWithStatus(): SQLInterceptorRule[] {
    const builtin = BUILTIN_RULES.map(rule => ({
      ...rule,
      enabled: this.config.builtinRules[rule.name] !== false
    }));
    return [...builtin, ...this.config.customRules];
  }

  /**
   * 显示临时消息（自动关闭）
   */
  private showTemporaryMessage(message: string, duration: number = 2000): void {
    vscode.window.withProgress(
      {
        location: vscode.ProgressLocation.Notification,
        title: message,
        cancellable: false,
      },
      async (progress) => {
        await new Promise(resolve => setTimeout(resolve, duration));
      }
    );
  }

}
