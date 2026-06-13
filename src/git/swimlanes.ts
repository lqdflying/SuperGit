import type { CommitNode, SwimlaneNode } from "../shared/types";
import { graph } from "../shared/tokens";
import { findBranchRefForLane, findMainBranchName } from "./parser";

export interface SwimlaneLayout {
  activeLaneCount: number;
}

function cloneLane(node: SwimlaneNode): SwimlaneNode {
  return { id: node.id, colorIndex: node.colorIndex };
}

function laneHasId(lanes: SwimlaneNode[], id: string): boolean {
  return lanes.some((lane) => lane.id === id);
}

function pushLane(lanes: SwimlaneNode[], lane: SwimlaneNode): void {
  if (!laneHasId(lanes, lane.id)) {
    lanes.push(lane);
  }
}

function findLastLaneIndex(lanes: SwimlaneNode[], id: string): number {
  for (let index = lanes.length - 1; index >= 0; index -= 1) {
    if (lanes[index].id === id) {
      return index;
    }
  }
  return -1;
}

/**
 * Row-based active swimlane assignment aligned with VS Code scmHistory.
 * Lane columns follow parent topology; branch refs only affect labels/colors.
 */
export function assignSwimlanes(
  commits: CommitNode[],
  remoteNames: string[] = ["origin", "upstream", "backup"],
  defaultBranch = "main"
): SwimlaneLayout {
  const mainBranch = findMainBranchName(commits, defaultBranch);
  const branchColors = new Map<string, number>();
  branchColors.set(mainBranch, 0);
  let nextColor = -1;

  const colorForCommit = (commit: CommitNode | undefined): number | undefined => {
    if (!commit) {
      return undefined;
    }
    const ref = findBranchRefForLane(commit.refs, remoteNames);
    if (!ref) {
      return undefined;
    }
    if (ref === mainBranch) {
      return 0;
    }
    if (!branchColors.has(ref)) {
      nextColor = (nextColor + 1) % Math.max(1, graph.maxLanes - 1);
      branchColors.set(ref, 1 + nextColor);
    }
    return branchColors.get(ref);
  };

  const nextAnonymousColor = (): number => {
    nextColor = (nextColor + 1) % Math.max(1, graph.maxLanes - 1);
    return 1 + nextColor;
  };

  const commitByHash = new Map(commits.map((commit) => [commit.hash, commit]));
  let previousOutput: SwimlaneNode[] = [];
  let maxLane = 1;

  for (const commit of commits) {
    const inputSwimlanes = previousOutput.map(cloneLane);
    const outputSwimlanes: SwimlaneNode[] = [];
    let firstParentAdded = false;

    if (commit.parents.length > 0) {
      for (const node of inputSwimlanes) {
        if (node.id === commit.hash) {
          if (!firstParentAdded) {
            const color = colorForCommit(commit) ?? node.colorIndex;
            pushLane(outputSwimlanes, { id: commit.parents[0], colorIndex: color });
            firstParentAdded = true;
          }
          continue;
        }
        pushLane(outputSwimlanes, cloneLane(node));
      }
    } else {
      for (const node of inputSwimlanes) {
        if (node.id !== commit.hash) {
          pushLane(outputSwimlanes, cloneLane(node));
        }
      }
    }

    const startParent = firstParentAdded ? 1 : 0;
    for (let parentIndex = startParent; parentIndex < commit.parents.length; parentIndex += 1) {
      const parentHash = commit.parents[parentIndex];
      const parentCommit = commitByHash.get(parentHash);
      let color = colorForCommit(parentCommit);
      if (parentIndex === 0 && color === undefined) {
        color = colorForCommit(commit);
      }
      if (color === undefined) {
        color = nextAnonymousColor();
      }
      pushLane(outputSwimlanes, { id: parentHash, colorIndex: color });
    }

    const inputIndex = inputSwimlanes.findIndex((node) => node.id === commit.hash);
    const swimlaneIndex = inputIndex !== -1 ? inputIndex : inputSwimlanes.length;

    commit.inputSwimlanes = inputSwimlanes;
    commit.outputSwimlanes = outputSwimlanes;
    commit.swimlaneIndex = swimlaneIndex;
    commit.branchIndex = swimlaneIndex;
    commit.branch = findBranchRefForLane(commit.refs, remoteNames) || mainBranch;
    commit.parentSwimlanes = commit.parents.map((parentHash) => {
      const outputIndex = findLastLaneIndex(outputSwimlanes, parentHash);
      if (outputIndex !== -1) {
        return outputIndex;
      }
      const inputLane = inputSwimlanes.findIndex((node) => node.id === parentHash);
      return inputLane !== -1 ? inputLane : swimlaneIndex;
    });

    maxLane = Math.max(
      maxLane,
      inputSwimlanes.length,
      outputSwimlanes.length,
      swimlaneIndex + 1,
      1
    );
    previousOutput = outputSwimlanes;
  }

  return { activeLaneCount: maxLane };
}

export function getActiveLaneCount(commits: CommitNode[]): number {
  if (commits.length === 0) {
    return 1;
  }

  let maxLane = 1;
  for (const commit of commits) {
    maxLane = Math.max(
      maxLane,
      commit.inputSwimlanes?.length ?? 0,
      commit.outputSwimlanes?.length ?? 0,
      commit.swimlaneIndex + 1
    );
  }

  return maxLane;
}
