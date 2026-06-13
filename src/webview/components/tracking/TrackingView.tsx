import { useMemo, type ReactNode } from "react";
import { colors, typography } from "../../../shared/tokens";
import type { BranchAction, BranchInfo, RemoteConfig } from "../../../shared/types";
import { Icon, type IconName } from "../../icons";
import { blockHeight } from "../../utils";

export function TrackingView({ branches, remotes, onBranchAction }: { branches: BranchInfo[]; remotes: RemoteConfig[]; onBranchAction: (action: BranchAction, branchName?: string, remote?: string) => void }) {
  const remoteColors = useMemo(() => new Map(remotes.map((remote) => [remote.name, remote.color])), [remotes]);
  const totalHeight = branches.reduce((sum, branch) => sum + blockHeight(branch), 0);

  return (
    <section className="tracking-view">
      <div className="tracking-header">
        <div className="tracking-title">Branch Tracking Relationships</div>
        <div className="tracking-subtitle">Local branches and their upstream remote tracking configuration across {remotes.length} remote{remotes.length === 1 ? "" : "s"}</div>
      </div>
      <div className="remote-legend-bar">
        <span className="legend-label">Remotes:</span>
        {remotes.map((remote) => (
          <div className="remote-chip" key={remote.name}>
            <span style={{ background: remote.color }} />
            <strong>{remote.name}</strong>
            <em>{remote.url}</em>
          </div>
        ))}
        {remotes.length === 0 && <span className="muted">No remotes configured.</span>}
      </div>
      <div className="tracking-diagram-wrap">
        <div className="tracking-diagram">
          <div className="tracking-local">
            <div className="tracking-column-title">LOCAL</div>
            {branches.map((branch) => (
              <div className="tracking-branch-block" key={branch.name} style={{ height: blockHeight(branch) }}>
                <div className="local-branch-pill" style={{ borderColor: `${branch.color}77`, background: `${branch.color}14` }}>
                  <span style={{ background: branch.color }} />
                  <strong>{branch.name}</strong>
                </div>
              </div>
            ))}
          </div>
          <div className="tracking-arrows">
            <div className="tracking-column-title centered">TRACKS</div>
            <svg width={170} height={totalHeight || 1} className="tracking-svg">
              <TrackingArrows branches={branches} remoteColors={remoteColors} />
            </svg>
          </div>
          <div className="tracking-remotes">
            <div className="tracking-column-title with-icon">
              <Icon type="remote" size={12} />
              REMOTES
            </div>
            {branches.map((branch) => (
              <div className="tracking-remote-block" key={branch.name} style={{ height: blockHeight(branch) }}>
                {branch.remotes.length === 0 ? (
                  <span className="untracked-mark">-</span>
                ) : (
                  branch.remotes.map((tracking) => (
                    <div className="remote-row" key={tracking.ref}>
                      <span style={{ background: remoteColors.get(tracking.remote) ?? colors.fgDim }} />
                      <strong>{tracking.remote}/</strong>
                      <em>{branch.name}</em>
                      {tracking.isConfiguredUpstream && <span className="tiny-pill active">upstream</span>}
                      <StatusPill ahead={tracking.ahead} behind={tracking.behind} />
                    </div>
                  ))
                )}
              </div>
            ))}
          </div>
        </div>
        {branches.length === 0 && <div className="empty-panel">No branch tracking data found.</div>}
      </div>
      <div className="tracking-footer">
        <div className="panel-heading standalone">Legend</div>
        <div className="legend-row">
          <LegendItem color={colors.ahead} label="Ahead (unpushed)" icon="up" />
          <LegendItem color={colors.behind} label="Behind (needs pull)" icon="down" />
          <LegendItem color={colors.upToDate} label="Synced" icon="check" />
          <LegendItem color={colors.untracked} label="No upstream" dashed />
          {remotes.map((remote) => (
            <LegendItem key={remote.name} color={remote.color} label={remote.name} dot />
          ))}
        </div>
      </div>
      <div className="tracking-footer">
        <div className="panel-heading standalone">Quick Actions</div>
        <div className="quick-actions">
          <QuickButton icon="push" label="Push Current" onClick={() => onBranchAction("push")} />
          <QuickButton icon="pull" label="Pull Current" onClick={() => onBranchAction("pull")} />
          <QuickButton icon="fetch" label="Fetch All Remotes" onClick={() => onBranchAction("fetch")} />
          <QuickButton icon="branch" label="Set Upstream" onClick={() => onBranchAction("set-upstream")} />
          <QuickButton icon="refresh" label="Prune Stale" onClick={() => onBranchAction("prune-stale")} />
        </div>
      </div>
    </section>
  );
}

