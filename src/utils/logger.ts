/**
 * MyBatis Helper 插件日志系统
 * 支持分级日志输出到 VSCode 输出面板
 */

import * as vscode from "vscode";

/**
 * 日志级别枚举
 */
export enum LogLevel {
  DEBUG = "DEBUG",
  INFO = "INFO",
  WARN = "WARN",
  ERROR = "ERROR",
}

/**
 * 日志系统配置接口
 */
interface LoggerConfig {
  /** 日志输出级别 */
  level: LogLevel;
  /** 输出通道名称 */
  channelName: string;
}

/**
 * 日志系统类
 * 提供分级日志输出功能
 */
export class Logger {
  private static instance: Logger;
  private outputChannel: vscode.OutputChannel | null = null;
  private config: LoggerConfig;
  private isDisposed: boolean = false;

  /**
   * 私有构造函数，实现单例模式
   */
  private constructor() {
    this.config = {
      level: LogLevel.DEBUG,
      channelName: "MyBatis Helper",
    };
    this.createOutputChannel();
    this.updateConfig();
  }

  /**
   * 创建输出通道
   */
  private createOutputChannel(): void {
    if (!this.outputChannel || this.isDisposed) {
      this.outputChannel = vscode.window.createOutputChannel(
        this.config.channelName,
      );
      this.isDisposed = false;
    }
  }

  /**
   * 获取日志系统实例
   * @returns Logger 实例
   */
  public static getInstance(): Logger {
    if (!Logger.instance) {
      Logger.instance = new Logger();
    } else if (Logger.instance.isDisposed) {
      // 如果实例被 dispose 了，重新创建 output channel
      Logger.instance.createOutputChannel();
    }
    return Logger.instance;
  }

  /**
   * 更新日志配置
   * 从 VSCode 配置中读取日志级别
   */
  private updateConfig(): void {
    const config = vscode.workspace.getConfiguration("mybatis-helper");
    const logLevel = config
      .get<string>("logOutputLevel", "debug")
      .toUpperCase() as LogLevel;
    this.config.level =
      LogLevel[logLevel as keyof typeof LogLevel] || LogLevel.DEBUG;
  }

  /**
   * 监听配置变化，更新日志级别
   */
  public registerConfigListener(): vscode.Disposable {
    return vscode.workspace.onDidChangeConfiguration((e) => {
      if (e.affectsConfiguration("mybatis-helper.logOutputLevel")) {
        this.updateConfig();
      }
    });
  }

  /**
   * 检查是否应该输出指定级别的日志
   * @param level 日志级别
   * @returns 是否应该输出
   */
  private shouldLog(level: LogLevel): boolean {
    const levels = [
      LogLevel.DEBUG,
      LogLevel.INFO,
      LogLevel.WARN,
      LogLevel.ERROR,
    ];
    return levels.indexOf(level) >= levels.indexOf(this.config.level);
  }

  /**
   * 格式化日期时间为 yyyy-MM-dd HH:mm:ss.SSS 格式
   * @param date 日期对象
   * @returns 格式化后的日期时间字符串
   */
  private formatDateTime(date: Date): string {
    const year = date.getFullYear();
    const month = String(date.getMonth() + 1).padStart(2, "0");
    const day = String(date.getDate()).padStart(2, "0");
    const hours = String(date.getHours()).padStart(2, "0");
    const minutes = String(date.getMinutes()).padStart(2, "0");
    const seconds = String(date.getSeconds()).padStart(2, "0");
    const milliseconds = String(date.getMilliseconds()).padStart(3, "0");

    return `${year}-${month}-${day} ${hours}:${minutes}:${seconds}.${milliseconds}`;
  }

  /**
   * ANSI 颜色代码
   */
  private getColorCode(level: LogLevel): string {
    switch (level) {
      case LogLevel.DEBUG:
        return "\u001B[36m"; // 青色
      case LogLevel.INFO:
        return "\u001B[32m"; // 绿色
      case LogLevel.WARN:
        return "\u001B[33m"; // 黄色
      case LogLevel.ERROR:
        return "\u001B[31m"; // 红色
      default:
        return "\u001B[0m"; // 默认颜色
    }
  }

