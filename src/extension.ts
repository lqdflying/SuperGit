import * as path from "node:path";
import * as vscode from "vscode";
import { executeBranchAction, executeCommitAction } from "./git/actions";
import { getActiveRepository, onRepositoryChange } from "./git/api";
import { getBranches, getCommits, getRemotes, getRepositoryState } from "./git/commands";
import { debug, error as logError, info, initializeLogger, isDebugEnabled, showLogs, warn } from "./logger";
import {
  DEFAULT_DATE_RANGE,
  PAGE_SIZE,
  type BranchAction,
  type CommitAction,
  type DateRange,
  type ExtHostMessage,
  type WebviewMessage
} from "./shared/types";

let panel: vscode.WebviewPanel | undefined;
let repositoryWatcher: vscode.Disposable | undefined;
let refreshTimer: NodeJS.Timeout | undefined;

const lastCommitRequest: { dateRange: DateRange; page: number; searchText: string } = {
  dateRange: DEFAULT_DATE_RANGE,
  page: 0,
  searchText: ""
};

export async function activate(context: vscode.ExtensionContext): Promise<void> {
  const outputChannel = initializeLogger(context);
  info("activating SuperGit", {
    extensionUri: context.extensionUri.toString(),
    extensionPath: context.extensionPath,
    debug: isDebugEnabled()
  });

  const statusBarItem = vscode.window.createStatusBarItem(vscode.StatusBarAlignment.Left, 100);
  statusBarItem.name = "SuperGit";
  statusBarItem.text = "$(git-commit) SuperGit";
  statusBarItem.tooltip = "Open SuperGit Git Graph";
  statusBarItem.command = "superGit.show";
  statusBarItem.show();
  info("status bar item shown", { command: statusBarItem.command });

  context.subscriptions.push(
    statusBarItem,
    vscode.commands.registerCommand("superGit.show", async () => {
      info("command invoked", { command: "superGit.show", source: "status-bar-or-command-palette" });
      try {
        await showSuperGitPanel(context);
      } catch (error) {
        postError(error);
      }
    }),
    vscode.commands.registerCommand("superGit.showLogs", () => {
      info("command invoked", { command: "superGit.showLogs" });
      showLogs();
    }),
    vscode.commands.registerCommand("superGit.toggleDebug", async () => {
      const config = vscode.workspace.getConfiguration("superGit");
      const next = !config.get<boolean>("debug", false);
      await config.update("debug", next, vscode.ConfigurationTarget.Global);
      info("debug setting toggled", { debug: next });
      outputChannel.show(true);
      void vscode.window.showInformationMessage(`SuperGit debug logging ${next ? "enabled" : "disabled"}.`);
    })
  );

  try {
    repositoryWatcher = await onRepositoryChange(() => {
      debug("repository change event received");
      if (!panel) {
        debug("repository change ignored because panel is not open");
        return;
      }
      if (refreshTimer) {
        clearTimeout(refreshTimer);
      }
      refreshTimer = setTimeout(() => {
        info("refreshing after repository change");
        post({ type: "repo-changed" });
        void loadInitialData();
      }, 400);
    });
    context.subscriptions.push(repositoryWatcher);
    info("repository watcher registered");
  } catch (error) {
    warn("repository watcher setup failed; command remains available", error);
  }

  info("SuperGit activation complete");
}

export function deactivate(): void {
  info("deactivating SuperGit");
  repositoryWatcher?.dispose();
  if (refreshTimer) {
    clearTimeout(refreshTimer);
  }
}

