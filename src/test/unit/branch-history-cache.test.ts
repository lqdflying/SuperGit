import { beforeEach, describe, expect, it } from "vitest";
import type { BranchHistoryPayload } from "../../shared/types";
import {
  clearBranchHistoryCache,
  getBranchHistoryCache,
  getBranchHistoryCacheEpoch,
  isBranchHistoryCacheEpochCurrent,
  markBranchHistoryDirty,
  setBranchHistoryCache
} from "../../extension/branchHistoryCache";

const dateRange30d = { mode: "preset" as const, presetDays: 30 as const };
const dateRange7d = { mode: "preset" as const, presetDays: 7 as const };

const samplePayload: BranchHistoryPayload = {
  lifecycles: [],
  defaultBranch: "main",
  remoteMains: [],
  window: { totalDays: 30, startDate: "2026-05-15", endDate: "2026-06-14" }
};

describe("branchHistoryCache", () => {
  beforeEach(() => {
    clearBranchHistoryCache();
  });

  it("returns undefined on cache miss", () => {
    expect(getBranchHistoryCache("/repo", dateRange30d)).toBeUndefined();
  });

  it("returns cached payload for matching root and date range", () => {
    setBranchHistoryCache("/repo", dateRange30d, samplePayload);
    expect(getBranchHistoryCache("/repo", dateRange30d)).toEqual(samplePayload);
  });

  it("treats different date ranges as separate cache keys", () => {
    setBranchHistoryCache("/repo", dateRange30d, samplePayload);
    expect(getBranchHistoryCache("/repo", dateRange7d)).toBeUndefined();
  });

  it("marks all entries for a repository dirty", () => {
    setBranchHistoryCache("/repo", dateRange30d, samplePayload);
    setBranchHistoryCache("/repo", dateRange7d, samplePayload);
    markBranchHistoryDirty("/repo");
    expect(getBranchHistoryCache("/repo", dateRange30d)).toBeUndefined();
    expect(getBranchHistoryCache("/repo", dateRange7d)).toBeUndefined();
  });

  it("does not mark another repository dirty", () => {
    setBranchHistoryCache("/repo-a", dateRange30d, samplePayload);
    setBranchHistoryCache("/repo-b", dateRange30d, samplePayload);
    markBranchHistoryDirty("/repo-a");
    expect(getBranchHistoryCache("/repo-a", dateRange30d)).toBeUndefined();
    expect(getBranchHistoryCache("/repo-b", dateRange30d)).toEqual(samplePayload);
  });

  it("allows reuse after a fresh load stores a clean entry", () => {
    setBranchHistoryCache("/repo", dateRange30d, samplePayload);
    markBranchHistoryDirty("/repo");
    setBranchHistoryCache("/repo", dateRange30d, samplePayload);
    expect(getBranchHistoryCache("/repo", dateRange30d)).toEqual(samplePayload);
  });

  it("bumps per-root epoch when marked dirty", () => {
    const epoch = getBranchHistoryCacheEpoch("/repo");
    markBranchHistoryDirty("/repo");
    expect(getBranchHistoryCacheEpoch("/repo")).toBe(epoch + 1);
    expect(isBranchHistoryCacheEpochCurrent("/repo", epoch)).toBe(false);
    expect(isBranchHistoryCacheEpochCurrent("/repo", epoch + 1)).toBe(true);
  });

  it("does not bump another repository epoch when one repo is marked dirty", () => {
    const epochB = getBranchHistoryCacheEpoch("/repo-b");
    markBranchHistoryDirty("/repo-a");
    expect(getBranchHistoryCacheEpoch("/repo-b")).toBe(epochB);
  });
});
