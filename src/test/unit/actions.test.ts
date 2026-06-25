import { beforeEach, describe, expect, it, vi } from "vitest";
import type { GitResult } from "../../git/runner";

const clipboardWriteTextMock = vi.hoisted(() => vi.fn());
const showWarningMessageMock = vi.hoisted(() => vi.fn());
const showInputBoxMock = vi.hoisted(() => vi.fn());
const runGitMock = vi.hoisted(() => vi.fn());
const getCurrentBranchMock = vi.hoisted(() => vi.fn());
const getRemotesMock = vi.hoisted(() => vi.fn());
const unsetStaleUpstreamLinksMock = vi.hoisted(() => vi.fn());
const unsetUpstreamLinksForRemoteRefMock = vi.hoisted(() => vi.fn());
const resolveDefaultBranchMock = vi.hoisted(() => vi.fn());
const resolveRemoteDefaultBranchMock = vi.hoisted(() => vi.fn());
const isBranchMergedIntoMock = vi.hoisted(() => vi.fn());

const showQuickPickMock = vi.hoisted(() => vi.fn());
const getConfigurationMock = vi.hoisted(() => vi.fn(() => ({ get: vi.fn((_key: string, defaultValue: unknown) => defaultValue) })));

vi.mock("vscode", () => ({
  env: {
    clipboard: {
      writeText: clipboardWriteTextMock
    }
  },
  window: {
    showWarningMessage: showWarningMessageMock,
    showInputBox: showInputBoxMock,
    showQuickPick: showQuickPickMock
  },
  workspace: {
    getConfiguration: getConfigurationMock
  }
}));

vi.mock("../../git/runner", () => ({
  runGit: runGitMock
}));

vi.mock("../../git/commands", () => ({
  getCurrentBranch: getCurrentBranchMock,
  getRemotes: getRemotesMock,
  resolveDefaultBranch: resolveDefaultBranchMock,
  isBranchMergedInto: isBranchMergedIntoMock,
  unsetStaleUpstreamLinks: unsetStaleUpstreamLinksMock,
  unsetUpstreamLinksForRemoteRef: unsetUpstreamLinksForRemoteRefMock
}));

vi.mock("../../git/remote-default", () => ({
  resolveRemoteDefaultBranch: resolveRemoteDefaultBranchMock
}));

import { executeBranchAction, executeCommitAction } from "../../git/actions";

describe("executeCommitAction", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    clipboardWriteTextMock.mockResolvedValue(undefined);
    showWarningMessageMock.mockResolvedValue("Run");
    showInputBoxMock.mockResolvedValue("feature/new-work");
    runGitMock.mockResolvedValue(ok(""));
  });

  it("copies commit hashes without running git", async () => {
    await expect(executeCommitAction("/repo", "copy-hash", "abcdef123456")).resolves.toEqual({ success: true, message: "Commit hash copied." });
    expect(clipboardWriteTextMock).toHaveBeenCalledWith("abcdef123456");
    expect(runGitMock).not.toHaveBeenCalled();
  });

  it("runs checkout as a guarded detached checkout", async () => {
    await expect(executeCommitAction("/repo", "checkout", "abcdef123456")).resolves.toEqual({ success: true, message: "Checked out commit." });
    expect(runGitMock).toHaveBeenCalledWith(["checkout", "--detach", "abcdef123456"], "/repo", { timeout: 120_000 });
  });

  it("runs cherry-pick and revert actions", async () => {
    await executeCommitAction("/repo", "cherry-pick", "abcdef123456");
    await executeCommitAction("/repo", "revert", "abcdef123456");
    expect(runGitMock).toHaveBeenCalledWith(["cherry-pick", "abcdef123456"], "/repo", { timeout: 120_000 });
    expect(runGitMock).toHaveBeenCalledWith(["revert", "--no-edit", "abcdef123456"], "/repo", { timeout: 120_000 });
  });

  it("cancels guarded actions when confirmation is dismissed", async () => {
    showWarningMessageMock.mockResolvedValue(undefined);
    await expect(executeCommitAction("/repo", "checkout", "abcdef123456")).resolves.toEqual({ success: false, message: "Action cancelled." });
    expect(runGitMock).not.toHaveBeenCalled();
  });

  it("surfaces git errors and timeouts", async () => {
    runGitMock.mockResolvedValueOnce(fail("fatal: bad ref"));
    await expect(executeCommitAction("/repo", "checkout", "abcdef123456")).resolves.toEqual({ success: false, message: "fatal: bad ref" });

    runGitMock.mockResolvedValueOnce({ stdout: "", stderr: "", exitCode: 124, timedOut: true } satisfies GitResult);
    await expect(executeCommitAction("/repo", "checkout", "abcdef123456")).resolves.toEqual({ success: false, message: "command timed out" });
  });

  it("creates branches and tags from input", async () => {
    showInputBoxMock.mockResolvedValueOnce("feature/a").mockResolvedValueOnce("v1.0.0");
    await executeCommitAction("/repo", "create-branch", "abcdef123456");
    await executeCommitAction("/repo", "create-tag", "abcdef123456");
    expect(runGitMock).toHaveBeenCalledWith(["branch", "feature/a", "abcdef123456"], "/repo", { timeout: 120_000 });
    expect(runGitMock).toHaveBeenCalledWith(["tag", "v1.0.0", "abcdef123456"], "/repo", { timeout: 120_000 });
  });

  it("cancels branch and tag creation without input", async () => {
    showInputBoxMock.mockResolvedValue(undefined);
    await expect(executeCommitAction("/repo", "create-branch", "abcdef123456")).resolves.toEqual({ success: false, message: "Create branch cancelled." });
    await expect(executeCommitAction("/repo", "create-tag", "abcdef123456")).resolves.toEqual({ success: false, message: "Create tag cancelled." });
    expect(runGitMock).not.toHaveBeenCalled();
  });
});

