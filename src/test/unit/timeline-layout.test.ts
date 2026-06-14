import { describe, expect, it } from "vitest";
import {
  commitDotRadius,
  computeDayWidth,
  computeIdleDays,
  computeLabelEveryNDays,
  computeLx,
  computeSvgWidth,
  ghostDotRadius,
  shouldShowHashLabels,
  shouldShowRemoteMarkers,
  shouldShowWeekLabel
} from "../../webview/components/history/timelineLayout";

describe("timelineLayout", () => {
  it("computeDayWidth scales to container", () => {
    expect(computeDayWidth(1200, 30)).toBeCloseTo(31.333, 2);
    expect(computeDayWidth(800, 90)).toBeCloseTo(6, 2);
  });

  it("computeDayWidth does not go negative below MIN_TIMELINE_WIDTH", () => {
    expect(computeDayWidth(200, 30)).toBe(0);
    expect(computeDayWidth(100, 90)).toBe(0);
    expect(computeDayWidth(259, 7)).toBe(0);
    expect(computeDayWidth(260, 7)).toBeCloseTo(0, 5);
    expect(computeDayWidth(400, 30)).toBeCloseTo(4.667, 2);
  });

  it("computeDayWidth falls back when totalDays is zero", () => {
    expect(computeDayWidth(1200, 0)).toBe(30);
  });

  it("computeSvgWidth uses container width with minimum", () => {
    expect(computeSvgWidth(1200)).toBe(1200);
    expect(computeSvgWidth(100)).toBe(260);
  });

  it("computeLx centers day columns", () => {
    expect(computeLx(0, 0, 30)).toBe(235);
    expect(computeLx(1, 0, 30)).toBe(265);
  });

  it("computeLabelEveryNDays uses design thresholds", () => {
    expect(computeLabelEveryNDays(6)).toBe(28);
    expect(computeLabelEveryNDays(10)).toBe(14);
    expect(computeLabelEveryNDays(20)).toBe(7);
    expect(computeLabelEveryNDays(30)).toBe(1);
  });

  it("shouldShowWeekLabel respects density and first day", () => {
    expect(shouldShowWeekLabel(28, 0, true)).toBe(true);
    expect(shouldShowWeekLabel(28, 1, false)).toBe(false);
    expect(shouldShowWeekLabel(7, 2, false)).toBe(true);
  });

  it("shouldShowHashLabels threshold at 12", () => {
    expect(shouldShowHashLabels(12)).toBe(false);
    expect(shouldShowHashLabels(12.1)).toBe(true);
  });

  it("shouldShowRemoteMarkers threshold at 15", () => {
    expect(shouldShowRemoteMarkers(15)).toBe(false);
    expect(shouldShowRemoteMarkers(15.1)).toBe(true);
  });

  it("commitDotRadius clamps to design bounds", () => {
    expect(commitDotRadius(5, false)).toBe(2);
    expect(commitDotRadius(30, false)).toBe(3.5);
    expect(commitDotRadius(30, true)).toBe(3);
  });

  it("ghostDotRadius clamps to design bounds", () => {
    expect(ghostDotRadius(5)).toBe(1.5);
    expect(ghostDotRadius(30)).toBe(2.5);
  });

  it("computeIdleDays is non-negative", () => {
    expect(computeIdleDays(29, 25)).toBe(4);
    expect(computeIdleDays(10, 12)).toBe(0);
  });
});
