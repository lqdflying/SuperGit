import type { BranchInfo } from "../../../shared/types";

export function BranchSidebar({ branches, collapsed, onCollapse }: { branches: BranchInfo[]; collapsed: boolean; onCollapse: (collapsed: boolean) => void }) {
  if (collapsed) {
    return (
      <aside className="branch-sidebar collapsed" onClick={() => onCollapse(false)}>
        <span>&#8250;</span>
      </aside>
    );
  }

  return (
    <aside className="branch-sidebar">
      <div className="panel-heading">
        <span>Branches</span>
        <button className="collapse-button" onClick={() => onCollapse(true)} type="button">
          &#8249;
        </button>
      </div>
      <div className="branch-list">
        {branches.map((branch) => (
          <div className="branch-list-item" key={branch.name} style={{ borderLeftColor: branch.color }}>
            <span className="branch-name">{branch.name}</span>
            {branch.isCurrent && <span className="tiny-pill active">current</span>}
            {branch.remotes.length === 0 ? <span className="branch-meta">untracked</span> : <span className="branch-meta">{branch.remotes.length} remote{branch.remotes.length > 1 ? "s" : ""}</span>}
          </div>
        ))}
        {branches.length === 0 && <div className="empty-panel">No branches found.</div>}
      </div>
    </aside>
  );
}
