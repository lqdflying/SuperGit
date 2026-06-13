import type { BranchLifecycle } from "../../../shared/types";
import type { ThemeColors } from "../../../shared/themeColors";
import { branchColor } from "../../utils";
import { BAR_HEIGHT, DIV_GAP, LABEL_WIDTH } from "./constants";

export function GhostTrack({
  branch,
  defaultBranch,
  defaultBranchColorIndex,
  barY,
  lcaX,
  mainEndX,
  endX,
  ghostCommitDays,
  rangeStart,
  lx,
  theme
}: {
  branch: BranchLifecycle;
  defaultBranch: string;
  defaultBranchColorIndex: number;
  barY: number;
  lcaX: number;
  mainEndX: number;
  endX: number;
  ghostCommitDays: number[];
  rangeStart: number;
  lx: (day: number) => number;
  theme: ThemeColors;
}) {
  const mainGhostY = barY + BAR_HEIGHT + DIV_GAP;
  const mainC = branchColor(defaultBranchColorIndex, theme);
  const behindColor = branch.behindMain > 12 ? theme.historyDanger : theme.historyWarn;

  return (
    <g>
      <text x={LABEL_WIDTH - 6} y={mainGhostY + BAR_HEIGHT / 2 + 3} textAnchor="end" fontSize={9} fill={mainC} opacity={0.82} fontWeight={600}>
        {defaultBranch}
      </text>
      <rect x={lcaX} y={mainGhostY} width={Math.max(mainEndX - lcaX, 4)} height={BAR_HEIGHT} rx={BAR_HEIGHT / 2} fill={mainC} opacity={0.15} />
      {ghostCommitDays
        .filter((day) => day >= rangeStart)
        .map((day) => (
          <circle key={day} cx={lx(day)} cy={mainGhostY + BAR_HEIGHT / 2} r={2.5} fill="none" stroke={mainC} strokeWidth={1.2} opacity={0.35} />
        ))}
      <line x1={lcaX} y1={barY + BAR_HEIGHT} x2={lcaX} y2={mainGhostY} stroke={theme.fgDim} strokeWidth={1} strokeDasharray="2,2" opacity={0.55} />
      {branch.hashLca && (
        <text x={lcaX - 4} y={barY + BAR_HEIGHT + (mainGhostY - barY - BAR_HEIGHT) / 2 + 3} textAnchor="end" fontSize={7.5} fill={theme.fgDim} opacity={0.9}>
          LCA {branch.hashLca}
        </text>
      )}
      <rect x={mainEndX + 6} y={mainGhostY - 2} width={32} height={BAR_HEIGHT + 4} rx={6} fill={behindColor} fillOpacity={0.18} stroke={behindColor} strokeOpacity={0.35} strokeWidth={0.5} />
      <text x={mainEndX + 22} y={mainGhostY + BAR_HEIGHT / 2 + 3} textAnchor="middle" fontSize={9} fontWeight={700} fill={behindColor}>
        -{branch.behindMain}
      </text>
      <g opacity={0.3}>
        <line x1={endX + 4} y1={barY + BAR_HEIGHT / 2} x2={endX + 4} y2={mainGhostY + BAR_HEIGHT / 2} stroke={theme.historyDanger} strokeWidth={1.5} />
        <line x1={endX + 2} y1={barY + BAR_HEIGHT / 2} x2={endX + 6} y2={barY + BAR_HEIGHT / 2} stroke={theme.historyDanger} strokeWidth={1.5} />
        <line x1={endX + 2} y1={mainGhostY + BAR_HEIGHT / 2} x2={endX + 6} y2={mainGhostY + BAR_HEIGHT / 2} stroke={theme.historyDanger} strokeWidth={1.5} />
      </g>
    </g>
  );
}
