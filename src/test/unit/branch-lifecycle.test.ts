import { beforeEach, describe, expect, it, vi } from "vitest";
import type { GitResult } from "../../git/runner";

vi.mock("../../git/runner", () => ({
  runGit: vi.fn()
}));

vi.mock("../../git/commands", () => ({
  getBranches: vi.fn(),
  getRemoteBranches: vi.fn(),
  getRemotes: vi.fn(),
  getCurrentBranch: vi.fn()
}));

import {
  computePerRemoteDivergence,
  dayIndexFromIso,
  getBranchLifecycles,
  resolveDefaultBranch,
  resolveHistoryDateWindow,
  sortBranchLifecycles
} from "../../git/branch-lifecycle";
import { getBranches, getRemoteBranches, getRemotes } from "../../git/commands";
import { runGit } from "../../git/runner";
import type { BranchLifecycle } from "../../shared/types";

const mockedRunGit = vi.mocked(runGit);
const mockedGetBranches = vi.mocked(getBranches);
const mockedGetRemoteBranches = vi.mocked(getRemoteBranches);
const mockedGetRemotes = vi.mocked(getRemotes);

function ok(stdout = ""): GitResult {
  return { exitCode: 0, stdout, stderr: "", timedOut: false };
}

function fail(): GitResult {
  return { exitCode: 1, stdout: "", stderr: "missing", timedOut: false };
}

describe("resolveHistoryDateWindow", () => {
  it("caps All preset at 90 days", () => {
    const now = new Date("2026-06-13T12:00:00Z");
    const window = resolveHistoryDateWindow({ mode: "preset", presetDays: null }, now);
    expect(window.totalDays).toBe(91);
  });

  it("honors custom date ranges", () => {
    const window = resolveHistoryDateWindow({
      mode: "custom",
      presetDays: null,
      customFrom: "2026-06-01",
      customTo: "2026-06-07"
    });
    expect(window.totalDays).toBe(7);
  });
});

describe("dayIndexFromIso", () => {
  it("maps ISO dates into window day indices", () => {
    const window = resolveHistoryDateWindow({ mode: "preset", presetDays: 7 }, new Date("2026-06-13T23:59:59"));
    const index = dayIndexFromIso("2026-06-13T10:00:00Z", window);
    expect(index).toBeGreaterThanOrEqual(0);
    expect(index).toBeLessThan(window.totalDays);
  });

  it("returns zero for invalid ISO input", () => {
    const window = resolveHistoryDateWindow({ mode: "preset", presetDays: 7 });
    expect(dayIndexFromIso("not-a-date", window)).toBe(0);
  });
});

describe("resolveDefaultBranch", () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it("TC-BH11: uses origin HEAD symbolic ref", async () => {
    mockedRunGit.mockResolvedValueOnce(ok("refs/remotes/origin/main\n"));
    await expect(resolveDefaultBranch("/repo")).resolves.toBe("main");
  });

  it("TC-BH12: falls back main then master then first local", async () => {
    mockedRunGit
      .mockResolvedValueOnce(fail())
      .mockResolvedValueOnce(fail())
      .mockResolvedValueOnce(fail());
    mockedGetBranches.mockResolvedValueOnce([{ name: "develop", colorIndex: 0, isCurrent: true, remotes: [] }]);
    await expect(resolveDefaultBranch("/repo")).resolves.toBe("develop");
  });

  it("TC-BH12b: uses local main when origin HEAD is missing", async () => {
    mockedRunGit.mockResolvedValueOnce(fail()).mockResolvedValueOnce(ok("refs/heads/main\n"));
    await expect(resolveDefaultBranch("/repo")).resolves.toBe("main");
  });

  it("TC-BH12c: falls back to master when main is missing", async () => {
    mockedRunGit
      .mockResolvedValueOnce(fail())
      .mockResolvedValueOnce(fail())
      .mockResolvedValueOnce(ok("refs/heads/master\n"));
    await expect(resolveDefaultBranch("/repo")).resolves.toBe("master");
  });
});

