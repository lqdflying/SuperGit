import type { RemotePosition } from "../../../shared/types";
import type { ThemeColors } from "../../../shared/themeColors";
import { remoteColor } from "../../utils";
import { BAR_HEIGHT } from "./constants";

export function RemoteMarker({
  remote,
  barY,
  remoteX,
  endX,
  rangeStart,
  theme
}: {
  remote: RemotePosition;
  barY: number;
  remoteX: number;
  endX: number;
  rangeStart: number;
  theme: ThemeColors;
}) {
  if (remote.pushDay < rangeStart || remote.behindLocal <= 0) {
    return null;
  }

  const rc = remoteColor(remote.colorIndex, theme);

  return (
    <g>
      <polygon points={`${remoteX},${barY - 1} ${remoteX - 3.5},${barY - 7} ${remoteX + 3.5},${barY - 7}`} fill={rc} opacity={0.7} />
      <text x={remoteX} y={barY - 9} textAnchor="middle" fontSize={7.5} fill={rc} fontWeight={600} opacity={0.8}>
        {remote.name}/{remote.hash.slice(0, 4)}
      </text>
      <text x={remoteX + (endX - remoteX) / 2} y={barY + BAR_HEIGHT + 10} textAnchor="middle" fontSize={7} fill={rc} opacity={0.5}>
        {remote.behindLocal} unpushed
      </text>
      <line x1={remoteX} y1={barY + BAR_HEIGHT + 3} x2={endX} y2={barY + BAR_HEIGHT + 3} stroke={rc} strokeWidth={0.8} opacity={0.25} />
      <line x1={remoteX} y1={barY + BAR_HEIGHT + 1} x2={remoteX} y2={barY + BAR_HEIGHT + 5} stroke={rc} strokeWidth={0.8} opacity={0.25} />
      <line x1={endX} y1={barY + BAR_HEIGHT + 1} x2={endX} y2={barY + BAR_HEIGHT + 5} stroke={rc} strokeWidth={0.8} opacity={0.25} />
    </g>
  );
}
