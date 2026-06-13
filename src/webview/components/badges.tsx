import type { ThemeColors } from "../../shared/themeColors";
import { useThemeColors } from "../ThemeProvider";
import { Icon } from "../icons";

export function RefBadge({ text, color }: { text: string; color: string }) {
  return (
    <span className="ref-pill" style={{ color, borderColor: `${color}44`, background: `${color}15` }}>
      {text}
    </span>
  );
}

export function TagBadge({ text }: { text: string }) {
  const theme = useThemeColors();
  return (
    <span className="tag-pill">
      <Icon type="tag" size={10} color={theme.tagFg} />
      {text}
    </span>
  );
}

export function HeadBadge() {
  return <span className="head-pill">HEAD</span>;
}

export function CurrentBadge() {
  return <span className="current-badge">current</span>;
}

export function refBadgeColor(ref: string, laneColor: string, theme: ThemeColors): string {
  if (ref === "HEAD") {
    return laneColor;
  }
  if (ref.includes("/")) {
    return theme.fgDim;
  }
  return laneColor;
}
