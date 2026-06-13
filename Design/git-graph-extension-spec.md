# Git Graph VS Code Extension — Implementation Spec v2

> **Purpose:** Complete implementation specification for a VS Code extension that visualizes Git commit history and branch-to-remote tracking relationships. Accompanied by a design mockup (`git-graph-extension-ui-v2.jsx`) as the pixel-perfect visual reference.
>
> **For the coding model:** Follow this document as the single source of truth. Use the exact version constraints in Section 0. Read Section 13 (Test Cases) — all tests must pass before a phase is considered complete.

---

## 0. Version Constraints (MANDATORY)

These versions are non-negotiable. Using older versions will cause syntax errors or runtime failures in modern VS Code.

| Dependency | Version | Rationale |
|---|---|---|
| `engines.vscode` | `^1.100.0` | Supports VS Code 1.100+ (April 2025+), covers Cursor/Windsurf forks. VS Code 1.101 bundled Node.js 22.15.1. |
| TypeScript | `~6.0` | Latest stable. VS Code 1.114+ ships TS 6.0 support. Use `tsc` for type checking. |
| `@types/vscode` | `^1.100.0` | Matches engine minimum. |
| `@types/node` | `^22.0.0` | Matches Node.js 22.x bundled in VS Code 1.101+. |
| Node.js (dev) | `>=22.0.0` | LTS line, bundled in VS Code runtime since Electron 35. |
| React | `^18.3.0` | Webview UI framework. Bundled into webview, not shipped as VS Code dep. |
| `@types/react` | `^18.3.0` | |
| esbuild | `^0.25.0` | Bundler. VS Code itself migrated from webpack to esbuild. |

### tsconfig.json (extension host)

```jsonc
{
  "compilerOptions": {
    "target": "ES2024",
    "lib": ["ES2024"],
    "module": "NodeNext",
    "moduleResolution": "NodeNext",
    "strict": true,
    "esModuleInterop": true,
    "skipLibCheck": true,
    "forceConsistentCasingInFileNames": true,
    "outDir": "./dist",
    "rootDir": "./src",
    "declaration": true,
    "sourceMap": true,
    "resolveJsonModule": true
  },
  "include": ["src/**/*.ts"],
  "exclude": ["src/webview/**"]
}
```

### tsconfig.webview.json (webview React)

```jsonc
{
  "compilerOptions": {
    "target": "ES2022",
    "lib": ["ES2022", "DOM", "DOM.Iterable"],
    "module": "ESNext",
    "moduleResolution": "Bundler",
    "jsx": "react-jsx",
    "strict": true,
    "esModuleInterop": true,
    "skipLibCheck": true,
    "outDir": "./dist/webview",
    "rootDir": "./src/webview"
  },
  "include": ["src/webview/**/*.ts", "src/webview/**/*.tsx"]
}
```

---

## 1. Architecture Overview

### 1.1 Hybrid Approach: vscode.git API + Direct Git CLI

This extension uses a **hybrid data layer**:

- **VS Code built-in Git extension API** (`vscode.extensions.getExtension('vscode.git')`) for:
  - Git binary path discovery (reuse the binary VS Code already located)
  - Repository detection and workspace root resolution
  - Current HEAD / branch state observation
  - File system change events (repo state changes)
  - SCM view integration points

- **Direct Git CLI** (`child_process.spawn` using the discovered binary path) for:
  - `git log --format=...` with custom format strings (commit graph data)
  - `git for-each-ref` (branch tracking info)
  - `git rev-list --left-right --count` (ahead/behind per remote)
  - `git remote -v` (remote list)
  - All write operations (push, pull, fetch, checkout, cherry-pick, etc.)

**Why hybrid:** The built-in `vscode.git` API exposes `repository.log()` but it does not support custom `--format` strings, does not expose parent hashes needed for DAG rendering, and has known bugs with output parsing. However, it reliably discovers the git binary path and repository roots — reusing that avoids duplicating platform-specific binary search logic.

```
+------------------------------------------------------+
|  Extension Host (Node.js / TypeScript)                |
|                                                       |
|  vscode.git API           Git CLI (child_process)     |
|  +------------------+    +------------------------+   |
|  | - git binary path|    | - git log --format=... |   |
|  | - repo discovery |--->| - git for-each-ref     |   |
|  | - HEAD state     |    | - git rev-list         |   |
|  | - change events  |    | - git remote -v        |   |
|  +------------------+    | - git push/pull/fetch  |   |
|                          +------------------------+   |
|                                  |                    |
+----------------------------------+--------------------+
                                   | postMessage
                    +--------------+---------------+
                    |    Webview (React 18 SPA)     |
                    |    - Commit Graph tab         |
                    |    - Branch Tracking tab      |
                    |    - All UI rendering         |
                    +------------------------------+
```

### 1.2 Technology Stack

| Layer | Technology | Version |
|---|---|---|
| Extension Host | TypeScript 6.0, Node.js 22.x | ES2024 target |
| Git Integration | Hybrid: vscode.git API + child_process.spawn | |
| Webview | React 18.3, functional components, hooks | ES2022 target |
| Graph Render | Inline SVG (no external charting library) | |
| Bundler | esbuild | ^0.25.0 |
| Test Framework | Vitest (unit) + @vscode/test-electron (integration) | |
| State | React useState/useMemo only (no Redux/Zustand) | |

### 1.3 File Structure

