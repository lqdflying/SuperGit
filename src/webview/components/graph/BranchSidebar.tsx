import type { ReactNode } from "react";
import type { BranchInfo, HistoryScope, RemoteBranchInfo } from "../../../shared/types";

function isScopeEqual(a: HistoryScope, b: HistoryScope): boolean {
  if (a.type !== b.type) {
    return false;
  }
  if (a.type === "all" || b.type === "all") {
    return true;
  }
  if (a.type === "local" && b.type === "local") {
    return a.ref === b.ref;
  }
  if (a.type === "remote" && b.type === "remote") {
    return a.ref === b.ref;
  }
  return false;
}

export function BranchSidebar({
  branches,
  remoteBranches,
  scope,
  collapsed,
  onCollapse,
  onScopeChange
}: {
  branches: BranchInfo[];
  remoteBranches: RemoteBranchInfo[];
  scope: HistoryScope;
  collapsed: boolean;
  onCollapse: (collapsed: boolean) => void;
  onScopeChange: (scope: HistoryScope) => void;
}) {
  if (collapsed) {
    return (
      <aside className="branch-sidebar collapsed" onClick={() => onCollapse(false)}>
        <span>&#8250;</span>
      </aside>
    );
  }

  const remoteOnlyByRemote = new Map<string, RemoteBranchInfo[]>();
  for (const remoteBranch of remoteBranches) {
    if (remoteBranch.localBranchName) {
      continue;
    }
    const group = remoteOnlyByRemote.get(remoteBranch.remote) ?? [];
    group.push(remoteBranch);
    remoteOnlyByRemote.set(remoteBranch.remote, group);
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
        <ScopeRow
          active={scope.type === "all"}
          label="All branches"
          onClick={() => onScopeChange({ type: "all" })}
        />

        {branches.map((branch) => (
          <div key={branch.name}>
            <ScopeRow
              active={scope.type === "local" && scope.ref === branch.name}
              label={branch.name}
              color={branch.color}
              onClick={() => onScopeChange({ type: "local", ref: branch.name, branchName: branch.name })}
              trailing={branch.isCurrent ? <span className="tiny-pill active">current</span> : undefined}
            />
            {branch.remotes.map((tracking) => (
              <ScopeRow
                key={tracking.ref}
                active={scope.type === "remote" && scope.ref === tracking.ref}
                label={tracking.ref}
                nested
                color={branch.color}
                onClick={() =>
                  onScopeChange({
                    type: "remote",
                    ref: tracking.ref,
                    remote: tracking.remote,
                    branchName: branch.name
                  })
                }
              />
            ))}
          </div>
        ))}

        {remoteOnlyByRemote.size > 0 && (
          <>
            <div className="branch-section-label">Remote-only</div>
            {[...remoteOnlyByRemote.entries()].map(([remote, refs]) => (
              <div key={remote}>
                <div className="branch-remote-group">{remote}</div>
                {refs.map((remoteBranch) => (
                  <ScopeRow
                    key={remoteBranch.ref}
                    active={isScopeEqual(scope, { type: "remote", ref: remoteBranch.ref, remote: remoteBranch.remote, branchName: remoteBranch.branchName })}
                    label={remoteBranch.branchName}
                    nested
                    color={remoteBranch.color}
                    onClick={() =>
                      onScopeChange({
                        type: "remote",
                        ref: remoteBranch.ref,
                        remote: remoteBranch.remote,
                        branchName: remoteBranch.branchName
                      })
                    }
                  />
                ))}
              </div>
            ))}
          </>
        )}

        {branches.length === 0 && remoteBranches.length === 0 && <div className="empty-panel">No branches found.</div>}
      </div>
    </aside>
  );
}

function ScopeRow({
  active,
  label,
  color,
  nested,
  trailing,
  onClick
}: {
  active: boolean;
  label: string;
  color?: string;
  nested?: boolean;
  trailing?: ReactNode;
  onClick: () => void;
}) {
  return (
    <button
      className={`branch-list-item${active ? " selected" : ""}${nested ? " nested" : ""}`}
      onClick={onClick}
      style={color ? { borderLeftColor: color } : undefined}
      type="button"
    >
      <span className="branch-name">{label}</span>
      {trailing}
    </button>
  );
}
