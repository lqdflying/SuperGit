import { describe, expect, it } from "vitest";
import { shouldReloadBranchHistoryAfterAction } from "../../extension/refreshPolicy";

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
