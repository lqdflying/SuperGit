export const colors = {
  bg0: "#0d1117",
  bg1: "#161b22",
  bg2: "#1c2129",
  bg3: "#21262d",
  bg4: "#292e36",
  border: "#30363d",
  borderSubtle: "#21262d",
  fg: "#c9d1d9",
  fgDim: "#6e7681",
  fgMuted: "#484f58",
  fgBright: "#e6edf3",
  accent: "#2f81f7",
  accentHover: "#1f6feb",
  branch: ["#f78166", "#58a6ff", "#7ee787", "#d2a8ff", "#ffa657", "#79c0ff", "#f778ba", "#a5d6ff"],
  ahead: "#56d364",
  behind: "#f85149",
  upToDate: "#58a6ff",
  synced: "#58a6ff",
  untracked: "#484f58",
  trackArrow: "#6e7681",
  remoteColorPool: ["#58a6ff", "#d2a8ff", "#7ee787", "#ffa657"],
  selection: "rgba(47,129,247,0.10)",
  hover: "rgba(136,198,255,0.04)",
  tagBg: "rgba(210,168,255,0.10)",
  tagBorder: "rgba(210,168,255,0.25)",
  tagFg: "#d2a8ff",
  currentBadge: "#f85149",
  currentBadgeBg: "rgba(248,81,73,0.13)",
  defaultBranch: "#d29922"
} as const;

export const typography = {
  fontFamily: "-apple-system, BlinkMacSystemFont, 'Segoe UI', Helvetica, Arial, sans-serif",
  monoFamily: "'SF Mono', 'Fira Code', 'JetBrains Mono', Consolas, monospace",
  xs: 9,
  sm: 10,
  md: 11,
  base: 12,
  lg: 13,
  xl: 14
} as const;

export const graph = {
  laneWidth: 22,
  rowHeight: 32,
  nodeRadius: 4,
  mergeSize: 12,
  maxLanes: 5,
  visibleLanes: 5
} as const;
