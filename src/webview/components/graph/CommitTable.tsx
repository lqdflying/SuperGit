import { useMemo, useState, type CSSProperties } from "react";
import { graph } from "../../../shared/tokens";
import type { CommitNode, SwimlaneNode } from "../../../shared/types";
import { getActiveLaneCount, branchColor, graphColumnWidth, formatRelativeTime } from "../../utils";
import { postMessage } from "../../vscode";
import { useThemeColors } from "../../ThemeProvider";
import { RefBadge, TagBadge, refBadgeColor } from "../badges";
import { Icon } from "../../icons";

const SWIMLANE_CURVE_RADIUS = 5;

type RowPath = {
  d: string;
  color: string;
  crossLane: boolean;
  colorIndex: number;
};

function findLastLaneIndex(lanes: SwimlaneNode[], id: string): number {
  for (let index = lanes.length - 1; index >= 0; index -= 1) {
    if (lanes[index].id === id) {
      return index;
    }
  }
  return -1;
}

function laneColor(lanes: SwimlaneNode[], index: number, theme: ReturnType<typeof useThemeColors>): string {
  const lane = lanes[index];
  return branchColor(lane?.colorIndex ?? 0, theme);
}

/** Per-row graph segments modeled on VS Code renderSCMHistoryItemGraph. */
function buildRowPaths(commit: CommitNode, laneX: (index: number) => number, rowHeight: number, theme: ReturnType<typeof useThemeColors>): RowPath[] {
  const inputSwimlanes = commit.inputSwimlanes ?? [];
  const outputSwimlanes = commit.outputSwimlanes ?? [];
  const circleIndex = commit.swimlaneIndex;
  const paths: RowPath[] = [];
  const mid = rowHeight / 2;
  const radius = SWIMLANE_CURVE_RADIUS;

  let outputSwimlaneIndex = 0;
  for (let index = 0; index < inputSwimlanes.length; index += 1) {
    const color = laneColor(inputSwimlanes, index, theme);
    const colorIndex = inputSwimlanes[index].colorIndex;
    const xIn = laneX(index);

    if (inputSwimlanes[index].id === commit.hash) {
      if (index !== circleIndex) {
        const xCircle = laneX(circleIndex);
        paths.push({
          d: [`M${xIn},0`, `L${xIn},${radius}`, `Q${xIn},${mid} ${xCircle},${mid}`, `L${xCircle},${mid}`].join(" "),
          color,
          crossLane: true,
          colorIndex
        });
      } else {
        outputSwimlaneIndex += 1;
      }
      continue;
    }

    if (
      outputSwimlaneIndex < outputSwimlanes.length &&
      inputSwimlanes[index].id === outputSwimlanes[outputSwimlaneIndex].id
    ) {
      if (index === outputSwimlaneIndex) {
        paths.push({
          d: `M${xIn},0 L${xIn},${rowHeight}`,
          color,
          crossLane: false,
          colorIndex
        });
      } else {
        const xOut = laneX(outputSwimlaneIndex);
        const dir = xOut > xIn ? 1 : -1;
        paths.push({
          d: [
            `M${xIn},0`,
            `L${xIn},6`,
            `Q${xIn},${mid} ${xIn + dir * radius},${mid}`,
            `L${xOut - dir * radius},${mid}`,
            `Q${xOut},${mid} ${xOut},${mid + radius}`,
            `L${xOut},${rowHeight}`
          ].join(" "),
          color,
          crossLane: true,
          colorIndex
        });
      }
      outputSwimlaneIndex += 1;
    }
  }

  for (let parentIndex = 1; parentIndex < commit.parents.length; parentIndex += 1) {
    const parentOutputIndex = findLastLaneIndex(outputSwimlanes, commit.parents[parentIndex]);
    if (parentOutputIndex === -1) {
      continue;
    }

    const xParent = laneX(parentOutputIndex);
    const xCircle = laneX(circleIndex);
    const color = laneColor(outputSwimlanes, parentOutputIndex, theme);
    paths.push({
      d: [`M${xParent},${mid}`, `Q${xParent},${rowHeight} ${xCircle},${rowHeight}`, `M${xParent},${mid}`, `L${xCircle},${mid}`].join(" "),
      color,
      crossLane: true,
      colorIndex: outputSwimlanes[parentOutputIndex].colorIndex
    });
  }

  const inputIndex = inputSwimlanes.findIndex((node) => node.id === commit.hash);
  if (inputIndex !== -1) {
    const x = laneX(circleIndex);
    paths.push({
      d: `M${x},0 L${x},${mid}`,
      color: laneColor(inputSwimlanes, inputIndex, theme),
      crossLane: false,
      colorIndex: inputSwimlanes[inputIndex].colorIndex
    });
  }

  if (commit.parents.length > 0) {
    const parentLane = commit.parentSwimlanes?.[0] ?? circleIndex;
    const xFrom = laneX(circleIndex);
    const xTo = laneX(parentLane);
    const colorIndex =
      parentLane < outputSwimlanes.length
        ? outputSwimlanes[parentLane].colorIndex
        : parentLane < inputSwimlanes.length
          ? inputSwimlanes[parentLane].colorIndex
          : circleIndex < outputSwimlanes.length
            ? outputSwimlanes[circleIndex].colorIndex
            : circleIndex < inputSwimlanes.length
              ? inputSwimlanes[circleIndex].colorIndex
              : 0;
    const color = branchColor(colorIndex, theme);

    if (parentLane === circleIndex) {
      paths.push({
        d: `M${xFrom},${mid} L${xTo},${rowHeight}`,
        color,
        crossLane: false,
        colorIndex
      });
    } else {
      const dir = xTo > xFrom ? 1 : -1;
      paths.push({
        d: [
          `M${xFrom},${mid}`,
          `Q${xFrom},${mid + radius} ${xFrom + dir * radius},${mid + radius}`,
          `L${xTo - dir * radius},${mid + radius}`,
          `Q${xTo},${mid + radius} ${xTo},${mid + radius * 2}`,
          `L${xTo},${rowHeight}`
        ].join(" "),
        color,
        crossLane: true,
        colorIndex
      });
    }
  }

  return paths;
}

