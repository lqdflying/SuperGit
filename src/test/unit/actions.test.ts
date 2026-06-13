import { beforeEach, describe, expect, it, vi } from "vitest";
import type { GitResult } from "../../git/runner";

const clipboardWriteTextMock = vi.hoisted(() => vi.fn());
const showWarningMessageMock = vi.hoisted(() => vi.fn());
const showInputBoxMock = vi.hoisted(() => vi.fn());
const runGitMock = vi.hoisted(() => vi.fn());
const getCurrentBranchMock = vi.hoisted(() => vi.fn());
const getRemotesMock = vi.hoisted(() => vi.fn());

vi.mock("vscode", () => ({
  env: {
    clipboard: {
      writeText: clipboardWriteTextMock
    }
  },
  window: {
    showWarningMessage: showWarningMessageMock,
    showInputBox: showInputBoxMock
  }
}));

vi.mock("../../git/runner", () => ({
  runGit: runGitMock
}));

vi.mock("../../git/commands", () => ({
  getCurrentBranch: getCurrentBranchMock,
  getRemotes: getRemotesMock
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
    getRemotesMock.mockResolvedValue([{ name: "origin", url: "url", color: "#fff" }]);
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

  it("fetches all remotes and prunes all remotes", async () => {
    await executeBranchAction("/repo", "fetch");
    await executeBranchAction("/repo", "prune-stale");
    expect(runGitMock).toHaveBeenCalledWith(["fetch", "--all", "--prune"], "/repo", { timeout: 120_000 });
    expect(runGitMock).toHaveBeenCalledTimes(2);
  });

  it("sets upstream using current branch defaults", async () => {
    await executeBranchAction("/repo", "set-upstream");
    expect(showInputBoxMock).toHaveBeenCalledWith(expect.objectContaining({ value: "origin/main" }));
    expect(runGitMock).toHaveBeenCalledWith(["branch", "--set-upstream-to", "origin/main", "main"], "/repo", { timeout: 120_000 });
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

  it("deletes named branches and prunes named remotes", async () => {
    await executeBranchAction("/repo", "delete", "feature/a");
    await executeBranchAction("/repo", "prune-stale", undefined, "origin");
    expect(runGitMock).toHaveBeenCalledWith(["branch", "-d", "feature/a"], "/repo", { timeout: 120_000 });
    expect(runGitMock).toHaveBeenCalledWith(["remote", "prune", "origin"], "/repo", { timeout: 120_000 });
  });
});

function ok(stdout: string): GitResult {
  return { stdout, stderr: "", exitCode: 0, timedOut: false };
}

function fail(stderr: string): GitResult {
  return { stdout: "", stderr, exitCode: 128, timedOut: false };
}
