import { useCallback, useEffect, useMemo, useRef, useState, type PointerEvent as ReactPointerEvent } from "react";
import {
  DEFAULT_DATE_RANGE,
  DEFAULT_HISTORY_SCOPE,
  PAGE_SIZE,
  type BranchAction,
  type BranchInfo,
  type CommitAction,
  type CommitFileChange,
  type CommitNode,
  type DateRange,
  type ExtHostMessage,
  type FilesDiffFileChange,
  type FilesDiffPayload,
  type HistoryScope,
  type PaginationState,
  type RemoteBranchInfo,
  type RemoteConfig,
  type RepositoryState,
  type WebviewTab
} from "../shared/types";
import { TitleBar } from "./components/TitleBar";
import { TabButton } from "./components/TabBar";
import { StatusBar } from "./components/StatusBar";
import { BranchSidebar } from "./components/graph/BranchSidebar";
import { CommitDetail } from "./components/graph/CommitDetail";
import { CommitTable } from "./components/graph/CommitTable";
import { DateRangeBar } from "./components/graph/DateRangeBar";
import { PaginationBar } from "./components/graph/Pagination";
import { TrackingView } from "./components/tracking/TrackingView";
import { FilesDiffTab } from "./components/files/FilesDiffTab";
import { Icon } from "./icons";
import { notifyThemeChanged } from "./ThemeProvider";
import { defaultDate } from "./utils";
import { getBootstrapLogo, getVsCodeApi, postMessage, postWebviewLog } from "./vscode";

const DETAIL_SHARE_MIN = 0.28;
const DETAIL_SHARE_MAX = 0.48;
const DETAIL_SHARE_DEFAULT = 0.36;

const emptyPagination: PaginationState = {
  enabled: false,
  page: 0,
  pageSize: PAGE_SIZE,
  totalItems: 0,
  totalPages: 1
};

const emptyRepo: RepositoryState = {
  root: null,
  name: "No Git repository",
  currentBranch: "No repository",
  remoteCount: 0,
  commitCount: 0
};

interface WebviewPersistedState {
  detailWidth?: number;
  detailShare?: number;
}

function clampDetailShare(value: number): number {
  return Math.max(DETAIL_SHARE_MIN, Math.min(DETAIL_SHARE_MAX, value));
}

function readDetailShare(): number {
  const saved = getVsCodeApi().getState() as WebviewPersistedState | null;
  if (typeof saved?.detailShare === "number") {
    return clampDetailShare(saved.detailShare);
  }
  if (typeof saved?.detailWidth === "number") {
    const estimatedShare = saved.detailWidth / 1280;
    return clampDetailShare(estimatedShare);
  }
  return DETAIL_SHARE_DEFAULT;
}

function commitQueryKey(dateRange: DateRange, page: number, searchText: string, scope: HistoryScope): string {
  return JSON.stringify({ dateRange, page, searchText, scope });
}

