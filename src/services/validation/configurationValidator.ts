/**
 * Configuration validation service
 *
 * Validates MyBatis Helper configuration settings and provides
 * actionable suggestions for fixing issues.
 */

import * as vscode from 'vscode';
import * as fs from 'fs';
import * as path from 'path';
import { ValidationIssue, ValidationResult } from './types';
import { logger } from '../../utils/logger';

// Valid SQL dialects for formatting
const VALID_SQL_DIALECTS = ['mysql', 'postgresql', 'oracle', 'sqlite', 'tsql', 'db2'];

// Valid listen modes for SQL interceptor
const VALID_LISTEN_MODES = ['auto', 'debugConsole', 'terminal'];

/**
 * Validate configuration - full validation including filesystem checks
 */
export async function validateConfiguration(): Promise<ValidationResult> {
    const issues: ValidationIssue[] = [];
    const config = vscode.workspace.getConfiguration('mybatis-helper');

    // Validate customXmlDirectories
    await validateCustomXmlDirectories(config, issues);

    // Validate nameMatchingRules
    validateNameMatchingRules(config, issues);

    // Validate sqlInterceptor.customRules
    validateSqlCustomRules(config, issues);

    // Validate sqlInterceptor.listenMode
    validateListenMode(config, issues);

    // Validate databaseType (formatting.sql.dialect)
    validateDatabaseType(config, issues);

    // Validate pathPriority
    validatePathPriority(config, issues);

    const errors = issues.filter(i => i.severity === 'error');
    const result: ValidationResult = {
        valid: errors.length === 0,
        issues,
        timestamp: Date.now()
    };

    logger.info(`[ConfigValidator] Validation completed: ${errors.length} errors, ${issues.length - errors.length} warnings`);
    return result;
}

/**
 * Validate configuration - quick validation (no filesystem checks)
 * Used for real-time validation
 */
export function validateBasic(): ValidationIssue[] {
    const issues: ValidationIssue[] = [];
    const config = vscode.workspace.getConfiguration('mybatis-helper');

    // Only run fast validations (no filesystem checks)
    validateNameMatchingRules(config, issues);
    validateSqlCustomRules(config, issues);
    validateListenMode(config, issues);
    validateDatabaseType(config, issues);
    validatePathPriority(config, issues);

    return issues;
}

/**
 * Validate customXmlDirectories
 * - Check each path exists
 * - Check path is within workspace (security)
 */
async function validateCustomXmlDirectories(
    config: vscode.WorkspaceConfiguration,
    issues: ValidationIssue[]
): Promise<void> {
    const customDirs = config.get<string[]>('customXmlDirectories', []);
    const workspaceFolders = vscode.workspace.workspaceFolders;

    for (let i = 0; i < customDirs.length; i++) {
        const dirPath = customDirs[i];
        const configPath = `mybatis-helper.customXmlDirectories[${i}]`;

        // Check if path exists
        if (!fs.existsSync(dirPath)) {
            issues.push({
                configPath,
                severity: 'error',
                message: `Path does not exist: ${dirPath}`,
                suggestion: 'Create the directory or update the configuration'
            });
            continue;
        }

        // Check if it's a directory
        const stats = fs.statSync(dirPath);
        if (!stats.isDirectory()) {
            issues.push({
                configPath,
                severity: 'error',
                message: `Path is not a directory: ${dirPath}`,
                suggestion: 'Specify a valid directory path'
            });
            continue;
        }

        // Security check: path should be within workspace
        if (workspaceFolders && workspaceFolders.length > 0) {
            const resolvedPath = path.resolve(dirPath);
            const isWithinWorkspace = workspaceFolders.some(folder => {
                const workspacePath = path.resolve(folder.uri.fsPath);
                return resolvedPath.startsWith(workspacePath);
            });

            if (!isWithinWorkspace) {
                issues.push({
                    configPath,
                    severity: 'warning',
                    message: `Path is outside workspace: ${dirPath}`,
                    suggestion: 'For security, consider placing XML files within the workspace'
                });
            }
        }
    }
}

