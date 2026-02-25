/**
 * SQL 历史 TreeView 提供者
 * 
 * 在侧边栏显示 SQL 查询历史列表
 */

import * as vscode from 'vscode';
import { SQLQueryRecord } from './types';
import { SQLInterceptorService } from './sqlInterceptorService';
import { THRESHOLDS } from '../../utils/constants';

/**
 * TreeView 数据项类型
 */
export enum SQLTreeItemType {
  /** SQL 查询记录 */
  Query = 'query',
  /** 参数列表 */
  Parameters = 'parameters',
  /** 单个参数 */
  Parameter = 'parameter',
  /** 执行时间 */
  ExecutionTime = 'executionTime',
  /** 分组（按时间） */
  Group = 'group',
}

/**
 * SQL TreeView 数据项
 */
export class SQLTreeItem extends vscode.TreeItem {
  constructor(
    public readonly type: SQLTreeItemType,
    public readonly label: string,
    public readonly collapsibleState: vscode.TreeItemCollapsibleState,
    public readonly query?: SQLQueryRecord,
    public readonly contextValue?: string,
    public readonly tooltip?: string,
    public readonly iconPath?: vscode.ThemeIcon | { light: vscode.Uri; dark: vscode.Uri },
    public readonly command?: vscode.Command
  ) {
    super(label, collapsibleState);
    this.contextValue = contextValue || type;
    this.tooltip = tooltip || label;
    
    // 设置图标
    if (!iconPath) {
      switch (type) {
        case SQLTreeItemType.Query:
          this.iconPath = new vscode.ThemeIcon('database');
          break;
        case SQLTreeItemType.Parameters:
          this.iconPath = new vscode.ThemeIcon('list-unordered');
          break;
        case SQLTreeItemType.Parameter:
          this.iconPath = new vscode.ThemeIcon('symbol-variable');
          break;
        case SQLTreeItemType.ExecutionTime:
          this.iconPath = new vscode.ThemeIcon('clock');
          break;
        case SQLTreeItemType.Group:
          this.iconPath = new vscode.ThemeIcon('folder');
          break;
      }
    } else {
      this.iconPath = iconPath;
    }
  }
}

/**
 * SQL 历史 TreeView 数据提供者
 */
export class SQLHistoryTreeProvider implements vscode.TreeDataProvider<SQLTreeItem> {
  private _onDidChangeTreeData: vscode.EventEmitter<SQLTreeItem | undefined | null | void> = new vscode.EventEmitter<SQLTreeItem | undefined | null | void>();
  readonly onDidChangeTreeData: vscode.Event<SQLTreeItem | undefined | null | void> = this._onDidChangeTreeData.event;

  private interceptorService: SQLInterceptorService;
  private disposables: vscode.Disposable[] = [];

  constructor() {
    this.interceptorService = SQLInterceptorService.getInstance();
    
    // 监听 SQL 记录事件
    this.disposables.push(
      this.interceptorService.onSQLRecorded(() => {
        this.refresh();
      })
    );

    // 监听历史清除事件
    this.disposables.push(
      this.interceptorService.onHistoryCleared(() => {
        this.refresh();
      })
    );
  }

  /**
   * 刷新 TreeView
   */
  refresh(): void {
    this._onDidChangeTreeData.fire();
  }

  /**
   * 获取 TreeItem
   */
  getTreeItem(element: SQLTreeItem): vscode.TreeItem {
    return element;
  }

  /**
   * 获取子节点
   */
  getChildren(element?: SQLTreeItem): Thenable<SQLTreeItem[]> {
    if (!element) {
      // 根节点 - 返回 SQL 历史列表
      return Promise.resolve(this.getSQLHistoryItems());
    }

    // 子节点
    switch (element.type) {
      case SQLTreeItemType.Query:
        return Promise.resolve(this.getQueryDetailItems(element.query!));
      case SQLTreeItemType.Parameters:
        return Promise.resolve(this.getParameterItems(element.query!));
      default:
        return Promise.resolve([]);
    }
  }

  /**
   * 获取 SQL 历史列表项
   */
  private getSQLHistoryItems(): SQLTreeItem[] {
    const history = this.interceptorService.getHistory();
    
    if (history.length === 0) {
      return [
        new SQLTreeItem(
          SQLTreeItemType.Group,
          vscode.l10n.t('sqlTree.noRecords'),
          vscode.TreeItemCollapsibleState.None,
          undefined,
          'empty',
          vscode.l10n.t('sqlTree.noRecordsTooltip')
        )
      ];
    }

    return history.map((query, index) => {
      // 生成简短标签（SQL 前 N 个字符）
      const shortSQL = this.truncateSQL(query.formattedSQL || query.rawSQL || '', THRESHOLDS.SQL_DISPLAY_TRUNCATE);
      
      // 格式化时间
      const timeStr = this.formatTime(query.timestamp);
      
      // 操作类型
      const operationType = this.getOperationType(query.rawSQL || '');
      
      // 标签格式: [SELECT] SELECT * FROM user...
      const label = `[${operationType}] ${shortSQL}`;
      
      // 完整 SQL 作为 tooltip
      const tooltip = [
        `${vscode.l10n.t('sqlTree.time')}: ${timeStr}`,
        `${vscode.l10n.t('sqlTree.source')}: ${query.source === 'debug' ? 'Debug Console' : 'Terminal'}`,
        `${vscode.l10n.t('sqlTree.rule')}: ${query.matchedRule}`,
        '---',
        query.formattedSQL || query.fullSQL || query.rawSQL || '',
      ].join('\n');

      // 根据操作类型设置不同图标
      let iconPath: vscode.ThemeIcon;
      switch (operationType.toUpperCase()) {
        case 'SELECT':
          iconPath = new vscode.ThemeIcon('search');
          break;
        case 'INSERT':
          iconPath = new vscode.ThemeIcon('add');
          break;
        case 'UPDATE':
          iconPath = new vscode.ThemeIcon('edit');
          break;
        case 'DELETE':
          iconPath = new vscode.ThemeIcon('trash');
          break;
        default:
          iconPath = new vscode.ThemeIcon('database');
      }

      return new SQLTreeItem(
        SQLTreeItemType.Query,
        label,
        vscode.TreeItemCollapsibleState.Collapsed,
        query,
        'sqlQuery',
        tooltip,
        iconPath,
        {
          command: 'mybatis-helper.showSqlDetail',
          title: vscode.l10n.t('sqlTree.showDetail'),
          arguments: [query]
        }
      );
    });
  }

