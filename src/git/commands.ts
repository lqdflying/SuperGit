import * as path from "node:path";
import type { BranchInfo, CommitFileChange, DateRange, HistoryScope, RemoteBranchInfo, RemoteConfig, RepositoryState } from "../shared/types";
import { DEFAULT_HISTORY_SCOPE, PAGE_SIZE } from "../shared/types";
import { colors } from "../shared/tokens";
import { getActiveRepository } from "./api";
import { GIT_LOG_FORMAT, parseCommits, parseLocalBranchRows, parseNameStatus, parseRemoteRefs, parseRemotes, isRemoteHeadRef, findRemoteForRef } from "./parser";
import { clearRemoteDefaultBranchCache } from "./remote-default";
import { runGit } from "./runner";

export async function getCommits(
  cwd: string,
  dateRange: DateRange,
  page: number,
  pageSize: number = PAGE_SIZE,
  searchText = "",
  scope: HistoryScope = DEFAULT_HISTORY_SCOPE
) {
  const remotes = await getRemotes(cwd);
  const remoteNames = remotes.map((remote) => remote.name);
  const needsClientFilter = searchText.trim().length > 0;
  const args = ["log", "--topo-order", `--format=${GIT_LOG_FORMAT}`];

  addDateArgs(args, dateRange);
  addScopeArgs(args, scope);

  const result = await runGit(args, cwd);
  if (result.exitCode !== 0) {
    throw new Error(formatGitError("git log failed", result.stderr, result.timedOut));
  }

  let commits = parseCommits(result.stdout, remoteNames, getScopeDisplayName(scope));
  if (needsClientFilter) {
    commits = filterCommits(commits, searchText);
  }

  const total = needsClientFilter ? commits.length : await getCommitTotal(cwd, dateRange, scope);
  const paginated = needsClientFilter ? commits.slice(page * pageSize, page * pageSize + pageSize) : commits;

  return {
    commits: paginated,
    total,
    pagination: {
      enabled: needsClientFilter && total > pageSize,
      page,
      pageSize,
      totalItems: total,
      totalPages: Math.max(1, Math.ceil(total / pageSize))
    }
  };
}

const REMOTE_REF_EXCLUDE = "refs/remotes/*/HEAD";

const remotesInflight = new Map<string, Promise<RemoteConfig[]>>();
const remotesCache = new Map<string, RemoteConfig[]>();

export function clearRemotesCache(cwd?: string): void {
  if (!cwd) {
    remotesCache.clear();
    remotesInflight.clear();
    return;
  }
  remotesCache.delete(cwd);
  remotesInflight.delete(cwd);
}

/** Invalidate remotes list cache and per-remote default-branch cache after fetch/prune or ref changes. */
export function invalidateRemoteDataCaches(cwd?: string): void {
  clearRemotesCache(cwd);
  clearRemoteDefaultBranchCache(cwd);
}

/** Clear upstream on local branches whose remote-tracking ref is missing (often after fetch --prune). */
export async function unsetStaleUpstreamLinks(cwd: string, remoteFilter?: string): Promise<string[]> {
  const [branchResult, remoteRefResult, remotes] = await Promise.all([
    runGit(
      ["for-each-ref", "--format=%(refname:short)%09%(upstream:short)%09%(upstream:remotename)", "refs/heads/"],
      cwd
    ),
    runGit(
      ["for-each-ref", "--format=%(refname:short)", "refs/remotes/", `--exclude=${REMOTE_REF_EXCLUDE}`],
      cwd
    ),
    getRemotes(cwd)
  ]);

  if (branchResult.exitCode !== 0 || remoteRefResult.exitCode !== 0) {
    return [];
  }

  const branches = parseLocalBranchRows(branchResult.stdout);
  const remoteNames = remotes.map((remote) => remote.name);
  const remoteRefs = new Set(parseRemoteRefs(remoteRefResult.stdout, remoteNames));
  const unsetBranches: string[] = [];

  for (const branch of branches) {
    if (!branch.upstreamRef) {
      continue;
    }

    const upstreamRemote =
      branch.upstreamRemote || findRemoteForRef(branch.upstreamRef, remoteNames) || branch.upstreamRef.split("/")[0];
    if (remoteFilter && upstreamRemote !== remoteFilter) {
      continue;
    }

    if (remoteRefs.has(branch.upstreamRef)) {
      continue;
    }

    const result = await runGit(["branch", "--unset-upstream", branch.name], cwd, { timeout: 120_000 });
    if (result.exitCode === 0) {
      unsetBranches.push(branch.name);
    }
  }

  return unsetBranches;
}