async function showSuperGitPanel(context: vscode.ExtensionContext): Promise<void> {
  if (panel) {
    info("revealing existing SuperGit panel");
    panel.reveal(vscode.ViewColumn.One);
    await loadInitialData();
    return;
  }

  info("creating SuperGit webview panel");
  panel = vscode.window.createWebviewPanel("superGit", "SuperGit", vscode.ViewColumn.One, {
    enableScripts: true,
    retainContextWhenHidden: true,
    localResourceRoots: [
      vscode.Uri.joinPath(context.extensionUri, "dist", "webview"),
      vscode.Uri.joinPath(context.extensionUri, "media"),
      vscode.Uri.joinPath(context.extensionUri, "assets")
    ]
  });
  debug("webview panel created", {
    localResourceRoots: [
      vscode.Uri.joinPath(context.extensionUri, "dist", "webview").toString(),
      vscode.Uri.joinPath(context.extensionUri, "media").toString(),
      vscode.Uri.joinPath(context.extensionUri, "assets").toString()
    ]
  });

  panel.iconPath = {
    light: vscode.Uri.joinPath(context.extensionUri, "assets", "icon.png"),
    dark: vscode.Uri.joinPath(context.extensionUri, "assets", "icon.png")
  };

  panel.onDidDispose(
    () => {
      info("SuperGit webview panel disposed");
      panel = undefined;
    },
    undefined,
    context.subscriptions
  );

  panel.webview.onDidReceiveMessage(
    (message: WebviewMessage) => {
      debug("webview message received", summarizeWebviewMessage(message));
      void handleWebviewMessage(message);
    },
    undefined,
    context.subscriptions
  );

  panel.webview.html = getWebviewHtml(panel.webview, context.extensionUri);
  info("webview html assigned");
}

async function handleWebviewMessage(message: WebviewMessage): Promise<void> {
  switch (message.type) {
    case "ready":
    case "request-initial-data":
      await loadInitialData();
      return;
    case "webview-log":
      logWebviewMessage(message.level, message.message, message.details);
      return;
    case "request-commits":
      lastCommitRequest.dateRange = message.dateRange;
      lastCommitRequest.page = message.page;
      lastCommitRequest.searchText = message.searchText;
      await loadCommits(message.dateRange, message.page, message.searchText);
      return;
    case "request-branches":
      await loadBranches();
      return;
    case "request-remotes":
      await loadRemotes();
      return;
    case "refresh":
      await loadInitialData();
      return;
    case "execute-action":
      await runCommitAction(message.action, message.commitHash);
      return;
    case "execute-branch-action":
      await runBranchAction(message.action, message.branchName, message.remote);
      return;
  }
}

async function loadInitialData(): Promise<void> {
  debug("loadInitialData start");
  post({ type: "loading", loading: true, scope: "all" });
  try {
    const root = await resolveRepositoryRoot();
    debug("resolved repository root", { root });
    const repo = await getRepositoryState(root);
    if (root) {
      repo.lastFetched = new Date().toISOString();
    }
    post({ type: "repo-state", repo });
    info("repository state loaded", {
      root: repo.root,
      currentBranch: repo.currentBranch,
      remoteCount: repo.remoteCount,
      commitCount: repo.commitCount
    });

    if (!root) {
      warn("no git repository root available");
      post({ type: "error", message: "Open a folder with a Git repository to use SuperGit." });
      post({ type: "commits-data", commits: [], pagination: emptyPagination() });
      post({ type: "branches-data", branches: [] });
      post({ type: "remotes-data", remotes: [] });
      return;
    }

    await Promise.all([
      loadCommits(lastCommitRequest.dateRange, lastCommitRequest.page, lastCommitRequest.searchText, root),
      loadBranches(root),
      loadRemotes(root)
    ]);
  } catch (error) {
    postError(error);
  } finally {
    post({ type: "loading", loading: false, scope: "all" });
  }
}

async function loadCommits(dateRange: DateRange, page: number, searchText: string, knownRoot?: string): Promise<void> {
  debug("loadCommits start", { dateRange, page, searchTextLength: searchText.length, knownRoot });
  post({ type: "loading", loading: true, scope: "commits" });
  try {
    const root = knownRoot ?? (await resolveRepositoryRoot());
    if (!root) {
      post({ type: "commits-data", commits: [], pagination: emptyPagination() });
      return;
    }

    const result = await getCommits(root, dateRange, page, PAGE_SIZE, searchText);
    post({ type: "commits-data", commits: result.commits, pagination: result.pagination });
    info("commits loaded", {
      count: result.commits.length,
      total: result.pagination.totalItems,
      page: result.pagination.page,
      totalPages: result.pagination.totalPages
    });
  } catch (error) {
    postError(error);
  } finally {
    post({ type: "loading", loading: false, scope: "commits" });
  }
}

