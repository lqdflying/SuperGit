import type { BranchInfo, CommitNode, FilesDiffRef, RemoteBranchInfo, RemoteConfig, RemoteTracking } from "../shared/types";
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

export function remoteBranchNameFromRef(ref: string, remote: string): string {
  const prefix = `${remote}/`;
  if (ref.startsWith(prefix)) {
    return ref.slice(prefix.length);
  }
  const slash = ref.indexOf("/");
  return slash >= 0 ? ref.slice(slash + 1) : ref;
}

/** Local branch name plus configured-upstream remote branch name (for multi-remote tracking targets). */
export function remoteBranchNameTargets(branch: BranchInfo): string[] {
  const names = new Set<string>([branch.name]);
  const configured = branch.remotes.find((tracking) => tracking.isConfiguredUpstream);
  if (configured) {
    names.add(remoteBranchNameFromRef(configured.ref, configured.remote));
  }
  return [...names];
}

export function hasMissingRemoteTrackingForTarget(
  branch: BranchInfo,
  remotes: RemoteConfig[],
  remoteBranchName: string
): boolean {
  if (remotes.length <= 1) {
    return false;
  }
  const trackedRefs = new Set(branch.remotes.filter((tracking) => tracking.remoteRefExists).map((tracking) => tracking.ref));
  return remotes.some((remote) => !trackedRefs.has(`${remote.name}/${remoteBranchName}`));
}

/** @deprecated Prefer hasMissingRemoteTrackingForTarget with the selected add-upstream target. */
export function hasMissingRemoteTracking(branch: BranchInfo, remotes: RemoteConfig[]): boolean {
  if (remotes.length <= 1) {
    return false;
  }
  return remoteBranchNameTargets(branch).some((target) => hasMissingRemoteTrackingForTarget(branch, remotes, target));
}

export function addUpstreamRemoteBranchName(branch: BranchInfo | undefined, selectedTrackingRef?: string): string | undefined {
  if (!branch) {
    return undefined;
  }
  if (selectedTrackingRef) {
    const selected = branch.remotes.find((tracking) => tracking.ref === selectedTrackingRef);
    if (selected) {
      return remoteBranchNameFromRef(selected.ref, selected.remote);
    }
  }
  return branch.name;
}

export function resolveSelectedTracking(branch: BranchInfo | undefined, selectedTrackingRef?: string): RemoteTracking | undefined {
  if (!branch) {
    return undefined;
  }
  if (selectedTrackingRef) {
    return branch.remotes.find((tracking) => tracking.ref === selectedTrackingRef);
  }
  return branch.remotes.find((tracking) => tracking.isConfiguredUpstream) ?? branch.remotes[0];
}

export function resolveActionRemote(branch: BranchInfo | undefined, selectedTrackingRef?: string): string | undefined {
  const tracking = resolveSelectedTracking(branch, selectedTrackingRef);
  return tracking?.remote;
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

export function buildFilesDiffRefs(
  branches: BranchInfo[],
  remoteBranches: RemoteBranchInfo[],
  remotes: RemoteConfig[]
): FilesDiffRef[] {
  const refs: FilesDiffRef[] = [];
  const seen = new Set<string>();
  for (const branch of branches) {
    if (seen.has(branch.name)) {
      continue;
    }
    seen.add(branch.name);
    const configuredComparison =
      branch.remotes.find((tracking) => tracking.isConfiguredUpstream && tracking.remoteRefExists)?.defaultComparison ??
      branch.remotes.find((tracking) => tracking.remoteRefExists)?.defaultComparison;
    refs.push({
      kind: "local",
      ref: branch.name,
      label: branch.name,
      branchName: branch.name,
      colorIndex: branch.colorIndex,
      isCurrent: branch.isCurrent,
      defaultComparison: configuredComparison
    });
  }

  const remoteByName = new Map(remotes.map((remote) => [remote.name, remote]));
  for (const remoteBranch of remoteBranches) {
    if (seen.has(remoteBranch.ref)) {
      continue;
    }
    seen.add(remoteBranch.ref);
    const remote = remoteByName.get(remoteBranch.remote);
    refs.push({
      kind: "remote",
      ref: remoteBranch.ref,
      label: remoteBranch.ref,
      branchName: remoteBranch.branchName,
      remote: remoteBranch.remote,
      colorIndex: remoteBranch.colorIndex,
      isDefault: remote?.defaultBranch === remoteBranch.branchName,
      defaultComparison: remoteBranch.defaultComparison
    });
  }

  return refs;
}

export function resolveFilesDiffDefaults(
  branches: BranchInfo[],
  remoteBranches: RemoteBranchInfo[],
  remotes: RemoteConfig[],
  currentBranch: string,
  defaultBranch: string
): { leftRef: string; rightRef: string } {
  const refs = buildFilesDiffRefs(branches, remoteBranches, remotes);
  const localRefs = refs.filter((ref) => ref.kind === "local");
  const left =
    localRefs.find((ref) => ref.isCurrent) ??
    localRefs.find((ref) => ref.ref === currentBranch) ??
    localRefs[0] ??
    refs[0];
  const leftRef = left?.ref ?? "";
  const leftBranch = branches.find((branch) => branch.name === leftRef);

  const configuredUpstream = leftBranch?.remotes.find((tracking) => tracking.isConfiguredUpstream && tracking.remoteRefExists);
  const configuredRef = configuredUpstream && refs.some((ref) => ref.ref === configuredUpstream.ref) ? configuredUpstream.ref : undefined;
  const remoteDefaultRef = findRemoteDefaultRef(refs, remotes, defaultBranch);
  const fallback = refs.find((ref) => ref.ref !== leftRef)?.ref ?? "";
  const candidate = configuredRef ?? remoteDefaultRef ?? fallback;
  const rightRef = candidate && candidate !== leftRef ? candidate : fallback;

  return { leftRef, rightRef };
}

function findRemoteDefaultRef(refs: FilesDiffRef[], remotes: RemoteConfig[], defaultBranch: string): string | undefined {
  for (const remote of remotes) {
    const branchName = remote.defaultBranch ?? defaultBranch;
    const ref = refs.find((candidate) => candidate.kind === "remote" && candidate.remote === remote.name && candidate.branchName === branchName);
    if (ref) {
      return ref.ref;
    }
  }
  return refs.find((ref) => ref.kind === "remote" && ref.branchName === defaultBranch)?.ref;
}
