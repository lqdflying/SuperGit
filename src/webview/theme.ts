import { colors as fallbackColors } from "../shared/tokens";
import type { ThemeColors } from "../shared/themeColors";

export type { ThemeColors };

const BRANCH_VAR_COUNT = 8;
const REMOTE_VAR_COUNT = 4;

function readVar(styles: CSSStyleDeclaration, name: string, fallback: string): string {
  const value = styles.getPropertyValue(name).trim();
  return value || fallback;
}

export function readThemeColors(root: HTMLElement = document.documentElement): ThemeColors {
  const styles = getComputedStyle(root);

  const branch = Array.from({ length: BRANCH_VAR_COUNT }, (_, index) =>
    readVar(styles, `--sg-branch-${index}`, fallbackColors.branch[index])
  );

  const remote = Array.from({ length: REMOTE_VAR_COUNT }, (_, index) =>
    readVar(styles, `--sg-remote-${index}`, fallbackColors.remoteColorPool[index])
  );

  return {
    bg0: readVar(styles, "--sg-bg0", fallbackColors.bg0),
    bg1: readVar(styles, "--sg-bg1", fallbackColors.bg1),
    bg2: readVar(styles, "--sg-bg2", fallbackColors.bg2),
    bg3: readVar(styles, "--sg-bg3", fallbackColors.bg3),
    bg4: readVar(styles, "--sg-bg4", fallbackColors.bg4),
    border: readVar(styles, "--sg-border", fallbackColors.border),
    borderSubtle: readVar(styles, "--sg-border-subtle", fallbackColors.borderSubtle),
    fg: readVar(styles, "--sg-fg", fallbackColors.fg),
    fgDim: readVar(styles, "--sg-fg-dim", fallbackColors.fgDim),
    fgMuted: readVar(styles, "--sg-fg-muted", fallbackColors.fgMuted),
    fgBright: readVar(styles, "--sg-fg-bright", fallbackColors.fgBright),
    accent: readVar(styles, "--sg-accent", fallbackColors.accent),
    accentHover: readVar(styles, "--sg-accent-hover", fallbackColors.accentHover),
    branch,
    remote,
    ahead: readVar(styles, "--sg-ahead", fallbackColors.ahead),
    behind: readVar(styles, "--sg-behind", fallbackColors.behind),
    upToDate: readVar(styles, "--sg-synced", fallbackColors.upToDate),
    synced: readVar(styles, "--sg-synced", fallbackColors.synced),
    untracked: readVar(styles, "--sg-untracked", fallbackColors.untracked),
    trackArrow: readVar(styles, "--sg-fg-dim", fallbackColors.trackArrow),
    selection: readVar(styles, "--sg-selection", fallbackColors.selection),
    selectionFg: readVar(styles, "--sg-selection-fg", fallbackColors.fgBright),
    hover: readVar(styles, "--sg-hover", fallbackColors.hover),
    tagBg: readVar(styles, "--sg-tag-bg", fallbackColors.tagBg),
    tagBorder: readVar(styles, "--sg-tag-border", fallbackColors.tagBorder),
    tagFg: readVar(styles, "--sg-tag-fg", fallbackColors.tagFg),
    currentBadge: readVar(styles, "--sg-current-badge", fallbackColors.currentBadge),
    currentBadgeBg: readVar(styles, "--sg-current-badge-bg", fallbackColors.currentBadgeBg),
    buttonFg: readVar(styles, "--sg-button-fg", "#ffffff"),
    historyGrid: readVar(styles, "--sg-history-grid", fallbackColors.historyGrid),
    historyGridWeek: readVar(styles, "--sg-history-grid-week", fallbackColors.historyGridWeek),
    historyMerged: readVar(styles, "--sg-history-merged", fallbackColors.historyMerged),
    historyStale: readVar(styles, "--sg-history-stale", fallbackColors.historyStale),
    historyWarn: readVar(styles, "--sg-history-warn", fallbackColors.historyWarn),
    historyDanger: readVar(styles, "--sg-history-danger", fallbackColors.historyDanger),
    historyOk: readVar(styles, "--sg-history-ok", fallbackColors.historyOk),
    defaultBranch: readVar(styles, "--sg-default-branch", fallbackColors.defaultBranch)
  };
}

function parseRgb(color: string): { r: number; g: number; b: number } | null {
  const trimmed = color.trim();
  const hex = /^#?([0-9a-f]{6})$/i.exec(trimmed);
  if (hex) {
    const value = Number.parseInt(hex[1], 16);
    return { r: (value >> 16) & 255, g: (value >> 8) & 255, b: value & 255 };
  }

  const rgb = /^rgba?\(\s*([\d.]+)\s*,\s*([\d.]+)\s*,\s*([\d.]+)/i.exec(trimmed);
  if (rgb) {
    return { r: Number(rgb[1]), g: Number(rgb[2]), b: Number(rgb[3]) };
  }

  return null;
}

function isDarkBackground(color: string): boolean {
  const rgb = parseRgb(color);
  if (!rgb) {
    return true;
  }

  const luminance = (0.299 * rgb.r + 0.587 * rgb.g + 0.114 * rgb.b) / 255;
  return luminance < 0.5;
}

function resolveThemeKind(body: HTMLElement): "light" | "dark" | null {
  const kind = body.getAttribute("data-vscode-theme-kind");
  if (kind === "vscode-light" || kind === "light") {
    return "light";
  }
  if (kind === "vscode-dark" || kind === "dark" || kind === "vscode-high-contrast" || kind === "high-contrast") {
    return "dark";
  }
  if (body.classList.contains("vscode-light")) {
    return "light";
  }
  if (body.classList.contains("vscode-dark") || body.classList.contains("vscode-high-contrast")) {
    return "dark";
  }
  return null;
}

/** Sync native control chrome (date picker popup, scrollbars) with the active VS Code theme. */
export function applyNativeColorScheme(root: HTMLElement = document.documentElement): void {
  const kind = resolveThemeKind(document.body);
  const scheme =
    kind ??
    (isDarkBackground(
      getComputedStyle(root).getPropertyValue("--vscode-editor-background").trim() ||
        getComputedStyle(root).getPropertyValue("--sg-bg0").trim()
    )
      ? "dark"
      : "light");

  root.style.colorScheme = scheme;
}