function hasLocalRef(refs: string[]): boolean {
  return refs.some((ref) => ref !== "HEAD" && !ref.includes("/"));
}

export function CommitTable({ commits, selectedHash, onSelect }: { commits: CommitNode[]; selectedHash: string; onSelect: (hash: string) => void }) {
  const laneCount = useMemo(() => getActiveLaneCount(commits), [commits]);
  const layoutStyle = useMemo(
    () =>
      ({
        "--graph-column-width": `${graphColumnWidth(laneCount)}px`
      }) as CSSProperties,
    [laneCount]
  );

  return (
    <div className="commit-table-layout" style={layoutStyle}>
      <div className="commit-scroll">
        <div className="commit-table-body">
          <div className="column-header">
            <div className="graph-column">Graph</div>
            <div className="message-column">Description</div>
            <div className="author-column">Author</div>
            <div className="date-column">Date</div>
            <div className="hash-column">Hash</div>
          </div>
          <div className="commit-grid">
            <div className="graph-column graph-canvas-wrap">
              <GraphCanvas commits={commits} selectedHash={selectedHash} onSelect={onSelect} />
            </div>
            <CommitRows commits={commits} selectedHash={selectedHash} onSelect={onSelect} />
          </div>
        </div>
      </div>
    </div>
  );
}

function copyCommitHash(event: React.MouseEvent, hash: string): void {
  event.stopPropagation();
  postMessage({ type: "execute-action", action: "copy-hash", commitHash: hash });
}

function CommitRows({ commits, selectedHash, onSelect }: { commits: CommitNode[]; selectedHash: string; onSelect: (hash: string) => void }) {
  const theme = useThemeColors();
  const [hoverHash, setHoverHash] = useState<string | null>(null);

  return (
    <div className="commit-rows">
      {commits.map((commit) => {
        const selected = commit.hash === selectedHash;
        const hovered = hoverHash === commit.hash;
        const laneColorIndex = commit.outputSwimlanes?.[commit.swimlaneIndex]?.colorIndex ?? commit.inputSwimlanes?.[commit.swimlaneIndex]?.colorIndex ?? commit.swimlaneIndex;
        const color = branchColor(laneColorIndex, theme);
        const displayRefs = commit.refs.filter((ref) => ref !== "HEAD");
        return (
          <div
            key={commit.hash}
            className={`commit-row${selected ? " selected" : ""}${commit.isMerge ? " merge-row" : ""}`}
            onClick={() => onSelect(commit.hash)}
            onKeyDown={(event) => {
              if (event.target !== event.currentTarget) {
                return;
              }
              if (event.key === "Enter" || event.key === " ") {
                event.preventDefault();
                onSelect(commit.hash);
              }
            }}
            onMouseEnter={() => setHoverHash(commit.hash)}
            onMouseLeave={() => setHoverHash(null)}
            role="button"
            tabIndex={0}
            style={{
              borderLeftColor: selected ? color : "transparent",
              background: selected ? theme.selection : hovered ? theme.hover : undefined
            }}
          >
            <div className="commit-message">
              {displayRefs.map((ref) => (
                <RefBadge key={ref} text={ref} color={refBadgeColor(ref, color, theme)} />
              ))}
              {commit.tags.map((tag) => (
                <TagBadge key={tag} text={tag} />
              ))}
              <span className="message-text">{commit.message}</span>
            </div>
            <div className="author-column" title={commit.author}>
              {commit.author}
            </div>
            <div className="date-column" title={commit.date}>
              {formatRelativeTime(commit.date)}
            </div>
            <div className="hash-column">
              <span className="commit-hash-text mono">{commit.hashShort}</span>
              <button
                className="commit-hash-copy"
                onClick={(event) => copyCommitHash(event, commit.hash)}
                title={`Copy commit hash (${commit.hash})`}
                aria-label={`Copy commit hash ${commit.hash}`}
                type="button"
              >
                <Icon type="copy" size={14} />
              </button>
            </div>
          </div>
        );
      })}
      {commits.length === 0 && <div className="empty-rows">No commits in this range.</div>}
    </div>
  );
}

