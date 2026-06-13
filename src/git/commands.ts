import * as path from "node:path";
import type { BranchInfo, DateRange, RemoteConfig, RepositoryState } from "../shared/types";
import { PAGE_SIZE } from "../shared/types";
import { colors } from "../shared/tokens";
import { getActiveRepository } from "./api";
import { GIT_LOG_FORMAT, parseCommits, parseLocalBranchRows, parseRemoteRefs, parseRemotes } from "./parser";
import { runGit } from "./runner";

export async function getCommits(
  cwd: string,
  dateRange: DateRange,
  page: number,
  pageSize: number = PAGE_SIZE,
  searchText = ""
) {
  const remotes = await getRemotes(cwd);
  const remoteNames = remotes.map((remote) => remote.name);
  const needsClientFilter = searchText.trim().length > 0;
  const allMode = dateRange.mode === "preset" && dateRange.presetDays === null;
  const shouldPaginate = needsClientFilter || allMode;
  const args = ["log", "--all", "--date-order", `--format=${GIT_LOG_FORMAT}`];

  addDateArgs(args, dateRange);

  if (!needsClientFilter && allMode) {
    args.push(`--skip=${page * pageSize}`, "-n", `${pageSize}`);
  }

  const result = await runGit(args, cwd);
  if (result.exitCode !== 0) {
    throw new Error(formatGitError("git log failed", result.stderr, result.timedOut));
  }

  let commits = parseCommits(result.stdout, remoteNames);
  if (needsClientFilter) {
    commits = filterCommits(commits, searchText);
  }

  const total = needsClientFilter ? commits.length : await getCommitTotal(cwd, dateRange);
  const paginated = needsClientFilter ? commits.slice(page * pageSize, page * pageSize + pageSize) : commits;

  return {
    commits: paginated,
    total,
    pagination: {
      enabled: shouldPaginate && total > pageSize,
      page,
      pageSize,
      totalItems: total,
      totalPages: Math.max(1, Math.ceil(total / pageSize))
    }
  };
}

export async function getBranches(cwd: string): Promise<BranchInfo[]> {
  const [branchResult, remoteRefResult, remotes, currentBranch] = await Promise.all([
    runGit(
      ["for-each-ref", "--format=%(refname:short)%09%(upstream:short)%09%(upstream:remotename)", "refs/heads/"],
      cwd
    ),
    runGit(["for-each-ref", "--format=%(refname:short)", "refs/remotes/"],
      cwd),
    getRemotes(cwd),
    getCurrentBranch(cwd)
  ]);

  if (branchResult.exitCode !== 0) {
    throw new Error(formatGitError("git branch discovery failed", branchResult.stderr, branchResult.timedOut));
  }

  const branches = parseLocalBranchRows(branchResult.stdout);
  const remoteRefs = new Set(parseRemoteRefs(remoteRefResult.stdout));

  return Promise.all(
    branches.map(async (branch, index): Promise<BranchInfo> => {
      const candidates = new Map<string, { remote: string; ref: string; isConfiguredUpstream: boolean }>();
      if (branch.upstreamRef) {
        const remoteName = branch.upstreamRemote || branch.upstreamRef.split("/")[0] || "origin";
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
          const counts = await getAheadBehind(cwd, branch.name, candidate.ref);
          return { ...candidate, ...counts };
        })
      );

      return {
        name: branch.name,
        color: colors.branch[index % colors.branch.length],
        isCurrent: branch.name === currentBranch,
        remotes: tracking
      };
    })
  );
}

export async function getRemotes(cwd: string): Promise<RemoteConfig[]> {
  const result = await runGit(["remote", "-v"], cwd);
  if (result.exitCode !== 0) {
    return [];
  }
  return parseRemotes(result.stdout);
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

async function getCommitTotal(cwd: string, dateRange: DateRange): Promise<number> {
  const args = ["rev-list", "--all", "--count"];
  addDateArgs(args, dateRange);
  const result = await runGit(args, cwd);
  if (result.exitCode !== 0) {
    return 0;
  }
  return Number.parseInt(result.stdout.trim(), 10) || 0;
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
