/**
 * Real-time configuration validation
 *
 * Listens for configuration changes and runs validation automatically.
 */

import * as vscode from 'vscode';
import { validateBasic } from './configurationValidator';
import { ValidationIssue } from './types';
import { logger } from '../../utils/logger';

// Debounce delay in milliseconds
const DEBOUNCE_DELAY = 500;

// Output channel name
const OUTPUT_CHANNEL_NAME = 'MyBatis Helper Validation';

// Track debounce timer
let debounceTimer: NodeJS.Timeout | null = null;

// Track last validation issues to avoid duplicate output
let lastValidationIssues: ValidationIssue[] = [];

// Output channel instance
let outputChannel: vscode.OutputChannel | null = null;

/**
 * Register real-time validation on configuration changes
 */
export function registerRealTimeValidation(
    context: vscode.ExtensionContext,
    channel?: vscode.OutputChannel
): void {
    // Use provided channel or create our own
    outputChannel = channel || vscode.window.createOutputChannel(OUTPUT_CHANNEL_NAME);

    // Listen for configuration changes
    const configWatcher = vscode.workspace.onDidChangeConfiguration(e => {
        if (e.affectsConfiguration('mybatis-helper')) {
            runBasicValidation();
        }
    });

    context.subscriptions.push(configWatcher);

    // Also register cleanup on deactivation
    context.subscriptions.push({
        dispose: () => {
            dispose();
        }
    });

    logger.info('[RealTimeValidation] Real-time validation registered');
}

/**
 * Run basic validation with debouncing
 */
function runBasicValidation(): void {
    // Clear existing timer
    if (debounceTimer) {
        clearTimeout(debounceTimer);
    }

    // Set new debounced timer
    debounceTimer = setTimeout(() => {
        executeValidation();
    }, DEBOUNCE_DELAY);
}

/**
 * Execute the actual validation
 */
function executeValidation(): void {
    try {
        const issues = validateBasic();

        // Check if issues changed (to avoid spam)
        if (issuesEqual(issues, lastValidationIssues)) {
            return;
        }

        lastValidationIssues = [...issues];

        if (issues.length === 0) {
            // No issues - optionally show success message (debounced)
            showValidationSuccess();
            return;
        }

        // Output issues to channel
        outputValidationIssues(issues);
    } catch (error) {
        logger.error('[RealTimeValidation] Error during validation:', error as Error);
    }
}

/**
 * Output validation issues to the output channel
 */
function outputValidationIssues(issues: ValidationIssue[]): void {
    if (!outputChannel) {
        return;
    }

    // Clear previous output
    outputChannel.clear();

    // Output header
    outputChannel.appendLine('MyBatis Helper Configuration Issues');
    outputChannel.appendLine('=' .repeat(40));
    outputChannel.appendLine('');

    // Count by severity
    const errors = issues.filter(i => i.severity === 'error');
    const warnings = issues.filter(i => i.severity === 'warning');
    const infos = issues.filter(i => i.severity === 'info');

    outputChannel.appendLine(`Found: ${errors.length} error(s), ${warnings.length} warning(s), ${infos.length} info`);
    outputChannel.appendLine('');

    // Output each issue
    for (const issue of issues) {
        const severityTag = `[${issue.severity.toUpperCase()}]`;
        outputChannel.appendLine(`${severityTag} ${issue.configPath}`);
        outputChannel.appendLine(`  ${issue.message}`);
        outputChannel.appendLine(`  Suggestion: ${issue.suggestion}`);
        outputChannel.appendLine('');
    }

    // Show output channel if errors exist
    if (errors.length > 0) {
        outputChannel.show(true);
    }
}

/**
 * Show validation success message (debounced)
 */
let successDebounceTimer: NodeJS.Timeout | null = null;

function showValidationSuccess(): void {
    if (!outputChannel) {
        return;
    }

    // Clear previous success timer
    if (successDebounceTimer) {
        clearTimeout(successDebounceTimer);
    }

    // Debounce success message to avoid flashing
    successDebounceTimer = setTimeout(() => {
        outputChannel?.clear();
        outputChannel?.appendLine('MyBatis Helper Configuration');
        outputChannel?.appendLine('=' .repeat(30));
        outputChannel?.appendLine('');
        outputChannel?.appendLine('Configuration is valid!');
    }, 1000);
}

/**
 * Compare two issue arrays for equality
 */
function issuesEqual(a: ValidationIssue[], b: ValidationIssue[]): boolean {
    if (a.length !== b.length) {
        return false;
    }

    for (let i = 0; i < a.length; i++) {
        if (
            a[i].configPath !== b[i].configPath ||
            a[i].severity !== b[i].severity ||
            a[i].message !== b[i].message ||
            a[i].suggestion !== b[i].suggestion
        ) {
            return false;
        }
    }

    return true;
}

/**
 * Dispose resources
 */
export function dispose(): void {
    if (debounceTimer) {
        clearTimeout(debounceTimer);
        debounceTimer = null;
    }

    if (successDebounceTimer) {
        clearTimeout(successDebounceTimer);
        successDebounceTimer = null;
    }

    // Note: We don't dispose the output channel here
    // as it may be shared or managed elsewhere
    outputChannel = null;
    lastValidationIssues = [];

    logger.info('[RealTimeValidation] Disposed');
}
