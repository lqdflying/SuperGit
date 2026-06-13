import type { ReactNode } from "react";
import type { PaginationState } from "../../../shared/types";
import { Icon } from "../../icons";

export function PaginationBar({
  pagination,
  onFirst,
  onPrevious,
  onNext,
  onLast
}: {
  pagination: PaginationState;
  onFirst: () => void;
  onPrevious: () => void;
  onNext: () => void;
  onLast: () => void;
}) {
  const atStart = pagination.page === 0;
  const atEnd = pagination.page >= pagination.totalPages - 1;
  return (
    <div className="pagination-bar">
      <PageButton disabled={atStart} onClick={onFirst}>
        <Icon type="chevLeft" size={12} />
        <Icon type="chevLeft" size={12} style={{ marginLeft: -8 }} />
      </PageButton>
      <PageButton disabled={atStart} onClick={onPrevious}>
        <Icon type="chevLeft" size={12} />
      </PageButton>
      <span>
        Page {pagination.page + 1} / {pagination.totalPages}
      </span>
      <PageButton disabled={atEnd} onClick={onNext}>
        <Icon type="chevRight" size={12} />
      </PageButton>
      <PageButton disabled={atEnd} onClick={onLast}>
        <Icon type="chevRight" size={12} />
        <Icon type="chevRight" size={12} style={{ marginLeft: -8 }} />
      </PageButton>
      <span className="muted">({pagination.totalItems} total)</span>
    </div>
  );
}

function PageButton({ disabled, onClick, children }: { disabled: boolean; onClick: () => void; children: ReactNode }) {
  return (
    <button className="page-button" disabled={disabled} onClick={onClick} type="button">
      {children}
    </button>
  );
}
