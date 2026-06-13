import { describe, expect, it } from "vitest";
import { detectStatus, generateDescription, STALE_THRESHOLD_DAYS } from "../../git/branch-status";
import type { BranchLifecycle } from "../../shared/types";

describe("detectStatus", () => {
  it("TC-BH01: merged when branch tip is ancestor of default branch", () => {
    expect(
      detectStatus({ isMergedIntoMain: true, daysSinceActivity: 0, aheadOfMain: 0, behindMain: 0 })
    ).toEqual({ status: "merged", stale: false });
  });

  it("TC-BH02: diverged mild when behind 1-5", () => {
    expect(
      detectStatus({ isMergedIntoMain: false, daysSinceActivity: 1, aheadOfMain: 5, behindMain: 3 })
    ).toEqual({ status: "diverged", severity: "mild", stale: false });
  });

  it("TC-BH03: diverged high when behind 6-12", () => {
    expect(
      detectStatus({ isMergedIntoMain: false, daysSinceActivity: 1, aheadOfMain: 3, behindMain: 8 })
    ).toEqual({ status: "diverged", severity: "high", stale: false });
  });

  it("TC-BH04: diverged severe when behind 13+", () => {
    expect(
      detectStatus({ isMergedIntoMain: false, daysSinceActivity: 2, aheadOfMain: 5, behindMain: 18 })
    ).toEqual({ status: "diverged", severity: "severe", stale: false });
  });

  it("TC-BH05: stale flag set independently of diverged status", () => {
    const result = detectStatus({ isMergedIntoMain: false, daysSinceActivity: 13, aheadOfMain: 3, behindMain: 14 });
    expect(result.status).toBe("diverged");
    expect(result.stale).toBe(true);
  });

  it("TC-BH06: active when behind=0 even if ahead>0", () => {
    expect(
      detectStatus({ isMergedIntoMain: false, daysSinceActivity: 1, aheadOfMain: 10, behindMain: 0 })
    ).toEqual({ status: "active", stale: false });
  });

  it("TC-BH07: active when both ahead=0 and behind=0", () => {
    expect(
      detectStatus({ isMergedIntoMain: false, daysSinceActivity: 0, aheadOfMain: 0, behindMain: 0 })
    ).toEqual({ status: "active", stale: false });
  });

  it("TC-BH08: merged takes priority over stale", () => {
    expect(
      detectStatus({ isMergedIntoMain: true, daysSinceActivity: 30, aheadOfMain: 0, behindMain: 0 }).status
    ).toBe("merged");
  });

  it("uses stale threshold constant", () => {
    expect(STALE_THRESHOLD_DAYS).toBe(7);
  });
});

describe("generateDescription", () => {
  it("describes remote-only branches", () => {
    const lifecycle = baseLifecycle({
      remoteOnly: true,
      remote: "origin",
      status: "remote-only"
    });
    expect(generateDescription(lifecycle, "main")).toContain("Remote branch only on origin");
  });

  it("describes merged branches", () => {
    const lifecycle = baseLifecycle({ status: "merged" });
    expect(generateDescription(lifecycle, "main")).toBe("Merged into main.");
  });

  it("summarizes unpushed commits and divergence", () => {
    const lifecycle = baseLifecycle({
      status: "diverged",
      aheadOfMain: 2,
      behindMain: 4,
      remotes: [{ name: "origin", colorIndex: 0, pushDay: 1, pushDate: "", hash: "abc", behindLocal: 3 }],
      divergePerRemote: [{ remote: "origin", behind: 5, mainRef: "origin/main" }]
    });
    const text = generateDescription(lifecycle, "main");
    expect(text).toContain("3 unpushed to origin");
    expect(text).toContain("2 ahead of local main");
    expect(text).toContain("4 behind local main");
    expect(text).toContain("5 behind origin/main");
  });

  it("falls back to in-sync copy for active branches", () => {
    const lifecycle = baseLifecycle({ status: "active", name: "feature/x" });
    expect(generateDescription(lifecycle, "main")).toBe("In sync with main.");
  });

  it("describes the default branch and stale activity", () => {
    expect(generateDescription(baseLifecycle({ status: "active", name: "main" }), "main")).toBe(
      "Primary main branch."
    );
    expect(generateDescription(baseLifecycle({ status: "active", stale: true }), "main")).toContain(
      "no recent activity"
    );
  });
});

function baseLifecycle(partial: Partial<BranchLifecycle> & Pick<BranchLifecycle, "status">): BranchLifecycle {
  return {
    name: partial.name ?? "feature/x",
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
    divergePerRemote: partial.divergePerRemote,
    description: partial.description ?? ""
  };
}
