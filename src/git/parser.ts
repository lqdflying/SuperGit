import type { CommitFileChange, CommitFileStatus, CommitNode, RemoteConfig } from "../shared/types";
import { colors } from "../shared/tokens";
import { assignSwimlanes } from "./swimlanes";

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
    const parsedRefs = parseRefs(refsRaw, remoteNames);
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
      swimlaneIndex: 0,
      isMerge: parents.length > 1
    });
  }

  assignSwimlanes(commits, remoteNames, defaultBranch);
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
      colorIndex: remotes.length % colors.remoteColorPool.length
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

const DEFAULT_REMOTE_NAMES = ["origin", "upstream", "backup"];

/** True only for symbolic remote HEAD refs like `origin/HEAD`, not branches named `feature/HEAD`. */
export function isRemoteHeadRef(ref: string, remoteNames: string[] = DEFAULT_REMOTE_NAMES): boolean {
  const trimmed = ref.trim();
  if (!trimmed || trimmed === "HEAD") {
    return false;
  }

  return remoteNames.some((remote) => trimmed === `${remote}/HEAD`);
}

function isRemoteRefSymbolicHead(ref: string): boolean {
  const parts = ref.split("/");
  return parts.length === 2 && parts[1] === "HEAD";
}

export function parseRemoteRefs(raw: string, remoteNames: string[] = DEFAULT_REMOTE_NAMES): string[] {
  return raw
    .trim()
    .split(/\r?\n/)
    .map((line) => line.trim())
    .filter((line) => {
      if (!line || line === "HEAD") {
        return false;
      }
      if (isRemoteHeadRef(line, remoteNames)) {
        return false;
      }
      // Fallback when caller did not pass slash-containing remote names yet.
      return remoteNames.length > 0 || !isRemoteRefSymbolicHead(line);
    });
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

function parseRefs(raw: string, remoteNames: string[]): { refs: string[]; tags: string[] } {
  const refs: string[] = [];
  const tags: string[] = [];

  for (const part of raw.split(",")) {
    const ref = part.trim();
    if (!ref) {
      continue;
    }

    if (ref.startsWith("HEAD -> ")) {
      const target = ref.replace("HEAD -> ", "").trim();
      refs.push("HEAD");
      if (!isRemoteHeadRef(target, remoteNames)) {
        refs.push(target);
      }
      continue;
    }

    if (isRemoteHeadRef(ref, remoteNames)) {
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

export function findMainBranchName(commits: CommitNode[], defaultBranch: string): string {
  for (const commit of commits) {
    for (const ref of commit.refs) {
      if (ref === "main" || ref === "master") {
        return ref;
      }
    }
  }
  return defaultBranch === "master" || defaultBranch === "main" ? defaultBranch : "main";
}

export function findBranchRefForLane(refs: string[], remoteNames: string[]): string | undefined {
  for (const ref of refs) {
    if (ref === "HEAD" || isRemoteHeadRef(ref, remoteNames)) {
      continue;
    }

    const isRemote = remoteNames.some((remote) => ref === remote || ref.startsWith(`${remote}/`));
    if (!isRemote) {
      return ref;
    }
  }

  for (const ref of refs) {
    if (isRemoteHeadRef(ref, remoteNames)) {
      continue;
    }

    const remote = remoteNames.find((name) => ref.startsWith(`${name}/`));
    if (!remote) {
      continue;
    }

    const branchName = ref.slice(remote.length + 1);
    if (branchName) {
      return branchName;
    }
  }

  return undefined;
}

function findLocalBranchRef(refs: string[], remoteNames: string[]): string | undefined {
  return findBranchRefForLane(refs, remoteNames);
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
