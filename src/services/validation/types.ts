/**
 * Validation types for configuration validation service
 */

export interface ValidationIssue {
    configPath: string;
    severity: 'error' | 'warning' | 'info';
    message: string;
    suggestion: string;
}

export interface ValidationResult {
    valid: boolean;
    issues: ValidationIssue[];
    timestamp: number;
}
