import { beforeEach, describe, expect, it, vi } from "vitest";
import { FIELD_SEP, RECORD_SEP } from "../../git/parser";
import type { GitResult } from "../../git/runner";

vi.mock("../../git/runner", () => ({
  runGit: vi.fn()
}));

vi.mock("../../git/api", () => ({
  getActiveRepository: vi.fn().mockResolvedValue({ root: "/repo", name: "repo", currentBranch: "main" })
}));

import { getAheadBehind, getBranches, getCommitFileChanges, getCommits, getCurrentBranch, getRemoteBranches, getRemotes, getRepositoryState } from "../../git/commands";
import { getActiveRepository } from "../../git/api";
import { runGit } from "../../git/runner";

const mockedRunGit = vi.mocked(runGit);

describe("getCommits", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mockedRunGit.mockImplementation(async (args) => {
      if (args[0] === "remote") {
        return ok("origin\tgit@github.com:org/repo.git (fetch)\norigin\tgit@github.com:org/repo.git (push)\n");
      }
      if (args[0] === "log") {
        return ok(commitRecord());
      }
      if (args[0] === "rev-list") {
        return ok("1\n");
      }
      return ok("");
    });
  });

  it("passes --after for preset ranges", async () => {
    await getCommits("/repo", { mode: "preset", presetDays: 7 }, 0, 8);
    const logCall = mockedRunGit.mock.calls.find(([args]) => args[0] === "log");
    expect(logCall?.[0].some((arg) => arg.startsWith("--after="))).toBe(true);
  });

  it("loads full history in all mode without git pagination", async () => {
    await getCommits("/repo", { mode: "preset", presetDays: null }, 2, 8);
    const logCall = mockedRunGit.mock.calls.find(([args]) => args[0] === "log");
    expect(logCall?.[0]).not.toContain("--skip=");
    expect(logCall?.[0]).not.toContain("-n");
  });

  it("passes custom date range args", async () => {
    await getCommits("/repo", { mode: "custom", presetDays: null, customFrom: "2026-06-01", customTo: "2026-06-10" }, 0, 8);
    const logCall = mockedRunGit.mock.calls.find(([args]) => args[0] === "log");
    expect(logCall?.[0].some((arg) => arg.includes("2026-06-01"))).toBe(true);
    expect(logCall?.[0].some((arg) => arg.includes("2026-06-10"))).toBe(true);
  });

  it("throws on git log errors", async () => {
    mockedRunGit.mockImplementation(async (args) => {
      if (args[0] === "remote") {
        return ok("");
      }
      return fail("fatal: not a git repository");
    });

    await expect(getCommits("/repo", { mode: "preset", presetDays: 7 }, 0, 8)).rejects.toThrow("git log failed");
  });

  it("searches the full date range without a hard cap", async () => {
    mockedRunGit.mockImplementation(async (args) => {
      if (args[0] === "remote") {
        return ok("");
      }
      if (args[0] === "log") {
        return ok([commitRecord("aaa111", "match me"), commitRecord("bbb222", "skip me")].join(""));
      }
      return ok("2\n");
    });

    const result = await getCommits("/repo", { mode: "preset", presetDays: null }, 0, 8, "match");
    const logCall = mockedRunGit.mock.calls.find(([args]) => args[0] === "log");
    expect(logCall?.[0]).not.toContain("-n");
    expect(result.commits).toHaveLength(1);
    expect(result.pagination.enabled).toBe(false);
  });

  it("paginates search results after filtering", async () => {
    mockedRunGit.mockImplementation(async (args) => {
      if (args[0] === "remote") {
        return ok("");
      }
      if (args[0] === "log") {
        return ok(Array.from({ length: 10 }, (_, index) => commitRecord(`hash${index}`, `match ${index}`)).join(""));
      }
      return ok("10\n");
    });

    const result = await getCommits("/repo", { mode: "preset", presetDays: null }, 1, 8, "match");
    expect(result.commits).toHaveLength(2);
    expect(result.pagination.enabled).toBe(true);
    expect(result.pagination.totalPages).toBe(2);
  });

  it("uses --all for all-branches scope", async () => {
    await getCommits("/repo", { mode: "preset", presetDays: 7 }, 0, 8, "", { type: "all" });
    const logCall = mockedRunGit.mock.calls.find(([args]) => args[0] === "log");
    const countCall = mockedRunGit.mock.calls.find(([args]) => args[0] === "rev-list");
    expect(logCall?.[0]).toContain("--all");
    expect(countCall?.[0]).toContain("--all");
  });

  it("scopes local branch history to the branch ref", async () => {
    await getCommits("/repo", { mode: "preset", presetDays: 7 }, 0, 8, "", { type: "local", ref: "feature/x", branchName: "feature/x" });
    const logCall = mockedRunGit.mock.calls.find(([args]) => args[0] === "log");
    const countCall = mockedRunGit.mock.calls.find(([args]) => args[0] === "rev-list");
    expect(logCall?.[0]).toContain("feature/x");
    expect(logCall?.[0]).not.toContain("--all");
    expect(countCall?.[0]).toContain("feature/x");
    expect(countCall?.[0]).not.toContain("--all");
  });

  it("scopes remote branch history to the remote ref", async () => {
    await getCommits("/repo", { mode: "preset", presetDays: 7 }, 0, 8, "", {
      type: "remote",
      ref: "origin/feature/x",
      remote: "origin",
      branchName: "feature/x"
    });
    const logCall = mockedRunGit.mock.calls.find(([args]) => args[0] === "log");
    expect(logCall?.[0]).toContain("origin/feature/x");
    expect(logCall?.[0]).not.toContain("--all");
  });

  it("keeps search and pagination inside a selected scope", async () => {
    mockedRunGit.mockImplementation(async (args) => {
      if (args[0] === "remote") {
        return ok("");
      }
      if (args[0] === "log") {
        return ok(Array.from({ length: 6 }, (_, index) => commitRecord(`hash${index}`, `feature ${index}`)).join(""));
      }
      if (args[0] === "rev-list") {
        return ok("6\n");
      }
      return ok("");
    });

    const result = await getCommits(
      "/repo",
      { mode: "preset", presetDays: null },
      1,
      4,
      "feature",
      { type: "local", ref: "feature/x", branchName: "feature/x" }
    );
    const logCall = mockedRunGit.mock.calls.find(([args]) => args[0] === "log");
    expect(logCall?.[0]).toContain("feature/x");
    expect(logCall?.[0]).not.toContain("--all");
    expect(result.commits).toHaveLength(2);
    expect(result.pagination.enabled).toBe(true);
  });
});

