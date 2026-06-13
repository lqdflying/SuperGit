import * as path from "node:path";
import * as vscode from "vscode";
import { runGit } from "./runner";

export const SUPERGIT_DIFF_SCHEME = "supergit";

export interface SuperGitContentUriOptions {
  root: string;
  filePath: string;
  ref?: string;
  empty?: boolean;
  label?: string;
}

export class SuperGitDiffContentProvider implements vscode.TextDocumentContentProvider {
  async provideTextDocumentContent(uri: vscode.Uri): Promise<string> {
    const params = new URLSearchParams(uri.query);
    if (params.get("empty") === "1") {
      return "";
    }

    const root = params.get("root");
    const ref = params.get("ref");
    const filePath = params.get("path");
    if (!root || !ref || !filePath) {
      return "SuperGit could not load this diff side because the document URI is incomplete.";
    }

    const result = await runGit(["show", `${ref}:${filePath}`], root);
    if (result.exitCode !== 0) {
      const detail = result.stderr.trim() || "git show failed";
      return `SuperGit could not load ${filePath} at ${ref}.\n\n${detail}`;
    }

    return result.stdout;
  }
}

export function createSuperGitContentUri(options: SuperGitContentUriOptions): vscode.Uri {
  const params = new URLSearchParams();
  params.set("root", options.root);
  params.set("path", options.filePath);
  if (options.ref) {
    params.set("ref", options.ref);
  }
  if (options.empty) {
    params.set("empty", "1");
  }

  return vscode.Uri.from({
    scheme: SUPERGIT_DIFF_SCHEME,
    authority: "commit",
    path: `/${sanitizeUriPath(options.label ?? options.filePath)}`,
    query: params.toString()
  });
}

function sanitizeUriPath(value: string): string {
  const normalized = value.replace(/\\/g, "/").replace(/^\/+/, "");
  return normalized || path.basename(value) || "empty";
}
