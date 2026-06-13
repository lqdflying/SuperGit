import type { DateRange } from "../../../shared/types";
import { Icon } from "../../icons";

const presets: Array<{ label: string; days: 7 | 14 | 30 | null }> = [
  { label: "7d", days: 7 },
  { label: "14d", days: 14 },
  { label: "30d", days: 30 },
  { label: "All", days: null }
];

interface DateRangeBarProps {
  dateRange: DateRange;
  customFrom: string;
  customTo: string;
  total: number;
  onPreset: (days: 7 | 14 | 30 | null) => void;
  onCustomFrom: (value: string) => void;
  onCustomTo: (value: string) => void;
  onShowCustom: () => void;
}

export function DateRangeBar({ dateRange, customFrom, customTo, total, onPreset, onCustomFrom, onCustomTo, onShowCustom }: DateRangeBarProps) {
  const showCustom = dateRange.mode === "custom";
  return (
    <div className="date-range-bar">
      <Icon type="calendar" size={13} />
      {presets.map((preset) => (
        <button className={`range-button${dateRange.mode === "preset" && dateRange.presetDays === preset.days ? " active" : ""}`} key={preset.label} onClick={() => onPreset(preset.days)} type="button">
          {preset.label}
        </button>
      ))}
      <button className={`range-button${showCustom ? " active" : ""}`} onClick={onShowCustom} type="button">
        Custom
      </button>
      {showCustom && (
        <>
          <div className="divider" />
          <input className="date-input" type="date" value={customFrom} onChange={(event) => onCustomFrom(event.target.value)} />
          <span className="muted">to</span>
          <input className="date-input" type="date" value={customTo} onChange={(event) => onCustomTo(event.target.value)} />
        </>
      )}
      <div className="spacer" />
      <span className="muted">{total} commits</span>
    </div>
  );
}
