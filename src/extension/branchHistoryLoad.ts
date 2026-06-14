let branchHistoryLoadGeneration = 0;

export function beginBranchHistoryLoad(): number {
  branchHistoryLoadGeneration += 1;
  return branchHistoryLoadGeneration;
}

export function isCurrentBranchHistoryLoad(generation: number): boolean {
  return generation === branchHistoryLoadGeneration;
}

/** @internal test helper */
export function resetBranchHistoryLoadGeneration(): void {
  branchHistoryLoadGeneration = 0;
}
