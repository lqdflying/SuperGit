import type { RepositoryState } from "../../shared/types";
import { Icon } from "../icons";
import { formatRelativeFetched } from "../utils";

export function StatusBar({ repo, isLoading, notice }: { repo: RepositoryState; isLoading: boolean; notice: string }) {
  return (
    <footer className="status-bar">
      <span>
        <Icon type="branch" size={12} color="#fff" />
        {repo.currentBranch}
      </span>
      <span className="status-separator">|</span>
      <span>
        <Icon type="remote" size={12} color="#fff" />
        {repo.remoteCount} remotes
      </span>
      <span className="status-separator">|</span>
      <span>
        <Icon type="commit" size={12} color="#fff" />
        {repo.commitCount} commits
      </span>
      <div className="spacer" />
      {notice && <span className="status-notice">{notice}</span>}
      {isLoading ? <span>Loading...</span> : <span>{formatRelativeFetched(repo.lastFetched)}</span>}
    </footer>
  );
}
