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
    hover: readVar(styles, "--sg-hover", fallbackColors.hover),
    tagBg: readVar(styles, "--sg-tag-bg", fallbackColors.tagBg),
    tagBorder: readVar(styles, "--sg-tag-border", fallbackColors.tagBorder),
    tagFg: readVar(styles, "--sg-tag-fg", fallbackColors.tagFg),
    currentBadge: readVar(styles, "--sg-current-badge", fallbackColors.currentBadge),
    currentBadgeBg: readVar(styles, "--sg-current-badge-bg", fallbackColors.currentBadgeBg),
    buttonFg: readVar(styles, "--sg-button-fg", "#ffffff")
  };
}
