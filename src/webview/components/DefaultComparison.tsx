import type { CSSProperties, ReactNode } from "react";
import type { DefaultBranchComparison } from "../../shared/types";

export interface DefaultComparisonRow {
  key: string;
  label: string;
  detail?: string;
  color: string;
  comparison?: DefaultBranchComparison;
  isCurrent?: boolean;
  isDefault?: boolean;
  selected?: boolean;
  extraBadge?: ReactNode;
  onSelect?: () => void;
}

export function DefaultComparisonOverview({
  title,
  subtitle,
  rows,
  compact
}: {
  title: string;
  subtitle: string;
  rows: DefaultComparisonRow[];
  compact?: boolean;
}) {
  const maxBehind = Math.max(1, ...rows.map((row) => row.comparison?.behind ?? 0));
  const maxAhead = Math.max(1, ...rows.map((row) => row.comparison?.ahead ?? 0));

  return (
    <section className={`default-comparison-panel${compact ? " compact" : ""}`}>
      <div className="default-comparison-heading">
        <div>
          <div className="default-comparison-title">{title}</div>
          <div className="default-comparison-subtitle">{subtitle}</div>
        </div>
      </div>
      <div className="default-comparison-table">
        <div className="default-comparison-header">
          <span>Branch</span>
          <span>Default</span>
          <span>Behind</span>
          <span>Ahead</span>
        </div>
        {rows.length === 0 ? (
          <div className="default-comparison-empty">No branch refs found.</div>
        ) : (
          rows.map((row) => (
            <DefaultComparisonTableRow
              key={row.key}
              maxAhead={maxAhead}
              maxBehind={maxBehind}
              row={row}
            />
          ))
        )}
      </div>
    </section>
  );
}

export function DefaultComparisonCounts({
  comparison,
  compact,
  maxAhead = Math.max(1, comparison?.ahead ?? 0),
  maxBehind = Math.max(1, comparison?.behind ?? 0)
}: {
  comparison?: DefaultBranchComparison;
  compact?: boolean;
  maxAhead?: number;
  maxBehind?: number;
}) {
  return (
    <span className={`default-comparison-counts${compact ? " compact" : ""}`}>
      <ComparisonCount compact={compact} kind="behind" max={maxBehind} value={comparison?.behind} />
      <ComparisonCount compact={compact} kind="ahead" max={maxAhead} value={comparison?.ahead} />
    </span>
  );
}

function DefaultComparisonTableRow({
  row,
  maxAhead,
  maxBehind
}: {
  row: DefaultComparisonRow;
  maxAhead: number;
  maxBehind: number;
}) {
  const content = (
    <>
      <span className="default-comparison-branch">
        <span className="branch-dot" style={{ background: row.color }} />
        <span className="default-comparison-name" title={row.label}>
          {row.label}
        </span>
        {row.isCurrent && <span className="tiny-pill current">current</span>}
        {row.isDefault && <span className="tiny-pill">default</span>}
        {row.extraBadge}
      </span>
      <span className="default-comparison-ref" title={row.comparison?.defaultRef ?? row.detail}>
        {row.comparison?.defaultRef ?? row.detail ?? "-"}
      </span>
      <ComparisonCount kind="behind" max={maxBehind} value={row.comparison?.behind} />
      <ComparisonCount kind="ahead" max={maxAhead} value={row.comparison?.ahead} />
    </>
  );
  const className = `default-comparison-row${row.selected ? " selected" : ""}`;

  if (row.onSelect) {
    return (
      <button className={className} onClick={row.onSelect} type="button">
        {content}
      </button>
    );
  }

  return <div className={className}>{content}</div>;
}

function ComparisonCount({
  compact,
  kind,
  max,
  value
}: {
  compact?: boolean;
  kind: "ahead" | "behind";
  max: number;
  value?: number;
}) {
  if (value === undefined) {
    return <span className={`default-comparison-count ${kind} missing${compact ? " compact" : ""}`}>-</span>;
  }

  const maxWidth = compact ? 34 : 56;
  const width = value > 0 ? Math.max(4, Math.min(maxWidth, Math.round((value / Math.max(max, 1)) * maxWidth))) : 0;
  const style = { "--comparison-bar-width": `${width}px` } as CSSProperties;

  return (
    <span className={`default-comparison-count ${kind}${compact ? " compact" : ""}`} style={style}>
      <span className="default-comparison-number">{value}</span>
      <span className="default-comparison-bar-track">
        <span className="default-comparison-bar" />
      </span>
    </span>
  );
}
