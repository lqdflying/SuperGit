import { useEffect, useMemo, useState } from "react";
import { colors } from "../../../shared/tokens";
import type { BranchAction, BranchInfo, RemoteBranchInfo, RemoteConfig, RemoteTracking } from "../../../shared/types";
import { Icon, type IconName } from "../../icons";
import { CurrentBadge } from "../badges";
import { blockHeight, buildTrackingRows, trackingRowHeight, type TrackingRow } from "../../utils";

type TrackingStatus = "synced" | "ahead" | "behind" | "diverged" | "no-upstream" | "remote-only";

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
  remoteBranches,
  remotes,
  currentBranch,
  onBranchAction
}: {
  branches: BranchInfo[];
  remoteBranches: RemoteBranchInfo[];
  remotes: RemoteConfig[];
  currentBranch: string;
  onBranchAction: (action: BranchAction, branchName?: string, remote?: string) => void;
}) {
  const trackingRows = useMemo(() => buildTrackingRows(branches, remoteBranches), [branches, remoteBranches]);
  const localRows = useMemo(() => trackingRows.filter((row): row is Extract<TrackingRow, { kind: "local" }> => row.kind === "local"), [trackingRows]);
  const remoteOnlyRows = useMemo(
    () => trackingRows.filter((row): row is Extract<TrackingRow, { kind: "remote-only" }> => row.kind === "remote-only"),
    [trackingRows]
  );
  const remoteColors = useMemo(() => new Map(remotes.map((remote) => [remote.name, remote.color])), [remotes]);
  const detached = currentBranch.startsWith("DETACHED");
  const currentBranchLabel = detached ? currentBranch.replace(/^DETACHED\s*/, "") : currentBranch;
  const checkoutBranch = resolveCurrentBranchName(branches, currentBranch);
  const [selectedBranchName, setSelectedBranchName] = useState<string | undefined>(checkoutBranch);
  const [selectedRemote, setSelectedRemote] = useState<string | undefined>();
  const [selectedRemoteOnly, setSelectedRemoteOnly] = useState(false);

  useEffect(() => {
    if (!selectedBranchName) {
      return;
    }
    const localMatch = branches.some((branch) => branch.name === selectedBranchName);
    const remoteOnlyMatch = remoteOnlyRows.some(
      (row) => row.remoteBranch.branchName === selectedBranchName && row.remoteBranch.remote === selectedRemote
    );
    if ((selectedRemoteOnly && remoteOnlyMatch) || (!selectedRemoteOnly && localMatch)) {
      return;
    }
    setSelectedBranchName(checkoutBranch ?? branches[0]?.name);
    setSelectedRemote(undefined);
    setSelectedRemoteOnly(false);
  }, [branches, checkoutBranch, remoteOnlyRows, selectedBranchName, selectedRemote, selectedRemoteOnly]);

  const selectedLocalBranch =
    !selectedRemoteOnly ? branches.find((branch) => branch.name === selectedBranchName) : undefined;
  const selectedRemoteBranch =
    selectedRemoteOnly
      ? remoteOnlyRows.find(
          (row) => row.remoteBranch.branchName === selectedBranchName && row.remoteBranch.remote === selectedRemote
        )?.remoteBranch
      : undefined;
  const selectedBranch = selectedLocalBranch ?? branches.find((branch) => branch.isCurrent) ?? branches[0];
  const actionBranchName = selectedRemoteOnly ? selectedRemoteBranch?.branchName : selectedLocalBranch?.name ?? selectedBranch?.name;
  const actionRemote = selectedRemoteOnly
    ? selectedRemoteBranch?.remote
    : resolveActionRemote(selectedLocalBranch ?? selectedBranch, selectedRemote);
  const selectedTracking = selectedRemoteOnly
    ? undefined
    : resolveSelectedTracking(selectedLocalBranch ?? selectedBranch, selectedRemote);
  const trackingStatus = selectedRemoteOnly ? "remote-only" : getTrackingStatus(selectedTracking);
  const trackingRef = selectedRemoteOnly
    ? selectedRemoteBranch?.ref
    : formatTrackingRef(selectedTracking, actionBranchName);
  const canPush = Boolean(!selectedRemoteOnly && actionBranchName && selectedTracking && (selectedTracking.ahead > 0 || trackingStatus === "diverged"));
  const canPull = Boolean(
    actionBranchName &&
      actionRemote &&
      (selectedRemoteOnly || (selectedTracking && (selectedTracking.behind > 0 || trackingStatus === "diverged")))
  );
  const pushPrimary = !selectedRemoteOnly && (trackingStatus === "ahead" || trackingStatus === "diverged");
  const pullPrimary =
    selectedRemoteOnly || trackingStatus === "behind" || trackingStatus === "diverged";
  const pushLabel = selectedTracking && selectedTracking.ahead > 0 ? `Push ${selectedTracking.ahead}` : "Push Selected";
  const pullLabel = selectedRemoteOnly
    ? "Create Local Branch"
    : selectedTracking && selectedTracking.behind > 0
      ? `Pull ${selectedTracking.behind}`
      : "Pull Selected";

  function selectLocalBranch(branchName: string, remote?: string) {
    setSelectedBranchName(branchName);
    setSelectedRemote(remote);
    setSelectedRemoteOnly(false);
  }

  function selectRemoteOnlyBranch(remoteBranch: RemoteBranchInfo) {
    setSelectedBranchName(remoteBranch.branchName);
    setSelectedRemote(remoteBranch.remote);
    setSelectedRemoteOnly(true);
  }

  function runBranchAction(action: BranchAction) {
    if (!actionBranchName) {
      return;
    }
    onBranchAction(action, actionBranchName, actionRemote);
  }

  const hasRemoteOnlySection = remoteOnlyRows.length > 0;

  return (
    <section className="tracking-view">
      <div className="tracking-scroll">
      <div className="tracking-header">
        <div className="tracking-title">Branch Tracking</div>
        <div className="tracking-subtitle">Local branches and upstream remotes</div>
      </div>
      <div className="remote-legend-bar">
        {remotes.map((remote) => (
          <div className="remote-chip" key={remote.name}>
            <span style={{ background: remote.color }} />
            <strong>{remote.name}</strong>
            <em>{remote.url}</em>
          </div>
        ))}
        {remotes.length === 0 && <span className="muted">No remotes configured.</span>}
      </div>
      <div className="tracking-table-wrap">
        <div className="tracking-table-head">
          <div className="tracking-head-local">Local</div>
          <div className="tracking-head-tracks">Tracks</div>
          <div className="tracking-head-remotes">
            <Icon type="remote" size={12} />
            Remotes
          </div>
        </div>
        <div className="tracking-table-body">
          {localRows.map((row) => {
            const branch = row.branch;
            const selected = !selectedRemoteOnly && branch.name === selectedBranchName;
            return (
              <div className="tracking-table-row" key={`local-${branch.name}`} style={{ minHeight: blockHeight(branch) }}>
                <div className="tracking-cell-local">
                  <button
                    className={`tracking-branch-pill${selected ? " selected" : ""}`}
                    onClick={() => selectLocalBranch(branch.name)}
                    type="button"
                  >
                    <span className="branch-dot" style={{ background: branch.color }} />
                    <strong title={branch.name}>{branch.name}</strong>
                  </button>
                  {branch.isCurrent && <CurrentBadge />}
                </div>
                <div className="tracking-cell-tracks">
                  {branch.remotes.length === 0 ? (
                    <div className="tracking-track-line">
                      <svg width={48} height={2}>
                        <line x1={0} y1={1} x2={48} y2={1} stroke={colors.untracked} strokeWidth={1.2} strokeDasharray="4,3" />
                      </svg>
                      <span className="tracking-no-upstream">no upstream</span>
                    </div>
                  ) : (
                    branch.remotes.map((tracking) => (
                      <TrackingTrackLine key={tracking.ref} tracking={tracking} remoteColor={remoteColors.get(tracking.remote) ?? colors.fgDim} />
                    ))
                  )}
                </div>
                <div className="tracking-cell-remotes">
                  {branch.remotes.length === 0 ? (
                    <span className="untracked-mark">-</span>
                  ) : (
                    branch.remotes.map((tracking) => {
                      const remoteSelected =
                        !selectedRemoteOnly && selectedBranchName === branch.name && selectedRemote === tracking.remote;
                      return (
                        <button
                          className={`tracking-remote-pill${remoteSelected ? " selected" : ""}`}
                          key={tracking.ref}
                          onClick={() => selectLocalBranch(branch.name, tracking.remote)}
                          type="button"
                        >
                          <span className="branch-dot" style={{ background: remoteColors.get(tracking.remote) ?? colors.fgDim }} />
                          <span className="remote-row-label" title={tracking.ref}>
                            {tracking.ref}
                          </span>
                          {tracking.isConfiguredUpstream && (
                            <span className="upstream-badge" style={{ color: remoteColors.get(tracking.remote) ?? colors.accent }}>
                              upstream
                            </span>
                          )}
                          <RemoteStatusIcons ahead={tracking.ahead} behind={tracking.behind} />
                        </button>
                      );
                    })
                  )}
                </div>
              </div>
            );
          })}
          {hasRemoteOnlySection && <div className="tracking-section-label table-section">Remote-only</div>}
          {remoteOnlyRows.map((row) => {
            const { remoteBranch } = row;
            const selected =
              selectedRemoteOnly &&
              remoteBranch.branchName === selectedBranchName &&
              remoteBranch.remote === selectedRemote;
            const remoteColor = remoteColors.get(remoteBranch.remote) ?? remoteBranch.color;
            return (
              <div className="tracking-table-row remote-only-row" key={`remote-only-${remoteBranch.ref}`} style={{ minHeight: trackingRowHeight(row) }}>
                <div className="tracking-cell-local">
                  <button
                    className={`tracking-branch-pill remote-only-local${selected ? " selected" : ""}`}
                    onClick={() => selectRemoteOnlyBranch(remoteBranch)}
                    type="button"
                  >
                    <em className="remote-only-copy">no local branch</em>
                  </button>
                </div>
                <div className="tracking-cell-tracks">
                  <div className="tracking-track-line">
                    <svg width={36} height={12}>
                      <line x1={0} y1={6} x2={28} y2={6} stroke={remoteColor} strokeWidth={1.5} strokeDasharray="4,3" opacity={0.6} />
                      <polygon points="31,6 26,3 26,9" fill={remoteColor} opacity={0.7} />
                    </svg>
                    <span className="tracking-no-upstream">remote</span>
                  </div>
                </div>
                <div className="tracking-cell-remotes">
                  <button
                    className={`tracking-remote-pill${selected ? " selected" : ""}`}
                    onClick={() => selectRemoteOnlyBranch(remoteBranch)}
                    type="button"
                  >
                    <span className="branch-dot" style={{ background: remoteColor }} />
                    <span className="remote-row-label" title={remoteBranch.ref}>
                      {remoteBranch.ref}
                    </span>
                    <span className="upstream-badge" style={{ color: remoteColor }}>remote</span>
                  </button>
                </div>
              </div>
            );
          })}
        </div>
        {trackingRows.length === 0 && <div className="empty-panel">No branch tracking data found.</div>}
      </div>
      <div className="tracking-footer">
        <div className="legend-row">
          <LegendItem color={colors.ahead} label="+N ahead" dot />
          <LegendItem color={colors.behind} label="-N behind" dot />
          <LegendItem color={colors.synced} label="synced" dot />
          <LegendItem color={colors.untracked} label="untracked" dot />
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
            remoteOnly={selectedRemoteOnly}
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
            disabled={!actionBranchName || selectedRemoteOnly}
            primary={trackingStatus === "no-upstream"}
            onClick={() => runBranchAction("set-upstream")}
          />
          <QuickButton icon="refresh" label="Prune Stale" onClick={() => onBranchAction("prune-stale")} />
        </div>
      </div>
    </section>
  );
}

