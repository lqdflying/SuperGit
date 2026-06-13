import { useThemeColors } from "../ThemeProvider";
import { Icon, type IconName } from "../icons";

export function TabButton({ active, onClick, icon, label }: { active: boolean; onClick: () => void; icon: IconName; label: string }) {
  const theme = useThemeColors();
  return (
    <button className={`tab-button${active ? " active" : ""}`} onClick={onClick} type="button">
      <Icon type={icon} size={13} color={active ? theme.accent : "currentColor"} />
      {label}
    </button>
  );
}
