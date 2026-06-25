import * as vscode from "vscode";
import type { BranchAction, CommitAction, RemoteConfig } from "../shared/types";
import { resolveRemoteDefaultBranch } from "./remote-default";
import {
  getCurrentBranch,
  getRemotes,
  isBranchMergedInto,
  resolveDefaultBranch,
  unsetStaleUpstreamLinks,
  unsetUpstreamLinksForRemoteRef
} from "./commands";
import { runGit } from "./runner";

export interface ActionResult {
  success: boolean;
  message: string;
}

export interface BranchActionContext {
  defaultBranch?: string;
  remoteDefaultBranch?: string;
}

export async function executeCommitAction(cwd: string, action: CommitAction, commitHash: string): Promise<ActionResult> {
  switch (action) {
    case "copy-hash":
      await vscode.env.clipboard.writeText(commitHash);
      return { success: true, message: "Commit hash copied." };
    case "checkout":
      return runGuarded(cwd, `Checkout ${commitHash.slice(0, 7)} in detached HEAD?`, ["checkout", "--detach", commitHash], "Checked out commit.");
    case "cherry-pick":
      return runGuarded(cwd, `Cherry-pick ${commitHash.slice(0, 7)} onto the current branch?`, ["cherry-pick", commitHash], "Cherry-pick completed.");
    case "revert":
      return runGuarded(cwd, `Revert ${commitHash.slice(0, 7)} with a new commit?`, ["revert", "--no-edit", commitHash], "Revert completed.");
    case "create-branch": {
      const name = await vscode.window.showInputBox({
        title: "Create Branch",
        prompt: "Branch name",
        placeHolder: "feature/new-work"
      });
      if (!name) {
        return { success: false, message: "Create branch cancelled." };
      }
      return runGuarded(cwd, `Create branch ${name} at ${commitHash.slice(0, 7)}?`, ["branch", name, commitHash], `Branch ${name} created.`);
    }
    case "create-tag": {
      const name = await vscode.window.showInputBox({
        title: "Create Tag",
        prompt: "Tag name",
        placeHolder: "v1.0.0"
      });
      if (!name) {
        return { success: false, message: "Create tag cancelled." };
      }
      return runGuarded(cwd, `Create tag ${name} at ${commitHash.slice(0, 7)}?`, ["tag", name, commitHash], `Tag ${name} created.`);
    }
  }
}

