import { describe, expect, it } from "vitest";
import { buildTrackingRows } from "../../webview/utils";
import type { BranchInfo, RemoteBranchInfo } from "../../shared/types";

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
