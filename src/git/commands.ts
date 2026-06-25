import * as path from "node:path";
import type { BranchInfo, CommitFileChange, DateRange, FilesDiffPayload, HistoryScope, RemoteBranchInfo, RemoteConfig, RepositoryState } from "../shared/types";
import { DEFAULT_HISTORY_SCOPE, PAGE_SIZE } from "../shared/types";
import { colors } from "../shared/tokens";
import { getActiveRepository } from "./api";
import { GIT_LOG_FORMAT, parseCommits, parseFilesDiff, parseLocalBranchRows, parseNameStatus, parseRemoteRefs, parseRemotes, parseUpstreamRef, isRemoteHeadRef, findRemoteForRef } from "./parser";
import { clearRemoteDefaultBranchCache, resolveRemoteDefaultBranch } from "./remote-default";
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

export interface InvalidateRemoteDataCachesOptions {
  /** When false, preserve per-remote default-branch cache (safe after local-only branch actions). */
  defaultBranches?: boolean;
}

export interface UpstreamCleanupResult {
  unsetBranches: string[];
  complete: boolean;
}

/** Invalidate remotes list cache and optionally per-remote default-branch cache after fetch/prune or ref changes. */
export function invalidateRemoteDataCaches(cwd?: string, options?: InvalidateRemoteDataCachesOptions): void {
  clearRemotesCache(cwd);
  if (options?.defaultBranches !== false) {
    clearRemoteDefaultBranchCache(cwd);
  }
}

/** Clear upstream on every local branch configured to track one exact remote branch. */
export async function unsetUpstreamLinksForRemoteRef(
  cwd: string,
  remote: string,
  remoteBranch: string
): Promise<UpstreamCleanupResult> {
  const branchResult = await runGit(
    ["for-each-ref", "--format=%(refname:short)%09%(upstream:short)%09%(upstream:remotename)", "refs/heads/"],
    cwd
  );
  if (branchResult.exitCode !== 0) {
    return { unsetBranches: [], complete: false };
  }

  const targetRef = `${remote}/${remoteBranch}`;
  const matchingBranches = parseLocalBranchRows(branchResult.stdout).filter(
    (branch) => branch.upstreamRemote === remote && branch.upstreamRef === targetRef
  );
  const unsetBranches: string[] = [];
  let complete = true;

  for (const branch of matchingBranches) {
    const result = await runGit(["branch", "--unset-upstream", branch.name], cwd, { timeout: 120_000 });
    if (result.exitCode === 0) {
      unsetBranches.push(branch.name);
    } else {
      complete = false;
    }
  }

  return { unsetBranches, complete };
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
        for (const remoteBranchName of remoteBranchNameCandidates(branch.name, branch.upstreamRef, remoteNames)) {
          const ref = `${remote.name}/${remoteBranchName}`;
          if (remoteRefs.has(ref)) {
            candidates.set(ref, {
              remote: remote.name,
              ref,
              isConfiguredUpstream: candidates.get(ref)?.isConfiguredUpstream ?? false
            });
          }
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

export async function resolveDefaultBranch(cwd: string, options: { network?: boolean } = {}): Promise<string> {
  const fromOrigin = await resolveRemoteDefaultBranch(cwd, "origin", { network: options.network === true });
  if (fromOrigin) {
    return fromOrigin;
  }

  for (const candidate of ["main", "master"]) {
    const exists = await runGit(["rev-parse", "--verify", candidate], cwd);
    if (exists.exitCode === 0) {
      return candidate;
    }
  }

  const branches = await getBranches(cwd);
  return branches[0]?.name ?? "main";
}

export async function isBranchMergedInto(cwd: string, branchRef: string, defaultBranch: string): Promise<boolean> {
  const result = await runGit(["merge-base", "--is-ancestor", branchRef, defaultBranch], cwd);
  return result.exitCode === 0;
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

export async function getFilesDiff(cwd: string, leftRef: string, rightRef: string): Promise<FilesDiffPayload> {
  if (leftRef === rightRef) {
    const empty = parseFilesDiff("", "");
    return {
      leftRef,
      rightRef,
      files: empty.files,
      summary: empty.summary
    };
  }

  const [nameStatusResult, numstatResult] = await Promise.all([
    runGit(["diff", "--name-status", "-M", leftRef, rightRef], cwd),
    runGit(["diff", "--numstat", "-M", leftRef, rightRef], cwd)
  ]);

  if (nameStatusResult.exitCode !== 0) {
    throw new Error(formatGitError("git files diff failed", nameStatusResult.stderr, nameStatusResult.timedOut));
  }
  if (numstatResult.exitCode !== 0) {
    throw new Error(formatGitError("git files diff stats failed", numstatResult.stderr, numstatResult.timedOut));
  }

  const parsed = parseFilesDiff(nameStatusResult.stdout, numstatResult.stdout);
  return {
    leftRef,
    rightRef,
    files: parsed.files,
    summary: parsed.summary
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

function remoteBranchNameCandidates(localBranchName: string, upstreamRef: string | undefined, remoteNames: string[]): string[] {
  const candidates = new Set<string>([localBranchName]);
  if (upstreamRef) {
    const parsed = parseUpstreamRef(upstreamRef, remoteNames);
    if (parsed?.branch) {
      candidates.add(parsed.branch);
    }
  }
  return [...candidates];
}

function formatGitError(prefix: string, stderr: string, timedOut: boolean): string {
  if (timedOut) {
    return `${prefix}: command timed out`;
  }
  return stderr.trim() ? `${prefix}: ${stderr.trim()}` : prefix;
}