describe("getRemoteBranches", () => {
  beforeEach(() => vi.clearAllMocks());

  it("discovers remote-only branches and links local names when present", async () => {
    mockedRunGit.mockImplementation(async (args) => {
      if (args[0] === "for-each-ref" && args.includes("refs/remotes/")) {
        return ok("origin/main\norigin/feature/x\nupstream/release\n");
      }
      if (args[0] === "for-each-ref" && args.includes("refs/heads/")) {
        return ok("main\nfeature/x\n");
      }
      if (args[0] === "remote") {
        return ok("origin\turl (fetch)\nupstream\turl2 (fetch)\n");
      }
      return ok("");
    });

    const remoteBranches = await getRemoteBranches("/repo");
    expect(remoteBranches).toHaveLength(3);
    expect(remoteBranches.find((branch) => branch.ref === "origin/main")?.localBranchName).toBe("main");
    expect(remoteBranches.find((branch) => branch.ref === "upstream/release")?.localBranchName).toBeUndefined();
  });
});

describe("getCommitFileChanges", () => {
  beforeEach(() => vi.clearAllMocks());

  it("loads changed files against the first parent for normal commits", async () => {
    mockedRunGit.mockImplementation(async (args) => {
      if (args[0] === "rev-list") {
        return ok("abc123 parent1\n");
      }
      if (args[0] === "diff") {
        return ok("M\tsrc/app.ts\nA\tsrc/new.ts\n");
      }
      return ok("");
    });

    const result = await getCommitFileChanges("/repo", "abc123");
    expect(result.baseHash).toBe("parent1");
    expect(result.files).toEqual([
      { path: "src/app.ts", status: "modified", rawStatus: "M" },
      { path: "src/new.ts", status: "added", rawStatus: "A" }
    ]);
    expect(mockedRunGit).toHaveBeenCalledWith(["diff", "--name-status", "-M", "parent1", "abc123"], "/repo");
  });

  it("loads root commit files with diff-tree --root", async () => {
    mockedRunGit.mockImplementation(async (args) => {
      if (args[0] === "rev-list") {
        return ok("root123\n");
      }
      if (args[0] === "diff-tree") {
        return ok("A\tREADME.md\n");
      }
      return ok("");
    });

    const result = await getCommitFileChanges("/repo", "root123");
    expect(result.baseHash).toBeUndefined();
    expect(result.files[0]).toMatchObject({ path: "README.md", status: "added" });
    expect(mockedRunGit).toHaveBeenCalledWith(["diff-tree", "--root", "--no-commit-id", "--name-status", "-r", "-M", "root123"], "/repo");
  });
});