export async function executeBranchAction(
  cwd: string,
  action: BranchAction,
  branchName?: string,
  remote?: string,
  remoteBranchName?: string,
  context: BranchActionContext = {}
): Promise<ActionResult> {
  switch (action) {
    case "fetch": {
      const remoteChoice = await resolveRemoteChoice(cwd, remote, {
        title: "Fetch Remote",
        includeAll: true,
        allLabel: "All remotes"
      });
      if (remoteChoice.cancelled) {
        return { success: false, message: "Fetch cancelled." };
      }
      return runGuarded(
        cwd,
        remoteChoice.remote ? `Fetch and prune ${remoteChoice.remote}?` : "Fetch and prune all remotes?",
        remoteChoice.remote ? ["fetch", remoteChoice.remote, "--prune"] : ["fetch", "--all", "--prune"],
        remoteChoice.remote ? `Fetched ${remoteChoice.remote}.` : "Fetched all remotes."
      );
    }
    case "push": {
      const branch = branchName || (await getCurrentBranch(cwd));
      const remoteChoice = await resolveRemoteChoice(cwd, remote, {
        title: `Push ${branch}`,
        includeAll: false
      });
      if (remoteChoice.cancelled) {
        return { success: false, message: "Push cancelled." };
      }

      const remotes = await getRemotes(cwd);
      const remoteName = remoteChoice.remote ?? (branchName ? remotes[0]?.name : undefined);
      if (!remoteName) {
        if (branchName) {
          return { success: false, message: "No remote configured." };
        }
        return runGuarded(cwd, "Push the current branch?", ["push"], "Pushed current branch.");
      }

      const remoteBranch = resolveRemoteBranchName(branch, remoteBranchName);
      const remoteRef = formatRemoteRef(remoteName, remoteBranch);
      const confirmation =
        remoteBranch === branch ? `Push ${branch} to ${remoteName}?` : `Push ${branch} to ${remoteRef}?`;
      const successMessage =
        remoteBranch === branch ? `Pushed ${branch} to ${remoteName}.` : `Pushed ${branch} to ${remoteRef}.`;

      return runGuarded(cwd, confirmation, pushCommand(remoteName, branch, remoteBranchName), successMessage);
    }
    case "pull": {
      const branch = branchName || (await getCurrentBranch(cwd));
      if (branch.startsWith("DETACHED")) {
        return runGuarded(cwd, "Pull current branch with fast-forward only?", ["pull", "--ff-only"], "Pull completed.");
      }

      const current = await getCurrentBranch(cwd);
      const remoteChoice = await resolveRemoteChoice(cwd, remote, {
        title: `Pull ${branch}`,
        includeAll: false
      });
      if (remoteChoice.cancelled) {
        return { success: false, message: "Pull cancelled." };
      }

      const remotes = await getRemotes(cwd);
      const remoteName = remoteChoice.remote ?? remotes[0]?.name;
      const remoteBranch = resolveRemoteBranchName(branch, remoteBranchName);
      const isCheckedOut = !current.startsWith("DETACHED") && current === branch;

      if (!remoteName) {
        if (isCheckedOut) {
          return runGuarded(cwd, "Pull current branch with fast-forward only?", ["pull", "--ff-only"], "Pull completed.");
        }
        return { success: false, message: "No remote configured." };
      }

      const remoteRef = formatRemoteRef(remoteName, remoteBranch);
      if (isCheckedOut) {
        return runGuarded(
          cwd,
          `Pull ${remoteRef} with fast-forward only?`,
          pullCheckedOutCommand(remoteName, remoteBranch),
          "Pull completed."
        );
      }

      return runGuarded(
        cwd,
        `Fast-forward local ${branch} from ${remoteRef}?`,
        pullFetchCommand(remoteName, branch, remoteBranchName),
        "Pull completed."
      );
    }
    case "set-upstream":
      return executeSetUpstream(cwd, branchName, remote, remoteBranchName);
    case "add-upstream":
      return executeAddUpstream(cwd, branchName, remote, remoteBranchName);
    case "set-default-upstream":
      return executeSetDefaultUpstream(cwd, branchName, remote, remoteBranchName);
    case "checkout-new-local-branch":
      return executeCheckoutNewLocalBranch(cwd, branchName, remote, remoteBranchName);
    case "delete": {
      if (!branchName) {
        return { success: false, message: "Select a branch before deleting." };
      }

      const current = await getCurrentBranch(cwd);
      if (!current.startsWith("DETACHED") && current === branchName) {
        return { success: false, message: "Cannot delete the checked-out branch." };
      }

      const defaultBranch = await resolveDefaultBranch(cwd);
      if (branchName === defaultBranch) {
        return { success: false, message: `Cannot delete the default branch (${defaultBranch}).` };
      }

      const merged = await isBranchMergedInto(cwd, branchName, defaultBranch);
      if (merged) {
        const choice = await vscode.window.showWarningMessage(
          `"${branchName}" is merged into "${defaultBranch}". Safe to delete locally.`,
          { modal: true },
          "Delete"
        );
        if (choice !== "Delete") {
          return { success: false, message: "Action cancelled." };
        }
        return executeGitCommand(cwd, ["branch", "-d", branchName], `Deleted ${branchName}.`);
      }

      const choice = await vscode.window.showWarningMessage(
        `"${branchName}" has commits not merged into "${defaultBranch}". Deleting may lose work.`,
        { modal: true },
        "Delete (safe)",
        "Force Delete"
      );
      if (choice !== "Delete (safe)" && choice !== "Force Delete") {
        return { success: false, message: "Action cancelled." };
      }

      const flag = choice === "Force Delete" ? "-D" : "-d";
      return executeGitCommand(cwd, ["branch", flag, branchName], `Deleted ${branchName}.`);
    }
    case "delete-remote": {
      const remoteBranch = remoteBranchName ?? branchName;
      if (!remoteBranch || !remote) {
        return { success: false, message: "Select a remote branch before deleting." };
      }

      const remoteDefaultBranch =
        context.remoteDefaultBranch ??
        (await resolveRemoteDefaultBranch(cwd, remote, { network: false })) ??
        (remote === "origin" ? context.defaultBranch : undefined);
      if (remoteDefaultBranch && remoteBranch === remoteDefaultBranch) {
        return {
          success: false,
          message: `Cannot delete the default branch (${remote}/${remoteBranch}) on the remote. Change the remote default branch first.`
        };
      }

      const hasLocalRef = await localRemoteTrackingRefExists(cwd, remote, remoteBranch);
      if (!hasLocalRef) {
        const existsOnRemote = await remoteBranchExistsOnRemote(cwd, remote, remoteBranch);
        if (!existsOnRemote) {
          return {
            success: false,
            message: `Remote branch ${remote}/${remoteBranch} does not exist on ${remote}. Run Prune Stale to clear broken upstream links.`
          };
        }
      }

      const remoteRef = `refs/remotes/${remote}/${remoteBranch}`;
      const defaultBranch = context.defaultBranch ?? (await resolveDefaultBranch(cwd, { network: false }));
      const merged = await isBranchMergedInto(cwd, remoteRef, defaultBranch);
      const message = merged
        ? `Remote branch "${remote}/${remoteBranch}" is merged into "${defaultBranch}". Safe to delete.`
        : `Remote branch "${remote}/${remoteBranch}" has commits not merged into "${defaultBranch}". Deleting may lose work on the remote.`;

      const choice = await vscode.window.showWarningMessage(message, { modal: true }, "Delete Remote");
      if (choice !== "Delete Remote") {
        return { success: false, message: "Action cancelled." };
      }

      return executeDeleteRemoteCommand(cwd, remote, remoteBranch);
    }
    case "prune-stale":
      return executePruneStale(cwd, remote);
  }
}

