import { beforeEach, describe, expect, it, vi } from "vitest";
import type { GitResult } from "../../git/runner";

const clipboardWriteTextMock = vi.hoisted(() => vi.fn());
const showWarningMessageMock = vi.hoisted(() => vi.fn());
const showInputBoxMock = vi.hoisted(() => vi.fn());
const runGitMock = vi.hoisted(() => vi.fn());
const getCurrentBranchMock = vi.hoisted(() => vi.fn());
const getRemotesMock = vi.hoisted(() => vi.fn());
const unsetStaleUpstreamLinksMock = vi.hoisted(() => vi.fn());
const resolveDefaultBranchMock = vi.hoisted(() => vi.fn());
const resolveRemoteDefaultBranchMock = vi.hoisted(() => vi.fn());
const isBranchMergedIntoMock = vi.hoisted(() => vi.fn());

const showQuickPickMock = vi.hoisted(() => vi.fn());

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
  }
}));

vi.mock("../../git/runner", () => ({
  runGit: runGitMock
}));

vi.mock("../../git/commands", () => ({
  getCurrentBranch: getCurrentBranchMock,
  getRemotes: getRemotesMock,
  unsetStaleUpstreamLinks: unsetStaleUpstreamLinksMock
}));

vi.mock("../../git/branch-lifecycle", () => ({
  resolveDefaultBranch: resolveDefaultBranchMock,
  isBranchMergedInto: isBranchMergedIntoMock
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
    getCurrentBranchMock.mockResolvedValue("main");
    getRemotesMock.mockResolvedValue([{ name: "origin", url: "url", colorIndex: 0 }]);
    resolveDefaultBranchMock.mockResolvedValue("main");
    resolveRemoteDefaultBranchMock.mockResolvedValue("main");
    isBranchMergedIntoMock.mockResolvedValue(true);
    unsetStaleUpstreamLinksMock.mockResolvedValue([]);
    runGitMock.mockResolvedValue(ok(""));
  });

  it("pushes only the current branch when no branch is provided", async () => {
    await expect(executeBranchAction("/repo", "push")).resolves.toEqual({ success: true, message: "Pushed current branch." });
    expect(runGitMock).toHaveBeenCalledWith(["push"], "/repo", { timeout: 120_000 });
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
    expect(showInputBoxMock).toHaveBeenCalledWith(expect.objectContaining({ value: "origin/main" }));
    expect(runGitMock).toHaveBeenCalledWith(["branch", "--set-upstream-to", "origin/main", "main"], "/repo", { timeout: 120_000 });
  });

  it("pushes and sets upstream when the remote branch does not exist yet", async () => {
    showInputBoxMock.mockResolvedValue("origin/feature/local-only");
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
    expect(runGitMock).toHaveBeenCalledWith(["push", "-u", "origin", "feature/local-only"], "/repo", { timeout: 120_000 });
  });

  it("fetches and sets upstream when the remote branch exists but is not fetched locally", async () => {
    showInputBoxMock.mockResolvedValue("origin/feature/x");
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
    expect(runGitMock).toHaveBeenCalledWith(
      ["fetch", "origin", "refs/heads/feature/x:refs/remotes/origin/feature/x"],
      "/repo",
      { timeout: 120_000 }
    );
    expect(runGitMock).toHaveBeenCalledWith(["branch", "--set-upstream-to", "origin/feature/x", "feature/x"], "/repo", { timeout: 120_000 });
  });

  it("parses slash remotes when fetching and setting upstream", async () => {
    getRemotesMock.mockResolvedValue([
      { name: "foo", url: "foo-url", colorIndex: 0 },
      { name: "foo/bar", url: "foo-bar-url", colorIndex: 1 }
    ]);
    showInputBoxMock.mockResolvedValue("foo/bar/main");
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
    expect(runGitMock).toHaveBeenCalledWith(
      ["fetch", "foo/bar", "refs/heads/main:refs/remotes/foo/bar/main"],
      "/repo",
      { timeout: 120_000 }
    );
    expect(runGitMock).toHaveBeenCalledWith(["branch", "--set-upstream-to", "foo/bar/main", "work"], "/repo", { timeout: 120_000 });
  });

  it("uses explicit remote branch names when pushing and setting upstream", async () => {
    showInputBoxMock.mockResolvedValue("origin/feature/a");
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
    expect(runGitMock).toHaveBeenCalledWith(["push", "-u", "origin", "work:feature/a"], "/repo", { timeout: 120_000 });
  });

  it("cancels set upstream without input", async () => {
    showInputBoxMock.mockResolvedValue(undefined);
    await expect(executeBranchAction("/repo", "set-upstream", "main")).resolves.toEqual({ success: false, message: "Set upstream cancelled." });
    expect(runGitMock).not.toHaveBeenCalled();
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
});

function ok(stdout: string): GitResult {
  return { stdout, stderr: "", exitCode: 0, timedOut: false };
}

function fail(stderr: string): GitResult {
  return { stdout: "", stderr, exitCode: 128, timedOut: false };
}
