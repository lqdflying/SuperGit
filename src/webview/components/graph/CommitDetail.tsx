import { colors } from "../../../shared/tokens";
import type { CommitAction, CommitFileChange, CommitNode } from "../../../shared/types";
import { Avatar } from "../Avatar";
import { HeadBadge, RefBadge, TagBadge } from "../badges";
import { Icon, type IconName } from "../../icons";
import { branchColor, formatFullDate, formatRelativeTime } from "../../utils";

const statusLabels: Record<CommitFileChange["status"], string> = {
  added: "A",
  modified: "M",
  deleted: "D",
  renamed: "R",
  copied: "C",
  typechange: "T",
  unmerged: "U",
  unknown: "?"
};

export function CommitDetail({
  commit,
  files,
  filesLoading,
  onAction,
  onOpenFile
}: {
  commit?: CommitNode;
  files: CommitFileChange[];
  filesLoading: boolean;
  onAction: (action: CommitAction) => void;
  onOpenFile: (file: CommitFileChange) => void;
}) {
  if (!commit) {
    return (
      <aside className="detail-panel">
        <div className="empty-panel">Select a commit.</div>
      </aside>
    );
  }

  const color = branchColor(commit.branchIndex);
  const actionRows: Array<{ action: CommitAction; label: string; icon: IconName }> = [
    { action: "cherry-pick", label: "Cherry-pick commit", icon: "branch" },
    { action: "revert", label: "Revert commit", icon: "refresh" },
    { action: "checkout", label: "Checkout", icon: "commit" },
    { action: "create-branch", label: "Create branch here", icon: "plus" },
    { action: "create-tag", label: "Create tag", icon: "tag" },
    { action: "copy-hash", label: "Copy SHA", icon: "copy" }
  ];

  return (
    <aside className="detail-panel">
      <div className="detail-section">
        <div className="detail-header">
          <Avatar name={commit.author} size={32} />
          <div className="detail-header-copy">
            <strong>{commit.author}</strong>
            <span>{formatRelativeTime(commit.date)}</span>
          </div>
        </div>
        <p className="detail-title">{commit.message}</p>
        <div className="detail-badges">
          {commit.refs.includes("HEAD") && <HeadBadge />}
          {commit.refs.filter((ref) => ref !== "HEAD").map((ref) => (
            <RefBadge key={ref} text={ref} color={color} />
          ))}
          {commit.tags.map((tag) => (
            <TagBadge key={tag} text={tag} />
          ))}
        </div>
        <div className="detail-meta">
          <DetailRow label="Commit" value={commit.hash} mono />
          <DetailRow label="Parents" value={commit.parents.join(" ") || "none"} mono />
          <DetailRow label="Branch" value={commit.branch || "-"} color={color} />
          {commit.isMerge && <DetailRow label="Type" value="Merge commit" color={colors.fgDim} />}
          <DetailRow label="Date" value={formatFullDate(commit.date)} mono />
        </div>
      </div>
      <div className="detail-section">
        <div className="panel-heading standalone">Changed Files</div>
        {filesLoading && <div className="empty-panel compact">Loading changed files...</div>}
        {!filesLoading && files.length === 0 && <div className="empty-panel compact">No file changes.</div>}
        {!filesLoading &&
          files.map((file) => (
            <button className="file-change-item" key={`${file.path}:${file.oldPath ?? ""}`} onClick={(event) => { event.currentTarget.blur(); onOpenFile(file); }} type="button">
              <span className={`file-status file-status-${file.status}`}>{statusLabels[file.status]}</span>
              <span className="file-change-path">
                {file.oldPath && file.oldPath !== file.path ? (
                  <>
                    <span className="mono">{file.oldPath}</span>
                    <span className="file-rename-arrow"> → </span>
                    <span className="mono">{file.path}</span>
                  </>
                ) : (
                  <span className="mono">{file.path}</span>
                )}
              </span>
            </button>
          ))}
      </div>
      <div className="detail-section">
        <div className="panel-heading standalone">Actions</div>
        {actionRows.map((row) => (
          <button className="action-item" key={row.action} onClick={() => onAction(row.action)} type="button">
            <Icon type={row.icon} size={13} color={colors.accent} />
            {row.label}
          </button>
        ))}
      </div>
    </aside>
  );
}

function DetailRow({ label, value, mono, color }: { label: string; value: string; mono?: boolean; color?: string }) {
  return (
    <div className="detail-row">
      <span>{label}</span>
      <strong className={mono ? "mono" : ""} style={{ color }}>
        {value}
      </strong>
    </div>
  );
}
