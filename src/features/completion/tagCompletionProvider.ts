/**
 * MyBatis XML 标签补全 Provider
 *
 * 设计模式：
 * - 策略模式 (Strategy Pattern): 根据触发字符选择不同的补全逻辑
 * - 外观模式 (Facade Pattern): 封装 DTD 解析细节
 *
 * 功能：
 * - 标签名补全（输入 < 时）
 * - 属性名补全（输入空格时）
 * - 属性值补全（输入 " 时）
 *
 * @module features/completion/tagCompletionProvider
 */

import * as vscode from "vscode";
import { TagHierarchyResolver } from "../../services/parsing";
import { Logger } from "../../utils/logger";

/**
 * 标签层级信息（本地定义，避免循环依赖）
 */
interface TagHierarchy {
  parentTag: string;
  allowedChildren: string[];
  allowedAttributes: string[];
}

/**
 * XML 解析上下文
 */
interface XmlParseContext {
  /** 父标签名 */
  parentTag: string | null;
  /** 当前标签名 */
  currentTag: string | null;
  /** 当前属性名 */
  currentAttribute: string | null;
  /** 是否在标签内 */
  isInTag: boolean;
  /** 是否在属性值内 */
  isInAttributeValue: boolean;
}

/**
 * MyBatis XML 标签补全 Provider
 */
export class TagCompletionProvider implements vscode.CompletionItemProvider {
  /** 触发字符 */
  static readonly triggerCharacters = [
    "<",
    " ",
    '"',
    "'",
    "a",
    "b",
    "c",
    "d",
    "e",
    "f",
    "g",
    "h",
    "i",
    "j",
    "k",
    "l",
    "m",
    "n",
    "o",
    "p",
    "q",
    "r",
    "s",
    "t",
    "u",
    "v",
    "w",
    "x",
    "y",
    "z",
  ] as const;

  /** 标签层级解析器 */
  private hierarchyResolver = TagHierarchyResolver.getInstance();

  /** 日志记录器 */
  private logger = Logger.getInstance();

