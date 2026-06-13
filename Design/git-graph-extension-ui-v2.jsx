import { useState, useMemo, useCallback } from "react";

// ── Color system ──
const C = {
  bg0: "#1e1e1e", bg1: "#252526", bg2: "#2d2d2d", bg3: "#333333", bg4: "#3c3c3c",
  border: "#3c3c3c", fg: "#cccccc", fgDim: "#858585", fgBright: "#e0e0e0",
  accent: "#0078d4", accentHover: "#1a8ad4",
  b0: "#4fc1ff", b1: "#c586c0", b2: "#dcdcaa", b3: "#6a9955", b4: "#ce9178", b5: "#9cdcfe",
  ahead: "#73c991", behind: "#f48771", upToDate: "#4fc1ff",
  trackArrow: "#569cd6", untracked: "#858585",
  selection: "rgba(0,120,212,0.15)", hover: "rgba(255,255,255,0.04)",
  remoteOrigin: "#569cd6", remoteUpstream: "#c586c0", remoteBackup: "#6a9955",
};
const BRANCH_COLORS = [C.b0, C.b1, C.b2, C.b3, C.b4, C.b5];
const REMOTE_COLORS = { origin: C.remoteOrigin, upstream: C.remoteUpstream, backup: C.remoteBackup };

const font = "'Segoe UI', -apple-system, system-ui, sans-serif";
const mono = "'JetBrains Mono', 'Cascadia Code', 'Fira Code', 'Consolas', monospace";

// ── Dates helper ──
const today = new Date("2026-06-13T23:59:59");
const daysAgo = (n) => { const d = new Date(today); d.setDate(d.getDate() - n); return d; };
const fmt = (d) => d.toISOString().slice(0, 10);
const fmtShort = (d) => d.toISOString().slice(5, 16).replace("T", " ");

// ── Mock commits (spanning 21 days) ──
const ALL_COMMITS = [
  { hash: "a1b2c3d", msg: "fix: resolve db connection timeout on retry", author: "liuqd", date: daysAgo(0), branch: "hotfix/db-timeout", bi: 3, parents: ["e5f6a7b"], tags: [], refs: ["HEAD", "hotfix/db-timeout"] },
  { hash: "e5f6a7b", msg: "feat: add OAuth2 PKCE flow for MCP auth", author: "liuqd", date: daysAgo(0), branch: "feature/auth-flow", bi: 1, parents: ["c8d9e0f"], tags: [], refs: ["feature/auth-flow"] },
  { hash: "c8d9e0f", msg: "feat: implement token refresh with sliding window", author: "liuqd", date: daysAgo(1), branch: "feature/auth-flow", bi: 1, parents: ["f1a2b3c"], tags: [], refs: [] },
  { hash: "f1a2b3c", msg: "chore: bump dependencies to latest stable", author: "dylan", date: daysAgo(1), branch: "develop", bi: 2, parents: ["d4e5f6a"], tags: [], refs: ["origin/develop"] },
  { hash: "d4e5f6a", msg: "feat: add Datadog RUM integration for dashboard", author: "steve", date: daysAgo(2), branch: "develop", bi: 2, parents: ["b7c8d9e", "g0h1i2j"], tags: [], refs: [], isMerge: true },
  { hash: "g0h1i2j", msg: "feat: sidebar navigation redesign", author: "thariq", date: daysAgo(2), branch: "feature/auth-flow", bi: 1, parents: ["b7c8d9e"], tags: [], refs: ["origin/feature/auth-flow"] },
  { hash: "b7c8d9e", msg: "Merge pull request #142 from release/v2.3", author: "liuqd", date: daysAgo(3), branch: "main", bi: 0, parents: ["h3i4j5k"], tags: ["v2.3.0"], refs: ["main", "origin/main"], isMerge: true },
  { hash: "h3i4j5k", msg: "release: prepare v2.3.0 changelog", author: "liuqd", date: daysAgo(4), branch: "release/v2.4", bi: 4, parents: ["j6k7l8m"], tags: [], refs: ["release/v2.4"] },
  { hash: "j6k7l8m", msg: "fix: correct Terraform state lock race condition", author: "dylan", date: daysAgo(5), branch: "main", bi: 0, parents: ["k9l0m1n"], tags: [], refs: [] },
  { hash: "k9l0m1n", msg: "ci: add Trivy scan to Harbor push pipeline", author: "liuqd", date: daysAgo(6), branch: "main", bi: 0, parents: ["aa11bb2"], tags: ["v2.2.1"], refs: [] },
  { hash: "aa11bb2", msg: "feat: add Vector log pipeline for Docker Compose", author: "liuqd", date: daysAgo(8), branch: "develop", bi: 2, parents: ["bb22cc3"], tags: [], refs: [] },
  { hash: "bb22cc3", msg: "refactor: migrate redis config to Helm values", author: "dylan", date: daysAgo(9), branch: "develop", bi: 2, parents: ["cc33dd4"], tags: [], refs: [] },
  { hash: "cc33dd4", msg: "feat: Grafana dashboard for cursorProxy metrics", author: "liuqd", date: daysAgo(10), branch: "main", bi: 0, parents: ["dd44ee5"], tags: [], refs: [] },
  { hash: "dd44ee5", msg: "fix: OpenResty proxy_pass header forwarding", author: "steve", date: daysAgo(11), branch: "main", bi: 0, parents: ["ee55ff6"], tags: [], refs: [] },
  { hash: "ee55ff6", msg: "docs: update runbook for OCI instance recovery", author: "thariq", date: daysAgo(12), branch: "develop", bi: 2, parents: ["ff66aa7"], tags: [], refs: [] },
  { hash: "ff66aa7", msg: "feat: implement Loki log aggregation stack", author: "liuqd", date: daysAgo(13), branch: "main", bi: 0, parents: ["aa77bb8"], tags: ["v2.2.0"], refs: [] },
  { hash: "aa77bb8", msg: "ci: GitHub Actions matrix for multi-arch build", author: "dylan", date: daysAgo(15), branch: "main", bi: 0, parents: ["bb88cc9"], tags: [], refs: [] },
  { hash: "bb88cc9", msg: "feat: Uptime Kuma MariaDB migration script", author: "liuqd", date: daysAgo(17), branch: "develop", bi: 2, parents: ["cc99dd0"], tags: [], refs: [] },
  { hash: "cc99dd0", msg: "chore: 1Panel node provisioning automation", author: "steve", date: daysAgo(18), branch: "main", bi: 0, parents: ["dd00ee1"], tags: [], refs: [] },
  { hash: "dd00ee1", msg: "fix: NFS mount persistence across reboots", author: "liuqd", date: daysAgo(19), branch: "main", bi: 0, parents: ["ee11ff2"], tags: [], refs: [] },
  { hash: "ee11ff2", msg: "feat: initial CloudAIOps agent scaffold", author: "liuqd", date: daysAgo(20), branch: "main", bi: 0, parents: [], tags: ["v2.1.0"], refs: [] },
];

