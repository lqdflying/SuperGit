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
  /** False when upstream is configured but no matching refs/remotes/* ref exists locally (often not on remote). */
  remoteRefExists: boolean;
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
  /** Default branch on this remote (from remote HEAD), when known. */
  defaultBranch?: string;
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

export type FilesDiffRefKind = "local" | "remote";

export interface FilesDiffRef {
  kind: FilesDiffRefKind;
  ref: string;
  label: string;
  branchName: string;
  remote?: string;
  colorIndex: number;
  isCurrent?: boolean;
  isDefault?: boolean;
}

export interface FilesDiffFileChange extends CommitFileChange {
  additions: number | null;
  deletions: number | null;
  binary: boolean;
}

export interface FilesDiffStatusTotals {
  added: number;
  modified: number;
  deleted: number;
  renamed: number;
  copied: number;
  typechange: number;
  unmerged: number;
  unknown: number;
}

export interface FilesDiffSummary {
  files: number;
  additions: number;
  deletions: number;
  binaryFiles: number;
  statuses: FilesDiffStatusTotals;
}

export interface FilesDiffPayload {
  leftRef: string;
  rightRef: string;
  files: FilesDiffFileChange[];
  summary: FilesDiffSummary;
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
  | "add-upstream"
  | "set-default-upstream"
  | "checkout-new-local-branch"
  | "delete"
  | "delete-remote"
  | "prune-stale";

export type WebviewTab = "graph" | "branches" | "files";

export type WebviewMessage =
  | { type: "ready" }
  | { type: "webview-log"; level: "debug" | "info" | "warn" | "error"; message: string; details?: unknown }
  | { type: "request-initial-data" }
  | { type: "request-commits"; dateRange: DateRange; page: number; searchText: string; scope: HistoryScope }
  | { type: "request-branches" }
  | { type: "request-remotes" }
  | { type: "request-commit-details"; commitHash: string }
  | { type: "request-files-diff"; leftRef: string; rightRef: string }
  | { type: "open-commit-file-diff"; commitHash: string; file: CommitFileChange }
  | { type: "open-files-diff-file"; leftRef: string; rightRef: string; file: FilesDiffFileChange }
  | { type: "refresh" }
  | { type: "tab-changed"; tab: WebviewTab }
  | { type: "execute-action"; action: CommitAction; commitHash: string }
  | { type: "execute-branch-action"; action: BranchAction; branchName?: string; remote?: string; remoteBranchName?: string; activeTab?: WebviewTab };

export type ExtHostMessage =
  | { type: "repo-state"; repo: RepositoryState }
  | { type: "commits-data"; commits: CommitNode[]; pagination: PaginationState }
  | { type: "branches-data"; branches: BranchInfo[]; remoteBranches: RemoteBranchInfo[]; defaultBranch: string }
  | { type: "remotes-data"; remotes: RemoteConfig[] }
  | { type: "commit-details-data"; commitHash: string; baseHash?: string; files: CommitFileChange[] }
  | { type: "files-diff-data"; diff: FilesDiffPayload }
  | { type: "loading"; loading: boolean; scope?: "all" | "commits" | "branches" | "remotes" | "files-diff" | "commit-details" | "action" }
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
