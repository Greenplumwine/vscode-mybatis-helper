/**
 * Validate Configuration command
 *
 * Provides on-demand full configuration validation with structured output.
 */

import * as vscode from "vscode";
import * as path from "path";
import { validateConfiguration } from "../services/validation";
import { logger } from "../utils/logger";

const OUTPUT_CHANNEL_NAME = "MyBatis Helper Validation";

/**
 * Execute the validate configuration command
 */
export async function validateConfigurationCommand(): Promise<void> {
  const outputChannel = vscode.window.createOutputChannel(OUTPUT_CHANNEL_NAME);

  await vscode.window.withProgress(
    {
      location: vscode.ProgressLocation.Notification,
      title: vscode.l10n.t("validation.validating"),
      cancellable: false,
    },
    async () => {
      try {
        const result = await validateConfiguration();

        // Output structured report
        outputValidationReport(outputChannel, result);

        // Show result message
        if (result.valid) {
          vscode.window.showInformationMessage(
            vscode.l10n.t("validation.valid"),
          );
        } else {
          const errorCount = result.issues.filter(
            (i) => i.severity === "error",
          ).length;
          vscode.window.showWarningMessage(
            vscode.l10n.t("validation.invalid", String(errorCount)),
          );
        }
      } catch (error) {
        logger.error("[ValidateCommand] Validation failed:", error as Error);
        vscode.window.showErrorMessage(
          vscode.l10n.t("validation.failed", String(error)),
        );
      }
    },
  );
}

/**
 * Output structured validation report to output channel
 */
function outputValidationReport(
  outputChannel: vscode.OutputChannel,
  result: {
    valid: boolean;
    issues: Array<{
      configPath: string;
      severity: "error" | "warning" | "info";
      message: string;
      suggestion: string;
    }>;
    timestamp: number;
  },
): void {
  outputChannel.clear();
  outputChannel.show(true);

  const timestamp = new Date(result.timestamp).toISOString();
  const errors = result.issues.filter((i) => i.severity === "error");
  const warnings = result.issues.filter((i) => i.severity === "warning");
  const infos = result.issues.filter((i) => i.severity === "info");

  // Header
  outputChannel.appendLine(vscode.l10n.t("validation.title"));
  outputChannel.appendLine("=".repeat(45));
  outputChannel.appendLine(
    `${vscode.l10n.t("validation.timestamp")}: ${timestamp}`,
  );
  outputChannel.appendLine(
    `${vscode.l10n.t("validation.status")}: ${result.valid ? vscode.l10n.t("validation.statusValid") : vscode.l10n.t("validation.statusInvalid")}`,
  );
  outputChannel.appendLine("");

  // Configuration file path
  const configPath = getSettingsJsonPath();
  if (configPath) {
    outputChannel.appendLine(
      `${vscode.l10n.t("validation.configFile")}: ${configPath}`,
    );
    outputChannel.appendLine("");
  }

  // Issues summary
  outputChannel.appendLine(
    `${vscode.l10n.t("validation.issuesFound")}: ${result.issues.length}`,
  );
  outputChannel.appendLine(
    `  - ${vscode.l10n.t("validation.errors")}: ${errors.length}`,
  );
  outputChannel.appendLine(
    `  - ${vscode.l10n.t("validation.warnings")}: ${warnings.length}`,
  );
  outputChannel.appendLine(
    `  - ${vscode.l10n.t("validation.info")}: ${infos.length}`,
  );
  outputChannel.appendLine("");

  // Detailed issues
  if (result.issues.length > 0) {
    outputChannel.appendLine(vscode.l10n.t("validation.details"));
    outputChannel.appendLine("-".repeat(40));
    outputChannel.appendLine("");

    for (const issue of result.issues) {
      const severityTag = `[${issue.severity.toUpperCase()}]`;
      outputChannel.appendLine(`${severityTag} ${issue.configPath}`);
      outputChannel.appendLine(`  ${issue.message}`);
      outputChannel.appendLine(
        `  ${vscode.l10n.t("validation.suggestion")}: ${issue.suggestion}`,
      );
      outputChannel.appendLine("");
    }
  }

  // Summary
  outputChannel.appendLine(vscode.l10n.t("validation.summary"));
  outputChannel.appendLine("-".repeat(40));
  outputChannel.appendLine(
    `- ${vscode.l10n.t("validation.errors")}: ${errors.length}`,
  );
  outputChannel.appendLine(
    `- ${vscode.l10n.t("validation.warnings")}: ${warnings.length}`,
  );
  outputChannel.appendLine(
    `- ${vscode.l10n.t("validation.info")}: ${infos.length}`,
  );
}

/**
 * Get the path to settings.json
 */
function getSettingsJsonPath(): string | undefined {
  const workspaceFolders = vscode.workspace.workspaceFolders;
  if (!workspaceFolders || workspaceFolders.length === 0) {
    // User settings
    // Note: VS Code doesn't expose the exact path to user settings
    return undefined;
  }

  // Workspace settings
  const workspaceRoot = workspaceFolders[0].uri.fsPath;
  return path.join(workspaceRoot, ".vscode", "settings.json");
}
