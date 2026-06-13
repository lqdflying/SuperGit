import { colors } from "../shared/tokens";
import type { BranchInfo } from "../shared/types";

export function branchColor(index: number): string {
  return colors.branch[index % colors.branch.length];
}

export function blockHeight(branch: BranchInfo): number {
  return Math.max(branch.remotes.length, 1) * 32 + 16;
}

export function defaultDate(offsetDays: number): string {
  const date = new Date();
  date.setDate(date.getDate() + offsetDays);
  return date.toISOString().slice(0, 10);
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
