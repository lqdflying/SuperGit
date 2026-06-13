/**
 * Branch History — SuperGit visual reference mockup.
 * Spec: branch-history-coding-guide.md
 *
 * Standalone preview file; production uses ThemeProvider + CSS classes from media/styles.css.
 */
import { useState, useMemo } from "react";

// Mock ThemeColors shape (matches src/shared/themeColors.ts + history extensions)
const theme = {
  bg0: "#0d1117",
  bg1: "#161b22",
  bg2: "#1c2129",
  bg3: "#21262d",
  border: "#30363d",
  borderSubtle: "#21262d",
  fg: "#c9d1d9",
  fgDim: "#6e7681",
  fgMuted: "#484f58",
  fgBright: "#e6edf3",
  accent: "#2f81f7",
  selection: "rgba(47,129,247,0.08)",
  hover: "rgba(136,198,255,0.03)",
  branch: ["#f78166", "#58a6ff", "#7ee787", "#d2a8ff", "#ffa657", "#79c0ff", "#f778ba", "#a5d6ff"],
  remote: ["#58a6ff", "#d2a8ff", "#7ee787", "#ffa657"],
  ahead: "#56d364",
  behind: "#f85149",
  synced: "#58a6ff",
  historyGrid: "#21262d",
  historyGridWeek: "#30363d",
  historyMerged: "#8b949e",
  historyStale: "#484f58",
  historyWarn: "#d29922",
  historyDanger: "#f85149",
  historyOk: "#3fb950",
  currentBadge: "#f85149",
  currentBadgeBg: "rgba(248,81,73,0.13)",
  buttonFg: "#ffffff",
};

const Fn = "-apple-system,BlinkMacSystemFont,'Segoe UI',Helvetica,Arial,sans-serif";
const Mo = "'SF Mono','Fira Code','JetBrains Mono',Consolas,monospace";
const DEFAULT_BRANCH = "main";
const BASE = new Date("2026-06-13T23:59:59");
const dayOf = (n) => { const d = new Date(BASE); d.setDate(d.getDate() - (29 - n)); return d; };
const fmtD = (d) => `${d.toLocaleString("en", { month: "short" })} ${d.getDate()}`;

const DAYS = 30;
const MAIN_COMMITS = [0, 1, 3, 5, 7, 9, 11, 13, 15, 17, 19, 21, 23, 25, 27, 28, 29];
const H = ["a3f2e1d", "b7c8d9e", "c1d2e3f", "d4e5f6a", "e8f9a0b", "f2a3b4c", "a7b8c9d", "b1c2d3e", "c5d6e7f", "d9e0f1a", "e3f4a5b", "f7a8b9c", "a2b3c4d", "b6c7d8e", "c0d1e2f", "d4e5f6a", "e8f9a0b", "f2a3b4c", "17f5363", "26ab2c2", "8fbae3c", "459fa94", "0cdebf5", "f28bc66", "3394f7a", "d757871", "261bc71", "700233a", "a74bc49", "879a71b"];

