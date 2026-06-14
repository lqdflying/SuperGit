import { useEffect, useMemo, useState } from "react";
import type { BranchAction, BranchHistoryWindow, BranchLifecycle, DateRange } from "../../../shared/types";
import { DateRangeBar } from "../graph/DateRangeBar";
import { useThemeColors } from "../../ThemeProvider";
import { branchColor, formatHistoryDayLabel, remoteColor, sortBranchLifecycles } from "../../utils";
import { branchKey, TimelineSvg } from "./TimelineSvg";
import { HistoryDetail } from "./HistoryDetail";
import { useTimelineLayout } from "./useTimelineLayout";

export function BranchHistoryTab({
  lifecycles,
  defaultBranch,
  window,
  dateRange,
  customFrom,
  customTo,
  loading,
  onPreset,
  onCustomFrom,
  onCustomTo,
  onShowCustom,
  onBranchAction
}: {
  lifecycles: BranchLifecycle[];
  defaultBranch: string;
  window: BranchHistoryWindow;
  dateRange: DateRange;
  customFrom: string;
  customTo: string;
  loading: boolean;
  onPreset: (days: 7 | 14 | 30 | null) => void;
  onCustomFrom: (value: string) => void;
  onCustomTo: (value: string) => void;
  onShowCustom: () => void;
  onBranchAction: (action: BranchAction, branchName?: string, remote?: string) => void;
}) {
  const theme = useThemeColors();
  const sorted = useMemo(() => sortBranchLifecycles(lifecycles, defaultBranch), [lifecycles, defaultBranch]);
  const visible = useMemo(() => sorted.filter((branch) => branch.endDay >= 0), [sorted]);

  const defaultBranchColorIndex = lifecycles.find((branch) => branch.name === defaultBranch && !branch.remoteOnly)?.colorIndex ?? 0;
  const mainColor = branchColor(defaultBranchColorIndex, theme);
  const remoteSampleColor = remoteColor(0, theme);

  const { containerRef, dayWidth, svgWidth, lx, showHashLabels, showRemoteMarkers } = useTimelineLayout(window.totalDays);

  const [selectedKey, setSelectedKey] = useState("");
  const [hoveredKey, setHoveredKey] = useState<string | null>(null);

  useEffect(() => {
    if (visible.length === 0) {
      setSelectedKey("");
      return;
    }
    if (selectedKey && visible.some((branch) => branchKey(branch) === selectedKey)) {
      return;
    }
    const current = visible.find((branch) => branch.isCurrent);
    const diverged = visible.find((branch) => branch.status === "diverged");
    const main = visible.find((branch) => branch.name === defaultBranch);
    const fallback = current ?? diverged ?? main ?? visible[0];
    setSelectedKey(branchKey(fallback));
  }, [visible, selectedKey, defaultBranch]);

  const selected = visible.find((branch) => branchKey(branch) === selectedKey);

  const counts = {
    active: visible.filter((branch) => branch.status === "active").length,
    diverged: visible.filter((branch) => branch.status === "diverged").length,
    merged: visible.filter((branch) => branch.status === "merged").length,
    stale: visible.filter((branch) => branch.stale).length
  };

  return (
    <div className="branch-history-tab">
      <DateRangeBar
        dateRange={dateRange}
        customFrom={customFrom}
        customTo={customTo}
        total={visible.length}
        onPreset={onPreset}
        onCustomFrom={onCustomFrom}
        onCustomTo={onCustomTo}
        onShowCustom={onShowCustom}
      />

      <div className="branch-history-summary">
        <SummaryStat label="active" count={counts.active} color={theme.historyOk} />
        <SummaryStat label="diverged" count={counts.diverged} color={theme.historyDanger} />
        <SummaryStat label="merged" count={counts.merged} color={theme.historyMerged} />
        <SummaryStat label="stale" count={counts.stale} color={theme.historyWarn} />
        <span className="branch-history-summary-range">
          {formatHistoryDayLabel(window.startDate)} — {formatHistoryDayLabel(window.endDate)}
        </span>
      </div>

      <div className="branch-history-legend">
        <span className="branch-history-legend-item">● Active</span>
        <span className="branch-history-legend-item">⚠ Diverged</span>
        <span className="branch-history-legend-item">✓ Merged</span>
        <span className="branch-history-legend-item">○ Remote-only</span>
        <span className="branch-history-legend-item">
          <span className="branch-history-stale-tag">stale</span>
          No recent activity
        </span>
        <span className="branch-history-legend-item">
          <svg className="branch-history-legend-icon" width={12} height={8} aria-hidden="true">
            <circle cx={4} cy={4} r={3} fill={theme.fgBright} />
            <circle cx={10} cy={4} r={2} fill="none" stroke={theme.fgMuted} strokeWidth={1} />
          </svg>
          Commit / Main ghost
        </span>
        <span className="branch-history-legend-item">
          <svg className="branch-history-legend-icon" width={22} height={8} aria-hidden="true">
            <rect width={22} height={4} y={2} rx={2} fill={mainColor} opacity={0.3} />
          </svg>
          Main path (diverge view)
        </span>
        <span className="branch-history-legend-item">
          <span className="branch-history-legend-hash">a3f2e1d</span>
          Hash at branch tip
        </span>
        <span className="branch-history-legend-item">
          <svg className="branch-history-legend-icon" width={12} height={10} aria-hidden="true">
            <polygon points="6,8 3,2 9,2" fill={remoteSampleColor} opacity={0.7} />
          </svg>
          Remote position
        </span>
        {loading && <span className="branch-history-legend-item">Loading...</span>}
      </div>

      <div className="branch-history-body">
        <div className="branch-history-timeline" ref={containerRef}>
          <div className="branch-history-timeline-scroll">
            {visible.length === 0 ? (
              <div className="empty-panel">No branch activity in this date range.</div>
            ) : (
              <TimelineSvg
                lifecycles={visible}
                defaultBranch={defaultBranch}
                defaultBranchColorIndex={defaultBranchColorIndex}
                window={window}
                selectedKey={selectedKey}
                hoveredKey={hoveredKey}
                dayWidth={dayWidth}
                svgWidth={svgWidth}
                lx={lx}
                showHashLabels={showHashLabels}
                showRemoteMarkers={showRemoteMarkers}
                onSelect={setSelectedKey}
                onHover={setHoveredKey}
                onLeave={() => setHoveredKey(null)}
              />
            )}
          </div>
        </div>
        {selected && <HistoryDetail branch={selected} defaultBranch={defaultBranch} window={window} onBranchAction={onBranchAction} />}
      </div>
    </div>
  );
}

function SummaryStat({ label, count, color }: { label: string; count: number; color: string }) {
  return (
    <span className="branch-history-summary-stat">
      <strong style={{ color }}>{count}</strong>
      <span>{label}</span>
    </span>
  );
}