```
git-graph-extension/
  package.json
  tsconfig.json                 # Extension host config
  tsconfig.webview.json         # Webview React config
  esbuild.mjs                  # Build script (ESM)
  src/
    extension.ts               # activate(), register commands, create webview
    git/
      api.ts                   # vscode.git API wrapper (binary path, repo discovery)
      runner.ts                # Spawns git CLI using discovered binary path
      parser.ts                # Parses git stdout into typed data structures
      commands.ts              # High-level: getCommits(), getBranches(), getRemotes()
    webview/
      main.tsx                 # React entry, postMessage listener
      App.tsx                  # Root component (tab switching, layout)
      components/
        TitleBar.tsx
        TabBar.tsx
        StatusBar.tsx
        graph/
          DateRangeBar.tsx
          BranchSidebar.tsx
          GraphCanvas.tsx      # SVG DAG renderer
          CommitList.tsx
          CommitDetail.tsx
          Pagination.tsx
        tracking/
          RemoteLegendBar.tsx
          TrackingDiagram.tsx   # Three-column SVG layout with fan-out arrows
          TrackingLegend.tsx
          QuickActions.tsx
      tokens.ts                # Color, font, spacing constants
      icons.tsx                # SVG icon components (inline, no library)
      types.ts                 # Shared TypeScript interfaces
    test/
      unit/
        parser.test.ts         # Git output parsing tests
        commands.test.ts       # High-level command tests (mocked runner)
        runner.test.ts         # Git CLI spawn tests (mocked child_process)
        api.test.ts            # vscode.git API wrapper tests
      integration/
        extension.test.ts      # Full extension activation test
        webview.test.ts        # Webview message protocol test
      fixtures/
        git-log-output.txt     # Sample git log raw output
        git-branches-output.txt
        git-remotes-output.txt
        merge-commit-output.txt
        empty-repo-output.txt
  media/
    styles.css                 # Webview base styles (dark theme reset)
```

---

## 2. Data Contracts (TypeScript)

```typescript
// ── types.ts ──

// === Commit Data ===

export interface CommitNode {
  hash: string;          // Full SHA (40 chars)
  hashShort: string;     // First 7 chars
  message: string;       // First line of commit message
  author: string;        // Author name
  authorEmail: string;   // Author email
  date: string;          // ISO 8601 (e.g. "2026-06-13T14:22:00+08:00")
  branch: string;        // Branch this commit belongs to (derived from topology)
  branchIndex: number;   // Swimlane column index (0-based, max 5 visible lanes)
  parents: string[];     // Parent commit hashes (1 = normal, 2+ = merge)
  refs: string[];        // Refs pointing here: "HEAD", "main", "origin/main"
  tags: string[];        // Tag names: "v2.3.0"
  isMerge: boolean;      // parents.length > 1
}

// === Branch Data ===

export interface BranchInfo {
  name: string;
  color: string;
  isCurrent: boolean;
  remotes: RemoteTracking[];
}

export interface RemoteTracking {
  remote: string;       // "origin", "upstream", "backup"
  ref: string;          // "origin/main"
  ahead: number;
  behind: number;
}

// === Remote Data ===

export interface RemoteConfig {
  name: string;
  url: string;
  color: string;        // Assigned from color pool
}

// === Filter/Pagination ===

export interface DateRange {
  mode: "preset" | "custom";
  presetDays: 7 | 14 | 30 | null;   // null = "All"
  customFrom?: string;               // "YYYY-MM-DD"
  customTo?: string;                 // "YYYY-MM-DD"
}

export interface PaginationState {
  enabled: boolean;
  page: number;          // 0-based
  pageSize: number;      // Fixed at 8
  totalItems: number;
  totalPages: number;
}

// === Message Protocol ===

export type WebviewMessage =
  | { type: "request-commits"; dateRange: DateRange; page: number; searchText: string }
  | { type: "request-branches" }
  | { type: "request-remotes" }
  | { type: "execute-action"; action: CommitAction; commitHash: string }
  | { type: "execute-branch-action"; action: BranchAction; branchName: string; remote?: string };

export type ExtHostMessage =
  | { type: "commits-data"; commits: CommitNode[]; pagination: PaginationState }
  | { type: "branches-data"; branches: BranchInfo[] }
  | { type: "remotes-data"; remotes: RemoteConfig[] }
  | { type: "action-result"; success: boolean; message: string }
  | { type: "repo-changed" }
  | { type: "loading"; loading: boolean };

export type CommitAction =
  | "checkout" | "cherry-pick" | "revert"
  | "create-branch" | "create-tag" | "copy-hash";

export type BranchAction =
  | "push" | "pull" | "fetch"
  | "set-upstream" | "delete" | "prune-stale";
```

---

## 3. Visual Design Tokens

