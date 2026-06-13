import { describe, expect, it } from "vitest";
import { FIELD_SEP, RECORD_SEP, isRemoteHeadRef, parseCommits, parseLocalBranchRows, parseNameStatus, parseRemoteRefs, parseRemotes } from "../../git/parser";

const commitRecord = (parts: string[]) => `${parts.join(FIELD_SEP)}${RECORD_SEP}`;

describe("parseCommits", () => {
  it("parses a single normal commit", () => {
    const raw = commitRecord([
      "a1b2c3d4e5f6a7b8c9d0e1f2a3b4c5d6e7f8a9b0",
      "a1b2c3d",
      "fix: resolve db timeout",
      "liuqd",
      "liuqd@example.com",
      "2026-06-13T14:22:00+08:00",
      "e5f6a7b8c9d0e1f2a3b4c5d6e7f8a9b0a1b2c3d4",
      "HEAD -> hotfix/db-timeout"
    ]);

    const commits = parseCommits(raw);
    expect(commits).toHaveLength(1);
    expect(commits[0].hashShort).toBe("a1b2c3d");
    expect(commits[0].message).toBe("fix: resolve db timeout");
    expect(commits[0].refs).toContain("hotfix/db-timeout");
    expect(commits[0].refs).toContain("HEAD");
    expect(commits[0].isMerge).toBe(false);
  });

  it("parses merge commits, refs, and tags", () => {
    const raw = commitRecord([
      "b7c8d9e0f1a2b3c4d5e6f7a8b9c0d1e2f3a4b5c6",
      "b7c8d9e",
      "Merge pull request #142 from release/v2.3",
      "liuqd",
      "liuqd@example.com",
      "2026-06-11T09:00:00+08:00",
      "parent1 parent2",
      "main, origin/main, tag: v2.3.0"
    ]);

    const commits = parseCommits(raw);
    expect(commits[0].isMerge).toBe(true);
    expect(commits[0].parents).toEqual(["parent1", "parent2"]);
    expect(commits[0].refs).toContain("main");
    expect(commits[0].refs).toContain("origin/main");
    expect(commits[0].tags).toContain("v2.3.0");
  });

  it("preserves plain HEAD for detached checkout badge", () => {
    const raw = commitRecord([
      "hash",
      "short",
      "detached work",
      "author",
      "email",
      "2026-06-10T00:00:00Z",
      "parent",
      "HEAD"
    ]);

    const commits = parseCommits(raw);
    expect(commits[0].refs).toEqual(["HEAD"]);
  });

  it("drops custom remote HEAD decorations when remote names are provided", () => {
    const raw = commitRecord([
      "hash",
      "short",
      "message",
      "author",
      "email",
      "2026-06-10T00:00:00Z",
      "parent",
      "HEAD -> pil/HEAD, pil/HEAD, pil/main"
    ]);

    const commits = parseCommits(raw, ["origin", "pil"]);
    expect(commits[0].refs).toEqual(["HEAD", "pil/main"]);
    expect(commits[0].branch).toBe("main");
  });

  it("drops remote HEAD decorations from commit refs", () => {
    const raw = commitRecord([
      "hash",
      "short",
      "message",
      "author",
      "email",
      "2026-06-10T00:00:00Z",
      "parent",
      "HEAD -> origin/main, origin/HEAD, origin/main"
    ]);

    const commits = parseCommits(raw);
    expect(commits[0].refs).toEqual(["HEAD", "origin/main"]);
  });

  it("handles commits with no refs or tags", () => {
    const raw = commitRecord(["hash", "short", "message", "author", "email", "2026-06-10T00:00:00Z", "parent", ""]);
    const commits = parseCommits(raw);
    expect(commits[0].refs).toHaveLength(0);
    expect(commits[0].tags).toHaveLength(0);
  });

  it("handles empty input", () => {
    expect(parseCommits("")).toEqual([]);
  });

  it("handles malformed records gracefully", () => {
    expect(parseCommits(`not${FIELD_SEP}enough${RECORD_SEP}`)).toEqual([]);
  });

  it("keeps branch labels separate from lane topology for unlinked commits", () => {
    const raw = [
      commitRecord(["aaa", "aaa", "msg1", "a", "a@e", "2026-06-13T00:00:00Z", "", "main"]),
      commitRecord(["bbb", "bbb", "msg2", "b", "b@e", "2026-06-12T00:00:00Z", "", "feature/x"]),
      commitRecord(["ccc", "ccc", "msg3", "c", "c@e", "2026-06-11T00:00:00Z", "", "main"])
    ].join("");

    const commits = parseCommits(raw);
    expect(commits[0].branch).toBe("main");
    expect(commits[1].branch).toBe("feature/x");
    expect(commits.every((commit) => commit.branchIndex === 0)).toBe(true);
  });

  it("assigns merge parents to distinct lanes when parent-linked", () => {
    const raw = [
      commitRecord(["merge", "merge", "Merge feature", "dev", "d@e", "2026-06-13T00:00:00Z", "mainParent featureParent", "main"]),
      commitRecord(["mainParent", "mainP", "main commit", "dev", "d@e", "2026-06-12T00:00:00Z", "base", "main"]),
      commitRecord(["featureParent", "featP", "feature commit", "dev", "d@e", "2026-06-11T00:00:00Z", "base", "feature/x"]),
      commitRecord(["base", "base", "fork", "dev", "d@e", "2026-06-10T00:00:00Z", "", "main"])
    ].join("");

    const commits = parseCommits(raw);
    expect(commits[0].isMerge).toBe(true);
    expect(commits[0].parentSwimlanes).toEqual([0, 1]);
    expect(commits[2].swimlaneIndex).toBe(1);
    expect(commits[3].swimlaneIndex).toBe(0);
  });

  it("assigns remote tracking refs to side lanes for merged branches", () => {
    const raw = [
      commitRecord([
        "merge",
        "merge",
        "Merge pull request #37",
        "dev",
        "d@e",
        "2026-06-13T00:00:00Z",
        "mainParent featureParent",
        "main, pil/main, origin/main"
      ]),
      commitRecord(["mainParent", "mainP", "main commit", "dev", "d@e", "2026-06-12T00:00:00Z", "featureBase", "main"]),
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
      commitRecord(["featureTip", "tip", "feature work", "dev", "d@e", "2026-06-10T00:00:00Z", "featureBase", "origin/feature/oci-tierlevel-tag-rules"]),
      commitRecord(["featureBase", "base", "fork", "dev", "d@e", "2026-06-09T00:00:00Z", "", "main"])
    ].join("");

    const commits = parseCommits(raw, ["origin", "pil"]);
    expect(commits[2].branch).toBe("feature/oci-tierlevel-tag-rules");
    expect(commits[2].swimlaneIndex).toBe(1);
    expect(commits[0].swimlaneIndex).toBe(0);
  });

  it("skips remote HEAD decorations when picking a lane branch", () => {
    const raw = commitRecord([
      "hash",
      "short",
      "message",
      "author",
      "email",
      "2026-06-10T00:00:00Z",
      "parent",
      "origin/HEAD, origin/feature/oci-tierlevel-tag-rules"
    ]);

    const commits = parseCommits(raw, ["origin", "pil"]);
    expect(commits[0].branch).toBe("feature/oci-tierlevel-tag-rules");
    expect(commits[0].branchIndex).toBe(0);
  });

  it("prefers a local branch ref over remote tracking refs for lane assignment", () => {
    const raw = commitRecord([
      "hash",
      "short",
      "message",
      "author",
      "email",
      "2026-06-10T00:00:00Z",
      "parent",
      "feature/x, origin/feature/x"
    ]);

    const commits = parseCommits(raw, ["origin"]);
    expect(commits[0].branch).toBe("feature/x");
  });

  it("inherits a side lane for merge parents without branch decorations", () => {
    const raw = [
      commitRecord(["merge", "merge", "Merge PR", "dev", "d@e", "2026-06-13T00:00:00Z", "mainParent featureParent", "main"]),
      commitRecord(["mainParent", "mainP", "main commit", "dev", "d@e", "2026-06-12T00:00:00Z", "base", "main"]),
      commitRecord(["featureParent", "featP", "orphan feature commit", "dev", "d@e", "2026-06-11T00:00:00Z", "", ""]),
      commitRecord(["base", "base", "fork", "dev", "d@e", "2026-06-10T00:00:00Z", "", "main"])
    ].join("");

    const commits = parseCommits(raw);
    expect(commits[2].swimlaneIndex).toBe(1);
  });
});

