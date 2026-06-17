import { describe, expect, it } from "vitest";
import { buildFilesDiffRefs, buildTrackingRows, getActiveLaneCount, graphColumnWidth, hasMissingRemoteTracking, hasMissingRemoteTrackingForTarget, remoteBranchNameFromRef, resolveFilesDiffDefaults, resolveSelectedTracking, addUpstreamRemoteBranchName } from "../../webview/utils";
import type { BranchInfo, CommitNode, RemoteBranchInfo, RemoteConfig } from "../../shared/types";

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

describe("files diff refs", () => {
  const branches: BranchInfo[] = [
    {
      name: "main",
      colorIndex: 0,
      isCurrent: true,
      remotes: [
        { remote: "origin", ref: "origin/main", ahead: 0, behind: 0, isConfiguredUpstream: true, remoteRefExists: true }
      ]
    },
    { name: "feature/x", colorIndex: 1, isCurrent: false, remotes: [] }
  ];
  const remoteBranches: RemoteBranchInfo[] = [
    { remote: "origin", branchName: "main", ref: "origin/main", colorIndex: 0, localBranchName: "main" },
    { remote: "origin", branchName: "feature/x", ref: "origin/feature/x", colorIndex: 0, localBranchName: "feature/x" },
    { remote: "upstream", branchName: "main", ref: "upstream/main", colorIndex: 1 }
  ];
  const remotes: RemoteConfig[] = [
    { name: "origin", url: "origin-url", colorIndex: 0, defaultBranch: "main" },
    { name: "upstream", url: "upstream-url", colorIndex: 1, defaultBranch: "main" }
  ];

  it("builds local and remote branch options with current/default metadata", () => {
    const refs = buildFilesDiffRefs(branches, remoteBranches, remotes);
    expect(refs.map((ref) => ref.ref)).toEqual(["main", "feature/x", "origin/main", "origin/feature/x", "upstream/main"]);
    expect(refs.find((ref) => ref.ref === "main")?.isCurrent).toBe(true);
    expect(refs.find((ref) => ref.ref === "origin/main")?.isDefault).toBe(true);
  });

  it("defaults to the current branch and its configured upstream", () => {
    expect(resolveFilesDiffDefaults(branches, remoteBranches, remotes, "main", "main")).toEqual({
      leftRef: "main",
      rightRef: "origin/main"
    });
  });

  it("falls back to a remote default branch when no upstream is configured", () => {
    const noUpstream = branches.map((branch) => ({ ...branch, remotes: [] }));
    expect(resolveFilesDiffDefaults(noUpstream, remoteBranches, remotes, "feature/x", "main")).toEqual({
      leftRef: "main",
      rightRef: "origin/main"
    });
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

describe("hasMissingRemoteTrackingForTarget", () => {
  const remotes = [
    { name: "origin", url: "origin-url", colorIndex: 0 },
    { name: "upstream", url: "upstream-url", colorIndex: 1 }
  ];

  const workBranch: BranchInfo = {
    name: "work",
    colorIndex: 0,
    isCurrent: false,
    remotes: [
      {
        remote: "origin",
        ref: "origin/feature/a",
        ahead: 0,
        behind: 0,
        isConfiguredUpstream: true,
        remoteRefExists: true
      },
      {
        remote: "upstream",
        ref: "upstream/feature/a",
        ahead: 0,
        behind: 0,
        isConfiguredUpstream: false,
        remoteRefExists: true
      },
      {
        remote: "upstream",
        ref: "upstream/work",
        ahead: 0,
        behind: 0,
        isConfiguredUpstream: false,
        remoteRefExists: true
      }
    ]
  };

  it("returns false when the selected target is already tracked on every remote", () => {
    expect(hasMissingRemoteTrackingForTarget(workBranch, remotes, "feature/a")).toBe(false);
  });

  it("returns true when the selected target is missing on at least one remote", () => {
    expect(hasMissingRemoteTrackingForTarget(workBranch, remotes, "work")).toBe(true);
  });
});

describe("hasMissingRemoteTracking", () => {
  const remotes = [
    { name: "origin", url: "origin-url", colorIndex: 0 },
    { name: "upstream", url: "upstream-url", colorIndex: 1 }
  ];

  it("detects a missing remote branch on another remote even when that remote already has a different ref", () => {
    const branch: BranchInfo = {
      name: "work",
      colorIndex: 0,
      isCurrent: false,
      remotes: [
        {
          remote: "origin",
          ref: "origin/feature/a",
          ahead: 0,
          behind: 0,
          isConfiguredUpstream: true,
          remoteRefExists: true
        },
        {
          remote: "upstream",
          ref: "upstream/work",
          ahead: 0,
          behind: 0,
          isConfiguredUpstream: false,
          remoteRefExists: true
        }
      ]
    };
    expect(hasMissingRemoteTracking(branch, remotes)).toBe(true);
  });

  it("returns false when every remote has the target branch names", () => {
    const branch: BranchInfo = {
      name: "feature/single-remote",
      colorIndex: 0,
      isCurrent: false,
      remotes: [
        {
          remote: "origin",
          ref: "origin/feature/single-remote",
          ahead: 0,
          behind: 0,
          isConfiguredUpstream: true,
          remoteRefExists: true
        },
        {
          remote: "upstream",
          ref: "upstream/feature/single-remote",
          ahead: 0,
          behind: 0,
          isConfiguredUpstream: false,
          remoteRefExists: true
        }
      ]
    };
    expect(hasMissingRemoteTracking(branch, remotes)).toBe(false);
  });

  it("returns true when only one remote tracks the branch in a multi-remote repo", () => {
    const branch: BranchInfo = {
      name: "feature/single-remote",
      colorIndex: 0,
      isCurrent: false,
      remotes: [
        {
          remote: "origin",
          ref: "origin/feature/single-remote",
          ahead: 0,
          behind: 0,
          isConfiguredUpstream: true,
          remoteRefExists: true
        }
      ]
    };
    expect(hasMissingRemoteTracking(branch, remotes)).toBe(true);
    expect(hasMissingRemoteTrackingForTarget(branch, remotes, "feature/single-remote")).toBe(true);
  });

  it("returns true when tracking exists without a configured default upstream", () => {
    const branch: BranchInfo = {
      name: "feature/remote-only",
      colorIndex: 0,
      isCurrent: false,
      remotes: [
        {
          remote: "origin",
          ref: "origin/feature/remote-only",
          ahead: 0,
          behind: 0,
          isConfiguredUpstream: false,
          remoteRefExists: true
        }
      ]
    };
    expect(hasMissingRemoteTrackingForTarget(branch, remotes, "feature/remote-only")).toBe(true);
  });
});

describe("addUpstreamRemoteBranchName", () => {
  const branch: BranchInfo = {
    name: "work",
    colorIndex: 0,
    isCurrent: false,
    remotes: [
      {
        remote: "origin",
        ref: "origin/feature/a",
        ahead: 0,
        behind: 0,
        isConfiguredUpstream: true,
        remoteRefExists: true
      }
    ]
  };

  it("uses the local branch name when only the local branch pill is selected", () => {
    expect(addUpstreamRemoteBranchName(branch)).toBe("work");
  });

  it("uses the selected remote row branch name when a tracking ref is selected", () => {
    expect(addUpstreamRemoteBranchName(branch, "origin/feature/a")).toBe("feature/a");
  });
});