function TrackingTrackLine({ tracking, remoteColor }: { tracking: RemoteTracking; remoteColor: string }) {
  return (
    <div className="tracking-track-line">
      {tracking.ahead > 0 && <span className="track-count ahead">+{tracking.ahead}</span>}
      <svg width={36} height={12}>
        <line x1={0} y1={6} x2={28} y2={6} stroke={remoteColor} strokeWidth={1.5} opacity={0.6} />
        <polygon points="31,6 26,3 26,9" fill={remoteColor} opacity={0.7} />
      </svg>
      {tracking.ahead === 0 && tracking.behind === 0 && (
        <svg width={14} height={14} viewBox="0 0 16 16">
          <polyline points="4,8.5 7,11 12,5" fill="none" stroke={colors.synced} strokeWidth={2} strokeLinecap="round" strokeLinejoin="round" />
        </svg>
      )}
      {tracking.behind > 0 && <span className="track-count behind">-{tracking.behind}</span>}
    </div>
  );
}

function RemoteStatusIcons({ ahead, behind }: { ahead: number; behind: number }) {
  if (ahead === 0 && behind === 0) {
    return (
      <svg width={14} height={14} viewBox="0 0 16 16" className="remote-sync-icon">
        <polyline points="4,8.5 7,11 12,5" fill="none" stroke={colors.synced} strokeWidth={2} strokeLinecap="round" strokeLinejoin="round" />
      </svg>
    );
  }
  return (
    <span className="status-pill">
      {ahead > 0 && <span className="ahead">+{ahead}</span>}
      {behind > 0 && <span className="behind">-{behind}</span>}
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
  trackingRef,
  remoteOnly
}: {
  branchName: string;
  checkoutBranch?: string;
  detached: boolean;
  detachedLabel: string;
  status: TrackingStatus;
  tracking?: RemoteTracking;
  trackingRef?: string;
  remoteOnly?: boolean;
}) {
  const statusColor =
    status === "synced"
      ? colors.synced
      : status === "ahead"
        ? colors.ahead
        : status === "behind"
          ? colors.behind
          : status === "diverged"
            ? colors.behind
            : status === "remote-only"
              ? colors.synced
              : colors.untracked;

  const statusIcon: IconName =
    status === "synced"
      ? "check"
      : status === "ahead"
        ? "up"
        : status === "behind"
          ? "down"
          : status === "diverged"
            ? "branch"
            : status === "remote-only"
              ? "remote"
              : "remote";

  let headline = "No upstream configured";
  let detail = "Set upstream to track a remote branch.";

  if (remoteOnly) {
    headline = "Remote branch only";
    detail = `No local branch named ${branchName}. Use Create Local Branch to fetch ${trackingRef}.`;
  } else if (tracking) {
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
          {remoteOnly ? (
            <>
              <span className="muted">—</span> <span className="mono">{trackingRef}</span>
            </>
          ) : (
            <>
              <strong className="mono">{branchName}</strong>
              {trackingRef ? (
                <>
                  {" "}
                  <span className="muted">→</span> <span className="mono">{trackingRef}</span>
                </>
              ) : null}
            </>
          )}
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
