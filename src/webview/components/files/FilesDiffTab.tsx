import { useEffect, useMemo, useRef, useState } from "react";
import type { BranchInfo, FilesDiffFileChange, FilesDiffPayload, FilesDiffRef, RemoteBranchInfo, RemoteConfig } from "../../../shared/types";
import { Icon } from "../../icons";
import { buildFilesDiffRefs, branchColor, remoteColor, resolveFilesDiffDefaults } from "../../utils";
import { useThemeColors } from "../../ThemeProvider";

interface FilesDiffTabProps {
  branches: BranchInfo[];
  remoteBranches: RemoteBranchInfo[];
  remotes: RemoteConfig[];
  currentBranch: string;
  defaultBranch: string;
  diff?: FilesDiffPayload;
  loading: boolean;
  onCompare: (leftRef: string, rightRef: string) => void;
  onOpenFile: (leftRef: string, rightRef: string, file: FilesDiffFileChange) => void;
}

export function FilesDiffTab({
  branches,
  remoteBranches,
  remotes,
  currentBranch,
  defaultBranch,
  diff,
  loading,
  onCompare,
  onOpenFile
}: FilesDiffTabProps) {
  const theme = useThemeColors();
  const refs = useMemo(() => buildFilesDiffRefs(branches, remoteBranches, remotes), [branches, remoteBranches, remotes]);
  const defaults = useMemo(
    () => resolveFilesDiffDefaults(branches, remoteBranches, remotes, currentBranch, defaultBranch),
    [branches, currentBranch, defaultBranch, remoteBranches, remotes]
  );
  const [leftRef, setLeftRef] = useState(defaults.leftRef);
  const [rightRef, setRightRef] = useState(defaults.rightRef);
  const lastRequestKey = useRef("");

  useEffect(() => {
    setLeftRef((current) => {
      if (current && refs.some((ref) => ref.ref === current)) {
        return current;
      }
      return defaults.leftRef;
    });
    setRightRef((current) => {
      if (current && refs.some((ref) => ref.ref === current)) {
        return current;
      }
      return defaults.rightRef;
    });
  }, [defaults.leftRef, defaults.rightRef, refs]);

  useEffect(() => {
    if (!leftRef || !rightRef || leftRef === rightRef) {
      return;
    }
    const key = `${leftRef}\0${rightRef}\0${refs.length}`;
    if (key === lastRequestKey.current) {
      return;
    }
    lastRequestKey.current = key;
    onCompare(leftRef, rightRef);
  }, [leftRef, onCompare, refs.length, rightRef]);

  const selectedLeft = refs.find((ref) => ref.ref === leftRef);
  const selectedRight = refs.find((ref) => ref.ref === rightRef);
  const summary = diff?.leftRef === leftRef && diff.rightRef === rightRef ? diff.summary : undefined;
  const files = diff?.leftRef === leftRef && diff.rightRef === rightRef ? diff.files : [];
  const sameRef = Boolean(leftRef && rightRef && leftRef === rightRef);

  return (
    <div className="files-diff-tab">
      <div className="files-diff-toolbar">
        <BranchSelect label="Left" value={leftRef} refs={refs} onChange={setLeftRef} />
        <button
          className="icon-button files-diff-swap"
          type="button"
          title="Swap branches"
          aria-label="Swap branches"
          disabled={!leftRef || !rightRef}
          onClick={() => {
            setLeftRef(rightRef);
            setRightRef(leftRef);
          }}
        >
          <Icon type="swap" size={15} />
        </button>
        <BranchSelect label="Right" value={rightRef} refs={refs} onChange={setRightRef} />
        <button
          className="quick-button primary files-diff-compare"
          type="button"
          disabled={!leftRef || !rightRef || sameRef || loading}
          onClick={() => {
            if (leftRef && rightRef && leftRef !== rightRef) {
              lastRequestKey.current = "";
              onCompare(leftRef, rightRef);
            }
          }}
        >
          Compare
        </button>
      </div>

      <div className="files-diff-refs">
        <RefChip refInfo={selectedLeft} fallback={leftRef} />
        <span className="files-diff-direction">vs</span>
        <RefChip refInfo={selectedRight} fallback={rightRef} />
        {loading && <span className="files-diff-loading">Loading...</span>}
      </div>

      {sameRef ? (
        <div className="files-diff-empty">Choose two different branches to compare.</div>
      ) : refs.length < 2 ? (
        <div className="files-diff-empty">At least two local or remote branch refs are needed.</div>
      ) : (
        <>
          <div className="files-diff-summary">
            <SummaryCell label="files" value={summary?.files ?? 0} />
            <SummaryCell label="additions" value={summary?.additions ?? 0} className="added" />
            <SummaryCell label="deletions" value={summary?.deletions ?? 0} className="deleted" />
            <SummaryCell label="renamed" value={summary?.statuses.renamed ?? 0} />
            <SummaryCell label="binary" value={summary?.binaryFiles ?? 0} />
          </div>

          <div className="files-diff-table-wrap">
            <div className="files-diff-table">
              <div className="files-diff-header">
                <span>Status</span>
                <span>File</span>
                <span>+/-</span>
                <span />
              </div>
              {files.length === 0 && !loading ? (
                <div className="files-diff-empty-row">No file differences.</div>
              ) : (
                files.map((file) => (
                  <button
                    className="files-diff-row"
                    key={`${file.rawStatus}:${file.oldPath ?? ""}:${file.path}`}
                    type="button"
                    onClick={() => onOpenFile(leftRef, rightRef, file)}
                  >
                    <span className={`files-diff-status ${file.status}`}>{statusLabel(file)}</span>
                    <span className="files-diff-path">
                      {file.oldPath && <span className="files-diff-old-path">{file.oldPath}</span>}
                      {file.oldPath && <span className="files-diff-rename-arrow">-&gt;</span>}
                      <span>{file.path}</span>
                    </span>
                    <span className="files-diff-stat">
                      {file.binary ? (
                        <span style={{ color: theme.fgDim }}>binary</span>
                      ) : (
                        <>
                          <span className="added">+{file.additions ?? 0}</span>
                          <span className="deleted">-{file.deletions ?? 0}</span>
                        </>
                      )}
                    </span>
                    <span className="files-diff-open">
                      <Icon type="chevRight" size={13} />
                    </span>
                  </button>
                ))
              )}
            </div>
          </div>
        </>
      )}
    </div>
  );

  function RefChip({ refInfo, fallback }: { refInfo?: FilesDiffRef; fallback: string }) {
    const color = refInfo?.kind === "remote"
      ? remoteColor(refInfo.colorIndex, theme)
      : branchColor(refInfo?.colorIndex ?? 0, theme);
    return (
      <span className="files-diff-ref-chip">
        <span className="branch-dot" style={{ background: color }} />
        <span className="files-diff-ref-name">{refInfo?.label ?? fallback}</span>
        {refInfo?.isCurrent && <span className="tiny-pill current">current</span>}
        {refInfo?.isDefault && <span className="tiny-pill">default</span>}
      </span>
    );
  }
}