async function loadBranches(knownRoot?: string): Promise<void> {
  debug("loadBranches start", { knownRoot });
  post({ type: "loading", loading: true, scope: "branches" });
  try {
    const root = knownRoot ?? (await resolveRepositoryRoot());
    const branches = root ? await getBranches(root) : [];
    post({ type: "branches-data", branches });
    info("branches loaded", { count: branches.length });
  } catch (error) {
    postError(error);
  } finally {
    post({ type: "loading", loading: false, scope: "branches" });
  }
}

async function loadRemotes(knownRoot?: string): Promise<void> {
  debug("loadRemotes start", { knownRoot });
  post({ type: "loading", loading: true, scope: "remotes" });
  try {
    const root = knownRoot ?? (await resolveRepositoryRoot());
    const remotes = root ? await getRemotes(root) : [];
    post({ type: "remotes-data", remotes });
    info("remotes loaded", { count: remotes.length });
  } catch (error) {
    postError(error);
  } finally {
    post({ type: "loading", loading: false, scope: "remotes" });
  }
}

async function runCommitAction(action: CommitAction, commitHash: string): Promise<void> {
  info("commit action requested", { action, commitHash: commitHash.slice(0, 12) });
  const root = await resolveRepositoryRoot();
  if (!root) {
    post({ type: "action-result", success: false, message: "No Git repository is open." });
    return;
  }

  post({ type: "loading", loading: true, scope: "action" });
  try {
    const result = await executeCommitAction(root, action, commitHash);
    post({ type: "action-result", ...result });
    showActionNotification(result);
    if (result.success && action !== "copy-hash") {
      await loadInitialData();
    }
  } catch (error) {
    postError(error);
  } finally {
    post({ type: "loading", loading: false, scope: "action" });
  }
}

async function runBranchAction(action: BranchAction, branchName?: string, remote?: string): Promise<void> {
  info("branch action requested", { action, branchName, remote });
  const root = await resolveRepositoryRoot();
  if (!root) {
    post({ type: "action-result", success: false, message: "No Git repository is open." });
    return;
  }

  post({ type: "loading", loading: true, scope: "action" });
  try {
    const result = await executeBranchAction(root, action, branchName, remote);
    post({ type: "action-result", ...result });
    showActionNotification(result);
    if (result.success) {
      await loadInitialData();
    }
  } catch (error) {
    postError(error);
  } finally {
    post({ type: "loading", loading: false, scope: "action" });
  }
}

async function resolveRepositoryRoot(): Promise<string | undefined> {
  const activeRepository = await getActiveRepository();
  debug("active repository lookup", activeRepository);
  return activeRepository?.root;
}

function post(message: ExtHostMessage): void {
  debug("posting message to webview", summarizeExtHostMessage(message));
  void panel?.webview.postMessage(message);
}

function postError(error: unknown): void {
  const message = error instanceof Error ? error.message : String(error);
  logError("SuperGit error", error);
  post({ type: "error", message });
  void vscode.window.showErrorMessage(message);
}

function showActionNotification(result: { success: boolean; message: string }): void {
  if (result.success) {
    void vscode.window.showInformationMessage(result.message);
  } else if (result.message !== "Action cancelled.") {
    void vscode.window.showWarningMessage(result.message);
  }
}

function emptyPagination() {
  return {
    enabled: false,
    page: 0,
    pageSize: PAGE_SIZE,
    totalItems: 0,
    totalPages: 1
  };
}

