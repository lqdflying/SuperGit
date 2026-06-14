import type { BranchHistoryPayload, DateRange } from "../shared/types";

interface CacheEntry {
  payload: BranchHistoryPayload;
  dirty: boolean;
}

const cache = new Map<string, CacheEntry>();
const repoEpoch = new Map<string, number>();

function stableDateRangeKey(dateRange: DateRange): string {
  return JSON.stringify(dateRange);
}

function cacheKey(root: string, dateRange: DateRange): string {
  return `${root}\0${stableDateRangeKey(dateRange)}`;
}

export function getBranchHistoryCacheEpoch(root: string): number {
  return repoEpoch.get(root) ?? 0;
}

export function isBranchHistoryCacheEpochCurrent(root: string, epoch: number): boolean {
  return getBranchHistoryCacheEpoch(root) === epoch;
}

export function getBranchHistoryCache(root: string, dateRange: DateRange): BranchHistoryPayload | undefined {
  const entry = cache.get(cacheKey(root, dateRange));
  if (!entry || entry.dirty) {
    return undefined;
  }
  return entry.payload;
}

export function setBranchHistoryCache(root: string, dateRange: DateRange, payload: BranchHistoryPayload): void {
  cache.set(cacheKey(root, dateRange), { payload, dirty: false });
}

export function markBranchHistoryDirty(root?: string): void {
  if (!root) {
    for (const key of repoEpoch.keys()) {
      repoEpoch.set(key, (repoEpoch.get(key) ?? 0) + 1);
    }
    for (const entry of cache.values()) {
      entry.dirty = true;
    }
    return;
  }

  repoEpoch.set(root, (repoEpoch.get(root) ?? 0) + 1);
  const prefix = `${root}\0`;
  for (const [key, entry] of cache) {
    if (key.startsWith(prefix)) {
      entry.dirty = true;
    }
  }
}

export function clearBranchHistoryCache(): void {
  cache.clear();
  repoEpoch.clear();
}
