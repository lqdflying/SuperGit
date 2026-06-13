import type {
  BranchHistoryPayload,
  BranchLifecycle,
  DateRange,
  PerRemoteDivergence,
  RemoteMainPosition,
  RemotePosition
} from "../shared/types";
import { detectStatus, generateDescription } from "./branch-status";
import { getBranches, getCurrentBranch, getRemoteBranches, getRemotes } from "./commands";
import { runGit } from "./runner";

const HISTORY_ALL_CAP_DAYS = 90;

export interface HistoryDateWindow {
  start: Date;
  end: Date;
  totalDays: number;
}

interface CommitPoint {
  iso: string;
  hash: string;
  day: number;
}

export function resolveHistoryDateWindow(dateRange: DateRange, now = new Date()): HistoryDateWindow {
  const end = new Date(now);
  end.setHours(23, 59, 59, 999);

  let start: Date;
  if (dateRange.mode === "custom" && dateRange.customFrom && dateRange.customTo) {
    start = new Date(`${dateRange.customFrom}T00:00:00`);
    end.setTime(new Date(`${dateRange.customTo}T23:59:59`).getTime());
  } else if (dateRange.mode === "preset" && dateRange.presetDays !== null) {
    start = new Date(end);
    start.setDate(start.getDate() - dateRange.presetDays);
    start.setHours(0, 0, 0, 0);
  } else {
    start = new Date(end);
    start.setDate(start.getDate() - HISTORY_ALL_CAP_DAYS);
    start.setHours(0, 0, 0, 0);
  }

  const msPerDay = 24 * 60 * 60 * 1000;
  const totalDays = Math.max(1, Math.floor((end.getTime() - start.getTime()) / msPerDay) + 1);
  return { start, end, totalDays };
}

export function dayIndexFromIso(iso: string, window: HistoryDateWindow): number {
  const date = new Date(iso);
  if (Number.isNaN(date.getTime())) {
    return 0;
  }
  const msPerDay = 24 * 60 * 60 * 1000;
  const day = Math.floor((date.getTime() - window.start.getTime()) / msPerDay);
  return Math.max(0, Math.min(window.totalDays - 1, day));
}

