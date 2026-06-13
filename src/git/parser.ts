import type { CommitNode, RemoteConfig } from "../shared/types";
import { colors, graph } from "../shared/tokens";

export const FIELD_SEP = "\x1f";
export const RECORD_SEP = "\x1e";
export const GIT_LOG_FORMAT = "%H%x1f%h%x1f%s%x1f%an%x1f%ae%x1f%aI%x1f%P%x1f%D%x1e";

export interface LocalBranchRow {
  name: string;
  upstreamRef?: string;
  upstreamRemote?: string;
}

export function parseCommits(raw: string, remoteNames: string[] = ["origin", "upstream", "backup"]): CommitNode[] {
  const records = raw
    .split(RECORD_SEP)
    .map((record) => record.trim())
    .filter(Boolean);

  const commits: CommitNode[] = [];
  for (const record of records) {
    const parts = record.split(FIELD_SEP);
    if (parts.length < 8) {
      continue;
    }

    const [hash, hashShort, message, author, authorEmail, date, parentsRaw, refsRaw] = parts;
    const parsedRefs = parseRefs(refsRaw);
    const parents = parentsRaw.trim() ? parentsRaw.trim().split(/\s+/) : [];

    commits.push({
      hash,
      hashShort,
      message,
      author,
      authorEmail,
      date,
      parents,
      refs: parsedRefs.refs,
      tags: parsedRefs.tags,
      branch: "",
      branchIndex: 0,
      isMerge: parents.length > 1
    });
  }

  assignLanes(commits, remoteNames);
  return commits;
}

export function parseRemotes(raw: string): RemoteConfig[] {
  const seen = new Set<string>();
  const remotes: RemoteConfig[] = [];

  for (const line of raw.trim().split(/\r?\n/)) {
    const match = line.match(/^(\S+)\s+(\S+)\s+\(fetch\)$/);
    if (!match || seen.has(match[1])) {
      continue;
    }

    seen.add(match[1]);
    remotes.push({
      name: match[1],
      url: match[2],
      color: colors.remoteColorPool[remotes.length % colors.remoteColorPool.length]
    });
  }

  return remotes;
}

export function parseLocalBranchRows(raw: string): LocalBranchRow[] {
  return raw
    .trim()
    .split(/\r?\n/)
    .map((line) => line.trim())
    .filter(Boolean)
    .map((line) => {
      const [name, upstreamRef, upstreamRemote] = line.split("\t");
      return {
        name,
        upstreamRef: upstreamRef || undefined,
        upstreamRemote: upstreamRemote || undefined
      };
    })
    .filter((branch) => Boolean(branch.name));
}

export function parseRemoteRefs(raw: string): string[] {
  return raw
    .trim()
    .split(/\r?\n/)
    .map((line) => line.trim())
    .filter((line) => line && !line.endsWith("/HEAD"));
}

function parseRefs(raw: string): { refs: string[]; tags: string[] } {
  const refs: string[] = [];
  const tags: string[] = [];

  for (const part of raw.split(",")) {
    const ref = part.trim();
    if (!ref) {
      continue;
    }

    if (ref.startsWith("HEAD -> ")) {
      refs.push("HEAD", ref.replace("HEAD -> ", "").trim());
      continue;
    }

    if (ref.startsWith("tag: ")) {
      tags.push(ref.replace("tag: ", "").trim());
      continue;
    }

    refs.push(ref);
  }

  return {
    refs: [...new Set(refs)],
    tags: [...new Set(tags)]
  };
}

function assignLanes(commits: CommitNode[], remoteNames: string[]): void {
  const branchLane = new Map<string, number>();
  const parentBranch = new Map<string, string>();
  let nextLane = 0;

  for (const commit of commits) {
    const branch = findLocalBranchRef(commit.refs, remoteNames) || parentBranch.get(commit.hash) || "main";
    commit.branch = branch;

    if (!branchLane.has(branch)) {
      branchLane.set(branch, nextLane % graph.visibleLanes);
      nextLane += 1;
    }
    commit.branchIndex = branchLane.get(branch) ?? 0;

    for (const [index, parent] of commit.parents.entries()) {
      if (index === 0 || !parentBranch.has(parent)) {
        parentBranch.set(parent, branch);
      }
    }
  }
}

function findLocalBranchRef(refs: string[], remoteNames: string[]): string | undefined {
  return refs.find((ref) => {
    if (ref === "HEAD") {
      return false;
    }
    return !remoteNames.some((remote) => ref === remote || ref.startsWith(`${remote}/`));
  });
}
