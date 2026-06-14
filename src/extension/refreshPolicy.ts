import type { WebviewTab } from "../shared/types";

export function shouldReloadBranchHistoryAfterAction(
  actionTab: WebviewTab | undefined,
  currentTab: WebviewTab
): boolean {
  return actionTab === "history" || currentTab === "history";
}
