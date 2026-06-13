import { colors } from "../../shared/tokens";
import { Icon, type IconName } from "../icons";

export function TabButton({ active, onClick, icon, label }: { active: boolean; onClick: () => void; icon: IconName; label: string }) {
  return (
    <button className={`tab-button${active ? " active" : ""}`} onClick={onClick} type="button">
      <Icon type={icon} size={13} color={active ? colors.accent : colors.fgDim} />
      {label}
    </button>
  );
}