async function executeCheckoutNewLocalBranch(
  cwd: string,
  branchName?: string,
  remote?: string,
  remoteBranchName?: string
): Promise<ActionResult> {
  const usesRemoteSource = Boolean(remote && remoteBranchName);

  if (usesRemoteSource) {
    const hasLocalRef = await localRemoteTrackingRefExists(cwd, remote!, remoteBranchName!);
    if (!hasLocalRef) {
      return {
        success: false,
        message: `Remote tracking ref ${formatRemoteRef(remote!, remoteBranchName!)} is not available locally. Fetch the remote branch first.`
      };
    }

    const upstream = formatRemoteRef(remote!, remoteBranchName!);
    const newName = await vscode.window.showInputBox({
      title: "Checkout New Branch",
      prompt: `New local branch tracking ${upstream}`,
      placeHolder: "feature/new-work",
      value: remoteBranchName
    });
    if (!newName) {
      return { success: false, message: "Checkout new branch cancelled." };
    }
    if (!(await isValidBranchName(cwd, newName))) {
      return { success: false, message: `Invalid branch name: ${newName}` };
    }

    return runGuarded(
      cwd,
      `Create and checkout ${newName} tracking ${upstream}?`,
      ["checkout", "-b", newName, "--track", upstream],
      `Checked out new branch ${newName}.`
    );
  }

  if (!branchName) {
    return { success: false, message: "Select a branch before checking out a new branch." };
  }

  const newName = await vscode.window.showInputBox({
    title: "Checkout New Branch",
    prompt: `New local branch from ${branchName}`,
    placeHolder: "feature/new-work"
  });
  if (!newName) {
    return { success: false, message: "Checkout new branch cancelled." };
  }
  if (!(await isValidBranchName(cwd, newName))) {
    return { success: false, message: `Invalid branch name: ${newName}` };
  }

  return runGuarded(
    cwd,
    `Create and checkout ${newName} from ${branchName}?`,
    ["checkout", "-b", newName, branchName],
    `Checked out new branch ${newName}.`
  );
}

async function isValidBranchName(cwd: string, name: string): Promise<boolean> {
  const result = await runGit(["check-ref-format", "--branch", name], cwd, { timeout: 120_000 });
  return result.exitCode === 0;
}

async function executePruneStale(cwd: string, remote?: string): Promise<ActionResult> {
  const allowed = await vscode.window.showWarningMessage(
    remote
      ? `Prune stale refs from ${remote} and clear broken upstream links?`
      : "Prune stale refs from all remotes and clear broken upstream links?",
    { modal: true },
    "Run"
  );
  if (allowed !== "Run") {
    return { success: false, message: "Action cancelled." };
  }

  const pruneArgs = remote ? ["remote", "prune", remote] : ["fetch", "--all", "--prune"];
  const pruneResult = await runGit(pruneArgs, cwd, { timeout: 120_000 });
  if (pruneResult.exitCode !== 0) {
    const detail = pruneResult.timedOut ? "command timed out" : pruneResult.stderr.trim() || "git command failed";
    return { success: false, message: detail };
  }

  const unsetBranches = await unsetStaleUpstreamLinks(cwd, remote);
  let message = remote ? `Pruned ${remote}.` : "Pruned all remotes.";
  if (unsetBranches.length > 0) {
    message += ` Cleared upstream on ${unsetBranches.join(", ")}.`;
  }
  return { success: true, message };
}