const BRANCHES = [
  {
    name: DEFAULT_BRANCH, colorIndex: 0, isCurrent: false, status: "active", start: 0, end: 29,
    commits: MAIN_COMMITS, hashStart: H[0], hashEnd: H[29], fork: null, merge: null,
    ahead: 0, behind: 0, lca: 29, stale: false,
    remotes: [
      { name: "origin", colorIndex: 0, pushDay: 27, hash: "d757871", behindLocal: 2 },
      { name: "upstream", colorIndex: 1, pushDay: 25, hash: "e8f9a0b", behindLocal: 4 },
    ],
    desc: `Primary mainline. origin/${DEFAULT_BRANCH} is 2 commits behind local. upstream/${DEFAULT_BRANCH} is 4 behind.`,
  },
  {
    name: "feature/auth-flow", colorIndex: 1, isCurrent: true, status: "diverged", severity: "mild", start: 18, end: 29,
    commits: [18, 19, 20, 22, 24, 26, 28, 29], hashStart: H[18], hashEnd: "e5f6a7b",
    fork: { b: DEFAULT_BRANCH, d: 18 }, merge: null, ahead: 5, behind: 3, lca: 25, stale: false,
    remotes: [{ name: "origin", colorIndex: 0, pushDay: 26, hash: "79c0ff1", behindLocal: 2 }],
    divergePerRemote: [
      { remote: "origin", behind: 5, mainRef: `origin/${DEFAULT_BRANCH}` },
      { remote: "upstream", behind: 7, mainRef: `upstream/${DEFAULT_BRANCH}` },
    ],
    desc: "OAuth2 PKCE for MCP auth. Pushed to origin (2 unpushed). 3 behind local main.",
  },
  {
    name: "feature/i18n", colorIndex: 2, isCurrent: false, status: "merged", start: 8, end: 20,
    commits: [8, 9, 10, 12, 14, 16, 18, 19], hashStart: H[8], hashEnd: "cff45d5",
    fork: { b: DEFAULT_BRANCH, d: 8 }, merge: { b: DEFAULT_BRANCH, d: 20 }, ahead: 0, behind: 0, lca: 20, stale: false,
    remotes: [{ name: "origin", colorIndex: 0, pushDay: 20, hash: "cff45d5", behindLocal: 0 }],
    desc: "Internationalization. Merged via PR #12.",
  },
  {
    name: "release/v1.2.0", colorIndex: 4, isCurrent: false, status: "merged", start: 14, end: 22,
    commits: [14, 16, 18, 20, 21], hashStart: H[14], hashEnd: "1594dd6",
    fork: { b: DEFAULT_BRANCH, d: 14 }, merge: { b: DEFAULT_BRANCH, d: 22 }, ahead: 0, behind: 0, lca: 22, stale: false,
    remotes: [{ name: "origin", colorIndex: 0, pushDay: 22, hash: "1594dd6", behindLocal: 0 }],
    desc: "Release v1.2.0. Tagged and merged.",
  },
  {
    name: "feature/experimental-ai", colorIndex: 6, isCurrent: false, status: "diverged", severity: "severe", start: 6, end: 29,
    commits: [6, 8, 10, 12, 14], hashStart: H[6], hashEnd: "86fc8a7",
    fork: { b: DEFAULT_BRANCH, d: 6 }, merge: null, ahead: 5, behind: 18, lca: 6, stale: true,
    remotes: [
      { name: "origin", colorIndex: 0, pushDay: 12, hash: "d9e0f1a", behindLocal: 2 },
      { name: "upstream", colorIndex: 1, pushDay: 10, hash: "c5d6e7f", behindLocal: 4 },
    ],
    divergePerRemote: [
      { remote: "origin", behind: 16, mainRef: `origin/${DEFAULT_BRANCH}` },
      { remote: "upstream", behind: 20, mainRef: `upstream/${DEFAULT_BRANCH}` },
    ],
    desc: "Experimental AI. Severely diverged from all remotes.",
  },
  {
    name: "hotfix/db-timeout", colorIndex: 5, isCurrent: false, status: "diverged", severity: "high", start: 10, end: 16,
    commits: [10, 11, 12], hashStart: H[10], hashEnd: "0541a49",
    fork: { b: DEFAULT_BRANCH, d: 10 }, merge: null, ahead: 3, behind: 14, lca: 10, stale: true,
    remotes: [{ name: "origin", colorIndex: 0, pushDay: 12, hash: "0541a49", behindLocal: 0 }],
    divergePerRemote: [{ remote: "origin", behind: 12, mainRef: `origin/${DEFAULT_BRANCH}` }],
    desc: "DB timeout fix. Pushed to origin only. 14 behind local main.",
  },
  {
    name: "feature/rate-limiter", colorIndex: 7, isCurrent: false, status: "merged", start: 0, end: 6,
    commits: [0, 1, 2, 4, 5], hashStart: H[0], hashEnd: "5c7fa83",
    fork: { b: DEFAULT_BRANCH, d: 0 }, merge: { b: DEFAULT_BRANCH, d: 6 }, ahead: 0, behind: 0, lca: 6, stale: false,
    remotes: [{ name: "origin", colorIndex: 0, pushDay: 6, hash: "5c7fa83", behindLocal: 0 }],
    desc: "Rate limiter. Merged via PR #7.",
  },
  {
    name: "feature/legacy-api", colorIndex: 0, remoteOnly: true, remote: "origin", isCurrent: false,
    status: "remote-only", start: 12, end: 24,
    commits: [12, 14, 16, 18, 20, 22, 24], hashStart: H[12], hashEnd: "b6c7d8e",
    fork: null, merge: null, ahead: 0, behind: 0, lca: 12, stale: false,
    remotes: [{ name: "origin", colorIndex: 0, pushDay: 24, hash: "b6c7d8e", behindLocal: 0 }],
    desc: "Remote branch only on origin. No local branch exists.",
  },
];

const ST = {
  active: { label: "Active", icon: "\u25CF" },
  merged: { label: "Merged", icon: "\u2713" },
  diverged: { label: "Diverged", icon: "\u26A0" },
  "remote-only": { label: "Remote-only", icon: "\u25CB" },
};
const SEV = { mild: { label: "Mild" }, high: { label: "High" }, severe: { label: "Severe" } };

const branchColor = (i) => theme.branch[i % theme.branch.length];
const remoteColor = (i) => theme.remote[i % theme.remote.length];

const stColor = (s, sev) => {
  if (s === "active") return theme.historyOk;
  if (s === "merged") return theme.historyMerged;
  if (s === "diverged") return sev === "mild" ? theme.historyWarn : theme.historyDanger;
  if (s === "remote-only") return theme.fgMuted;
  return theme.fgMuted;
};

const LABEL_W = 220;
const DAY_W = 30;
const LANE_H = 72;
const BAR_H = 8;
const DIV_GAP = 14;

const PRESETS = [
  { label: "7d", days: 7 },
  { label: "14d", days: 14 },
  { label: "30d", days: 30 },
  { label: "All", days: 90 },
];