describe("computePerRemoteDivergence", () => {
  beforeEach(() => {
    mockedRunGit.mockReset();
  });

  it("TC-BH09: returns different behind counts per remote", async () => {
    mockedRunGit
      .mockResolvedValueOnce(ok("hash1\n"))
      .mockResolvedValueOnce(ok("5\t2\n"))
      .mockResolvedValueOnce(ok("hash2\n"))
      .mockResolvedValueOnce(ok("7\t2\n"));

    const result = await computePerRemoteDivergence("/repo", "feature/x", ["origin", "upstream"], "main");
    expect(result).toHaveLength(2);
    expect(result[0]).toEqual({ remote: "origin", behind: 5, mainRef: "origin/main" });
    expect(result[1]).toEqual({ remote: "upstream", behind: 7, mainRef: "upstream/main" });
    expect(result[0].behind).not.toBe(result[1].behind);
  });

  it("TC-BH10: skips remotes without default branch ref", async () => {
    mockedRunGit.mockImplementation(async (args) => {
      const ref = args[2] ?? args[1];
      if (args[0] === "rev-parse" && ref === "origin/main") {
        return ok("hash\n");
      }
      if (args[0] === "rev-parse" && ref === "backup/main") {
        return fail();
      }
      if (args[0] === "rev-list") {
        return ok("1\t0\n");
      }
      return fail();
    });

    const result = await computePerRemoteDivergence("/repo", "feature/x", ["origin", "backup"], "main");
    expect(result.some((entry) => entry.remote === "backup")).toBe(false);
    expect(result).toHaveLength(1);
  });

  it("skips remotes when ahead/behind lookup fails", async () => {
    mockedRunGit.mockResolvedValueOnce(ok("hash\n")).mockResolvedValueOnce(fail());
    const result = await computePerRemoteDivergence("/repo", "feature/x", ["origin"], "main");
    expect(result).toHaveLength(0);
  });
});

describe("sortBranchLifecycles", () => {
  it("TC-BH13: includes remote-only refs in sort order after diverged", () => {
    const lifecycles: BranchLifecycle[] = [
      lifecycle({ name: "feature/x", status: "remote-only", remoteOnly: true, remote: "origin", startDay: 5 }),
      lifecycle({ name: "main", status: "active", startDay: 0 }),
      lifecycle({ name: "feature/y", status: "diverged", severity: "severe", startDay: 10 }),
      lifecycle({ name: "feature/z", status: "active", startDay: 8 })
    ];

    const sorted = sortBranchLifecycles(lifecycles, "main");
    expect(sorted[0]?.name).toBe("main");
    expect(sorted[1]?.name).toBe("feature/y");
    expect(sorted.some((row) => row.status === "remote-only")).toBe(true);
  });

  it("sorts merged branches by most recent end day", () => {
    const lifecycles: BranchLifecycle[] = [
      lifecycle({ name: "old-merge", status: "merged", endDay: 2 }),
      lifecycle({ name: "new-merge", status: "merged", endDay: 8 })
    ];
    const sorted = sortBranchLifecycles(lifecycles, "main");
    expect(sorted[0]?.name).toBe("new-merge");
  });

  it("sorts remote-only rows by remote then branch name", () => {
    const lifecycles: BranchLifecycle[] = [
      lifecycle({ name: "b", status: "remote-only", remoteOnly: true, remote: "upstream", startDay: 1 }),
      lifecycle({ name: "a", status: "remote-only", remoteOnly: true, remote: "origin", startDay: 1 })
    ];
    const sorted = sortBranchLifecycles(lifecycles, "main");
    expect(sorted[0]?.remote).toBe("origin");
    expect(sorted[1]?.remote).toBe("upstream");
  });

  it("orders diverged branches by severity", () => {
    const lifecycles: BranchLifecycle[] = [
      lifecycle({ name: "severe", status: "diverged", severity: "severe", startDay: 3 }),
      lifecycle({ name: "mild", status: "diverged", severity: "mild", startDay: 5 })
    ];
    const sorted = sortBranchLifecycles(lifecycles, "main");
    expect(sorted[0]?.name).toBe("severe");
    expect(sorted[1]?.name).toBe("mild");
  });

  it("sorts remote-only rows on the same remote by branch name", () => {
    const lifecycles: BranchLifecycle[] = [
      lifecycle({ name: "z-branch", status: "remote-only", remoteOnly: true, remote: "origin", startDay: 1 }),
      lifecycle({ name: "a-branch", status: "remote-only", remoteOnly: true, remote: "origin", startDay: 1 })
    ];
    const sorted = sortBranchLifecycles(lifecycles, "main");
    expect(sorted[0]?.name).toBe("a-branch");
    expect(sorted[1]?.name).toBe("z-branch");
  });
});

