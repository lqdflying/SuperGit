import type { BranchInfo, RemoteBranchInfo } from "../shared/types";
import type { ThemeColors } from "../shared/themeColors";

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
