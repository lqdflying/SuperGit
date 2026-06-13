export const colors = {
  bg0: "#1e1e1e",
  bg1: "#252526",
  bg2: "#2d2d2d",
  bg3: "#333333",
  bg4: "#3c3c3c",
  border: "#3c3c3c",
  fg: "#cccccc",
  fgDim: "#858585",
  fgBright: "#e0e0e0",
  accent: "#0078d4",
  accentHover: "#1a8ad4",
  branch: ["#4fc1ff", "#c586c0", "#dcdcaa", "#6a9955", "#ce9178", "#9cdcfe"],
  ahead: "#73c991",
  behind: "#f48771",
  upToDate: "#4fc1ff",
  untracked: "#858585",
  remoteColorPool: ["#569cd6", "#c586c0", "#6a9955", "#ce9178", "#dcdcaa"],
  selection: "rgba(0,120,212,0.15)",
  hover: "rgba(255,255,255,0.04)",
  tagBg: "#b5890033",
  tagFg: "#e2c08d"
} as const;

export const typography = {
  fontFamily: "'Segoe UI', -apple-system, system-ui, sans-serif",
  monoFamily: "'JetBrains Mono', 'Cascadia Code', 'Fira Code', 'Consolas', monospace",
  xs: 9,
  sm: 10,
  md: 11,
  base: 12,
  lg: 13,
  xl: 14
} as const;

export const graph = {
  laneWidth: 28,
  rowHeight: 42,
  nodeRadius: 5,
  mergeSize: 12,
  visibleLanes: 6
} as const;