describe("executeBranchAction", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    showWarningMessageMock.mockResolvedValue("Run");
    showInputBoxMock.mockResolvedValue("origin/main");
    getConfigurationMock.mockReturnValue({ get: vi.fn((_key: string, defaultValue: unknown) => defaultValue) });
    getCurrentBranchMock.mockResolvedValue("main");
    getRemotesMock.mockResolvedValue([{ name: "origin", url: "url", colorIndex: 0 }]);
    resolveDefaultBranchMock.mockResolvedValue("main");
    resolveRemoteDefaultBranchMock.mockResolvedValue("main");
    isBranchMergedIntoMock.mockResolvedValue(true);
    unsetStaleUpstreamLinksMock.mockResolvedValue([]);
    unsetUpstreamLinksForRemoteRefMock.mockResolvedValue({ unsetBranches: [], complete: true });
    runGitMock.mockResolvedValue(ok(""));
  });

  it("pushes only the current branch when no branch is provided", async () => {
    await expect(executeBranchAction("/repo", "push")).resolves.toEqual({ success: true, message: "Pushed current branch." });
    expect(runGitMock).toHaveBeenCalledWith(["push"], "/repo", { timeout: 120_000 });
  });

  it("pushes an explicit branch to the sole remote when no remote param is passed", async () => {
    getCurrentBranchMock.mockResolvedValue("other");
    await executeBranchAction("/repo", "push", "feature/x");
    expect(showQuickPickMock).not.toHaveBeenCalled();
    expect(runGitMock).toHaveBeenCalledWith(["push", "origin", "feature/x"], "/repo", { timeout: 120_000 });
  });

  it("reports no remote when pushing an explicit branch with zero remotes", async () => {
    getRemotesMock.mockResolvedValue([]);
    await expect(executeBranchAction("/repo", "push", "feature/x")).resolves.toEqual({
      success: false,
      message: "No remote configured."
    });
    expect(runGitMock).not.toHaveBeenCalled();
  });

  it("pushes, pulls, and fetches explicit remote branches", async () => {
    await executeBranchAction("/repo", "push", "main", "origin");
    await executeBranchAction("/repo", "pull", "main", "origin");
    await executeBranchAction("/repo", "fetch", undefined, "origin");
    expect(runGitMock).toHaveBeenCalledWith(["push", "origin", "main"], "/repo", { timeout: 120_000 });
    expect(runGitMock).toHaveBeenCalledWith(["pull", "--ff-only", "origin", "main"], "/repo", { timeout: 120_000 });
    expect(runGitMock).toHaveBeenCalledWith(["fetch", "origin", "--prune"], "/repo", { timeout: 120_000 });
  });

  it("pushes and pulls using explicit remote branch names when local and remote differ", async () => {
    getCurrentBranchMock.mockResolvedValue("work");
    await executeBranchAction("/repo", "push", "work", "origin", "feature/a");
    await executeBranchAction("/repo", "pull", "work", "origin", "feature/a");
    expect(runGitMock).toHaveBeenCalledWith(["push", "origin", "work:feature/a"], "/repo", { timeout: 120_000 });
    expect(runGitMock).toHaveBeenCalledWith(["pull", "--ff-only", "origin", "feature/a"], "/repo", { timeout: 120_000 });
  });

  it("fast-forwards non-checked-out branches from explicit remote branch names", async () => {
    getCurrentBranchMock.mockResolvedValue("other");
    await executeBranchAction("/repo", "pull", "work", "origin", "feature/a");
    expect(runGitMock).toHaveBeenCalledWith(["fetch", "origin", "feature/a:work"], "/repo", { timeout: 120_000 });
    expect(runGitMock).not.toHaveBeenCalledWith(["fetch", "origin", "work:work"], "/repo", { timeout: 120_000 });
  });

  it("fetches all remotes and prunes all remotes", async () => {
    unsetStaleUpstreamLinksMock.mockResolvedValue(["feature/remote-ahead-origin"]);
    await executeBranchAction("/repo", "fetch");
    await executeBranchAction("/repo", "prune-stale");
    expect(runGitMock).toHaveBeenCalledWith(["fetch", "--all", "--prune"], "/repo", { timeout: 120_000 });
    expect(unsetStaleUpstreamLinksMock).toHaveBeenCalledWith("/repo", undefined);
    expect(runGitMock).toHaveBeenCalledTimes(2);
  });

  it("sets upstream using current branch defaults", async () => {
    runGitMock.mockImplementation(async (args) => {
      if (args[0] === "rev-parse" && args[1] === "--verify") {
        return ok("abc123\n");
      }
      return ok("");
    });
    await executeBranchAction("/repo", "set-upstream");
    expect(showInputBoxMock).not.toHaveBeenCalled();
    expect(showQuickPickMock).not.toHaveBeenCalled();
    expect(runGitMock).toHaveBeenCalledWith(["branch", "--set-upstream-to", "origin/main", "main"], "/repo", { timeout: 120_000 });
  });

  it("pushes and sets upstream when the remote branch does not exist yet", async () => {
    showWarningMessageMock.mockResolvedValue("Push and Set Upstream");
    runGitMock.mockImplementation(async (args) => {
      if (args[0] === "rev-parse" && args[1] === "--verify") {
        return fail("unknown ref");
      }
      if (args[0] === "ls-remote") {
        return ok("");
      }
      return ok("");
    });
    await executeBranchAction("/repo", "set-upstream", "feature/local-only", "origin");
    expect(showInputBoxMock).not.toHaveBeenCalled();
    expect(runGitMock).toHaveBeenCalledWith(["push", "-u", "origin", "feature/local-only"], "/repo", { timeout: 120_000 });
  });

  it("fetches and sets upstream when the remote branch exists but is not fetched locally", async () => {
    showWarningMessageMock.mockResolvedValue("Fetch and Set Upstream");
    runGitMock.mockImplementation(async (args) => {
      if (args[0] === "rev-parse" && args[1] === "--verify") {
        return fail("unknown ref");
      }
      if (args[0] === "ls-remote") {
        return ok("abc123\trefs/heads/feature/x\n");
      }
      return ok("");
    });
    await executeBranchAction("/repo", "set-upstream", "feature/x", "origin");
    expect(showInputBoxMock).not.toHaveBeenCalled();
    expect(runGitMock).toHaveBeenCalledWith(
      ["fetch", "origin", "refs/heads/feature/x:refs/remotes/origin/feature/x"],
      "/repo",
      { timeout: 120_000 }
    );
    expect(runGitMock).toHaveBeenCalledWith(["branch", "--set-upstream-to", "origin/feature/x", "feature/x"], "/repo", { timeout: 120_000 });
  });

  it("supports slash remotes when fetching and setting upstream", async () => {
    getRemotesMock.mockResolvedValue([
      { name: "foo", url: "foo-url", colorIndex: 0 },
      { name: "foo/bar", url: "foo-bar-url", colorIndex: 1 }
    ]);
    showWarningMessageMock.mockResolvedValue("Fetch and Set Upstream");
    runGitMock.mockImplementation(async (args) => {
      if (args[0] === "rev-parse" && args[1] === "--verify") {
        return fail("unknown ref");
      }
      if (args[0] === "ls-remote") {
        expect(args).toEqual(["ls-remote", "--heads", "foo/bar", "main"]);
        return ok("abc123\trefs/heads/main\n");
      }
      return ok("");
    });
    await executeBranchAction("/repo", "set-upstream", "work", "foo/bar", "main");
    expect(showInputBoxMock).not.toHaveBeenCalled();
    expect(runGitMock).toHaveBeenCalledWith(
      ["fetch", "foo/bar", "refs/heads/main:refs/remotes/foo/bar/main"],
      "/repo",
      { timeout: 120_000 }
    );
    expect(runGitMock).toHaveBeenCalledWith(["branch", "--set-upstream-to", "foo/bar/main", "work"], "/repo", { timeout: 120_000 });
  });

  it("uses explicit remote branch names when pushing and setting upstream", async () => {
    showWarningMessageMock.mockResolvedValue("Push and Set Upstream");
    runGitMock.mockImplementation(async (args) => {
      if (args[0] === "rev-parse" && args[1] === "--verify") {
        return fail("unknown ref");
      }
      if (args[0] === "ls-remote") {
        return ok("");
      }
      return ok("");
    });
    await executeBranchAction("/repo", "set-upstream", "work", "origin", "feature/a");
    expect(showInputBoxMock).not.toHaveBeenCalled();
    expect(runGitMock).toHaveBeenCalledWith(["push", "-u", "origin", "work:feature/a"], "/repo", { timeout: 120_000 });
  });

  it("shows QuickPick when setting upstream with multiple remotes and no remote param", async () => {
    getRemotesMock.mockResolvedValue([
      { name: "origin", url: "origin-url", colorIndex: 0 },
      { name: "upstream", url: "upstream-url", colorIndex: 1 }
    ]);
    showQuickPickMock.mockResolvedValue({ label: "upstream", description: "upstream-url", remote: { name: "upstream", url: "upstream-url", colorIndex: 1 } });
    showWarningMessageMock.mockResolvedValue("Push and Set Upstream");
    runGitMock.mockImplementation(async (args) => {
      if (args[0] === "rev-parse" && args[1] === "--verify") {
        return fail("unknown ref");
      }
      if (args[0] === "ls-remote") {
        return ok("");
      }
      return ok("");
    });
    await executeBranchAction("/repo", "set-upstream", "main");
    expect(showQuickPickMock).toHaveBeenCalledWith(expect.any(Array), expect.objectContaining({ title: "Set Upstream" }));
    expect(showInputBoxMock).not.toHaveBeenCalled();
    expect(runGitMock).toHaveBeenCalledWith(["push", "-u", "upstream", "main"], "/repo", { timeout: 120_000 });
  });

  it("skips QuickPick when setting upstream with explicit remote param", async () => {
    getRemotesMock.mockResolvedValue([
      { name: "origin", url: "origin-url", colorIndex: 0 },
      { name: "upstream", url: "upstream-url", colorIndex: 1 }
    ]);
    showWarningMessageMock.mockResolvedValue("Push and Set Upstream");
    runGitMock.mockImplementation(async (args) => {
      if (args[0] === "rev-parse" && args[1] === "--verify") {
        return fail("unknown ref");
      }
      if (args[0] === "ls-remote") {
        return ok("");
      }
      return ok("");
    });
    await executeBranchAction("/repo", "set-upstream", "main", "origin");
    expect(showQuickPickMock).not.toHaveBeenCalled();
    expect(runGitMock).toHaveBeenCalledWith(["push", "-u", "origin", "main"], "/repo", { timeout: 120_000 });
  });

  it("cancels set upstream when remote pick is dismissed", async () => {
    getRemotesMock.mockResolvedValue([
      { name: "origin", url: "origin-url", colorIndex: 0 },
      { name: "upstream", url: "upstream-url", colorIndex: 1 }
    ]);
    showQuickPickMock.mockResolvedValue(undefined);
    await expect(executeBranchAction("/repo", "set-upstream", "main")).resolves.toEqual({ success: false, message: "Set upstream cancelled." });
    expect(runGitMock).not.toHaveBeenCalled();
  });

  it("add-upstream pushes without -u when the remote branch does not exist yet", async () => {
    showWarningMessageMock.mockResolvedValue("Run");
    runGitMock.mockImplementation(async (args) => {
      if (args[0] === "rev-parse" && args[1] === "--verify") {
        return fail("unknown ref");
      }
      if (args[0] === "ls-remote") {
        return ok("");
      }
      return ok("");
    });
    await executeBranchAction("/repo", "add-upstream", "feature/x", "upstream");
    expect(runGitMock).toHaveBeenCalledWith(["push", "upstream", "feature/x"], "/repo", { timeout: 120_000 });
    expect(runGitMock).not.toHaveBeenCalledWith(["push", "-u", "upstream", "feature/x"], "/repo", { timeout: 120_000 });
    expect(runGitMock).not.toHaveBeenCalledWith(["branch", "--set-upstream-to", "upstream/feature/x", "feature/x"], "/repo", { timeout: 120_000 });
  });

  it("add-upstream fetches an existing remote branch without setting default upstream", async () => {
    showWarningMessageMock.mockResolvedValue("Run");
    runGitMock.mockImplementation(async (args) => {
      if (args[0] === "rev-parse" && args[1] === "--verify") {
        return fail("unknown ref");
      }
      if (args[0] === "ls-remote") {
        return ok("abc123\trefs/heads/feature/x\n");
      }
      return ok("");
    });
    await executeBranchAction("/repo", "add-upstream", "feature/x", "upstream");
    expect(runGitMock).toHaveBeenCalledWith(
      ["fetch", "upstream", "refs/heads/feature/x:refs/remotes/upstream/feature/x"],
      "/repo",
      { timeout: 120_000 }
    );
    expect(runGitMock).not.toHaveBeenCalledWith(["branch", "--set-upstream-to", expect.any(String), "feature/x"], "/repo", { timeout: 120_000 });
  });

  it("add-upstream ignores an already-tracked explicit remote and picks an untracked one", async () => {
    getRemotesMock.mockResolvedValue([
      { name: "origin", url: "origin-url", colorIndex: 0 },
      { name: "upstream", url: "upstream-url", colorIndex: 1 }
    ]);
    showWarningMessageMock.mockResolvedValue("Run");
    runGitMock.mockImplementation(async (args) => {
      if (args[0] === "rev-parse" && args[1] === "--verify") {
        if (args[2] === "refs/remotes/origin/feature/remote-only") {
          return ok("abc123\n");
        }
        return fail("unknown ref");
      }
      if (args[0] === "ls-remote") {
        return ok("");
      }
      return ok("");
    });
    await executeBranchAction("/repo", "add-upstream", "feature/remote-only", "origin", "feature/remote-only");
    expect(showQuickPickMock).not.toHaveBeenCalled();
    expect(runGitMock).toHaveBeenCalledWith(["push", "upstream", "feature/remote-only"], "/repo", { timeout: 120_000 });
  });

  it("add-upstream names the remote ref when local and remote branch names differ", async () => {
    getRemotesMock.mockResolvedValue([
      { name: "origin", url: "origin-url", colorIndex: 0 },
      { name: "upstream", url: "upstream-url", colorIndex: 1 }
    ]);
    showWarningMessageMock.mockResolvedValue("Run");
    runGitMock.mockImplementation(async (args) => {
      if (args[0] === "rev-parse" && args[1] === "--verify") {
        if (args[2] === "refs/remotes/origin/feature/a") {
          return ok("abc123\n");
        }
        return fail("unknown ref");
      }
      if (args[0] === "ls-remote") {
        return ok("");
      }
      return ok("");
    });
    await executeBranchAction("/repo", "add-upstream", "work", undefined, "feature/a");
    expect(showWarningMessageMock).toHaveBeenCalledWith(
      "Push work to upstream/feature/a without changing the default upstream?",
      { modal: true },
      "Run"
    );
    expect(runGitMock).toHaveBeenCalledWith(["push", "upstream", "work:feature/a"], "/repo", { timeout: 120_000 });
  });

  it("add-upstream reports when all remotes already track the branch", async () => {
    getRemotesMock.mockResolvedValue([
      { name: "origin", url: "origin-url", colorIndex: 0 },
      { name: "upstream", url: "upstream-url", colorIndex: 1 }
    ]);
    runGitMock.mockImplementation(async (args) => {
      if (args[0] === "rev-parse" && args[1] === "--verify") {
        return ok("abc123\n");
      }
      return ok("");
    });
    await expect(executeBranchAction("/repo", "add-upstream", "main")).resolves.toEqual({
      success: true,
      message: "main is already tracked on all configured remotes."
    });
    expect(showQuickPickMock).not.toHaveBeenCalled();
    expect(runGitMock).not.toHaveBeenCalledWith(["push", expect.any(String), expect.any(String)], "/repo", { timeout: 120_000 });
  });

  it("add-upstream auto-selects when only one remote lacks local tracking", async () => {
    getRemotesMock.mockResolvedValue([
      { name: "origin", url: "origin-url", colorIndex: 0 },
      { name: "upstream", url: "upstream-url", colorIndex: 1 }
    ]);
    showWarningMessageMock.mockResolvedValue("Run");
    runGitMock.mockImplementation(async (args) => {
      if (args[0] === "rev-parse" && args[1] === "--verify") {
        if (args[2] === "refs/remotes/origin/main") {
          return ok("abc123\n");
        }
        return fail("unknown ref");
      }
      if (args[0] === "ls-remote") {
        return ok("");
      }
      return ok("");
    });
    await executeBranchAction("/repo", "add-upstream", "main");
    expect(showQuickPickMock).not.toHaveBeenCalled();
    expect(runGitMock).toHaveBeenCalledWith(["push", "upstream", "main"], "/repo", { timeout: 120_000 });
  });

  it("add-upstream offers QuickPick when multiple remotes lack local tracking", async () => {
    getRemotesMock.mockResolvedValue([
      { name: "origin", url: "origin-url", colorIndex: 0 },
      { name: "upstream", url: "upstream-url", colorIndex: 1 },
      { name: "backup", url: "backup-url", colorIndex: 2 }
    ]);
    showQuickPickMock.mockResolvedValue({ label: "upstream", description: "upstream-url", remote: { name: "upstream", url: "upstream-url", colorIndex: 1 } });
    showWarningMessageMock.mockResolvedValue("Run");
    runGitMock.mockImplementation(async (args) => {
      if (args[0] === "rev-parse" && args[1] === "--verify") {
        if (args[2] === "refs/remotes/origin/main") {
          return ok("abc123\n");
        }
        return fail("unknown ref");
      }
      if (args[0] === "ls-remote") {
        return ok("");
      }
      return ok("");
    });
    await executeBranchAction("/repo", "add-upstream", "main");
    expect(showQuickPickMock).toHaveBeenCalledWith(
      [expect.objectContaining({ label: "upstream" }), expect.objectContaining({ label: "backup" })],
      expect.objectContaining({ title: "Add Remote Tracking" })
    );
    expect(runGitMock).toHaveBeenCalledWith(["push", "upstream", "main"], "/repo", { timeout: 120_000 });
  });

  it("add-upstream does not re-check the chosen remote ref after the picker path", async () => {
    showWarningMessageMock.mockResolvedValue("Run");
    runGitMock.mockImplementation(async (args) => {
      if (args[0] === "rev-parse" && args[1] === "--verify") {
        return fail("unknown ref");
      }
      if (args[0] === "ls-remote") {
        return ok("");
      }
      return ok("");
    });
    await executeBranchAction("/repo", "add-upstream", "feature/x", "upstream");
    const revParseCalls = runGitMock.mock.calls.filter((args) => args[0][0] === "rev-parse" && args[0][1] === "--verify");
    expect(revParseCalls).toHaveLength(1);
    expect(revParseCalls[0]?.[0]).toEqual(["rev-parse", "--verify", "refs/remotes/upstream/feature/x"]);
  });

  it("add-upstream skips ls-remote when superGit.addUpstream.skipRemoteProbe is enabled", async () => {
    getConfigurationMock.mockReturnValue({
      get: vi.fn((key: string, defaultValue: unknown) => (key === "addUpstream.skipRemoteProbe" ? true : defaultValue))
    });
    showWarningMessageMock.mockResolvedValue("Run");
    runGitMock.mockImplementation(async (args) => {
      if (args[0] === "rev-parse" && args[1] === "--verify") {
        return fail("unknown ref");
      }
      if (args[0] === "ls-remote") {
        return ok("abc123\trefs/heads/feature/x\n");
      }
      return ok("");
    });
    await executeBranchAction("/repo", "add-upstream", "feature/x", "upstream");
    expect(runGitMock).not.toHaveBeenCalledWith(["ls-remote", "--heads", "upstream", "feature/x"], "/repo", { timeout: 120_000 });
    expect(runGitMock).toHaveBeenCalledWith(["push", "upstream", "feature/x"], "/repo", { timeout: 120_000 });
  });

  it("set-default-upstream requires a selected remote", async () => {
    await expect(executeBranchAction("/repo", "set-default-upstream", "main")).resolves.toEqual({
      success: false,
      message: "Select a remote tracking row before setting the default upstream."
    });
    expect(runGitMock).not.toHaveBeenCalled();
  });

  it("set-default-upstream promotes an existing local tracking ref", async () => {
    showWarningMessageMock.mockResolvedValue("Run");
    runGitMock.mockImplementation(async (args) => {
      if (args[0] === "rev-parse" && args[1] === "--verify") {
        return ok("abc123\n");
      }
      return ok("");
    });
    await executeBranchAction("/repo", "set-default-upstream", "main", "upstream");
    expect(runGitMock).toHaveBeenCalledWith(["branch", "--set-upstream-to", "upstream/main", "main"], "/repo", { timeout: 120_000 });
    expect(runGitMock).not.toHaveBeenCalledWith(["push", expect.any(String), expect.any(String)], "/repo", { timeout: 120_000 });
  });

  it("set-default-upstream fails when the tracking ref is not local", async () => {
    runGitMock.mockImplementation(async (args) => {
      if (args[0] === "rev-parse" && args[1] === "--verify") {
        return fail("unknown ref");
      }
      return ok("");
    });
    await expect(executeBranchAction("/repo", "set-default-upstream", "main", "upstream")).resolves.toEqual({
      success: false,
      message: "Fetch or add remote tracking for upstream/main first."
    });
  });

  it("requires branch name before deleting", async () => {
    await expect(executeBranchAction("/repo", "delete")).resolves.toEqual({ success: false, message: "Select a branch before deleting." });
    expect(runGitMock).not.toHaveBeenCalled();
  });

  it("deletes merged local branches with safe confirmation", async () => {
    showWarningMessageMock.mockResolvedValue("Delete");
    await executeBranchAction("/repo", "delete", "feature/a");
    expect(isBranchMergedIntoMock).toHaveBeenCalledWith("/repo", "feature/a", "main");
    expect(showWarningMessageMock).toHaveBeenCalledWith(
      expect.stringContaining("merged into"),
      { modal: true },
      "Delete"
    );
    expect(runGitMock).toHaveBeenCalledWith(["branch", "-d", "feature/a"], "/repo", { timeout: 120_000 });
  });

  it("force deletes unmerged local branches when requested", async () => {
    isBranchMergedIntoMock.mockResolvedValue(false);
    showWarningMessageMock.mockResolvedValue("Force Delete");
    await executeBranchAction("/repo", "delete", "feature/a");
    expect(showWarningMessageMock).toHaveBeenCalledWith(
      expect.stringContaining("not merged"),
      { modal: true },
      "Delete (safe)",
      "Force Delete"
    );
    expect(runGitMock).toHaveBeenCalledWith(["branch", "-D", "feature/a"], "/repo", { timeout: 120_000 });
  });

  it("cancels local delete when confirmation is dismissed", async () => {
    showWarningMessageMock.mockResolvedValue(undefined);
    await expect(executeBranchAction("/repo", "delete", "feature/a")).resolves.toEqual({ success: false, message: "Action cancelled." });
    expect(runGitMock).not.toHaveBeenCalled();
  });

  it("blocks deleting the checked-out branch", async () => {
    getCurrentBranchMock.mockResolvedValue("feature/a");
    await expect(executeBranchAction("/repo", "delete", "feature/a")).resolves.toEqual({
      success: false,
      message: "Cannot delete the checked-out branch."
    });
    expect(runGitMock).not.toHaveBeenCalled();
  });

  it("blocks deleting the default branch", async () => {
    getCurrentBranchMock.mockResolvedValue("feature/other");
    await expect(executeBranchAction("/repo", "delete", "main")).resolves.toEqual({
      success: false,
      message: "Cannot delete the default branch (main)."
    });
    expect(runGitMock).not.toHaveBeenCalled();
  });

  it("blocks deleting the remote default branch even when local default differs", async () => {
    await expect(
      executeBranchAction("/repo", "delete-remote", "develop", "origin", undefined, { remoteDefaultBranch: "develop", defaultBranch: "main" })
    ).resolves.toEqual({
      success: false,
      message: "Cannot delete the default branch (origin/develop) on the remote. Change the remote default branch first."
    });
    expect(runGitMock).not.toHaveBeenCalledWith(["push", "origin", "--delete", "develop"], "/repo", { timeout: 120_000 });
  });

  it("maps git refusing to delete current branch into a friendly error", async () => {
    showWarningMessageMock.mockResolvedValue("Delete Remote");
    runGitMock.mockImplementation(async (args) => {
      if (args[0] === "rev-parse" && args[1] === "--verify") {
        return ok("abc123\n");
      }
      if (args[0] === "push" && args.includes("--delete")) {
        return { exitCode: 1, stdout: "", stderr: "! [remote rejected] develop (refusing to delete the current branch: refs/heads/develop)", timedOut: false };
      }
      return ok("");
    });
    await expect(
      executeBranchAction("/repo", "delete-remote", "develop", "origin", undefined, { defaultBranch: "main" })
    ).resolves.toEqual({
      success: false,
      message: "Cannot delete origin/develop: it is the default branch on origin. Change the remote default branch first."
    });
    expect(unsetUpstreamLinksForRemoteRefMock).not.toHaveBeenCalled();
  });

  it("does not clean up upstreams when remote deletion is cancelled", async () => {
    showWarningMessageMock.mockResolvedValue(undefined);
    runGitMock.mockImplementation(async (args) => {
      if (args[0] === "rev-parse" && args[1] === "--verify") {
        return ok("abc123\n");
      }
      return ok("");
    });

    await expect(
      executeBranchAction("/repo", "delete-remote", "feature/a", "origin", undefined, { defaultBranch: "main" })
    ).resolves.toEqual({ success: false, message: "Action cancelled." });
    expect(runGitMock).not.toHaveBeenCalledWith(["push", "origin", "--delete", "feature/a"], "/repo", { timeout: 120_000 });
    expect(unsetUpstreamLinksForRemoteRefMock).not.toHaveBeenCalled();
  });

  it("deletes remote branches after confirmation", async () => {
    showWarningMessageMock.mockResolvedValue("Delete Remote");
    runGitMock.mockImplementation(async (args) => {
      if (args[0] === "rev-parse" && args[1] === "--verify") {
        return ok("abc123\n");
      }
      return ok("");
    });
    await executeBranchAction("/repo", "delete-remote", "feature/a", "origin", undefined, { defaultBranch: "main" });
    expect(runGitMock).not.toHaveBeenCalledWith(["ls-remote", "--heads", "origin", "feature/a"], "/repo", { timeout: 120_000 });
    expect(isBranchMergedIntoMock).toHaveBeenCalledWith("/repo", "refs/remotes/origin/feature/a", "main");
    expect(runGitMock).toHaveBeenCalledWith(["push", "origin", "--delete", "feature/a"], "/repo", { timeout: 120_000 });
    expect(unsetUpstreamLinksForRemoteRefMock).toHaveBeenCalledWith("/repo", "origin", "feature/a");
  });

  it("reports local upstream cleanup after deleting a remote branch", async () => {
    showWarningMessageMock.mockResolvedValue("Delete Remote");
    unsetUpstreamLinksForRemoteRefMock.mockResolvedValue({
      unsetBranches: ["feature/a", "feature/a-copy"],
      complete: true
    });
    runGitMock.mockImplementation(async (args) => {
      if (args[0] === "rev-parse" && args[1] === "--verify") {
        return ok("abc123\n");
      }
      return ok("");
    });

    await expect(
      executeBranchAction("/repo", "delete-remote", "feature/a", "origin", undefined, { defaultBranch: "main" })
    ).resolves.toEqual({
      success: true,
      message: "Deleted remote branch origin/feature/a. Cleared upstream on feature/a, feature/a-copy."
    });
  });

  it("keeps remote deletion successful when upstream cleanup is incomplete", async () => {
    showWarningMessageMock.mockResolvedValue("Delete Remote");
    unsetUpstreamLinksForRemoteRefMock.mockResolvedValue({ unsetBranches: [], complete: false });
    runGitMock.mockImplementation(async (args) => {
      if (args[0] === "rev-parse" && args[1] === "--verify") {
        return ok("abc123\n");
      }
      return ok("");
    });

    await expect(
      executeBranchAction("/repo", "delete-remote", "feature/a", "origin", undefined, { defaultBranch: "main" })
    ).resolves.toEqual({
      success: true,
      message: "Deleted remote branch origin/feature/a. Some local upstream links could not be cleared. Run Prune Stale."
    });
  });

  it("blocks remote delete when the branch does not exist on the remote", async () => {
    runGitMock.mockImplementation(async (args) => {
      if (args[0] === "rev-parse" && args[1] === "--verify") {
        return fail("unknown ref");
      }
      if (args[0] === "ls-remote") {
        return ok("");
      }
      return ok("");
    });
    await expect(executeBranchAction("/repo", "delete-remote", "feature/remote-ahead-origin", "origin")).resolves.toEqual({
      success: false,
      message: expect.stringContaining("does not exist on origin")
    });
    expect(runGitMock).not.toHaveBeenCalledWith(["push", "origin", "--delete", "feature/remote-ahead-origin"], "/repo", { timeout: 120_000 });
  });

  it("deletes remote branches using explicit remote branch name when local name differs", async () => {
    showWarningMessageMock.mockResolvedValue("Delete Remote");
    runGitMock.mockImplementation(async (args) => {
      if (args[0] === "rev-parse" && args[1] === "--verify") {
        return ok("abc123\n");
      }
      return ok("");
    });
    await executeBranchAction("/repo", "delete-remote", "work", "origin", "feature/a", { defaultBranch: "main" });
    expect(isBranchMergedIntoMock).toHaveBeenCalledWith("/repo", "refs/remotes/origin/feature/a", "main");
    expect(runGitMock).toHaveBeenCalledWith(["push", "origin", "--delete", "feature/a"], "/repo", { timeout: 120_000 });
    expect(runGitMock).not.toHaveBeenCalledWith(["push", "origin", "--delete", "work"], "/repo", { timeout: 120_000 });
  });

  it("warns before deleting unmerged remote branches", async () => {
    isBranchMergedIntoMock.mockResolvedValue(false);
    showWarningMessageMock.mockResolvedValue("Delete Remote");
    runGitMock.mockImplementation(async (args) => {
      if (args[0] === "rev-parse" && args[1] === "--verify") {
        return ok("abc123\n");
      }
      return ok("");
    });
    await executeBranchAction("/repo", "delete-remote", "feature/a", "origin", undefined, { defaultBranch: "main" });
    expect(showWarningMessageMock).toHaveBeenCalledWith(
      expect.stringContaining("not merged"),
      { modal: true },
      "Delete Remote"
    );
  });

  it("requires branch and remote before deleting remote branches", async () => {
    await expect(executeBranchAction("/repo", "delete-remote", "feature/a")).resolves.toEqual({
      success: false,
      message: "Select a remote branch before deleting."
    });
    expect(runGitMock).not.toHaveBeenCalled();
  });

  it("prunes named remotes", async () => {
    unsetStaleUpstreamLinksMock.mockResolvedValue([]);
    await executeBranchAction("/repo", "prune-stale", undefined, "origin");
    expect(runGitMock).toHaveBeenCalledWith(["remote", "prune", "origin"], "/repo", { timeout: 120_000 });
    expect(unsetStaleUpstreamLinksMock).toHaveBeenCalledWith("/repo", "origin");
  });

  it("prompts for remote when multiple remotes exist", async () => {
    getRemotesMock.mockResolvedValue([
      { name: "origin", url: "origin-url", colorIndex: 0 },
      { name: "upstream", url: "upstream-url", colorIndex: 1 }
    ]);
    showQuickPickMock.mockResolvedValue({ label: "upstream", description: "upstream-url", remote: { name: "upstream", url: "upstream-url", colorIndex: 1 } });

    await executeBranchAction("/repo", "push", "main");
    expect(showQuickPickMock).toHaveBeenCalled();
    expect(runGitMock).toHaveBeenCalledWith(["push", "upstream", "main"], "/repo", { timeout: 120_000 });
  });

  it("offers all remotes for fetch when multiple remotes exist", async () => {
    getRemotesMock.mockResolvedValue([
      { name: "origin", url: "origin-url", colorIndex: 0 },
      { name: "upstream", url: "upstream-url", colorIndex: 1 }
    ]);
    showQuickPickMock.mockResolvedValue({ label: "All remotes", description: "Run against every configured remote" });

    await executeBranchAction("/repo", "fetch");
    expect(showQuickPickMock).toHaveBeenCalled();
    expect(runGitMock).toHaveBeenCalledWith(["fetch", "--all", "--prune"], "/repo", { timeout: 120_000 });
  });

  it("skips remote quick pick when remote is explicit", async () => {
    getRemotesMock.mockResolvedValue([
      { name: "origin", url: "origin-url", colorIndex: 0 },
      { name: "upstream", url: "upstream-url", colorIndex: 1 }
    ]);

    await executeBranchAction("/repo", "pull", "main", "origin");
    expect(showQuickPickMock).not.toHaveBeenCalled();
    expect(runGitMock).toHaveBeenCalledWith(["pull", "--ff-only", "origin", "main"], "/repo", { timeout: 120_000 });
  });

  it("pulls non-checked-out branches via fast-forward fetch refspec", async () => {
    getCurrentBranchMock.mockResolvedValue("other");
    await executeBranchAction("/repo", "pull", "feature/a", "origin");
    expect(runGitMock).toHaveBeenCalledWith(["fetch", "origin", "feature/a:feature/a"], "/repo", { timeout: 120_000 });
  });

  it("cancels push when remote quick pick is dismissed", async () => {
    getRemotesMock.mockResolvedValue([
      { name: "origin", url: "origin-url", colorIndex: 0 },
      { name: "upstream", url: "upstream-url", colorIndex: 1 }
    ]);
    showQuickPickMock.mockResolvedValue(undefined);

    await expect(executeBranchAction("/repo", "push", "main")).resolves.toEqual({ success: false, message: "Push cancelled." });
    expect(runGitMock).not.toHaveBeenCalled();
  });

  it("checks out a new local branch from a selected local branch", async () => {
    showInputBoxMock.mockResolvedValue("feature/new-work");
    runGitMock.mockImplementation(async (args) => {
      if (args[0] === "check-ref-format") {
        return ok("");
      }
      return ok("");
    });

    await expect(executeBranchAction("/repo", "checkout-new-local-branch", "main")).resolves.toEqual({
      success: true,
      message: "Checked out new branch feature/new-work."
    });
    expect(runGitMock).toHaveBeenCalledWith(["check-ref-format", "--branch", "feature/new-work"], "/repo", { timeout: 120_000 });
    expect(runGitMock).toHaveBeenCalledWith(["checkout", "-b", "feature/new-work", "main"], "/repo", { timeout: 120_000 });
  });

  it("checks out a new local branch tracking an explicit remote branch", async () => {
    showInputBoxMock.mockResolvedValue("feature/from-remote");
    runGitMock.mockImplementation(async (args) => {
      if (args[0] === "rev-parse" && args[1] === "--verify") {
        return ok("abc123\n");
      }
      if (args[0] === "check-ref-format") {
        return ok("");
      }
      return ok("");
    });

    await expect(
      executeBranchAction("/repo", "checkout-new-local-branch", "work", "origin", "feature/a")
    ).resolves.toEqual({
      success: true,
      message: "Checked out new branch feature/from-remote."
    });
    expect(runGitMock).toHaveBeenCalledWith(
      ["checkout", "-b", "feature/from-remote", "--track", "origin/feature/a"],
      "/repo",
      { timeout: 120_000 }
    );
  });

  it("prefills remote branch name when checking out from a remote source", async () => {
    showInputBoxMock.mockResolvedValue("feature/x");
    runGitMock.mockImplementation(async (args) => {
      if (args[0] === "rev-parse" && args[1] === "--verify") {
        return ok("abc123\n");
      }
      if (args[0] === "check-ref-format") {
        return ok("");
      }
      return ok("");
    });

    await executeBranchAction("/repo", "checkout-new-local-branch", "feature/x", "origin", "feature/x");
    expect(showInputBoxMock).toHaveBeenCalledWith(
      expect.objectContaining({
        value: "feature/x",
        prompt: "New local branch tracking origin/feature/x"
      })
    );
  });

  it("cancels checkout new branch when input is dismissed", async () => {
    showInputBoxMock.mockResolvedValue(undefined);
    await expect(executeBranchAction("/repo", "checkout-new-local-branch", "main")).resolves.toEqual({
      success: false,
      message: "Checkout new branch cancelled."
    });
    expect(runGitMock).not.toHaveBeenCalledWith(["checkout", "-b", expect.any(String), "main"], "/repo", { timeout: 120_000 });
  });

  it("rejects invalid branch names before checkout", async () => {
    showInputBoxMock.mockResolvedValue("bad..name");
    runGitMock.mockImplementation(async (args) => {
      if (args[0] === "check-ref-format") {
        return fail("fatal: bad branch name");
      }
      return ok("");
    });

    await expect(executeBranchAction("/repo", "checkout-new-local-branch", "main")).resolves.toEqual({
      success: false,
      message: "Invalid branch name: bad..name"
    });
    expect(runGitMock).not.toHaveBeenCalledWith(["checkout", "-b", "bad..name", "main"], "/repo", { timeout: 120_000 });
  });

  it("fails when remote tracking ref is not available locally", async () => {
    runGitMock.mockImplementation(async (args) => {
      if (args[0] === "rev-parse" && args[1] === "--verify") {
        return fail("unknown ref");
      }
      return ok("");
    });

    await expect(
      executeBranchAction("/repo", "checkout-new-local-branch", "feature/x", "origin", "feature/x")
    ).resolves.toEqual({
      success: false,
      message: "Remote tracking ref origin/feature/x is not available locally. Fetch the remote branch first."
    });
    expect(showInputBoxMock).not.toHaveBeenCalled();
  });

  it("requires a selected branch for local-source checkout", async () => {
    await expect(executeBranchAction("/repo", "checkout-new-local-branch")).resolves.toEqual({
      success: false,
      message: "Select a branch before checking out a new branch."
    });
    expect(showInputBoxMock).not.toHaveBeenCalled();
  });
});

function ok(stdout: string): GitResult {
  return { stdout, stderr: "", exitCode: 0, timedOut: false };
}

function fail(stderr: string): GitResult {
  return { stdout: "", stderr, exitCode: 128, timedOut: false };
}