  /**
   * VS Code 补全接口实现
   */
  async provideCompletionItems(
    document: vscode.TextDocument,
    position: vscode.Position,
    token: vscode.CancellationToken,
    context: vscode.CompletionContext,
  ): Promise<vscode.CompletionItem[]> {
    // 检查是否取消
    if (token.isCancellationRequested) {
      return [];
    }

    const triggerChar = context.triggerCharacter;
    const xmlContext = this.parseXmlContext(document, position);

    this.logger.debug(
      `Tag completion triggered by: ${triggerChar}, context:`,
      xmlContext,
    );

    try {
      // 获取标签层级（使用内置兜底，快速响应）
      const hierarchy = await this.getTagHierarchy();

      // 核心逻辑：如果在标签内（输入标签名中），始终提供标签名补全
      if (xmlContext.isInTag) {
        // 计算替换范围：从 < 的位置到光标后可能的 >
        const lineText = document.lineAt(position.line).text;
        const charBefore = lineText.substring(0, position.character);
        const ltIndex = charBefore.lastIndexOf("<");

        let range: vscode.Range | undefined;
        if (ltIndex !== -1) {
          // 查找光标后是否有 VS Code 自动闭合的 >
          let endPos = position.character;
          const afterCursor = lineText.substring(position.character);
          // 匹配可选的 > 或 />
          const autoCloseMatch = afterCursor.match(/^(\/?>)/);
          if (autoCloseMatch) {
            endPos += autoCloseMatch[1].length;
          }

          range = new vscode.Range(
            position.line,
            ltIndex,
            position.line,
            endPos,
          );
          this.logger.debug(
            `Tag completion range: ${range.start.character}-${range.end.character}, text: "${lineText.substring(ltIndex, endPos)}"`,
          );
        }

        // 根据触发字符决定提供什么补全
        switch (triggerChar) {
          case " ":
            // 空格触发：如果在标签内且有标签名
            if (xmlContext.currentTag) {
              // 检查光标后是否是标签结束（> 或 />）或者后面是另一个属性开头
              const afterCursor = lineText.substring(position.character);
              // 如果后面是 > 或 />，或者后面是非标签字符（如其他属性），提供属性补全
              if (
                afterCursor.trim().startsWith(">") ||
                afterCursor.trim().startsWith("/>") ||
                /^\s*\w/.test(afterCursor)
              ) {
                // 在标签名和 > 之间输入空格，或者在属性之间，提供属性补全
                return this.provideAttributes(hierarchy, xmlContext.currentTag);
              }
              // 如果光标前面是空格且不在属性值内，也提供属性补全
              // 这种情况发生在删除属性后，光标停在空格位置
              if (!xmlContext.isInAttributeValue) {
                const beforeCursor = lineText.substring(0, position.character);
                // 检查是否在标签内且前面是空格（可能刚删除了属性）
                const lastLtIndex = beforeCursor.lastIndexOf("<");
                const lastGtIndex = beforeCursor.lastIndexOf(">");
                if (lastLtIndex > lastGtIndex && /\s$/.test(beforeCursor)) {
                  // 在标签内且以空格结尾，提供属性补全
                  return this.provideAttributes(
                    hierarchy,
                    xmlContext.currentTag,
                  );
                }
              }
              // 否则继续提供标签名补全（用户可能在输入带空格的标签名，虽然不常见）
            }
            return this.provideTagNames(
              hierarchy,
              xmlContext.parentTag,
              range,
              xmlContext.currentTag,
            );
          case '"':
          case "'":
            // 引号触发：提供属性值补全
            if (
              xmlContext.isInAttributeValue &&
              xmlContext.currentTag &&
              xmlContext.currentAttribute
            ) {
              return this.provideAttributeValues(
                hierarchy,
                xmlContext.currentTag,
                xmlContext.currentAttribute,
              );
            }
            // 否则提供标签名补全
            return this.provideTagNames(
              hierarchy,
              xmlContext.parentTag,
              range,
              xmlContext.currentTag,
            );
          default:
            // < 或其他字符触发：提供标签名补全（带过滤）
            // 但如果正在输入属性名（currentAttribute 不为 null），提供属性补全
            if (
              xmlContext.currentTag &&
              xmlContext.currentAttribute &&
              !xmlContext.isInAttributeValue
            ) {
              // 正在输入属性名，提供属性补全
              return this.provideAttributes(hierarchy, xmlContext.currentTag);
            }
            const items = this.provideTagNames(
              hierarchy,
              xmlContext.parentTag,
              range,
              xmlContext.currentTag,
            );
            this.logger.debug(
              `Tag completion provided ${items.length} items: ${items.map((i) => i.label).join(", ")}`,
            );
            // 详细日志第一个 item
            if (items.length > 0) {
              const first = items[0];
              this.logger.debug(
                `First item: label=${first.label}, kind=${first.kind}, insertText=${typeof first.insertText === "string" ? first.insertText : "(SnippetString)"}`,
              );
              const rangeStr =
                first.range && "start" in first.range
                  ? `${first.range.start.character}-${first.range.end.character}`
                  : "undefined";
              this.logger.debug(`First item range: ${rangeStr}`);
            }
            return items;
        }
      }

      // 不在标签内，不提供补全
      return [];
    } catch (error) {
      this.logger.error("Tag completion failed:", error);
      return [];
    }
  }

  /**
   * 获取标签层级
   *
   * 从 TagHierarchyResolver 获取层级信息
   */
  private async getTagHierarchy(): Promise<Map<string, TagHierarchy>> {
    // 使用内置兜底层级（快速响应）
    return this.getBuiltinHierarchy();
  }

