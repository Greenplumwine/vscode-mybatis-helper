import * as vscode from 'vscode';
import { FileMapper } from '../mapping/filemapper';
import { logger } from '../../utils/logger';

/**
 * SQL Completion Item Provider for MyBatis Helper
 * Provides intelligent SQL completion based on Java Mapper interface parameters
 */
export class SQLCompletionProvider implements vscode.CompletionItemProvider {
    private fileMapper: FileMapper;
    private completionCache: Map<string, vscode.CompletionItem[]> = new Map();
    private methodParamsCache: Map<string, Array<{ name: string; type: string }>> = new Map();
    private objectPropertiesCache: Map<string, string[]> = new Map();

    /**
     * Creates a new SQLCompletionProvider instance
     * @param fileMapper The FileMapper instance for accessing mapping information
     */
    constructor(fileMapper: FileMapper) {
        this.fileMapper = fileMapper;
        this.setupFileWatchers();
    }
    
    /**
     * Setup file watchers to invalidate cache when files change
     */
    private setupFileWatchers(): void {
        // Watch Java files for changes to invalidate cache
        const javaWatcher = vscode.workspace.createFileSystemWatcher('**/*.java', false, true, true);
        javaWatcher.onDidChange(() => this.clearCache());
        javaWatcher.onDidDelete(() => this.clearCache());
        
        // Watch XML files for changes to invalidate cache
        const xmlWatcher = vscode.workspace.createFileSystemWatcher('**/*.xml', false, true, true);
        xmlWatcher.onDidChange(() => this.clearCache());
        xmlWatcher.onDidDelete(() => this.clearCache());
    }
    
    /**
     * Clear all caches
     */
    public clearCache(): void {
        this.completionCache.clear();
        this.methodParamsCache.clear();
        this.objectPropertiesCache.clear();
        logger.debug('[SQLCompletionProvider] All caches cleared');
    }

    /**
     * Check if the cursor is inside a <foreach> tag and get the item attribute value
     * @param document The XML document being edited
     * @param position The cursor position
     * @returns The item attribute value if inside a <foreach> tag, undefined otherwise
     */
    private getForeachItemAttribute(document: vscode.TextDocument, position: vscode.Position): string | undefined {
        // Get the text from the beginning of the document up to the cursor
        const textBeforeCursor = document.getText(new vscode.Range(0, 0, position.line, position.character));
        
        // Look for all <foreach> tags with item attribute
        const foreachRegex = /<\s*foreach\s+[^>]*item\s*=\s*(?:"([^"]*)"|'([^']*)')[^>]*>/gi;
        
        let lastMatch: RegExpExecArray | null = null;
        let match: RegExpExecArray | null;
        
        // Find all <foreach> tags and keep the last one
        while ((match = foreachRegex.exec(textBeforeCursor)) !== null) {
            lastMatch = match;
        }
        
        // If no <foreach> tags found, return undefined
        if (!lastMatch) {
            return undefined;
        }
        
        // Extract the item attribute value
        const itemValue = lastMatch[1] || lastMatch[2];
        if (!itemValue) {
            return undefined;
        }
        
        // Check if we're still inside this <foreach> tag
        // Count the number of opening and closing <foreach> tags
        const openForeachRegex = /<\s*foreach\s+/gi;
        const closeForeachRegex = /<\s*\/\s*foreach\s*>/gi;
        
        let openCount = 0;
        let closeCount = 0;
        
        // Count opening tags
        while ((match = openForeachRegex.exec(textBeforeCursor)) !== null) {
            openCount++;
        }
        
        // Count closing tags
        while ((match = closeForeachRegex.exec(textBeforeCursor)) !== null) {
            closeCount++;
        }
        
        // If we have more opening tags than closing tags, we're still inside a <foreach> tag
        if (openCount > closeCount) {
            return itemValue;
        }
        