function lifecycle(partial: Partial<BranchLifecycle> & Pick<BranchLifecycle, "name" | "status">): BranchLifecycle {
  return {
    name: partial.name,
    colorIndex: partial.colorIndex ?? 0,
    isCurrent: partial.isCurrent ?? false,
    remoteOnly: partial.remoteOnly,
    remote: partial.remote,
    status: partial.status,
    severity: partial.severity,
    stale: partial.stale ?? false,
    startDay: partial.startDay ?? 0,
    endDay: partial.endDay ?? 1,
    commitDays: partial.commitDays ?? [0],
    totalCommits: partial.totalCommits ?? 1,
    startDate: partial.startDate ?? "2026-06-01T00:00:00Z",
    endDate: partial.endDate ?? "2026-06-02T00:00:00Z",
    commitDates: partial.commitDates ?? ["2026-06-01T00:00:00Z"],
    hashStart: partial.hashStart ?? "abc1234",
    hashEnd: partial.hashEnd ?? "def5678",
    forkedFrom: partial.forkedFrom ?? null,
    mergedInto: partial.mergedInto ?? null,
    aheadOfMain: partial.aheadOfMain ?? 0,
    behindMain: partial.behindMain ?? 0,
    lastCommonAncestorDay: partial.lastCommonAncestorDay ?? 0,
    remotes: partial.remotes ?? [],
    description: partial.description ?? ""
  };
}

// Remote-only inclusion in payload is covered by getBranchLifecycles integration via getRemoteBranches mock.
describe("getBranchLifecycles", () => {
  beforeEach(() => {
    mockedRunGit.mockReset();
    vi.clearAllMocks();
  });

  it("TC-BH13: includes remote-only refs without localBranchName", async () => {
    mockedGetBranches.mockResolvedValue([
      { name: "main", colorIndex: 0, isCurrent: true, remotes: [] },
      { name: "feature/x", colorIndex: 1, isCurrent: false, remotes: [{ remote: "origin", ref: "origin/feature/x", ahead: 0, behind: 0, isConfiguredUpstream: true }] }
    ]);
    mockedGetRemoteBranches.mockResolvedValue([
      { remote: "origin", branchName: "legacy", ref: "origin/legacy", colorIndex: 2 }
    ]);
    mockedGetRemotes.mockResolvedValue([{ name: "origin", url: "https://example.com/repo.git", colorIndex: 0 }]);

    mockedRunGit.mockImplementation(async (args) => {
      const cmd = args[0];
      if (cmd === "symbolic-ref") {
        return ok("refs/remotes/origin/main\n");
      }
      if (cmd === "log") {
        if (args[1] === "-1") {
          return ok("2026-06-12T10:00:00Z\tdeadbeef\n");
        }
        return ok("2026-06-10T10:00:00Z\tabc1234\n2026-06-12T10:00:00Z\tdef5678\n");
      }
      if (cmd === "rev-parse") {
        return ok("aaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaa\n");
      }
      if (cmd === "merge-base" && args[1] === "--is-ancestor") {
        return fail();
      }
      if (cmd === "merge-base") {
        return ok("bbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbb\n");
      }
      if (cmd === "rev-list") {
        if (args.includes("--left-right")) {
          return ok("2\t5\n");
        }
        return ok("1\n");
      }
      return fail();
    });

    const payload = await getBranchLifecycles("/repo", { mode: "preset", presetDays: 7 });
    const remoteOnly = payload.lifecycles.find((row) => row.remoteOnly && row.name === "legacy");
    expect(remoteOnly).toBeDefined();
    expect(remoteOnly?.status).toBe("remote-only");
    expect(payload.defaultBranch).toBe("main");
    expect(payload.remoteMains).toHaveLength(1);
    expect(payload.window.totalDays).toBeGreaterThan(0);
  });

  it("marks merged local branches and tolerates empty git log output", async () => {
    mockedGetBranches.mockResolvedValue([
      { name: "main", colorIndex: 0, isCurrent: true, remotes: [] },
      { name: "feature/merged", colorIndex: 1, isCurrent: false, remotes: [] }
    ]);
    mockedGetRemoteBranches.mockResolvedValue([]);
    mockedGetRemotes.mockResolvedValue([{ name: "origin", url: "https://example.com/repo.git", colorIndex: 0 }]);

    mockedRunGit.mockImplementation(async (args) => {
      const cmd = args[0];
      const ref = args[1];
      if (cmd === "symbolic-ref") {
        return ok("refs/remotes/origin/main\n");
      }
      if (cmd === "log" && ref === "feature/merged") {
        return fail();
      }
      if (cmd === "log") {
        return ok("2026-06-12T10:00:00Z\tcafebabe\n");
      }
      if (cmd === "rev-parse") {
        return ok("cccccccccccccccccccccccccccccccccccccccc\n");
      }
      if (cmd === "merge-base" && args[1] === "--is-ancestor") {
        return ok("");
      }
      if (cmd === "merge-base") {
        return ok("dddddddddddddddddddddddddddddddddddddddd\n");
      }
      if (cmd === "rev-list") {
        return ok("0\t0\n");
      }
      return fail();
    });

    const payload = await getBranchLifecycles("/repo", { mode: "preset", presetDays: 7 });
    const merged = payload.lifecycles.find((row) => row.name === "feature/merged");
    expect(merged?.status).toBe("merged");
  });
});
