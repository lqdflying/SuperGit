import { useMemo, useState } from "react";
import { graph } from "../../../shared/tokens";
import type { CommitNode } from "../../../shared/types";
import { useThemeColors } from "../../ThemeProvider";
import { branchColor } from "../../utils";
import { RefBadge, TagBadge, refBadgeColor } from "../badges";

type GraphEdge = {
  kind: "edge";
  fromLane: number;
  fromRow: number;
  toLane: number;
  toRow: number;
  color: string;
  branchIndex: number;
};

type GraphStub = {
  kind: "stub";
  lane: number;
  fromRow: number;
  color: string;
};

function scurvePath(x1: number, y1: number, x2: number, y2: number): string {
  if (x1 === x2) {
    return `M${x1},${y1} L${x2},${y2}`;
  }
  const step = graph.rowHeight * 0.7;
  const midY = y1 + step;
  const targetY = midY + (y2 - midY) * 0.3;
  const lerp1 = midY + (y2 - midY) * 0.15;
  return `M${x1},${y1} L${x1},${midY} Q${x1},${lerp1} ${x2},${targetY} L${x2},${y2}`;
}

function hasLocalRef(refs: string[]): boolean {
  return refs.some((ref) => ref !== "HEAD" && !ref.includes("/"));
}

export function CommitTable({ commits, selectedHash, onSelect }: { commits: CommitNode[]; selectedHash: string; onSelect: (hash: string) => void }) {
  return (
    <>
      <div className="column-header">
        <div className="graph-column">Graph</div>
        <div className="message-column">Description</div>
      </div>
      <div className="commit-scroll">
        <div className="commit-grid">
          <div className="graph-column graph-canvas-wrap">
            <GraphCanvas commits={commits} selectedHash={selectedHash} onSelect={onSelect} />
          </div>
          <CommitRows commits={commits} selectedHash={selectedHash} onSelect={onSelect} />
        </div>
      </div>
    </>
  );
}

function CommitRows({ commits, selectedHash, onSelect }: { commits: CommitNode[]; selectedHash: string; onSelect: (hash: string) => void }) {
  const theme = useThemeColors();
  const [hoverHash, setHoverHash] = useState<string | null>(null);

  return (
    <div className="commit-rows">
      {commits.map((commit) => {
        const selected = commit.hash === selectedHash;
        const hovered = hoverHash === commit.hash;
        const color = branchColor(commit.branchIndex, theme);
        const displayRefs = commit.refs.filter((ref) => ref !== "HEAD");
        return (
          <button
            key={commit.hash}
            className={`commit-row${selected ? " selected" : ""}${commit.isMerge ? " merge-row" : ""}`}
            onClick={() => onSelect(commit.hash)}
            onMouseEnter={() => setHoverHash(commit.hash)}
            onMouseLeave={() => setHoverHash(null)}
            style={{
              borderLeftColor: selected ? color : "transparent",
              background: selected ? theme.selection : hovered ? theme.hover : undefined
            }}
            type="button"
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
          </button>
        );
      })}
      {commits.length === 0 && <div className="empty-rows">No commits in this range.</div>}
    </div>
  );
}

function GraphCanvas({ commits, selectedHash, onSelect }: { commits: CommitNode[]; selectedHash: string; onSelect: (hash: string) => void }) {
  const theme = useThemeColors();
  const width = graph.maxLanes * graph.laneWidth + 14;
  const height = commits.length * graph.rowHeight + 12;
  const laneX = (index: number) => index * graph.laneWidth + graph.laneWidth / 2 + 7;
  const rowY = (index: number) => index * graph.rowHeight + graph.rowHeight / 2 + 6;
  const indexMap = useMemo(() => new Map(commits.map((commit, index) => [commit.hash, index])), [commits]);

  const shapes = useMemo(() => {
    const items: Array<GraphEdge | GraphStub> = [];
    commits.forEach((commit, index) => {
      commit.parents.forEach((parent, parentIndex) => {
        const parentRow = indexMap.get(parent);
        const laneIndex = (commit.branchIndex + parentIndex) % graph.maxLanes;
        const color = branchColor(laneIndex, theme);
        if (parentRow !== undefined) {
          items.push({
            kind: "edge",
            fromLane: commit.branchIndex,
            fromRow: index,
            toLane: commits[parentRow].branchIndex,
            toRow: parentRow,
            color,
            branchIndex: commit.branchIndex
          });
          return;
        }

        items.push({
          kind: "stub",
          lane: laneIndex,
          fromRow: index,
          color
        });
      });
    });
    return items;
  }, [commits, indexMap, theme]);

  const edgeShapes = shapes.filter((shape): shape is GraphEdge => shape.kind === "edge");

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
      {Array.from({ length: graph.maxLanes }).map((_, index) => (
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
      {[...edgeShapes].reverse().map((shape, index) => {
        const x1 = laneX(shape.fromLane);
        const y1 = rowY(shape.fromRow);
        const x2 = laneX(shape.toLane);
        const y2 = rowY(shape.toRow);
        const crossLane = shape.fromLane !== shape.toLane;
        const filterIndex = shape.branchIndex % theme.branch.length;
        return (
          <path
            key={`edge-${index}`}
            d={scurvePath(x1, y1, x2, y2)}
            stroke={shape.color}
            strokeWidth={2}
            fill="none"
            opacity={0.55}
            strokeLinecap="round"
            filter={crossLane ? `url(#glow-${filterIndex})` : undefined}
          />
        );
      })}
      {shapes.map((shape, index) => {
        if (shape.kind !== "stub") {
          return null;
        }
        const x = laneX(shape.lane);
        const y1 = rowY(shape.fromRow);
        const y2 = Math.min(height - 4, y1 + graph.rowHeight * 0.55);
        return (
          <line
            key={`stub-${index}`}
            x1={x}
            y1={y1}
            x2={x}
            y2={y2}
            stroke={shape.color}
            strokeWidth={2}
            strokeDasharray="3,3"
            opacity={0.45}
          />
        );
      })}
      {commits.map((commit, index) => {
        const cx = laneX(commit.branchIndex);
        const cy = rowY(index);
        const color = branchColor(commit.branchIndex, theme);
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