export async function getBranches(cwd: string): Promise<BranchInfo[]> {
  const [branchResult, remoteRefResult, remotes, currentBranch] = await Promise.all([
    runGit(
      ["for-each-ref", "--format=%(refname:short)%09%(upstream:short)%09%(upstream:remotename)", "refs/heads/"],
      cwd
    ),
    runGit(
      ["for-each-ref", "--format=%(refname:short)", "refs/remotes/", `--exclude=${REMOTE_REF_EXCLUDE}`],
      cwd
    ),
    getRemotes(cwd),
    getCurrentBranch(cwd)
  ]);

  if (branchResult.exitCode !== 0) {
    throw new Error(formatGitError("git branch discovery failed", branchResult.stderr, branchResult.timedOut));
  }

  const branches = parseLocalBranchRows(branchResult.stdout);
  const remoteNames = remotes.map((remote) => remote.name);
  const remoteRefs = new Set(parseRemoteRefs(remoteRefResult.stdout, remoteNames));

  return Promise.all(
    branches.map(async (branch, index): Promise<BranchInfo> => {
      const candidates = new Map<string, { remote: string; ref: string; isConfiguredUpstream: boolean }>();
      if (branch.upstreamRef) {
        const remoteName =
          branch.upstreamRemote || findRemoteForRef(branch.upstreamRef, remoteNames) || branch.upstreamRef.split("/")[0] || "origin";
        candidates.set(branch.upstreamRef, {
          remote: remoteName,
          ref: branch.upstreamRef,
          isConfiguredUpstream: true
        });
      }

      for (const remote of remotes) {
        const ref = `${remote.name}/${branch.name}`;
        if (remoteRefs.has(ref)) {
          candidates.set(ref, {
            remote: remote.name,
            ref,
            isConfiguredUpstream: candidates.get(ref)?.isConfiguredUpstream ?? false
          });
        }
      }

      const tracking = await Promise.all(
        [...candidates.values()].map(async (candidate) => {
          const remoteRefExists = remoteRefs.has(candidate.ref);
          const counts = remoteRefExists ? await getAheadBehind(cwd, branch.name, candidate.ref) : { ahead: 0, behind: 0 };
          return { ...candidate, ...counts, remoteRefExists };
        })
      );

      return {
        name: branch.name,
        colorIndex: index % colors.branch.length,
        isCurrent: branch.name === currentBranch,
        remotes: tracking
      };
    })
  );
}

export async function getRemoteBranches(cwd: string): Promise<RemoteBranchInfo[]> {
  const [remoteRefResult, remotes, localBranchResult] = await Promise.all([
    runGit(
      ["for-each-ref", "--format=%(refname:short)", "refs/remotes/", `--exclude=${REMOTE_REF_EXCLUDE}`],
      cwd
    ),
    getRemotes(cwd),
    runGit(["for-each-ref", "--format=%(refname:short)", "refs/heads/"], cwd)
  ]);

  if (remoteRefResult.exitCode !== 0) {
    return [];
  }

  const localBranches = new Set(parseLocalBranchRows(localBranchResult.exitCode === 0 ? localBranchResult.stdout : "").map((branch) => branch.name));
  const remoteByName = new Map(remotes.map((remote) => [remote.name, remote]));
  const remoteNames = remotes.map((remote) => remote.name);

  return parseRemoteRefs(remoteRefResult.stdout, remoteNames).flatMap((ref): RemoteBranchInfo[] => {
    if (isRemoteHeadRef(ref, remoteNames)) {
      return [];
    }

    const matchedRemoteName = findRemoteForRef(ref, remoteNames);
    const remote = matchedRemoteName ? remoteByName.get(matchedRemoteName) : undefined;
    if (!remote) {
      const fallbackRemote = ref.split("/")[0];
      const branchName = ref.slice(fallbackRemote.length + 1);
      return [
        {
          remote: fallbackRemote,
          branchName,
          ref,
          colorIndex: remoteByName.get(fallbackRemote)?.colorIndex ?? 0,
          localBranchName: localBranches.has(branchName) ? branchName : undefined
        }
      ];
    }

    const branchName = ref.slice(remote.name.length + 1);
    return [
      {
        remote: remote.name,
        branchName,
        ref,
        colorIndex: remote.colorIndex,
        localBranchName: localBranches.has(branchName) ? branchName : undefined
      }
    ];
  });
}

export async function getRemotes(cwd: string): Promise<RemoteConfig[]> {
  const cached = remotesCache.get(cwd);
  if (cached) {
    return cached;
  }

  const pending = remotesInflight.get(cwd);
  if (pending) {
    return pending;
  }

  const lookup = runGit(["remote", "-v"], cwd).then((result) => {
    if (result.exitCode !== 0) {
      return [];
    }
    const remotes = parseRemotes(result.stdout);
    remotesCache.set(cwd, remotes);
    return remotes;
  });
  remotesInflight.set(cwd, lookup);

  try {
    return await lookup;
  } finally {
    remotesInflight.delete(cwd);
  }
}