async function resolveRemoteChoice(
  cwd: string,
  remote: string | undefined,
  options: { title: string; includeAll: boolean; allLabel?: string }
): Promise<{ cancelled: boolean; remote?: string }> {
  if (remote) {
    return { cancelled: false, remote };
  }

  const remotes = await getRemotes(cwd);
  if (remotes.length <= 1) {
    return { cancelled: false };
  }

  const items: Array<vscode.QuickPickItem & { remote?: RemoteConfig }> = [
    ...(options.includeAll
      ? [
          {
            label: options.allLabel ?? "All remotes",
            description: "Run against every configured remote"
          }
        ]
      : []),
    ...remotes.map((candidate) => ({
      label: candidate.name,
      description: candidate.url,
      remote: candidate
    }))
  ];

  const picked = await vscode.window.showQuickPick(items, {
    title: options.title,
    placeHolder: "Choose remote"
  });
  if (!picked) {
    return { cancelled: true };
  }

  return { cancelled: false, remote: picked.remote?.name };
}

function resolveRemoteBranchName(localBranch: string, remoteBranchName?: string): string {
  return remoteBranchName ?? localBranch;
}

function formatRemoteRef(remoteName: string, remoteBranch: string): string {
  return `${remoteName}/${remoteBranch}`;
}

function pushCommand(remoteName: string, localBranch: string, remoteBranchName?: string): string[] {
  const remoteBranch = resolveRemoteBranchName(localBranch, remoteBranchName);
  if (remoteBranch === localBranch) {
    return ["push", remoteName, localBranch];
  }
  return ["push", remoteName, `${localBranch}:${remoteBranch}`];
}

function pullCheckedOutCommand(remoteName: string, remoteBranch: string): string[] {
  return ["pull", "--ff-only", remoteName, remoteBranch];
}

function pullFetchCommand(remoteName: string, localBranch: string, remoteBranchName?: string): string[] {
  const remoteBranch = resolveRemoteBranchName(localBranch, remoteBranchName);
  if (remoteBranch === localBranch) {
    return ["fetch", remoteName, `${localBranch}:${localBranch}`];
  }
  return ["fetch", remoteName, `${remoteBranch}:${localBranch}`];
}

function fetchRemoteTrackingRefCommand(remoteName: string, remoteBranch: string): string[] {
  return ["fetch", remoteName, `refs/heads/${remoteBranch}:refs/remotes/${remoteName}/${remoteBranch}`];
}

async function remoteBranchExistsOnRemote(cwd: string, remote: string, remoteBranch: string): Promise<boolean> {
  const result = await runGit(["ls-remote", "--heads", remote, remoteBranch], cwd, { timeout: 120_000 });
  return result.exitCode === 0 && result.stdout.trim().length > 0;
}

async function localRemoteTrackingRefExists(cwd: string, remote: string, remoteBranch: string): Promise<boolean> {
  const result = await runGit(["rev-parse", "--verify", `refs/remotes/${remote}/${remoteBranch}`], cwd, { timeout: 120_000 });
  return result.exitCode === 0;
}

function pushSetUpstreamCommand(remoteName: string, localBranch: string, remoteBranchName?: string): string[] {
  const remoteBranch = resolveRemoteBranchName(localBranch, remoteBranchName);
  if (remoteBranch === localBranch) {
    return ["push", "-u", remoteName, localBranch];
  }
  return ["push", "-u", remoteName, `${localBranch}:${remoteBranch}`];
}

