import { beforeEach, describe, expect, it, vi } from "vitest";

const getExtensionMock = vi.hoisted(() => vi.fn());
const getConfigurationMock = vi.hoisted(() => vi.fn());
const createFileSystemWatcherMock = vi.hoisted(() => vi.fn());
const activeTextEditorBox = vi.hoisted(() => ({ value: undefined as unknown }));

vi.mock("vscode", () => ({
  extensions: {
    getExtension: getExtensionMock
  },
  workspace: {
    getConfiguration: getConfigurationMock,
    createFileSystemWatcher: createFileSystemWatcherMock
  },
  window: {
    get activeTextEditor() {
      return activeTextEditorBox.value;
    }
  },
  Disposable: {
    from: vi.fn((...disposables) => ({
      dispose: () => disposables.forEach((disposable: { dispose: () => void }) => disposable.dispose())
    }))
  }
}));

import { getActiveRepository, getGitBinaryPath, getRepositoryRoots, onRepositoryChange } from "../../git/api";

describe("git api wrapper", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    activeTextEditorBox.value = undefined;
    getConfigurationMock.mockReturnValue({ get: vi.fn(() => undefined) });
    createFileSystemWatcherMock.mockReturnValue({
      onDidChange: vi.fn(() => ({ dispose: vi.fn() })),
      onDidCreate: vi.fn(() => ({ dispose: vi.fn() })),
      onDidDelete: vi.fn(() => ({ dispose: vi.fn() })),
      dispose: vi.fn()
    });
  });

  it("returns git when no custom path is configured", async () => {
    getExtensionMock.mockReturnValue({
      isActive: true,
      exports: { getAPI: vi.fn(() => ({ repositories: [] })) }
    });

    await expect(getGitBinaryPath()).resolves.toBe("git");
  });

  it("prefers git API binary path over configuration", async () => {
    getConfigurationMock.mockReturnValue({ get: vi.fn(() => "/config/git") });
    getExtensionMock.mockReturnValue({
      isActive: true,
      exports: { getAPI: vi.fn(() => ({ git: { path: "/api/git" }, repositories: [] })) }
    });

    await expect(getGitBinaryPath()).resolves.toBe("/api/git");
  });

  it("throws when built-in git extension is missing", async () => {
    getExtensionMock.mockReturnValue(undefined);
    await expect(getGitBinaryPath()).rejects.toThrow("Built-in Git extension not found");
  });

  it("activates the git extension lazily", async () => {
    const activate = vi.fn();
    getExtensionMock.mockReturnValue({
      isActive: false,
      activate,
      exports: { getAPI: vi.fn(() => ({ repositories: [] })) }
    });

    await getGitBinaryPath();
    expect(activate).toHaveBeenCalled();
  });

  it("returns repository roots", async () => {
    getExtensionMock.mockReturnValue({
      isActive: true,
      exports: {
        getAPI: vi.fn(() => ({
          repositories: [{ rootUri: { fsPath: "/home/user/repo1" } }, { rootUri: { fsPath: "/home/user/repo2" } }]
        }))
      }
    });

    await expect(getRepositoryRoots()).resolves.toEqual(["/home/user/repo1", "/home/user/repo2"]);
  });

  it("prefers the active editor repository", async () => {
    activeTextEditorBox.value = { document: { uri: { fsPath: "/home/user/repo2/src/file.ts" } } };
    getExtensionMock.mockReturnValue({
      isActive: true,
      exports: {
        getAPI: vi.fn(() => ({
          repositories: [{ rootUri: { fsPath: "/home/user/repo1" } }, { rootUri: { fsPath: "/home/user/repo2" } }]
        }))
      }
    });

    await expect(getActiveRepository()).resolves.toMatchObject({ root: "/home/user/repo2" });
  });

  it("creates a fallback git directory watcher", async () => {
    getExtensionMock.mockReturnValue(undefined);
    await onRepositoryChange(() => undefined);
    expect(createFileSystemWatcherMock).toHaveBeenCalledWith("**/.git/**");
  });

  it("subscribes to git API repository events when available", async () => {
    const onDidChangeState = vi.fn(() => ({ dispose: vi.fn() }));
    const onDidOpenRepository = vi.fn(() => ({ dispose: vi.fn() }));
    const onDidCloseRepository = vi.fn(() => ({ dispose: vi.fn() }));
    const repoStateChange = vi.fn(() => ({ dispose: vi.fn() }));
    getExtensionMock.mockReturnValue({
      isActive: true,
      exports: {
        getAPI: vi.fn(() => ({
          repositories: [{ rootUri: { fsPath: "/repo" }, state: { onDidChange: repoStateChange } }],
          onDidChangeState,
          onDidOpenRepository,
          onDidCloseRepository
        }))
      }
    });

    await onRepositoryChange(() => undefined);
    expect(onDidChangeState).toHaveBeenCalled();
    expect(onDidOpenRepository).toHaveBeenCalled();
    expect(onDidCloseRepository).toHaveBeenCalled();
    expect(repoStateChange).toHaveBeenCalled();
  });
});