  /**
   * 获取内置层级（兜底）
   *
   * 当 DTD 解析失败时使用
   */
  private getBuiltinHierarchy(): Map<string, TagHierarchy> {
    const hierarchy = new Map<string, TagHierarchy>();

    // mapper 根标签
    hierarchy.set("mapper", {
      parentTag: "root",
      allowedChildren: [
        "cache-ref",
        "cache",
        "resultMap",
        "parameterMap",
        "sql",
        "insert",
        "update",
        "delete",
        "select",
      ],
      allowedAttributes: ["namespace"],
    });

    // SQL 操作标签
    hierarchy.set("select", {
      parentTag: "mapper",
      allowedChildren: [
        "include",
        "trim",
        "where",
        "set",
        "foreach",
        "choose",
        "if",
        "bind",
      ],
      allowedAttributes: [
        "id",
        "resultType",
        "resultMap",
        "parameterType",
        "useCache",
        "flushCache",
        "timeout",
        "fetchSize",
        "statementType",
        "resultOrdered",
        "resultSetType",
      ],
    });

    hierarchy.set("insert", {
      parentTag: "mapper",
      allowedChildren: [
        "selectKey",
        "include",
        "trim",
        "where",
        "set",
        "foreach",
        "choose",
        "if",
        "bind",
      ],
      allowedAttributes: [
        "id",
        "parameterType",
        "useGeneratedKeys",
        "keyProperty",
        "keyColumn",
        "timeout",
        "flushCache",
        "statementType",
      ],
    });

    hierarchy.set("update", {
      parentTag: "mapper",
      allowedChildren: [
        "include",
        "trim",
        "where",
        "set",
        "foreach",
        "choose",
        "if",
        "bind",
      ],
      allowedAttributes: [
        "id",
        "parameterType",
        "timeout",
        "flushCache",
        "statementType",
      ],
    });

    hierarchy.set("delete", {
      parentTag: "mapper",
      allowedChildren: [
        "include",
        "trim",
        "where",
        "foreach",
        "choose",
        "if",
        "bind",
      ],
      allowedAttributes: [
        "id",
        "parameterType",
        "timeout",
        "flushCache",
        "statementType",
      ],
    });

    // 动态 SQL 标签
    hierarchy.set("if", {
      parentTag: "*",
      allowedChildren: [
        "include",
        "trim",
        "where",
        "set",
        "foreach",
        "choose",
        "bind",
        "if",
      ],
      allowedAttributes: ["test"],
    });

    hierarchy.set("foreach", {
      parentTag: "*",
      allowedChildren: ["include", "trim", "where", "set", "if", "bind"],
      allowedAttributes: [
        "collection",
        "item",
        "index",
        "open",
        "separator",
        "close",
      ],
    });

    hierarchy.set("choose", {
      parentTag: "*",
      allowedChildren: ["when", "otherwise"],
      allowedAttributes: [],
    });

    hierarchy.set("when", {
      parentTag: "choose",
      allowedChildren: [
        "include",
        "trim",
        "where",
        "set",
        "foreach",
        "choose",
        "if",
        "bind",
      ],
      allowedAttributes: ["test"],
    });

    hierarchy.set("otherwise", {
      parentTag: "choose",
      allowedChildren: [
        "include",
        "trim",
        "where",
        "set",
        "foreach",
        "choose",
        "if",
        "bind",
      ],
      allowedAttributes: [],
    });

    hierarchy.set("where", {
      parentTag: "*",
      allowedChildren: ["include", "trim", "foreach", "choose", "if", "bind"],
      allowedAttributes: [],
    });

    hierarchy.set("set", {
      parentTag: "*",
      allowedChildren: ["include", "trim", "foreach", "choose", "if", "bind"],
      allowedAttributes: [],
    });

    hierarchy.set("trim", {
      parentTag: "*",
      allowedChildren: ["include", "trim", "foreach", "choose", "if", "bind"],
      allowedAttributes: [
        "prefix",
        "suffix",
        "prefixOverrides",
        "suffixOverrides",
      ],
    });

    hierarchy.set("bind", {
      parentTag: "*",
      allowedChildren: [],
      allowedAttributes: ["name", "value"],
    });

    hierarchy.set("include", {
      parentTag: "*",
      allowedChildren: ["property"],
      allowedAttributes: ["refid"],
    });

    hierarchy.set("sql", {
      parentTag: "mapper",
      allowedChildren: [
        "include",
        "trim",
        "where",
        "set",
        "foreach",
        "choose",
        "if",
        "bind",
      ],
      allowedAttributes: ["id", "databaseId"],
    });

    hierarchy.set("resultMap", {
      parentTag: "mapper",
      allowedChildren: [
        "constructor",
        "id",
        "result",
        "association",
        "collection",
        "discriminator",
      ],
      allowedAttributes: ["id", "type", "autoMapping", "extends"],
    });

    return hierarchy;
  }