export function App() {
  const [tab, setTab] = useState<WebviewTab>("graph");
  const [repo, setRepo] = useState<RepositoryState>(emptyRepo);
  const [commits, setCommits] = useState<CommitNode[]>([]);
  const [branches, setBranches] = useState<BranchInfo[]>([]);
  const [remoteBranches, setRemoteBranches] = useState<RemoteBranchInfo[]>([]);
  const [remotes, setRemotes] = useState<RemoteConfig[]>([]);
  const [pagination, setPagination] = useState<PaginationState>(emptyPagination);
  const [selectedHash, setSelectedHash] = useState("");
  const [commitFiles, setCommitFiles] = useState<Record<string, CommitFileChange[]>>({});
  const [historyScope, setHistoryScope] = useState<HistoryScope>(DEFAULT_HISTORY_SCOPE);
  const [searchOpen, setSearchOpen] = useState(false);
  const [searchText, setSearchText] = useState("");
  const [sideCollapsed, setSideCollapsed] = useState(false);
  const [dateRange, setDateRange] = useState<DateRange>(DEFAULT_DATE_RANGE);
  const [customFrom, setCustomFrom] = useState(defaultDate(-7));
  const [customTo, setCustomTo] = useState(defaultDate(0));
  const [loadingScopes, setLoadingScopes] = useState<Set<string>>(new Set());
  const [notice, setNotice] = useState("");
  const [detailShare, setDetailShare] = useState(readDetailShare);
  const [resizingDetail, setResizingDetail] = useState(false);
  const [defaultBranch, setDefaultBranch] = useState("main");
  const [filesDiff, setFilesDiff] = useState<FilesDiffPayload | undefined>();
  const layoutRef = useRef<HTMLDivElement>(null);
  const resizeStart = useRef({ x: 0, share: DETAIL_SHARE_DEFAULT });
  const commitsHydratedFromHost = useRef(false);
  const satisfiedCommitQueryKey = useRef<string | null>(null);
  const dateRangeRef = useRef(dateRange);
  const searchTextRef = useRef(searchText);
  const historyScopeRef = useRef(historyScope);
  dateRangeRef.current = dateRange;
  searchTextRef.current = searchText;
  historyScopeRef.current = historyScope;
  const logoUri = getBootstrapLogo();

  useEffect(() => {
    const listener = (event: MessageEvent<ExtHostMessage>) => {
      const message = event.data;
      switch (message.type) {
        case "repo-state":
          setRepo(message.repo);
          setNotice("");
          break;
        case "commits-data":
          setCommits(message.commits);
          setPagination(message.pagination);
          commitsHydratedFromHost.current = true;
          satisfiedCommitQueryKey.current = commitQueryKey(
            dateRangeRef.current,
            message.pagination.page,
            searchTextRef.current,
            historyScopeRef.current
          );
          setSelectedHash((current) => {
            if (message.commits.some((commit) => commit.hash === current)) {
              return current;
            }
            return message.commits[0]?.hash ?? "";
          });
          break;
        case "branches-data":
          setBranches(message.branches);
          setRemoteBranches(message.remoteBranches);
          setDefaultBranch(message.defaultBranch);
          break;
        case "remotes-data":
          setRemotes(message.remotes);
          break;
        case "commit-details-data":
          setCommitFiles((current) => ({ ...current, [message.commitHash]: message.files }));
          break;
        case "files-diff-data":
          setFilesDiff(message.diff);
          break;
        case "loading":
          setLoadingScopes((current) => {
            const next = new Set(current);
            const scope = message.scope ?? "all";
            if (message.loading) {
              next.add(scope);
            } else {
              next.delete(scope);
            }
            return next;
          });
          break;
        case "error":
          setNotice(message.message);
          break;
        case "action-result":
          setNotice(message.message);
          break;
        case "repo-changed":
          setNotice("Repository changed. Refreshing data.");
          break;
        case "theme-changed":
          notifyThemeChanged();
          break;
      }
    };

    window.addEventListener("message", listener);
    postWebviewLog("info", "webview app mounted");
    postMessage({ type: "ready" });
    return () => window.removeEventListener("message", listener);
  }, []);

  useEffect(() => {
    if (!commitsHydratedFromHost.current) {
      return;
    }
    const queryKey = commitQueryKey(dateRange, pagination.page, searchText, historyScope);
    if (queryKey === satisfiedCommitQueryKey.current) {
      return;
    }
    const timer = window.setTimeout(() => {
      satisfiedCommitQueryKey.current = queryKey;
      postMessage({ type: "request-commits", dateRange, page: pagination.page, searchText, scope: historyScope });
    }, 150);
    return () => window.clearTimeout(timer);
  }, [dateRange, pagination.page, searchText, historyScope]);

  useEffect(() => {
    postMessage({ type: "tab-changed", tab });
  }, [tab]);

  useEffect(() => {
    if (!selectedHash) {
      return;
    }
    postMessage({ type: "request-commit-details", commitHash: selectedHash });
  }, [selectedHash]);

  useEffect(() => {
    if (!resizingDetail) {
      return;
    }

    const onMove = (event: PointerEvent) => {
      const layout = layoutRef.current;
      if (!layout) {
        return;
      }
      const rect = layout.getBoundingClientRect();
      const share = (rect.right - event.clientX) / rect.width;
      setDetailShare(clampDetailShare(share));
    };

    const onUp = () => {
      setResizingDetail(false);
      setDetailShare((current) => {
        const next = clampDetailShare(current);
        const saved = (getVsCodeApi().getState() as WebviewPersistedState | null) ?? {};
        getVsCodeApi().setState({ ...saved, detailShare: next });
        return next;
      });
    };

    window.addEventListener("pointermove", onMove);
    window.addEventListener("pointerup", onUp);
    return () => {
      window.removeEventListener("pointermove", onMove);
      window.removeEventListener("pointerup", onUp);
    };
  }, [resizingDetail]);

  const selectedCommit = useMemo(
    () => commits.find((commit) => commit.hash === selectedHash) ?? commits[0],
    [commits, selectedHash]
  );
  const selectedFiles = selectedCommit ? commitFiles[selectedCommit.hash] ?? [] : [];
  const filesLoading = loadingScopes.has("commit-details");
  const filesDiffLoading = loadingScopes.has("files-diff");
  const isLoading = loadingScopes.size > 0;

  function setPreset(days: 7 | 14 | 30 | null) {
    setPagination((current) => ({ ...current, page: 0 }));
    setDateRange({ mode: "preset", presetDays: days });
  }

  function setCustomRange(from: string, to: string) {
    setPagination((current) => ({ ...current, page: 0 }));
    setDateRange({ mode: "custom", presetDays: null, customFrom: from, customTo: to });
  }

  function setPage(page: number) {
    setPagination((current) => ({ ...current, page: Math.max(0, Math.min(page, current.totalPages - 1)) }));
  }

  function changeHistoryScope(scope: HistoryScope) {
    setPagination((current) => ({ ...current, page: 0 }));
    setHistoryScope(scope);
  }

  function executeCommit(action: CommitAction, hash = selectedCommit?.hash) {
    if (hash) {
      postMessage({ type: "execute-action", action, commitHash: hash });
    }
  }

  function executeBranch(action: BranchAction, branchName?: string, remote?: string, remoteBranchName?: string) {
    postMessage({ type: "execute-branch-action", action, branchName, remote, remoteBranchName, activeTab: tab });
  }

  function openFileDiff(file: CommitFileChange) {
    if (!selectedCommit) {
      return;
    }
    postMessage({ type: "open-commit-file-diff", commitHash: selectedCommit.hash, file });
  }

  function compareFiles(leftRef: string, rightRef: string) {
    postMessage({ type: "request-files-diff", leftRef, rightRef });
  }

  function openFilesDiffFile(leftRef: string, rightRef: string, file: FilesDiffFileChange) {
    postMessage({ type: "open-files-diff-file", leftRef, rightRef, file });
  }

  const onSplitterPointerDown = useCallback(
    (event: ReactPointerEvent<HTMLDivElement>) => {
      event.preventDefault();
      resizeStart.current = { x: event.clientX, share: detailShare };
      setResizingDetail(true);
    },
    [detailShare]
  );

  const historyShare = 1 - detailShare;

  return (
    <div className={`app-shell${resizingDetail ? " resizing-detail" : ""}`}>
      <TitleBar
        logoUri={logoUri}
        repo={repo}
        searchOpen={searchOpen}
        onToggleSearch={() => {
          setSearchOpen((current) => !current);
          setSearchText("");
        }}
        refreshing={loadingScopes.has("all")}
        onRefresh={() => postMessage({ type: "refresh" })}
        onFetch={() => executeBranch("fetch")}
        onPull={() => executeBranch("pull")}
        onPush={() => executeBranch("push")}
      />

      {searchOpen && (
        <div className="search-bar">
          <Icon type="search" size={14} />
          <input
            autoFocus
            value={searchText}
            onChange={(event) => {
              setPagination((current) => ({ ...current, page: 0 }));
              setSearchText(event.target.value);
            }}
            placeholder="Search commits by message, hash, or author..."
          />
          <span>{pagination.totalItems} results</span>
        </div>
      )}

      <div className="tab-bar">
        <TabButton active={tab === "graph"} icon="commit" label="Commit Graph" onClick={() => setTab("graph")} />
        <TabButton active={tab === "branches"} icon="branch" label="Branch Tracking" onClick={() => setTab("branches")} />
        <TabButton active={tab === "files"} icon="filesDiff" label="Files Diff" onClick={() => setTab("files")} />
      </div>

      <main className="main-body">
        {tab === "graph" ? (
          <>
            <BranchSidebar
              branches={branches}
              remoteBranches={remoteBranches}
              scope={historyScope}
              collapsed={sideCollapsed}
              onCollapse={setSideCollapsed}
              onScopeChange={changeHistoryScope}
            />
            <div
              className="graph-layout"
              ref={layoutRef}
              style={{ gridTemplateColumns: `minmax(280px, ${historyShare}fr) 4px minmax(280px, ${detailShare}fr)` }}
            >
              <section className="graph-area">
                <DateRangeBar
                  dateRange={dateRange}
                  customFrom={customFrom}
                  customTo={customTo}
                  total={pagination.totalItems}
                  onPreset={setPreset}
                  onCustomFrom={(value) => {
                    setCustomFrom(value);
                    setCustomRange(value, customTo);
                  }}
                  onCustomTo={(value) => {
                    setCustomTo(value);
                    setCustomRange(customFrom, value);
                  }}
                  onShowCustom={() => setCustomRange(customFrom, customTo)}
                />
                <div className="commit-table-panel">
                  <CommitTable commits={commits} selectedHash={selectedHash} onSelect={setSelectedHash} />
                </div>
                {pagination.enabled && (
                  <PaginationBar
                    pagination={pagination}
                    onFirst={() => setPage(0)}
                    onPrevious={() => setPage(pagination.page - 1)}
                    onNext={() => setPage(pagination.page + 1)}
                    onLast={() => setPage(pagination.totalPages - 1)}
                  />
                )}
              </section>
              <div
                className="detail-splitter"
                onPointerDown={onSplitterPointerDown}
                role="separator"
                aria-orientation="vertical"
                aria-label="Resize commit detail panel"
                aria-valuemin={DETAIL_SHARE_MIN * 100}
                aria-valuemax={DETAIL_SHARE_MAX * 100}
                aria-valuenow={Math.round(detailShare * 100)}
              />
              <div className="detail-panel-wrap">
                <CommitDetail
                  commit={selectedCommit}
                  files={selectedFiles}
                  filesLoading={filesLoading}
                  onAction={executeCommit}
                  onOpenFile={openFileDiff}
                />
              </div>
            </div>
          </>
        ) : tab === "branches" ? (
          <TrackingView
            branches={branches}
            remoteBranches={remoteBranches}
            remotes={remotes}
            currentBranch={repo.currentBranch}
            defaultBranch={defaultBranch}
            onBranchAction={executeBranch}
          />
        ) : (
          <FilesDiffTab
            branches={branches}
            remoteBranches={remoteBranches}
            remotes={remotes}
            currentBranch={repo.currentBranch}
            defaultBranch={defaultBranch}
            diff={filesDiff}
            loading={filesDiffLoading}
            onCompare={compareFiles}
            onOpenFile={openFilesDiffFile}
          />
        )}
      </main>

      <StatusBar repo={repo} isLoading={isLoading} notice={notice} />
    </div>
  );
}