describe("getAheadBehind", () => {
  beforeEach(() => vi.clearAllMocks());

  it("parses ahead and behind counts", async () => {
    mockedRunGit.mockResolvedValue(ok("3\t1\n"));
    await expect(getAheadBehind("/repo", "main", "origin/main")).resolves.toEqual({ ahead: 3, behind: 1 });
  });

  it("returns zero counts on git errors", async () => {
    mockedRunGit.mockResolvedValue(fail("bad ref"));
    await expect(getAheadBehind("/repo", "main", "origin/main")).resolves.toEqual({ ahead: 0, behind: 0 });
  });
});

describe("getRemotes", () => {
  it("parses remote list", async () => {
    mockedRunGit.mockResolvedValue(ok("origin\tgit@github.com:org/repo.git (fetch)\norigin\tgit@github.com:org/repo.git (push)\n"));
    const remotes = await getRemotes("/repo");
    expect(remotes).toHaveLength(1);
    expect(remotes[0].name).toBe("origin");
  });

  it("returns an empty remote list on git errors", async () => {
    mockedRunGit.mockResolvedValue(fail("not a repo"));
    await expect(getRemotes("/repo")).resolves.toEqual([]);
  });
});

describe("getBranches", () => {
  it("discovers matching remote tracking refs", async () => {
    mockedRunGit.mockImplementation(async (args) => {
      if (args[0] === "for-each-ref" && args.includes("refs/heads/")) {
        return ok("main\torigin/main\torigin\nfeature/x\t\t\n");
      }
      if (args[0] === "for-each-ref" && args.includes("refs/remotes/")) {
        return ok("origin/main\norigin/feature/x\n");
      }
      if (args[0] === "remote") {
        return ok("origin\tgit@github.com:org/repo.git (fetch)\norigin\tgit@github.com:org/repo.git (push)\n");
      }
      if (args[0] === "branch") {
        return ok("main\n");
      }
      if (args[0] === "rev-list") {
        return ok("0\t0\n");
      }
      return ok("");
    });

    const branches = await getBranches("/repo");
    expect(branches).toHaveLength(2);
    expect(branches[0].isCurrent).toBe(true);
    expect(branches[1].remotes[0].ref).toBe("origin/feature/x");
  });

  it("throws when local branch discovery fails", async () => {
    mockedRunGit.mockImplementation(async (args) => {
      if (args[0] === "for-each-ref" && args.includes("refs/heads/")) {
        return fail("fatal");
      }
      return ok("");
    });

    await expect(getBranches("/repo")).rejects.toThrow("git branch discovery failed");
  });
});

describe("getCurrentBranch", () => {
  it("returns current branch when available", async () => {
    mockedRunGit.mockResolvedValue(ok("main\n"));
    await expect(getCurrentBranch("/repo")).resolves.toBe("main");
  });

  it("falls back to detached short sha", async () => {
    mockedRunGit.mockResolvedValueOnce(ok("\n")).mockResolvedValueOnce(ok("abc123\n"));
    await expect(getCurrentBranch("/repo")).resolves.toBe("DETACHED abc123");
  });

  it("returns DETACHED when branch and sha fail", async () => {
    mockedRunGit.mockResolvedValue(fail("bad"));
    await expect(getCurrentBranch("/repo")).resolves.toBe("DETACHED");
  });
});

describe("getRepositoryState", () => {
  it("returns empty state without a repository", async () => {
    vi.mocked(getActiveRepository).mockResolvedValueOnce(undefined);
    await expect(getRepositoryState()).resolves.toMatchObject({ root: null, commitCount: 0 });
  });

  it("returns repository metadata", async () => {
    mockedRunGit.mockImplementation(async (args) => {
      if (args[0] === "branch") {
        return ok("main\n");
      }
      if (args[0] === "remote") {
        return ok("origin\turl (fetch)\n");
      }
      if (args[0] === "rev-list") {
        return ok("42\n");
      }
      return ok("");
    });

    await expect(getRepositoryState("/repo")).resolves.toMatchObject({
      root: "/repo",
      name: "repo",
      currentBranch: "main",
      remoteCount: 1,
      commitCount: 42
    });
  });
});

function commitRecord(hash = "a1b2c3d4e5f6", message = "fix: db timeout") {
  return [
    hash,
    hash.slice(0, 7),
    message,
    "liuqd",
    "liuqd@example.com",
    "2026-06-13T14:22:00+08:00",
    "",
    "HEAD -> main"
  ].join(FIELD_SEP) + RECORD_SEP;
}

function ok(stdout: string): GitResult {
  return { stdout, stderr: "", exitCode: 0, timedOut: false };
}

function fail(stderr: string): GitResult {
  return { stdout: "", stderr, exitCode: 128, timedOut: false };
}
