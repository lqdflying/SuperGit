import { describe, expect, it } from "vitest";
import { FIELD_SEP, RECORD_SEP, parseCommits, parseLocalBranchRows, parseNameStatus, parseRemoteRefs, parseRemotes } from "../../git/parser";

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
    expect(commits[0].refs).toContain("HEAD");
    expect(commits[0].refs).toContain("hotfix/db-timeout");
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

  it("assigns stable lane indices by branch", () => {
    const raw = [
      commitRecord(["aaa", "aaa", "msg1", "a", "a@e", "2026-06-13T00:00:00Z", "", "main"]),
      commitRecord(["bbb", "bbb", "msg2", "b", "b@e", "2026-06-12T00:00:00Z", "", "feature/x"]),
      commitRecord(["ccc", "ccc", "msg3", "c", "c@e", "2026-06-11T00:00:00Z", "", "main"])
    ].join("");

    const commits = parseCommits(raw);
    expect(commits[0].branchIndex).toBe(0);
    expect(commits[1].branchIndex).toBe(1);
    expect(commits[2].branchIndex).toBe(0);
  });

  it("cycles lanes after visible lane count", () => {
    const raw = ["a", "b", "c", "d", "e", "f", "g"]
      .map((branch, index) => commitRecord([`hash${index}`, `h${index}`, "msg", "dev", "d@e", "2026-06-13T00:00:00Z", "", branch]))
      .join("");

    const commits = parseCommits(raw);
    expect(commits[6].branchIndex).toBe(0);
  });

  it("assigns merge parents to distinct lanes when visible", () => {
    const raw = [
      commitRecord(["merge", "merge", "Merge feature", "dev", "d@e", "2026-06-13T00:00:00Z", "mainParent featureParent", "main"]),
      commitRecord(["mainParent", "mainP", "main commit", "dev", "d@e", "2026-06-12T00:00:00Z", "", "main"]),
      commitRecord(["featureParent", "featP", "feature commit", "dev", "d@e", "2026-06-11T00:00:00Z", "", "feature/x"])
    ].join("");

    const commits = parseCommits(raw);
    expect(commits[0].isMerge).toBe(true);
    expect(commits[0].branchIndex).toBe(commits[1].branchIndex);
    expect(commits[2].branchIndex).not.toBe(commits[0].branchIndex);
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
    expect(remotes[0].color).not.toBe(remotes[1].color);
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
    expect(parseRemoteRefs("origin/HEAD\norigin/main\nupstream/main")).toEqual(["origin/main", "upstream/main"]);
  });
});
