import * as vscode from "vscode";
import type { BranchAction, CommitAction, RemoteConfig } from "../shared/types";
import { getCurrentBranch, getRemotes } from "./commands";
import { runGit } from "./runner";

export interface ActionResult {
  success: boolean;
  message: string;
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
  remote?: string
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
      return runGuarded(
        cwd,
        remoteChoice.remote ? `Push ${branch} to ${remoteChoice.remote}?` : "Push the current branch?",
        remoteChoice.remote ? ["push", remoteChoice.remote, branch] : ["push"],
        remoteChoice.remote ? `Pushed ${branch} to ${remoteChoice.remote}.` : "Pushed current branch."
      );
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
      const isCheckedOut = !current.startsWith("DETACHED") && current === branch;

      if (!remoteName) {
        if (isCheckedOut) {
          return runGuarded(cwd, "Pull current branch with fast-forward only?", ["pull", "--ff-only"], "Pull completed.");
        }
        return { success: false, message: "No remote configured." };
      }

      if (isCheckedOut) {
        return runGuarded(
          cwd,
          `Pull ${remoteName}/${branch} with fast-forward only?`,
          ["pull", "--ff-only", remoteName, branch],
          "Pull completed."
        );
      }

      return runGuarded(
        cwd,
        `Fast-forward local ${branch} from ${remoteName}/${branch}?`,
        ["fetch", remoteName, `${branch}:${branch}`],
        "Pull completed."
      );
    }
    case "set-upstream": {
      const branch = branchName || (await getCurrentBranch(cwd));
      const remotes = await getRemotes(cwd);
      const defaultRemote = remote || remotes[0]?.name || "origin";
      const upstream = await vscode.window.showInputBox({
        title: "Set Upstream",
        prompt: `Remote tracking ref for ${branch}`,
        value: `${defaultRemote}/${branch}`
      });
      if (!upstream) {
        return { success: false, message: "Set upstream cancelled." };
      }
      return runGuarded(cwd, `Set ${branch} to track ${upstream}?`, ["branch", "--set-upstream-to", upstream, branch], `Set upstream for ${branch}.`);
    }
    case "delete":
      if (!branchName) {
        return { success: false, message: "Select a branch before deleting." };
      }
      return runGuarded(cwd, `Delete local branch ${branchName}?`, ["branch", "-d", branchName], `Deleted ${branchName}.`);
    case "prune-stale":
      return runGuarded(
        cwd,
        remote ? `Prune stale refs from ${remote}?` : "Prune stale refs from all remotes?",
        remote ? ["remote", "prune", remote] : ["fetch", "--all", "--prune"],
        remote ? `Pruned ${remote}.` : "Pruned all remotes."
      );
  }
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

async function runGuarded(cwd: string, confirmation: string, args: string[], successMessage: string): Promise<ActionResult> {
  const allowed = await vscode.window.showWarningMessage(confirmation, { modal: true }, "Run");
  if (allowed !== "Run") {
    return { success: false, message: "Action cancelled." };
  }

  const result = await runGit(args, cwd, { timeout: 120_000 });
  if (result.exitCode !== 0) {
    const detail = result.timedOut ? "command timed out" : result.stderr.trim() || "git command failed";
    return { success: false, message: detail };
  }

  return { success: true, message: successMessage };
}