  /**
   * 重置颜色代码
   */
  private readonly resetColor = "\u001B[0m";

  /**
   * 格式化日志消息
   * @param level 日志级别
   * @param message 日志消息
   * @param metadata 附加元数据
   * @returns 格式化后的日志字符串
   */
  private formatMessage(
    level: LogLevel,
    message: string,
    metadata?: any,
  ): string {
    const timestamp = this.formatDateTime(new Date());

    // 为不同日志级别使用不同的前缀，VS Code输出通道会根据主题自动着色
    let levelPrefix: string;
    switch (level) {
      case LogLevel.DEBUG:
        levelPrefix = "🔍";
        break;
      case LogLevel.INFO:
        levelPrefix = "ℹ️";
        break;
      case LogLevel.WARN:
        levelPrefix = "⚠️";
        break;
      case LogLevel.ERROR:
        levelPrefix = "❌";
        break;
      default:
        levelPrefix = "";
    }

    let logMessage = `${timestamp} ${levelPrefix} [${level}] ${message}`;

    if (metadata) {
      try {
        const metadataStr = JSON.stringify(metadata, null, 2);
        logMessage += `\n${metadataStr}`;
      } catch (error) {
        logMessage += `\nFailed to stringify metadata: ${error}`;
      }
    }

    return logMessage;
  }

  /**
   * 确保输出通道可用
   */
  private ensureOutputChannel(): vscode.OutputChannel | null {
    if (!this.outputChannel || this.isDisposed) {
      this.createOutputChannel();
    }
    return this.outputChannel;
  }

  /**
   * 输出 DEBUG 级别的日志
   * @param message 日志消息
   * @param metadata 附加元数据
   */
  public debug(message: string, metadata?: any): void {
    if (this.shouldLog(LogLevel.DEBUG)) {
      const channel = this.ensureOutputChannel();
      if (channel) {
        const logMessage = this.formatMessage(
          LogLevel.DEBUG,
          message,
          metadata,
        );
        channel.appendLine(logMessage);
      }
    }
  }

  /**
   * 输出 INFO 级别的日志
   * @param message 日志消息
   * @param metadata 附加元数据
   */
  public info(message: string, metadata?: any): void {
    if (this.shouldLog(LogLevel.INFO)) {
      const channel = this.ensureOutputChannel();
      if (channel) {
        const logMessage = this.formatMessage(LogLevel.INFO, message, metadata);
        channel.appendLine(logMessage);
      }
    }
  }

  /**
   * 输出 WARN 级别的日志
   * @param message 日志消息
   * @param metadata 附加元数据
   */
  public warn(message: string, metadata?: any): void {
    if (this.shouldLog(LogLevel.WARN)) {
      const channel = this.ensureOutputChannel();
      if (channel) {
        const logMessage = this.formatMessage(LogLevel.WARN, message, metadata);
        channel.appendLine(logMessage);
      }
    }
  }

  /**
   * 输出 ERROR 级别的日志
   * @param message 日志消息
   * @param error 错误对象或任意类型
   */
  public error(message: string, error?: Error | unknown): void {
    if (this.shouldLog(LogLevel.ERROR)) {
      const channel = this.ensureOutputChannel();
      if (channel) {
        let metadata: { error: string; stack?: string } | undefined;
        if (error) {
          if (error instanceof Error) {
            metadata = {
              error: error.message,
              stack: error.stack,
            };
          } else {
            metadata = {
              error: String(error),
            };
          }
        }
        const logMessage = this.formatMessage(
          LogLevel.ERROR,
          message,
          metadata,
        );
        channel.appendLine(logMessage);
      }
    }
  }

  /**
   * 显示日志输出面板
   */
  public showOutputChannel(): void {
    const channel = this.ensureOutputChannel();
    if (channel) {
      channel.show();
    }
  }

  /**
   * 清理资源
   */
  public dispose(): void {
    if (this.outputChannel && !this.isDisposed) {
      this.outputChannel.dispose();
      this.isDisposed = true;
      this.outputChannel = null;
    }
  }
}

/**
 * Logger实例，供外部直接使用
 */
export const logger = Logger.getInstance();
