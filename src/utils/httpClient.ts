/**
 * HTTP 客户端工具
 * 基于 axios 的封装，支持超时、重试、指数退避
 *
 * @author MyBatis Helper Team
 * @version 1.0.0
 */

import axios, { AxiosInstance, AxiosRequestConfig, AxiosResponse } from "axios";
import { logger } from "./logger";

/**
 * HTTP 客户端配置接口
 */
export interface HttpClientConfig {
  /** 基础 URL */
  baseURL?: string;
  /** 超时时间（毫秒） */
  timeout?: number;
  /** 最大重试次数 */
  maxRetries?: number;
  /** 重试延迟基数（毫秒） */
  retryDelay?: number;
}

/**
 * HTTP 客户端类
 * 封装 axios，提供统一的 HTTP 请求接口
 */
export class HttpClient {
  private static instance: HttpClient;
  private client: AxiosInstance;
  private maxRetries: number;
  private retryDelay: number;

  private constructor(config: HttpClientConfig = {}) {
    this.maxRetries = config.maxRetries ?? 3;
    this.retryDelay = config.retryDelay ?? 1000;

    this.client = axios.create({
      baseURL: config.baseURL,
      timeout: config.timeout ?? 15000,
      headers: {
        "User-Agent": "MyBatis-Helper-VSCode-Extension/1.0.0",
      },
    });

    // 请求拦截器
    this.client.interceptors.request.use(
      (config) => {
        logger.debug("HTTP Request:", {
          method: config.method,
          url: config.url,
          headers: config.headers,
        });
        return config;
      },
      (error) => {
        logger.error("HTTP Request Error:", error);
        return Promise.reject(error);
      },
    );

    // 响应拦截器
    this.client.interceptors.response.use(
      (response) => {
        logger.debug("HTTP Response:", {
          status: response.status,
          url: response.config.url,
        });
        return response;
      },
      (error) => {
        logger.error("HTTP Response Error:", error.message);
        return Promise.reject(error);
      },
    );
  }

  /**
   * 获取单例实例
   */
  public static getInstance(config?: HttpClientConfig): HttpClient {
    if (!HttpClient.instance) {
      HttpClient.instance = new HttpClient(config);
    }
    return HttpClient.instance;
  }

  /**
   * 判断错误是否应该重试
   * 4xx 客户端错误不重试，5xx 服务器错误和网络错误重试
   */
  private isRetryableError(error: any): boolean {
    // 检查 error 是否为有效对象
    if (!error || typeof error !== "object") {
      return false;
    }

    // 检查 axios 错误码
    if (error.code) {
      // 超时错误
      if (error.code === "ECONNABORTED" || error.code === "ETIMEDOUT") {
        return true;
      }

      // DNS 解析失败
      if (error.code === "ENOTFOUND" || error.code === "EAI_AGAIN") {
        return true;
      }

      // 连接被拒绝或重置
      if (error.code === "ECONNREFUSED" || error.code === "ECONNRESET") {
        return true;
      }

      // 网络不可达
      if (error.code === "ENETUNREACH" || error.code === "EHOSTUNREACH") {
        return true;
      }
    }

    // 没有响应对象，说明是网络错误（超时、DNS 失败等）
    if (!error.response) {
      return true;
    }

    const status = error.response.status;

    // 4xx 客户端错误：不重试（除了 429 限流）
    if (status >= 400 && status < 500) {
      return status === 429; // Too Many Requests
    }

    // 5xx 服务器错误：重试
    if (status >= 500) {
      return true;
    }

    return false;
  }

  /**
   * 执行 HTTP 请求（带重试机制）
   * @param config Axios 请求配置
   * @returns 响应数据
   */
  private async requestWithRetry<T>(
    config: AxiosRequestConfig,
  ): Promise<AxiosResponse<T>> {
    let lastError: Error | undefined;

    for (let attempt = 0; attempt <= this.maxRetries; attempt++) {
      try {
        return await this.client.request<T>(config);
      } catch (error) {
        lastError = error as Error;

        // 如果是最后一次尝试，抛出错误
        if (attempt === this.maxRetries) {
          break;
        }

        // 检查是否应该重试
        if (!this.isRetryableError(error)) {
          logger.debug(
            `HTTP request failed with non-retryable error (status: ${(error as any).response?.status}), not retrying`,
          );
          break;
        }

        // 计算延迟时间（指数退避）
        const delay = this.retryDelay * Math.pow(2, attempt);
        logger.warn(
          `HTTP request failed (attempt ${attempt + 1}/${this.maxRetries + 1}), retrying in ${delay}ms...`,
          {
            url: config.url,
            error: lastError.message,
            status: (error as any).response?.status,
          },
        );

        await this.sleep(delay);
      }
    }

    throw lastError;
  }

  /**
   * 延迟执行
   */
  private sleep(ms: number): Promise<void> {
    return new Promise((resolve) => setTimeout(resolve, ms));
  }

  /**
   * GET 请求
   * @param url URL
   * @param config 请求配置
   */
  public async get<T>(url: string, config?: AxiosRequestConfig): Promise<T> {
    const response = await this.requestWithRetry<T>({
      method: "GET",
      url,
      ...config,
    });
    return response.data;
  }

  /**
   * GET 请求（返回文本）
   * @param url URL
   * @param config 请求配置
   */
  public async getText(
    url: string,
    config?: AxiosRequestConfig,
  ): Promise<string> {
    const response = await this.requestWithRetry<string>({
      method: "GET",
      url,
      responseType: "text",
      ...config,
    });
    return response.data;
  }

  /**
   * POST 请求
   * @param url URL
   * @param data 请求体
   * @param config 请求配置
   */
  public async post<T>(
    url: string,
    data?: unknown,
    config?: AxiosRequestConfig,
  ): Promise<T> {
    const response = await this.requestWithRetry<T>({
      method: "POST",
      url,
      data,
      ...config,
    });
    return response.data;
  }
}

// 导出默认实例
export const httpClient = HttpClient.getInstance();