// ── Branches with multi-remote tracking ──
const BRANCHES = [
  {
    name: "main", color: C.b0,
    remotes: [
      { remote: "origin", ref: "origin/main", ahead: 0, behind: 0 },
      { remote: "upstream", ref: "upstream/main", ahead: 2, behind: 0 },
    ],
  },
  {
    name: "feature/auth-flow", color: C.b1,
    remotes: [
      { remote: "origin", ref: "origin/feature/auth-flow", ahead: 3, behind: 0 },
    ],
  },
  {
    name: "develop", color: C.b2,
    remotes: [
      { remote: "origin", ref: "origin/develop", ahead: 0, behind: 2 },
      { remote: "upstream", ref: "upstream/develop", ahead: 1, behind: 3 },
      { remote: "backup", ref: "backup/develop", ahead: 0, behind: 0 },
    ],
  },
  {
    name: "hotfix/db-timeout", color: C.b3,
    remotes: [
      { remote: "origin", ref: "origin/hotfix/db-timeout", ahead: 1, behind: 1 },
    ],
  },
  {
    name: "release/v2.4", color: C.b4,
    remotes: [
      { remote: "origin", ref: "origin/release/v2.4", ahead: 0, behind: 0 },
      { remote: "upstream", ref: "upstream/release/v2.4", ahead: 0, behind: 0 },
    ],
  },
  {
    name: "experiment/rag-agent", color: C.b5,
    remotes: [],
  },
];

const REMOTES = [
  { name: "origin", url: "git@github.com:pil-cloudops/infra-core.git", color: REMOTE_COLORS.origin },
  { name: "upstream", url: "git@github.com:pil-platform/infra-core.git", color: REMOTE_COLORS.upstream },
  { name: "backup", url: "git@gitlab.internal:ops/infra-core.git", color: REMOTE_COLORS.backup },
];

const PAGE_SIZE = 8;

// ── Icons ──
const Icon = ({ type, size = 14, color = C.fgDim, style }) => {
  const p = { width: size, height: size, viewBox: "0 0 16 16", fill: "none", stroke: color, strokeWidth: 1.5, strokeLinecap: "round", strokeLinejoin: "round", style: { flexShrink: 0, display: "block", ...style } };
  const icons = {
    branch: <><line x1="6" y1="3" x2="6" y2="10" /><circle cx="6" cy="12" r="1.5" /><circle cx="6" cy="3" r="1.5" /><path d="M6 5C6 7 10 7 10 9" /><circle cx="10" cy="10.5" r="1.5" /></>,
    commit: <><circle cx="8" cy="8" r="3" /><line x1="8" y1="1" x2="8" y2="5" /><line x1="8" y1="11" x2="8" y2="15" /></>,
    tag: <><path d="M2 8.5V3.5a1 1 0 011-1h5l5.5 5.5a1 1 0 010 1.41L9.41 13.5a1 1 0 01-1.41 0L2 8.5z" /><circle cx="5.5" cy="5.5" r="1" fill={color} /></>,
    merge: <><circle cx="4" cy="4" r="1.5" /><circle cx="12" cy="4" r="1.5" /><circle cx="8" cy="13" r="1.5" /><path d="M4 5.5V8c0 2 2 3.5 4 3.5m4-6V8c0 2-2 3.5-4 3.5" /></>,
    remote: <><circle cx="8" cy="3" r="2" /><path d="M3 13c0-3 2-5 5-5s5 2 5 5" /></>,
    search: <><circle cx="7" cy="7" r="4" /><line x1="10" y1="10" x2="14" y2="14" /></>,
    filter: <><path d="M2 3h12M4 7h8M6 11h4" /></>,
    refresh: <><path d="M2 8a6 6 0 0111-3M14 8a6 6 0 01-11 3" /><polyline points="2,3 2,8 7,8" /><polyline points="14,13 14,8 9,8" /></>,
    push: <><line x1="8" y1="14" x2="8" y2="3" /><polyline points="4,6 8,2 12,6" /></>,
    pull: <><line x1="8" y1="2" x2="8" y2="13" /><polyline points="4,10 8,14 12,10" /></>,
    fetch: <><circle cx="8" cy="4" r="2" /><line x1="8" y1="6" x2="8" y2="13" /><polyline points="5,10 8,13 11,10" /></>,
    graph: <><circle cx="4" cy="4" r="1.5" /><circle cx="12" cy="8" r="1.5" /><circle cx="4" cy="12" r="1.5" /><line x1="4" y1="5.5" x2="4" y2="10.5" /><path d="M5.2 5L10.8 7" /></>,
    calendar: <><rect x="2" y="3" width="12" height="11" rx="1" /><line x1="2" y1="7" x2="14" y2="7" /><line x1="5" y1="1" x2="5" y2="4" /><line x1="11" y1="1" x2="11" y2="4" /></>,
    chevLeft: <><polyline points="10,3 5,8 10,13" /></>,
    chevRight: <><polyline points="6,3 11,8 6,13" /></>,
    check: <><polyline points="3,8 7,12 13,4" /></>,
    up: <><polyline points="4,10 8,5 12,10" /></>,
    down: <><polyline points="4,6 8,11 12,6" /></>,
    x: <><line x1="4" y1="4" x2="12" y2="12" /><line x1="12" y1="4" x2="4" y2="12" /></>,
  };
  return <svg {...p}>{icons[type]}</svg>;
};

