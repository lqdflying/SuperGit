import type { BranchAction, WebviewTab } from "../shared/types";

const REMOTE_DEFAULT_INVALIDATING_ACTIONS = new Set<BranchAction>(["fetch", "prune-stale", "delete-remote"]);

const REF_CHANGING_ACTIONS = new Set<BranchAction>([
  "push",
  "pull",
  "fetch",
  "set-upstream",
  "add-upstream",
  "set-default-upstream",
  "checkout-new-local-branch",
  "delete",
  "delete-remote",
  "prune-stale"
]);

export function shouldInvalidateRemoteDefaultBranches(action: BranchAction): boolean {
  return REMOTE_DEFAULT_INVALIDATING_ACTIONS.has(action);
}

export function shouldEnrichRemoteDefaultsAfterAction(action: BranchAction): boolean {
  return shouldInvalidateRemoteDefaultBranches(action);
}

export function shouldMarkBranchHistoryDirty(action: BranchAction): boolean {
  return REF_CHANGING_ACTIONS.has(action);
}

export function shouldReloadCommitsAfterAction(action: BranchAction): boolean {
  return REF_CHANGING_ACTIONS.has(action);
}

export function shouldReloadBranchHistoryAfterAction(
  actionTab: WebviewTab | undefined,
  currentTab: WebviewTab
): boolean {
  return actionTab === "history" || currentTab === "history";
}
