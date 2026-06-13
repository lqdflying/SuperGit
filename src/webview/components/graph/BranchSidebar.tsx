import type { ReactNode } from "react";
import { colors } from "../../../shared/tokens";
import type { BranchInfo, HistoryScope, RemoteBranchInfo } from "../../../shared/types";
import { CurrentBadge } from "../badges";

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
          header
          onClick={() => onScopeChange({ type: "all" })}
        />

        {branches.map((branch) => (
          <div key={branch.name}>
            <ScopeRow
              active={scope.type === "local" && scope.ref === branch.name}
              label={branch.name}
              color={branch.color}
              onClick={() => onScopeChange({ type: "local", ref: branch.name, branchName: branch.name })}
              trailing={branch.isCurrent ? <CurrentBadge /> : undefined}
            />
            {branch.remotes.map((tracking) => (
              <ScopeRow
                key={tracking.ref}
                active={scope.type === "remote" && scope.ref === tracking.ref}
                label={tracking.ref}
                nested
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
                    remoteOnly
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
  remoteOnly,
  header,
  trailing,
  onClick
}: {
  active: boolean;
  label: string;
  color?: string;
  nested?: boolean;
  remoteOnly?: boolean;
  header?: boolean;
  trailing?: ReactNode;
  onClick: () => void;
}) {
  return (
    <button
      className={`branch-list-item${active ? " selected" : ""}${nested ? " nested" : ""}${header ? " header-item" : ""}${remoteOnly ? " remote-only-item" : ""}`}
      onClick={onClick}
      style={color && !nested ? { borderLeftColor: color } : remoteOnly ? { borderLeftColor: color ?? colors.fgDim } : undefined}
      type="button"
    >
      {!nested && color && <span className="branch-dot sidebar-dot" style={{ background: color }} />}
      {nested && !remoteOnly && <span className="branch-sub-dot" />}
      {remoteOnly && <span className="branch-sub-dot remote-only-dot" style={{ background: color ?? colors.fgDim }} />}
      <span className="branch-name">{label}</span>
      {trailing}
    </button>
  );
}
