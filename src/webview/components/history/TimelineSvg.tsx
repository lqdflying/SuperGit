import { useMemo } from "react";
import type { BranchLifecycle, BranchHistoryWindow, RemoteMainPosition } from "../../../shared/types";
import { useThemeColors } from "../../ThemeProvider";
import { formatHistoryDayLabel } from "../../utils";
import { BranchLane, laneHeightForBranch } from "./BranchLane";
import { LABEL_WIDTH } from "./constants";
import { computeLabelEveryNDays, shouldShowWeekLabel } from "./timelineLayout";

export function TimelineSvg({
  lifecycles,
  defaultBranch,
  defaultBranchColorIndex,
  window,
  selectedKey,
  hoveredKey,
  dayWidth,
  svgWidth,
  lx,
  showHashLabels,
  showRemoteMarkers,
  onSelect,
  onHover,
  onLeave
}: {
  lifecycles: BranchLifecycle[];
  defaultBranch: string;
  defaultBranchColorIndex: number;
  window: BranchHistoryWindow;
  selectedKey: string;
  hoveredKey: string | null;
  dayWidth: number;
  svgWidth: number;
  lx: (day: number, rangeStart?: number) => number;
  showHashLabels: boolean;
  showRemoteMarkers: boolean;
  onSelect: (key: string) => void;
  onHover: (key: string) => void;
  onLeave: () => void;
}) {
  const theme = useThemeColors();
  const totalDays = window.totalDays;
  const todayDay = totalDays - 1;
  const rangeStart = 0;
  const labelEveryN = computeLabelEveryNDays(dayWidth);

  const defaultBranchLifecycle = lifecycles.find((branch) => branch.name === defaultBranch && !branch.remoteOnly);
  const ghostCommitDays = useMemo(() => {
    if (!defaultBranchLifecycle) {
      return [];
    }
    return defaultBranchLifecycle.commitDays;
  }, [defaultBranchLifecycle]);

  const laneHeights = lifecycles.map((branch) => laneHeightForBranch(branch, defaultBranch));
  const laneTops = laneHeights.reduce<number[]>((acc, height, index) => {
    const top = index === 0 ? 44 : acc[index - 1]! + laneHeights[index - 1]!;
    acc.push(top);
    return acc;
  }, []);
  const svgH = laneHeights.reduce((sum, height) => sum + height, 0) + 56;

  const markers = useMemo(() => {
    const start = new Date(window.startDate);
    const items: Array<{ day: number; label: string | null; isWeek: boolean; isToday: boolean }> = [];
    let weekIndex = 0;
    for (let day = 0; day < totalDays; day += 1) {
      const date = new Date(start);
      date.setDate(start.getDate() + day);
      const isMonday = date.getDay() === 1;
      const isFirst = day === 0;
      const isWeek = isMonday || isFirst;
      let label: string | null = null;
      if (isWeek) {
        weekIndex += 1;
        if (shouldShowWeekLabel(labelEveryN, weekIndex, isFirst)) {
          label = formatHistoryDayLabel(date.toISOString());
        }
      }
      items.push({
        day,
        label,
        isWeek,
        isToday: day === todayDay
      });
    }
    return items;
  }, [labelEveryN, totalDays, todayDay, window.startDate]);

  return (
    <svg width={svgWidth} height={svgH} className="branch-history-svg">
      {markers.map((marker) => {
        const x = LABEL_WIDTH + marker.day * dayWidth + dayWidth / 2;
        return (
          <g key={marker.day}>
            <line
              x1={x}
              y1={32}
              x2={x}
              y2={svgH}
              stroke={marker.isToday ? theme.accent : marker.isWeek ? theme.historyGridWeek : theme.historyGrid}
              strokeWidth={marker.isToday ? 1.5 : marker.isWeek ? 1 : 0.5}
              opacity={marker.isToday ? 0.5 : marker.isWeek ? 0.5 : 0.25}
            />
            {marker.label && (
              <text x={x} y={18} textAnchor="middle" fontSize={10.5} fill={marker.isToday ? theme.accent : theme.fgDim} fontWeight={marker.isToday ? 700 : 500}>
                {marker.label}
              </text>
            )}
            {marker.isToday && (
              <g>
                <rect x={x - 18} y={22} width={36} height={14} rx={7} fill={theme.accent} />
                <text x={x} y={32} textAnchor="middle" fontSize={8.5} fill={theme.buttonFg} fontWeight={700}>
                  Today
                </text>
              </g>
            )}
          </g>
        );
      })}

      {lifecycles.map((branch, index) => {
        const key = branchKey(branch);
        return (
          <BranchLane
            key={key}
            branch={branch}
            defaultBranch={defaultBranch}
            defaultBranchColorIndex={defaultBranchColorIndex}
            isSelected={selectedKey === key}
            isHovered={hoveredKey === key}
            laneTop={laneTops[index] ?? 44}
            laneHeight={laneHeights[index] ?? 72}
            rangeStart={rangeStart}
            totalDays={totalDays}
            todayDay={todayDay}
            dayWidth={dayWidth}
            svgWidth={svgWidth}
            showHashLabels={showHashLabels}
            showRemoteMarkers={showRemoteMarkers}
            ghostCommitDays={ghostCommitDays.filter((day) => day > branch.lastCommonAncestorDay)}
            lx={lx}
            onSelect={() => onSelect(key)}
            onHover={() => onHover(key)}
            onLeave={onLeave}
          />
        );
      })}
    </svg>
  );
}

export function branchKey(branch: BranchLifecycle): string {
  return branch.remoteOnly ? `${branch.remote}/${branch.name}` : branch.name;
}

export function defaultMainCommits(remoteMains: RemoteMainPosition[], defaultLifecycle?: BranchLifecycle): number[] {
  if (defaultLifecycle) {
    return defaultLifecycle.commitDays;
  }
  return remoteMains[0]?.commits ?? [];
}
