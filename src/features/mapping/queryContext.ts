/**
 * 查询上下文解析器
 *
 * 从当前活动编辑器或文件路径自动推断查询上下文，
 * 使调用方无需手动传入 referencePath。
 */

import * as vscode from "vscode";
import { QueryContext } from "./types";
import { ModuleResolver } from "./moduleResolver";

export class QueryContextResolver {
  private static instance: QueryContextResolver;
  private moduleResolver: ModuleResolver;

  private constructor() {
    this.moduleResolver = ModuleResolver.getInstance();
  }

  public static getInstance(): QueryContextResolver {
    if (!QueryContextResolver.instance) {
      QueryContextResolver.instance = new QueryContextResolver();
    }
    return QueryContextResolver.instance;
  }

  /**
   * 从活动编辑器推断查询上下文
   */
  public inferFromActiveEditor(): QueryContext {
    const editor = vscode.window.activeTextEditor;
    if (!editor) {
      return {};
    }
    return this.inferFromFilePath(editor.document.uri.fsPath);
  }

  /**
   * 从文件路径推断查询上下文
   */
  public inferFromFilePath(filePath: string): QueryContext {
    const module = this.moduleResolver.resolveModuleForPath(filePath);
    if (module) {
      return { moduleId: module.moduleId };
    }
    return { referencePath: filePath };
  }

  /**
   * 从文档推断查询上下文
   */
  public inferFromDocument(document: vscode.TextDocument): QueryContext {
    return this.inferFromFilePath(document.uri.fsPath);
  }

  /**
   * 创建带模块 ID 的查询上下文
   */
  public withModuleId(moduleId: string): QueryContext {
    return { moduleId };
  }

  /**
   * 创建带参考路径的查询上下文
   */
  public withReferencePath(referencePath: string): QueryContext {
    return { referencePath };
  }
}
