import { describe, expect, it } from "vitest";
import {
  shouldEnrichRemoteDefaultsAfterAction,
  shouldInvalidateRemoteDefaultBranches,
  shouldMarkBranchHistoryDirty,
  shouldReloadBranchHistoryAfterAction,
  shouldReloadCommitsAfterAction
} from "../../extension/refreshPolicy";

describe("shouldInvalidateRemoteDefaultBranches", () => {
  it("returns true for fetch, prune-stale, and delete-remote", () => {
    expect(shouldInvalidateRemoteDefaultBranches("fetch")).toBe(true);
    expect(shouldInvalidateRemoteDefaultBranches("prune-stale")).toBe(true);
    expect(shouldInvalidateRemoteDefaultBranches("delete-remote")).toBe(true);
  });

  it("returns false for local tracking actions that do not change remote HEAD", () => {
    expect(shouldInvalidateRemoteDefaultBranches("add-upstream")).toBe(false);
    expect(shouldInvalidateRemoteDefaultBranches("set-default-upstream")).toBe(false);
    expect(shouldInvalidateRemoteDefaultBranches("push")).toBe(false);
    expect(shouldInvalidateRemoteDefaultBranches("pull")).toBe(false);
    expect(shouldInvalidateRemoteDefaultBranches("set-upstream")).toBe(false);
    expect(shouldInvalidateRemoteDefaultBranches("delete")).toBe(false);
  });
});

describe("shouldEnrichRemoteDefaultsAfterAction", () => {
  it("matches remote default invalidation actions", () => {
    expect(shouldEnrichRemoteDefaultsAfterAction("fetch")).toBe(true);
    expect(shouldEnrichRemoteDefaultsAfterAction("add-upstream")).toBe(false);
    expect(shouldEnrichRemoteDefaultsAfterAction("set-default-upstream")).toBe(false);
  });
});

describe("shouldMarkBranchHistoryDirty", () => {
  it("returns true for ref-changing branch actions", () => {
    expect(shouldMarkBranchHistoryDirty("add-upstream")).toBe(true);
    expect(shouldMarkBranchHistoryDirty("push")).toBe(true);
    expect(shouldMarkBranchHistoryDirty("fetch")).toBe(true);
  });
});

describe("shouldReloadCommitsAfterAction", () => {
  it("returns true for ref-changing branch actions", () => {
    expect(shouldReloadCommitsAfterAction("add-upstream")).toBe(true);
    expect(shouldReloadCommitsAfterAction("set-default-upstream")).toBe(true);
  });
});

describe("shouldReloadBranchHistoryAfterAction", () => {
  it("skips reload when both tabs are graph", () => {
    expect(shouldReloadBranchHistoryAfterAction("graph", "graph")).toBe(false);
  });

  it("skips reload when both tabs are branches", () => {
    expect(shouldReloadBranchHistoryAfterAction("branches", "branches")).toBe(false);
  });

  it("reloads when both tabs are history", () => {
    expect(shouldReloadBranchHistoryAfterAction("history", "history")).toBe(true);
  });

  it("reloads when action started on history but user switched away", () => {
    expect(shouldReloadBranchHistoryAfterAction("history", "branches")).toBe(true);
  });

  it("reloads when user switched to history mid-action (race case)", () => {
    expect(shouldReloadBranchHistoryAfterAction("branches", "history")).toBe(true);
  });

  it("reloads when user switched to history from graph mid-action", () => {
    expect(shouldReloadBranchHistoryAfterAction("graph", "history")).toBe(true);
  });

  it("skips reload when action tab is undefined and current tab is graph", () => {
    expect(shouldReloadBranchHistoryAfterAction(undefined, "graph")).toBe(false);
  });

  it("reloads when action tab is undefined but current tab is history", () => {
    expect(shouldReloadBranchHistoryAfterAction(undefined, "history")).toBe(true);
  });
});
