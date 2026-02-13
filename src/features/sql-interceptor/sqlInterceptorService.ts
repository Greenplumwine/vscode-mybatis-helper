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
 * 内置规则 - MyBatis 标准格式
 */
const BUILTIN_RULES: SQLInterceptorRule[] = [
  {
    name: 'mybatis-standard',
    enabled: true,
    description: 'MyBatis standard log format (Preparing: / Parameters:)',
    lineMatchRegex: '(?i)(mybatis|sqlsession|preparing:|parameters:)',
    sqlExtractRegex: 'Preparing:\\s*(.+)',
    parametersExtractRegex: 'Parameters:\\s*(.+)',
    executionTimeExtractRegex: 'Executed\\s+in\\s*(\\d+)\\s*ms',
    paramParseRegex: '([^\\(]+)\\(([^\\)]+)\\)',
    singleLineMode: true,
  },
  {
    name: 'mybatis-debug',
    enabled: true,
    description: 'MyBatis debug level log format',
    lineMatchRegex: '(?i)\\[DEBUG\\].*(preparing|parameters)',
    sqlExtractRegex: '(?i)\\[DEBUG\\].*Preparing:\\s*(.+)',
    parametersExtractRegex: '(?i)\\[DEBUG\\].*Parameters:\\s*(.+)',
    executionTimeExtractRegex: '(?i)\\[DEBUG\\].*Executed\\s+in\\s*(\\d+)\\s*ms',
    paramParseRegex: '([^\\(]+)\\(([^\\)]+)\\)',
    singleLineMode: true,
  }
];

export class SQLInterceptorService {
  private static instance: SQLInterceptorService;
  private config: SQLInterceptorConfig;
  private isEnabled: boolean = false;
  private sqlHistory: SQLQueryRecord[] = [];
  private pendingQuery: Partial<SQLQueryRecord> | null = null;
  private pendingTimer: NodeJS.Timeout | null = null;
  private sqlParser: SQLParser;
  
  // 事件发射器
  private readonly _onSQLRecorded = new vscode.EventEmitter<SQLQueryRecord>();
  private readonly _onHistoryCleared = new vscode.EventEmitter<void>();
  private readonly _onStateChanged = new vscode.EventEmitter<boolean>();
  
  public readonly onSQLRecorded = this._onSQLRecorded.event;
  public readonly onHistoryCleared = this._onHistoryCleared.event;
  public readonly onStateChanged = this._onStateChanged.event;