/**
 * Validate nameMatchingRules
 * - Check each pattern is valid regex
 */
function validateNameMatchingRules(
    config: vscode.WorkspaceConfiguration,
    issues: ValidationIssue[]
): void {
    const rules = config.get<Array<{
        name: string;
        enabled: boolean;
        javaPattern: string;
        xmlPattern: string;
        description?: string;
    }>>('nameMatchingRules', []);

    for (let i = 0; i < rules.length; i++) {
        const rule = rules[i];
        const basePath = `mybatis-helper.nameMatchingRules[${i}]`;

        // Validate javaPattern
        if (rule.javaPattern) {
            try {
                // Convert glob-like pattern to regex for validation
                const regexPattern = globToRegex(rule.javaPattern);
                new RegExp(regexPattern);
            } catch (e) {
                issues.push({
                    configPath: `${basePath}.javaPattern`,
                    severity: 'error',
                    message: `Invalid pattern: "${rule.javaPattern}"`,
                    suggestion: 'Use valid glob pattern syntax (e.g., "*Mapper", "*Dao")'
                });
            }
        }

        // Validate xmlPattern
        if (rule.xmlPattern) {
            try {
                // Check for template variables like ${javaName}
                const patternWithoutVars = rule.xmlPattern.replace(/\$\{\w+\}/g, '*');
                const regexPattern = globToRegex(patternWithoutVars);
                new RegExp(regexPattern);
            } catch (e) {
                issues.push({
                    configPath: `${basePath}.xmlPattern`,
                    severity: 'error',
                    message: `Invalid pattern: "${rule.xmlPattern}"`,
                    suggestion: 'Use valid pattern with optional template variables like ${javaName}'
                });
            }
        }
    }
}

/**
 * Validate sqlInterceptor.customRules
 * - Check each regex pattern is valid
 */
function validateSqlCustomRules(
    config: vscode.WorkspaceConfiguration,
    issues: ValidationIssue[]
): void {
    const customRules = config.get<Array<{
        name: string;
        enabled: boolean;
        lineMatchRegex?: string;
        sqlExtractRegex?: string;
        parametersExtractRegex?: string;
        executionTimeExtractRegex?: string;
        paramParseRegex?: string;
    }>>('sqlInterceptor.customRules', []);

    for (let i = 0; i < customRules.length; i++) {
        const rule = customRules[i];
        const basePath = `mybatis-helper.sqlInterceptor.customRules[${i}]`;

        // Validate lineMatchRegex (required)
        if (rule.lineMatchRegex) {
            try {
                new RegExp(rule.lineMatchRegex);
            } catch (e) {
                issues.push({
                    configPath: `${basePath}.lineMatchRegex`,
                    severity: 'error',
                    message: `Invalid regex in rule "${rule.name}": ${rule.lineMatchRegex}`,
                    suggestion: 'Fix the regex syntax error'
                });
            }
        }

        // Validate sqlExtractRegex (required)
        if (rule.sqlExtractRegex) {
            try {
                new RegExp(rule.sqlExtractRegex);
            } catch (e) {
                issues.push({
                    configPath: `${basePath}.sqlExtractRegex`,
                    severity: 'error',
                    message: `Invalid regex in rule "${rule.name}": ${rule.sqlExtractRegex}`,
                    suggestion: 'Fix the regex syntax error'
                });
            }
        }

        // Validate optional parametersExtractRegex
        if (rule.parametersExtractRegex) {
            try {
                new RegExp(rule.parametersExtractRegex);
            } catch (e) {
                issues.push({
                    configPath: `${basePath}.parametersExtractRegex`,
                    severity: 'error',
                    message: `Invalid regex in rule "${rule.name}": ${rule.parametersExtractRegex}`,
                    suggestion: 'Fix the regex syntax error or remove this field'
                });
            }
        }

        // Validate optional executionTimeExtractRegex
        if (rule.executionTimeExtractRegex) {
            try {
                new RegExp(rule.executionTimeExtractRegex);
            } catch (e) {
                issues.push({
                    configPath: `${basePath}.executionTimeExtractRegex`,
                    severity: 'error',
                    message: `Invalid regex in rule "${rule.name}": ${rule.executionTimeExtractRegex}`,
                    suggestion: 'Fix the regex syntax error or remove this field'
                });
            }
        }

        // Validate optional paramParseRegex
        if (rule.paramParseRegex) {
            try {
                new RegExp(rule.paramParseRegex);
            } catch (e) {
                issues.push({
                    configPath: `${basePath}.paramParseRegex`,
                    severity: 'error',
                    message: `Invalid regex in rule "${rule.name}": ${rule.paramParseRegex}`,
                    suggestion: 'Fix the regex syntax error or remove this field'
                });
            }
        }
    }
}

