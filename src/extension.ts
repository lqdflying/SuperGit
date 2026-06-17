import * as path from "node:path";
import * as vscode from "vscode";
import { executeBranchAction, executeCommitAction } from "./git/actions";
import { getActiveRepository, onRepositoryChange } from "./git/api";
import {
  getBranches,
  getCommitBaseHash,
  getCommitFileChanges,
  getCommits,
  getFilesDiff,
  getRemoteBranches,
  getRemotes,
  getRepositoryState,
  invalidateRemoteDataCaches,
  resolveDefaultBranch
} from "./git/commands";
import { enrichRemotesWithDefaultBranches } from "./git/remote-default";
import { runGit } from "./git/runner";
import { createSuperGitContentUri, SUPERGIT_DIFF_SCHEME, SuperGitDiffContentProvider } from "./git/diffProvider";
import {
  shouldEnrichRemoteDefaultsAfterAction,
  shouldInvalidateRemoteDefaultBranches,
  shouldReloadCommitsAfterAction
} from "./extension/refreshPolicy";
import { debug, error as logError, info, initializeLogger, isDebugEnabled, showLogs, warn } from "./logger";
import {
  DEFAULT_DATE_RANGE,
  DEFAULT_HISTORY_SCOPE,
  PAGE_SIZE,
  type BranchAction,
  type CommitFileChange,
  type CommitAction,
  type DateRange,
  type ExtHostMessage,
  type FilesDiffFileChange,
  type FilesDiffPayload,
  type HistoryScope,
  type RemoteConfig,
  type WebviewMessage,
  type WebviewTab
} from "./shared/types";

let panel: vscode.WebviewPanel | undefined;
let repositoryWatcher: vscode.Disposable | undefined;
let refreshTimer: NodeJS.Timeout | undefined;
let lastDefaultBranch = "main";
let lastRemotes: RemoteConfig[] = [];
let actionRefreshInProgress = false;
let managedRefreshGeneration = 0;
let managedRefreshClearTimer: NodeJS.Timeout | undefined;
let loadInitialDataPromise: Promise<void> | undefined;
let enrichRemoteDefaultsGeneration = 0;
let latestEnrichRemoteDefaultsKey: string | undefined;
const enrichRemoteDefaultsInflight = new Map<string, Promise<void>>();

const lastCommitRequest: { dateRange: DateRange; page: number; searchText: string; scope: HistoryScope } = {
  dateRange: DEFAULT_DATE_RANGE,
  page: 0,
  searchText: "",
  scope: DEFAULT_HISTORY_SCOPE
};

const lastFilesDiffRequest: { leftRef?: string; rightRef?: string } = {};

let activeWebviewTab: WebviewTab = "graph";
let commitGraphDirty = false;
let commitGraphDirtyEpoch = 0;