export default function BranchHistoryMock() {
  const [selName, setSelName] = useState("feature/experimental-ai");
  const [hovName, setHovName] = useState(null);
  const [presetDays, setPresetDays] = useState(30);

  const totalDays = presetDays === 90 ? DAYS : presetDays;
  const rangeStart = DAYS - totalDays;
  const visibleBranches = BRANCHES.filter((b) => b.end >= rangeStart);
  const selBr = BRANCHES.find((b) => b.name === selName);

  const sorted = useMemo(() => {
    const ord = { diverged: 0, active: 1, "remote-only": 2, merged: 3 };
    const sevOrd = { severe: 0, high: 1, mild: 2 };
    return [...visibleBranches].sort((a, b) => {
      if (a.name === DEFAULT_BRANCH) return -1;
      if (b.name === DEFAULT_BRANCH) return 1;
      const s = (ord[a.status] || 0) - (ord[b.status] || 0);
      if (s !== 0) return s;
      if (a.status === "diverged" && b.status === "diverged") {
        return (sevOrd[a.severity] || 0) - (sevOrd[b.severity] || 0);
      }
      if (a.status === "remote-only" && b.status === "remote-only") {
        return a.name.localeCompare(b.name);
      }
      return b.start - a.start;
    });
  }, [visibleBranches]);

  const markers = useMemo(() => {
    const m = [];
    for (let i = rangeStart; i < DAYS; i++) {
      const d = dayOf(i);
      const isMonday = d.getDay() === 1;
      const isFirst = i === rangeStart;
      m.push({ day: i - rangeStart, absDay: i, date: d, isWeek: isMonday || isFirst, label: (isMonday || isFirst) ? fmtD(d) : null });
    }
    return m;
  }, [presetDays, rangeStart]);

  const timeW = totalDays * DAY_W;
  const lx = (day) => LABEL_W + (day - rangeStart) * DAY_W + DAY_W / 2;
  const mainCommitsAfter = (lcaDay) => MAIN_COMMITS.filter((d) => d > lcaDay);

  const laneHeights = sorted.map((br) =>
    br.status === "diverged" && br.name !== DEFAULT_BRANCH ? LANE_H + DIV_GAP + 10 : LANE_H
  );
  const laneY = (idx) => laneHeights.slice(0, idx).reduce((s, h) => s + h, 0) + 44;
  const svgH = laneHeights.reduce((s, h) => s + h, 0) + 56;

  const counts = {
    active: visibleBranches.filter((b) => b.status === "active").length,
    merged: visibleBranches.filter((b) => b.status === "merged").length,
    diverged: visibleBranches.filter((b) => b.status === "diverged").length,
    stale: visibleBranches.filter((b) => b.stale).length,
  };

  return (
    <div style={{ width: "100%", height: "100vh", display: "flex", flexDirection: "column", background: theme.bg0, color: theme.fg, fontFamily: Fn, fontSize: 13, overflow: "hidden", userSelect: "none" }}>

      {/* TitleBar stub */}
      <header style={{ display: "flex", alignItems: "center", gap: 10, padding: "8px 16px", borderBottom: `1px solid ${theme.border}`, background: theme.bg1, flexShrink: 0 }}>
        <span style={{ width: 8, height: 8, borderRadius: "50%", background: theme.accent }} />
        <span style={{ fontWeight: 700, color: theme.fgBright }}>Git Graph</span>
        <span style={{ color: theme.fgDim, fontSize: 12 }}>supergit</span>
        <div style={{ flex: 1 }} />
        <span style={{ fontSize: 11, color: theme.fgDim, padding: "4px 8px" }}>Refresh</span>
      </header>

      {/* TabBar stub */}
      <div style={{ display: "flex", gap: 2, padding: "0 12px", borderBottom: `1px solid ${theme.border}`, background: theme.bg1, flexShrink: 0 }}>
        {[
          { id: "graph", label: "Commit Graph" },
          { id: "branches", label: "Branch Tracking" },
          { id: "history", label: "Branch History" },
        ].map((t) => (
          <div key={t.id} style={{
            padding: "8px 14px", fontSize: 12, fontWeight: 600, cursor: "default",
            color: t.id === "history" ? theme.accent : theme.fgDim,
            borderBottom: t.id === "history" ? `2px solid ${theme.accent}` : "2px solid transparent",
          }}>
            {t.label}
          </div>
        ))}
      </div>

      {/* BranchHistoryTab body */}
      <div style={{ flex: 1, display: "flex", flexDirection: "column", overflow: "hidden", minHeight: 0 }}>

        {/* DateRangeBar stub (.date-range-bar) */}
        <div style={{ display: "flex", alignItems: "center", gap: 6, padding: "8px 16px", borderBottom: `1px solid ${theme.borderSubtle}`, flexShrink: 0 }}>
          <span style={{ fontSize: 11, color: theme.fgDim }}>[cal]</span>
          {PRESETS.map((p) => (
            <button key={p.label} type="button" onClick={() => setPresetDays(p.days)}
              style={{
                fontSize: 11, padding: "3px 10px", borderRadius: 6, border: "none", cursor: "pointer", fontWeight: 600,
                background: presetDays === p.days ? theme.accent : theme.bg3,
                color: presetDays === p.days ? theme.buttonFg : theme.fgDim,
              }}>
              {p.label}
            </button>
          ))}
          <button type="button" style={{ fontSize: 11, padding: "3px 10px", borderRadius: 6, border: "none", background: theme.bg3, color: theme.fgDim, cursor: "pointer" }}>Custom</button>
          <div style={{ flex: 1 }} />
          <span style={{ fontSize: 11, color: theme.fgMuted }}>{visibleBranches.length} branches</span>
        </div>

        {/* Tab-local summary (.branch-history-summary) */}
        <div style={{ display: "flex", alignItems: "center", gap: 14, padding: "6px 16px", fontSize: 11, borderBottom: `1px solid ${theme.borderSubtle}`, flexShrink: 0 }}>
          <SummaryStat label="active" count={counts.active} color={theme.historyOk} />
          <SummaryStat label="diverged" count={counts.diverged} color={theme.historyDanger} />
          <SummaryStat label="merged" count={counts.merged} color={theme.historyMerged} />
          <SummaryStat label="stale" count={counts.stale} color={theme.historyWarn} />
          <div style={{ flex: 1 }} />
          <span style={{ color: theme.fgMuted }}>{fmtD(dayOf(rangeStart))} — {fmtD(dayOf(29))}</span>
        </div>

        {/* Legend (.branch-history-legend) */}
        <div style={{ display: "flex", gap: 16, padding: "8px 16px 4px", flexShrink: 0, flexWrap: "wrap", alignItems: "center" }}>
          {Object.entries(ST).map(([k, v]) => (
            <span key={k} style={{ display: "flex", alignItems: "center", gap: 4, fontSize: 11, color: theme.fgDim }}>
              <span style={{ fontSize: 10, color: stColor(k, k === "diverged" ? "mild" : undefined) }}>{v.icon}</span>
              {v.label}
            </span>
          ))}
          <span style={{ fontSize: 9, background: `${theme.historyStale}18`, padding: "0 4px", borderRadius: 3, color: theme.historyStale, fontWeight: 600 }}>stale</span>
          <span style={{ fontSize: 11, color: theme.fgDim }}>No recent activity</span>
        </div>

        {/* Timeline + detail */}
        <div style={{ flex: 1, display: "flex", overflow: "hidden", minHeight: 0 }}>
          <div className="branch-history-timeline" style={{ flex: 1, overflow: "auto" }}>
            <svg width={LABEL_W + timeW + 60} height={svgH} style={{ display: "block" }}>
              {markers.map((m, i) => {
                const x = LABEL_W + m.day * DAY_W + DAY_W / 2;
                const isToday = m.absDay === 29;
                return (
                  <g key={i}>
                    <line x1={x} y1={32} x2={x} y2={svgH}
                      stroke={isToday ? theme.accent : m.isWeek ? theme.historyGridWeek : theme.historyGrid}
                      strokeWidth={isToday ? 1.5 : m.isWeek ? 1 : 0.5}
                      opacity={isToday ? 0.5 : m.isWeek ? 0.5 : 0.25} />
                    {m.label && (
                      <text x={x} y={18} textAnchor="middle" fontSize={10.5} fontFamily={Mo}
                        fill={isToday ? theme.accent : theme.fgDim} fontWeight={isToday ? 700 : 500}>{m.label}</text>
                    )}
                    {isToday && (
                      <g>
                        <rect x={x - 18} y={22} width={36} height={14} rx={7} fill={theme.accent} />
                        <text x={x} y={32} textAnchor="middle" fontSize={8.5} fontFamily={Mo} fill={theme.buttonFg} fontWeight={700}>Today</text>
                      </g>
                    )}
                  </g>
                );
              })}

              {sorted.map((br, idx) => {
                const y = laneY(idx);
                const barY = y + 24;
                const isSel = br.name === selName;
                const isHov = br.name === hovName;
                const isMain = br.name === DEFAULT_BRANCH;
                const brC = br.remoteOnly ? remoteColor(br.colorIndex) : branchColor(br.colorIndex);
                const startX = lx(Math.max(br.start, rangeStart));
                const endX = lx(Math.min(br.end, 29));
                const lastCommitX = br.commits.length > 0 ? lx(Math.max(br.commits[br.commits.length - 1], rangeStart)) : startX;
                const showDivTrack = br.status === "diverged" && !isMain;
                const mainGhostY = barY + BAR_H + DIV_GAP;

                return (
                  <g key={br.name}
                    onClick={() => setSelName(br.name)}
                    onMouseEnter={() => setHovName(br.name)}
                    onMouseLeave={() => setHovName(null)}
                    style={{ cursor: "pointer" }}>

                    {(isSel || isHov) && (
                      <rect x={0} y={y - 2} width={LABEL_W + timeW + 60} height={laneHeights[idx]}
                        fill={isSel ? theme.selection : theme.hover} />
                    )}
                    {isSel && <rect x={0} y={y - 2} width={3} height={laneHeights[idx]} fill={brC} rx={1} />}

                    <foreignObject x={10} y={y + 2} width={LABEL_W - 16} height={laneHeights[idx] - 8}>
                      <div style={{ display: "flex", flexDirection: "column", justifyContent: "center", height: "100%", gap: 3 }}>
                        <div style={{ display: "flex", alignItems: "center", gap: 6 }}>
                          <div style={{ width: 10, height: 10, borderRadius: "50%", background: brC, flexShrink: 0, boxShadow: isSel ? `0 0 8px ${brC}55` : "none" }} />
                          <span style={{ fontSize: 12, fontWeight: 600, color: isSel ? theme.fgBright : theme.fg, fontFamily: Mo, overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>
                            {br.remoteOnly ? `${br.remote}/${br.name}` : br.name}
                          </span>
                          {br.isCurrent && (
                            <span style={{ fontSize: 8, fontWeight: 700, color: theme.currentBadge, background: theme.currentBadgeBg, padding: "1px 5px", borderRadius: 4, flexShrink: 0 }}>current</span>
                          )}
                        </div>
                        <div style={{ display: "flex", alignItems: "center", gap: 6, paddingLeft: 16, flexWrap: "wrap" }}>
                          {br.remoteOnly ? (
                            <span style={{ fontSize: 10, color: theme.fgMuted, fontWeight: 600 }}>no local branch</span>
                          ) : (
                            <span style={{ fontSize: 10, color: stColor(br.status, br.severity), fontWeight: 600 }}>
                              <span style={{ fontSize: 9 }}>{ST[br.status].icon}</span> {ST[br.status].label}
                              {br.severity ? ` \u00B7 ${SEV[br.severity].label}` : ""}
                            </span>
                          )}
                          {br.stale && (
                            <span style={{ fontSize: 9, color: theme.historyStale, background: `${theme.historyStale}18`, padding: "0 5px", borderRadius: 4, fontWeight: 600 }}>stale</span>
                          )}
                          {!isMain && !br.remoteOnly && br.status !== "merged" && (br.ahead > 0 || br.behind > 0) && (
                            <span style={{ fontSize: 10, fontFamily: Mo, color: theme.fgMuted }}>
                              {br.ahead > 0 && <span style={{ color: theme.ahead }}>+{br.ahead}</span>}
                              {br.ahead > 0 && br.behind > 0 && " "}
                              {br.behind > 0 && <span style={{ color: br.behind > 10 ? theme.historyDanger : theme.historyWarn }}>-{br.behind}</span>}
                            </span>
                          )}
                        </div>
                      </div>
                    </foreignObject>

                    {/* Branch bar */}
                    {br.remoteOnly ? (
                      <rect x={startX} y={barY} width={Math.max(endX - startX, 4)} height={BAR_H} rx={BAR_H / 2}
                        fill="none" stroke={brC} strokeWidth={1.5} strokeDasharray="6,4" opacity={0.35} />
                    ) : br.stale ? (<>
                      <rect x={startX} y={barY} width={Math.max(lastCommitX - startX, 4)} height={BAR_H} rx={BAR_H / 2} fill={brC} opacity={0.5} />
                      <line x1={lastCommitX} y1={barY + BAR_H / 2} x2={endX} y2={barY + BAR_H / 2} stroke={brC} strokeWidth={2} strokeDasharray="6,4" opacity={0.2} strokeLinecap="round" />
                    </>) : br.status === "merged" ? (
                      <rect x={startX} y={barY} width={Math.max(endX - startX, 4)} height={BAR_H} rx={BAR_H / 2} fill={theme.historyMerged} opacity={0.35} />
                    ) : (
                      <rect x={startX} y={barY} width={Math.max(endX - startX, 4)} height={BAR_H} rx={BAR_H / 2} fill={brC} opacity={isMain ? 0.65 : 0.5} />
                    )}

                    {br.commits.filter((d) => d >= rangeStart).map((day, ci) => (
                      <circle key={ci} cx={lx(day)} cy={barY + BAR_H / 2} r={isMain ? 3 : 3.5}
                        fill={br.status === "merged" ? theme.historyMerged : brC}
                        stroke={theme.bg0} strokeWidth={1.5} opacity={0.95} />
                    ))}

                    <text x={startX} y={barY - 5} textAnchor="middle" fontSize={8.5} fontFamily={Mo} fill={theme.fgMuted} opacity={0.7}>{br.hashStart}</text>
                    <text x={br.stale ? lastCommitX : endX} y={barY - 5} textAnchor="middle" fontSize={8.5} fontFamily={Mo}
                      fill={br.status === "diverged" ? (br.severity === "mild" ? theme.historyWarn : theme.historyDanger) : br.status === "merged" ? theme.historyMerged : theme.fgDim}
                      fontWeight={600} opacity={0.8}>{br.hashEnd}</text>

                    {!br.remoteOnly && br.remotes?.filter((r) => r.pushDay >= rangeStart && r.behindLocal > 0).map((rem) => {
                      const rx = lx(rem.pushDay);
                      const rc = remoteColor(rem.colorIndex);
                      return (
                        <g key={rem.name}>
                          <polygon points={`${rx},${barY - 1} ${rx - 3.5},${barY - 7} ${rx + 3.5},${barY - 7}`} fill={rc} opacity={0.7} />
                          <text x={rx} y={barY - 9} textAnchor="middle" fontSize={7.5} fontFamily={Mo} fill={rc} fontWeight={600} opacity={0.8}>
                            {rem.name}/{rem.hash.slice(0, 4)}
                          </text>
                          <text x={rx + (endX - rx) / 2} y={barY + BAR_H + 10} textAnchor="middle" fontSize={7} fontFamily={Mo} fill={rc} opacity={0.5}>
                            {rem.behindLocal} unpushed
                          </text>
                          <line x1={rx} y1={barY + BAR_H + 3} x2={endX} y2={barY + BAR_H + 3} stroke={rc} strokeWidth={0.8} opacity={0.25} />
                          <line x1={rx} y1={barY + BAR_H + 1} x2={rx} y2={barY + BAR_H + 5} stroke={rc} strokeWidth={0.8} opacity={0.25} />
                          <line x1={endX} y1={barY + BAR_H + 1} x2={endX} y2={barY + BAR_H + 5} stroke={rc} strokeWidth={0.8} opacity={0.25} />
                        </g>
                      );
                    })}

                    {showDivTrack && (() => {
                      const lcaX = lx(Math.max(br.lca, rangeStart));
                      const mainEnd = lx(29);
                      const ghostCommits = mainCommitsAfter(br.lca);
                      const mainC = branchColor(0);
                      return (
                        <g>
                          <text x={LABEL_W - 6} y={mainGhostY + BAR_H / 2 + 3} textAnchor="end"
                            fontSize={9} fontFamily={Mo} fill={mainC} opacity={0.45} fontWeight={500}>{DEFAULT_BRANCH}</text>
                          <rect x={lcaX} y={mainGhostY} width={mainEnd - lcaX} height={BAR_H} rx={BAR_H / 2} fill={mainC} opacity={0.15} />
                          {ghostCommits.filter((d) => d >= rangeStart).map((day, ci) => (
                            <circle key={ci} cx={lx(day)} cy={mainGhostY + BAR_H / 2} r={2.5} fill="none" stroke={mainC} strokeWidth={1.2} opacity={0.35} />
                          ))}
                          <line x1={lcaX} y1={barY + BAR_H} x2={lcaX} y2={mainGhostY} stroke={theme.fgMuted} strokeWidth={1} strokeDasharray="2,2" opacity={0.3} />
                          <text x={lcaX - 4} y={barY + BAR_H + (mainGhostY - barY - BAR_H) / 2 + 3}
                            textAnchor="end" fontSize={7.5} fontFamily={Mo} fill={theme.fgMuted} opacity={0.5}>LCA {H[br.lca]}</text>
                          <rect x={mainEnd + 6} y={mainGhostY - 2} width={32} height={BAR_H + 4} rx={6}
                            fill={br.behind > 12 ? `${theme.historyDanger}18` : `${theme.historyWarn}18`}
                            stroke={br.behind > 12 ? `${theme.historyDanger}35` : `${theme.historyWarn}35`} strokeWidth={0.5} />
                          <text x={mainEnd + 22} y={mainGhostY + BAR_H / 2 + 3} textAnchor="middle"
                            fontSize={9} fontWeight={700} fontFamily={Mo} fill={br.behind > 12 ? theme.historyDanger : theme.historyWarn}>-{br.behind}</text>
                          <g opacity={0.3}>
                            <line x1={endX + 4} y1={barY + BAR_H / 2} x2={endX + 4} y2={mainGhostY + BAR_H / 2} stroke={theme.historyDanger} strokeWidth={1.5} />
                            <line x1={endX + 2} y1={barY + BAR_H / 2} x2={endX + 6} y2={barY + BAR_H / 2} stroke={theme.historyDanger} strokeWidth={1.5} />
                            <line x1={endX + 2} y1={mainGhostY + BAR_H / 2} x2={endX + 6} y2={mainGhostY + BAR_H / 2} stroke={theme.historyDanger} strokeWidth={1.5} />
                          </g>
                        </g>
                      );
                    })()}

                    {br.status === "diverged" && !isMain && (
                      <rect x={lx(Math.max(br.lca, rangeStart))} y={barY + BAR_H + 2} width={endX - lx(Math.max(br.lca, rangeStart))} height={2}
                        rx={1} fill={br.behind > 12 ? theme.historyDanger : theme.historyWarn} opacity={0.4} />
                    )}

                    {br.stale && (
                      <g>
                        <rect x={endX + 8} y={barY - 1} width={40} height={BAR_H + 2} rx={5}
                          fill={`${theme.historyStale}15`} stroke={`${theme.historyStale}30`} strokeWidth={0.5} />
                        <text x={endX + 28} y={barY + BAR_H / 2 + 3} textAnchor="middle"
                          fontSize={8.5} fontWeight={600} fontFamily={Mo} fill={theme.historyStale}>
                          {29 - br.commits[br.commits.length - 1]}d idle
                        </text>
                      </g>
                    )}
                  </g>
                );
              })}
            </svg>
          </div>

          {/* Detail panel (.branch-history-detail) */}
          {selBr && (
            <div style={{ width: 320, borderLeft: `1px solid ${theme.border}`, background: theme.bg1, flexShrink: 0, overflowY: "auto" }}>
              <div style={{ padding: "20px 20px 16px", borderBottom: `1px solid ${theme.borderSubtle}` }}>
                <div style={{ display: "flex", alignItems: "center", gap: 10, marginBottom: 10 }}>
                  <div style={{ width: 14, height: 14, borderRadius: "50%", background: selBr.remoteOnly ? remoteColor(selBr.colorIndex) : branchColor(selBr.colorIndex), boxShadow: `0 0 10px ${branchColor(selBr.colorIndex)}44` }} />
                  <span style={{ fontSize: 15, fontWeight: 700, color: theme.fgBright, fontFamily: Mo }}>
                    {selBr.remoteOnly ? `${selBr.remote}/${selBr.name}` : selBr.name}
                  </span>
                </div>
                <span style={{ display: "inline-flex", alignItems: "center", gap: 4, fontSize: 11, fontWeight: 600, padding: "3px 10px", borderRadius: 20, background: `${stColor(selBr.status, selBr.severity)}15`, color: stColor(selBr.status, selBr.severity), border: `1px solid ${stColor(selBr.status, selBr.severity)}25` }}>
                  <span style={{ fontSize: 10 }}>{ST[selBr.status].icon}</span>
                  {selBr.remoteOnly ? "Remote branch only" : `${ST[selBr.status].label}${selBr.severity ? ` \u00B7 ${SEV[selBr.severity].label}` : ""}`}
                </span>
                {selBr.stale && (
                  <span style={{ display: "inline-flex", fontSize: 10, fontWeight: 600, padding: "2px 8px", borderRadius: 20, background: `${theme.historyStale}15`, color: theme.historyStale, border: `1px solid ${theme.historyStale}25`, marginLeft: 6 }}>
                    Stale
                  </span>
                )}
                <p style={{ fontSize: 12.5, color: theme.fgDim, lineHeight: 1.6, margin: "12px 0 0" }}>{selBr.desc}</p>
              </div>

              <DetailSection title="Commit References">
                <HashRow label="Fork point" hash={selBr.hashStart} date={fmtD(dayOf(selBr.start))} color={branchColor(selBr.colorIndex)} />
                <HashRow label={selBr.status === "merged" ? "Merge commit" : selBr.remoteOnly ? "Remote HEAD" : "Local HEAD"} hash={selBr.hashEnd} date={fmtD(dayOf(selBr.end))} color={selBr.status === "merged" ? theme.historyMerged : branchColor(selBr.colorIndex)} />
                {!selBr.remoteOnly && selBr.name !== DEFAULT_BRANCH && selBr.status !== "merged" && (
                  <HashRow label="Last common ancestor" hash={H[selBr.lca]} date={fmtD(dayOf(selBr.lca))} color={theme.fgMuted} />
                )}
              </DetailSection>

              {selBr.remotes?.length > 0 && (
                <DetailSection title="Remote Tracking">
                  {selBr.remotes.map((rem) => {
                    const rc = remoteColor(rem.colorIndex);
                    return (
                      <div key={rem.name} style={{ padding: "8px 12px", borderRadius: 8, background: theme.bg2, border: `1px solid ${theme.borderSubtle}`, marginBottom: 8 }}>
                        <div style={{ display: "flex", alignItems: "center", gap: 6, marginBottom: 4 }}>
                          <div style={{ width: 7, height: 7, borderRadius: "50%", background: rc }} />
                          <span style={{ fontSize: 12, fontWeight: 600, color: theme.fgBright }}>{rem.name}</span>
                          <span style={{ fontSize: 10, fontFamily: Mo, color: theme.fgMuted, background: theme.bg3, padding: "0 5px", borderRadius: 3 }}>{rem.hash}</span>
                        </div>
                        <div style={{ fontSize: 11, paddingLeft: 13 }}>
                          {rem.behindLocal === 0 ? (
                            <span style={{ color: theme.synced }}>Fully pushed</span>
                          ) : (
                            <span style={{ color: theme.historyWarn }}>{rem.behindLocal} unpushed commits</span>
                          )}
                          <span style={{ color: theme.fgMuted }}> · pushed at {fmtD(dayOf(rem.pushDay))}</span>
                        </div>
                        {selBr.divergePerRemote?.filter((d) => d.remote === rem.name).map((d) => (
                          <div key={d.remote} style={{ fontSize: 10, paddingLeft: 13, marginTop: 4 }}>
                            <span style={{ color: theme.fgMuted }}>vs {d.mainRef}: </span>
                            <span style={{ color: d.behind > 10 ? theme.historyDanger : theme.historyWarn, fontWeight: 600, fontFamily: Mo }}>-{d.behind} behind</span>
                          </div>
                        ))}
                      </div>
                    );
                  })}
                </DetailSection>
              )}

              {!selBr.remoteOnly && selBr.name !== DEFAULT_BRANCH && (
                <DetailSection title={`Divergence from ${DEFAULT_BRANCH}`}>
                  {selBr.status === "merged" ? (
                    <span style={{ fontSize: 12, color: theme.historyMerged }}>Fully merged</span>
                  ) : selBr.ahead === 0 && selBr.behind === 0 ? (
                    <span style={{ fontSize: 12, color: theme.synced }}>In sync</span>
                  ) : (
                    <div>
                      <div style={{ display: "flex", gap: 2, marginBottom: 8, height: 6, borderRadius: 3, overflow: "hidden", background: theme.bg3 }}>
                        {selBr.ahead > 0 && <div style={{ flex: selBr.ahead, background: theme.ahead, borderRadius: 3 }} />}
                        {selBr.behind > 0 && <div style={{ flex: selBr.behind, background: selBr.behind > 10 ? theme.historyDanger : theme.historyWarn, borderRadius: 3 }} />}
                      </div>
                      <div style={{ display: "flex", justifyContent: "space-between", fontSize: 11 }}>
                        {selBr.ahead > 0 && <span style={{ color: theme.ahead, fontFamily: Mo, fontWeight: 600 }}>+{selBr.ahead} ahead</span>}
                        {selBr.behind > 0 && <span style={{ color: selBr.behind > 10 ? theme.historyDanger : theme.historyWarn, fontFamily: Mo, fontWeight: 600 }}>-{selBr.behind} behind</span>}
                      </div>
                    </div>
                  )}
                </DetailSection>
              )}

              <DetailSection title="Metrics">
                <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: "10px 14px" }}>
                  <MetricCell label="Commits" value={selBr.commits.length} />
                  <MetricCell label="Age" value={`${selBr.end - selBr.start + 1}d`} />
                  <MetricCell label="Last active" value={selBr.commits.length > 0 ? `${29 - selBr.commits[selBr.commits.length - 1]}d ago` : "-"} />
                  <MetricCell label="Status" value={selBr.remoteOnly ? "Remote-only" : ST[selBr.status].label + (selBr.severity ? ` (${SEV[selBr.severity].label})` : "")} color={stColor(selBr.status, selBr.severity)} />
                </div>
              </DetailSection>

              <DetailSection title="Quick Actions">
                <ActionButtons branch={selBr} />
              </DetailSection>
            </div>
          )}
        </div>
      </div>

      {/* StatusBar stub (shared footer) */}
      <footer style={{ display: "flex", alignItems: "center", gap: 12, padding: "6px 16px", borderTop: `1px solid ${theme.border}`, background: theme.bg1, fontSize: 11, color: theme.fgDim, flexShrink: 0 }}>
        <span style={{ color: theme.synced }}>feature/auth-flow</span>
        <span>|</span>
        <span>2 remotes</span>
        <span>|</span>
        <span>142 commits</span>
        <div style={{ flex: 1 }} />
        <span>fetched 2m ago</span>
      </footer>
    </div>
  );
}

