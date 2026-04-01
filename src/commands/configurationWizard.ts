/**
 * Configuration Wizard Command
 *
 * Guides users through a 4-step setup process:
 * 1. Project Type Detection
 * 2. XML Directories Configuration
 * 3. Naming Convention Selection
 * 4. SQL Interception Mode
 */

import * as vscode from "vscode";
import * as path from "path";
import * as fs from "fs/promises";

interface WizardState {
  projectType: "maven" | "gradle" | "other" | undefined;
  xmlDirectories: string[];
  namingConvention: string;
  customPattern: string | undefined;
  sqlListenMode: "auto" | "debugConsole" | "terminal";
}

/**
 * Run the configuration wizard
 */
export async function runConfigurationWizard(): Promise<void> {
  const state: WizardState = {
    projectType: undefined,
    xmlDirectories: [],
    namingConvention: "",
    customPattern: undefined,
    sqlListenMode: "auto",
  };

  try {
    // Step 1: Project Type Detection
    const projectTypeResult = await step1ProjectType();
    if (projectTypeResult === undefined) {
      await showCancelledMessage();
      return;
    }
    state.projectType = projectTypeResult;

    // Step 2: XML Directories Configuration
    const xmlDirsResult = await step2XmlDirectories(state.projectType);
    if (xmlDirsResult === undefined) {
      await showCancelledMessage();
      return;
    }
    state.xmlDirectories = xmlDirsResult;

    // Step 3: Naming Convention
    const namingResult = await step3NamingConvention();
    if (namingResult === undefined) {
      await showCancelledMessage();
      return;
    }
    state.namingConvention = namingResult.convention;
    state.customPattern = namingResult.customPattern;

    // Step 4: SQL Interception Mode
    const sqlModeResult = await step4SqlInterceptionMode();
    if (sqlModeResult === undefined) {
      await showCancelledMessage();
      return;
    }
    state.sqlListenMode = sqlModeResult;

    // Save configuration
    await saveConfiguration(state);

    // Show success message with reload option
    const reloadAction = vscode.l10n.t("wizard.reload");
    const laterAction = vscode.l10n.t("wizard.later");

    const result = await vscode.window.showInformationMessage(
      vscode.l10n.t("wizard.saved"),
      reloadAction,
      laterAction,
    );

    if (result === reloadAction) {
      await vscode.commands.executeCommand("workbench.action.reloadWindow");
    }
  } catch (error) {
    vscode.window.showErrorMessage(
      vscode.l10n.t("wizard.error", { error: String(error) }),
    );
  }
}

/**
 * Step 1: Project Type Detection
 */
async function step1ProjectType(): Promise<
  "maven" | "gradle" | "other" | undefined
> {
  // Auto-detect project type
  const detectedType = await detectProjectType();

  const items: vscode.QuickPickItem[] = [
    {
      label: vscode.l10n.t("wizard.projectType.maven"),
      description:
        detectedType === "maven"
          ? vscode.l10n.t("wizard.projectType.detected")
          : "",
      picked: detectedType === "maven",
    },
    {
      label: vscode.l10n.t("wizard.projectType.gradle"),
      description:
        detectedType === "gradle"
          ? vscode.l10n.t("wizard.projectType.detected")
          : "",
      picked: detectedType === "gradle",
    },
    {
      label: vscode.l10n.t("wizard.projectType.other"),
      description:
        detectedType === "other"
          ? vscode.l10n.t("wizard.projectType.detected")
          : "",
    },
  ];

  const result = await vscode.window.showQuickPick(items, {
    placeHolder: vscode.l10n.t("wizard.step.projectType", { step: 1 }),
    ignoreFocusOut: true,
  });

  if (result === undefined) {
    return undefined;
  }

  if (result.label === vscode.l10n.t("wizard.projectType.maven")) {
    return "maven";
  } else if (result.label === vscode.l10n.t("wizard.projectType.gradle")) {
    return "gradle";
  } else {
    return "other";
  }
}

/**
 * Auto-detect project type based on build files
 */
async function detectProjectType(): Promise<"maven" | "gradle" | "other"> {
  const workspaceFolders = vscode.workspace.workspaceFolders;
  if (!workspaceFolders) {
    return "other";
  }

  for (const folder of workspaceFolders) {
    try {
      await fs.access(path.join(folder.uri.fsPath, "pom.xml"));
      return "maven";
    } catch {
      // Not Maven
    }

    try {
      const gradleExists = await fs
        .access(path.join(folder.uri.fsPath, "build.gradle"))
        .then(() => true)
        .catch(() =>
          fs
            .access(path.join(folder.uri.fsPath, "build.gradle.kts"))
            .then(() => true)
            .catch(() => false),
        );
      if (gradleExists) {
        return "gradle";
      }
    } catch {
      // Not Gradle
    }
  }

  return "other";
}