async function executeSetUpstream(
  cwd: string,
  branchName?: string,
  remote?: string,
  remoteBranchName?: string
): Promise<ActionResult> {
  const branch = branchName || (await getCurrentBranch(cwd));
  if (branch.startsWith("DETACHED")) {
    return { success: false, message: "Cannot set upstream while in detached HEAD." };
  }

  const remotes = await getRemotes(cwd);
  const remoteChoice = await resolveRemoteChoice(cwd, remote, {
    title: "Set Upstream",
    includeAll: false
  });
  if (remoteChoice.cancelled) {
    return { success: false, message: "Set upstream cancelled." };
  }

  const chosenRemote = remoteChoice.remote ?? remotes[0]?.name;
  if (!chosenRemote) {
    return { success: false, message: "No remote configured." };
  }

  const remoteBranch = resolveRemoteBranchName(branch, remoteBranchName);
  const upstream = formatRemoteRef(chosenRemote, remoteBranch);
  const parsed = { remote: chosenRemote, branch: remoteBranch };

  const remoteRef = formatRemoteRef(parsed.remote, parsed.branch);
  const hasLocalTrackingRef = await localRemoteTrackingRefExists(cwd, parsed.remote, parsed.branch);
  if (hasLocalTrackingRef) {
    return runGuarded(
      cwd,
      `Set ${branch} to track ${upstream}?`,
      ["branch", "--set-upstream-to", upstream, branch],
      `Set upstream for ${branch}.`
    );
  }

  const existsOnRemote = await remoteBranchExistsOnRemote(cwd, parsed.remote, parsed.branch);
  if (existsOnRemote) {
    const allowed = await vscode.window.showWarningMessage(
      `${remoteRef} exists on ${parsed.remote} but is not fetched locally. Fetch it and set ${branch} to track it?`,
      { modal: true },
      "Fetch and Set Upstream"
    );
    if (allowed !== "Fetch and Set Upstream") {
      return { success: false, message: "Set upstream cancelled." };
    }

    const fetchResult = await runGit(fetchRemoteTrackingRefCommand(parsed.remote, parsed.branch), cwd, { timeout: 120_000 });
    if (fetchResult.exitCode !== 0) {
      const detail = fetchResult.timedOut ? "command timed out" : fetchResult.stderr.trim() || "git fetch failed";
      return { success: false, message: detail };
    }

    return executeGitCommand(
      cwd,
      ["branch", "--set-upstream-to", upstream, branch],
      `Set upstream for ${branch} to ${upstream}.`
    );
  }

  const allowed = await vscode.window.showWarningMessage(
    `${remoteRef} does not exist on ${parsed.remote} yet. Push ${branch} and set it as the upstream?`,
    { modal: true },
    "Push and Set Upstream"
  );
  if (allowed !== "Push and Set Upstream") {
    return { success: false, message: "Set upstream cancelled." };
  }

  return executeGitCommand(
    cwd,
    pushSetUpstreamCommand(parsed.remote, branch, parsed.branch),
    `Pushed ${branch} and set upstream to ${upstream}.`
  );
}

async function executeAddUpstream(
  cwd: string,
  branchName?: string,
  remote?: string,
  remoteBranchName?: string
): Promise<ActionResult> {
  const branch = branchName || (await getCurrentBranch(cwd));
  if (branch.startsWith("DETACHED")) {
    return { success: false, message: "Cannot add remote tracking while in detached HEAD." };
  }

  const remoteBranch = resolveRemoteBranchName(branch, remoteBranchName);
  let targetRemote = remote;
  if (targetRemote) {
    const alreadyTracked = await localRemoteTrackingRefExists(cwd, targetRemote, remoteBranch);
    if (alreadyTracked) {
      targetRemote = undefined;
    }
  }
  const remoteChoice = await resolveAddUpstreamRemoteChoice(cwd, branch, targetRemote, remoteBranch);
  if (remoteChoice.cancelled) {
    return { success: false, message: "Add remote tracking cancelled." };
  }
  if (!remoteChoice.remote) {
    return { success: true, message: `${branch} is already tracked on all configured remotes.` };
  }

  const chosenRemote = remoteChoice.remote;
  const remoteRef = formatRemoteRef(chosenRemote, remoteBranch);

  const skipRemoteProbe = vscode.workspace.getConfiguration("superGit").get<boolean>("addUpstream.skipRemoteProbe", false);
  const existsOnRemote = skipRemoteProbe
    ? false
    : await remoteBranchExistsOnRemote(cwd, chosenRemote, remoteBranch);
  if (existsOnRemote) {
    return runGuarded(
      cwd,
      `Fetch ${remoteRef} without changing the default upstream?`,
      fetchRemoteTrackingRefCommand(chosenRemote, remoteBranch),
      `Now tracking ${branch} on ${remoteRef}.`
    );
  }

  return runGuarded(
    cwd,
    `Push ${branch} to ${remoteRef} without changing the default upstream?`,
    pushCommand(chosenRemote, branch, remoteBranchName),
    `Pushed ${branch} to ${remoteRef}.`
  );
}

