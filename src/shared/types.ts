export interface CommitNode {
  hash: string;
  hashShort: string;
  message: string;
  author: string;
  authorEmail: string;
  date: string;
  branch: string;
  branchIndex: number;
  parents: string[];
  refs: string[];
  tags: string[];
  isMerge: boolean;
}

export interface BranchInfo {
  name: string;
  color: string;
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

export interface RemoteConfig {
  name: string;
  url: string;
  color: string;
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

export type WebviewMessage =
  | { type: "ready" }
  | { type: "webview-log"; level: "debug" | "info" | "warn" | "error"; message: string; details?: unknown }
  | { type: "request-initial-data" }
  | { type: "request-commits"; dateRange: DateRange; page: number; searchText: string }
  | { type: "request-branches" }
  | { type: "request-remotes" }
  | { type: "refresh" }
  | { type: "execute-action"; action: CommitAction; commitHash: string }
  | { type: "execute-branch-action"; action: BranchAction; branchName?: string; remote?: string };

export type ExtHostMessage =
  | { type: "repo-state"; repo: RepositoryState }
  | { type: "commits-data"; commits: CommitNode[]; pagination: PaginationState }
  | { type: "branches-data"; branches: BranchInfo[] }
  | { type: "remotes-data"; remotes: RemoteConfig[] }
  | { type: "loading"; loading: boolean; scope?: "all" | "commits" | "branches" | "remotes" | "action" }
  | { type: "error"; message: string }
  | { type: "action-result"; success: boolean; message: string }
  | { type: "repo-changed" };

export const DEFAULT_DATE_RANGE: DateRange = {
  mode: "preset",
  presetDays: 7
};

export const PAGE_SIZE = 8;