/**
 * Step 2: XML Directories Configuration
 */
async function step2XmlDirectories(
  projectType: "maven" | "gradle" | "other",
): Promise<string[] | undefined> {
  const directories: string[] = [];

  // Get default suggestions based on project type
  const defaultDirs = getDefaultXmlDirectories(projectType);

  // Add default directories first
  for (const dir of defaultDirs) {
    const exists = await checkDirectoryExists(dir);
    if (exists) {
      directories.push(dir);
    }
  }

  // Allow user to add more directories
  let addingDirectories = true;
  while (addingDirectories) {
    const currentDirsText =
      directories.length > 0
        ? directories.join(", ")
        : vscode.l10n.t("wizard.xmlDirs.none");

    const items: vscode.QuickPickItem[] = [
      {
        label: vscode.l10n.t("wizard.xmlDirs.add"),
        description: "",
        alwaysShow: true,
      },
      {
        label: vscode.l10n.t("wizard.xmlDirs.done"),
        description: currentDirsText,
        alwaysShow: true,
      },
    ];

    // If no directories added yet, show warning
    if (directories.length === 0) {
      items.unshift({
        label: vscode.l10n.t("wizard.xmlDirs.warning"),
        description: "",
        alwaysShow: true,
      });
    }

    const result = await vscode.window.showQuickPick(items, {
      placeHolder: vscode.l10n.t("wizard.step.xmlDirs", { step: 2 }),
      ignoreFocusOut: true,
    });

    if (result === undefined) {
      return undefined; // User cancelled
    }

    if (result.label === vscode.l10n.t("wizard.xmlDirs.done")) {
      addingDirectories = false;
    } else if (result.label === vscode.l10n.t("wizard.xmlDirs.add")) {
      const input = await vscode.window.showInputBox({
        prompt: vscode.l10n.t("wizard.xmlDirs.prompt"),
        placeHolder: "src/main/resources/mappers",
        ignoreFocusOut: true,
        validateInput: (value) => {
          if (!value || value.trim().length === 0) {
            return vscode.l10n.t("wizard.xmlDirs.required");
          }
          return null;
        },
      });

      if (input === undefined) {
        // User cancelled input, go back to menu
        continue;
      }

      const trimmedInput = input.trim();
      if (!directories.includes(trimmedInput)) {
        directories.push(trimmedInput);
      }
    }
  }

  return directories;
}

/**
 * Get default XML directories based on project type
 */
function getDefaultXmlDirectories(
  projectType: "maven" | "gradle" | "other",
): string[] {
  switch (projectType) {
    case "maven":
      return ["src/main/resources/mappers", "src/main/resources/mapper"];
    case "gradle":
      return ["src/main/resources/mappers"];
    case "other":
    default:
      return ["src/main/resources"];
  }
}

/**
 * Check if a directory exists
 */
async function checkDirectoryExists(dirPath: string): Promise<boolean> {
  const workspaceFolders = vscode.workspace.workspaceFolders;
  if (!workspaceFolders) {
    return false;
  }

  for (const folder of workspaceFolders) {
    try {
      const fullPath = path.join(folder.uri.fsPath, dirPath);
      const stat = await fs.stat(fullPath);
      if (stat.isDirectory()) {
        return true;
      }
    } catch {
      // Directory doesn't exist
    }
  }

  return false;
}

/**
 * Step 3: Naming Convention Selection
 */
async function step3NamingConvention(): Promise<
  { convention: string; customPattern?: string } | undefined
> {
  const items: vscode.QuickPickItem[] = [
    {
      label: vscode.l10n.t("wizard.naming.standard"),
      description: "*Mapper.java -> *Mapper.xml",
      detail: vscode.l10n.t("wizard.naming.standard.detail"),
    },
    {
      label: vscode.l10n.t("wizard.naming.dao"),
      description: "*Dao.java -> *Mapper.xml",
      detail: vscode.l10n.t("wizard.naming.dao.detail"),
    },
    {
      label: vscode.l10n.t("wizard.naming.simple"),
      description: "*Mapper.java -> *.xml",
      detail: vscode.l10n.t("wizard.naming.simple.detail"),
    },
    {
      label: vscode.l10n.t("wizard.naming.custom"),
      description: vscode.l10n.t("wizard.naming.custom.desc"),
      detail: vscode.l10n.t("wizard.naming.custom.detail"),
    },
  ];

  const result = await vscode.window.showQuickPick(items, {
    placeHolder: vscode.l10n.t("wizard.step.naming", { step: 3 }),
    ignoreFocusOut: true,
  });

  if (result === undefined) {
    return undefined;
  }

  let convention: string;
  let customPattern: string | undefined;

  if (result.label === vscode.l10n.t("wizard.naming.standard")) {
    convention = "standard";
  } else if (result.label === vscode.l10n.t("wizard.naming.dao")) {
    convention = "dao";
  } else if (result.label === vscode.l10n.t("wizard.naming.simple")) {
    convention = "simple";
  } else {
    convention = "custom";
    customPattern = await vscode.window.showInputBox({
      prompt: vscode.l10n.t("wizard.naming.customPrompt"),
      placeHolder: "e.g., *Mapper.java -> *Mapper.xml",
      ignoreFocusOut: true,
      validateInput: (value) => {
        if (!value || value.trim().length === 0) {
          return vscode.l10n.t("wizard.naming.customRequired");
        }
        return null;
      },
    });

    if (customPattern === undefined) {
      return undefined; // User cancelled
    }
  }

  return { convention, customPattern };
}

