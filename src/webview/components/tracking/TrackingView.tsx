import { useEffect, useMemo, useState, type ReactNode } from "react";
import { colors, typography } from "../../../shared/tokens";
import type { BranchAction, BranchInfo, RemoteConfig, RemoteTracking } from "../../../shared/types";
import { Icon, type IconName } from "../../icons";
import { blockHeight } from "../../utils";

type TrackingStatus = "synced" | "ahead" | "behind" | "diverged" | "no-upstream";

function resolveCurrentBranchName(branches: BranchInfo[], currentBranch: string): string | undefined {
  if (currentBranch.startsWith("DETACHED")) {
    return undefined;
  }
  const match = branches.find((branch) => branch.isCurrent || branch.name === currentBranch);
  return match?.name ?? currentBranch;
}

function resolveActionRemote(branch: BranchInfo | undefined, selectedRemote?: string): string | undefined {
  if (!branch) {
    return selectedRemote;
  }
  if (selectedRemote) {
    return selectedRemote;
  }
  const upstream = branch.remotes.find((tracking) => tracking.isConfiguredUpstream);
  return upstream?.remote ?? branch.remotes[0]?.remote;
}

function resolveSelectedTracking(branch: BranchInfo | undefined, selectedRemote?: string): RemoteTracking | undefined {
  if (!branch) {
    return undefined;
  }
  if (selectedRemote) {
    return branch.remotes.find((tracking) => tracking.remote === selectedRemote);
  }
  return branch.remotes.find((tracking) => tracking.isConfiguredUpstream) ?? branch.remotes[0];
}

function getTrackingStatus(tracking: RemoteTracking | undefined): TrackingStatus {
  if (!tracking) {
    return "no-upstream";
  }
  if (tracking.ahead === 0 && tracking.behind === 0) {
    return "synced";
  }
  if (tracking.ahead > 0 && tracking.behind > 0) {
    return "diverged";
  }
  if (tracking.ahead > 0) {
    return "ahead";
  }
  return "behind";
}

function formatTrackingRef(tracking: RemoteTracking | undefined, branchName?: string): string | undefined {
  if (!tracking) {
    return undefined;
  }
  return tracking.ref || `${tracking.remote}/${branchName ?? ""}`;
}

