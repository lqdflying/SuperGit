export const LABEL_WIDTH = 220;
export const PAD_RIGHT = 40;
export const MIN_TIMELINE_WIDTH = LABEL_WIDTH + PAD_RIGHT;
export const LANE_HEIGHT = 72;
export const LANE_HEIGHT_DIVERGED = 96;
export const BAR_HEIGHT = 8;
export const DIV_GAP = 14;
export const DEFAULT_CONTAINER_WIDTH = 800;

export function computeTimelineTimeWidth(containerW: number): number {
  return Math.max(0, containerW - MIN_TIMELINE_WIDTH);
}

export function computeDayWidth(containerW: number, totalDays: number): number {
  if (totalDays <= 0) {
    return 30;
  }
  return computeTimelineTimeWidth(containerW) / totalDays;
}

export function computeSvgWidth(containerW: number): number {
  return Math.max(containerW, MIN_TIMELINE_WIDTH);
}

export function computeLx(day: number, rangeStart: number, dayW: number): number {
  return LABEL_WIDTH + (day - rangeStart) * dayW + dayW / 2;
}

export function computeLabelEveryNDays(dayW: number): number {
  if (dayW < 8) {
    return 28;
  }
  if (dayW < 15) {
    return 14;
  }
  if (dayW < 25) {
    return 7;
  }
  return 1;
}

export function shouldShowWeekLabel(labelEveryN: number, weekIndex: number, isFirst: boolean): boolean {
  if (isFirst) {
    return true;
  }
  const interval = Math.max(1, Math.ceil(labelEveryN / 7));
  return weekIndex % interval === 0;
}

export function shouldShowHashLabels(dayW: number): boolean {
  return dayW > 12;
}

export function shouldShowRemoteMarkers(dayW: number): boolean {
  return dayW > 15;
}

export function commitDotRadius(dayW: number, isMain: boolean): number {
  const max = isMain ? 3 : 3.5;
  return Math.max(2, Math.min(max, dayW * 0.15));
}

export function ghostDotRadius(dayW: number): number {
  return Math.max(1.5, Math.min(2.5, dayW * 0.1));
}

export function computeIdleDays(todayDay: number, lastCommitDay: number): number {
  return Math.max(0, todayDay - lastCommitDay);
}
