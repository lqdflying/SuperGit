import { colors } from "../../../shared/tokens";
import type { CommitAction, CommitNode } from "../../../shared/types";
import { Icon, type IconName } from "../../icons";
import { branchColor, formatFullDate } from "../../utils";

export function CommitDetail({ commit, onAction }: { commit?: CommitNode; onAction: (action: CommitAction) => void }) {
  if (!commit) {
    return (
      <aside className="detail-panel">
        <div className="empty-panel">Select a commit.</div>
      </aside>
    );
  }

  const actionRows: Array<{ action: CommitAction; label: string; icon: IconName }> = [
    { action: "checkout", label: "Checkout this commit", icon: "commit" },
    { action: "cherry-pick", label: "Cherry-pick", icon: "branch" },
    { action: "revert", label: "Revert commit", icon: "refresh" },
    { action: "create-branch", label: "Create branch here", icon: "plus" },
    { action: "create-tag", label: "Create tag", icon: "tag" },
    { action: "copy-hash", label: "Copy hash", icon: "copy" }
  ];

  return (
    <aside className="detail-panel">
      <div className="detail-section">
        <div className="panel-heading standalone">Commit Detail</div>
        <div className="detail-title">{commit.message}</div>
        <DetailRow label="Hash" value={commit.hash} mono color={branchColor(commit.branchIndex)} />
        <DetailRow label="Author" value={commit.author} />
        <DetailRow label="Date" value={formatFullDate(commit.date)} mono />
        <DetailRow label="Branch" value={commit.branch} color={branchColor(commit.branchIndex)} />
        {commit.parents.length > 0 && <DetailRow label="Parents" value={commit.parents.join(", ")} mono />}
        {commit.isMerge && <DetailRow label="Type" value="Merge commit" color={colors.branch[2]} />}
        {commit.tags.length > 0 && <DetailRow label="Tags" value={commit.tags.join(", ")} color={colors.tagFg} />}
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