export function TrackingView({
  branches,
  remotes,
  currentBranch,
  onBranchAction
}: {
  branches: BranchInfo[];
  remotes: RemoteConfig[];
  currentBranch: string;
  onBranchAction: (action: BranchAction, branchName?: string, remote?: string) => void;
}) {
  const remoteColors = useMemo(() => new Map(remotes.map((remote) => [remote.name, remote.color])), [remotes]);
  const totalHeight = branches.reduce((sum, branch) => sum + blockHeight(branch), 0);
  const detached = currentBranch.startsWith("DETACHED");
  const currentBranchLabel = detached ? currentBranch.replace(/^DETACHED\s*/, "") : currentBranch;
  const checkoutBranch = resolveCurrentBranchName(branches, currentBranch);
  const [selectedBranchName, setSelectedBranchName] = useState<string | undefined>(checkoutBranch);
  const [selectedRemote, setSelectedRemote] = useState<string | undefined>();

  useEffect(() => {
    if (selectedBranchName && branches.some((branch) => branch.name === selectedBranchName)) {
      return;
    }
    setSelectedBranchName(checkoutBranch ?? branches[0]?.name);
    setSelectedRemote(undefined);
  }, [branches, checkoutBranch, selectedBranchName]);

  const selectedBranch = branches.find((branch) => branch.name === selectedBranchName) ?? branches.find((branch) => branch.isCurrent) ?? branches[0];
  const actionBranchName = selectedBranch?.name;
  const actionRemote = resolveActionRemote(selectedBranch, selectedRemote);
  const selectedTracking = resolveSelectedTracking(selectedBranch, selectedRemote);
  const trackingStatus = getTrackingStatus(selectedTracking);
  const trackingRef = formatTrackingRef(selectedTracking, actionBranchName);
  const canPush = Boolean(actionBranchName && selectedTracking && (selectedTracking.ahead > 0 || trackingStatus === "diverged"));
  const canPull = Boolean(actionBranchName && selectedTracking && (selectedTracking.behind > 0 || trackingStatus === "diverged"));
  const pushPrimary = trackingStatus === "ahead" || trackingStatus === "diverged";
  const pullPrimary = trackingStatus === "behind" || trackingStatus === "diverged";
  const pushLabel = selectedTracking && selectedTracking.ahead > 0 ? `Push ${selectedTracking.ahead}` : "Push Selected";
  const pullLabel = selectedTracking && selectedTracking.behind > 0 ? `Pull ${selectedTracking.behind}` : "Pull Selected";

  function selectBranch(branchName: string, remote?: string) {
    setSelectedBranchName(branchName);
    setSelectedRemote(remote);
  }

  function runBranchAction(action: BranchAction) {
    if (!actionBranchName) {
      return;
    }
    onBranchAction(action, actionBranchName, actionRemote);
  }

  return (
    <section className="tracking-view">
      <div className="tracking-scroll">
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
            {branches.map((branch) => {
              const selected = branch.name === selectedBranch?.name;
              return (
              <div className="tracking-branch-block" key={branch.name} style={{ height: blockHeight(branch) }}>
                <button
                  className={`local-branch-pill${branch.isCurrent ? " current" : ""}${selected ? " selected" : ""}`}
                  onClick={() => selectBranch(branch.name)}
                  style={{ borderColor: `${branch.color}77`, background: branch.isCurrent ? `${branch.color}28` : `${branch.color}14` }}
                  type="button"
                >
                  <span className="branch-dot" style={{ background: branch.color }} />
                  <strong title={branch.name}>{branch.name}</strong>
                  {branch.isCurrent && <span className="tiny-pill active">current</span>}
                </button>
              </div>
            );
            })}
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
                  branch.remotes.map((tracking) => {
                    const remoteSelected = selectedBranch?.name === branch.name && selectedRemote === tracking.remote;
                    return (
                    <button
                      className={`remote-row${remoteSelected ? " selected" : ""}`}
                      key={tracking.ref}
                      onClick={() => selectBranch(branch.name, tracking.remote)}
                      type="button"
                    >
                      <span className="branch-dot" style={{ background: remoteColors.get(tracking.remote) ?? colors.fgDim }} />
                      <span className="remote-row-label" title={`${tracking.remote}/${branch.name}`}>
                        <strong>{tracking.remote}/</strong>
                        <em>{branch.name}</em>
                      </span>
                      {tracking.isConfiguredUpstream && <span className="tiny-pill active">upstream</span>}
                      <StatusPill ahead={tracking.ahead} behind={tracking.behind} />
                    </button>
                  );
                  })
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
      </div>
      <div className="tracking-actions-dock">
        <div className="panel-heading standalone">Quick Actions</div>
        {actionBranchName ? (
          <SelectionStatus
            branchName={actionBranchName}
            checkoutBranch={checkoutBranch}
            detached={detached}
            detachedLabel={currentBranchLabel}
            status={trackingStatus}
            tracking={selectedTracking}
            trackingRef={trackingRef}
          />
        ) : (
          <div className="quick-actions-context">
            <span>Select a local branch or remote row to see push/pull recommendations.</span>
          </div>
        )}
        <div className="quick-actions">
          <QuickButton
            icon="push"
            label={pushLabel}
            disabled={!canPush}
            primary={pushPrimary}
            onClick={() => runBranchAction("push")}
          />
          <QuickButton
            icon="pull"
            label={pullLabel}
            disabled={!canPull}
            primary={pullPrimary}
            onClick={() => runBranchAction("pull")}
          />
          <QuickButton icon="fetch" label="Fetch All Remotes" onClick={() => onBranchAction("fetch")} />
          <QuickButton
            icon="branch"
            label="Set Upstream"
            disabled={!actionBranchName}
            primary={trackingStatus === "no-upstream"}
            onClick={() => runBranchAction("set-upstream")}
          />
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

function SelectionStatus({
  branchName,
  checkoutBranch,
  detached,
  detachedLabel,
  status,
  tracking,
  trackingRef
}: {
  branchName: string;
  checkoutBranch?: string;
  detached: boolean;
  detachedLabel: string;
  status: TrackingStatus;
  tracking?: RemoteTracking;
  trackingRef?: string;
}) {
  const statusColor =
    status === "synced"
      ? colors.upToDate
      : status === "ahead"
        ? colors.ahead
        : status === "behind"
          ? colors.behind
          : status === "diverged"
            ? colors.behind
            : colors.untracked;

  const statusIcon: IconName =
    status === "synced" ? "check" : status === "ahead" ? "up" : status === "behind" ? "down" : status === "diverged" ? "branch" : "remote";

  let headline = "No upstream configured";
  let detail = "Set upstream to track a remote branch.";

  if (tracking) {
    switch (status) {
      case "synced":
        headline = "All in sync";
        detail = `Local ${branchName} matches ${trackingRef}.`;
        break;
      case "ahead":
        headline = `${tracking.ahead} commit${tracking.ahead === 1 ? "" : "s"} ahead`;
        detail = `Push to publish local commits to ${trackingRef}.`;
        break;
      case "behind":
        headline = `${tracking.behind} commit${tracking.behind === 1 ? "" : "s"} behind`;
        detail = `Pull to fast-forward ${branchName} from ${trackingRef}.`;
        break;
      case "diverged":
        headline = "Diverged from remote";
        detail = `${tracking.ahead} ahead, ${tracking.behind} behind on ${trackingRef}. Pull or rebase, then push.`;
        break;
    }
  }

  return (
    <div className={`tracking-selection-status ${status}`} style={{ borderLeftColor: statusColor }}>
      <div className="tracking-selection-status-icon" style={{ color: statusColor }}>
        <Icon type={statusIcon} size={14} color={statusColor} />
      </div>
      <div className="tracking-selection-status-copy">
        <div className="tracking-selection-status-headline">
          <strong className="mono">{branchName}</strong>
          {trackingRef ? (
            <>
              {" "}
              <span className="muted">→</span> <span className="mono">{trackingRef}</span>
            </>
          ) : null}
        </div>
        <div className="tracking-selection-status-message">
          <strong style={{ color: statusColor }}>{headline}</strong>
          <span>{detail}</span>
        </div>
        {detached ? (
          <div className="tracking-selection-status-note">
            Checked out at <strong className="mono">{detachedLabel}</strong> (detached HEAD).
          </div>
        ) : checkoutBranch && checkoutBranch !== branchName ? (
          <div className="tracking-selection-status-note">
            Checked out: <strong className="mono">{checkoutBranch}</strong>
          </div>
        ) : null}
      </div>
    </div>
  );
}

function QuickButton({
  icon,
  label,
  disabled,
  primary,
  onClick
}: {
  icon: IconName;
  label: string;
  disabled?: boolean;
  primary?: boolean;
  onClick: () => void;
}) {
  return (
    <button className={`quick-button${primary && !disabled ? " primary" : ""}`} disabled={disabled} onClick={onClick} type="button">
      <Icon type={icon} size={13} color={primary && !disabled ? "#ffffff" : colors.accent} />
      {label}
    </button>
  );
}
