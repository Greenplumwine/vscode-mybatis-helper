import * as vscode from "vscode";
import { PerformanceMonitor } from "../utils/performanceMonitor";
import { FastMappingEngine } from "../features/mapping/fastMappingEngine";
import { RegexUtils } from "../utils/performanceUtils";

export async function showPerformanceStatsCommand(): Promise<void> {
  try {
    const perfMonitor = PerformanceMonitor.getInstance();
    const mappingEngine = FastMappingEngine.getInstance();
    const regexUtils = RegexUtils.getInstance();

    // Get stats report
    const report = perfMonitor.getStatsReport(mappingEngine);

    // Get regex cache stats
    const regexStats = regexUtils.getCacheStats();
    const regexReport = [
      "",
      "Regex Cache:",
      `  Hot cache: ${regexStats.hotSize} / 50 entries`,
      `  Cold cache: ${regexStats.coldSize} / 50 entries`,
      `  Hot hits: ${regexStats.hotHits}`,
      `  Cold hits: ${regexStats.coldHits}`,
      `  Misses: ${regexStats.misses}`,
      `  Hit rate: ${(regexStats.hitRate * 100).toFixed(1)}%`,
    ].join("\n");

    const fullReport = report + regexReport;

    // Show in output channel
    const outputChannel = vscode.window.createOutputChannel(
      "MyBatis Helper Performance",
    );
    outputChannel.clear();
    outputChannel.appendLine(fullReport);
    outputChannel.show();

    // Also show info message
    vscode.window.showInformationMessage(
      vscode.l10n.t("performance.statsDisplayed"),
    );
  } catch (error) {
    vscode.window.showErrorMessage(
      vscode.l10n.t("performance.statsFailed", { error: String(error) }),
    );
    console.error("showPerformanceStats error:", error);
  }
}
