import type { CommitFileChange, CommitFileStatus, CommitNode, RemoteConfig } from "../shared/types";
import { colors, graph } from "../shared/tokens";

export const FIELD_SEP = "\x1f";
export const RECORD_SEP = "\x1e";
export const GIT_LOG_FORMAT = "%H%x1f%h%x1f%s%x1f%an%x1f%ae%x1f%aI%x1f%P%x1f%D%x1e";

export interface LocalBranchRow {
  name: string;
  upstreamRef?: string;
  upstreamRemote?: string;
}

export function parseCommits(raw: string, remoteNames: string[] = ["origin", "upstream", "backup"], defaultBranch?: string): CommitNode[] {
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

  assignLanes(commits, remoteNames, defaultBranch);
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

export function parseNameStatus(raw: string): CommitFileChange[] {
  return raw
    .trim()
    .split(/\r?\n/)
    .map((line) => line.trim())
    .filter(Boolean)
    .map((line) => {
      const [rawStatus = "", firstPath = "", secondPath] = line.split("\t");
      const status = mapFileStatus(rawStatus);
      if ((status === "renamed" || status === "copied") && secondPath) {
        return {
          oldPath: firstPath,
          path: secondPath,
          status,
          rawStatus
        };
      }

      return {
        path: firstPath,
        status,
        rawStatus
      };
    })
    .filter((file) => Boolean(file.path));
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

function findMainBranchName(commits: CommitNode[], defaultBranch: string): string {
  for (const commit of commits) {
    for (const ref of commit.refs) {
      if (ref === "main" || ref === "master") {
        return ref;
      }
    }
  }
  return defaultBranch === "master" || defaultBranch === "main" ? defaultBranch : "main";
}

function assignLanes(commits: CommitNode[], remoteNames: string[], defaultBranch = "main"): void {
  const mainBranch = findMainBranchName(commits, defaultBranch);
  const branchLane = new Map<string, number>();
  const parentBranch = new Map<string, { display: string; laneKey: string }>();
  branchLane.set(mainBranch, 0);
  let nextLane = 1;

  for (const commit of commits) {
    const inherited = parentBranch.get(commit.hash);
    const branchRef = findLocalBranchRef(commit.refs, remoteNames);
    const branch = branchRef || inherited?.display || mainBranch;
    const laneKey = branchRef || inherited?.laneKey || branch;
    commit.branch = branch;

    if (!branchLane.has(laneKey)) {
      let lane: number;
      if (branch === mainBranch || laneKey === mainBranch) {
        lane = 0;
      } else {
        const sideLanes = graph.maxLanes - 1;
        lane = 1 + ((nextLane - 1) % sideLanes);
        nextLane += 1;
      }
      branchLane.set(laneKey, lane);
    }
    commit.branchIndex = branchLane.get(laneKey) ?? 0;

    for (const [index, parent] of commit.parents.entries()) {
      if (index === 0) {
        parentBranch.set(parent, { display: branch, laneKey });
      } else if (!parentBranch.has(parent)) {
        parentBranch.set(parent, {
          display: branch,
          laneKey: `${laneKey}:merge-${index}:${parent}`
        });
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

function mapFileStatus(rawStatus: string): CommitFileStatus {
  switch (rawStatus.charAt(0)) {
    case "A":
      return "added";
    case "M":
      return "modified";
    case "D":
      return "deleted";
    case "R":
      return "renamed";
    case "C":
      return "copied";
    case "T":
      return "typechange";
    case "U":
      return "unmerged";
    default:
      return "unknown";
  }
}
