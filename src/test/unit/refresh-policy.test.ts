import { describe, expect, it } from "vitest";
import {
  shouldEnrichRemoteDefaultsAfterAction,
  shouldInvalidateRemoteDefaultBranches,
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
    expect(shouldInvalidateRemoteDefaultBranches("checkout-new-local-branch")).toBe(false);
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

describe("shouldReloadCommitsAfterAction", () => {
  it("returns true for ref-changing branch actions", () => {
    expect(shouldReloadCommitsAfterAction("add-upstream")).toBe(true);
    expect(shouldReloadCommitsAfterAction("set-default-upstream")).toBe(true);
    expect(shouldReloadCommitsAfterAction("checkout-new-local-branch")).toBe(true);
  });
});