  /**
   * 提供标签名补全
   */
  private provideTagNames(
    hierarchy: Map<string, TagHierarchy>,
    parentTag: string | null,
    range?: vscode.Range,
    filterPrefix?: string | null,
  ): vscode.CompletionItem[] {
    // 如果没有父标签，只提供 mapper
    if (!parentTag) {
      const inputPrefix = filterPrefix ? `<${filterPrefix}` : undefined;
      const items = [
        this.createTagItem("mapper", "Root element", range, inputPrefix),
      ];
      return filterPrefix
        ? items.filter((item) =>
            item.label
              .toString()
              .toLowerCase()
              .startsWith(filterPrefix.toLowerCase()),
          )
        : items;
    }

    // 获取父标签允许子标签
    const parentHierarchy = hierarchy.get(parentTag);
    if (!parentHierarchy) {
      return [];
    }

    // 创建补全项
    let items = parentHierarchy.allowedChildren.map((childTag) => {
      const hierarchyInfo = hierarchy.get(childTag);
      const detail = hierarchyInfo
        ? `Child of <${parentTag}>${hierarchyInfo.parentTag === "*" ? " (universal)" : ""}`
        : undefined;

      // 传递 filterPrefix 用于设置正确的 filterText
      const inputPrefix = filterPrefix ? `<${filterPrefix}` : undefined;
      return this.createTagItem(childTag, detail, range, inputPrefix);
    });

    // 如果有过滤前缀，过滤标签名
    if (filterPrefix) {
      items = items.filter((item) =>
        item.label
          .toString()
          .toLowerCase()
          .startsWith(filterPrefix.toLowerCase()),
      );
    }

    return items;
  }

  /**
   * 提供属性名补全
   */
  private provideAttributes(
    hierarchy: Map<string, TagHierarchy>,
    currentTag: string,
  ): vscode.CompletionItem[] {
    const tagHierarchy = hierarchy.get(currentTag);
    if (!tagHierarchy) {
      return [];
    }

    return tagHierarchy.allowedAttributes.map((attr) =>
      this.createAttributeItem(attr, currentTag),
    );
  }

  /**
   * 提供属性值补全
   */
  private provideAttributeValues(
    hierarchy: Map<string, TagHierarchy>,
    currentTag: string,
    currentAttribute: string,
  ): vscode.CompletionItem[] {
    // 根据属性类型提供不同的补全
    switch (currentAttribute) {
      case "resultType":
      case "parameterType":
      case "javaType":
      case "ofType":
      case "type":
        // 这些属性由 TypeStrategy 处理
        return [];
      case "typeHandler":
        // 由 TypeHandlerStrategy 处理
        return [];
      case "collection":
        // Foreach collection 属性由 UnifiedCompletionProvider 处理
        // 返回空，让 UnifiedCompletionProvider 提供补全
        return [];
      case "useCache":
      case "flushCache":
        return [
          this.createValueItem("true", "Boolean"),
          this.createValueItem("false", "Boolean"),
        ];
      case "statementType":
        return [
          this.createValueItem("PREPARED", "PreparedStatement"),
          this.createValueItem("CALLABLE", "CallableStatement"),
          this.createValueItem("STATEMENT", "Statement"),
        ];
      case "fetchSize":
        return [
          this.createValueItem("100", "Default fetch size"),
          this.createValueItem("500", "Medium fetch size"),
          this.createValueItem("1000", "Large fetch size"),
        ];
      default:
        return [];
    }
  }