function SummaryStat({ label, count, color }) {
  return (
    <span style={{ display: "flex", alignItems: "center", gap: 4, color }}>
      <span style={{ fontWeight: 700 }}>{count}</span>
      <span style={{ opacity: 0.7 }}>{label}</span>
    </span>
  );
}

function DetailSection({ title, children }) {
  return (
    <div style={{ padding: "14px 20px", borderBottom: `1px solid ${theme.borderSubtle}` }}>
      <div style={{ fontSize: 10, fontWeight: 700, color: theme.fgMuted, letterSpacing: 0.8, textTransform: "uppercase", marginBottom: 10 }}>{title}</div>
      {children}
    </div>
  );
}

function MetricCell({ label, value, color }) {
  return (
    <div style={{ padding: "8px 12px", borderRadius: 8, background: theme.bg2 }}>
      <div style={{ fontSize: 10, color: theme.fgMuted, marginBottom: 2 }}>{label}</div>
      <div style={{ fontSize: 14, fontWeight: 700, color: color || theme.fgBright, fontFamily: Mo }}>{value}</div>
    </div>
  );
}

function HashRow({ label, hash, date, color }) {
  return (
    <div style={{ display: "flex", alignItems: "center", gap: 8, marginBottom: 8 }}>
      <div style={{ width: 6, height: 6, borderRadius: "50%", background: color, flexShrink: 0 }} />
      <div style={{ flex: 1 }}>
        <div style={{ fontSize: 11, color: theme.fgDim }}>{label}</div>
        <div style={{ display: "flex", alignItems: "center", gap: 6 }}>
          <span style={{ fontSize: 12, fontFamily: Mo, fontWeight: 600, color: theme.fgBright, background: theme.bg3, padding: "1px 6px", borderRadius: 4 }}>{hash}</span>
          <span style={{ fontSize: 10, color: theme.fgMuted }}>{date}</span>
        </div>
      </div>
    </div>
  );
}