function GraphCanvas({ commits, selectedHash, onSelect }: { commits: CommitNode[]; selectedHash: string; onSelect: (hash: string) => void }) {
  const theme = useThemeColors();
  const laneCount = useMemo(() => getActiveLaneCount(commits), [commits]);
  const width = laneCount * graph.laneWidth + 14;
  const height = commits.length * graph.rowHeight + 12;
  const laneX = (index: number) => index * graph.laneWidth + graph.laneWidth / 2 + 7;
  const rowY = (index: number) => index * graph.rowHeight + graph.rowHeight / 2 + 6;
  const indexMap = useMemo(() => new Map(commits.map((commit, index) => [commit.hash, index])), [commits]);

  const rowPaths = useMemo(
    () => commits.map((commit) => buildRowPaths(commit, laneX, graph.rowHeight, theme)),
    [commits, theme]
  );

  const stubs = useMemo(() => {
    const items: Array<{ lane: number; fromRow: number; color: string }> = [];
    commits.forEach((commit, index) => {
      commit.parents.forEach((parent, parentIndex) => {
        if (indexMap.has(parent)) {
          return;
        }
        const lane = commit.parentSwimlanes?.[parentIndex] ?? commit.swimlaneIndex;
        items.push({
          lane,
          fromRow: index,
          color: branchColor(commit.outputSwimlanes?.[lane]?.colorIndex ?? lane, theme)
        });
      });
    });
    return items;
  }, [commits, indexMap, theme]);

  return (
    <svg width={width} height={height} className="graph-svg">
      <defs>
        {theme.branch.map((_, index) => (
          <filter key={`glow-${index}`} id={`glow-${index}`} x="-40%" y="-40%" width="180%" height="180%">
            <feGaussianBlur stdDeviation="1.8" result="blur" />
            <feMerge>
              <feMergeNode in="blur" />
              <feMergeNode in="SourceGraphic" />
            </feMerge>
          </filter>
        ))}
      </defs>
      {Array.from({ length: laneCount }).map((_, index) => (
        <line
          key={`lane-${index}`}
          x1={laneX(index)}
          y1={0}
          x2={laneX(index)}
          y2={height}
          stroke={branchColor(index, theme)}
          strokeWidth={0.5}
          opacity={0.06}
        />
      ))}
      {rowPaths.flatMap((paths, rowIndex) =>
        paths.map((path, pathIndex) => (
          <path
            key={`row-${rowIndex}-path-${pathIndex}`}
            d={path.d}
            transform={`translate(0, ${rowIndex * graph.rowHeight + 6})`}
            stroke={path.color}
            strokeWidth={2}
            fill="none"
            opacity={0.55}
            strokeLinecap="round"
            filter={path.crossLane ? `url(#glow-${path.colorIndex % theme.branch.length})` : undefined}
          />
        ))
      )}
      {stubs.map((stub, index) => {
        const x = laneX(stub.lane);
        const y1 = rowY(stub.fromRow);
        const y2 = Math.min(height - 4, y1 + graph.rowHeight * 0.55);
        return (
          <line
            key={`stub-${index}`}
            x1={x}
            y1={y1}
            x2={x}
            y2={y2}
            stroke={stub.color}
            strokeWidth={2}
            strokeDasharray="3,3"
            opacity={0.45}
          />
        );
      })}
      {commits.map((commit, index) => {
        const cx = laneX(commit.swimlaneIndex);
        const cy = rowY(index);
        const laneColorIndex =
          commit.outputSwimlanes?.[commit.swimlaneIndex]?.colorIndex ??
          commit.inputSwimlanes?.[commit.swimlaneIndex]?.colorIndex ??
          commit.swimlaneIndex;
        const color = branchColor(laneColorIndex, theme);
        const selected = commit.hash === selectedHash;
        const filled = hasLocalRef(commit.refs);
        return (
          <g key={commit.hash} onClick={() => onSelect(commit.hash)} className="graph-node">
            {selected && <circle cx={cx} cy={cy} r={graph.nodeRadius + 6} fill={color} opacity={0.12} />}
            {commit.isMerge ? (
              <g>
                <circle cx={cx} cy={cy} r={graph.nodeRadius + 1} fill="none" stroke={color} strokeWidth={1.8} opacity={0.6} />
                <circle cx={cx} cy={cy} r={graph.nodeRadius - 1.5} fill={color} opacity={0.85} />
              </g>
            ) : (
              <circle cx={cx} cy={cy} r={graph.nodeRadius} fill={filled ? color : theme.bg0} stroke={color} strokeWidth={2} />
            )}
          </g>
        );
      })}
    </svg>
  );
}
