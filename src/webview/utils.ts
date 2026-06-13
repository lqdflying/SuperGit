import type { BranchInfo, BranchLifecycle, BranchLifecycleStatus, CommitNode, RemoteBranchInfo } from "../shared/types";
import { graph } from "../shared/tokens";
import type { ThemeColors } from "../shared/themeColors";

export function getActiveLaneCount(commits: CommitNode[]): number {
  if (commits.length === 0) {
    return 1;
  }

  let maxLane = 1;
  for (const commit of commits) {
    maxLane = Math.max(
      maxLane,
      commit.inputSwimlanes?.length ?? 0,
      commit.outputSwimlanes?.length ?? 0,
      commit.swimlaneIndex + 1
    );
  }

  return maxLane;
}

/** Graph SVG + column width from active swimlane count (matches GraphCanvas sizing). */
export function graphColumnWidth(laneCount: number): number {
  const laneWidth = laneCount * graph.laneWidth + 14;
  const minColumnWidth = 80;
  return Math.max(minColumnWidth, laneWidth);
}

export function branchColor(index: number, theme: ThemeColors): string {
  return theme.branch[index % theme.branch.length];
}

export function remoteColor(index: number, theme: ThemeColors): string {
  return theme.remote[index % theme.remote.length];
}

export function blockHeight(branch: BranchInfo): number {
  return Math.max(branch.remotes.length, 1) * 36 + 12;
}

export function remoteOnlyBlockHeight(): number {
  return 36 + 12;
}

export type TrackingRow =
  | { kind: "local"; branch: BranchInfo }
  | { kind: "remote-only"; remoteBranch: RemoteBranchInfo };

export function buildTrackingRows(branches: BranchInfo[], remoteBranches: RemoteBranchInfo[]): TrackingRow[] {
  const rows: TrackingRow[] = branches.map((branch) => ({ kind: "local", branch }));
  for (const remoteBranch of remoteBranches) {
    if (!remoteBranch.localBranchName) {
      rows.push({ kind: "remote-only", remoteBranch });
    }
  }
  return rows;
}

export function trackingRowHeight(row: TrackingRow): number {
  return row.kind === "local" ? blockHeight(row.branch) : remoteOnlyBlockHeight();
}

export function defaultDate(offsetDays: number): string {
  const date = new Date();
  date.setDate(date.getDate() + offsetDays);
  return date.toISOString().slice(0, 10);
}

export function formatRelativeTime(value: string): string {
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) {
    return value;
  }

  const seconds = Math.max(0, Math.floor((Date.now() - date.getTime()) / 1000));
  if (seconds < 3600) {
    return `${Math.floor(seconds / 60)}m ago`;
  }
  const hours = Math.floor(seconds / 3600);
  if (hours < 24) {
    return `${hours}h ago`;
  }
  const days = Math.floor(seconds / 86400);
  if (days < 7) {
    return `${days}d ago`;
  }
  return date.toISOString().slice(5, 10);
}

export function formatShortDate(value: string): string {
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) {
    return value;
  }

  const month = String(date.getMonth() + 1).padStart(2, "0");
  const day = String(date.getDate()).padStart(2, "0");
  const hours = String(date.getHours()).padStart(2, "0");
  const minutes = String(date.getMinutes()).padStart(2, "0");
  return `${month}/${day} ${hours}:${minutes}`;
}

export function formatFullDate(value: string): string {
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) {
    return value;
  }
  return date.toLocaleString(undefined, { year: "numeric", month: "2-digit", day: "2-digit", hour: "2-digit", minute: "2-digit" });
}

export function formatRelativeFetched(value?: string): string {
  if (!value) {
    return "Last fetched: never";
  }

  const date = new Date(value);
  if (Number.isNaN(date.getTime())) {
    return `Last fetched: ${value}`;
  }

  const seconds = Math.max(0, Math.round((Date.now() - date.getTime()) / 1000));
  if (seconds < 60) {
    return "Last fetched: just now";
  }
  const minutes = Math.round(seconds / 60);
  if (minutes < 60) {
    return `Last fetched: ${minutes} min ago`;
  }
  const hours = Math.round(minutes / 60);
  if (hours < 24) {
    return `Last fetched: ${hours} hr ago`;
  }
  return `Last fetched: ${date.toLocaleDateString()}`;
}

export function sortBranchLifecycles(lifecycles: BranchLifecycle[], defaultBranch: string): BranchLifecycle[] {
  const severityOrder = { severe: 0, high: 1, mild: 2 };
  const statusOrder: Record<BranchLifecycleStatus, number> = { diverged: 0, active: 1, "remote-only": 2, merged: 3 };

  return [...lifecycles].sort((a, b) => {
    if (a.name === defaultBranch) {
      return -1;
    }
    if (b.name === defaultBranch) {
      return 1;
    }

    const statusDiff = statusOrder[a.status] - statusOrder[b.status];
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

export function formatHistoryDayLabel(value: string): string {
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) {
    return value;
  }
  return `${date.toLocaleString("en", { month: "short" })} ${date.getDate()}`;
}