function ActionButtons({ branch }) {
  const [hov, setHov] = useState(null);
  const actions = [];

  if (branch.remoteOnly) {
    actions.push({ label: "Create Local Branch", primary: true, action: "pull" });
  } else if (branch.name !== DEFAULT_BRANCH) {
    if (branch.status === "diverged") {
      if (branch.ahead > 0) actions.push({ label: `Push ${branch.ahead}`, primary: true, action: "push" });
      if (branch.behind > 0) actions.push({ label: `Pull ${branch.behind}`, primary: true, action: "pull" });
    } else if (branch.status === "active" && branch.ahead > 0) {
      actions.push({ label: `Push ${branch.ahead}`, primary: true, action: "push" });
    } else if (branch.status === "active" && branch.behind > 0) {
      actions.push({ label: `Pull ${branch.behind}`, primary: true, action: "pull" });
    }
    if (branch.stale && branch.status === "merged") {
      actions.push({ label: "Delete branch", danger: true, action: "delete" });
    }
  }
  actions.push({ label: "Fetch", action: "fetch" });
  if (!branch.remoteOnly) actions.push({ label: "Prune stale refs", action: "prune-stale" });

  return (
    <div style={{ display: "flex", flexDirection: "column", gap: 2 }}>
      {actions.map((a) => (
        <div key={a.label}
          onMouseEnter={() => setHov(a.label)}
          onMouseLeave={() => setHov(null)}
          style={{
            padding: "7px 12px", borderRadius: 8, cursor: "pointer", fontSize: 12,
            fontWeight: a.primary ? 600 : 400,
            background: a.primary ? (hov === a.label ? theme.accent : `${theme.accent}18`) : a.danger && hov === a.label ? `${theme.historyDanger}12` : hov === a.label ? theme.hover : "transparent",
            color: a.primary ? (hov === a.label ? theme.buttonFg : theme.accent) : a.danger ? theme.historyDanger : theme.fg,
            transition: "all .15s",
          }}>
          {a.label}
        </div>
      ))}
    </div>
  );
}