  /**
   * 解析 XML 上下文
   *
   * 分析光标位置，确定当前在哪个标签内
   * 使用栈结构正确计算标签嵌套关系
   */
  private parseXmlContext(
    document: vscode.TextDocument,
    position: vscode.Position,
  ): XmlParseContext {
    const content = document.getText();
    const offset = document.offsetAt(position);
    const beforeCursor = content.substring(0, offset);
    const afterCursor = content.substring(offset, offset + 50); // 光标后50字符

    // 默认上下文
    const context: XmlParseContext = {
      parentTag: null,
      currentTag: null,
      currentAttribute: null,
      isInTag: false,
      isInAttributeValue: false,
    };

    // DEBUG: 显示光标上下文
    const lineStart = beforeCursor.lastIndexOf("\n") + 1;
    const lineText = beforeCursor.substring(lineStart);
    this.logger.debug(
      `Cursor context: line="${lineText}" | after="${afterCursor.substring(0, 20)}"`,
    );

    // 检查是否在属性值内（在引号中）
    // 查找光标前未闭合的引号
    const lastDoubleQuote = beforeCursor.lastIndexOf('"');
    const lastSingleQuote = beforeCursor.lastIndexOf("'");
    const lastTagStart = beforeCursor.lastIndexOf("<");
    const lastTagEnd = beforeCursor.lastIndexOf(">");

    // 检查是否在属性值内（在引号中）
    // 关键：不仅要检查引号在标签开始之后，还要检查引号是否成对出现
    let isInAttributeValue = false;
    let currentAttribute: string | null = null;

    // 获取当前标签内的文本（从 < 到光标位置）
    if (lastTagStart > lastTagEnd) {
      const tagContent = beforeCursor.substring(lastTagStart);

      // 计算标签内容中双引号和单引号的数量
      const doubleQuoteCount = (tagContent.match(/"/g) || []).length;
      const singleQuoteCount = (tagContent.match(/'/g) || []).length;

      // 如果引号数量是奇数，说明有未闭合的引号
      const hasUnclosedDoubleQuote = doubleQuoteCount % 2 === 1;
      const hasUnclosedSingleQuote = singleQuoteCount % 2 === 1;

      // 检查最后一个引号类型
      const lastQuoteChar = lastDoubleQuote > lastSingleQuote ? '"' : "'";
      const hasUnclosedQuote =
        lastQuoteChar === '"' ? hasUnclosedDoubleQuote : hasUnclosedSingleQuote;

      // 只有在有未闭合引号且引号在标签开始之后才认为在属性值内
      isInAttributeValue =
        hasUnclosedQuote &&
        ((lastDoubleQuote > lastTagStart && lastDoubleQuote > lastTagEnd) ||
          (lastSingleQuote > lastTagStart && lastSingleQuote > lastTagEnd));

      // 如果在属性值内，提取当前属性名
      if (isInAttributeValue) {
        const attrMatch = tagContent.match(
          /\s([a-zA-Z_:][a-zA-Z0-9_:-]*)=["'][^"']*$/,
        );
        if (attrMatch) {
          currentAttribute = attrMatch[1];
        }
      } else {
        // 不在属性值内，但可能在输入新属性名
        // 检查是否在标签名后面有空格，且后面跟着可能的属性名
        // 例如: <foreach collection="ids" item="id" o
        // 需要提取最后一个不完整的属性名
        const lastAttrMatch = tagContent.match(
          /\s([a-zA-Z_:][a-zA-Z0-9_:-]*)$/,
        );
        if (lastAttrMatch) {
          // 检查这个"属性名"后面是否跟着=，如果没有，说明正在输入新属性名
          const attrName = lastAttrMatch[1];
          const afterAttr = tagContent.substring(
            tagContent.lastIndexOf(attrName) + attrName.length,
          );
          if (!afterAttr.includes("=")) {
            currentAttribute = attrName;
          }
        }
      }
    }

    if (isInAttributeValue) {
      context.isInTag = true; // 在属性值内也属于在标签内
      context.isInAttributeValue = true;
      context.currentAttribute = currentAttribute;
    } else if (lastTagStart > lastTagEnd) {
      // 在标签内但不在属性值内
      context.isInTag = true;
      // 如果正在输入属性名，记录下来
      if (currentAttribute) {
        context.currentAttribute = currentAttribute;
      }
    }

    // 检查是否在标签内（在 < 和 > 之间）
    if (lastTagStart > lastTagEnd) {
      context.isInTag = true;
      const tagMatch = beforeCursor.substring(lastTagStart).match(/^<(\w+)/);
      if (tagMatch) {
        context.currentTag = tagMatch[1];
      }
      // 继续执行下面的逻辑计算父标签
    }

    // 查找父标签（使用栈结构）
    // 只考虑到光标位置的内容
    const contentBeforeCursor = beforeCursor;
    const tagStack: string[] = [];

    // 匹配所有标签（开始标签、结束标签、自闭合标签）
    // 修复：使用非贪婪匹配 [^>]*?，避免吃掉自闭合标签的 /
    const tagPattern = /<(\/?)(\w+)(?:\s[^>]*?)?(\/?)\s*>/g;
    let match: RegExpExecArray | null;

    while ((match = tagPattern.exec(contentBeforeCursor)) !== null) {
      if (match.index >= offset) {
        break;
      } // 跳过光标后的内容

      const isClosing = match[1] === "/"; // 是否是结束标签
      const isSelfClosing = match[3] === "/"; // 是否是自闭合标签
      const tagName = match[2];
      const fullMatch = match[0];

      // DEBUG: 输出匹配到的标签
      this.logger.debug(
        `Matched tag: "${fullMatch}", name=${tagName}, isClosing=${isClosing}, isSelfClosing=${isSelfClosing}`,
      );

      if (isSelfClosing) {
        // 自闭合标签 <tag/>，不入栈
        this.logger.debug(`  -> Self-closing, skip`);
        continue;
      } else if (isClosing) {
        // 结束标签 </tag>
        // 找到对应的开始标签并弹出
        const openIndex = tagStack.lastIndexOf(tagName);
        if (openIndex !== -1) {
          tagStack.splice(openIndex, 1);
          this.logger.debug(`  -> Closing, removed ${tagName} from stack`);
        } else {
          this.logger.debug(`  -> Closing, but no matching open tag found`);
        }
      } else {
        // 开始标签 <tag>
        tagStack.push(tagName);
        this.logger.debug(`  -> Opening, added ${tagName} to stack`);
      }
    }

    // 栈顶是当前父标签
    if (tagStack.length > 0) {
      context.parentTag = tagStack[tagStack.length - 1];
    }

    // DEBUG: 输出完整标签栈
    this.logger.debug(
      `Tag stack: [${tagStack.join(", ")}], parentTag: ${context.parentTag}`,
    );

    return context;
  }

  /**
   * 创建标签补全项
   */
  private createTagItem(
    tagName: string,
    detail?: string,
    range?: vscode.Range,
    inputPrefix?: string,
  ): vscode.CompletionItem {
    const item = new vscode.CompletionItem(
      tagName,
      vscode.CompletionItemKind.Keyword,
    );
    item.detail = detail;

    // 设置 filterText 用于 VS Code 过滤匹配
    // 如果用户输入了 <s，filterText 也要包含 <，这样 VS Code 才能匹配
    if (inputPrefix && inputPrefix.startsWith("<")) {
      // 用户已经输入了 <xx，filterText 需要包含 < 才能匹配
      item.filterText = `<${tagName}`;
    } else {
      item.filterText = tagName;
    }

    // 为常见标签提供代码片段
    const snippet = this.getTagSnippet(tagName);
    if (snippet) {
      item.insertText = new vscode.SnippetString(snippet);
    } else {
      item.insertText = `<${tagName}></${tagName}>`;
    }

    // 设置替换范围（重要：包含用户已输入的 < 和部分标签名）
    if (range) {
      item.range = range;
    }

    return item;
  }

  /**
   * 创建属性补全项
   */
  private createAttributeItem(
    attribute: string,
    tagName: string,
  ): vscode.CompletionItem {
    const item = new vscode.CompletionItem(
      attribute,
      vscode.CompletionItemKind.Property,
    );
    item.detail = `Attribute of <${tagName}>`;
    item.insertText = new vscode.SnippetString(`${attribute}="$1"`);
    return item;
  }

  /**
   * 创建属性值补全项
   */
  private createValueItem(
    value: string,
    detail: string,
  ): vscode.CompletionItem {
    const item = new vscode.CompletionItem(
      value,
      vscode.CompletionItemKind.Value,
    );
    item.detail = detail;
    return item;
  }

  /**
   * 获取标签代码片段
   */
  private getTagSnippet(tagName: string): string | null {
    const snippets: Record<string, string> = {
      if: '<if test="$1">\n  $0\n</if>',
      foreach: '<foreach collection="$1">\n  $0\n</foreach>',
      choose: '<choose>\n  <when test="$1">\n    $0\n  </when>\n</choose>',
      when: '<when test="$1">\n  $0\n</when>',
      otherwise: "<otherwise>\n  $0\n</otherwise>",
      where: "<where>\n  $0\n</where>",
      set: "<set>\n  $0\n</set>",
      trim: '<trim prefix="$1">\n  $0\n</trim>',
      bind: '<bind name="$1" value="$2"/>',
      include: '<include refid="$1"/>',
      select: '<select id="$1">\n  $0\n</select>',
      insert: '<insert id="$1">\n  $0\n</insert>',
      update: '<update id="$1">\n  $0\n</update>',
      delete: '<delete id="$1">\n  $0\n</delete>',
      resultMap: '<resultMap id="$1" type="$2">\n  $0\n</resultMap>',
      sql: '<sql id="$1">\n  $0\n</sql>',
    };

    return snippets[tagName] || null;
  }
}