export async function resolveDefaultBranch(cwd: string): Promise<string> {
  const symbolic = await runGit(["symbolic-ref", "refs/remotes/origin/HEAD"], cwd);
  if (symbolic.exitCode === 0) {
    const ref = symbolic.stdout.trim();
    const match = ref.match(/^refs\/remotes\/origin\/(.+)$/);
    if (match?.[1]) {
      return match[1];
    }
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

export async function computePerRemoteDivergence(
  cwd: string,
  branchName: string,
  remotes: string[],
  defaultBranch: string
): Promise<PerRemoteDivergence[]> {
  const results: PerRemoteDivergence[] = [];

  for (const remote of remotes) {
    const mainRef = `${remote}/${defaultBranch}`;
    const exists = await runGit(["rev-parse", "--verify", mainRef], cwd);
    if (exists.exitCode !== 0) {
      continue;
    }

    const ab = await runGit(["rev-list", "--left-right", "--count", `${mainRef}...${branchName}`], cwd);
    if (ab.exitCode !== 0) {
      continue;
    }

    const [behindStr] = ab.stdout.trim().split(/\s+/);
    results.push({
      remote,
      behind: Number.parseInt(behindStr, 10) || 0,
      mainRef
    });
  }

  return results;
}

async function getBranchCommitsInRange(cwd: string, ref: string, window: HistoryDateWindow): Promise<CommitPoint[]> {
  const args = [
    "log",
    ref,
    "--format=%aI\t%h",
    `--after=${window.start.toISOString()}`,
    `--before=${window.end.toISOString()}`
  ];
  const result = await runGit(args, cwd);
  if (result.exitCode !== 0) {
    return [];
  }

  return result.stdout
    .split("\n")
    .map((line) => line.trim())
    .filter(Boolean)
    .map((line) => {
      const [iso, hash] = line.split("\t");
      return { iso, hash, day: dayIndexFromIso(iso, window) };
    });
}

async function isMergedInto(cwd: string, branch: string, defaultBranch: string): Promise<boolean> {
  const result = await runGit(["merge-base", "--is-ancestor", branch, defaultBranch], cwd);
  return result.exitCode === 0;
}

async function getAheadBehindVsMain(
  cwd: string,
  branch: string,
  defaultBranch: string
): Promise<{ ahead: number; behind: number }> {
  const result = await runGit(["rev-list", "--left-right", "--count", `${defaultBranch}...${branch}`], cwd);
  if (result.exitCode !== 0) {
    return { ahead: 0, behind: 0 };
  }

  const [behindStr, aheadStr] = result.stdout.trim().split(/\s+/);
  return {
    behind: Number.parseInt(behindStr, 10) || 0,
    ahead: Number.parseInt(aheadStr, 10) || 0
  };
}

async function getMergeBaseInfo(
  cwd: string,
  branch: string,
  defaultBranch: string,
  window: HistoryDateWindow
): Promise<{ hash: string; iso: string; day: number } | null> {
  const base = await runGit(["merge-base", defaultBranch, branch], cwd);
  if (base.exitCode !== 0 || !base.stdout.trim()) {
    return null;
  }

  const hash = base.stdout.trim();
  const log = await runGit(["log", "-1", "--format=%aI", hash], cwd);
  const iso = log.exitCode === 0 ? log.stdout.trim() : "";
  return { hash: hash.slice(0, 7), iso, day: iso ? dayIndexFromIso(iso, window) : 0 };
}

async function getRemotePushPositions(
  cwd: string,
  branchName: string,
  remotes: Awaited<ReturnType<typeof getRemotes>>,
  window: HistoryDateWindow
): Promise<RemotePosition[]> {
  const positions: RemotePosition[] = [];

  for (const remote of remotes) {
    const ref = `${remote.name}/${branchName}`;
    const exists = await runGit(["rev-parse", "--verify", ref], cwd);
    if (exists.exitCode !== 0) {
      continue;
    }

    const hashFull = exists.stdout.trim();
    const log = await runGit(["log", "-1", "--format=%aI\t%h", hashFull], cwd);
    if (log.exitCode !== 0) {
      continue;
    }

    const [iso, hash] = log.stdout.trim().split("\t");
    const count = await runGit(["rev-list", "--count", `${ref}..${branchName}`], cwd);
    const behindLocal = count.exitCode === 0 ? Number.parseInt(count.stdout.trim(), 10) || 0 : 0;

    positions.push({
      name: remote.name,
      colorIndex: remote.colorIndex,
      pushDay: dayIndexFromIso(iso, window),
      pushDate: iso,
      hash: hash ?? hashFull.slice(0, 7),
      behindLocal
    });
  }

  return positions;
}

function daysSince(iso: string, now = new Date()): number {
  const date = new Date(iso);
  if (Number.isNaN(date.getTime())) {
    return 0;
  }
  return Math.max(0, Math.floor((now.getTime() - date.getTime()) / (24 * 60 * 60 * 1000)));
}

async function buildLocalLifecycle(
  cwd: string,
  branch: Awaited<ReturnType<typeof getBranches>>[number],
  defaultBranch: string,
  remotes: Awaited<ReturnType<typeof getRemotes>>,
  window: HistoryDateWindow,
  defaultCommits: CommitPoint[]
): Promise<BranchLifecycle> {
  const commits = await getBranchCommitsInRange(cwd, branch.name, window);
  const merged = branch.name !== defaultBranch ? await isMergedInto(cwd, branch.name, defaultBranch) : false;
  const ab = branch.name === defaultBranch ? { ahead: 0, behind: 0 } : await getAheadBehindVsMain(cwd, branch.name, defaultBranch);
  const lca = branch.name === defaultBranch ? null : await getMergeBaseInfo(cwd, branch.name, defaultBranch, window);
  const remotePositions = await getRemotePushPositions(cwd, branch.name, remotes, window);
  const divergePerRemote =
    branch.name === defaultBranch
      ? undefined
      : await computePerRemoteDivergence(
          cwd,
          branch.name,
          remotes.map((remote) => remote.name),
          defaultBranch
        );

  const lastCommit = commits[commits.length - 1];
  const firstCommit = commits[0];
  const lastActivityIso = lastCommit?.iso ?? new Date().toISOString();
  const statusResult = detectStatus({
    isMergedIntoMain: merged,
    daysSinceActivity: daysSince(lastActivityIso),
    aheadOfMain: ab.ahead,
    behindMain: ab.behind
  });

  const endDay = lastCommit?.day ?? window.totalDays - 1;
  const startDay = firstCommit?.day ?? (lca?.day ?? endDay);
  const forkedFrom =
    branch.name !== defaultBranch && lca
      ? { branch: defaultBranch, day: lca.day, date: lca.iso }
      : null;

  const lifecycle: BranchLifecycle = {
    name: branch.name,
    colorIndex: branch.colorIndex,
    isCurrent: branch.isCurrent,
    status: statusResult.status,
    severity: statusResult.severity,
    stale: statusResult.stale,
    startDay,
    endDay,
    commitDays: commits.map((commit) => commit.day),
    totalCommits: commits.length,
    startDate: firstCommit?.iso ?? lca?.iso ?? lastActivityIso,
    endDate: lastActivityIso,
    commitDates: commits.map((commit) => commit.iso),
    hashStart: firstCommit?.hash ?? lca?.hash ?? "",
    hashEnd: lastCommit?.hash ?? "",
    hashLca: lca?.hash,
    forkedFrom,
    mergedInto: merged && lastCommit ? { branch: defaultBranch, day: endDay, date: lastActivityIso } : null,
    aheadOfMain: ab.ahead,
    behindMain: ab.behind,
    lastCommonAncestorDay: lca?.day ?? (branch.name === defaultBranch ? endDay : startDay),
    lastCommonAncestorDate: lca?.iso,
    remotes: remotePositions,
    divergePerRemote,
    description: ""
  };

  lifecycle.description = generateDescription(lifecycle, defaultBranch);
  if (branch.name === defaultBranch && defaultCommits.length > 0) {
    lifecycle.commitDays = defaultCommits.map((commit) => commit.day);
    lifecycle.commitDates = defaultCommits.map((commit) => commit.iso);
    lifecycle.totalCommits = defaultCommits.length;
    lifecycle.hashStart = defaultCommits[0]?.hash ?? lifecycle.hashStart;
    lifecycle.hashEnd = defaultCommits[defaultCommits.length - 1]?.hash ?? lifecycle.hashEnd;
    lifecycle.startDay = defaultCommits[0]?.day ?? lifecycle.startDay;
    lifecycle.endDay = defaultCommits[defaultCommits.length - 1]?.day ?? lifecycle.endDay;
    lifecycle.startDate = defaultCommits[0]?.iso ?? lifecycle.startDate;
    lifecycle.endDate = defaultCommits[defaultCommits.length - 1]?.iso ?? lifecycle.endDate;
  }

  return lifecycle;
}

async function buildRemoteOnlyLifecycle(
  cwd: string,
  remoteBranch: Awaited<ReturnType<typeof getRemoteBranches>>[number],
  defaultBranch: string,
  window: HistoryDateWindow
): Promise<BranchLifecycle> {
  const commits = await getBranchCommitsInRange(cwd, remoteBranch.ref, window);
  const lastCommit = commits[commits.length - 1];
  const firstCommit = commits[0];
  const lastActivityIso = lastCommit?.iso ?? new Date().toISOString();

  const log = await runGit(["log", "-1", "--format=%aI\t%h", remoteBranch.ref], cwd);
  const [iso, hash] = log.exitCode === 0 ? log.stdout.trim().split("\t") : [lastActivityIso, lastCommit?.hash ?? ""];

  const lifecycle: BranchLifecycle = {
    name: remoteBranch.branchName,
    colorIndex: remoteBranch.colorIndex,
    isCurrent: false,
    remoteOnly: true,
    remote: remoteBranch.remote,
    status: "remote-only",
    stale: false,
    startDay: firstCommit?.day ?? dayIndexFromIso(iso, window),
    endDay: lastCommit?.day ?? dayIndexFromIso(iso, window),
    commitDays: commits.map((commit) => commit.day),
    totalCommits: commits.length,
    startDate: firstCommit?.iso ?? iso,
    endDate: lastCommit?.iso ?? iso,
    commitDates: commits.map((commit) => commit.iso),
    hashStart: firstCommit?.hash ?? hash?.slice(0, 7) ?? "",
    hashEnd: lastCommit?.hash ?? hash?.slice(0, 7) ?? "",
    forkedFrom: null,
    mergedInto: null,
    aheadOfMain: 0,
    behindMain: 0,
    lastCommonAncestorDay: firstCommit?.day ?? 0,
    remotes: [
      {
        name: remoteBranch.remote,
        colorIndex: remoteBranch.colorIndex,
        pushDay: dayIndexFromIso(iso, window),
        pushDate: iso,
        hash: hash?.slice(0, 7) ?? "",
        behindLocal: 0
      }
    ],
    description: ""
  };

  lifecycle.description = generateDescription(lifecycle, defaultBranch);
  return lifecycle;
}

export async function getBranchLifecycles(cwd: string, dateRange: DateRange): Promise<BranchHistoryPayload> {
  const window = resolveHistoryDateWindow(dateRange);
  const [branches, remoteBranches, remotes, defaultBranch] = await Promise.all([
    getBranches(cwd),
    getRemoteBranches(cwd),
    getRemotes(cwd),
    resolveDefaultBranch(cwd)
  ]);

  const defaultCommits = await getBranchCommitsInRange(cwd, defaultBranch, window);

  const remoteMains: RemoteMainPosition[] = await Promise.all(
    remotes.map(async (remote) => {
      const ref = `${remote.name}/${defaultBranch}`;
      const exists = await runGit(["rev-parse", "--verify", ref], cwd);
      if (exists.exitCode !== 0) {
        return null;
      }

      const commits = await getBranchCommitsInRange(cwd, ref, window);
      const last = commits[commits.length - 1];
      return {
        name: remote.name,
        colorIndex: remote.colorIndex,
        lastDay: last?.day ?? 0,
        lastDate: last?.iso ?? "",
        hash: last?.hash ?? "",
        commits: commits.map((commit) => commit.day)
      } satisfies RemoteMainPosition;
    })
  ).then((entries) => entries.filter((entry): entry is RemoteMainPosition => entry !== null));

  const localLifecycles = await Promise.all(
    branches.map((branch) => buildLocalLifecycle(cwd, branch, defaultBranch, remotes, window, defaultCommits))
  );

  const remoteOnlyBranches = remoteBranches.filter((remoteBranch) => !remoteBranch.localBranchName);
  const remoteOnlyLifecycles = await Promise.all(
    remoteOnlyBranches.map((remoteBranch) => buildRemoteOnlyLifecycle(cwd, remoteBranch, defaultBranch, window))
  );

  return {
    lifecycles: [...localLifecycles, ...remoteOnlyLifecycles],
    defaultBranch,
    remoteMains,
    window: {
      totalDays: window.totalDays,
      startDate: window.start.toISOString(),
      endDate: window.end.toISOString()
    }
  };
}

export function sortBranchLifecycles(lifecycles: BranchLifecycle[], defaultBranch: string): BranchLifecycle[] {
  const severityOrder = { severe: 0, high: 1, mild: 2 };
  const statusOrder = { diverged: 0, active: 1, "remote-only": 2, merged: 3 };

  return [...lifecycles].sort((a, b) => {
    if (a.name === defaultBranch) {
      return -1;
    }
    if (b.name === defaultBranch) {
      return 1;
    }

    const statusDiff = (statusOrder[a.status] ?? 0) - (statusOrder[b.status] ?? 0);
    if (statusDiff !== 0) {
      return statusDiff;
    }

    if (a.status === "diverged" && b.status === "diverged") {
      const sevA = a.severity ? severityOrder[a.severity] : 99;
      const sevB = b.severity ? severityOrder[b.severity] : 99;
      if (sevA !== sevB) {
        return sevA - sevB;
      }
    }

    if (a.status === "remote-only" && b.status === "remote-only") {
      const remoteCmp = (a.remote ?? "").localeCompare(b.remote ?? "");
      if (remoteCmp !== 0) {
        return remoteCmp;
      }
      return a.name.localeCompare(b.name);
    }

    if (a.status === "merged" && b.status === "merged") {
      return b.endDay - a.endDay;
    }

    return b.startDay - a.startDay;
  });
}