type LoadRemotesOptions = {
  enrichDefaults?: boolean;
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
  statusBarItem.tooltip = "Open SuperGit";
  statusBarItem.command = "superGit.show";
  statusBarItem.show();
  info("status bar item shown", { command: statusBarItem.command });

  context.subscriptions.push(
    vscode.workspace.registerTextDocumentContentProvider(SUPERGIT_DIFF_SCHEME, new SuperGitDiffContentProvider()),
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

  context.subscriptions.push(
    vscode.window.onDidChangeActiveColorTheme(() => {
      if (panel) {
        post({ type: "theme-changed" });
      }
    })
  );

  try {
    repositoryWatcher = await onRepositoryChange(() => {
      debug("repository change event received");
      if (!panel) {
        debug("repository change ignored because panel is not open");
        return;
      }
      if (actionRefreshInProgress) {
        debug("repository change skipped; managed refresh already running");
        return;
      }
      if (refreshTimer) {
        clearTimeout(refreshTimer);
      }
      refreshTimer = setTimeout(() => {
        if (actionRefreshInProgress) {
          debug("repository change skipped; managed refresh already running");
          return;
        }
        info("refreshing after repository change");
        post({ type: "repo-changed" });
        void (async () => {
          const root = await resolveRepositoryRoot();
          if (root) {
            invalidateRemoteDataCaches(root);
          }
          await loadInitialData();
        })();
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
  if (managedRefreshClearTimer) {
    clearTimeout(managedRefreshClearTimer);
  }
}

function beginManagedRefresh(scope: string): number {
  if (refreshTimer) {
    clearTimeout(refreshTimer);
    refreshTimer = undefined;
  }
  if (managedRefreshClearTimer) {
    clearTimeout(managedRefreshClearTimer);
    managedRefreshClearTimer = undefined;
  }

  managedRefreshGeneration += 1;
  actionRefreshInProgress = true;
  debug("managed refresh start", { scope, generation: managedRefreshGeneration });
  return managedRefreshGeneration;
}

function endManagedRefresh(generation: number, settleMs = 1500): void {
  if (managedRefreshClearTimer) {
    clearTimeout(managedRefreshClearTimer);
  }
  managedRefreshClearTimer = setTimeout(() => {
    if (managedRefreshGeneration !== generation) {
      debug("managed refresh end skipped; superseded", { generation, current: managedRefreshGeneration });
      return;
    }
    actionRefreshInProgress = false;
    managedRefreshClearTimer = undefined;
    debug("managed refresh end", { generation });
  }, settleMs);
}

function enrichRemoteDefaultsKey(root: string, remotes: RemoteConfig[]): string {
  return `${root}\0${remotes.map((remote) => remote.name).sort().join("\0")}`;
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
      lastCommitRequest.scope = message.scope;
      await loadCommits(message.dateRange, message.page, message.searchText, message.scope);
      return;
    case "request-branches":
      await loadBranches();
      return;
    case "request-remotes":
      await loadRemotes();
      return;
    case "request-commit-details":
      await loadCommitDetails(message.commitHash);
      return;
    case "request-files-diff":
      lastFilesDiffRequest.leftRef = message.leftRef;
      lastFilesDiffRequest.rightRef = message.rightRef;
      await loadFilesDiff(message.leftRef, message.rightRef);
      return;
    case "open-commit-file-diff":
      await openCommitFileDiff(message.commitHash, message.file);
      return;
    case "open-files-diff-file":
      await openFilesDiffFile(message.leftRef, message.rightRef, message.file);
      return;
    case "refresh":
      await refreshFromRemote();
      return;
    case "tab-changed":
      activeWebviewTab = message.tab;
      debug("webview tab changed", { tab: message.tab });
      if (message.tab === "graph" && commitGraphDirty) {
        debug("loadCommits on graph tab entry; graph was dirty");
        void loadCommits(
          lastCommitRequest.dateRange,
          lastCommitRequest.page,
          lastCommitRequest.searchText,
          lastCommitRequest.scope
        );
      }
      return;
    case "execute-action":
      await runCommitAction(message.action, message.commitHash);
      return;
    case "execute-branch-action":
      await runBranchAction(message.action, message.branchName, message.remote, message.remoteBranchName, message.activeTab);
      return;
  }
}

async function refreshFromRemote(): Promise<void> {
  const generation = beginManagedRefresh("refresh-from-remote");
  try {
    const root = await resolveRepositoryRoot();
    if (root) {
      post({ type: "loading", loading: true, scope: "all" });
      try {
        const result = await runGit(["fetch", "--all", "--prune"], root, { timeout: 120_000 });
        if (result.exitCode !== 0) {
          warn("refresh fetch failed", { stderr: result.stderr.trim() });
        } else {
          invalidateRemoteDataCaches(root);
        }
      } catch (error) {
        warn("refresh fetch error", { error: String(error) });
      }
    }
    await loadInitialData();
  } finally {
    endManagedRefresh(generation);
  }
}

async function loadInitialData(): Promise<void> {
  if (loadInitialDataPromise) {
    debug("loadInitialData coalesced with in-flight load");
    return loadInitialDataPromise;
  }

  loadInitialDataPromise = loadInitialDataInner().finally(() => {
    loadInitialDataPromise = undefined;
  });
  return loadInitialDataPromise;
}

async function loadInitialDataInner(): Promise<void> {
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
      post({ type: "branches-data", branches: [], remoteBranches: [], defaultBranch: "main" });
      post({ type: "remotes-data", remotes: [] });
      return;
    }

    await Promise.all([
      loadCommits(lastCommitRequest.dateRange, lastCommitRequest.page, lastCommitRequest.searchText, lastCommitRequest.scope, root),
      loadBranches(root),
      loadRemotes(root)
    ]);
    if (activeWebviewTab === "files" && lastFilesDiffRequest.leftRef && lastFilesDiffRequest.rightRef) {
      await loadFilesDiff(lastFilesDiffRequest.leftRef, lastFilesDiffRequest.rightRef, root);
    }
  } catch (error) {
    postError(error);
  } finally {
    post({ type: "loading", loading: false, scope: "all" });
  }
}


async function loadCommits(dateRange: DateRange, page: number, searchText: string, scope: HistoryScope, knownRoot?: string): Promise<void> {
  const epochAtStart = commitGraphDirtyEpoch;
  debug("loadCommits start", { dateRange, page, searchTextLength: searchText.length, scope, knownRoot });
  post({ type: "loading", loading: true, scope: "commits" });
  try {
    const root = knownRoot ?? (await resolveRepositoryRoot());
    if (!root) {
      post({ type: "commits-data", commits: [], pagination: emptyPagination() });
      return;
    }

    const result = await getCommits(root, dateRange, page, PAGE_SIZE, searchText, scope);
    post({ type: "commits-data", commits: result.commits, pagination: result.pagination });
    if (commitGraphDirtyEpoch === epochAtStart) {
      commitGraphDirty = false;
    }
    info("commits loaded", {
      count: result.commits.length,
      total: result.pagination.totalItems,
      page: result.pagination.page,
      totalPages: result.pagination.totalPages,
      scope
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
    const [branches, remoteBranches, defaultBranch] = root
      ? await Promise.all([getBranches(root), getRemoteBranches(root), resolveDefaultBranch(root)])
      : [[], [], "main"];
    lastDefaultBranch = defaultBranch;
    post({ type: "branches-data", branches, remoteBranches, defaultBranch });
    info("branches loaded", { count: branches.length, remoteBranchCount: remoteBranches.length });
  } catch (error) {
    postError(error);
  } finally {
    post({ type: "loading", loading: false, scope: "branches" });
  }
}

async function loadCommitDetails(commitHash: string, knownRoot?: string): Promise<void> {
  debug("loadCommitDetails start", { commitHash: commitHash.slice(0, 12), knownRoot });
  post({ type: "loading", loading: true, scope: "commit-details" });
  try {
    const root = knownRoot ?? (await resolveRepositoryRoot());
    if (!root) {
      post({ type: "commit-details-data", commitHash, files: [] });
      return;
    }

    const result = await getCommitFileChanges(root, commitHash);
    post({ type: "commit-details-data", commitHash, baseHash: result.baseHash, files: result.files });
    info("commit details loaded", { commitHash: commitHash.slice(0, 12), fileCount: result.files.length });
  } catch (error) {
    postError(error);
  } finally {
    post({ type: "loading", loading: false, scope: "commit-details" });
  }
}

async function loadFilesDiff(leftRef: string, rightRef: string, knownRoot?: string): Promise<void> {
  debug("loadFilesDiff start", { leftRef, rightRef, knownRoot });
  post({ type: "loading", loading: true, scope: "files-diff" });
  try {
    const root = knownRoot ?? (await resolveRepositoryRoot());
    if (!root) {
      post({ type: "files-diff-data", diff: emptyFilesDiff(leftRef, rightRef) });
      return;
    }

    const diff = await getFilesDiff(root, leftRef, rightRef);
    post({ type: "files-diff-data", diff });
    info("files diff loaded", {
      leftRef,
      rightRef,
      fileCount: diff.summary.files,
      additions: diff.summary.additions,
      deletions: diff.summary.deletions
    });
  } catch (error) {
    postError(error);
  } finally {
    post({ type: "loading", loading: false, scope: "files-diff" });
  }
}

async function loadRemotes(knownRoot?: string, options?: LoadRemotesOptions): Promise<void> {
  const enrichDefaults = options?.enrichDefaults !== false;
  debug("loadRemotes start", { knownRoot, enrichDefaults });
  post({ type: "loading", loading: true, scope: "remotes" });
  try {
    const root = knownRoot ?? (await resolveRepositoryRoot());
    const remotes = root ? await getRemotes(root) : [];
    const remotesWithDefaults = enrichDefaults
      ? remotes
      : remotes.map((remote) => {
          const previous = lastRemotes.find((candidate) => candidate.name === remote.name);
          return previous?.defaultBranch ? { ...remote, defaultBranch: previous.defaultBranch } : remote;
        });
    lastRemotes = remotesWithDefaults;
    post({ type: "remotes-data", remotes: remotesWithDefaults });
    info("remotes loaded", { count: remotesWithDefaults.length, enrichDefaults });
    if (root && enrichDefaults) {
      void enrichRemoteDefaultsInBackground(root, remotes);
    }
  } catch (error) {
    postError(error);
  } finally {
    post({ type: "loading", loading: false, scope: "remotes" });
  }
}

async function enrichRemoteDefaultsInBackground(root: string, remotes: RemoteConfig[]): Promise<void> {
  const key = enrichRemoteDefaultsKey(root, remotes);
  latestEnrichRemoteDefaultsKey = key;

  const inflight = enrichRemoteDefaultsInflight.get(key);
  if (inflight) {
    debug("enrichRemoteDefaults coalesced with in-flight enrichment", { key });
    return inflight;
  }

  enrichRemoteDefaultsGeneration += 1;
  const generation = enrichRemoteDefaultsGeneration;

  const promise = enrichRemoteDefaultsInner(root, remotes, generation, key).finally(() => {
    enrichRemoteDefaultsInflight.delete(key);
  });
  enrichRemoteDefaultsInflight.set(key, promise);
  return promise;
}

async function enrichRemoteDefaultsInner(root: string, remotes: RemoteConfig[], generation: number, key: string): Promise<void> {
  debug("enrichRemoteDefaults start", { root, remoteCount: remotes.length, generation, key });
  try {
    const enriched = await enrichRemotesWithDefaultBranches(root, remotes, { network: true });
    if (key !== latestEnrichRemoteDefaultsKey) {
      debug("enrichRemoteDefaults result skipped; stale key", { key, latest: latestEnrichRemoteDefaultsKey });
      return;
    }
    lastRemotes = enriched;
    post({ type: "remotes-data", remotes: enriched });
    info("remote default branches enriched", { count: enriched.length });
  } catch (error) {
    warn("remote default branch enrichment failed", error);
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

async function runBranchAction(
  action: BranchAction,
  branchName?: string,
  remote?: string,
  remoteBranchName?: string,
  actionTab?: WebviewTab
): Promise<void> {
  info("branch action requested", { action, branchName, remote, remoteBranchName });
  const root = await resolveRepositoryRoot();
  if (!root) {
    post({ type: "action-result", success: false, message: "No Git repository is open." });
    return;
  }

  post({ type: "loading", loading: true, scope: "action" });
  const generation = beginManagedRefresh(`branch-action:${action}`);
  try {
    const result = await executeBranchAction(root, action, branchName, remote, remoteBranchName, {
      defaultBranch: lastDefaultBranch,
      remoteDefaultBranch: remote ? lastRemotes.find((candidate) => candidate.name === remote)?.defaultBranch : undefined
    });
    post({ type: "action-result", ...result });
    showActionNotification(result);
    if (result.success) {
      invalidateRemoteDataCaches(root, { defaultBranches: shouldInvalidateRemoteDefaultBranches(action) });
      const repo = await getRepositoryState(root);
      repo.lastFetched = new Date().toISOString();
      post({ type: "repo-state", repo });
      await Promise.all([
        loadBranches(root),
        loadRemotes(root, { enrichDefaults: shouldEnrichRemoteDefaultsAfterAction(action) })
      ]);
      if (shouldReloadCommitsAfterAction(action)) {
        if (activeWebviewTab === "graph") {
          commitGraphDirty = false;
          await loadCommits(
            lastCommitRequest.dateRange,
            lastCommitRequest.page,
            lastCommitRequest.searchText,
            lastCommitRequest.scope,
            root
          );
        } else {
          commitGraphDirty = true;
          commitGraphDirtyEpoch += 1;
          debug("loadCommits deferred; graph tab inactive", { actionTab, currentTab: activeWebviewTab, action });
        }
      }
      if (activeWebviewTab === "files" && lastFilesDiffRequest.leftRef && lastFilesDiffRequest.rightRef) {
        await loadFilesDiff(lastFilesDiffRequest.leftRef, lastFilesDiffRequest.rightRef, root);
      }
    }
  } catch (error) {
    postError(error);
  } finally {
    endManagedRefresh(generation);
    post({ type: "loading", loading: false, scope: "action" });
  }
}

async function openCommitFileDiff(commitHash: string, file: CommitFileChange): Promise<void> {
  info("commit file diff requested", {
    commitHash: commitHash.slice(0, 12),
    path: file.path,
    oldPath: file.oldPath,
    status: file.status
  });
  const root = await resolveRepositoryRoot();
  if (!root) {
    post({ type: "action-result", success: false, message: "No Git repository is open." });
    return;
  }

  try {
    const baseHash = await getCommitBaseHash(root, commitHash);
    const shortHash = commitHash.slice(0, 7);
    const left = file.status === "added" || !baseHash
      ? createSuperGitContentUri({ root, filePath: file.oldPath ?? file.path, empty: true, label: `${file.path} (empty)` })
      : createSuperGitContentUri({ root, ref: baseHash, filePath: file.oldPath ?? file.path, label: `${file.oldPath ?? file.path} (${baseHash.slice(0, 7)})` });
    const right = file.status === "deleted"
      ? createSuperGitContentUri({ root, filePath: file.path, empty: true, label: `${file.path} (deleted)` })
      : createSuperGitContentUri({ root, ref: commitHash, filePath: file.path, label: `${file.path} (${shortHash})` });
    await vscode.commands.executeCommand("vscode.diff", left, right, `${file.path} (${shortHash})`, {
      preview: false,
      preserveFocus: true,
      viewColumn: vscode.ViewColumn.Beside
    });
  } catch (error) {
    postError(error);
  }
}

async function openFilesDiffFile(leftRef: string, rightRef: string, file: FilesDiffFileChange): Promise<void> {
  info("files diff file requested", {
    leftRef,
    rightRef,
    path: file.path,
    oldPath: file.oldPath,
    status: file.status
  });
  const root = await resolveRepositoryRoot();
  if (!root) {
    post({ type: "action-result", success: false, message: "No Git repository is open." });
    return;
  }

  try {
    const leftPath = file.oldPath ?? file.path;
    const left = file.status === "added"
      ? createSuperGitContentUri({ root, filePath: leftPath, empty: true, label: `${leftPath} (empty)` })
      : createSuperGitContentUri({ root, ref: leftRef, filePath: leftPath, label: `${leftPath} (${leftRef})` });
    const right = file.status === "deleted"
      ? createSuperGitContentUri({ root, filePath: file.path, empty: true, label: `${file.path} (deleted)` })
      : createSuperGitContentUri({ root, ref: rightRef, filePath: file.path, label: `${file.path} (${rightRef})` });
    await vscode.commands.executeCommand("vscode.diff", left, right, `${file.path} (${leftRef} vs ${rightRef})`, {
      preview: false,
      preserveFocus: true,
      viewColumn: vscode.ViewColumn.Beside
    });
  } catch (error) {
    postError(error);
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

function emptyFilesDiff(leftRef: string, rightRef: string): FilesDiffPayload {
  return {
    leftRef,
    rightRef,
    files: [],
    summary: {
      files: 0,
      additions: 0,
      deletions: 0,
      binaryFiles: 0,
      statuses: {
        added: 0,
        modified: 0,
        deleted: 0,
        renamed: 0,
        copied: 0,
        typechange: 0,
        unmerged: 0,
        unknown: 0
      }
    }
  };
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
      searchTextLength: message.searchText.length,
      scope: message.scope
    };
  }
  if (message.type === "request-commit-details") {
    return { type: message.type, commitHash: message.commitHash.slice(0, 12) };
  }
  if (message.type === "request-files-diff") {
    return { type: message.type, leftRef: message.leftRef, rightRef: message.rightRef };
  }
  if (message.type === "open-commit-file-diff") {
    return { type: message.type, commitHash: message.commitHash.slice(0, 12), path: message.file.path };
  }
  if (message.type === "open-files-diff-file") {
    return { type: message.type, leftRef: message.leftRef, rightRef: message.rightRef, path: message.file.path };
  }
  if (message.type === "execute-action") {
    return {
      type: message.type,
      action: message.action,
      commitHash: message.commitHash.slice(0, 12)
    };
  }
  if (message.type === "execute-branch-action") {
    return {
      type: message.type,
      action: message.action,
      branchName: message.branchName,
      remote: message.remote,
      activeTab: message.activeTab
    };
  }
  if (message.type === "tab-changed") {
    return { type: message.type, tab: message.tab };
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
      return { type: message.type, count: message.branches.length, remoteBranchCount: message.remoteBranches.length };
    case "commit-details-data":
      return { type: message.type, commitHash: message.commitHash.slice(0, 12), fileCount: message.files.length };
    case "files-diff-data":
      return { type: message.type, leftRef: message.diff.leftRef, rightRef: message.diff.rightRef, fileCount: message.diff.summary.files };
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
