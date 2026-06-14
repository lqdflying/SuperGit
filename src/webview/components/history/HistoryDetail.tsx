import type { BranchAction, BranchHistoryWindow, BranchLifecycle } from "../../../shared/types";
import { useThemeColors } from "../../ThemeProvider";
import { branchColor, formatHistoryDayLabel, remoteColor } from "../../utils";
import { computeIdleDays } from "./timelineLayout";

export function HistoryDetail({
  branch,
  defaultBranch,
  window,
  onBranchAction
}: {
  branch: BranchLifecycle;
  defaultBranch: string;
  window: BranchHistoryWindow;
  onBranchAction: (action: BranchAction, branchName?: string, remote?: string) => void;
}) {
  const theme = useThemeColors();
  const brC = branch.remoteOnly ? remoteColor(branch.colorIndex, theme) : branchColor(branch.colorIndex, theme);
  const statusColor =
    branch.status === "active"
      ? theme.historyOk
      : branch.status === "merged"
        ? theme.historyMerged
        : branch.status === "diverged"
          ? branch.severity === "mild"
            ? theme.historyWarn
            : theme.historyDanger
          : theme.fgMuted;

  const actions: Array<{ label: string; action: BranchAction; primary?: boolean; danger?: boolean; remote?: string }> = [];

  if (branch.remoteOnly) {
    actions.push({ label: "Create Local Branch", action: "pull", primary: true, remote: branch.remote });
  } else if (branch.name !== defaultBranch) {
    if (branch.status === "diverged") {
      if (branch.aheadOfMain > 0) {
        actions.push({ label: `Push ${branch.aheadOfMain}`, action: "push", primary: true, remote: branch.remotes[0]?.name });
      }
      if (branch.behindMain > 0) {
        actions.push({ label: `Pull ${branch.behindMain}`, action: "pull", primary: true, remote: branch.remotes[0]?.name });
      }
    } else if (branch.status === "active") {
      if (branch.aheadOfMain > 0) {
        actions.push({ label: `Push ${branch.aheadOfMain}`, action: "push", primary: true, remote: branch.remotes[0]?.name });
      } else if (branch.behindMain > 0) {
        actions.push({ label: `Pull ${branch.behindMain}`, action: "pull", primary: true, remote: branch.remotes[0]?.name });
      } else if (branch.remotes.length === 0) {
        actions.push({ label: "Set Upstream", action: "set-upstream", primary: true });
      }
    }
    if (branch.stale && branch.status === "merged") {
      actions.push({ label: "Delete branch", action: "delete", danger: true });
    }
  }

  actions.push({ label: "Fetch", action: "fetch" });
  if (!branch.remoteOnly) {
    actions.push({ label: "Prune stale refs", action: "prune-stale" });
  }

  const lastCommitDay = branch.commitDays[branch.commitDays.length - 1] ?? branch.endDay;
  const idleDays = computeIdleDays(window.totalDays - 1, lastCommitDay);
  const lastActiveLabel = branch.commitDays.length > 0 ? `${idleDays}d ago` : "—";

  return (
    <aside className="branch-history-detail">
      <div className="branch-history-detail-header">
        <div style={{ display: "flex", alignItems: "center", gap: 10, marginBottom: 10 }}>
          <div className="branch-dot large" style={{ background: brC, boxShadow: `0 0 10px ${brC}44` }} />
          <span className="branch-history-detail-name">{branch.remoteOnly ? `${branch.remote}/${branch.name}` : branch.name}</span>
        </div>
        <span className="branch-history-status-pill" style={{ color: statusColor, background: `${statusColor}15`, border: `1px solid ${statusColor}25` }}>
          {branch.remoteOnly ? "Remote branch only" : branch.status === "diverged" ? `Diverged${branch.severity ? ` · ${branch.severity}` : ""}` : branch.status}
        </span>
        {branch.stale && (
          <span className="branch-history-status-pill" style={{ color: theme.historyStale, background: `${theme.historyStale}15`, border: `1px solid ${theme.historyStale}25` }}>
            Stale
          </span>
        )}
        <p className="branch-history-description">{branch.description}</p>
      </div>

      <section className="branch-history-detail-section">
        <div className="branch-history-detail-title">Commit References</div>
        <HashRow label="Fork point" hash={branch.hashStart} date={branch.startDate} color={brC} />
        <HashRow
          label={branch.status === "merged" ? "Merge commit" : branch.remoteOnly ? "Remote HEAD" : "Local HEAD"}
          hash={branch.hashEnd}
          date={branch.endDate}
          color={branch.status === "merged" ? theme.historyMerged : brC}
        />
        {!branch.remoteOnly && branch.name !== defaultBranch && branch.status !== "merged" && branch.hashLca && (
          <HashRow label="Last common ancestor" hash={branch.hashLca} date={branch.lastCommonAncestorDate ?? ""} color={theme.fgMuted} />
        )}
      </section>

      {branch.remotes.length > 0 && (
        <section className="branch-history-detail-section">
          <div className="branch-history-detail-title">Remote Tracking</div>
          {branch.remotes.map((remote) => (
            <div key={remote.name} className="branch-history-remote-card">
              <div style={{ display: "flex", alignItems: "center", gap: 6, marginBottom: 4 }}>
                <div className="branch-dot" style={{ background: remoteColor(remote.colorIndex, theme) }} />
                <strong>{remote.name}</strong>
                <span className="branch-history-hash-pill">{remote.hash}</span>
              </div>
              <div style={{ fontSize: 11, paddingLeft: 13 }}>
                {remote.behindLocal === 0 ? (
                  <span style={{ color: theme.synced }}>Fully pushed</span>
                ) : (
                  <span style={{ color: theme.historyWarn }}>{remote.behindLocal} unpushed commits</span>
                )}
                <span style={{ color: theme.fgMuted }}> · pushed at {formatHistoryDayLabel(remote.pushDate)}</span>
              </div>
              {branch.divergePerRemote
                ?.filter((entry) => entry.remote === remote.name)
                .map((entry) => (
                  <div key={entry.remote} style={{ fontSize: 10, paddingLeft: 13, marginTop: 4 }}>
                    <span style={{ color: theme.fgMuted }}>vs {entry.mainRef}: </span>
                    <span style={{ color: entry.behind > 10 ? theme.historyDanger : theme.historyWarn, fontWeight: 600, fontFamily: "monospace" }}>
                      -{entry.behind} behind
                    </span>
                  </div>
                ))}
            </div>
          ))}
        </section>
      )}

      {!branch.remoteOnly && branch.name !== defaultBranch && (
        <section className="branch-history-detail-section">
          <div className="branch-history-detail-title">Divergence from {defaultBranch}</div>
          {branch.status === "merged" ? (
            <span style={{ color: theme.historyMerged }}>Fully merged</span>
          ) : branch.aheadOfMain === 0 && branch.behindMain === 0 ? (
            <span style={{ color: theme.synced }}>In sync</span>
          ) : (
            <>
              <div className="branch-history-divergence-bar">
                {branch.aheadOfMain > 0 && <div style={{ flex: branch.aheadOfMain, background: theme.ahead }} />}
                {branch.behindMain > 0 && <div style={{ flex: branch.behindMain, background: branch.behindMain > 10 ? theme.historyDanger : theme.historyWarn }} />}
              </div>
              <div style={{ display: "flex", justifyContent: "space-between", fontSize: 11 }}>
                {branch.aheadOfMain > 0 && <span style={{ color: theme.ahead, fontFamily: "monospace", fontWeight: 600 }}>+{branch.aheadOfMain} ahead</span>}
                {branch.behindMain > 0 && (
                  <span style={{ color: branch.behindMain > 10 ? theme.historyDanger : theme.historyWarn, fontFamily: "monospace", fontWeight: 600 }}>
                    -{branch.behindMain} behind
                  </span>
                )}
              </div>
            </>
          )}
        </section>
      )}

      <section className="branch-history-detail-section">
        <div className="branch-history-detail-title">Metrics</div>
        <div className="branch-history-metric-grid">
          <MetricCell label="Commits" value={String(branch.totalCommits)} />
          <MetricCell label="Age" value={`${branch.endDay - branch.startDay + 1}d`} />
          <MetricCell label="Last active" value={lastActiveLabel} color={branch.stale ? theme.historyWarn : undefined} />
          <MetricCell label="Status" value={branch.remoteOnly ? "Remote-only" : branch.status} color={statusColor} />
        </div>
      </section>

      <section className="branch-history-detail-section">
        <div className="branch-history-detail-title">Quick Actions</div>
        <div className="branch-history-actions">
          {actions.map((entry) => (
            <button
              key={entry.label}
              className={`quick-button${entry.primary ? " primary" : ""}${entry.danger ? " danger" : ""}`}
              type="button"
              onClick={() => onBranchAction(entry.action, branch.name, entry.remote ?? branch.remotes[0]?.name ?? branch.remote)}
            >
              {entry.label}
            </button>
          ))}
        </div>
      </section>
    </aside>
  );
}

function HashRow({ label, hash, date, color }: { label: string; hash: string; date: string; color: string }) {
  return (
    <div className="branch-history-hash-row">
      <div className="branch-dot small" style={{ background: color }} />
      <div>
        <div style={{ fontSize: 11, color: "var(--sg-fg-dim)" }}>{label}</div>
        <div style={{ display: "flex", alignItems: "center", gap: 6 }}>
          <span className="branch-history-hash-pill">{hash}</span>
          {date && <span style={{ fontSize: 10, color: "var(--sg-fg-muted)" }}>{formatHistoryDayLabel(date)}</span>}
        </div>
      </div>
    </div>
  );
}

function MetricCell({ label, value, color }: { label: string; value: string; color?: string }) {
  return (
    <div className="branch-history-metric-cell">
      <div className="branch-history-metric-label">{label}</div>
      <div className="branch-history-metric-value" style={color ? { color } : undefined}>
        {value}
      </div>
    </div>
  );
}
