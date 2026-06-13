import * as fs from "node:fs/promises";
import * as path from "node:path";
import * as vscode from "vscode";

let outputChannel: vscode.OutputChannel | undefined;
let logFilePath: string | undefined;

export function initializeLogger(context: vscode.ExtensionContext): vscode.OutputChannel {
  outputChannel ??= vscode.window.createOutputChannel("SuperGit");
  logFilePath = path.join(context.logUri.fsPath, "supergit.log");
  info("logger initialized", { logFilePath, debug: isDebugEnabled() });
  return outputChannel;
}

export function showLogs(): void {
  outputChannel?.show(true);
}

export function isDebugEnabled(): boolean {
  return vscode.workspace.getConfiguration("superGit").get<boolean>("debug", false);
}

export function debug(message: string, details?: unknown): void {
  if (!isDebugEnabled()) {
    return;
  }
  write("debug", message, details);
}

export function info(message: string, details?: unknown): void {
  write("info", message, details);
}

export function warn(message: string, details?: unknown): void {
  write("warn", message, details);
}

export function error(message: string, details?: unknown): void {
  write("error", message, details);
}

function write(level: "debug" | "info" | "warn" | "error", message: string, details?: unknown): void {
  const line = `[${new Date().toISOString()}] [${level.toUpperCase()}] ${message}${details === undefined ? "" : ` ${formatDetails(details)}`}`;
  outputChannel?.appendLine(line);

  if (level === "error") {
    console.error(line);
  } else if (level === "warn") {
    console.warn(line);
  } else if (level === "debug") {
    console.debug(line);
  } else {
    console.log(line);
  }

  if (logFilePath) {
    void appendLogFile(line);
  }
}

async function appendLogFile(line: string): Promise<void> {
  if (!logFilePath) {
    return;
  }
  await fs.mkdir(path.dirname(logFilePath), { recursive: true });
  await fs.appendFile(logFilePath, `${line}\n`, "utf8");
}

function formatDetails(details: unknown): string {
  if (details instanceof Error) {
    return JSON.stringify({ name: details.name, message: details.message, stack: details.stack });
  }
  if (typeof details === "string") {
    return details;
  }
  try {
    return JSON.stringify(details);
  } catch {
    return String(details);
  }
}