function getWebviewHtml(webview: vscode.Webview, extensionUri: vscode.Uri): string {
  const scriptUri = webview.asWebviewUri(vscode.Uri.joinPath(extensionUri, "dist", "webview", "main.js"));
  const styleUri = webview.asWebviewUri(vscode.Uri.joinPath(extensionUri, "media", "styles.css"));
  const logoUri = webview.asWebviewUri(vscode.Uri.joinPath(extensionUri, "assets", "logo.png"));
  const nonce = getNonce();
  const bootstrap = JSON.stringify({ logoUri: logoUri.toString() });
  debug("webview resource URIs prepared", {
    scriptUri: scriptUri.toString(),
    styleUri: styleUri.toString(),
    logoUri: logoUri.toString()
  });

  return /* html */ `<!DOCTYPE html>
<html lang="en">
<head>
  <meta charset="UTF-8">
  <meta http-equiv="Content-Security-Policy" content="default-src 'none'; img-src ${webview.cspSource} data:; style-src ${webview.cspSource} 'unsafe-inline'; script-src 'nonce-${nonce}';">
  <meta name="viewport" content="width=device-width, initial-scale=1.0">
  <link nonce="${nonce}" rel="stylesheet" href="${styleUri}">
  <title>SuperGit</title>
</head>
<body>
  <div id="root"><div class="boot-fallback"><strong>SuperGit</strong><span>Loading Git graph...</span></div></div>
  <script nonce="${nonce}">
    (function () {
      window.__SUPERGIT_BOOTSTRAP__ = ${bootstrap};
      var vscode = typeof acquireVsCodeApi === "function" ? acquireVsCodeApi() : undefined;
      window.__SUPERGIT_VSCODE_API__ = vscode;
      function serialize(value) {
        if (value instanceof Error) {
          return { name: value.name, message: value.message, stack: value.stack };
        }
        if (value && typeof value === "object") {
          try {
            return JSON.parse(JSON.stringify(value));
          } catch (error) {
            return String(value);
          }
        }
        return value;
      }
      window.__SUPERGIT_POST_LOG__ = function (level, message, details) {
        try {
          vscode && vscode.postMessage({ type: "webview-log", level: level, message: message, details: serialize(details) });
        } catch (error) {
          console.error("SuperGit log bridge failed", error);
        }
      };
      window.addEventListener("error", function (event) {
        window.__SUPERGIT_POST_LOG__("error", "webview window error", {
          message: event.message,
          filename: event.filename,
          lineno: event.lineno,
          colno: event.colno,
          error: serialize(event.error)
        });
      });
      window.addEventListener("unhandledrejection", function (event) {
        window.__SUPERGIT_POST_LOG__("error", "webview unhandled rejection", serialize(event.reason));
      });
      window.__SUPERGIT_POST_LOG__("info", "webview html loaded", { userAgent: navigator.userAgent });
    })();
  </script>
  <script nonce="${nonce}" src="${scriptUri}"></script>
</body>
</html>`;
}

function logWebviewMessage(level: "debug" | "info" | "warn" | "error", message: string, details?: unknown): void {
  const formattedMessage = `webview: ${message}`;
  switch (level) {
    case "debug":
      debug(formattedMessage, details);
      return;
    case "info":
      info(formattedMessage, details);
      return;
    case "warn":
      warn(formattedMessage, details);
      return;
    case "error":
      logError(formattedMessage, details);
      return;
  }
}

function summarizeWebviewMessage(message: WebviewMessage) {
  if (message.type === "request-commits") {
    return {
      type: message.type,
      dateRange: message.dateRange,
      page: message.page,
      searchTextLength: message.searchText.length
    };
  }
  if (message.type === "execute-action") {
    return {
      type: message.type,
      action: message.action,
      commitHash: message.commitHash.slice(0, 12)
    };
  }
  if (message.type === "webview-log") {
    return {
      type: message.type,
      level: message.level,
      message: message.message
    };
  }
  return message;
}

function summarizeExtHostMessage(message: ExtHostMessage) {
  switch (message.type) {
    case "commits-data":
      return { type: message.type, count: message.commits.length, pagination: message.pagination };
    case "branches-data":
      return { type: message.type, count: message.branches.length };
    case "remotes-data":
      return { type: message.type, count: message.remotes.length };
    case "repo-state":
      return { type: message.type, repo: message.repo };
    default:
      return message;
  }
}

function getNonce(): string {
  const alphabet = "ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwxyz0123456789";
  let text = "";
  for (let index = 0; index < 32; index += 1) {
    text += alphabet.charAt(Math.floor(Math.random() * alphabet.length));
  }
  return text;
}