describe("parseNameStatus", () => {
  it("parses modified, added, deleted, and renamed files", () => {
    expect(parseNameStatus("M\tsrc/app.ts\nA\tsrc/new.ts\nD\tsrc/old.ts\nR100\tsrc/old-name.ts\tsrc/new-name.ts\n")).toEqual([
      { path: "src/app.ts", status: "modified", rawStatus: "M" },
      { path: "src/new.ts", status: "added", rawStatus: "A" },
      { path: "src/old.ts", status: "deleted", rawStatus: "D" },
      { oldPath: "src/old-name.ts", path: "src/new-name.ts", status: "renamed", rawStatus: "R100" }
    ]);
  });
});

describe("parseRemotes", () => {
  it("parses and deduplicates standard remote output", () => {
    const remotes = parseRemotes(
      [
        "origin\tgit@github.com:org/repo.git (fetch)",
        "origin\tgit@github.com:org/repo.git (push)",
        "upstream\thttps://github.com/upstream/repo.git (fetch)"
      ].join("\n")
    );

    expect(remotes).toHaveLength(2);
    expect(remotes[0].name).toBe("origin");
    expect(remotes[1].name).toBe("upstream");
    expect(remotes[0].colorIndex).not.toBe(remotes[1].colorIndex);
  });

  it("handles empty remote output", () => {
    expect(parseRemotes("")).toEqual([]);
  });
});