(unchanged from v1 — refer to Section 3 of the mockup's color system)

```typescript
// ── tokens.ts ──

export const colors = {
  bg0: "#1e1e1e", bg1: "#252526", bg2: "#2d2d2d", bg3: "#333333", bg4: "#3c3c3c",
  border: "#3c3c3c",
  fg: "#cccccc", fgDim: "#858585", fgBright: "#e0e0e0",
  accent: "#0078d4", accentHover: "#1a8ad4",
  branch: ["#4fc1ff", "#c586c0", "#dcdcaa", "#6a9955", "#ce9178", "#9cdcfe"],
  ahead: "#73c991", behind: "#f48771", upToDate: "#4fc1ff", untracked: "#858585",
  remoteColorPool: ["#569cd6", "#c586c0", "#6a9955", "#ce9178", "#dcdcaa"],
  selection: "rgba(0,120,212,0.15)", hover: "rgba(255,255,255,0.04)",
  tagBg: "#b5890033", tagFg: "#e2c08d",
};

export const typography = {
  fontFamily: "'Segoe UI', -apple-system, system-ui, sans-serif",
  monoFamily: "'JetBrains Mono', 'Cascadia Code', 'Fira Code', 'Consolas', monospace",
  xs: 9, sm: 10, md: 11, base: 12, lg: 13, xl: 14,
};

export const graph = {
  laneWidth: 28, rowHeight: 42, nodeRadius: 5, mergeSize: 12,
};
```

---

## 4. Component Hierarchy and Props

(unchanged from v1 — refer to original spec Section 4)

---

## 5. Behavior Specification

(unchanged from v1 — refer to original spec Section 5)

---

## 6. Data Layer (Extension Host) — HYBRID APPROACH

### 6.1 Git Binary Discovery via vscode.git API

```typescript
// ── src/git/api.ts ──

import * as vscode from "vscode";

interface GitAPI {
  repositories: Array<{
    rootUri: vscode.Uri;
    state: { HEAD?: { name?: string; commit?: string } };
  }>;
}

export async function getGitBinaryPath(): Promise<string> {
  const gitExt = vscode.extensions.getExtension("vscode.git");
  if (!gitExt) {
    throw new Error("Built-in Git extension not found.");
  }
  if (!gitExt.isActive) {
    await gitExt.activate();
  }
  const api = gitExt.exports.getAPI(1);
  // The vscode.git extension exposes its git.path through configuration
  const configPath = vscode.workspace
    .getConfiguration("git")
    .get<string>("path");
  // Fallback: use "git" and let PATH resolve it
  return configPath || "git";
}

export async function getRepositoryRoots(): Promise<string[]> {
  const gitExt = vscode.extensions.getExtension("vscode.git");
  if (!gitExt?.isActive) {
    await gitExt?.activate();
  }
  const api = gitExt?.exports.getAPI(1) as GitAPI | undefined;
  if (!api) return [];
  return api.repositories.map((r) => r.rootUri.fsPath);
}

export function onRepositoryChange(
  callback: () => void
): vscode.Disposable {
  const gitExt = vscode.extensions.getExtension("vscode.git");
  const api = gitExt?.exports?.getAPI(1);
  if (api) {
    return api.onDidChangeState(() => callback());
  }
  // Fallback: watch .git directory
  const watcher = vscode.workspace.createFileSystemWatcher("**/.git/**");
  const disposables = [
    watcher.onDidChange(() => callback()),
    watcher.onDidCreate(() => callback()),
    watcher.onDidDelete(() => callback()),
    watcher,
  ];
  return vscode.Disposable.from(...disposables);
}
```

### 6.2 Git CLI Runner

```typescript
// ── src/git/runner.ts ──

import { spawn } from "node:child_process";
import { getGitBinaryPath } from "./api.js";

export interface GitResult {
  stdout: string;
  stderr: string;
  exitCode: number;
}

let cachedBinaryPath: string | null = null;

async function getBinary(): Promise<string> {
  if (!cachedBinaryPath) {
    cachedBinaryPath = await getGitBinaryPath();
  }
  return cachedBinaryPath;
}

export async function runGit(
  args: string[],
  cwd: string,
  options?: { timeout?: number }
): Promise<GitResult> {
  const gitPath = await getBinary();
  return new Promise((resolve, reject) => {
    const proc = spawn(gitPath, args, {
      cwd,
      timeout: options?.timeout ?? 30_000,
      env: { ...process.env, GIT_TERMINAL_PROMPT: "0" },
    });

    const stdout: Buffer[] = [];
    const stderr: Buffer[] = [];

    proc.stdout.on("data", (chunk: Buffer) => stdout.push(chunk));
    proc.stderr.on("data", (chunk: Buffer) => stderr.push(chunk));

    proc.on("close", (code) => {
      resolve({
        stdout: Buffer.concat(stdout).toString("utf-8"),
        stderr: Buffer.concat(stderr).toString("utf-8"),
        exitCode: code ?? 1,
      });
    });

    proc.on("error", (err) => {
      reject(new Error(`Failed to spawn git: ${err.message}`));
    });
  });
}
```

### 6.3 Git Commands (high-level)

```typescript
// ── src/git/commands.ts ──

import { runGit } from "./runner.js";
import { parseCommits, parseBranches, parseRemotes } from "./parser.js";
import type { CommitNode, BranchInfo, RemoteConfig, DateRange } from "../webview/types.js";

// Delimiter for multi-field format (ASCII record separator)
const SEP = "\x1e";
const FORMAT = ["%H", "%h", "%s", "%an", "%ae", "%aI", "%P", "%D"].join(SEP);

export async function getCommits(
  cwd: string,
  dateRange: DateRange,
  page: number,
  pageSize: number
): Promise<{ commits: CommitNode[]; total: number }> {
  const args = ["log", "--all", "--date-order", `--format=${FORMAT}`];

  if (dateRange.mode === "preset" && dateRange.presetDays !== null) {
    const since = new Date();
    since.setDate(since.getDate() - dateRange.presetDays);
    args.push(`--after=${since.toISOString()}`);
  } else if (dateRange.mode === "custom" && dateRange.customFrom && dateRange.customTo) {
    args.push(`--after=${dateRange.customFrom}T00:00:00`);
    args.push(`--before=${dateRange.customTo}T23:59:59`);
  }

  // For "All" mode: paginate server-side
  if (dateRange.presetDays === null && dateRange.mode === "preset") {
    args.push(`--skip=${page * pageSize}`, `-n`, `${pageSize}`);
  }

  const result = await runGit(args, cwd);
  if (result.exitCode !== 0) {
    throw new Error(`git log failed: ${result.stderr}`);
  }

  const commits = parseCommits(result.stdout);

  // Get total count for pagination
  const countArgs = ["rev-list", "--all", "--count"];
  if (dateRange.mode === "preset" && dateRange.presetDays !== null) {
    const since = new Date();
    since.setDate(since.getDate() - dateRange.presetDays);
    countArgs.push(`--after=${since.toISOString()}`);
  }
  const countResult = await runGit(countArgs, cwd);
  const total = parseInt(countResult.stdout.trim(), 10) || 0;

  return { commits, total };
}

export async function getBranches(cwd: string): Promise<BranchInfo[]> {
  // Get local branches
  const branchResult = await runGit(
    ["for-each-ref", "--format=%(refname:short)\t%(upstream:short)\t%(upstream:remotename)", "refs/heads/"],
    cwd
  );

  // Get all remote refs for multi-remote matching
  const remoteRefResult = await runGit(
    ["for-each-ref", "--format=%(refname:short)", "refs/remotes/"],
    cwd
  );

  // Get remotes list for color assignment
  const remotes = await getRemotes(cwd);

  return parseBranches(branchResult.stdout, remoteRefResult.stdout, remotes, cwd);
}

export async function getRemotes(cwd: string): Promise<RemoteConfig[]> {
  const result = await runGit(["remote", "-v"], cwd);
  return parseRemotes(result.stdout);
}

export async function getAheadBehind(
  cwd: string,
  localBranch: string,
  remoteBranch: string
): Promise<{ ahead: number; behind: number }> {
  const result = await runGit(
    ["rev-list", "--left-right", "--count", `${localBranch}...${remoteBranch}`],
    cwd
  );
  if (result.exitCode !== 0) return { ahead: 0, behind: 0 };
  const [ahead, behind] = result.stdout.trim().split(/\s+/).map(Number);
  return { ahead: ahead || 0, behind: behind || 0 };
}
```

### 6.4 Parser

```typescript
// ── src/git/parser.ts ──

import type { CommitNode, RemoteConfig } from "../webview/types.js";
import { getAheadBehind } from "./commands.js";
import { colors } from "../webview/tokens.js";

const SEP = "\x1e";

export function parseCommits(raw: string): CommitNode[] {
  const lines = raw.trim().split("\n").filter(Boolean);
  const commits: CommitNode[] = [];

  for (const line of lines) {
    const parts = line.split(SEP);
    if (parts.length < 8) continue;

    const [hash, hashShort, message, author, authorEmail, date, parentsRaw, refsRaw] = parts;
    const parents = parentsRaw.trim() ? parentsRaw.trim().split(" ") : [];
    const refsAll = refsRaw.trim()
      ? refsRaw.split(",").map((r) => r.trim().replace("HEAD -> ", "HEAD\0")).flatMap((r) => {
          if (r.includes("\0")) return ["HEAD", r.replace("HEAD\0", "").trim()].filter(Boolean);
          return [r.replace("tag: ", "")];
        })
      : [];

    const tags = refsAll.filter((r) => refsRaw.includes(`tag: ${r}`));
    const refs = refsAll.filter((r) => !tags.includes(r) || r === "HEAD");

    commits.push({
      hash, hashShort, message, author, authorEmail, date,
      parents, refs, tags,
      branch: "",       // Assigned by lane algorithm
      branchIndex: 0,   // Assigned by lane algorithm
      isMerge: parents.length > 1,
    });
  }

  assignLanes(commits);
  return commits;
}

function assignLanes(commits: CommitNode[]): void {
  const branchLane = new Map<string, number>();
  let nextLane = 0;

  for (const commit of commits) {
    // Determine branch from refs
    const branchRef = commit.refs.find(
      (r) => r !== "HEAD" && !r.startsWith("origin/") && !r.startsWith("upstream/") && !r.startsWith("backup/")
    );
    const branch = branchRef || commit.branch || "main";
    commit.branch = branch;

    if (!branchLane.has(branch)) {
      branchLane.set(branch, nextLane % 6);
      nextLane++;
    }
    commit.branchIndex = branchLane.get(branch)!;
  }
}

export function parseRemotes(raw: string): RemoteConfig[] {
  const seen = new Set<string>();
  const remotes: RemoteConfig[] = [];

  for (const line of raw.trim().split("\n")) {
    const match = line.match(/^(\S+)\s+(\S+)\s+\(fetch\)$/);
    if (match && !seen.has(match[1])) {
      seen.add(match[1]);
      remotes.push({
        name: match[1],
        url: match[2],
        color: colors.remoteColorPool[remotes.length % colors.remoteColorPool.length],
      });
    }
  }
  return remotes;
}
```

---

## 7. State Management

(unchanged from v1 — React useState at App level)

---

## 8. Edge Cases and Error States

(unchanged from v1)

---

## 9. Extension Manifest

```jsonc
{
  "name": "git-graph-pro",
  "displayName": "Git Graph Pro",
  "description": "Visual Git commit history and branch tracking with multi-remote support",
  "version": "0.1.0",
  "engines": {
    "vscode": "^1.100.0"
  },
  "categories": ["SCM Providers", "Visualization"],
  "activationEvents": ["workspaceContains:.git"],
  "main": "./dist/extension.js",
  "extensionDependencies": ["vscode.git"],
  "contributes": {
    "commands": [
      {
        "command": "gitGraphPro.show",
        "title": "Git Graph Pro: Show Graph",
        "icon": "$(git-commit)"
      }
    ],
    "menus": {
      "scm/title": [
        { "command": "gitGraphPro.show", "group": "navigation" }
      ]
    }
  },
  "scripts": {
    "build": "node esbuild.mjs",
    "watch": "node esbuild.mjs --watch",
    "test": "vitest run",
    "test:integration": "vscode-test",
    "lint": "eslint src/",
    "package": "vsce package"
  },
  "devDependencies": {
    "@types/node": "^22.0.0",
    "@types/react": "^18.3.0",
    "@types/react-dom": "^18.3.0",
    "@types/vscode": "^1.100.0",
    "@vscode/test-electron": "^2.5.0",
    "@vscode/vsce": "^3.0.0",
    "esbuild": "^0.25.0",
    "react": "^18.3.0",
    "react-dom": "^18.3.0",
    "typescript": "~6.0",
    "vitest": "^3.0.0"
  }
}
```

---

## 10. Icon Reference

(unchanged from v1 — all inline SVG, viewBox 0 0 16 16, stroke-based)

---

## 11. Implementation Priorities

1. **Phase 1 — Scaffold + Hybrid Git Layer:** Extension host with webview panel. vscode.git API integration for binary discovery. Git CLI runner with spawn. PostMessage bridge. Static mock data in React. Verify webview loads and round-trips a message.

2. **Phase 2 — Commit Graph (static):** GraphCanvas SVG, CommitList, ColumnHeaders, CommitDetail. Hardcoded commits. Pixel-perfect layout against mockup.

3. **Phase 3 — Live Git Data:** Wire parser.ts to real git log output. Replace mock data. Lane assignment algorithm. Verify with a real repository.

4. **Phase 4 — Date Range + Pagination:** DateRangeBar sends request-commits with date args. Server-side pagination (--skip/-n). Pagination bar.

5. **Phase 5 — Branch Tracking:** Multi-remote detection. TrackingDiagram SVG with fan-out bezier arrows. Wire to git for-each-ref + git rev-list.

6. **Phase 6 — Actions:** Detail panel actions wired to git commands. Error handling + vscode.window toast feedback.

7. **Phase 7 — Polish:** File system watcher for auto-refresh. Loading states. Search. Edge case handling. All tests green.

---

## 12. Visual Reference

The file `git-graph-extension-ui-v2.jsx` is the pixel-perfect visual target.

- **DO** replicate exact layout, colors, typography.
- **DO** reuse SVG icon definitions from the mockup.
- **DO** split the monolithic mockup into the file structure in Section 1.3.
- **DO NOT** keep hardcoded data arrays. Replace with live data via postMessage.
- **DO NOT** use external icon libraries. Inline SVGs from mockup are the icon set.
- **DO NOT** use canvas or WebGL. Inline SVG with bezier curves is intentional.

---

## 13. Test Cases

### 13.1 Test Infrastructure

```
Framework: vitest (unit tests), @vscode/test-electron (integration tests)
Coverage target: 80%+ for src/git/*.ts
Mocking: vitest mock for child_process.spawn, vscode API
Fixtures: raw git command output files in src/test/fixtures/
```

### 13.2 Unit Tests — Parser (`src/test/unit/parser.test.ts`)

```typescript
import { describe, it, expect } from "vitest";
import { parseCommits, parseRemotes } from "../../git/parser.js";

describe("parseCommits", () => {
  it("should parse a single normal commit", () => {
    const raw = [
      "a1b2c3d4e5f6a7b8c9d0e1f2a3b4c5d6e7f8a9b0",
      "a1b2c3d",
      "fix: resolve db timeout",
      "liuqd",
      "liuqd@example.com",
      "2026-06-13T14:22:00+08:00",
      "e5f6a7b8c9d0e1f2a3b4c5d6e7f8a9b0a1b2c3d4",
      "HEAD -> hotfix/db-timeout",
    ].join("\x1e");

    const commits = parseCommits(raw);
    expect(commits).toHaveLength(1);
    expect(commits[0].hash).toBe("a1b2c3d4e5f6a7b8c9d0e1f2a3b4c5d6e7f8a9b0");
    expect(commits[0].hashShort).toBe("a1b2c3d");
    expect(commits[0].message).toBe("fix: resolve db timeout");
    expect(commits[0].author).toBe("liuqd");
    expect(commits[0].isMerge).toBe(false);
    expect(commits[0].parents).toHaveLength(1);
    expect(commits[0].refs).toContain("HEAD");
    expect(commits[0].refs).toContain("hotfix/db-timeout");
  });

  it("should parse a merge commit with two parents", () => {
    const raw = [
      "b7c8d9e0f1a2b3c4d5e6f7a8b9c0d1e2f3a4b5c6",
      "b7c8d9e",
      "Merge pull request #142 from release/v2.3",
      "liuqd",
      "liuqd@example.com",
      "2026-06-11T09:00:00+08:00",
      "h3i4j5k6l7m8n9o0p1q2r3s4t5u6v7w8x9y0z1a2 a9b8c7d6e5f4a3b2c1d0e9f8a7b6c5d4e3f2a1b0",
      "main, origin/main, tag: v2.3.0",
    ].join("\x1e");

    const commits = parseCommits(raw);
    expect(commits[0].isMerge).toBe(true);
    expect(commits[0].parents).toHaveLength(2);
    expect(commits[0].tags).toContain("v2.3.0");
    expect(commits[0].refs).toContain("main");
    expect(commits[0].refs).toContain("origin/main");
  });

  it("should handle commit with no refs or tags", () => {
    const raw = [
      "j6k7l8m9n0o1p2q3r4s5t6u7v8w9x0y1z2a3b4c5",
      "j6k7l8m",
      "fix: Terraform state lock race condition",
      "dylan",
      "dylan@example.com",
      "2026-06-10T14:30:00+08:00",
      "k9l0m1n2o3p4q5r6s7t8u9v0w1x2y3z4a5b6c7d8",
      "",
    ].join("\x1e");

    const commits = parseCommits(raw);
    expect(commits[0].refs).toHaveLength(0);
    expect(commits[0].tags).toHaveLength(0);
  });

  it("should handle empty input", () => {
    const commits = parseCommits("");
    expect(commits).toHaveLength(0);
  });

  it("should handle malformed lines gracefully", () => {
    const raw = "not-enough-separators\x1eshort";
    const commits = parseCommits(raw);
    expect(commits).toHaveLength(0);
  });

  it("should assign lane indices to commits", () => {
    const raw = [
      ["aaa", "aaa", "msg1", "a", "a@e", "2026-06-13T00:00:00Z", "", "main"].join("\x1e"),
      ["bbb", "bbb", "msg2", "b", "b@e", "2026-06-12T00:00:00Z", "", "feature/x"].join("\x1e"),
      ["ccc", "ccc", "msg3", "c", "c@e", "2026-06-11T00:00:00Z", "", "main"].join("\x1e"),
    ].join("\n");

    const commits = parseCommits(raw);
    // "main" gets lane 0, "feature/x" gets lane 1
    expect(commits[0].branchIndex).toBe(0);
    expect(commits[1].branchIndex).toBe(1);
    expect(commits[2].branchIndex).toBe(0); // same branch as commit 0
  });

  it("should cycle lane index after 6 branches", () => {
    const branches = ["a", "b", "c", "d", "e", "f", "g"];
    const raw = branches
      .map((name, i) => [
        `hash${i}`, `h${i}`, `msg${i}`, "dev", "d@e", "2026-06-13T00:00:00Z", "", name
      ].join("\x1e"))
      .join("\n");

    const commits = parseCommits(raw);
    expect(commits[6].branchIndex).toBe(0); // 7th branch cycles to lane 0
  });
});

describe("parseRemotes", () => {
  it("should parse standard git remote -v output", () => {
    const raw = [
      "origin\tgit@github.com:pil-cloudops/infra-core.git (fetch)",
      "origin\tgit@github.com:pil-cloudops/infra-core.git (push)",
      "upstream\tgit@github.com:pil-platform/infra-core.git (fetch)",
      "upstream\tgit@github.com:pil-platform/infra-core.git (push)",
    ].join("\n");

    const remotes = parseRemotes(raw);
    expect(remotes).toHaveLength(2);
    expect(remotes[0].name).toBe("origin");
    expect(remotes[0].url).toBe("git@github.com:pil-cloudops/infra-core.git");
    expect(remotes[1].name).toBe("upstream");
  });

  it("should deduplicate fetch/push entries", () => {
    const raw = [
      "origin\thttps://github.com/org/repo.git (fetch)",
      "origin\thttps://github.com/org/repo.git (push)",
    ].join("\n");

    const remotes = parseRemotes(raw);
    expect(remotes).toHaveLength(1);
  });

  it("should handle empty remote output", () => {
    const remotes = parseRemotes("");
    expect(remotes).toHaveLength(0);
  });

  it("should assign colors from pool", () => {
    const raw = [
      "origin\turl1 (fetch)",
      "upstream\turl2 (fetch)",
      "backup\turl3 (fetch)",
    ].join("\n");

    const remotes = parseRemotes(raw);
    expect(remotes[0].color).toBeDefined();
    expect(remotes[1].color).toBeDefined();
    expect(remotes[0].color).not.toBe(remotes[1].color);
  });
});
```

### 13.3 Unit Tests — Runner (`src/test/unit/runner.test.ts`)

```typescript
import { describe, it, expect, vi, beforeEach } from "vitest";
import { runGit } from "../../git/runner.js";

// Mock child_process
vi.mock("node:child_process", () => {
  const { EventEmitter } = require("node:events");
  const { Readable } = require("node:stream");

  return {
    spawn: vi.fn(() => {
      const proc = new EventEmitter();
      proc.stdout = new Readable({ read() {} });
      proc.stderr = new Readable({ read() {} });
      // Simulate successful git output
      setTimeout(() => {
        proc.stdout.push("mock output\n");
        proc.stdout.push(null);
        proc.stderr.push(null);
        proc.emit("close", 0);
      }, 10);
      return proc;
    }),
  };
});

// Mock api.ts to return "git"
vi.mock("../../git/api.js", () => ({
  getGitBinaryPath: vi.fn().mockResolvedValue("git"),
}));

describe("runGit", () => {
  it("should resolve with stdout and exit code 0", async () => {
    const result = await runGit(["log", "--oneline"], "/tmp/repo");
    expect(result.exitCode).toBe(0);
    expect(result.stdout).toContain("mock output");
  });

  it("should pass cwd to spawn", async () => {
    const { spawn } = await import("node:child_process");
    await runGit(["status"], "/my/repo");
    expect(spawn).toHaveBeenCalledWith(
      "git",
      ["status"],
      expect.objectContaining({ cwd: "/my/repo" })
    );
  });

  it("should set GIT_TERMINAL_PROMPT=0", async () => {
    const { spawn } = await import("node:child_process");
    await runGit(["fetch"], "/tmp/repo");
    expect(spawn).toHaveBeenCalledWith(
      "git",
      ["fetch"],
      expect.objectContaining({
        env: expect.objectContaining({ GIT_TERMINAL_PROMPT: "0" }),
      })
    );
  });
});
```

### 13.4 Unit Tests — Commands (`src/test/unit/commands.test.ts`)

```typescript
import { describe, it, expect, vi, beforeEach } from "vitest";

// Mock runner
vi.mock("../../git/runner.js", () => ({
  runGit: vi.fn(),
}));

import { getCommits, getRemotes, getAheadBehind } from "../../git/commands.js";
import { runGit } from "../../git/runner.js";

const mockedRunGit = vi.mocked(runGit);

describe("getCommits", () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it("should pass --after flag for preset 7-day range", async () => {
    mockedRunGit.mockResolvedValue({ stdout: "", stderr: "", exitCode: 0 });

    await getCommits("/repo", { mode: "preset", presetDays: 7 }, 0, 8);

    const logCall = mockedRunGit.mock.calls[0];
    expect(logCall[0]).toContain("--all");
    expect(logCall[0].some((a: string) => a.startsWith("--after="))).toBe(true);
  });

  it("should pass --skip and -n for 'All' mode pagination", async () => {
    mockedRunGit.mockResolvedValue({ stdout: "", stderr: "", exitCode: 0 });

    await getCommits("/repo", { mode: "preset", presetDays: null }, 2, 8);

    const logCall = mockedRunGit.mock.calls[0];
    expect(logCall[0]).toContain("--skip=16");
    expect(logCall[0]).toContain("-n");
    expect(logCall[0]).toContain("8");
  });

  it("should pass --after and --before for custom range", async () => {
    mockedRunGit.mockResolvedValue({ stdout: "", stderr: "", exitCode: 0 });

    await getCommits(
      "/repo",
      { mode: "custom", presetDays: null, customFrom: "2026-06-01", customTo: "2026-06-10" },
      0, 8
    );

    const logCall = mockedRunGit.mock.calls[0];
    expect(logCall[0].some((a: string) => a.includes("2026-06-01"))).toBe(true);
    expect(logCall[0].some((a: string) => a.includes("2026-06-10"))).toBe(true);
  });

  it("should throw on non-zero exit code", async () => {
    mockedRunGit.mockResolvedValue({
      stdout: "", stderr: "fatal: not a git repository", exitCode: 128,
    });

    await expect(
      getCommits("/repo", { mode: "preset", presetDays: 7 }, 0, 8)
    ).rejects.toThrow("git log failed");
  });
});

describe("getAheadBehind", () => {
  it("should parse ahead/behind counts", async () => {
    mockedRunGit.mockResolvedValue({ stdout: "3\t1\n", stderr: "", exitCode: 0 });

    const result = await getAheadBehind("/repo", "main", "origin/main");
    expect(result.ahead).toBe(3);
    expect(result.behind).toBe(1);
  });

  it("should return 0/0 on error", async () => {
    mockedRunGit.mockResolvedValue({ stdout: "", stderr: "error", exitCode: 1 });

    const result = await getAheadBehind("/repo", "main", "origin/main");
    expect(result.ahead).toBe(0);
    expect(result.behind).toBe(0);
  });

  it("should handle synced branch (0 0)", async () => {
    mockedRunGit.mockResolvedValue({ stdout: "0\t0\n", stderr: "", exitCode: 0 });

    const result = await getAheadBehind("/repo", "main", "origin/main");
    expect(result.ahead).toBe(0);
    expect(result.behind).toBe(0);
  });
});

describe("getRemotes", () => {
  it("should parse remote list", async () => {
    mockedRunGit.mockResolvedValue({
      stdout: "origin\tgit@github.com:org/repo.git (fetch)\norigin\tgit@github.com:org/repo.git (push)\n",
      stderr: "", exitCode: 0,
    });

    const remotes = await getRemotes("/repo");
    expect(remotes).toHaveLength(1);
    expect(remotes[0].name).toBe("origin");
  });
});
```

### 13.5 Unit Tests — vscode.git API wrapper (`src/test/unit/api.test.ts`)

```typescript
import { describe, it, expect, vi } from "vitest";

// Mock vscode module
vi.mock("vscode", () => ({
  extensions: {
    getExtension: vi.fn(),
  },
  workspace: {
    getConfiguration: vi.fn(() => ({
      get: vi.fn(() => undefined),
    })),
    createFileSystemWatcher: vi.fn(() => ({
      onDidChange: vi.fn(() => ({ dispose: vi.fn() })),
      onDidCreate: vi.fn(() => ({ dispose: vi.fn() })),
      onDidDelete: vi.fn(() => ({ dispose: vi.fn() })),
      dispose: vi.fn(),
    })),
  },
  Disposable: { from: vi.fn() },
}));

import { getGitBinaryPath, getRepositoryRoots } from "../../git/api.js";
import * as vscode from "vscode";

describe("getGitBinaryPath", () => {
  it("should return 'git' when no custom path configured", async () => {
    vi.mocked(vscode.extensions.getExtension).mockReturnValue({
      isActive: true,
      activate: vi.fn(),
      exports: { getAPI: vi.fn(() => ({})) },
    } as any);

    const path = await getGitBinaryPath();
    expect(path).toBe("git");
  });

  it("should throw when git extension not found", async () => {
    vi.mocked(vscode.extensions.getExtension).mockReturnValue(undefined);

    await expect(getGitBinaryPath()).rejects.toThrow("Built-in Git extension not found");
  });

  it("should activate extension if not active", async () => {
    const activateFn = vi.fn();
    vi.mocked(vscode.extensions.getExtension).mockReturnValue({
      isActive: false,
      activate: activateFn,
      exports: { getAPI: vi.fn(() => ({})) },
    } as any);

    await getGitBinaryPath();
    expect(activateFn).toHaveBeenCalled();
  });
});

describe("getRepositoryRoots", () => {
  it("should return repository paths from git API", async () => {
    vi.mocked(vscode.extensions.getExtension).mockReturnValue({
      isActive: true,
      exports: {
        getAPI: vi.fn(() => ({
          repositories: [
            { rootUri: { fsPath: "/home/user/repo1" } },
            { rootUri: { fsPath: "/home/user/repo2" } },
          ],
        })),
      },
    } as any);

    const roots = await getRepositoryRoots();
    expect(roots).toEqual(["/home/user/repo1", "/home/user/repo2"]);
  });

  it("should return empty array when no repositories", async () => {
    vi.mocked(vscode.extensions.getExtension).mockReturnValue({
      isActive: true,
      exports: { getAPI: vi.fn(() => ({ repositories: [] })) },
    } as any);

    const roots = await getRepositoryRoots();
    expect(roots).toHaveLength(0);
  });
});
```

### 13.6 Integration Tests — Extension (`src/test/integration/extension.test.ts`)

```typescript
// These run with @vscode/test-electron in a real VS Code instance

import * as assert from "node:assert";
import * as vscode from "vscode";

suite("Extension Integration", () => {
  test("Extension should activate", async () => {
    const ext = vscode.extensions.getExtension("git-graph-pro.git-graph-pro");
    assert.ok(ext, "Extension not found");
    await ext.activate();
    assert.strictEqual(ext.isActive, true);
  });

  test("Command should be registered", async () => {
    const commands = await vscode.commands.getCommands(true);
    assert.ok(commands.includes("gitGraphPro.show"));
  });

  test("Command should open webview panel", async () => {
    await vscode.commands.executeCommand("gitGraphPro.show");
    // Allow webview to render
    await new Promise((resolve) => setTimeout(resolve, 1000));
    // Verify a webview panel exists (check active editor is webview type)
    // Note: exact assertion depends on panel registration
  });
});
```

### 13.7 Integration Tests — Message Protocol (`src/test/integration/webview.test.ts`)

```typescript
import * as assert from "node:assert";
import * as vscode from "vscode";

suite("Webview Message Protocol", () => {
  let panel: vscode.WebviewPanel;

  suiteSetup(async () => {
    await vscode.commands.executeCommand("gitGraphPro.show");
    await new Promise((resolve) => setTimeout(resolve, 2000));
  });

  test("Webview should respond to request-commits", async () => {
    // This test verifies the round-trip:
    // 1. Webview sends request-commits
    // 2. Extension host runs git log
    // 3. Extension host sends commits-data back
    // Implementation depends on test harness exposing the panel
  });
});
```

### 13.8 Test Fixture Files

Create these fixture files with realistic git output:

**`src/test/fixtures/git-log-output.txt`**
```
a1b2c3d4e5f6a7b8c9d0e1f2a3b4c5d6e7f8a9b0a1b2c3dfix: resolve db timeoutliuqdliuqd@example.com2026-06-13T14:22:00+08:00e5f6a7b8c9d0e1f2a3b4c5d6e7f8a9b0a1b2c3d4HEAD -> hotfix/db-timeout
e5f6a7b8c9d0e1f2a3b4c5d6e7f8a9b0a1b2c3d4e5f6a7bfeat: add OAuth2 PKCE flowliuqdliuqd@example.com2026-06-13T11:05:00+08:00c8d9e0f1a2b3c4d5e6f7a8b9c0d1e2f3a4b5c6d7feature/auth-flow
```

**`src/test/fixtures/git-remotes-output.txt`**
```
origin	git@github.com:pil-cloudops/infra-core.git (fetch)
origin	git@github.com:pil-cloudops/infra-core.git (push)
upstream	git@github.com:pil-platform/infra-core.git (fetch)
upstream	git@github.com:pil-platform/infra-core.git (push)
backup	git@gitlab.internal:ops/infra-core.git (fetch)
backup	git@gitlab.internal:ops/infra-core.git (push)
```

**`src/test/fixtures/empty-repo-output.txt`**
```
```

### 13.9 Test Summary Matrix

| Test File | Tests | What It Validates |
|---|---|---|
| `parser.test.ts` | 8 | Commit parsing, merge detection, ref extraction, tag extraction, empty input, malformed input, lane assignment, lane cycling |
| `runner.test.ts` | 3 | spawn invocation, cwd passing, env variable setting |
| `commands.test.ts` | 7 | Date range args, pagination args, custom range args, error handling, ahead/behind parsing, synced branch, remote list |
| `api.test.ts` | 5 | Binary path discovery, extension-not-found error, lazy activation, repo roots extraction, empty repos |
| `extension.test.ts` | 3 | Extension activation, command registration, webview panel opening |
| `webview.test.ts` | 1 | Message round-trip (request-commits -> commits-data) |
| **Total** | **27** | |

---

## 14. Build Script

```javascript
// ── esbuild.mjs ──

import * as esbuild from "esbuild";

const isWatch = process.argv.includes("--watch");

// Extension host bundle
const extConfig = {
  entryPoints: ["src/extension.ts"],
  bundle: true,
  outfile: "dist/extension.js",
  external: ["vscode"],
  format: "cjs",
  platform: "node",
  target: "node22",
  sourcemap: true,
};

// Webview bundle
const webviewConfig = {
  entryPoints: ["src/webview/main.tsx"],
  bundle: true,
  outfile: "dist/webview/main.js",
  format: "iife",
  platform: "browser",
  target: "es2022",
  sourcemap: true,
  loader: { ".tsx": "tsx", ".ts": "ts" },
};

if (isWatch) {
  const extCtx = await esbuild.context(extConfig);
  const webCtx = await esbuild.context(webviewConfig);
  await Promise.all([extCtx.watch(), webCtx.watch()]);
  console.log("Watching for changes...");
} else {
  await esbuild.build(extConfig);
  await esbuild.build(webviewConfig);
  console.log("Build complete.");
}
```

---

## 15. Vitest Configuration

```typescript
// ── vitest.config.ts ──

import { defineConfig } from "vitest/config";

export default defineConfig({
  test: {
    include: ["src/test/unit/**/*.test.ts"],
    exclude: ["src/test/integration/**"],
    environment: "node",
    globals: false,
    coverage: {
      provider: "v8",
      include: ["src/git/**/*.ts"],
      exclude: ["src/test/**", "src/webview/**"],
      thresholds: {
        branches: 80,
        functions: 80,
        lines: 80,
        statements: 80,
      },
    },
  },
});
```
