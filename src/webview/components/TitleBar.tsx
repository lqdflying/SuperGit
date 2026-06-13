import { colors } from "../../shared/tokens";
import type { RepositoryState } from "../../shared/types";
import { Icon, type IconName } from "../icons";

interface TitleBarProps {
  logoUri: string;
  repo: RepositoryState;
  searchOpen: boolean;
  onToggleSearch: () => void;
  onRefresh: () => void;
  onFetch: () => void;
  onPull: () => void;
  onPush: () => void;
}

export function TitleBar({ logoUri, repo, searchOpen, onToggleSearch, onRefresh, onFetch, onPull, onPush }: TitleBarProps) {
  return (
    <header className="title-bar">
      {logoUri ? <img className="title-logo" src={logoUri} alt="" /> : <Icon type="graph" size={16} color={colors.accent} />}
      <span className="title-name">SUPERGIT</span>
      <span className="title-repo">{repo.name}</span>
      <div className="spacer" />
      <ToolbarButton icon="search" active={searchOpen} label="Search" onClick={onToggleSearch} />
      <ToolbarButton icon="filter" label="Filter" />
      <div className="divider" />
      <ToolbarButton icon="fetch" label="Fetch" onClick={onFetch} />
      <ToolbarButton icon="pull" label="Pull" onClick={onPull} />
      <ToolbarButton icon="push" label="Push" onClick={onPush} />
      <ToolbarButton icon="refresh" label="Refresh" onClick={onRefresh} />
    </header>
  );
}

function ToolbarButton({ icon, label, active, onClick }: { icon: IconName; label: string; active?: boolean; onClick?: () => void }) {
  return (
    <button className={`toolbar-button${active ? " active" : ""}`} onClick={onClick} type="button">
      <Icon type={icon} size={13} color={active ? colors.accent : colors.fgDim} />
      {label}
    </button>
  );
}
