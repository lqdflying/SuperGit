import { useEffect, useMemo, useState } from "react";
import { DEFAULT_DATE_RANGE, PAGE_SIZE, type BranchAction, type BranchInfo, type CommitAction, type CommitNode, type DateRange, type ExtHostMessage, type PaginationState, type RemoteConfig, type RepositoryState } from "../shared/types";
import { TitleBar } from "./components/TitleBar";
import { TabButton } from "./components/TabBar";
import { StatusBar } from "./components/StatusBar";
import { BranchSidebar } from "./components/graph/BranchSidebar";
import { CommitDetail } from "./components/graph/CommitDetail";
import { CommitTable } from "./components/graph/CommitTable";
import { DateRangeBar } from "./components/graph/DateRangeBar";
import { PaginationBar } from "./components/graph/Pagination";
import { TrackingView } from "./components/tracking/TrackingView";
import { Icon } from "./icons";
import { defaultDate } from "./utils";
import { getBootstrapLogo, postMessage, postWebviewLog } from "./vscode";

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

export function App() {
  const [tab, setTab] = useState<"graph" | "branches">("graph");
  const [repo, setRepo] = useState<RepositoryState>(emptyRepo);
  const [commits, setCommits] = useState<CommitNode[]>([]);
  const [branches, setBranches] = useState<BranchInfo[]>([]);
  const [remotes, setRemotes] = useState<RemoteConfig[]>([]);
  const [pagination, setPagination] = useState<PaginationState>(emptyPagination);
  const [selectedHash, setSelectedHash] = useState("");
  const [searchOpen, setSearchOpen] = useState(false);
  const [searchText, setSearchText] = useState("");
  const [sideCollapsed, setSideCollapsed] = useState(false);
  const [dateRange, setDateRange] = useState<DateRange>(DEFAULT_DATE_RANGE);
  const [customFrom, setCustomFrom] = useState(defaultDate(-7));
  const [customTo, setCustomTo] = useState(defaultDate(0));
  const [loadingScopes, setLoadingScopes] = useState<Set<string>>(new Set());
  const [notice, setNotice] = useState("");
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
          setSelectedHash((current) => {
            if (message.commits.some((commit) => commit.hash === current)) {
              return current;
            }
            return message.commits[0]?.hash ?? "";
          });
          break;
        case "branches-data":
          setBranches(message.branches);
          break;
        case "remotes-data":
          setRemotes(message.remotes);
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
      }
    };

    window.addEventListener("message", listener);
    postWebviewLog("info", "webview app mounted");
    postMessage({ type: "ready" });
    return () => window.removeEventListener("message", listener);
  }, []);

  useEffect(() => {
    const timer = window.setTimeout(() => {
      postMessage({ type: "request-commits", dateRange, page: pagination.page, searchText });
    }, 150);
    return () => window.clearTimeout(timer);
  }, [dateRange, pagination.page, searchText]);

  const selectedCommit = useMemo(
    () => commits.find((commit) => commit.hash === selectedHash) ?? commits[0],
    [commits, selectedHash]
  );
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

  function executeCommit(action: CommitAction, hash = selectedCommit?.hash) {
    if (hash) {
      postMessage({ type: "execute-action", action, commitHash: hash });
    }
  }

  function executeBranch(action: BranchAction, branchName?: string, remote?: string) {
    postMessage({ type: "execute-branch-action", action, branchName, remote });
  }

  return (
    <div className="app-shell">
      <TitleBar
        logoUri={logoUri}
        repo={repo}
        searchOpen={searchOpen}
        onToggleSearch={() => {
          setSearchOpen((current) => !current);
          setSearchText("");
        }}
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
      </div>

      <main className="main-body">
        {tab === "graph" ? (
          <>
            <BranchSidebar branches={branches} collapsed={sideCollapsed} onCollapse={setSideCollapsed} />
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
              <CommitTable commits={commits} selectedHash={selectedHash} onSelect={setSelectedHash} />
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
            <CommitDetail commit={selectedCommit} onAction={executeCommit} />
          </>
        ) : (
          <TrackingView branches={branches} remotes={remotes} onBranchAction={executeBranch} />
        )}
      </main>

      <StatusBar repo={repo} isLoading={isLoading} notice={notice} />
    </div>
  );
}