/**
 * Validate sqlInterceptor.listenMode
 * - Check value is one of: auto, debugConsole, terminal
 */
function validateListenMode(
    config: vscode.WorkspaceConfiguration,
    issues: ValidationIssue[]
): void {
    const listenMode = config.get<string>('sqlInterceptor.listenMode', 'auto');

    if (!VALID_LISTEN_MODES.includes(listenMode)) {
        issues.push({
            configPath: 'mybatis-helper.sqlInterceptor.listenMode',
            severity: 'error',
            message: `Invalid listen mode: "${listenMode}"`,
            suggestion: `Must be one of: ${VALID_LISTEN_MODES.join(', ')}`
        });
    }
}

/**
 * Validate databaseType (formatting.sql.dialect)
 * - Check value is valid dialect
 */
function validateDatabaseType(
    config: vscode.WorkspaceConfiguration,
    issues: ValidationIssue[]
): void {
    const dialect = config.get<string>('formatting.sql.dialect', 'mysql');

    if (!VALID_SQL_DIALECTS.includes(dialect)) {
        issues.push({
            configPath: 'mybatis-helper.formatting.sql.dialect',
            severity: 'warning',
            message: `Unknown SQL dialect: "${dialect}"`,
            suggestion: `Recommended dialects: ${VALID_SQL_DIALECTS.join(', ')}. The extension may still work with custom dialects.`
        });
    }
}

/**
 * Validate pathPriority
 * - Check each path pattern is valid
 */
function validatePathPriority(
    config: vscode.WorkspaceConfiguration,
    issues: ValidationIssue[]
): void {
    const pathPriority = config.get<{
        enabled?: boolean;
        priorityDirectories?: string[];
        excludeDirectories?: string[];
    }>('pathPriority', {});

    // Validate priorityDirectories
    if (pathPriority.priorityDirectories) {
        for (let i = 0; i < pathPriority.priorityDirectories.length; i++) {
            const dir = pathPriority.priorityDirectories[i];
            if (dir.includes('..') || dir.includes('~')) {
                issues.push({
                    configPath: `mybatis-helper.pathPriority.priorityDirectories[${i}]`,
                    severity: 'warning',
                    message: `Suspicious path pattern: "${dir}"`,
                    suggestion: 'Avoid using ".." or "~" in path patterns. Use relative paths like "/src/" or "/main/"'
                });
            }
        }
    }

    // Validate excludeDirectories
    if (pathPriority.excludeDirectories) {
        for (let i = 0; i < pathPriority.excludeDirectories.length; i++) {
            const dir = pathPriority.excludeDirectories[i];
            if (dir.includes('..') || dir.includes('~')) {
                issues.push({
                    configPath: `mybatis-helper.pathPriority.excludeDirectories[${i}]`,
                    severity: 'warning',
                    message: `Suspicious path pattern: "${dir}"`,
                    suggestion: 'Avoid using ".." or "~" in path patterns. Use relative paths like "/target/" or "/build/"'
                });
            }
        }
    }
}

/**
 * Convert glob-like pattern to regex pattern
 * Simple conversion: * -> .*, ? -> .
 */
function globToRegex(glob: string): string {
    return glob
        .replace(/[.+^${}()|[\]\\]/g, '\\$&') // Escape special regex chars except * and ?
        .replace(/\*/g, '.*')
        .replace(/\?/g, '.');
}