        return undefined;
    }

    /**
     * Provide completion items for SQL statements in XML files
     * @param document The XML document being edited
     * @param position The position where completion is requested
     * @param token Cancellation token to cancel the operation
     * @param context Context information about the completion request
     * @returns Array of completion items for SQL
     */
    public async provideCompletionItems(
        document: vscode.TextDocument,
        position: vscode.Position,
        token: vscode.CancellationToken,
        context: vscode.CompletionContext
    ): Promise<vscode.CompletionItem[] | undefined> {
        try {
            logger.debug(`[provideCompletionItems] Called with context: ${JSON.stringify(context)}`);
            // Only provide completion for XML files
            if (document.languageId !== 'xml') {
                logger.debug(`[provideCompletionItems] Skipping non-XML file: ${document.languageId}`);
                return undefined;
            }

            logger.debug(`[provideCompletionItems] Called, position: ${position.line}:${position.character}`);

            // Get the current line text
            const lineText = document.lineAt(position.line).text;
            const linePrefix = lineText.substring(0, position.character);
            logger.debug(`[provideCompletionItems] Line text: ${lineText}`);
            logger.debug(`[provideCompletionItems] Line prefix: ${linePrefix}`);

            // Check if we're typing a parameter (starting with # or $ or #{ or ${)
            // Match # or $ to trigger completion early, regardless of cursor position
            // Enhanced regex to match more cases - match # or $ followed by optional { or end of line
            // Support various parameter formats like: #, $, #{, ${, #{param, #{param,jdbcType=VARCHAR, #{param,jdbcType=VARCHAR,typeHandler=MyTypeHandler
            const parameterMatch = linePrefix.match(/([#$])(?:\{([^},]*)?(?:,\s*[^},]*)*)?$/);
            if (!parameterMatch) {
                logger.debug(`[provideCompletionItems] Not typing a parameter, linePrefix: '${linePrefix}'`);
                return undefined;
            }
            
            logger.debug(`[provideCompletionItems] Parameter match found: ${JSON.stringify(parameterMatch)}, groups: ${parameterMatch[1]}, cursor position: ${position.character}`);
            
            // Extract parameter marker (# or $)
            const parameterMarker = parameterMatch[1];
            logger.debug(`[provideCompletionItems] Extracted parameter marker: '${parameterMarker}'`);
            
            // Extract current parameter name (if any) from the match
            const currentParamName = parameterMatch[2] || '';
            logger.debug(`[provideCompletionItems] Current parameter name: '${currentParamName}'`);
            
            // Check if we're inside a SQL statement tag (select, update, insert, delete)
            const isInSQLTag = this.isInsideSQLTag(document, position);
            if (!isInSQLTag) {
                logger.debug('[provideCompletionItems] Not inside SQL tag');
                return undefined;
            }

            logger.debug('[provideCompletionItems] Inside SQL tag');
            
            // Get the current SQL clause context
            const sqlContext = this.getSQLClauseContext(document, position);
            logger.debug(`[provideCompletionItems] SQL clause context: ${sqlContext}`);

            // Check if we're inside a <foreach> tag and get the item attribute
            const foreachItem = this.getForeachItemAttribute(document, position);
            logger.debug(`[provideCompletionItems] Foreach item attribute: ${foreachItem}`);

            // Get the namespace from the XML file
            const namespace = await this.fileMapper.parseXmlNamespacePublic(document.uri.fsPath);
            if (!namespace) {
                logger.debug('No namespace found in XML file');
                return undefined;
            }

            logger.debug(`[provideCompletionItems] Found namespace: ${namespace}`);

            // Get the method name containing the cursor
            const methodName = this.getContainingMethodName(document, position);
            if (!methodName) {
                logger.debug('No method name found at cursor position');
                return undefined;
            }

            logger.debug(`[provideCompletionItems] Found method name: ${methodName}`);
            
            // Create cache key including all relevant context
            const cacheKey = `${document.uri.fsPath}:${position.line}:${parameterMarker}:${sqlContext}:${foreachItem || ''}`;
            
            // Check if we already have cached completion items for this context
            if (this.completionCache.has(cacheKey)) {
                logger.debug(`[provideCompletionItems] Using cached completion items for ${cacheKey}`);
                return this.completionCache.get(cacheKey);
            }

            // Get method parameters from the Java Mapper interface
            const params = await this.getMethodParameters(namespace, methodName);
            if (!params || params.length === 0) {
                logger.debug(`No parameters found for method ${methodName} in ${namespace}`);
                return undefined;
            }

            logger.debug(`[provideCompletionItems] Found ${params.length} parameters: ${JSON.stringify(params)}`);

            // Generate completion items based on parameters and SQL context
            let completionItems = this.generateCompletionItems(params, parameterMarker, sqlContext);
            
            // If we're inside a <foreach> tag, add completion items based on the item attribute
            if (foreachItem) {
                logger.debug(`[provideCompletionItems] Inside foreach tag with item: ${foreachItem}`);
                
                // Find the parameter that matches the foreach item type
                // For arrays, the item type is the array element type
                // For collections, the item type is the generic type
                let itemType = '';
                let isArrayType = false;
                
                for (const param of params) {
                    if (param.type.endsWith('[]')) {
                        // This is an array parameter, the item type is the element type
                        itemType = param.type.replace(/\[\]/g, '');
                        isArrayType = true;
                        break;
                    } else if (param.type.includes('<')) {
                        // This is a generic parameter, extract the actual type
                        itemType = this.extractGenericType(param.type);
                        isArrayType = false;
                        break;
                    } else if (!this.isPrimitiveType(param.type)) {
                        // This is a non-primitive parameter, assume it's the item type
                        itemType = param.type;
                        isArrayType = false;
                        break;
                    }
                }
                
                // Always add the foreach item itself
                const foreachItemCompletion = new vscode.CompletionItem(foreachItem, vscode.CompletionItemKind.Variable);
                foreachItemCompletion.insertText = foreachItem;
                foreachItemCompletion.documentation = new vscode.MarkdownString(`Foreach item: ${foreachItem}`);
                foreachItemCompletion.sortText = `3_${foreachItem}`;
                completionItems.push(foreachItemCompletion);
                
                // Only add properties if itemType is an object type
                if (itemType && !this.isPrimitiveType(itemType)) {
                    // Extract nested properties for this item type with cache
                    let nestedProps: string[] = [];
                    if (this.objectPropertiesCache.has(itemType)) {
                        logger.debug(`[provideCompletionItems] Using cached properties for foreach item type ${itemType}`);
                        nestedProps = this.objectPropertiesCache.get(itemType)!;
                    } else {
                        nestedProps = await this.fileMapper['extractObjectProperties'](itemType);
                        this.objectPropertiesCache.set(itemType, nestedProps);
                        logger.debug(`[provideCompletionItems] Cached properties for foreach item type ${itemType}: ${nestedProps.join(', ')}`);
                    }
                    
                    // Add completion items with the foreach item name and properties
                    for (const prop of nestedProps) {
                        const foreachCompletion = new vscode.CompletionItem(`${foreachItem}.${prop}`, vscode.CompletionItemKind.Field);
                        foreachCompletion.insertText = `${foreachItem}.${prop}`;
                        foreachCompletion.documentation = new vscode.MarkdownString(`Foreach item property: ${foreachItem}.${prop}`);
                        foreachCompletion.sortText = `3_${foreachItem}.${prop}`;
                        completionItems.push(foreachCompletion);
                    }
                }
            }
            
            logger.debug(`[provideCompletionItems] Generated ${completionItems.length} initial completion items`);
            
            // Modify completion items to match the current input format
            const isCurlyBraceAlreadyTyped = linePrefix.endsWith(`${parameterMarker}{`);
            logger.debug(`[provideCompletionItems] Is curly brace already typed: ${isCurlyBraceAlreadyTyped}`);
            
            // Create final completion items with proper formatting and high priority
            const finalItems: vscode.CompletionItem[] = [];
            
            for (const item of completionItems) {
                const finalItem = new vscode.CompletionItem(item.label, item.kind);
                finalItem.detail = item.detail;
                finalItem.documentation = item.documentation;
                
                // Get the actual parameter name from the label (convert CompletionItemLabel to string if needed)
                const paramName = typeof item.label === 'string' ? item.label : JSON.stringify(item.label);
                const labelStr = typeof item.label === 'string' ? item.label : '';
                
                // Set sort text based on type and name
                // - Sort by type priority: basic params > object properties > foreach items
                // - Sort alphabetically within each type
                // - Prioritize items that match current input
                let typePriority = "2";
                if (labelStr.includes('.')) {
                    if (labelStr.startsWith(foreachItem + '.')) {
                        // Foreach item property
                        typePriority = "3";
                    } else {
                        // Object property
                        typePriority = "1";
                    }
                } else if (labelStr === foreachItem) {
                    // Foreach item itself
                    typePriority = "3";
                } else {
                    // Basic parameter
                    typePriority = "0";
                }
                
                // Check if this item matches the current parameter name (ensure boolean result)
                const matchesCurrentInput = currentParamName ? paramName.toLowerCase().startsWith(currentParamName.toLowerCase()) : false;
                const matchPriority = matchesCurrentInput ? "0" : "1";
                
                // Create sort text: matchPriority + typePriority + alphabetical
                finalItem.sortText = `${matchPriority}${typePriority}_${paramName}`;
                
                // Preselect the first matching item
                finalItem.preselect = matchesCurrentInput;
                
                // Use simple string for insertText instead of SnippetString to avoid [object Object] issue
                if (isCurlyBraceAlreadyTyped) {
                    // User has already typed #{ or ${, just insert the parameter name and closing brace
                    finalItem.insertText = `${paramName}}`;
                    logger.debug(`[provideCompletionItems] Adjusting for existing brace: ${paramName}}`);
                } else {
                    // User has only typed # or $, insert the full format
                    finalItem.insertText = `{${paramName}}`;
                    logger.debug(`[provideCompletionItems] Using full format: {${paramName}}`);
                }
                
                finalItems.push(finalItem);
            }
            
            logger.debug(`[provideCompletionItems] Final completion items: ${JSON.stringify(finalItems.map(item => item.label))}`);
            logger.debug(`[provideCompletionItems] Generated ${finalItems.length} final completion items`);
            
            // Filter out completion items with trailing dots
            const filteredItems = finalItems.filter(item => {
                const label = typeof item.label === 'string' ? item.label : '';
                return !label.endsWith('.');
            });
            
            logger.debug(`[provideCompletionItems] Filtered out ${finalItems.length - filteredItems.length} items with trailing dots`);
            logger.debug(`[provideCompletionItems] Final filtered completion items: ${JSON.stringify(filteredItems.map(item => item.label))}`);
            
            // Cache the final completion items for future use
            this.completionCache.set(cacheKey, filteredItems);
            logger.debug(`[provideCompletionItems] Cached completion items for ${cacheKey}`);
            
            return filteredItems;
        } catch (error) {
            logger.error(`[provideCompletionItems] Error: ${error instanceof Error ? error.message : String(error)}`);
            logger.error(`[provideCompletionItems] Error stack: ${error instanceof Error ? error.stack : 'No stack trace'}`);
            // If there's an error, don't provide any completion items
            return undefined;
        }
    }

    /**
     * Check if the cursor is inside a SQL statement tag
     * @param document The XML document being edited
     * @param position The cursor position
     * @returns True if inside a SQL tag, false otherwise
     */
    private isInsideSQLTag(document: vscode.TextDocument, position: vscode.Position): boolean {
        // Get the text from the beginning of the document up to the cursor
        const textBeforeCursor = document.getText(new vscode.Range(0, 0, position.line, position.character));
        
        logger.debug(`[isInsideSQLTag] Checking if inside SQL tag, position: ${position.line}:${position.character}`);
        logger.debug(`[isInsideSQLTag] Text before cursor (first 100 chars): ${textBeforeCursor.substring(0, 100)}...`);
        
        // Look for all SQL tags in the text
        const sqlTags = ['select', 'update', 'insert', 'delete'];
        
        // Count the number of opening and closing tags for each SQL tag type
        for (const tag of sqlTags) {
            // Pattern for opening tags (e.g., <select, <select id="...">, etc.)
            const openTagRegex = new RegExp(`<\\s*${tag}(?:\\s+[^>]*)?>`, 'gi');
            // Pattern for closing tags (e.g., </select>, </select >, etc.)
            const closeTagRegex = new RegExp(`<\\s*\\/\\s*${tag}\\s*>`, 'gi');
            
            // Reset regex lastIndex to ensure proper matching
            openTagRegex.lastIndex = 0;
            closeTagRegex.lastIndex = 0;
            
            // Count opening tags
            let openCount = 0;
            let match;
            while ((match = openTagRegex.exec(textBeforeCursor)) !== null) {
                openCount++;
            }
            
            // Count closing tags
            let closeCount = 0;
            while ((match = closeTagRegex.exec(textBeforeCursor)) !== null) {
                closeCount++;
            }
            
            logger.debug(`[isInsideSQLTag] Tag ${tag}: open=${openCount}, close=${closeCount}`);
            
            // If there are more opening tags than closing tags, we're inside this tag
            if (openCount > closeCount) {
                logger.debug(`[isInsideSQLTag] Inside ${tag} tag: open=${openCount}, close=${closeCount}`);
                return true;
            }
        }
        
        logger.debug('[isInsideSQLTag] Not inside any SQL tag');
        return false;
    }
    
    /**
     * Get the current SQL clause context (SELECT, WHERE, SET, etc.)
     * @param document The XML document being edited
     * @param position The cursor position
     * @returns The SQL clause context, or undefined if not found
     */
    private getSQLClauseContext(document: vscode.TextDocument, position: vscode.Position): string | undefined {
        try {
            // Get the text from the beginning of the document up to the cursor
            const textBeforeCursor = document.getText(new vscode.Range(0, 0, position.line, position.character));
            
            // Find the last SQL tag opening
            const sqlTagRegex = /<\s*(select|update|insert|delete)(?:\s+[^>]*)?>/gi;
            let lastTagMatch = null;
            let match;
            
            // Use exec() instead of matchAll() to avoid potential regex issues
            while ((match = sqlTagRegex.exec(textBeforeCursor)) !== null) {
                lastTagMatch = match;
            }
            
            if (!lastTagMatch) {
                return undefined;
            }
            
            // Extract the SQL content from the tag opening to the cursor
            const sqlContent = textBeforeCursor.substring(lastTagMatch.index + lastTagMatch[0].length).toLowerCase();
            
            // Define SQL clauses in order of priority (more specific clauses first)
            const clauses = [
                'where', 'set', 'values', 'from', 'select', 'update', 'insert', 'delete'
            ];
            
            // Find the last occurrence of each clause
            for (const clause of clauses) {
                const index = sqlContent.lastIndexOf(clause);
                if (index !== -1) {
                    // Check if the clause is not part of a larger word
                    const isStandalone = /\b/.test(sqlContent.charAt(index)) && 
                                        (index + clause.length === sqlContent.length || /\b/.test(sqlContent.charAt(index + clause.length)));
                    if (isStandalone) {
                        logger.debug(`[getSQLClauseContext] Found clause: ${clause}`);
                        return clause;
                    }
                }
            }
            
            // Check the SQL tag type as fallback
            return lastTagMatch[1].toLowerCase();
        } catch (error) {
            logger.error(`[getSQLClauseContext] Error: ${error instanceof Error ? error.message : String(error)}`);
            return undefined;
        }
    }

    /**
     * Get the name of the method containing the cursor position
     * @param document The XML document being edited
     * @param position The cursor position
     * @returns The method name if found, undefined otherwise
     */
    private getContainingMethodName(document: vscode.TextDocument, position: vscode.Position): string | undefined {
        // Get text from the beginning of the document up to the cursor
        const textUpToPosition = document.getText(new vscode.Range(0, 0, position.line + 1, position.character));
        
        logger.debug(`[getContainingMethodName] Getting method name for position: ${position.line}:${position.character}`);
        
        // Look for the last method tag before the cursor
        const methodRegex = /<\s*(select|update|insert|delete)\s+[^>]*id\s*=\s*["']([^"']+)["']/gi;
        
        let lastMatch: RegExpExecArray | null = null;
        let match: RegExpExecArray | null;
        
        // Find all method tags and keep the last one
        while ((match = methodRegex.exec(textUpToPosition)) !== null) {
            lastMatch = match;
        }
        
        // If no matches, return undefined
        if (!lastMatch) {
            logger.debug('[getContainingMethodName] No method tags found');
            return undefined;
        }
        
        const methodName = lastMatch[2];
        logger.debug(`[getContainingMethodName] Found method name: ${methodName}`);
        return methodName;
    }

    /**
     * Get method parameters from the Java Mapper interface
     * @param namespace The namespace of the Mapper interface
     * @param methodName The method name to get parameters for
     * @returns Array of parameter names and types
     */
    private async getMethodParameters(namespace: string, methodName: string): Promise<Array<{ name: string; type: string }> | undefined> {
        try {
            // Create cache key
            const cacheKey = `${namespace}.${methodName}`;
            
            // Check if we already have cached parameters
            if (this.methodParamsCache.has(cacheKey)) {
                logger.debug(`[getMethodParameters] Using cached parameters for ${cacheKey}`);
                return this.methodParamsCache.get(cacheKey);
            }
            
            // Use the file mapper to extract method parameters directly
            // Avoid duplicate Java file lookup by using the existing method
            const params = await this.fileMapper.extractMethodParametersPublic(namespace, methodName);
            
            // If we have parameters, add nested properties for object types
            if (params && params.length > 0) {
                const result: Array<{ name: string; type: string }> = [...params];
                
                for (const param of params) {
                    // Handle generic types (e.g., List<User> -> User)
                    let actualType = param.type;
                    if (actualType.includes('<')) {
                        actualType = this.extractGenericType(actualType);
                        logger.debug(`[getMethodParameters] Extracted generic type: ${actualType} from ${param.type}`);
                    }
                    
                    if (!this.isPrimitiveType(actualType)) {
                        // Extract nested properties with cache
                        let nestedProps: string[] = [];
                        if (this.objectPropertiesCache.has(actualType)) {
                            logger.debug(`[getMethodParameters] Using cached properties for ${actualType}`);
                            nestedProps = this.objectPropertiesCache.get(actualType)!;
                        } else {
                            nestedProps = await this.fileMapper['extractObjectProperties'](actualType);
                            this.objectPropertiesCache.set(actualType, nestedProps);
                            logger.debug(`[getMethodParameters] Cached properties for ${actualType}: ${nestedProps.join(', ')}`);
                        }
                        
                        for (const prop of nestedProps) {
                            // Add nested properties with format: paramName.propertyName
                            result.push({ name: `${param.name}.${prop}`, type: `${actualType}.property` });
                        }
                    }
                }
                
                // Cache the result
                this.methodParamsCache.set(cacheKey, result);
                logger.debug(`[getMethodParameters] Cached parameters for ${cacheKey}`);
                
                return result;
            }
            
            return params;
        } catch (error) {
            logger.error(`[getMethodParameters] Error: ${error instanceof Error ? error.message : String(error)}`);
            logger.error(`[getMethodParameters] Error stack: ${error instanceof Error ? error.stack : 'No stack trace'}`);
            return undefined;
        }
    }

    /**
     * Generate completion items based on method parameters
     * @param params Array of method parameters
     * @param parameterMarker The parameter marker (# or $) used by the user
     * @param context The SQL clause context (SELECT, WHERE, SET, etc.)
     * @returns Array of completion items
     */
    private generateCompletionItems(params: Array<{ name: string; type: string }>, parameterMarker: string, context?: string): vscode.CompletionItem[] {
        const completionItems: vscode.CompletionItem[] = [];
        
        // Create completion items for each parameter
        for (const param of params) {
            // Basic parameter completion with proper formatting
            const basicCompletion = new vscode.CompletionItem(param.name, vscode.CompletionItemKind.Variable);
            // Store the parameter name as label, not as SnippetString
            basicCompletion.insertText = param.name;
            basicCompletion.documentation = new vscode.MarkdownString(`Parameter of type: ${param.type}`);
            
            // Set base sort text based on context
            let baseSort = "0";
            if (context === 'where' || context === 'select') {
                // In WHERE and SELECT clauses, prioritize simple parameters
                if (!param.name.includes('.')) {
                    baseSort = "0";
                } else {
                    baseSort = "1";
                }
            } else if (context === 'set' || context === 'values') {
                // In SET and VALUES clauses, prioritize object properties
                if (param.name.includes('.')) {
                    baseSort = "0";
                } else {
                    baseSort = "1";
                }
            }
            
            basicCompletion.sortText = `${baseSort}_0_${param.name}`;
            completionItems.push(basicCompletion);
            
            // Add nested properties if the parameter is an object type
            if (!this.isPrimitiveType(param.type)) {
                // If this parameter has nested properties (already extracted), add them as individual completion items
                if (param.name.includes('.')) {
                    // This is a nested property, add it as a completion item
                    const nestedPropCompletion = new vscode.CompletionItem(param.name, vscode.CompletionItemKind.Field);
                    nestedPropCompletion.insertText = param.name;
                    nestedPropCompletion.documentation = new vscode.MarkdownString(`Nested property of type: ${param.type}`);
                    nestedPropCompletion.sortText = `${baseSort}_2_${param.name}`;
                    completionItems.push(nestedPropCompletion);
                }
            }
        }
        
        return completionItems;
    }

    /**
     * Check if a type is a primitive type
     * @param type The type to check
     * @returns True if the type is primitive, false otherwise
     */
    private isPrimitiveType(type: string): boolean {
        const primitiveTypes = [
            'byte', 'short', 'int', 'long', 'float', 'double', 'boolean', 'char',
            'Byte', 'Short', 'Integer', 'Long', 'Float', 'Double', 'Boolean', 'Character',
            'String', 'BigDecimal', 'BigInteger', 'Date', 'LocalDate', 'LocalDateTime', 'LocalTime',
            'Instant', 'ZonedDateTime'
        ];
        
        // Remove generic part if present
        const baseType = type.replace(/<[^>]+>/g, '').replace(/\[\]/g, '');
        
        // Check if it's a primitive type, array of primitive types, or Map type
        return primitiveTypes.includes(baseType) || type.endsWith('[]') || baseType === 'Map';
    }
    
    /**
     * Extract the actual type from a generic type (e.g., List<User> -> User)
     * @param type The generic type to extract from
     * @returns The actual type, or the original type if not generic
     */
    private extractGenericType(type: string): string {
        const genericMatch = type.match(/<([^>,]+)(?:,[^>]+)*>/);
        if (genericMatch) {
            return genericMatch[1].trim();
        }
        return type;
    }

    /**
     * Resolve additional information for a completion item
     * @param item The completion item to resolve
     * @param token Cancellation token to cancel the operation
     * @returns Resolved completion item
     */
    public async resolveCompletionItem(
        item: vscode.CompletionItem,
        token: vscode.CancellationToken
    ): Promise<vscode.CompletionItem | undefined> {
        try {
            // Add more detailed documentation if needed
            return item;
        } catch (error) {
            logger.error(`Error resolving completion item: ${error instanceof Error ? error.message : String(error)}`);
            return undefined;
        }
    }

    /**
     * Dispose resources
     */
    public dispose(): void {
        this.clearCache();
        // TODO: Dispose file watchers if needed
    }
}