// ── Shared small components ──
function Btn({ children, onClick, active, style: s }) {
  const [h, setH] = useState(false);
  return (
    <div onClick={onClick} onMouseEnter={() => setH(true)} onMouseLeave={() => setH(false)}
      style={{ display: "inline-flex", alignItems: "center", gap: 4, padding: "3px 7px", borderRadius: 3, cursor: "pointer", fontSize: 11, color: active ? C.accent : C.fgDim, background: active ? C.selection : h ? C.hover : "transparent", transition: "background .1s", whiteSpace: "nowrap", ...s }}>
      {children}
    </div>
  );
}
function TabBtn({ active, onClick, icon, label }) {
  return (
    <div onClick={onClick} style={{ display: "flex", alignItems: "center", gap: 5, padding: "7px 14px", cursor: "pointer", borderBottom: active ? `2px solid ${C.accent}` : "2px solid transparent", color: active ? C.fgBright : C.fgDim, fontSize: 12, fontWeight: active ? 600 : 400, transition: "all .15s" }}>
      <Icon type={icon} size={13} color={active ? C.accent : C.fgDim} />{label}
    </div>
  );
}
function DetailRow({ label, value, isMono, color }) {
  return (
    <div style={{ display: "flex", marginBottom: 6, fontSize: 12 }}>
      <span style={{ width: 60, color: C.fgDim, flexShrink: 0 }}>{label}</span>
      <span style={{ color: color || C.fg, fontFamily: isMono ? mono : "inherit", wordBreak: "break-all" }}>{value}</span>
    </div>
  );
}

// ── Graph Canvas ──
const LANE_W = 28, ROW_H = 42, NODE_R = 5;

function GraphCanvas({ commits, selectedHash, onSelect }) {
  const W = 6 * LANE_W + 10, H = commits.length * ROW_H + 20;
  const lx = (i) => i * LANE_W + LANE_W / 2 + 6;
  const ry = (i) => i * ROW_H + ROW_H / 2 + 10;
  const idxMap = useMemo(() => { const m = {}; commits.forEach((c, i) => { m[c.hash] = i; }); return m; }, [commits]);
  const edges = useMemo(() => {
    const lines = [];
    commits.forEach((c, i) => {
      (c.parents || []).forEach(ph => {
        if (idxMap[ph] !== undefined) lines.push({ x1: c.bi, y1: i, x2: commits[idxMap[ph]].bi, y2: idxMap[ph], color: BRANCH_COLORS[c.bi] });
      });
    });
    return lines;
  }, [commits, idxMap]);
  return (
    <svg width={W} height={H} style={{ flexShrink: 0, display: "block" }}>
      {[0,1,2,3,4,5].map(i => <line key={i} x1={lx(i)} y1={0} x2={lx(i)} y2={H} stroke={BRANCH_COLORS[i]} strokeWidth={1} opacity={0.08} />)}
      {edges.map((e, i) => {
        const x1 = lx(e.x1), y1 = ry(e.y1), x2 = lx(e.x2), y2 = ry(e.y2);
        if (e.x1 === e.x2) return <line key={i} x1={x1} y1={y1} x2={x2} y2={y2} stroke={e.color} strokeWidth={1.8} opacity={0.55} />;
        const my = y1 + (y2 - y1) * 0.4;
        return <path key={i} d={`M${x1},${y1} C${x1},${my} ${x2},${my} ${x2},${y2}`} stroke={e.color} strokeWidth={1.8} fill="none" opacity={0.45} />;
      })}
      {commits.map((c, i) => {
        const cx = lx(c.bi), cy = ry(i), col = BRANCH_COLORS[c.bi], sel = c.hash === selectedHash;
        return (
          <g key={c.hash} onClick={() => onSelect(c.hash)} style={{ cursor: "pointer" }}>
            {sel && <circle cx={cx} cy={cy} r={NODE_R + 5} fill={col} opacity={0.18} />}
            {c.isMerge
              ? <><rect x={cx - 6} y={cy - 6} width={12} height={12} rx={2} fill={C.bg1} stroke={col} strokeWidth={2} /><line x1={cx - 3} y1={cy} x2={cx + 3} y2={cy} stroke={col} strokeWidth={1.5} /><line x1={cx} y1={cy - 3} x2={cx} y2={cy + 3} stroke={col} strokeWidth={1.5} /></>
              : <circle cx={cx} cy={cy} r={NODE_R} fill={c.refs.includes("HEAD") ? col : C.bg1} stroke={col} strokeWidth={2} />}
          </g>
        );
      })}
    </svg>
  );
}

// ── Date range presets ──
const PRESETS = [
  { label: "7 days", days: 7 },
  { label: "14 days", days: 14 },
  { label: "30 days", days: 30 },
  { label: "All", days: null },
];

