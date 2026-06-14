import type { RepositoryState } from "../../shared/types";
import { useThemeColors } from "../ThemeProvider";
import { Icon, type IconName } from "../icons";

interface TitleBarProps {
  logoUri: string;
  repo: RepositoryState;
  searchOpen: boolean;
  refreshing?: boolean;
  onToggleSearch: () => void;
  onRefresh: () => void;
  onFetch: () => void;
  onPull: () => void;
  onPush: () => void;
}

export function TitleBar({ logoUri, repo, searchOpen, refreshing, onToggleSearch, onRefresh, onFetch, onPull, onPush }: TitleBarProps) {
  return (
    <header className="title-bar">
      {logoUri ? <img className="title-logo" src={logoUri} alt="" /> : <span className="title-accent-dot" />}
      <span className="title-name">SuperGit</span>
      <span className="title-repo">{repo.name}</span>
      <div className="spacer" />
      <ToolbarButton icon="search" active={searchOpen} label="Search" onClick={onToggleSearch} />
      <ToolbarButton icon="filter" label="Filter" />
      <div className="divider" />
      <ToolbarButton icon="fetch" label="Fetch" onClick={onFetch} />
      <ToolbarButton icon="pull" label="Pull" onClick={onPull} />
      <ToolbarButton icon="push" label="Push" onClick={onPush} />
      <ToolbarButton
        icon="refresh"
        label="Refresh"
        title={refreshing ? "Fetching all remotes and pruning stale refs…" : "Fetch all remotes, prune stale refs, and reload"}
        disabled={refreshing}
        onClick={onRefresh}
      />
    </header>
  );
}

function ToolbarButton({
  icon,
  label,
  active,
  disabled,
  title,
  onClick
}: {
  icon: IconName;
  label: string;
  active?: boolean;
  disabled?: boolean;
  title?: string;
  onClick?: () => void;
}) {
  const theme = useThemeColors();
  return (
    <button
      className={`toolbar-button${active ? " active" : ""}`}
      disabled={disabled}
      title={title}
      onClick={onClick}
      type="button"
    >
      <Icon type={icon} size={13} color={active ? theme.accent : theme.fgDim} />
      {label}
    </button>
  );
}