/**
 * Step 4: SQL Interception Mode
 */
async function step4SqlInterceptionMode(): Promise<
  "auto" | "debugConsole" | "terminal" | undefined
> {
  const items: vscode.QuickPickItem[] = [
    {
      label: vscode.l10n.t("wizard.sqlMode.auto"),
      description: vscode.l10n.t("wizard.sqlMode.auto.desc"),
      detail: vscode.l10n.t("wizard.sqlMode.auto.detail"),
    },
    {
      label: vscode.l10n.t("wizard.sqlMode.debugConsole"),
      description: vscode.l10n.t("wizard.sqlMode.debugConsole.desc"),
      detail: vscode.l10n.t("wizard.sqlMode.debugConsole.detail"),
    },
    {
      label: vscode.l10n.t("wizard.sqlMode.terminal"),
      description: vscode.l10n.t("wizard.sqlMode.terminal.desc"),
      detail: vscode.l10n.t("wizard.sqlMode.terminal.detail"),
    },
  ];

  const result = await vscode.window.showQuickPick(items, {
    placeHolder: vscode.l10n.t("wizard.step.sqlMode", { step: 4 }),
    ignoreFocusOut: true,
  });

  if (result === undefined) {
    return undefined;
  }

  if (result.label === vscode.l10n.t("wizard.sqlMode.auto")) {
    return "auto";
  } else if (result.label === vscode.l10n.t("wizard.sqlMode.debugConsole")) {
    return "debugConsole";
  } else {
    return "terminal";
  }
}

/**
 * Save configuration to workspace settings
 */
async function saveConfiguration(state: WizardState): Promise<void> {
  const config = vscode.workspace.getConfiguration("mybatis-helper");

  // Save XML directories
  if (state.xmlDirectories.length > 0) {
    await config.update("customXmlDirectories", state.xmlDirectories, false);
  }

  // Save naming convention as name matching rules
  const nameMatchingRules = buildNameMatchingRules(
    state.namingConvention,
    state.customPattern,
  );
  await config.update("nameMatchingRules", nameMatchingRules, false);

  // Save SQL interception mode
  await config.update("sqlInterceptor.listenMode", state.sqlListenMode, false);
}

/**
 * Build name matching rules based on convention selection
 */
function buildNameMatchingRules(
  convention: string,
  customPattern?: string,
): Array<{
  name: string;
  enabled: boolean;
  javaPattern: string;
  xmlPattern: string;
  description: string;
}> {
  const rules = [];

  switch (convention) {
    case "standard":
      rules.push({
        name: "Standard Mapper",
        enabled: true,
        javaPattern: "*Mapper",
        xmlPattern: "${javaName}",
        description: "Maps *Mapper.java to *Mapper.xml",
      });
      break;
    case "dao":
      rules.push({
        name: "DAO Style",
        enabled: true,
        javaPattern: "*Dao",
        xmlPattern: "${javaName}",
        description: "Maps *Dao.java to *Dao.xml",
      });
      break;
    case "simple":
      rules.push({
        name: "Simple Pattern",
        enabled: true,
        javaPattern: "*Mapper",
        xmlPattern: "*",
        description: "Maps *Mapper.java to *.xml",
      });
      break;
    case "custom":
      rules.push({
        name: "Custom Pattern",
        enabled: true,
        javaPattern: "*",
        xmlPattern: customPattern || "${javaName}",
        description: customPattern || "Custom naming pattern",
      });
      break;
  }

  return rules;
}

/**
 * Show cancelled message
 */
async function showCancelledMessage(): Promise<void> {
  vscode.window.showInformationMessage(vscode.l10n.t("wizard.cancelled"));
}