export async function getAheadBehind(cwd: string, localBranch: string, remoteBranch: string): Promise<{ ahead: number; behind: number }> {
  const result = await runGit(["rev-list", "--left-right", "--count", `${localBranch}...${remoteBranch}`], cwd);
  if (result.exitCode !== 0) {
    return { ahead: 0, behind: 0 };
  }

  const [ahead, behind] = result.stdout.trim().split(/\s+/).map((value) => Number.parseInt(value, 10));
  return {
    ahead: Number.isFinite(ahead) ? ahead : 0,
    behind: Number.isFinite(behind) ? behind : 0
  };
}

export async function getCurrentBranch(cwd: string): Promise<string> {
  const result = await runGit(["branch", "--show-current"], cwd);
  if (result.exitCode === 0 && result.stdout.trim()) {
    return result.stdout.trim();
  }

  const detached = await runGit(["rev-parse", "--short", "HEAD"], cwd);
  return detached.exitCode === 0 ? `DETACHED ${detached.stdout.trim()}` : "DETACHED";
}

export async function getRepositoryState(cwd?: string): Promise<RepositoryState> {
  const activeRepository = await getActiveRepository();
  const root = cwd || activeRepository?.root || null;
  if (!root) {
    return {
      root: null,
      name: "No Git repository",
      currentBranch: "No repository",
      remoteCount: 0,
      commitCount: 0
    };
  }

  const [branch, remotes, commitCount] = await Promise.all([
    getCurrentBranch(root),
    getRemotes(root),
    getCommitTotal(root, { mode: "preset", presetDays: null })
  ]);

  return {
    root,
    name: path.basename(root),
    currentBranch: branch || activeRepository?.currentBranch || "DETACHED",
    currentCommit: activeRepository?.currentCommit,
    remoteCount: remotes.length,
    commitCount
  };
}

export async function getCommitBaseHash(cwd: string, commitHash: string): Promise<string | undefined> {
  const result = await runGit(["rev-list", "--parents", "-n", "1", commitHash], cwd);
  if (result.exitCode !== 0) {
    return undefined;
  }

  const [, firstParent] = result.stdout.trim().split(/\s+/);
  return firstParent;
}

export async function getCommitFileChanges(cwd: string, commitHash: string): Promise<{ baseHash?: string; files: CommitFileChange[] }> {
  const baseHash = await getCommitBaseHash(cwd, commitHash);
  const args = baseHash
    ? ["diff", "--name-status", "-M", baseHash, commitHash]
    : ["diff-tree", "--root", "--no-commit-id", "--name-status", "-r", "-M", commitHash];
  const result = await runGit(args, cwd);
  if (result.exitCode !== 0) {
    throw new Error(formatGitError("git changed-file discovery failed", result.stderr, result.timedOut));
  }

  return {
    baseHash,
    files: parseNameStatus(result.stdout)
  };
}

async function getCommitTotal(cwd: string, dateRange: DateRange, scope: HistoryScope = DEFAULT_HISTORY_SCOPE): Promise<number> {
  const args = ["rev-list", "--count"];
  addDateArgs(args, dateRange);
  addScopeArgs(args, scope);
  const result = await runGit(args, cwd);
  if (result.exitCode !== 0) {
    return 0;
  }
  return Number.parseInt(result.stdout.trim(), 10) || 0;
}

function addScopeArgs(args: string[], scope: HistoryScope): void {
  if (scope.type === "all") {
    args.push("--all");
    return;
  }

  args.push(scope.ref);
}

function getScopeDisplayName(scope: HistoryScope): string | undefined {
  if (scope.type === "all") {
    return undefined;
  }

  return scope.ref;
}

function addDateArgs(args: string[], dateRange: DateRange): void {
  if (dateRange.mode === "preset" && dateRange.presetDays !== null) {
    const since = new Date();
    since.setDate(since.getDate() - dateRange.presetDays);
    args.push(`--after=${since.toISOString()}`);
  }

  if (dateRange.mode === "custom" && dateRange.customFrom && dateRange.customTo) {
    args.push(`--after=${dateRange.customFrom}T00:00:00`);
    args.push(`--before=${dateRange.customTo}T23:59:59`);
  }
}

function filterCommits(commits: Awaited<ReturnType<typeof parseCommits>>, searchText: string) {
  const query = searchText.trim().toLowerCase();
  if (!query) {
    return commits;
  }

  return commits.filter((commit) => {
    const haystack = [
      commit.hash,
      commit.hashShort,
      commit.message,
      commit.author,
      commit.authorEmail,
      commit.branch,
      ...commit.refs,
      ...commit.tags
    ]
      .join(" ")
      .toLowerCase();
    return haystack.includes(query);
  });
}

function formatGitError(prefix: string, stderr: string, timedOut: boolean): string {
  if (timedOut) {
    return `${prefix}: command timed out`;
  }
  return stderr.trim() ? `${prefix}: ${stderr.trim()}` : prefix;
}