function BranchSelect({
  label,
  value,
  refs,
  onChange
}: {
  label: string;
  value: string;
  refs: FilesDiffRef[];
  onChange: (value: string) => void;
}) {
  return (
    <label className="files-diff-select">
      <span>{label}</span>
      <select value={value} onChange={(event) => onChange(event.target.value)}>
        <optgroup label="Local">
          {refs.filter((ref) => ref.kind === "local").map((ref) => (
            <option key={ref.ref} value={ref.ref}>
              {ref.label}
            </option>
          ))}
        </optgroup>
        <optgroup label="Remote">
          {refs.filter((ref) => ref.kind === "remote").map((ref) => (
            <option key={ref.ref} value={ref.ref}>
              {ref.label}
            </option>
          ))}
        </optgroup>
      </select>
    </label>
  );
}

function SummaryCell({ label, value, className }: { label: string; value: number; className?: string }) {
  return (
    <span className={`files-diff-summary-cell${className ? ` ${className}` : ""}`}>
      <strong>{value}</strong>
      <span>{label}</span>
    </span>
  );
}

function statusLabel(file: FilesDiffFileChange): string {
  if (file.status === "renamed" || file.status === "copied") {
    return file.rawStatus;
  }
  return file.rawStatus.charAt(0) || "?";
}
