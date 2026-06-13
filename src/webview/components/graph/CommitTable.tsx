import { useMemo, useState } from "react";
import { colors, graph } from "../../../shared/tokens";
import type { CommitNode } from "../../../shared/types";
import { Avatar } from "../Avatar";
import { HeadBadge, RefBadge, TagBadge } from "../badges";
import { branchColor, formatRelativeTime } from "../../utils";

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

export function CommitTable({ commits, selectedHash, onSelect }: { commits: CommitNode[]; selectedHash: string; onSelect: (hash: string) => void }) {
  return (
    <>
      <div className="column-header">
        <div className="graph-column">Graph</div>
        <div className="message-column">Description</div>
        <div className="author-column">Author</div>
        <div className="date-column">Date</div>
        <div className="hash-column">SHA</div>
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
  const [hoverHash, setHoverHash] = useState<string | null>(null);

  return (
    <div className="commit-rows">
      {commits.map((commit) => {
        const selected = commit.hash === selectedHash;
        const hovered = hoverHash === commit.hash;
        const color = branchColor(commit.branchIndex);
        return (
          <button
            key={commit.hash}
            className={`commit-row${selected ? " selected" : ""}${commit.isMerge ? " merge-row" : ""}`}
            onClick={() => onSelect(commit.hash)}
            onMouseEnter={() => setHoverHash(commit.hash)}
            onMouseLeave={() => setHoverHash(null)}
            style={{
              borderLeftColor: selected ? color : "transparent",
              background: selected ? colors.selection : hovered ? colors.hover : undefined
            }}
            type="button"
          >
            <div className="commit-message">
              {commit.refs.includes("HEAD") && <HeadBadge />}
              {commit.refs.filter((ref) => ref !== "HEAD").map((ref) => (
                <RefBadge key={ref} text={ref} color={color} />
              ))}
              {commit.tags.map((tag) => (
                <TagBadge key={tag} text={tag} />
              ))}
              <span className="message-text">{commit.message}</span>
            </div>
            <div className="author-column">
              <Avatar name={commit.author} size={20} />
              <span>{commit.author}</span>
            </div>
            <div className="date-column mono">{formatRelativeTime(commit.date)}</div>
            <div className="hash-column mono">{commit.hashShort}</div>
          </button>
        );
      })}
      {commits.length === 0 && <div className="empty-rows">No commits in this range.</div>}
    </div>
  );
}

function GraphCanvas({ commits, selectedHash, onSelect }: { commits: CommitNode[]; selectedHash: string; onSelect: (hash: string) => void }) {
  const width = graph.visibleLanes * graph.laneWidth + 12;
  const height = commits.length * graph.rowHeight + 16;
  const laneX = (index: number) => index * graph.laneWidth + graph.laneWidth / 2 + 6;
  const rowY = (index: number) => index * graph.rowHeight + graph.rowHeight / 2 + 8;
  const indexMap = useMemo(() => new Map(commits.map((commit, index) => [commit.hash, index])), [commits]);

  const shapes = useMemo(() => {
    const items: Array<GraphEdge | GraphStub> = [];
    commits.forEach((commit, index) => {
      commit.parents.forEach((parent, parentIndex) => {
        const parentRow = indexMap.get(parent);
        const laneIndex = (commit.branchIndex + parentIndex) % graph.visibleLanes;
        const color = branchColor(laneIndex);
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
  }, [commits, indexMap]);

  return (
    <svg width={width} height={height} className="graph-svg">
      <defs>
        {colors.branch.map((_, index) => (
          <filter key={`glow-${index}`} id={`glow-${index}`} x="-50%" y="-50%" width="200%" height="200%">
            <feGaussianBlur stdDeviation="2.5" result="blur" />
            <feMerge>
              <feMergeNode in="blur" />
              <feMergeNode in="SourceGraphic" />
            </feMerge>
          </filter>
        ))}
      </defs>
      {shapes.map((shape, index) => {
        if (shape.kind === "stub") {
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
              strokeWidth={2.2}
              strokeDasharray="3,3"
              opacity={0.45}
            />
          );
        }

        const x1 = laneX(shape.fromLane);
        const y1 = rowY(shape.fromRow);
        const x2 = laneX(shape.toLane);
        const y2 = rowY(shape.toRow);
        const filterIndex = shape.branchIndex % colors.branch.length;
        if (shape.fromLane === shape.toLane) {
          return <line key={index} x1={x1} y1={y1} x2={x2} y2={y2} stroke={shape.color} strokeWidth={2.2} opacity={0.6} />;
        }
        const midY = y1 + (y2 - y1) * 0.35;
        return (
          <path
            key={index}
            d={`M${x1},${y1} C${x1},${midY} ${x2},${midY} ${x2},${y2}`}
            stroke={shape.color}
            strokeWidth={2.2}
            fill="none"
            opacity={0.5}
            filter={`url(#glow-${filterIndex})`}
          />
        );
      })}
      {commits.map((commit, index) => {
        const cx = laneX(commit.branchIndex);
        const cy = rowY(index);
        const color = branchColor(commit.branchIndex);
        const selected = commit.hash === selectedHash;
        const isHead = commit.refs.includes("HEAD");
        return (
          <g key={commit.hash} onClick={() => onSelect(commit.hash)} className="graph-node">
            {selected && <circle cx={cx} cy={cy} r={graph.nodeRadius + 6} fill={color} opacity={0.12} />}
            {commit.isMerge ? (
              <g>
                <circle cx={cx} cy={cy} r={graph.nodeRadius + 1.5} fill="none" stroke={color} strokeWidth={2} opacity={0.7} />
                <circle cx={cx} cy={cy} r={graph.nodeRadius - 1.5} fill={color} opacity={0.9} />
              </g>
            ) : (
              <circle cx={cx} cy={cy} r={graph.nodeRadius} fill={isHead ? color : colors.bg1} stroke={color} strokeWidth={isHead ? 0 : 2} />
            )}
            {isHead && (
              <circle cx={cx} cy={cy} r={graph.nodeRadius + 3} fill="none" stroke={color} strokeWidth={1.2} strokeDasharray="2,2" opacity={0.5} />
            )}
          </g>
        );
      })}
    </svg>
  );
}
