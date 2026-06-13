import { useMemo } from "react";
import { colors, graph } from "../../../shared/tokens";
import type { CommitNode } from "../../../shared/types";
import { Icon } from "../../icons";
import { branchColor, formatShortDate } from "../../utils";

export function CommitTable({ commits, selectedHash, onSelect }: { commits: CommitNode[]; selectedHash: string; onSelect: (hash: string) => void }) {
  return (
    <>
      <div className="column-header">
        <div className="graph-column">GRAPH</div>
        <div className="message-column">MESSAGE</div>
        <div className="author-column">AUTHOR</div>
        <div className="date-column">DATE</div>
        <div className="hash-column">HASH</div>
      </div>
      <div className="commit-scroll">
        <div className="commit-grid">
          <div className="graph-column graph-canvas-wrap">
            <GraphCanvas commits={commits} selectedHash={selectedHash} onSelect={onSelect} />
          </div>
          <div className="commit-rows">
            {commits.map((commit) => (
              <CommitRow key={commit.hash} commit={commit} selected={commit.hash === selectedHash} onSelect={onSelect} />
            ))}
            {commits.length === 0 && <div className="empty-rows">No commits in this range.</div>}
          </div>
        </div>
      </div>
    </>
  );
}

function GraphCanvas({ commits, selectedHash, onSelect }: { commits: CommitNode[]; selectedHash: string; onSelect: (hash: string) => void }) {
  const width = graph.visibleLanes * graph.laneWidth + 10;
  const height = commits.length * graph.rowHeight + 20;
  const laneX = (index: number) => index * graph.laneWidth + graph.laneWidth / 2 + 6;
  const rowY = (index: number) => index * graph.rowHeight + graph.rowHeight / 2 + 10;
  const indexMap = useMemo(() => new Map(commits.map((commit, index) => [commit.hash, index])), [commits]);

  const edges = useMemo(() => {
    return commits.flatMap((commit, index) =>
      commit.parents.flatMap((parent) => {
        const parentIndex = indexMap.get(parent);
        if (parentIndex === undefined) {
          return [];
        }
        return [{ fromLane: commit.branchIndex, fromRow: index, toLane: commits[parentIndex].branchIndex, toRow: parentIndex, color: branchColor(commit.branchIndex) }];
      })
    );
  }, [commits, indexMap]);

  return (
    <svg width={width} height={height} className="graph-svg">
      {Array.from({ length: graph.visibleLanes }).map((_, index) => (
        <line key={index} x1={laneX(index)} y1={0} x2={laneX(index)} y2={height} stroke={branchColor(index)} strokeWidth={1} opacity={0.08} />
      ))}
      {edges.map((edge, index) => {
        const x1 = laneX(edge.fromLane);
        const y1 = rowY(edge.fromRow);
        const x2 = laneX(edge.toLane);
        const y2 = rowY(edge.toRow);
        if (edge.fromLane === edge.toLane) {
          return <line key={index} x1={x1} y1={y1} x2={x2} y2={y2} stroke={edge.color} strokeWidth={1.8} opacity={0.55} />;
        }
        const midY = y1 + (y2 - y1) * 0.4;
        return <path key={index} d={`M${x1},${y1} C${x1},${midY} ${x2},${midY} ${x2},${y2}`} stroke={edge.color} strokeWidth={1.8} fill="none" opacity={0.45} />;
      })}
      {commits.map((commit, index) => {
        const cx = laneX(commit.branchIndex);
        const cy = rowY(index);
        const color = branchColor(commit.branchIndex);
        const selected = commit.hash === selectedHash;
        return (
          <g key={commit.hash} onClick={() => onSelect(commit.hash)} className="graph-node">
            {selected && <circle cx={cx} cy={cy} r={graph.nodeRadius + 5} fill={color} opacity={0.18} />}
            {commit.isMerge ? (
              <>
                <rect x={cx - 6} y={cy - 6} width={12} height={12} rx={2} fill={colors.bg1} stroke={color} strokeWidth={2} />
                <line x1={cx - 3} y1={cy} x2={cx + 3} y2={cy} stroke={color} strokeWidth={1.5} />
                <line x1={cx} y1={cy - 3} x2={cx} y2={cy + 3} stroke={color} strokeWidth={1.5} />
              </>
            ) : (
              <circle cx={cx} cy={cy} r={graph.nodeRadius} fill={commit.refs.includes("HEAD") ? color : colors.bg1} stroke={color} strokeWidth={2} />
            )}
          </g>
        );
      })}
    </svg>
  );
}

function CommitRow({ commit, selected, onSelect }: { commit: CommitNode; selected: boolean; onSelect: (hash: string) => void }) {
  const color = branchColor(commit.branchIndex);
  return (
    <button className={`commit-row${selected ? " selected" : ""}`} onClick={() => onSelect(commit.hash)} type="button">
      <div className="commit-message">
        {commit.refs.filter((ref) => ref !== "HEAD").map((ref) => (
          <span className="ref-pill" key={ref} style={{ color, borderColor: `${color}77` }}>
            {ref}
          </span>
        ))}
        {commit.tags.map((tag) => (
          <span className="tag-pill" key={tag}>
            <Icon type="tag" size={9} color={colors.tagFg} />
            {tag}
          </span>
        ))}
        {commit.refs.includes("HEAD") && <span className="head-pill">HEAD</span>}
        <span className="message-text">{commit.message}</span>
      </div>
      <div className="author-column">{commit.author}</div>
      <div className="date-column mono">{formatShortDate(commit.date)}</div>
      <div className="hash-column mono" style={{ color }}>
        {commit.hashShort}
      </div>
    </button>
  );
}