  // 已编译的正则表达式缓存
  private regexCache: Map<string, RegExp> = new Map();

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
      listenDebugConsole: true,
      listenTerminal: true,
    };
  }

  /**
   * 初始化服务
   */
  public async initialize(): Promise<void> {
    logger.info('[SQLInterceptor] Initializing...');
    
    // 加载配置
    await this.loadConfig();
    
    // 如果启用，自动开始拦截
    if (this.config.enabled) {
      this.start();
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
      listenDebugConsole: workspaceConfig.get('sqlInterceptor.listenDebugConsole', true),
      listenTerminal: workspaceConfig.get('sqlInterceptor.listenTerminal', true),
      terminalFilter: workspaceConfig.get('sqlInterceptor.terminalFilter', ''),
    };

    // 更新 SQL parser 数据库类型
    this.sqlParser.setDatabaseType(this.config.databaseType as any);
    
    // 清空正则缓存
    this.regexCache.clear();
    
    logger.debug('[SQLInterceptor] Config loaded:', this.config);
  }

  /**
   * 获取所有可用的规则（内置 + 自定义）
   */
  public getAllRules(): SQLInterceptorRule[] {
    const builtinEnabled = BUILTIN_RULES.map(rule => ({
      ...rule,
      enabled: this.config.builtinRules[rule.name] !== false // 默认启用
    }));
    
    return [...builtinEnabled, ...this.config.customRules];
  }

  /**
   * 开始拦截
   */
  public start(): void {
    if (this.isEnabled) {
      return;
    }
    
    this.isEnabled = true;
    
    // 监听调试控制台
    if (this.config.listenDebugConsole) {
      this.listenToDebugConsole();
    }
    
    // 监听终端
    if (this.config.listenTerminal) {
      this.listenToTerminal();
    }
    
    this._onStateChanged.fire(true);
    logger.info('[SQLInterceptor] Started');
    
    vscode.window.showInformationMessage(
      vscode.l10n.t('sqlInterceptor.started')
    );
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
    
    vscode.window.showInformationMessage(
      vscode.l10n.t('sqlInterceptor.stopped')
    );
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
   */
  private listenToDebugConsole(): void {
    // 监听调试会话开始/结束
    vscode.debug.onDidStartDebugSession(session => {
      logger.debug(`[SQLInterceptor] Debug session started: ${session.name}`);
    });

    vscode.debug.onDidTerminateDebugSession(session => {
      logger.debug(`[SQLInterceptor] Debug session terminated: ${session.name}`);
      // 清理当前查询
      this.pendingQuery = null;
    });

    // 监听调试输出
    vscode.debug.onDidReceiveDebugSessionCustomEvent(event => {
      if (!this.isEnabled) return;
      
      if (event.event === 'output' && event.body) {
        const output = event.body as { category?: string; output: string };
        // 只处理 console 和 stdout 输出
        if (!output.category || 
            output.category === 'console' || 
            output.category === 'stdout' ||
            output.category === 'stderr') {
          this.processLogLine(output.output, 'debug');
        }
      }
    });
  }

  /**
   * 监听终端输出
   */
  private listenToTerminal(): void {
    // VS Code 没有直接提供终端输出监听 API
    // 我们通过监听终端创建事件，然后通过其他方式获取输出
    
    vscode.window.onDidOpenTerminal(terminal => {
      if (!this.isEnabled) return;
      
      logger.debug(`[SQLInterceptor] Terminal opened: ${terminal.name}`);
      
      // 检查终端名称是否符合过滤条件
      if (this.config.terminalFilter && 
          !terminal.name.includes(this.config.terminalFilter)) {
        logger.debug(`[SQLInterceptor] Terminal filtered out: ${terminal.name}`);
        return;
      }
      
      // 注意：VS Code API 目前不支持直接读取终端输出
      // 我们需要提示用户使用其他方式
      // 实际实现可能需要通过任务监听或扩展 API
    });

    // 监听任务输出
    vscode.tasks.onDidStartTaskProcess(e => {
      if (!this.isEnabled) return;
      logger.debug(`[SQLInterceptor] Task started: ${e.execution.task.name}`);
    });
  }

  /**
   * 处理日志行
   */
  public processLogLine(line: string, source: 'debug' | 'terminal'): void {
    if (!this.isEnabled || !line) return;

    try {
      const parsed = this.parseLogLine(line, source);
      
      if (!parsed || parsed.type === 'unknown') {
        return;
      }

      // 处理解析后的日志
      this.handleParsedLog(parsed, source);
    } catch (error) {
      logger.error('[SQLInterceptor] Error processing log line:', error as Error);
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

      // 尝试提取 SQL
      const sqlRegex = this.getCachedRegex(rule.sqlExtractRegex);
      const sqlMatch = sqlRegex.exec(line);
      if (sqlMatch && sqlMatch[1]) {
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

  /**
   * 处理解析后的日志
   */
  private handleParsedLog(parsed: ParsedLogLine, source: 'debug' | 'terminal'): void {
    switch (parsed.type) {
      case 'sql':
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
        
        // 设置超时，如果在指定时间内没有收到参数，则直接保存
        this.pendingTimer = setTimeout(() => {
          this.finalizePendingQuery();
        }, 5000);
        break;

      case 'parameters':
        if (this.pendingQuery) {
          // 解析参数
          const params = this.parseParameters(
            parsed.parameters!, 
            this.getRuleByName(parsed.ruleName)
          );
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
          }
        }
        break;

      case 'executionTime':
        if (this.pendingQuery) {
          this.pendingQuery.executionTime = parsed.executionTime;
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
    
    // 使用规则中的正则或默认正则
    const parseRegex = rule?.paramParseRegex 
      ? this.getCachedRegex(rule.paramParseRegex)
      : /([^\(]+)\(([^\)]+)\)/g;
    
    let match;
    while ((match = parseRegex.exec(paramsString)) !== null) {
      params.push({
        value: match[1].trim(),
        type: match[2].trim(),
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
    // 使用 SQLParser 填充参数
    const query = this.sqlParser.processSQLQuery({
      id: 'temp',
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
    
    vscode.window.showInformationMessage(
      vscode.l10n.t('sqlInterceptor.historyCleared')
    );
  }

  /**
   * 获取缓存的正则表达式
   */
  private getCachedRegex(pattern: string): RegExp {
    let regex = this.regexCache.get(pattern);
    if (!regex) {
      try {
        regex = new RegExp(pattern, 'g');
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
   * 根据名称获取规则
   */
  private getRuleByName(name: string): SQLInterceptorRule | undefined {
    return this.getAllRules().find(r => r.name === name);
  }
}
