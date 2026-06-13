import * as path from "node:path";
import * as vscode from "vscode";
import { debug, info, warn } from "../logger";

interface GitRepository {
  rootUri: vscode.Uri;
  state?: {
    HEAD?: {
      name?: string;
      commit?: string;
    };
    onDidChange?: (listener: () => void) => vscode.Disposable;
  };
}

interface GitApi {
  repositories: GitRepository[];
  git?: {
    path?: string;
  };
  onDidOpenRepository?: (listener: () => void) => vscode.Disposable;
  onDidCloseRepository?: (listener: () => void) => vscode.Disposable;
  onDidChangeState?: (listener: () => void) => vscode.Disposable;
}

export interface RepositoryRef {
  root: string;
  name: string;
  currentBranch: string;
  currentCommit?: string;
}

async function getGitApi(required: boolean): Promise<GitApi | undefined> {
  debug("requesting vscode.git API", { required });
  const gitExtension = vscode.extensions.getExtension("vscode.git");
  if (!gitExtension) {
    if (required) {
      throw new Error("Built-in Git extension not found.");
    }
    warn("vscode.git extension not found");
    return undefined;
  }

  if (!gitExtension.isActive) {
    info("activating vscode.git extension");
    await gitExtension.activate();
  }

  const api = gitExtension.exports?.getAPI?.(1) as GitApi | undefined;
  debug("vscode.git API resolved", { repositoryCount: api?.repositories?.length ?? 0 });
  return api;
}

export async function getGitBinaryPath(): Promise<string> {
  const api = await getGitApi(true);
  const configuredPath = vscode.workspace.getConfiguration("git").get<string>("path");
  const gitPath = api?.git?.path || configuredPath || "git";
  debug("git binary path resolved", { gitPath, source: api?.git?.path ? "vscode.git" : configuredPath ? "git.path" : "PATH" });
  return gitPath;
}

export async function getRepositories(): Promise<RepositoryRef[]> {
  const api = await getGitApi(false);
  if (!api) {
    debug("no git API available while reading repositories");
    return [];
  }

  const repositories = api.repositories.map((repository) => {
    const root = repository.rootUri.fsPath;
    return {
      root,
      name: path.basename(root),
      currentBranch: repository.state?.HEAD?.name || "DETACHED",
      currentCommit: repository.state?.HEAD?.commit
    };
  });
  debug("repositories resolved", repositories);
  return repositories;
}

export async function getRepositoryRoots(): Promise<string[]> {
  return (await getRepositories()).map((repository) => repository.root);
}

export async function getActiveRepository(): Promise<RepositoryRef | undefined> {
  const repositories = await getRepositories();
  if (repositories.length === 0) {
    debug("no active repository found because repository list is empty");
    return undefined;
  }

  const activeFile = vscode.window.activeTextEditor?.document.uri.fsPath;
  if (activeFile) {
    const matching = repositories
      .filter((repository) => isPathInside(activeFile, repository.root))
      .sort((a, b) => b.root.length - a.root.length)[0];
    if (matching) {
      debug("active repository matched active editor", matching);
      return matching;
    }
  }

  debug("active repository defaulting to first repository", repositories[0]);
  return repositories[0];
}

export async function onRepositoryChange(callback: () => void): Promise<vscode.Disposable> {
  const disposables: vscode.Disposable[] = [];
  const api = await getGitApi(false);

  if (api?.onDidChangeState) {
    disposables.push(api.onDidChangeState(callback));
  }
  if (api?.onDidOpenRepository) {
    disposables.push(api.onDidOpenRepository(callback));
  }
  if (api?.onDidCloseRepository) {
    disposables.push(api.onDidCloseRepository(callback));
  }
  for (const repository of api?.repositories ?? []) {
    const stateChange = repository.state?.onDidChange;
    if (stateChange) {
      disposables.push(stateChange.call(repository.state, callback));
    }
  }

  const watcher = vscode.workspace.createFileSystemWatcher("**/.git/**");
  disposables.push(
    watcher.onDidChange(callback),
    watcher.onDidCreate(callback),
    watcher.onDidDelete(callback),
    watcher
  );

  debug("repository change watcher created", { disposableCount: disposables.length });
  return vscode.Disposable.from(...disposables);
}

function isPathInside(filePath: string, directory: string): boolean {
  const relative = path.relative(directory, filePath);
  return relative === "" || (!relative.startsWith("..") && !path.isAbsolute(relative));
}
