import { describe, expect, it } from "vitest";
import { FIELD_SEP, RECORD_SEP, isRemoteHeadRef, parseCommits } from "../../git/parser";
import { assignSwimlanes, getActiveLaneCount } from "../../git/swimlanes";
import type { CommitNode } from "../../shared/types";

const commitRecord = (parts: string[]) => `${parts.join(FIELD_SEP)}${RECORD_SEP}`;

function buildChain(records: string[]): CommitNode[] {
  return parseCommits(records.join(""));
}

describe("assignSwimlanes", () => {
  it("TC-SG01: linear main-only history stays on lane 0", () => {
    const raw = [
      commitRecord(["c3", "c3", "third", "dev", "d@e", "2026-06-13T00:00:00Z", "c2", "main"]),
      commitRecord(["c2", "c2", "second", "dev", "d@e", "2026-06-12T00:00:00Z", "c1", "main"]),
      commitRecord(["c1", "c1", "first", "dev", "d@e", "2026-06-11T00:00:00Z", "", "main"])
    ];

    const commits = buildChain(raw);
    expect(commits.every((commit) => commit.swimlaneIndex === 0)).toBe(true);
    expect(commits[0].parentSwimlanes).toEqual([0]);
    expect(commits[1].parentSwimlanes).toEqual([0]);
  });

  it("TC-SG02: merge with origin/feature on side lane and arc parent indices", () => {
    const raw = [
      commitRecord([
        "merge",
        "merge",
        "Merge pull request #37",
        "dev",
        "d@e",
        "2026-06-13T00:00:00Z",
        "mainParent featureParent",
        "main, origin/main"
      ]),
      commitRecord(["mainParent", "mainP", "main commit", "dev", "d@e", "2026-06-12T00:00:00Z", "mainBase", "main"]),
      commitRecord([
        "featureParent",
        "featP",
        "feat(oci_vm_create): add TierLevel tag validation",
        "dev",
        "d@e",
        "2026-06-11T00:00:00Z",
        "featureTip",
        "origin/feature/oci-tierlevel-tag-rules"
      ]),
      commitRecord(["featureTip", "tip", "feature work", "dev", "d@e", "2026-06-10T00:00:00Z", "", "origin/feature/oci-tierlevel-tag-rules"])
    ];

    const commits = buildChain(raw);
    expect(commits[0].isMerge).toBe(true);
    expect(commits[0].swimlaneIndex).toBe(0);
    expect(commits[0].parentSwimlanes).toEqual([0, 1]);
    expect(commits[1].swimlaneIndex).toBe(0);
    expect(commits[2].swimlaneIndex).toBe(1);
    expect(commits[3].swimlaneIndex).toBe(1);
    expect(commits[2].branch).toBe("feature/oci-tierlevel-tag-rules");
  });

  it("TC-SG03: two merges reuse side lanes without exceeding main lane", () => {
    const raw = [
      commitRecord(["merge2", "m2", "Merge feature B", "dev", "d@e", "2026-06-14T00:00:00Z", "main2 featB", "main"]),
      commitRecord(["main2", "m2p", "main after B", "dev", "d@e", "2026-06-13T00:00:00Z", "merge1", "main"]),
      commitRecord(["featB", "fb", "feature B tip", "dev", "d@e", "2026-06-12T00:00:00Z", "", "feature/b"]),
      commitRecord(["merge1", "m1", "Merge feature A", "dev", "d@e", "2026-06-11T00:00:00Z", "main1 featA", "main"]),
      commitRecord(["main1", "m1p", "main after A", "dev", "d@e", "2026-06-10T00:00:00Z", "", "main"]),
      commitRecord(["featA", "fa", "feature A tip", "dev", "d@e", "2026-06-09T00:00:00Z", "", "feature/a"])
    ];

    const commits = buildChain(raw);
    expect(commits[0].parentSwimlanes).toEqual([0, 1]);
    expect(commits[3].parentSwimlanes).toEqual([0, 1]);
    expect(commits[2].swimlaneIndex).toBe(1);
    expect(commits.filter((commit) => commit.swimlaneIndex === 0).length).toBeGreaterThan(0);
  });

  it("TC-SG04: remote-only ref labels branch without forcing side-lane topology", () => {
    const raw = commitRecord([
      "hash",
      "short",
      "remote-only tip",
      "author",
      "email",
      "2026-06-10T00:00:00Z",
      "parent",
      "origin/feature/oci-tierlevel-tag-rules"
    ]);

    const commits = parseCommits(raw, ["origin", "pil"]);
    expect(commits[0].branch).toBe("feature/oci-tierlevel-tag-rules");
    expect(commits[0].swimlaneIndex).toBe(0);
    expect(commits[0].branchIndex).toBe(0);
  });

  it("TC-SG05: origin/HEAD is excluded from lane branch selection", () => {
    expect(isRemoteHeadRef("origin/HEAD")).toBe(true);

    const raw = commitRecord([
      "hash",
      "short",
      "message",
      "author",
      "email",
      "2026-06-10T00:00:00Z",
      "parent",
      "origin/HEAD, origin/feature/x"
    ]);

    const commits = parseCommits(raw, ["origin"]);
    expect(commits[0].refs).not.toContain("origin/HEAD");
    expect(commits[0].branch).toBe("feature/x");
    expect(commits[0].swimlaneIndex).toBe(0);
  });

  it("TC-SG06: shared featureBase stays on main lane after merged-back fork", () => {
    const raw = [
      commitRecord(["merge", "merge", "Merge feature", "dev", "d@e", "2026-06-13T00:00:00Z", "mainParent featureTip", "main"]),
      commitRecord(["mainParent", "mainP", "main line", "dev", "d@e", "2026-06-12T00:00:00Z", "featureBase", "main"]),
      commitRecord(["featureTip", "feat", "feature tip", "dev", "d@e", "2026-06-11T00:00:00Z", "featureBase", "feature/x"]),
      commitRecord(["featureBase", "base", "shared fork", "dev", "d@e", "2026-06-10T00:00:00Z", "", "main"])
    ];

    const commits = buildChain(raw);
    const featureBase = commits.find((commit) => commit.hash === "featureBase");
    expect(featureBase?.swimlaneIndex).toBe(0);
    expect(commits[2].parentSwimlanes).toEqual([0]);
    expect(commits[1].swimlaneIndex).toBe(0);
    expect(commits[2].swimlaneIndex).toBe(1);
    expect(commits[2].outputSwimlanes?.map((lane) => lane.id)).toEqual(["featureBase"]);
  });

  it("does not cap lane count below active swimlanes for octopus merges", () => {
    const parents = ["main", "p1", "p2", "p3", "p4", "p5", "p6"];
    const commits: CommitNode[] = [
      {
        hash: "octopus",
        hashShort: "oct",
        message: "Octopus merge",
        author: "dev",
        authorEmail: "d@e",
        date: "2026-06-13T00:00:00Z",
        parents,
        refs: ["main"],
        tags: [],
        branch: "",
        branchIndex: 0,
        swimlaneIndex: 0,
        isMerge: true
      }
    ];

    assignSwimlanes(commits);
    expect(commits[0].outputSwimlanes?.length).toBe(7);
    expect(commits[0].swimlaneIndex).toBe(0);
    expect(getActiveLaneCount(commits)).toBe(7);
  });

  it("propagates merge parents into side lanes without refs", () => {
    const commits: CommitNode[] = [
      {
        hash: "merge",
        hashShort: "merge",
        message: "Merge",
        author: "dev",
        authorEmail: "d@e",
        date: "2026-06-13T00:00:00Z",
        parents: ["mainP", "featP"],
        refs: ["main"],
        tags: [],
        branch: "",
        branchIndex: 0,
        swimlaneIndex: 0,
        isMerge: true
      },
      {
        hash: "mainP",
        hashShort: "mainP",
        message: "main",
        author: "dev",
        authorEmail: "d@e",
        date: "2026-06-12T00:00:00Z",
        parents: [],
        refs: ["main"],
        tags: [],
        branch: "",
        branchIndex: 0,
        swimlaneIndex: 0,
        isMerge: false
      },
      {
        hash: "featP",
        hashShort: "featP",
        message: "feature",
        author: "dev",
        authorEmail: "d@e",
        date: "2026-06-11T00:00:00Z",
        parents: [],
        refs: [],
        tags: [],
        branch: "",
        branchIndex: 0,
        swimlaneIndex: 0,
        isMerge: false
      }
    ];

    assignSwimlanes(commits);
    expect(commits[0].parentSwimlanes).toEqual([0, 1]);
    expect(commits[2].inputSwimlanes?.findIndex((lane) => lane.id === "featP")).toBe(0);
  });
});