async function executeSetDefaultUpstream(
  cwd: string,
  branchName?: string,
  remote?: string,
  remoteBranchName?: string
): Promise<ActionResult> {
  if (!remote) {
    return { success: false, message: "Select a remote tracking row before setting the default upstream." };
  }

  const branch = branchName || (await getCurrentBranch(cwd));
  if (branch.startsWith("DETACHED")) {
    return { success: false, message: "Cannot set default upstream while in detached HEAD." };
  }

  const remoteBranch = resolveRemoteBranchName(branch, remoteBranchName);
  const upstream = formatRemoteRef(remote, remoteBranch);
  const hasLocalTrackingRef = await localRemoteTrackingRefExists(cwd, remote, remoteBranch);
  if (!hasLocalTrackingRef) {
    return { success: false, message: `Fetch or add remote tracking for ${upstream} first.` };
  }

  return runGuarded(
    cwd,
    `Set default upstream for ${branch} to ${upstream}?`,
    ["branch", "--set-upstream-to", upstream, branch],
    `Default upstream for ${branch} is now ${upstream}.`
  );
}

async function resolveAddUpstreamRemoteChoice(
  cwd: string,
  branch: string,
  remote: string | undefined,
  remoteBranch: string
): Promise<{ cancelled: boolean; remote?: string }> {
  if (remote) {
    return { cancelled: false, remote };
  }

  const remotes = await getRemotes(cwd);
  const available: RemoteConfig[] = [];
  for (const candidate of remotes) {
    const exists = await localRemoteTrackingRefExists(cwd, candidate.name, remoteBranch);
    if (!exists) {
      available.push(candidate);
    }
  }

  if (available.length === 0) {
    return { cancelled: false };
  }
  if (available.length === 1) {
    return { cancelled: false, remote: available[0].name };
  }

  const items: Array<vscode.QuickPickItem & { remote: RemoteConfig }> = available.map((candidate) => ({
    label: candidate.name,
    description: candidate.url,
    remote: candidate
  }));
  const picked = await vscode.window.showQuickPick(items, {
    title: "Add Remote Tracking",
    placeHolder: "Choose remote to track"
  });
  if (!picked) {
    return { cancelled: true };
  }

  return { cancelled: false, remote: picked.remote.name };
}

async function executeDeleteRemoteCommand(cwd: string, remote: string, remoteBranch: string): Promise<ActionResult> {
  const result = await runGit(["push", remote, "--delete", remoteBranch], cwd, { timeout: 120_000 });
  if (result.exitCode !== 0) {
    const stderr = result.stderr.trim();
    if (/refusing to delete the current branch/i.test(stderr)) {
      return {
        success: false,
        message: `Cannot delete ${remote}/${remoteBranch}: it is the default branch on ${remote}. Change the remote default branch first.`
      };
    }
    const detail = result.timedOut ? "command timed out" : stderr || "git command failed";
    return { success: false, message: detail };
  }

  const cleanup = await unsetUpstreamLinksForRemoteRef(cwd, remote, remoteBranch);
  let message = `Deleted remote branch ${remote}/${remoteBranch}.`;
  if (cleanup.unsetBranches.length > 0) {
    message += ` Cleared upstream on ${cleanup.unsetBranches.join(", ")}.`;
  }
  if (!cleanup.complete) {
    message += " Some local upstream links could not be cleared. Run Prune Stale.";
  }
  return { success: true, message };
}

async function runGuarded(cwd: string, confirmation: string, args: string[], successMessage: string): Promise<ActionResult> {
  const allowed = await vscode.window.showWarningMessage(confirmation, { modal: true }, "Run");
  if (allowed !== "Run") {
    return { success: false, message: "Action cancelled." };
  }

  return executeGitCommand(cwd, args, successMessage);
}

async function executeGitCommand(cwd: string, args: string[], successMessage: string): Promise<ActionResult> {
  const result = await runGit(args, cwd, { timeout: 120_000 });
  if (result.exitCode !== 0) {
    const detail = result.timedOut ? "command timed out" : result.stderr.trim() || "git command failed";
    return { success: false, message: detail };
  }

  return { success: true, message: successMessage };
}
