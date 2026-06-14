import { describe, expect, it } from "vitest";
import { buildTrackingRows, getActiveLaneCount, graphColumnWidth, remoteBranchNameFromRef, resolveSelectedTracking } from "../../webview/utils";
import type { BranchInfo, CommitNode, RemoteBranchInfo } from "../../shared/types";

describe("getActiveLaneCount", () => {
  it("uses one lane for linear main-only history", () => {
    const commits: CommitNode[] = [
      {
        hash: "c2",
        hashShort: "c2",
        message: "second",
        author: "dev",
        authorEmail: "d@e",
        date: "2026-06-12T00:00:00Z",
        parents: ["c1"],
        refs: ["main"],
        tags: [],
        branch: "main",
        branchIndex: 0,
        swimlaneIndex: 0,
        inputSwimlanes: [{ id: "c2", colorIndex: 0 }],
        outputSwimlanes: [{ id: "c1", colorIndex: 0 }],
        isMerge: false
      },
      {
        hash: "c1",
        hashShort: "c1",
        message: "first",
        author: "dev",
        authorEmail: "d@e",
        date: "2026-06-11T00:00:00Z",
        parents: [],
        refs: ["main"],
        tags: [],
        branch: "main",
        branchIndex: 0,
        swimlaneIndex: 0,
        inputSwimlanes: [{ id: "c1", colorIndex: 0 }],
        outputSwimlanes: [],
        isMerge: false
      }
    ];

    expect(getActiveLaneCount(commits)).toBe(1);
  });
  it("sizes graph column width from lane count with header minimum", () => {
    expect(graphColumnWidth(1)).toBe(80);
    expect(graphColumnWidth(7)).toBe(168);
  });
});

describe("buildTrackingRows", () => {
  it("appends remote-only branches after local branches", () => {
    const branches: BranchInfo[] = [
      { name: "main", colorIndex: 1, isCurrent: true, remotes: [] }
    ];
    const remoteBranches: RemoteBranchInfo[] = [
      { remote: "origin", branchName: "main", ref: "origin/main", colorIndex: 0, localBranchName: "main" },
      { remote: "origin", branchName: "feature/x", ref: "origin/feature/x", colorIndex: 1 }
    ];

    const rows = buildTrackingRows(branches, remoteBranches);
    expect(rows).toHaveLength(2);
    expect(rows[0]).toEqual({ kind: "local", branch: branches[0] });
    expect(rows[1]).toEqual({ kind: "remote-only", remoteBranch: remoteBranches[1] });
  });
});

describe("resolveSelectedTracking", () => {
  const workBranch: BranchInfo = {
    name: "work",
    colorIndex: 2,
    isCurrent: false,
    remotes: [
      {
        remote: "origin",
        ref: "origin/feature/a",
        ahead: 1,
        behind: 0,
        isConfiguredUpstream: true,
        remoteRefExists: true
      },
      {
        remote: "origin",
        ref: "origin/work",
        ahead: 0,
        behind: 0,
        isConfiguredUpstream: false,
        remoteRefExists: true
      }
    ]
  };

  it("selects the exact tracking ref when multiple rows share the same remote", () => {
    expect(resolveSelectedTracking(workBranch, "origin/feature/a")?.ref).toBe("origin/feature/a");
    expect(resolveSelectedTracking(workBranch, "origin/work")?.ref).toBe("origin/work");
  });

  it("falls back to configured upstream when no tracking ref is selected", () => {
    expect(resolveSelectedTracking(workBranch)?.ref).toBe("origin/feature/a");
  });
});

describe("remoteBranchNameFromRef", () => {
  it("extracts the remote branch name from a tracking ref", () => {
    expect(remoteBranchNameFromRef("origin/feature/a", "origin")).toBe("feature/a");
    expect(remoteBranchNameFromRef("origin/work", "origin")).toBe("work");
  });
});
