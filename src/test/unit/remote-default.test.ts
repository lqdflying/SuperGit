import { beforeEach, describe, expect, it, vi } from "vitest";
import type { GitResult } from "../../git/runner";

const runGitMock = vi.hoisted(() => vi.fn());

vi.mock("../../git/runner", () => ({
  runGit: runGitMock
}));

import { clearRemoteDefaultBranchCache, enrichRemotesWithDefaultBranches, resolveRemoteDefaultBranch } from "../../git/remote-default";
import { invalidateRemoteDataCaches } from "../../git/commands";

function ok(stdout = ""): GitResult {
  return { exitCode: 0, stdout, stderr: "", timedOut: false };
}

function fail(): GitResult {
  return { exitCode: 1, stdout: "", stderr: "failed", timedOut: false };
}

describe("resolveRemoteDefaultBranch", () => {
  beforeEach(() => {
    runGitMock.mockReset();
    clearRemoteDefaultBranchCache();
  });

  it("uses the remote HEAD symbolic ref when present", async () => {
    runGitMock.mockResolvedValueOnce(ok("refs/remotes/origin/develop\n"));
    await expect(resolveRemoteDefaultBranch("/repo", "origin")).resolves.toBe("develop");
    expect(runGitMock).toHaveBeenCalledWith(["symbolic-ref", "refs/remotes/origin/HEAD"], "/repo");
    expect(runGitMock).toHaveBeenCalledTimes(1);
  });

  it("falls back to ls-remote symref when symbolic ref is missing and network is enabled", async () => {
    runGitMock
      .mockResolvedValueOnce(fail())
      .mockResolvedValueOnce(ok("ref: refs/heads/develop\tHEAD\nabc123\tHEAD\n"));
    await expect(resolveRemoteDefaultBranch("/repo", "origin", { network: true })).resolves.toBe("develop");
    expect(runGitMock).toHaveBeenCalledWith(["ls-remote", "--symref", "origin", "HEAD"], "/repo", { timeout: 15_000 });
  });

  it("skips ls-remote by default", async () => {
    runGitMock.mockResolvedValueOnce(fail());
    await expect(resolveRemoteDefaultBranch("/repo", "origin")).resolves.toBeUndefined();
    expect(runGitMock).toHaveBeenCalledTimes(1);
  });

  it("upgrades a local-only miss with a network lookup", async () => {
    runGitMock.mockResolvedValueOnce(fail());
    await expect(resolveRemoteDefaultBranch("/repo", "origin", { network: false })).resolves.toBeUndefined();
    expect(runGitMock).toHaveBeenCalledTimes(1);

    runGitMock
      .mockResolvedValueOnce(fail())
      .mockResolvedValueOnce(ok("ref: refs/heads/develop\tHEAD\nabc123\tHEAD\n"));
    await expect(resolveRemoteDefaultBranch("/repo", "origin", { network: true })).resolves.toBe("develop");
    expect(runGitMock).toHaveBeenCalledWith(["ls-remote", "--symref", "origin", "HEAD"], "/repo", { timeout: 15_000 });
    expect(runGitMock).toHaveBeenCalledTimes(3);
  });

  it("returns cached results without rerunning git", async () => {
    runGitMock.mockResolvedValueOnce(ok("refs/remotes/origin/main\n"));
    await expect(resolveRemoteDefaultBranch("/repo", "origin")).resolves.toBe("main");
    await expect(resolveRemoteDefaultBranch("/repo", "origin")).resolves.toBe("main");
    expect(runGitMock).toHaveBeenCalledTimes(1);
  });

  it("returns undefined when neither lookup succeeds", async () => {
    runGitMock.mockResolvedValueOnce(fail()).mockResolvedValueOnce(fail());
    await expect(resolveRemoteDefaultBranch("/repo", "origin", { network: true })).resolves.toBeUndefined();
  });
});

describe("enrichRemotesWithDefaultBranches", () => {
  beforeEach(() => {
    runGitMock.mockReset();
    clearRemoteDefaultBranchCache();
  });

  it("adds defaultBranch from local symbolic refs without blocking on network", async () => {
    runGitMock.mockResolvedValueOnce(ok("refs/remotes/origin/main\n"));
    await expect(
      enrichRemotesWithDefaultBranches("/repo", [{ name: "origin", url: "url", colorIndex: 0 }], { network: false })
    ).resolves.toEqual([{ name: "origin", url: "url", colorIndex: 0, defaultBranch: "main" }]);
    expect(runGitMock).toHaveBeenCalledTimes(1);
  });

  it("enriches remotes over the network after a local-only miss", async () => {
    runGitMock.mockResolvedValueOnce(fail());
    await expect(
      enrichRemotesWithDefaultBranches("/repo", [{ name: "upstream", url: "url", colorIndex: 0 }], { network: false })
    ).resolves.toEqual([{ name: "upstream", url: "url", colorIndex: 0, defaultBranch: undefined }]);

    runGitMock
      .mockResolvedValueOnce(fail())
      .mockResolvedValueOnce(ok("ref: refs/heads/develop\tHEAD\nabc123\tHEAD\n"));
    await expect(
      enrichRemotesWithDefaultBranches("/repo", [{ name: "upstream", url: "url", colorIndex: 0 }], { network: true })
    ).resolves.toEqual([{ name: "upstream", url: "url", colorIndex: 0, defaultBranch: "develop" }]);
    expect(runGitMock).toHaveBeenCalledWith(["ls-remote", "--symref", "upstream", "HEAD"], "/repo", { timeout: 15_000 });
  });
});

describe("invalidateRemoteDataCaches", () => {
  beforeEach(() => {
    runGitMock.mockReset();
    clearRemoteDefaultBranchCache();
  });

  it("clears cached remote default branch results for a repository", async () => {
    runGitMock.mockResolvedValueOnce(ok("refs/remotes/origin/main\n"));
    await expect(resolveRemoteDefaultBranch("/repo", "origin")).resolves.toBe("main");
    expect(runGitMock).toHaveBeenCalledTimes(1);

    invalidateRemoteDataCaches("/repo");

    runGitMock.mockResolvedValueOnce(ok("refs/remotes/origin/develop\n"));
    await expect(resolveRemoteDefaultBranch("/repo", "origin")).resolves.toBe("develop");
    expect(runGitMock).toHaveBeenCalledTimes(2);
  });

  it("preserves default-branch cache when defaultBranches is false", async () => {
    runGitMock.mockResolvedValueOnce(ok("refs/remotes/origin/main\n"));
    await expect(resolveRemoteDefaultBranch("/repo", "origin")).resolves.toBe("main");
    expect(runGitMock).toHaveBeenCalledTimes(1);

    invalidateRemoteDataCaches("/repo", { defaultBranches: false });

    await expect(resolveRemoteDefaultBranch("/repo", "origin")).resolves.toBe("main");
    expect(runGitMock).toHaveBeenCalledTimes(1);
  });
});
