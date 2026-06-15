import { useEffect, useMemo, useState, type ReactNode } from "react";
import type { BranchAction, BranchInfo, RemoteBranchInfo, RemoteConfig, RemoteTracking } from "../../../shared/types";
import { Icon, type IconName } from "../../icons";
import { useThemeColors } from "../../ThemeProvider";
import { branchColor, blockHeight, buildTrackingRows, remoteBranchNameFromRef, remoteColor, resolveSelectedTracking, trackingRowHeight, type TrackingRow, hasMissingRemoteTrackingForTarget, addUpstreamRemoteBranchName } from "../../utils";
import { CurrentBadge } from "../badges";

type TrackingStatus = "synced" | "ahead" | "behind" | "diverged" | "no-upstream" | "remote-only";

function resolveCurrentBranchName(branches: BranchInfo[], currentBranch: string): string | undefined {
  if (currentBranch.startsWith("DETACHED")) {
    return undefined;
  }
  const match = branches.find((branch) => branch.isCurrent || branch.name === currentBranch);
  return match?.name ?? currentBranch;
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

function isRemoteDefaultBranch(remotes: RemoteConfig[], remoteName: string, branchName: string): boolean {
  const remoteDefault = remotes.find((remote) => remote.name === remoteName)?.defaultBranch;
  return Boolean(remoteDefault && remoteDefault === branchName);
}

function TrackingRemoteEntry({
  isDefault,
  defaultIconColor,
  selected,
  onClick,
  children
}: {
  isDefault: boolean;
  defaultIconColor: string;
  selected: boolean;
  onClick: () => void;
  children: ReactNode;
}) {
  return (
    <div className="tracking-remote-entry">
      {isDefault && (
        <span className="remote-default-icon" title="Default branch on this remote">
          <Icon type="defaultBranch" size={14} color={defaultIconColor} />
        </span>
      )}
      <button className={`tracking-remote-pill${selected ? " selected" : ""}`} onClick={onClick} type="button">
        {children}
      </button>
    </div>
  );
}

export function TrackingView({
  branches,
  remoteBranches,
  remotes,
  currentBranch,
  defaultBranch,
  onBranchAction
}: {
  branches: BranchInfo[];
  remoteBranches: RemoteBranchInfo[];
  remotes: RemoteConfig[];
  currentBranch: string;
  defaultBranch: string;
  onBranchAction: (action: BranchAction, branchName?: string, remote?: string, remoteBranchName?: string) => void;
}) {
  const theme = useThemeColors();
  const trackingRows = useMemo(() => buildTrackingRows(branches, remoteBranches), [branches, remoteBranches]);
  const localRows = useMemo(() => trackingRows.filter((row): row is Extract<TrackingRow, { kind: "local" }> => row.kind === "local"), [trackingRows]);
  const remoteOnlyRows = useMemo(
    () => trackingRows.filter((row): row is Extract<TrackingRow, { kind: "remote-only" }> => row.kind === "remote-only"),
    [trackingRows]
  );
  const remoteColors = useMemo(
    () => new Map(remotes.map((remote) => [remote.name, remoteColor(remote.colorIndex, theme)])),
    [remotes, theme]
  );
  const detached = currentBranch.startsWith("DETACHED");
  const currentBranchLabel = detached ? currentBranch.replace(/^DETACHED\s*/, "") : currentBranch;
  const checkoutBranch = resolveCurrentBranchName(branches, currentBranch);
  const [selectedBranchName, setSelectedBranchName] = useState<string | undefined>(checkoutBranch);
  const [selectedTrackingRef, setSelectedTrackingRef] = useState<string | undefined>();
  const [selectedRemoteOnly, setSelectedRemoteOnly] = useState(false);

  useEffect(() => {
    if (!selectedBranchName) {
      return;
    }
    if (selectedRemoteOnly) {
      const remoteOnlyMatch = remoteOnlyRows.some((row) => row.remoteBranch.ref === selectedTrackingRef);
      if (remoteOnlyMatch) {
        return;
      }
    } else {
      const branch = branches.find((candidate) => candidate.name === selectedBranchName);
      if (branch && (!selectedTrackingRef || branch.remotes.some((tracking) => tracking.ref === selectedTrackingRef))) {
        return;
      }
    }
    setSelectedBranchName(checkoutBranch ?? branches[0]?.name);
    setSelectedTrackingRef(undefined);
    setSelectedRemoteOnly(false);
  }, [branches, checkoutBranch, remoteOnlyRows, selectedBranchName, selectedTrackingRef, selectedRemoteOnly]);

  const selectedLocalBranch =
    !selectedRemoteOnly ? branches.find((branch) => branch.name === selectedBranchName) : undefined;
  const selectedRemoteBranch =
    selectedRemoteOnly
      ? remoteOnlyRows.find((row) => row.remoteBranch.ref === selectedTrackingRef)?.remoteBranch
      : undefined;
  const selectedBranch = selectedLocalBranch ?? branches.find((branch) => branch.isCurrent) ?? branches[0];
  const actionBranchName = selectedRemoteOnly ? selectedRemoteBranch?.branchName : selectedLocalBranch?.name ?? selectedBranch?.name;
  const selectedTracking = selectedRemoteOnly
    ? undefined
    : resolveSelectedTracking(selectedLocalBranch ?? selectedBranch, selectedTrackingRef);
  const actionRemote = selectedRemoteOnly ? selectedRemoteBranch?.remote : selectedTracking?.remote;
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
  const actionRemoteBranchName = selectedRemoteOnly
    ? selectedRemoteBranch?.branchName
    : selectedTracking && actionRemote
      ? remoteBranchNameFromRef(selectedTracking.ref, actionRemote)
      : undefined;
  const deleteLocalLabel = actionBranchName ? `Delete Local ${actionBranchName}` : "Delete Local Branch";
  const deleteRemoteLabel =
    actionRemote && actionRemoteBranchName ? `Delete Remote ${actionRemote}/${actionRemoteBranchName}` : "Delete Remote Branch";
  const needsInitialUpstream = trackingStatus === "no-upstream" || selectedTracking?.remoteRefExists === false;
  const needsPushUpstream = trackingStatus === "no-upstream" || selectedTracking?.remoteRefExists === false;
  const configuredUpstream = selectedLocalBranch?.remotes.find((tracking) => tracking.isConfiguredUpstream);
  const defaultUpstreamRef = configuredUpstream?.ref;
  const hasExistingTracking = Boolean(selectedLocalBranch?.remotes.some((tracking) => tracking.remoteRefExists));
  const addUpstreamTargetBranchName = selectedLocalBranch
    ? addUpstreamRemoteBranchName(selectedLocalBranch, selectedTrackingRef)
    : undefined;
  const hasUntrackedRemotes = Boolean(
    selectedLocalBranch &&
      addUpstreamTargetBranchName &&
      hasMissingRemoteTrackingForTarget(selectedLocalBranch, remotes, addUpstreamTargetBranchName)
  );
  const canAddRemoteTracking = Boolean(
    !selectedRemoteOnly &&
      actionBranchName &&
      hasExistingTracking &&
      remotes.length > 1 &&
      hasUntrackedRemotes &&
      !needsInitialUpstream
  );
  const remoteRowExplicitlySelected = Boolean(selectedTrackingRef);
  const canSetDefaultUpstream = Boolean(
    !selectedRemoteOnly &&
      remoteRowExplicitlySelected &&
      selectedTracking &&
      selectedTracking.remoteRefExists &&
      !selectedTracking.isConfiguredUpstream
  );
  const showDefaultUpstreamSlot = Boolean(
    !selectedRemoteOnly &&
      actionBranchName &&
      (needsInitialUpstream ||
        canSetDefaultUpstream ||
        (remoteRowExplicitlySelected && Boolean(selectedTracking?.isConfiguredUpstream) && !canAddRemoteTracking))
  );
  const upstreamAction: BranchAction = needsInitialUpstream ? "set-upstream" : "set-default-upstream";
  const upstreamLabel = needsInitialUpstream
    ? needsPushUpstream
      ? "Push and Set Upstream"
      : "Set Upstream"
    : "Set as Default Upstream";
  const upstreamDisabled = Boolean(
    !actionBranchName || selectedRemoteOnly || (!needsInitialUpstream && !canSetDefaultUpstream)
  );
  const upstreamPrimary = Boolean(needsInitialUpstream || canSetDefaultUpstream);
  const canDeleteLocal = Boolean(
    !selectedRemoteOnly && actionBranchName && !selectedLocalBranch?.isCurrent && actionBranchName !== defaultBranch
  );
  const selectedRemoteDefaultBranch = actionRemote ? remotes.find((candidate) => candidate.name === actionRemote)?.defaultBranch : undefined;
  const protectedRemoteBranch = selectedRemoteDefaultBranch ?? defaultBranch;
  const canDeleteRemote = Boolean(
    actionRemote &&
      actionRemoteBranchName &&
      actionRemoteBranchName !== protectedRemoteBranch &&
      (selectedRemoteOnly || selectedTrackingRef) &&
      (selectedRemoteOnly || selectedTracking?.remoteRefExists)
  );
  const checkoutUsesRemoteSource = Boolean(
    selectedRemoteOnly || (remoteRowExplicitlySelected && selectedTracking?.remoteRefExists)
  );
  const checkoutRemote = checkoutUsesRemoteSource ? actionRemote : undefined;
  const checkoutRemoteBranchName = checkoutUsesRemoteSource ? actionRemoteBranchName : undefined;
  const canCheckoutNewLocalBranch = Boolean(
    selectedRemoteOnly
      ? selectedRemoteBranch
      : remoteRowExplicitlySelected
        ? selectedTracking?.remoteRefExists && actionRemote && actionRemoteBranchName
        : actionBranchName
  );

  function selectLocalBranch(branchName: string, trackingRef?: string) {
    setSelectedBranchName(branchName);
    setSelectedTrackingRef(trackingRef);
    setSelectedRemoteOnly(false);
  }

  function selectRemoteOnlyBranch(remoteBranch: RemoteBranchInfo) {
    setSelectedBranchName(remoteBranch.branchName);
    setSelectedTrackingRef(remoteBranch.ref);
    setSelectedRemoteOnly(true);
  }

  function runBranchAction(action: BranchAction) {
    if (!actionBranchName) {
      return;
    }
    const remote = action === "add-upstream" ? undefined : actionRemote;
    const remoteBranchName =
      action === "add-upstream" ? addUpstreamTargetBranchName : actionRemoteBranchName;
    onBranchAction(action, actionBranchName, remote, remoteBranchName);
  }

  function runDeleteRemote() {
    if (!actionRemote || !actionRemoteBranchName) {
      return;
    }
    onBranchAction("delete-remote", actionBranchName, actionRemote, actionRemoteBranchName);
  }

  function runCheckoutNewLocalBranch() {
    if (!canCheckoutNewLocalBranch) {
      return;
    }
    if (checkoutUsesRemoteSource && checkoutRemote && checkoutRemoteBranchName) {
      onBranchAction("checkout-new-local-branch", actionBranchName, checkoutRemote, checkoutRemoteBranchName);
      return;
    }
    if (actionBranchName) {
      onBranchAction("checkout-new-local-branch", actionBranchName);
    }
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
        {remotes.map((remote) => {
          const color = remoteColor(remote.colorIndex, theme);
          return (
            <div className="remote-chip" key={remote.name}>
              <span className="remote-chip-dot" style={{ background: color }} />
              <strong>{remote.name}</strong>
              {remote.defaultBranch ? (
                <span className="remote-chip-default" title={`Default branch on ${remote.name}`}>
                  <Icon type="defaultBranch" size={11} color={theme.defaultBranch} />
                  {remote.defaultBranch}
                </span>
              ) : null}
              <em title={remote.url}>{remote.url}</em>
            </div>
          );
        })}
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
                    <span className="branch-dot" style={{ background: branchColor(branch.colorIndex, theme) }} />
                    <strong title={branch.name}>{branch.name}</strong>
                  </button>
                  {branch.isCurrent && <CurrentBadge />}
                </div>
                <div className="tracking-cell-tracks">
                  {branch.remotes.length === 0 ? (
                    <div className="tracking-track-line">
                      <svg width={48} height={2}>
                        <line x1={0} y1={1} x2={48} y2={1} stroke={theme.untracked} strokeWidth={1.2} strokeDasharray="4,3" />
                      </svg>
                      <span className="tracking-no-upstream">no upstream</span>
                    </div>
                  ) : (
                    branch.remotes.map((tracking) => (
                      <TrackingTrackLine key={tracking.ref} tracking={tracking} remoteColor={remoteColors.get(tracking.remote) ?? theme.fgDim} syncedColor={theme.synced} />
                    ))
                  )}
                </div>
                <div className="tracking-cell-remotes">
                  {branch.remotes.length === 0 ? (
                    <span className="untracked-mark">-</span>
                  ) : (
                    branch.remotes.map((tracking) => {
                      const remoteSelected =
                        !selectedRemoteOnly && selectedBranchName === branch.name && selectedTrackingRef === tracking.ref;
                      const remoteBranchName = remoteBranchNameFromRef(tracking.ref, tracking.remote);
                      const remoteColorValue = remoteColors.get(tracking.remote) ?? theme.fgDim;
                      const isDefault = isRemoteDefaultBranch(remotes, tracking.remote, remoteBranchName);
                      return (
                        <TrackingRemoteEntry
                          defaultIconColor={theme.defaultBranch}
                          isDefault={isDefault}
                          key={tracking.ref}
                          onClick={() => selectLocalBranch(branch.name, tracking.ref)}
                          selected={remoteSelected}
                        >
                          <span className="branch-dot" style={{ background: remoteColorValue }} />
                          <span className="remote-row-label" title={tracking.ref}>
                            {tracking.ref}
                          </span>
                          {tracking.isConfiguredUpstream && (
                            <span className="upstream-badge" style={{ color: remoteColorValue }}>
                              default
                            </span>
                          )}
                          {!tracking.remoteRefExists && (
                            <span className="upstream-badge stale-upstream-badge">not on remote</span>
                          )}
                          <RemoteStatusIcons ahead={tracking.ahead} behind={tracking.behind} syncedColor={theme.synced} />
                        </TrackingRemoteEntry>
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
              selectedTrackingRef === remoteBranch.ref;
            const remoteColorValue = remoteColors.get(remoteBranch.remote) ?? remoteColor(remoteBranch.colorIndex, theme);
            const isDefault = isRemoteDefaultBranch(remotes, remoteBranch.remote, remoteBranch.branchName);
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
                      <line x1={0} y1={6} x2={28} y2={6} stroke={remoteColorValue} strokeWidth={1.5} strokeDasharray="4,3" opacity={0.6} />
                      <polygon points="31,6 26,3 26,9" fill={remoteColorValue} opacity={0.7} />
                    </svg>
                    <span className="tracking-no-upstream">remote</span>
                  </div>
                </div>
                <div className="tracking-cell-remotes">
                  <TrackingRemoteEntry
                    defaultIconColor={theme.defaultBranch}
                    isDefault={isDefault}
                    onClick={() => selectRemoteOnlyBranch(remoteBranch)}
                    selected={selected}
                  >
                    <span className="branch-dot" style={{ background: remoteColorValue }} />
                    <span className="remote-row-label" title={remoteBranch.ref}>
                      {remoteBranch.ref}
                    </span>
                    <span className="upstream-badge" style={{ color: remoteColorValue }}>
                      remote
                    </span>
                  </TrackingRemoteEntry>
                </div>
              </div>
            );
          })}
        </div>
        {trackingRows.length === 0 && <div className="empty-panel">No branch tracking data found.</div>}
      </div>
      <div className="tracking-footer">
        <div className="legend-row">
          <LegendItem color={theme.ahead} label="+N ahead" dot />
          <LegendItem color={theme.behind} label="-N behind" dot />
          <LegendItem color={theme.synced} label="synced" dot />
          <LegendItem color={theme.untracked} label="untracked" dot />
          <LegendItem color={theme.defaultBranch} icon="defaultBranch" label="default branch" />
          {remotes.map((remote) => (
            <LegendItem key={remote.name} color={remoteColor(remote.colorIndex, theme)} label={remote.name} dot />
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
            defaultUpstreamRef={defaultUpstreamRef}
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
          <QuickButton
            icon="plus"
            label="Checkout New Branch"
            disabled={!canCheckoutNewLocalBranch}
            onClick={runCheckoutNewLocalBranch}
          />
          <QuickButton icon="fetch" label="Fetch All Remotes" onClick={() => onBranchAction("fetch")} />
          {canAddRemoteTracking && (
            <QuickButton
              icon="branch"
              label="Add Remote Tracking"
              disabled={!actionBranchName || selectedRemoteOnly}
              onClick={() => runBranchAction("add-upstream")}
            />
          )}
          {showDefaultUpstreamSlot && (
            <QuickButton
              icon="branch"
              label={upstreamLabel}
              disabled={upstreamDisabled}
              primary={upstreamPrimary}
              onClick={() => runBranchAction(upstreamAction)}
            />
          )}
          <QuickButton icon="refresh" label="Prune Stale" onClick={() => onBranchAction("prune-stale")} />
          <QuickButton
            icon="trash"
            label={deleteLocalLabel}
            disabled={!canDeleteLocal}
            danger
            onClick={() => runBranchAction("delete")}
          />
          <QuickButton
            icon="trash"
            label={deleteRemoteLabel}
            disabled={!canDeleteRemote}
            danger
            onClick={runDeleteRemote}
          />
        </div>
      </div>
    </section>
  );
}

function TrackingTrackLine({ tracking, remoteColor: lineColor, syncedColor }: { tracking: RemoteTracking; remoteColor: string; syncedColor: string }) {
  return (
    <div className="tracking-track-line">
      {tracking.ahead > 0 && <span className="track-count ahead">+{tracking.ahead}</span>}
      <svg width={36} height={12}>
        <line x1={0} y1={6} x2={28} y2={6} stroke={lineColor} strokeWidth={1.5} opacity={0.6} />
        <polygon points="31,6 26,3 26,9" fill={lineColor} opacity={0.7} />
      </svg>
      {tracking.ahead === 0 && tracking.behind === 0 && (
        <svg width={14} height={14} viewBox="0 0 16 16">
          <polyline points="4,8.5 7,11 12,5" fill="none" stroke={syncedColor} strokeWidth={2} strokeLinecap="round" strokeLinejoin="round" />
        </svg>
      )}
      {tracking.behind > 0 && <span className="track-count behind">-{tracking.behind}</span>}
    </div>
  );
}

function RemoteStatusIcons({ ahead, behind, syncedColor }: { ahead: number; behind: number; syncedColor: string }) {
  if (ahead === 0 && behind === 0) {
    return (
      <svg width={14} height={14} viewBox="0 0 16 16" className="remote-sync-icon">
        <polyline points="4,8.5 7,11 12,5" fill="none" stroke={syncedColor} strokeWidth={2} strokeLinecap="round" strokeLinejoin="round" />
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
  defaultUpstreamRef,
  detached,
  detachedLabel,
  status,
  tracking,
  trackingRef,
  remoteOnly
}: {
  branchName: string;
  checkoutBranch?: string;
  defaultUpstreamRef?: string;
  detached: boolean;
  detachedLabel: string;
  status: TrackingStatus;
  tracking?: RemoteTracking;
  trackingRef?: string;
  remoteOnly?: boolean;
}) {
  const theme = useThemeColors();
  const statusColor =
    status === "synced"
      ? theme.synced
      : status === "ahead"
        ? theme.ahead
        : status === "behind"
          ? theme.behind
          : status === "diverged"
            ? theme.behind
            : status === "remote-only"
              ? theme.synced
              : theme.untracked;

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
    if (defaultUpstreamRef && trackingRef && trackingRef !== defaultUpstreamRef) {
      detail = `${defaultUpstreamRef} is default. ${detail}`;
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
  danger,
  onClick
}: {
  icon: IconName;
  label: string;
  disabled?: boolean;
  primary?: boolean;
  danger?: boolean;
  onClick: () => void;
}) {
  const theme = useThemeColors();
  const iconColor = primary && !disabled ? theme.buttonFg : danger && !disabled ? theme.behind : theme.accent;
  return (
    <button
      className={`quick-button${primary && !disabled ? " primary" : ""}${danger ? " danger" : ""}`}
      disabled={disabled}
      onClick={onClick}
      type="button"
    >
      <Icon type={icon} size={13} color={iconColor} />
      {label}
    </button>
  );
}
