import type { BranchLifecycle } from "../../../shared/types";
import type { ThemeColors } from "../../../shared/themeColors";
import { CurrentBadge } from "../badges";
import { useThemeColors } from "../../ThemeProvider";
import { branchColor, remoteColor } from "../../utils";
import { GhostTrack } from "./GhostTrack";
import { RemoteMarker } from "./RemoteMarker";
import { BAR_HEIGHT, LABEL_WIDTH, LANE_HEIGHT, LANE_HEIGHT_DIVERGED } from "./constants";
import { commitDotRadius, computeIdleDays } from "./timelineLayout";

function statusColor(status: BranchLifecycle["status"], severity: BranchLifecycle["severity"], theme: ThemeColors): string {
  if (status === "active") {
    return theme.historyOk;
  }
  if (status === "merged") {
    return theme.historyMerged;
  }
  if (status === "diverged") {
    return severity === "mild" ? theme.historyWarn : theme.historyDanger;
  }
  return theme.fgMuted;
}

export function BranchLane({
  branch,
  defaultBranch,
  defaultBranchColorIndex,
  isSelected,
  isHovered,
  laneTop,
  laneHeight,
  rangeStart,
  totalDays,
  todayDay,
  dayWidth,
  svgWidth,
  showHashLabels,
  showRemoteMarkers,
  ghostCommitDays,
  lx,
  onSelect,
  onHover,
  onLeave
}: {
  branch: BranchLifecycle;
  defaultBranch: string;
  defaultBranchColorIndex: number;
  isSelected: boolean;
  isHovered: boolean;
  laneTop: number;
  laneHeight: number;
  rangeStart: number;
  totalDays: number;
  todayDay: number;
  dayWidth: number;
  svgWidth: number;
  showHashLabels: boolean;
  showRemoteMarkers: boolean;
  ghostCommitDays: number[];
  lx: (day: number, rangeStart?: number) => number;
  onSelect: () => void;
  onHover: () => void;
  onLeave: () => void;
}) {
  const theme = useThemeColors();
  const barY = laneTop + 24;
  const isMain = branch.name === defaultBranch && !branch.remoteOnly;
  const brC = branch.remoteOnly ? remoteColor(branch.colorIndex, theme) : branchColor(branch.colorIndex, theme);
  const startX = lx(Math.max(branch.startDay, rangeStart));
  const endX = lx(Math.min(branch.endDay, totalDays - 1));
  const lastCommitDay = branch.commitDays[branch.commitDays.length - 1] ?? branch.endDay;
  const lastCommitX = lx(Math.max(lastCommitDay, rangeStart));
  const showGhost = branch.status === "diverged" && !isMain;
  const hashEndX = branch.stale ? lastCommitX : endX;
  const idleDays = computeIdleDays(todayDay, lastCommitDay);
  const dotRadius = commitDotRadius(dayWidth, isMain);

  return (
    <g onClick={onSelect} onMouseEnter={onHover} onMouseLeave={onLeave} style={{ cursor: "pointer" }}>
      {(isSelected || isHovered) && (
        <rect x={0} y={laneTop - 2} width={svgWidth} height={laneHeight} fill={isSelected ? theme.selection : theme.hover} />
      )}
      {isSelected && <rect x={0} y={laneTop - 2} width={3} height={laneHeight} fill={brC} rx={1} />}

      <foreignObject x={10} y={laneTop + 2} width={LABEL_WIDTH - 16} height={laneHeight - 8}>
        <div className={`branch-history-lane-label${isSelected ? " selected" : ""}`}>
          <div className="branch-history-lane-title">
            <div className="branch-dot" style={{ background: brC, boxShadow: isSelected ? `0 0 8px ${brC}55` : undefined }} />
            <span className="branch-history-lane-name" style={{ color: isSelected ? undefined : theme.fg }}>
              {branch.remoteOnly ? `${branch.remote}/${branch.name}` : branch.name}
            </span>
            {branch.isCurrent && <CurrentBadge />}
          </div>
          <div className="branch-history-lane-meta">
            {branch.remoteOnly ? (
              <span style={{ color: isSelected ? undefined : theme.fgMuted, fontWeight: 600 }}>no local branch</span>
            ) : (
              <span
                style={{
                  color: isSelected ? undefined : statusColor(branch.status, branch.severity, theme),
                  fontWeight: 600
                }}
              >
                {branch.status === "active" && "● Active"}
                {branch.status === "diverged" && `⚠ Diverged${branch.severity ? ` · ${branch.severity}` : ""}`}
                {branch.status === "merged" && "✓ Merged"}
              </span>
            )}
            {branch.stale && <span className="branch-history-stale-tag">stale</span>}
            {!isMain && !branch.remoteOnly && branch.status !== "merged" && (branch.aheadOfMain > 0 || branch.behindMain > 0) && (
              <span style={{ fontFamily: "monospace", color: isSelected ? undefined : theme.fgDim }}>
                {branch.aheadOfMain > 0 && <span style={{ color: isSelected ? undefined : theme.ahead }}>+{branch.aheadOfMain}</span>}
                {branch.aheadOfMain > 0 && branch.behindMain > 0 && " "}
                {branch.behindMain > 0 && (
                  <span style={{ color: isSelected ? undefined : branch.behindMain > 10 ? theme.historyDanger : theme.historyWarn }}>
                    -{branch.behindMain}
                  </span>
                )}
              </span>
            )}
          </div>
        </div>
      </foreignObject>

      {branch.remoteOnly ? (
        <rect x={startX} y={barY} width={Math.max(endX - startX, 4)} height={BAR_HEIGHT} rx={BAR_HEIGHT / 2} fill="none" stroke={brC} strokeWidth={1.5} strokeDasharray="6,4" opacity={0.35} />
      ) : branch.stale ? (
        <>
          <rect x={startX} y={barY} width={Math.max(lastCommitX - startX, 4)} height={BAR_HEIGHT} rx={BAR_HEIGHT / 2} fill={brC} opacity={0.5} />
          <line x1={lastCommitX} y1={barY + BAR_HEIGHT / 2} x2={endX} y2={barY + BAR_HEIGHT / 2} stroke={brC} strokeWidth={2} strokeDasharray="6,4" opacity={0.2} strokeLinecap="round" />
        </>
      ) : branch.status === "merged" ? (
        <rect x={startX} y={barY} width={Math.max(endX - startX, 4)} height={BAR_HEIGHT} rx={BAR_HEIGHT / 2} fill={theme.historyMerged} opacity={0.35} />
      ) : (
        <rect x={startX} y={barY} width={Math.max(endX - startX, 4)} height={BAR_HEIGHT} rx={BAR_HEIGHT / 2} fill={brC} opacity={isMain ? 0.65 : 0.5} />
      )}

      {branch.commitDays
        .filter((day) => day >= rangeStart)
        .map((day) => (
          <circle
            key={day}
            cx={lx(day)}
            cy={barY + BAR_HEIGHT / 2}
            r={dotRadius}
            fill={branch.status === "merged" ? theme.historyMerged : brC}
            stroke={theme.bg0}
            strokeWidth={1.5}
            opacity={0.95}
          />
        ))}

      {showHashLabels && (
        <>
          <text x={startX} y={barY - 5} textAnchor="middle" fontSize={8.5} fill={theme.fgDim} opacity={0.92}>
            {branch.hashStart}
          </text>
          <text
            x={hashEndX}
            y={barY - 5}
            textAnchor="middle"
            fontSize={8.5}
            fontWeight={600}
            fill={branch.status === "diverged" ? (branch.severity === "mild" ? theme.historyWarn : theme.historyDanger) : branch.status === "merged" ? theme.historyMerged : theme.fgDim}
            opacity={0.95}
          >
            {branch.hashEnd}
          </text>
        </>
      )}

      {showRemoteMarkers &&
        !branch.remoteOnly &&
        branch.remotes.map((remote) => (
          <RemoteMarker key={remote.name} remote={remote} barY={barY} remoteX={lx(remote.pushDay)} endX={endX} rangeStart={rangeStart} theme={theme} />
        ))}

      {showGhost && (
        <GhostTrack
          branch={branch}
          defaultBranch={defaultBranch}
          defaultBranchColorIndex={defaultBranchColorIndex}
          barY={barY}
          lcaX={lx(Math.max(branch.lastCommonAncestorDay, rangeStart))}
          mainEndX={lx(todayDay)}
          endX={endX}
          ghostCommitDays={ghostCommitDays}
          rangeStart={rangeStart}
          dayWidth={dayWidth}
          showHashLabels={showHashLabels}
          lx={lx}
          theme={theme}
        />
      )}

      {branch.status === "diverged" && !isMain && (
        <rect
          x={lx(Math.max(branch.lastCommonAncestorDay, rangeStart))}
          y={barY + BAR_HEIGHT + 2}
          width={endX - lx(Math.max(branch.lastCommonAncestorDay, rangeStart))}
          height={2}
          rx={1}
          fill={branch.behindMain > 12 ? theme.historyDanger : theme.historyWarn}
          opacity={0.4}
        />
      )}

      {branch.stale && showHashLabels && (
        <g>
          <rect x={endX + 8} y={barY - 1} width={40} height={BAR_HEIGHT + 2} rx={5} fill={theme.historyStale} fillOpacity={0.15} stroke={theme.historyStale} strokeOpacity={0.3} strokeWidth={0.5} />
          <text x={endX + 28} y={barY + BAR_HEIGHT / 2 + 3} textAnchor="middle" fontSize={8.5} fontWeight={600} fill={theme.historyStale}>
            {idleDays}d idle
          </text>
        </g>
      )}
    </g>
  );
}

export function laneHeightForBranch(branch: BranchLifecycle, defaultBranch: string): number {
  if (branch.status === "diverged" && branch.name !== defaultBranch && !branch.remoteOnly) {
    return LANE_HEIGHT_DIVERGED;
  }
  return LANE_HEIGHT;
}
