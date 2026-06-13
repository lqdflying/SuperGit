import type { BranchDivergenceSeverity, BranchLifecycle, BranchLifecycleStatus } from "../shared/types";

export const STALE_THRESHOLD_DAYS = 7;

export interface RawBranchStatusInput {
  isMergedIntoMain: boolean;
  daysSinceActivity: number;
  aheadOfMain: number;
  behindMain: number;
}

export function detectStatus(branch: RawBranchStatusInput): {
  status: BranchLifecycleStatus;
  severity?: BranchDivergenceSeverity;
  stale: boolean;
} {
  if (branch.isMergedIntoMain) {
    return { status: "merged", stale: false };
  }

  const stale = branch.daysSinceActivity > STALE_THRESHOLD_DAYS;

  if (branch.aheadOfMain > 0 && branch.behindMain > 0) {
    let severity: BranchDivergenceSeverity;
    if (branch.behindMain <= 5) {
      severity = "mild";
    } else if (branch.behindMain <= 12) {
      severity = "high";
    } else {
      severity = "severe";
    }
    return { status: "diverged", severity, stale };
  }

  return { status: "active", stale };
}

export function generateDescription(lifecycle: BranchLifecycle, defaultBranch: string): string {
  if (lifecycle.remoteOnly) {
    return `Remote branch only on ${lifecycle.remote ?? "remote"}. No local branch exists.`;
  }

  if (lifecycle.status === "merged") {
    return `Merged into ${defaultBranch}.`;
  }

  const parts: string[] = [];

  const unpushed = lifecycle.remotes.filter((remote) => remote.behindLocal > 0);
  if (unpushed.length > 0) {
    const summary = unpushed.map((remote) => `${remote.behindLocal} unpushed to ${remote.name}`).join(", ");
    parts.push(summary);
  }

  if (lifecycle.aheadOfMain > 0) {
    parts.push(`${lifecycle.aheadOfMain} ahead of local ${defaultBranch}`);
  }
  if (lifecycle.behindMain > 0) {
    parts.push(`${lifecycle.behindMain} behind local ${defaultBranch}`);
  }

  if (lifecycle.divergePerRemote && lifecycle.divergePerRemote.length > 0) {
    const remoteParts = lifecycle.divergePerRemote
      .filter((entry) => entry.behind > 0)
      .map((entry) => `${entry.behind} behind ${entry.mainRef}`);
    if (remoteParts.length > 0) {
      parts.push(remoteParts.join(", "));
    }
  }

  if (lifecycle.stale) {
    parts.push("no recent activity");
  }

  if (parts.length === 0) {
    return lifecycle.name === defaultBranch
      ? `Primary ${defaultBranch} branch.`
      : `In sync with ${defaultBranch}.`;
  }

  return parts.join(". ") + ".";
}