function TrackingArrows({ branches, remoteColors }: { branches: BranchInfo[]; remoteColors: Map<string, string> }) {
  const elements: ReactNode[] = [];
  let offset = 0;

  branches.forEach((branch) => {
    const height = blockHeight(branch);
    const localY = offset + height / 2;

    if (branch.remotes.length === 0) {
      elements.push(
        <g key={`${branch.name}-none`}>
          <line x1={8} y1={localY} x2={80} y2={localY} stroke={colors.untracked} strokeWidth={1.2} strokeDasharray="4,3" />
          <text x={85} y={localY + 3} fill={colors.untracked} fontSize={10} fontFamily={typography.fontFamily}>
            no upstream
          </text>
        </g>
      );
    } else {
      branch.remotes.forEach((tracking, remoteIndex) => {
        const remoteY = offset + 8 + remoteIndex * 32 + 16;
        const color = remoteColors.get(tracking.remote) ?? colors.accent;
        const badgeY = (localY + remoteY) / 2;
        elements.push(
          <g key={`${branch.name}-${tracking.ref}`}>
            <path d={`M8,${localY} C42,${localY} 102,${remoteY} 146,${remoteY}`} stroke={color} strokeWidth={1.5} fill="none" opacity={0.7} />
            <polygon points={`149,${remoteY} 143,${remoteY - 4} 143,${remoteY + 4}`} fill={color} opacity={0.8} />
            {tracking.ahead > 0 && <TrackingBadge x={55} y={badgeY} color={colors.ahead} text={`+${tracking.ahead}`} />}
            {tracking.behind > 0 && <TrackingBadge x={tracking.ahead > 0 ? 82 : 55} y={badgeY} color={colors.behind} text={`-${tracking.behind}`} />}
            {tracking.ahead === 0 && tracking.behind === 0 && (
              <g>
                <circle cx={72} cy={badgeY} r={6} fill={`${colors.upToDate}22`} stroke={`${colors.upToDate}77`} strokeWidth={0.5} />
                <polyline points={`69,${badgeY} 71,${badgeY + 2} 75,${badgeY - 2}`} fill="none" stroke={colors.upToDate} strokeWidth={1.2} />
              </g>
            )}
          </g>
        );
      });
    }

    elements.push(<circle key={`${branch.name}-dot`} cx={4} cy={localY} r={4} fill={branch.color} opacity={0.7} />);
    offset += height;
  });

  return <>{elements}</>;
}

function TrackingBadge({ x, y, color, text }: { x: number; y: number; color: string; text: string }) {
  return (
    <g>
      <rect x={x} y={y - 8} width={22} height={13} rx={3} fill={`${color}22`} stroke={`${color}77`} strokeWidth={0.5} />
      <text x={x + 11} y={y + 2} fill={color} fontSize={9} fontWeight="bold" textAnchor="middle">
        {text}
      </text>
    </g>
  );
}

function StatusPill({ ahead, behind }: { ahead: number; behind: number }) {
  if (ahead === 0 && behind === 0) {
    return <Icon type="check" size={11} color={colors.upToDate} />;
  }

  return (
    <span className="status-pill">
      {ahead > 0 && (
        <span style={{ color: colors.ahead }}>
          <Icon type="up" size={9} color={colors.ahead} />
          {ahead}
        </span>
      )}
      {behind > 0 && (
        <span style={{ color: colors.behind }}>
          <Icon type="down" size={9} color={colors.behind} />
          {behind}
        </span>
      )}
    </span>
  );
}

function LegendItem({ color, label, icon, dashed, dot }: { color: string; label: string; icon?: IconName; dashed?: boolean; dot?: boolean }) {
  return (
    <div className="legend-item">
      {dot ? (
        <span className="legend-dot" style={{ background: color }} />
      ) : icon ? (
        <Icon type={icon} size={11} color={color} />
      ) : (
        <svg width={16} height={2}>
          <line x1={0} y1={1} x2={16} y2={1} stroke={color} strokeWidth={1.5} strokeDasharray={dashed ? "3,2" : "none"} />
        </svg>
      )}
      <span>{label}</span>
    </div>
  );
}

function QuickButton({ icon, label, onClick }: { icon: IconName; label: string; onClick: () => void }) {
  return (
    <button className="quick-button" onClick={onClick} type="button">
      <Icon type={icon} size={13} color={colors.accent} />
      {label}
    </button>
  );
}