  /**
   * 获取查询详情子项
   */
  private getQueryDetailItems(query: SQLQueryRecord): SQLTreeItem[] {
    const items: SQLTreeItem[] = [];

    // 参数列表项
    if (query.parameters && query.parameters.length > 0) {
      items.push(
        new SQLTreeItem(
          SQLTreeItemType.Parameters,
          vscode.l10n.t('sqlTree.parameters', { count: query.parameters.length }),
          vscode.TreeItemCollapsibleState.Collapsed,
          query,
          'sqlParameters',
          vscode.l10n.t('sqlTree.parametersTooltip', { count: query.parameters.length })
        )
      );
    }

    // 执行时间项
    if (query.executionTime !== undefined) {
      const timeLabel = vscode.l10n.t('sqlTree.executionTime', { time: query.executionTime });
      const warning = query.executionTime > 1000 ? ' ⚠️' : '';
      items.push(
        new SQLTreeItem(
          SQLTreeItemType.ExecutionTime,
          timeLabel + warning,
          vscode.TreeItemCollapsibleState.None,
          query,
          'sqlExecutionTime',
          vscode.l10n.t('sqlTree.executionTimeTooltip', { time: query.executionTime })
        )
      );
    }

    // 查看完整 SQL 按钮
    items.push(
      new SQLTreeItem(
        SQLTreeItemType.Query,
        vscode.l10n.t('sqlTree.viewFullSQL'),
        vscode.TreeItemCollapsibleState.None,
        query,
        'viewFullSQL',
        vscode.l10n.t('sqlTree.viewFullSQLTooltip'),
        new vscode.ThemeIcon('preview'),
        {
          command: 'mybatis-helper.showSqlDetail',
          title: vscode.l10n.t('sqlTree.showDetail'),
          arguments: [query]
        }
      )
    );

    // 复制 SQL 按钮
    items.push(
      new SQLTreeItem(
        SQLTreeItemType.Query,
        vscode.l10n.t('sqlTree.copySQL'),
        vscode.TreeItemCollapsibleState.None,
        query,
        'copySQL',
        vscode.l10n.t('sqlTree.copySQLTooltip'),
        new vscode.ThemeIcon('copy'),
        {
          command: 'mybatis-helper.copySqlFromTree',
          title: vscode.l10n.t('sqlTree.copySQL'),
          arguments: [query]
        }
      )
    );

    return items;
  }

  /**
   * 获取参数列表项
   */
  private getParameterItems(query: SQLQueryRecord): SQLTreeItem[] {
    if (!query.parameters) {
      return [];
    }

    return query.parameters.map((param, index) => {
      const label = `${index + 1}. ${param.value} (${param.type})`;
      return new SQLTreeItem(
        SQLTreeItemType.Parameter,
        label,
        vscode.TreeItemCollapsibleState.None,
        query,
        'sqlParameter',
        vscode.l10n.t('sqlTree.parameterTooltip', { 
          index: index + 1, 
          value: param.value, 
          type: param.type 
        })
      );
    });
  }

  /**
   * 截断 SQL 显示
   */
  private truncateSQL(sql: string, maxLength: number): string {
    // 移除多余空白
    const trimmed = sql.replace(/\s+/g, ' ').trim();
    if (trimmed.length <= maxLength) {
      return trimmed;
    }
    return trimmed.substring(0, maxLength) + '...';
  }

  /**
   * 格式化时间
   */
  private formatTime(date: Date): string {
    const now = new Date();
    const diff = now.getTime() - date.getTime();
    
    // 小于 1 分钟，显示 "刚刚"
    if (diff < 60000) {
      return vscode.l10n.t('sqlTree.timeJustNow');
    }
    
    // 小于 1 小时，显示 "X 分钟前"
    if (diff < 3600000) {
      const minutes = Math.floor(diff / 60000);
      return vscode.l10n.t('sqlTree.timeMinutesAgo', { minutes });
    }
    
    // 否则显示具体时间
    return date.toLocaleTimeString();
  }

  /**
   * 获取 SQL 操作类型
   */
  private getOperationType(sql: string): string {
    const trimmed = sql.trim().toUpperCase();
    const match = trimmed.match(/^(SELECT|INSERT|UPDATE|DELETE|MERGE|CREATE|DROP|ALTER|TRUNCATE|EXEC|CALL)\b/);
    return match ? match[1] : 'SQL';
  }

  /**
   * 释放资源
   */
  dispose(): void {
    this.disposables.forEach(d => d.dispose());
    this.disposables = [];
  }
}