describe("branch ref parsers", () => {
  it("parses local branch rows", () => {
    expect(parseLocalBranchRows("main\torigin/main\torigin\nfeature/x\t\t")).toEqual([
      { name: "main", upstreamRef: "origin/main", upstreamRemote: "origin" },
      { name: "feature/x", upstreamRef: undefined, upstreamRemote: undefined }
    ]);
  });

  it("filters remote HEAD refs", () => {
    expect(parseRemoteRefs("origin/HEAD\norigin/main\nupstream/main", ["origin", "upstream"])).toEqual(["origin/main", "upstream/main"]);
    expect(parseRemoteRefs("HEAD\npil/HEAD\norigin/feature/x", ["origin", "pil"])).toEqual(["origin/feature/x"]);
    expect(parseRemoteRefs("foo/bar/HEAD\nfoo/bar/main", ["foo/bar"])).toEqual(["foo/bar/main"]);
  });

  it("identifies remote symbolic HEAD refs", () => {
    expect(isRemoteHeadRef("origin/HEAD")).toBe(true);
    expect(isRemoteHeadRef("upstream/HEAD")).toBe(true);
    expect(isRemoteHeadRef("HEAD")).toBe(false);
    expect(isRemoteHeadRef("origin/main")).toBe(false);
    expect(isRemoteHeadRef("origin/feature/x")).toBe(false);
    expect(isRemoteHeadRef("feature/HEAD")).toBe(false);
    expect(isRemoteHeadRef("origin/feature/HEAD")).toBe(false);
    expect(isRemoteHeadRef("foo/bar/HEAD", ["foo/bar"])).toBe(true);
  });

  it("keeps branch names ending in HEAD when not symbolic remote HEAD", () => {
    const raw = commitRecord([
      "hash",
      "short",
      "message",
      "author",
      "email",
      "2026-06-10T00:00:00Z",
      "parent",
      "feature/HEAD, origin/feature/HEAD"
    ]);

    const commits = parseCommits(raw, ["origin"]);
    expect(commits[0].refs).toEqual(["feature/HEAD", "origin/feature/HEAD"]);
  });
});
