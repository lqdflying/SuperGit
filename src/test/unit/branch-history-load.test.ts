import { afterEach, describe, expect, it } from "vitest";
import {
  beginBranchHistoryLoad,
  isCurrentBranchHistoryLoad,
  resetBranchHistoryLoadGeneration
} from "../../extension/branchHistoryLoad";

describe("branchHistoryLoad generation", () => {
  afterEach(() => {
    resetBranchHistoryLoadGeneration();
  });

  it("marks only the latest generation as current", () => {
    const first = beginBranchHistoryLoad();
    const second = beginBranchHistoryLoad();

    expect(isCurrentBranchHistoryLoad(first)).toBe(false);
    expect(isCurrentBranchHistoryLoad(second)).toBe(true);
  });

  it("supersedes older generations when a newer load starts", () => {
    const stale = beginBranchHistoryLoad();
    beginBranchHistoryLoad();

    expect(isCurrentBranchHistoryLoad(stale)).toBe(false);
  });

  it("resets cleanly for tests", () => {
    beginBranchHistoryLoad();
    resetBranchHistoryLoadGeneration();
    expect(isCurrentBranchHistoryLoad(1)).toBe(false);
  });
});