// ══════════════════════════════════
// ── Main App
// ══════════════════════════════════
export default function GitGraphUI() {
  const [tab, setTab] = useState("graph");
  const [selected, setSelected] = useState(ALL_COMMITS[0].hash);
  const [searchOpen, setSearchOpen] = useState(false);
  const [searchText, setSearchText] = useState("");
  const [sideCollapsed, setSideCollapsed] = useState(false);
  const [page, setPage] = useState(0);

  // Date range state
  const [preset, setPreset] = useState(7);
  const [customFrom, setCustomFrom] = useState(fmt(daysAgo(7)));
  const [customTo, setCustomTo] = useState(fmt(today));
  const [showCustom, setShowCustom] = useState(false);

  // Compute filtered commits
  const filtered = useMemo(() => {
    let list = ALL_COMMITS;
    // date filter
    if (preset !== null) {
      const cutoff = daysAgo(preset);
      list = list.filter(c => c.date >= cutoff);
    } else if (showCustom) {
      const from = new Date(customFrom + "T00:00:00");
      const to = new Date(customTo + "T23:59:59");
      list = list.filter(c => c.date >= from && c.date <= to);
    }
    // text filter
    if (searchText) {
      const q = searchText.toLowerCase();
      list = list.filter(c => c.msg.toLowerCase().includes(q) || c.hash.includes(q) || c.author.includes(q));
    }
    return list;
  }, [preset, customFrom, customTo, showCustom, searchText]);

  const totalPages = Math.ceil(filtered.length / PAGE_SIZE);
  const pageCommits = preset === null ? filtered.slice(page * PAGE_SIZE, (page + 1) * PAGE_SIZE) : filtered;
  const showPagination = preset === null && filtered.length > PAGE_SIZE;
  const selCommit = ALL_COMMITS.find(c => c.hash === selected);

  // Branch panel hover
  const [hovBranch, setHovBranch] = useState(null);

  return (
    <div style={{ width: "100%", height: "100vh", display: "flex", flexDirection: "column", background: C.bg0, color: C.fg, fontFamily: font, fontSize: 13, overflow: "hidden", userSelect: "none" }}>

      {/* ── Title bar ── */}
      <div style={{ display: "flex", alignItems: "center", gap: 8, padding: "6px 12px", background: C.bg2, borderBottom: `1px solid ${C.border}`, flexShrink: 0 }}>
        <Icon type="graph" size={16} color={C.accent} />
        <span style={{ fontWeight: 600, fontSize: 12, color: C.fgBright, letterSpacing: .3 }}>GIT GRAPH</span>
        <span style={{ fontSize: 11, color: C.fgDim, marginLeft: 2 }}>pil-cloudops/infra-core</span>
        <div style={{ flex: 1 }} />
        <Btn onClick={() => { setSearchOpen(!searchOpen); setSearchText(""); }} active={searchOpen}><Icon type="search" size={13} color={searchOpen ? C.accent : C.fgDim} />Search</Btn>
        <Btn><Icon type="filter" size={13} />Filter</Btn>
        <div style={{ width: 1, height: 16, background: C.border, margin: "0 2px" }} />
        <Btn><Icon type="fetch" size={13} />Fetch</Btn>
        <Btn><Icon type="pull" size={13} />Pull</Btn>
        <Btn><Icon type="push" size={13} />Push</Btn>
        <Btn><Icon type="refresh" size={13} />Refresh</Btn>
      </div>

      {/* ── Search bar ── */}
      {searchOpen && (
        <div style={{ padding: "6px 12px", background: C.bg1, borderBottom: `1px solid ${C.border}`, display: "flex", alignItems: "center", gap: 8, flexShrink: 0 }}>
          <Icon type="search" size={14} color={C.fgDim} />
          <input autoFocus value={searchText} onChange={e => setSearchText(e.target.value)} placeholder="Search commits by message, hash, or author..." style={{ flex: 1, background: C.bg2, border: `1px solid ${C.border}`, borderRadius: 3, padding: "4px 8px", color: C.fg, fontSize: 12, fontFamily: mono, outline: "none" }} />
          <span style={{ fontSize: 11, color: C.fgDim }}>{filtered.length} results</span>
        </div>
      )}

      {/* ── Tab bar ── */}
      <div style={{ display: "flex", borderBottom: `1px solid ${C.border}`, background: C.bg1, flexShrink: 0 }}>
        <TabBtn active={tab === "graph"} onClick={() => setTab("graph")} icon="commit" label="Commit Graph" />
        <TabBtn active={tab === "branches"} onClick={() => setTab("branches")} icon="branch" label="Branch Tracking" />
      </div>

      {/* ══════ BODY ══════ */}
      <div style={{ flex: 1, display: "flex", overflow: "hidden" }}>

        {tab === "graph" ? (
          <>
            {/* ── Branch sidebar ── */}
            {!sideCollapsed ? (
              <div style={{ width: 210, borderRight: `1px solid ${C.border}`, background: C.bg1, display: "flex", flexDirection: "column", flexShrink: 0 }}>
                <div style={{ padding: "8px 10px 6px", fontSize: 10, fontWeight: 700, color: C.fgDim, letterSpacing: .6, textTransform: "uppercase", display: "flex", alignItems: "center", justifyContent: "space-between" }}>
                  Branches <span style={{ cursor: "pointer", fontSize: 16, lineHeight: 1 }} onClick={() => setSideCollapsed(true)}>&#x2039;</span>
                </div>
                <div style={{ flex: 1, overflowY: "auto" }}>
                  {BRANCHES.map(b => (
                    <div key={b.name} onMouseEnter={() => setHovBranch(b.name)} onMouseLeave={() => setHovBranch(null)}
                      style={{ padding: "5px 10px", display: "flex", alignItems: "center", gap: 6, cursor: "pointer", background: hovBranch === b.name ? C.hover : "transparent", borderLeft: `2px solid ${b.color}`, transition: "background .1s" }}>
                      <span style={{ fontSize: 12, color: C.fgBright, flex: 1, overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>{b.name}</span>
                      {b.remotes.length === 0
                        ? <span style={{ fontSize: 10, color: C.untracked, fontStyle: "italic" }}>untracked</span>
                        : <span style={{ fontSize: 10, color: C.fgDim }}>{b.remotes.length} remote{b.remotes.length > 1 ? "s" : ""}</span>}
                    </div>
                  ))}
                </div>
              </div>
            ) : (
              <div style={{ width: 24, borderRight: `1px solid ${C.border}`, background: C.bg1, display: "flex", alignItems: "flex-start", justifyContent: "center", paddingTop: 10, cursor: "pointer" }} onClick={() => setSideCollapsed(false)}>
                <span style={{ fontSize: 16, color: C.fgDim }}>&#x203A;</span>
              </div>
            )}

            {/* ── Main graph area ── */}
            <div style={{ flex: 1, display: "flex", flexDirection: "column", overflow: "hidden" }}>

              {/* Date range bar */}
              <div style={{ display: "flex", alignItems: "center", gap: 6, padding: "6px 10px", background: C.bg2, borderBottom: `1px solid ${C.border}`, flexShrink: 0, flexWrap: "wrap" }}>
                <Icon type="calendar" size={13} color={C.fgDim} />
                <span style={{ fontSize: 11, color: C.fgDim, marginRight: 2 }}>Range:</span>
                {PRESETS.map(p => (
                  <div key={p.label} onClick={() => { setPreset(p.days); setShowCustom(false); setPage(0); }}
                    style={{ fontSize: 11, padding: "2px 8px", borderRadius: 3, cursor: "pointer", background: (preset === p.days && !showCustom) ? C.accent : C.bg3, color: (preset === p.days && !showCustom) ? "#fff" : C.fgDim, border: `1px solid ${(preset === p.days && !showCustom) ? C.accent : C.border}`, transition: "all .15s" }}>
                    {p.label}
                  </div>
                ))}
                <div onClick={() => { setShowCustom(!showCustom); setPreset(null); setPage(0); }}
                  style={{ fontSize: 11, padding: "2px 8px", borderRadius: 3, cursor: "pointer", background: showCustom ? C.accent : C.bg3, color: showCustom ? "#fff" : C.fgDim, border: `1px solid ${showCustom ? C.accent : C.border}` }}>
                  Custom
                </div>
                {showCustom && (
                  <>
                    <div style={{ width: 1, height: 16, background: C.border, margin: "0 2px" }} />
                    <input type="date" value={customFrom} onChange={e => { setCustomFrom(e.target.value); setPage(0); }} style={dateInputStyle} />
                    <span style={{ fontSize: 11, color: C.fgDim }}>to</span>
                    <input type="date" value={customTo} onChange={e => { setCustomTo(e.target.value); setPage(0); }} style={dateInputStyle} />
                  </>
                )}
                <div style={{ flex: 1 }} />
                <span style={{ fontSize: 11, color: C.fgDim }}>{filtered.length} commit{filtered.length !== 1 ? "s" : ""}</span>
              </div>

              {/* Column headers */}
              <div style={{ display: "flex", padding: "6px 0", borderBottom: `1px solid ${C.border}`, background: C.bg2, fontSize: 10, color: C.fgDim, fontWeight: 700, letterSpacing: .4, flexShrink: 0 }}>
                <div style={{ width: 178, paddingLeft: 8, flexShrink: 0 }}>GRAPH</div>
                <div style={{ flex: 1, paddingLeft: 6 }}>MESSAGE</div>
                <div style={{ width: 70, textAlign: "center" }}>AUTHOR</div>
                <div style={{ width: 100, textAlign: "center" }}>DATE</div>
                <div style={{ width: 68, textAlign: "center", paddingRight: 8 }}>HASH</div>
              </div>

              {/* Scrollable rows */}
              <div style={{ flex: 1, overflowY: "auto", overflowX: "hidden" }}>
                <div style={{ display: "flex" }}>
                  <div style={{ width: 178, flexShrink: 0 }}>
                    <GraphCanvas commits={pageCommits} selectedHash={selected} onSelect={setSelected} />
                  </div>
                  <div style={{ flex: 1 }}>
                    {pageCommits.map(c => {
                      const sel = c.hash === selected;
                      return (
                        <div key={c.hash} onClick={() => setSelected(c.hash)}
                          style={{ height: ROW_H, display: "flex", alignItems: "center", cursor: "pointer", background: sel ? C.selection : "transparent", borderBottom: `1px solid ${C.border}15` }}>
                          <div style={{ flex: 1, paddingLeft: 6, display: "flex", alignItems: "center", gap: 5, overflow: "hidden" }}>
                            {c.refs.filter(r => r !== "HEAD").map(ref => (
                              <span key={ref} style={{ fontSize: 10, padding: "1px 5px", borderRadius: 3, border: `1px solid ${BRANCH_COLORS[c.bi]}55`, color: BRANCH_COLORS[c.bi], fontFamily: mono, flexShrink: 0 }}>{ref}</span>
                            ))}
                            {c.tags.map(t => (
                              <span key={t} style={{ fontSize: 10, padding: "1px 5px", borderRadius: 3, background: "#b5890033", color: "#e2c08d", fontFamily: mono, display: "inline-flex", alignItems: "center", gap: 2, flexShrink: 0 }}>
                                <Icon type="tag" size={9} color="#e2c08d" />{t}
                              </span>
                            ))}
                            {c.refs.includes("HEAD") && <span style={{ fontSize: 9, padding: "1px 4px", borderRadius: 2, background: C.accent + "33", color: C.accent, fontWeight: 700, fontFamily: mono, flexShrink: 0 }}>HEAD</span>}
                            <span style={{ fontSize: 12, color: sel ? C.fgBright : C.fg, overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>{c.msg}</span>
                          </div>
                          <div style={{ width: 70, textAlign: "center", fontSize: 11, color: C.fgDim, flexShrink: 0 }}>{c.author}</div>
                          <div style={{ width: 100, textAlign: "center", fontSize: 11, color: C.fgDim, fontFamily: mono, flexShrink: 0 }}>{fmtShort(c.date)}</div>
                          <div style={{ width: 68, textAlign: "center", fontSize: 11, color: BRANCH_COLORS[c.bi], fontFamily: mono, flexShrink: 0, paddingRight: 8, opacity: .7 }}>{c.hash.slice(0, 7)}</div>
                        </div>
                      );
                    })}
                    {pageCommits.length === 0 && (
                      <div style={{ padding: 32, textAlign: "center", color: C.fgDim, fontSize: 12 }}>No commits in this range.</div>
                    )}
                  </div>
                </div>
              </div>

              {/* Pagination */}
              {showPagination && (
                <div style={{ display: "flex", alignItems: "center", justifyContent: "center", gap: 8, padding: "6px 0", borderTop: `1px solid ${C.border}`, background: C.bg2, flexShrink: 0 }}>
                  <PgBtn disabled={page === 0} onClick={() => setPage(0)}><Icon type="chevLeft" size={12} color={page === 0 ? C.bg4 : C.fgDim} /><Icon type="chevLeft" size={12} color={page === 0 ? C.bg4 : C.fgDim} style={{ marginLeft: -8 }} /></PgBtn>
                  <PgBtn disabled={page === 0} onClick={() => setPage(p => p - 1)}><Icon type="chevLeft" size={12} color={page === 0 ? C.bg4 : C.fgDim} /></PgBtn>
                  <span style={{ fontSize: 11, color: C.fgDim, minWidth: 80, textAlign: "center" }}>
                    Page {page + 1} / {totalPages}
                  </span>
                  <PgBtn disabled={page >= totalPages - 1} onClick={() => setPage(p => p + 1)}><Icon type="chevRight" size={12} color={page >= totalPages - 1 ? C.bg4 : C.fgDim} /></PgBtn>
                  <PgBtn disabled={page >= totalPages - 1} onClick={() => setPage(totalPages - 1)}><Icon type="chevRight" size={12} color={page >= totalPages - 1 ? C.bg4 : C.fgDim} /><Icon type="chevRight" size={12} color={page >= totalPages - 1 ? C.bg4 : C.fgDim} style={{ marginLeft: -8 }} /></PgBtn>
                  <span style={{ fontSize: 10, color: C.fgDim, marginLeft: 8 }}>({filtered.length} total)</span>
                </div>
              )}
            </div>

            {/* ── Detail panel ── */}
            {selCommit && (
              <div style={{ width: 250, borderLeft: `1px solid ${C.border}`, background: C.bg1, flexShrink: 0, overflowY: "auto" }}>
                <div style={{ padding: "10px 12px 8px", borderBottom: `1px solid ${C.border}` }}>
                  <div style={{ fontSize: 10, fontWeight: 700, color: C.fgDim, letterSpacing: .4, textTransform: "uppercase", marginBottom: 8 }}>Commit Detail</div>
                  <div style={{ fontSize: 13, color: C.fgBright, lineHeight: 1.45, marginBottom: 10 }}>{selCommit.msg}</div>
                  <DetailRow label="Hash" value={selCommit.hash} isMono color={BRANCH_COLORS[selCommit.bi]} />
                  <DetailRow label="Author" value={selCommit.author} />
                  <DetailRow label="Date" value={fmtShort(selCommit.date)} isMono />
                  <DetailRow label="Branch" value={selCommit.branch} color={BRANCH_COLORS[selCommit.bi]} />
                  {selCommit.parents.length > 0 && <DetailRow label="Parents" value={selCommit.parents.join(", ")} isMono />}
                  {selCommit.isMerge && <DetailRow label="Type" value="Merge commit" color={C.b2} />}
                  {selCommit.tags.length > 0 && <DetailRow label="Tags" value={selCommit.tags.join(", ")} color="#e2c08d" />}
                </div>
                <div style={{ padding: "10px 12px" }}>
                  <div style={{ fontSize: 10, fontWeight: 700, color: C.fgDim, letterSpacing: .4, textTransform: "uppercase", marginBottom: 8 }}>Actions</div>
                  {["Checkout this commit", "Cherry-pick", "Revert commit", "Create branch here", "Create tag", "Copy hash"].map(a => <ActionItem key={a} label={a} />)}
                </div>
              </div>
            )}
          </>
        ) : (
          /* ══════ BRANCH TRACKING TAB ══════ */
          <div style={{ flex: 1, overflow: "auto" }}>
            {/* Header */}
            <div style={{ padding: "14px 20px 10px", borderBottom: `1px solid ${C.border}` }}>
              <div style={{ fontSize: 14, fontWeight: 600, color: C.fgBright, marginBottom: 4 }}>Branch Tracking Relationships</div>
              <div style={{ fontSize: 11, color: C.fgDim }}>Local branches and their upstream remote tracking configuration across {REMOTES.length} remotes</div>
            </div>

            {/* Remote legend bar */}
            <div style={{ display: "flex", alignItems: "center", gap: 16, padding: "8px 20px", background: C.bg2, borderBottom: `1px solid ${C.border}` }}>
              <span style={{ fontSize: 10, fontWeight: 700, color: C.fgDim, letterSpacing: .6, textTransform: "uppercase" }}>Remotes:</span>
              {REMOTES.map(r => (
                <div key={r.name} style={{ display: "flex", alignItems: "center", gap: 5 }}>
                  <div style={{ width: 10, height: 10, borderRadius: "50%", background: r.color, opacity: .8 }} />
                  <span style={{ fontSize: 11, color: C.fgBright, fontWeight: 600 }}>{r.name}</span>
                  <span style={{ fontSize: 10, color: C.fgDim, fontFamily: mono }}>{r.url}</span>
                </div>
              ))}
            </div>

            {/* Tracking diagram */}
            <div style={{ padding: "20px 20px 0", overflowX: "auto" }}>
              <div style={{ display: "flex", gap: 0, minWidth: 750 }}>
                {/* LOCAL column */}
                <div style={{ width: 190, flexShrink: 0 }}>
                  <div style={{ fontSize: 10, fontWeight: 700, color: C.fgDim, letterSpacing: .8, textTransform: "uppercase", marginBottom: 16, paddingLeft: 4 }}>LOCAL</div>
                  {BRANCHES.map(b => (
                    <BranchRow key={b.name} height={Math.max(b.remotes.length, 1) * 32 + 16}>
                      <div style={{ display: "inline-flex", alignItems: "center", gap: 6, padding: "4px 10px", borderRadius: 4, border: `1px solid ${b.color}55`, background: b.color + "11" }}>
                        <div style={{ width: 8, height: 8, borderRadius: "50%", background: b.color }} />
                        <span style={{ fontSize: 12, color: C.fgBright, fontFamily: mono, whiteSpace: "nowrap" }}>{b.name}</span>
                      </div>
                    </BranchRow>
                  ))}
                </div>

                {/* ARROW column */}
                <div style={{ width: 160, flexShrink: 0, position: "relative" }}>
                  <div style={{ fontSize: 10, fontWeight: 700, color: C.fgDim, letterSpacing: .8, textTransform: "uppercase", marginBottom: 16, textAlign: "center" }}>TRACKS</div>
                  <svg width={160} height={BRANCHES.reduce((s, b) => s + Math.max(b.remotes.length, 1) * 32 + 16, 0)} style={{ display: "block" }}>
                    {(() => {
                      const elements = [];
                      let yOff = 0;
                      BRANCHES.forEach((b) => {
                        const rows = Math.max(b.remotes.length, 1);
                        const blockH = rows * 32 + 16;
                        const localCY = yOff + blockH / 2;

                        if (b.remotes.length === 0) {
                          // Dashed no-upstream line
                          elements.push(
                            <g key={b.name + "-none"}>
                              <line x1={8} y1={localCY} x2={80} y2={localCY} stroke={C.untracked} strokeWidth={1.2} strokeDasharray="4,3" />
                              <text x={85} y={localCY + 3} fill={C.untracked} fontSize={10} fontFamily={font}>no upstream</text>
                            </g>
                          );
                        } else {
                          b.remotes.forEach((r, ri) => {
                            const remoteCY = yOff + 8 + ri * 32 + 16;
                            const rCol = REMOTE_COLORS[r.remote] || C.trackArrow;
                            // Arrow line from local center to each remote row
                            const cpx1 = 40, cpx2 = 100;
                            elements.push(
                              <g key={b.name + "-" + r.remote}>
                                <path d={`M8,${localCY} C${cpx1},${localCY} ${cpx2},${remoteCY} 140,${remoteCY}`} stroke={rCol} strokeWidth={1.5} fill="none" opacity={0.7} />
                                <polygon points={`143,${remoteCY} 137,${remoteCY - 4} 137,${remoteCY + 4}`} fill={rCol} opacity={0.8} />
                                {/* Status badges on the curve */}
                                {r.ahead > 0 && (
                                  <g>
                                    <rect x={55} y={((localCY + remoteCY) / 2) - 8} width={22} height={13} rx={3} fill={C.ahead + "22"} stroke={C.ahead + "55"} strokeWidth={.5} />
                                    <text x={66} y={((localCY + remoteCY) / 2) + 2} fill={C.ahead} fontSize={9} fontWeight="bold" textAnchor="middle">+{r.ahead}</text>
                                  </g>
                                )}
                                {r.behind > 0 && (
                                  <g>
                                    <rect x={r.ahead > 0 ? 80 : 55} y={((localCY + remoteCY) / 2) - 8} width={22} height={13} rx={3} fill={C.behind + "22"} stroke={C.behind + "55"} strokeWidth={.5} />
                                    <text x={(r.ahead > 0 ? 80 : 55) + 11} y={((localCY + remoteCY) / 2) + 2} fill={C.behind} fontSize={9} fontWeight="bold" textAnchor="middle">-{r.behind}</text>
                                  </g>
                                )}
                                {r.ahead === 0 && r.behind === 0 && (
                                  <g>
                                    <circle cx={70} cy={(localCY + remoteCY) / 2} r={6} fill={C.upToDate + "22"} stroke={C.upToDate + "55"} strokeWidth={.5} />
                                    <polyline points={`67,${(localCY + remoteCY) / 2} 69,${(localCY + remoteCY) / 2 + 2} 73,${(localCY + remoteCY) / 2 - 2}`} fill="none" stroke={C.upToDate} strokeWidth={1.2} />
                                  </g>
                                )}
                              </g>
                            );
                          });
                        }
                        // Local dot
                        elements.push(<circle key={b.name + "-dot"} cx={4} cy={localCY} r={4} fill={b.color} opacity={0.7} />);
                        yOff += blockH;
                      });
                      return elements;
                    })()}
                  </svg>
                </div>

                {/* REMOTE columns */}
                <div style={{ flex: 1 }}>
                  <div style={{ fontSize: 10, fontWeight: 700, color: C.fgDim, letterSpacing: .8, textTransform: "uppercase", marginBottom: 16, display: "flex", alignItems: "center", gap: 6 }}>
                    <Icon type="remote" size={12} color={C.fgDim} />REMOTES
                  </div>
                  {BRANCHES.map(b => {
                    const rows = Math.max(b.remotes.length, 1);
                    const blockH = rows * 32 + 16;
                    return (
                      <div key={b.name} style={{ height: blockH, display: "flex", flexDirection: "column", justifyContent: "center", gap: 4 }}>
                        {b.remotes.length === 0 ? (
                          <span style={{ fontSize: 11, color: C.untracked, fontStyle: "italic", paddingLeft: 10 }}>-</span>
                        ) : (
                          b.remotes.map(r => (
                            <div key={r.remote} style={{ display: "inline-flex", alignItems: "center", gap: 6, padding: "4px 10px", borderRadius: 4, border: `1px solid ${C.border}`, background: C.bg2, marginBottom: 2 }}>
                              <div style={{ width: 7, height: 7, borderRadius: "50%", background: REMOTE_COLORS[r.remote] || C.fgDim }} />
                              <span style={{ fontSize: 10, color: C.fgDim, fontWeight: 600 }}>{r.remote}/</span>
                              <span style={{ fontSize: 11, color: C.fg, fontFamily: mono }}>{b.name}</span>
                              <StatusPill ahead={r.ahead} behind={r.behind} />
                            </div>
                          ))
                        )}
                      </div>
                    );
                  })}
                </div>
              </div>
            </div>

            {/* Legend */}
            <div style={{ padding: "16px 20px", borderTop: `1px solid ${C.border}`, marginTop: 16 }}>
              <div style={{ fontSize: 10, fontWeight: 700, color: C.fgDim, letterSpacing: .8, textTransform: "uppercase", marginBottom: 10 }}>Legend</div>
              <div style={{ display: "flex", gap: 20, flexWrap: "wrap" }}>
                <LegendItem color={C.ahead} label="Ahead (unpushed)" icon="up" />
                <LegendItem color={C.behind} label="Behind (needs pull)" icon="down" />
                <LegendItem color={C.upToDate} label="Synced" icon="check" />
                <LegendItem color={C.untracked} label="No upstream" dashed />
                {REMOTES.map(r => <LegendItem key={r.name} color={r.color} label={r.name} dot />)}
              </div>
            </div>

            {/* Quick actions */}
            <div style={{ padding: "12px 20px 20px", borderTop: `1px solid ${C.border}` }}>
              <div style={{ fontSize: 10, fontWeight: 700, color: C.fgDim, letterSpacing: .8, textTransform: "uppercase", marginBottom: 10 }}>Quick Actions</div>
              <div style={{ display: "flex", gap: 8, flexWrap: "wrap" }}>
                {[["push", "Push All"], ["pull", "Pull All"], ["fetch", "Fetch All Remotes"], ["branch", "Set Upstream"], ["refresh", "Prune Stale"]].map(([ic, lb]) => (
                  <QuickBtn key={lb} icon={ic} label={lb} />
                ))}
              </div>
            </div>
          </div>
        )}
      </div>

      {/* ── Status bar ── */}
      <div style={{ display: "flex", alignItems: "center", gap: 12, padding: "2px 10px", background: C.accent, fontSize: 11, color: "#fff", flexShrink: 0 }}>
        <span style={{ display: "flex", alignItems: "center", gap: 4 }}><Icon type="branch" size={12} color="#fff" />main</span>
        <span style={{ opacity: .6 }}>|</span>
        <span style={{ display: "flex", alignItems: "center", gap: 4 }}><Icon type="remote" size={12} color="#fff" />{REMOTES.length} remotes</span>
        <span style={{ opacity: .6 }}>|</span>
        <span style={{ display: "flex", alignItems: "center", gap: 4 }}><Icon type="commit" size={12} color="#fff" />{ALL_COMMITS.length} commits</span>
        <div style={{ flex: 1 }} />
        <span style={{ opacity: .6 }}>Last fetched: 2 min ago</span>
      </div>
    </div>
  );
}

// ── Helpers ──
const dateInputStyle = { background: C.bg2, border: `1px solid ${C.border}`, borderRadius: 3, padding: "2px 6px", color: C.fg, fontSize: 11, fontFamily: mono, outline: "none", colorScheme: "dark" };

function BranchRow({ height, children }) {
  return <div style={{ height, display: "flex", alignItems: "center", paddingLeft: 4 }}>{children}</div>;
}

function StatusPill({ ahead, behind }) {
  if (ahead === 0 && behind === 0) return <Icon type="check" size={11} color={C.upToDate} />;
  return (
    <span style={{ display: "inline-flex", gap: 4, alignItems: "center", fontSize: 10 }}>
      {ahead > 0 && <span style={{ color: C.ahead, display: "inline-flex", alignItems: "center", gap: 1 }}><Icon type="up" size={9} color={C.ahead} />{ahead}</span>}
      {behind > 0 && <span style={{ color: C.behind, display: "inline-flex", alignItems: "center", gap: 1 }}><Icon type="down" size={9} color={C.behind} />{behind}</span>}
    </span>
  );
}

function LegendItem({ color, label, icon, dashed, dot }) {
  return (
    <div style={{ display: "flex", alignItems: "center", gap: 5, fontSize: 11, color: C.fgDim }}>
      {dot ? <div style={{ width: 8, height: 8, borderRadius: "50%", background: color }} />
        : icon ? <Icon type={icon} size={11} color={color} />
        : <svg width={16} height={2}><line x1={0} y1={1} x2={16} y2={1} stroke={color} strokeWidth={1.5} strokeDasharray={dashed ? "3,2" : "none"} /></svg>}
      <span>{label}</span>
    </div>
  );
}

function QuickBtn({ icon, label }) {
  const [h, setH] = useState(false);
  return (
    <div onMouseEnter={() => setH(true)} onMouseLeave={() => setH(false)}
      style={{ display: "flex", alignItems: "center", gap: 5, padding: "5px 12px", borderRadius: 4, border: `1px solid ${C.border}`, background: h ? C.bg3 : C.bg2, cursor: "pointer", fontSize: 12, color: C.fg, transition: "all .1s" }}>
      <Icon type={icon} size={13} color={C.accent} />{label}
    </div>
  );
}

function ActionItem({ label }) {
  const [h, setH] = useState(false);
  return (
    <div onMouseEnter={() => setH(true)} onMouseLeave={() => setH(false)}
      style={{ padding: "5px 10px", fontSize: 12, color: h ? C.fgBright : C.fg, background: h ? C.hover : "transparent", borderRadius: 3, cursor: "pointer", marginBottom: 2, transition: "all .1s" }}>
      {label}
    </div>
  );
}

function PgBtn({ disabled, onClick, children }) {
  const [h, setH] = useState(false);
  return (
    <div onClick={disabled ? undefined : onClick} onMouseEnter={() => setH(true)} onMouseLeave={() => setH(false)}
      style={{ display: "inline-flex", alignItems: "center", padding: "3px 4px", borderRadius: 3, cursor: disabled ? "default" : "pointer", background: h && !disabled ? C.hover : "transparent", opacity: disabled ? .4 : 1, transition: "all .1s" }}>
      {children}
    </div>
  );
}
