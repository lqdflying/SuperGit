import { colors } from "../../shared/tokens";
import { Icon } from "../icons";

export function RefBadge({ text, color }: { text: string; color: string }) {
  return (
    <span className="ref-pill" style={{ color, borderColor: `${color}44`, background: `${color}15` }}>
      {text}
    </span>
  );
}

export function TagBadge({ text }: { text: string }) {
  return (
    <span className="tag-pill">
      <Icon type="tag" size={10} color={colors.tagFg} />
      {text}
    </span>
  );
}

export function HeadBadge() {
  return <span className="head-pill">HEAD</span>;
}
