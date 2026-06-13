export interface SwimlaneNode {
  id: string;
  colorIndex: number;
}

export interface CommitNode {
  hash: string;
  hashShort: string;
  message: string;
  author: string;
  authorEmail: string;
  date: string;
  branch: string;
  branchIndex: number;
  swimlaneIndex: number;
  inputSwimlanes?: SwimlaneNode[];
  outputSwimlanes?: SwimlaneNode[];
  parentSwimlanes?: number[];
  parents: string[];
  refs: string[];
  tags: string[];
  isMerge: boolean;
}

export type HistoryScope =
  | { type: "all" }
  | { type: "local"; ref: string; branchName: string }
  | { type: "remote"; ref: string; remote: string; branchName: string };

export interface BranchInfo {
  name: string;
  colorIndex: number;
  isCurrent: boolean;
  remotes: RemoteTracking[];
}

export interface RemoteTracking {
  remote: string;
  ref: string;
  ahead: number;
  behind: number;
  isConfiguredUpstream: boolean;
}

export interface RemoteBranchInfo {
  remote: string;
  branchName: string;
  ref: string;
  colorIndex: number;
  localBranchName?: string;
}

export interface RemoteConfig {
  name: string;
  url: string;
  colorIndex: number;
}

export interface DateRange {
  mode: "preset" | "custom";
  presetDays: 7 | 14 | 30 | null;
  customFrom?: string;
  customTo?: string;
}

export interface PaginationState {
  enabled: boolean;
  page: number;
  pageSize: number;
  totalItems: number;
  totalPages: number;
}

export interface RepositoryState {
  root: string | null;
  name: string;
  currentBranch: string;
  currentCommit?: string;
  remoteCount: number;
  commitCount: number;
  lastFetched?: string;
}

export type CommitFileStatus =
  | "added"
  | "modified"
  | "deleted"
  | "renamed"
  | "copied"
  | "typechange"
  | "unmerged"
  | "unknown";

export interface CommitFileChange {
  path: string;
  oldPath?: string;
  status: CommitFileStatus;
  rawStatus: string;
}

export type CommitAction =
  | "checkout"
  | "cherry-pick"
  | "revert"
  | "create-branch"
  | "create-tag"
  | "copy-hash";

export type BranchAction =
  | "push"
  | "pull"
  | "fetch"
  | "set-upstream"
  | "delete"
  | "prune-stale";

export type BranchLifecycleStatus = "active" | "diverged" | "merged" | "remote-only";

export type BranchDivergenceSeverity = "mild" | "high" | "severe";

export interface BranchLifecycle {
  name: string;
  colorIndex: number;
  isCurrent: boolean;
  remoteOnly?: boolean;
  remote?: string;
  status: BranchLifecycleStatus;
  severity?: BranchDivergenceSeverity;
  stale: boolean;
  startDay: number;
  endDay: number;
  commitDays: number[];
  totalCommits: number;
  startDate: string;
  endDate: string;
  commitDates: string[];
  hashStart: string;
  hashEnd: string;
  hashLca?: string;
  forkedFrom: { branch: string; day: number; date: string } | null;
  mergedInto: { branch: string; day: number; date: string } | null;
  aheadOfMain: number;
  behindMain: number;
  lastCommonAncestorDay: number;
  lastCommonAncestorDate?: string;
  remotes: RemotePosition[];
  divergePerRemote?: PerRemoteDivergence[];
  description: string;
}

export interface RemotePosition {
  name: string;
  colorIndex: number;
  pushDay: number;
  pushDate: string;
  hash: string;
  behindLocal: number;
}

export interface PerRemoteDivergence {
  remote: string;
  behind: number;
  mainRef: string;
}

export interface RemoteMainPosition {
  name: string;
  colorIndex: number;
  lastDay: number;
  lastDate: string;
  hash: string;
  commits: number[];
}

export interface BranchHistoryPayload {
  lifecycles: BranchLifecycle[];
  defaultBranch: string;
  remoteMains: RemoteMainPosition[];
  window: BranchHistoryWindow;
}

export interface BranchHistoryWindow {
  totalDays: number;
  startDate: string;
  endDate: string;
}

export type WebviewMessage =
  | { type: "ready" }
  | { type: "webview-log"; level: "debug" | "info" | "warn" | "error"; message: string; details?: unknown }
  | { type: "request-initial-data" }
  | { type: "request-commits"; dateRange: DateRange; page: number; searchText: string; scope: HistoryScope }
  | { type: "request-branches" }
  | { type: "request-remotes" }
  | { type: "request-branch-history"; dateRange: DateRange }
  | { type: "request-commit-details"; commitHash: string }
  | { type: "open-commit-file-diff"; commitHash: string; file: CommitFileChange }
  | { type: "refresh" }
  | { type: "execute-action"; action: CommitAction; commitHash: string }
  | { type: "execute-branch-action"; action: BranchAction; branchName?: string; remote?: string };

export type ExtHostMessage =
  | { type: "repo-state"; repo: RepositoryState }
  | { type: "commits-data"; commits: CommitNode[]; pagination: PaginationState }
  | { type: "branches-data"; branches: BranchInfo[]; remoteBranches: RemoteBranchInfo[] }
  | { type: "remotes-data"; remotes: RemoteConfig[] }
  | { type: "branch-history-data"; lifecycles: BranchLifecycle[]; defaultBranch: string; remoteMains: RemoteMainPosition[]; window: BranchHistoryWindow }
  | { type: "commit-details-data"; commitHash: string; baseHash?: string; files: CommitFileChange[] }
  | { type: "loading"; loading: boolean; scope?: "all" | "commits" | "branches" | "remotes" | "branch-history" | "commit-details" | "action" }
  | { type: "error"; message: string }
  | { type: "action-result"; success: boolean; message: string }
  | { type: "repo-changed" }
  | { type: "theme-changed" };

export const DEFAULT_DATE_RANGE: DateRange = {
  mode: "preset",
  presetDays: 7
};

export const DEFAULT_HISTORY_SCOPE: HistoryScope = {
  type: "all"
};

export const PAGE_SIZE = 8;
