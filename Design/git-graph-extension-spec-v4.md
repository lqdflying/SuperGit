# Git Graph VS Code Extension — Implementation Spec v4

> **For the coding model:** This document + the accompanying mockup (`git-graph-v4-final.jsx`) are the complete implementation specification. Follow this spec as the single source of truth. The mockup is the pixel-perfect visual target. All tests in Section 13 must pass before a phase is considered complete.

---

## 0. Version Constraints (MANDATORY)

Use these exact versions. Older versions cause syntax or runtime failures.

| Dependency | Version | Why |
|---|---|---|
| `engines.vscode` | `^1.100.0` | VS Code 1.100+, Cursor/Windsurf compatible |
| TypeScript | `~6.0` | Latest stable. VS Code 1.114+ supports TS 6.0 |
| `@types/vscode` | `^1.100.0` | Match engine minimum |
| `@types/node` | `^22.0.0` | Node.js 22.x bundled since VS Code 1.101 |
| Node.js (dev) | `>=22.0.0` | LTS, bundled via Electron 35 |
| React | `^18.3.0` | Webview UI |
| esbuild | `^0.25.0` | Bundler (VS Code migrated to esbuild) |
| vitest | `^3.0.0` | Unit test framework |
| `@vscode/test-electron` | `^2.5.0` | Integration tests |

### tsconfig.json (extension host)

```jsonc
{
  "compilerOptions": {
    "target": "ES2024", "lib": ["ES2024"],
    "module": "NodeNext", "moduleResolution": "NodeNext",
    "strict": true, "esModuleInterop": true, "skipLibCheck": true,
    "forceConsistentCasingInFileNames": true,
    "outDir": "./dist", "rootDir": "./src",
    "declaration": true, "sourceMap": true, "resolveJsonModule": true
  },
  "include": ["src/**/*.ts"], "exclude": ["src/webview/**"]
}
```

### tsconfig.webview.json (React webview)

```jsonc
{
  "compilerOptions": {
    "target": "ES2022", "lib": ["ES2022","DOM","DOM.Iterable"],
    "module": "ESNext", "moduleResolution": "Bundler",
    "jsx": "react-jsx", "strict": true, "esModuleInterop": true,
    "skipLibCheck": true, "outDir": "./dist/webview", "rootDir": "./src/webview"
  },
  "include": ["src/webview/**/*.ts", "src/webview/**/*.tsx"]
}
```

---

## 1. Architecture

### 1.1 Hybrid: vscode.git API + Direct Git CLI

```
Extension Host (Node.js)
  vscode.git API                 Git CLI (child_process.spawn)
  +--------------------+        +-------------------------------+
  | git binary path    |------->| git log --format=...          |
  | repo root discovery|        | git for-each-ref              |
  | HEAD state events  |        | git rev-list --left-right     |
  | file change watch  |        | git remote -v                 |
  +--------------------+        | git push / pull / fetch / ... |
                                +-------------------------------+
                                         | postMessage
                          +--------------+------------------+
                          |  Webview (React 18 SPA)          |
                          |  - Commit Graph tab              |
                          |  - Branch Tracking tab           |
                          +---------------------------------+
```

**Why hybrid:** `vscode.git` reliably discovers the git binary and repos, but its `repository.log()` does not expose parent hashes or custom format strings needed for DAG rendering.

### 1.2 File Structure

```
git-graph-extension/
  package.json
  tsconfig.json
  tsconfig.webview.json
  esbuild.mjs
  src/
    extension.ts                  # activate(), register commands, create webview
    git/
      api.ts                      # vscode.git wrapper: binary path, repo discovery, events
      runner.ts                   # child_process.spawn using discovered binary
      parser.ts                   # Parse git stdout -> typed structures
      commands.ts                 # getCommits(), getBranches(), getRemotes(), actions
      lane-assigner.ts            # Topology-aware lane assignment algorithm
    webview/
      main.tsx                    # React entry, postMessage listener
      App.tsx                     # Root: tab switching, state, layout
      types.ts                    # Shared TypeScript interfaces
      tokens.ts                   # Colors, typography, spacing constants
      icons.tsx                   # Inline SVG icon components
      components/
        TitleBar.tsx
        TabBar.tsx
        StatusBar.tsx
        graph/
          DateRangeBar.tsx
          BranchSidebar.tsx       # Collapsible left panel with branch tree
          GraphCanvas.tsx         # SVG DAG with S-curve rendering
          CommitRow.tsx           # Single commit row with ref badges
          CommitDetail.tsx        # Right panel: author, metadata, actions
          Pagination.tsx
        tracking/
          RemoteChips.tsx         # Top bar: remote name + URL chips
          TrackingTable.tsx       # Three-column: Local | Tracks | Remotes
          TrackingLegend.tsx
          QuickActionsPanel.tsx   # Sticky bottom: contextual alert + action buttons
    test/
      unit/
        parser.test.ts
        commands.test.ts
        runner.test.ts
        api.test.ts
        lane-assigner.test.ts
      integration/
        extension.test.ts
        webview.test.ts
      fixtures/
        git-log-output.txt
        git-branches-output.txt
        git-remotes-output.txt
  media/
    styles.css
```

---

## 2. Data Contracts

```typescript
// ── types.ts ──

export interface CommitNode {
  hash: string;           // Full SHA-1 (40 chars)
  hashShort: string;      // First 7 chars
  message: string;        // First line of commit message
  author: string;
  authorEmail: string;
  date: string;           // ISO 8601
  lane: number;           // Swimlane column index (0 = main, 1-4 = features)
  parents: string[];      // Parent hashes (2+ = merge)
  refs: string[];         // "HEAD", "main", "origin/main", etc.
  tags: string[];         // "v2.3.0"
  isMerge: boolean;       // parents.length > 1
}

export interface BranchSidebarItem {
  name: string;
  type: "header" | "local" | "section" | "remote-group" | "remote-ref";
  color?: string;
  isCurrent?: boolean;
  subRefs?: string[];      // Remote refs underneath: ["origin/main", "upstream/main"]
}

export interface BranchTracking {
  name: string;
  color: string;
  isCurrent: boolean;
  remotes: RemoteTrackingEntry[];
}

export interface RemoteTrackingEntry {
  remote: string;          // "origin"
  ref: string;             // "origin/feature/auth"
  ahead: number;
  behind: number;
  badge?: string;          // Optional label like "upstream" shown on the remote pill
}

export interface RemoteConfig {
  name: string;
  url: string;
  color: string;
}

export interface DateRange {
  mode: "preset" | "custom";
  presetDays: 7 | 14 | 30 | null;
  customFrom?: string;
  customTo?: string;
}

export interface PaginationState {
  enabled: boolean;
  page: number;
  pageSize: number;        // Default 10
  totalItems: number;
  totalPages: number;
}

// Message protocol (webview <-> extension host)
export type WebviewMessage =
  | { type: "request-commits"; dateRange: DateRange; page: number; search: string }
  | { type: "request-branches" }
  | { type: "request-remotes" }
  | { type: "execute-action"; action: string; hash?: string; branch?: string; remote?: string };

export type ExtHostMessage =
  | { type: "commits-data"; commits: CommitNode[]; pagination: PaginationState; sidebar: BranchSidebarItem[] }
  | { type: "branches-data"; branches: BranchTracking[] }
  | { type: "remotes-data"; remotes: RemoteConfig[] }
  | { type: "action-result"; success: boolean; message: string }
  | { type: "repo-changed" }
  | { type: "loading"; loading: boolean };
```

---

## 3. Visual Design Tokens

Hybrid theming: UI chrome follows the active VS Code color theme via CSS variables; graph lane colors use theme-aware `--sg-branch-N` / `--sg-remote-N` palettes with light/dark/high-contrast overrides.

**CSS layer** (`media/styles.css`): `--sg-*` aliases map to `--vscode-*` (e.g. `--sg-bg0` → `--vscode-editor-background`) with GitHub-dark fallbacks.

**Runtime layer** (`src/webview/theme.ts`, `ThemeProvider.tsx`): `readThemeColors()` reads `--sg-*` from `getComputedStyle` for SVG/inline React styles. Refreshes on `body` class/`data-vscode-theme-id` changes and `theme-changed` postMessage from `onDidChangeActiveColorTheme`.

**Data layer**: `BranchInfo`, `RemoteConfig`, and `RemoteBranchInfo` use `colorIndex` (not hex); webview resolves via `branchColor(index, theme)` / `remoteColor(index, theme)`.

**Extension host fallbacks** (`src/shared/tokens.ts`):

```typescript
// ── tokens.ts (fallbacks for non-webview code + CSS var defaults) ──

export const colors = {
  bg0: "#0d1117",       // Canvas background
  bg1: "#161b22",       // Sidebar, detail panel, title bar
  bg2: "#1c2129",       // Status bar, date range bar
  bg3: "#21262d",       // Buttons, branch pills, input fields
  border: "#30363d",    // Primary borders
  borderSub: "#21262d", // Subtle separators within panels

  fg: "#c9d1d9",        // Default text
  fgDim: "#6e7681",     // Secondary text, remote refs
  fgMut: "#484f58",     // Tertiary: column headers, timestamps
  fgHi: "#e6edf3",      // High-emphasis: selected text, branch names

  accent: "#2f81f7",    // Active tab, date range pill, highlight buttons

  // Branch lane colors (8-color cycle)
  branch: ["#f78166","#58a6ff","#7ee787","#d2a8ff","#ffa657","#79c0ff","#f778ba","#a5d6ff"],

  ahead: "#56d364",     // Green
  behind: "#f85149",    // Red
  synced: "#58a6ff",    // Blue checkmark
  untracked: "#484f58", // Gray dashed

  sel: "rgba(47,129,247,0.10)",   // Selected row
  hov: "rgba(136,198,255,0.04)",  // Hovered row

  tagBg: "rgba(210,168,255,0.10)",
  tagBorder: "rgba(210,168,255,0.25)",
  tagFg: "#d2a8ff",
};

export const typography = {
  fontFamily: "-apple-system, BlinkMacSystemFont, 'Segoe UI', Helvetica, Arial, sans-serif",
  monoFamily: "'SF Mono', 'Fira Code', 'JetBrains Mono', Consolas, monospace",
};

export const graph = {
  laneWidth: 22,      // px between lane centers
  rowHeight: 32,      // px per commit row
  nodeRadius: 4,      // Normal commit node
  maxLanes: 5,        // Visible lanes (0-4), cycle colors beyond
};
```

---

## 4. Component Hierarchy

```
App
  state: tab, selected, hovRow, preset, searchOpen, searchText, page

  TitleBar
    [dot] "Git Graph" [repo-name-chip]  ............  [Search] | [Fetch] [Pull] [Push]

  TabBar
    [Commit Graph] [Branch Tracking]

  [if tab = "graph"]
    BranchSidebar (width: 210px, collapsible)
      "BRANCHES" header
      per local branch:
        [color-dot] branch-name [current badge if HEAD]
        per remote sub-ref (indented):
          [small-dot] origin/branch-name
      "REMOTE-ONLY" section header
      per remote-only ref:
        [color-dot] ref-name

    GraphPanel (flex: 1)
      DateRangeBar
        [calendar-icon] [7d] [14d] [30d] [All] [Custom]  ...  "N commits"
      ColumnHeaders
        Graph (122px) | Description (flex)
      ScrollArea
        GraphCanvas (SVG, 122px fixed width)
        CommitRows (flex: 1)
          per row (height: 32px):
            [ref-badges] [tag-badges] commit-message
      Pagination (only when preset=All and totalPages > 1)

    CommitDetail (width: 260px)
      [avatar] author-name, relative-time
      commit-message (paragraph)
      [ref-badges] [tag-badges]
      SHA, Parents, Type
      "ACTIONS" section:
        Cherry-pick, Revert, Checkout, Create branch, Create tag, Reset, Copy SHA

  [if tab = "branches"]
    BranchTrackingPanel (flex: 1)
      Header: "Branch Tracking" + subtitle
      RemoteChips: per remote [color-dot name url-mono]
      Column headers: LOCAL | TRACKS | REMOTES
      TrackingTable:
        per branch row (height: auto, min 48px):
          LOCAL (220px): [branch-pill with color-dot + mono-name] [current badge]
          TRACKS (100px): per remote -> [+N ahead] [arrow-svg] [checkmark or -N behind]
          REMOTES (flex): per remote -> [pill: color-dot + ref-name + badge + status]
      TrackingLegend: [ahead] [behind] [synced] [untracked] [remote dots]
      QuickActionsPanel (STICKY BOTTOM, border-top):
        Contextual alert: which branch is behind + description + "Checked out: X"
        Action buttons: [Push Selected (dim)] [Pull N (highlighted)] [Fetch All] [Set Upstream] [Prune Stale]

  StatusBar
    [dot branch-name] | [N remotes] | [N commits]  ...  "Last fetched Nm ago"
```

---

## 5. CRITICAL: Graph Rendering Algorithm

The biggest visual difference between a messy graph and a clean one. Follow this exactly.

### 5.1 Lane Assignment Rules

```
RULE 1: Lane 0 is ALWAYS the mainline branch (main/master).
        It renders as a straight vertical line. NEVER curves.

RULE 2: Feature branches fork RIGHT from lane 0 into lanes 1-4.
        They merge BACK LEFT into lane 0.

RULE 3: Lane assignment is STABLE across refreshes.
        Once a branch is assigned lane N, it stays at lane N.

RULE 4: If >5 branches are active, cycle lane indices: lane = index % 5.
        Colors cycle independently: color = index % 8.

RULE 5: A merge commit lives on the TARGET lane (lane 0 for most merges).
        The merging branch's last commit lives on the SOURCE lane (1-4).
```

### 5.2 Lane Assignment Algorithm

```typescript
// ── lane-assigner.ts ──

export function assignLanes(commits: CommitNode[]): void {
  const branchLane = new Map<string, number>();
  let nextLane = 1; // 0 is reserved for mainline

  // First pass: identify mainline branch
  const mainBranch = findMainBranch(commits); // "main" or "master"
  branchLane.set(mainBranch, 0);

  // Second pass: assign lanes
  for (const commit of commits) {
    const branch = detectBranch(commit);
    commit.branch = branch;

    if (!branchLane.has(branch)) {
      branchLane.set(branch, nextLane % 5);
      nextLane++;
    }
    commit.lane = branchLane.get(branch)!;
  }
}

function findMainBranch(commits: CommitNode[]): string {
  // The branch named "main" or "master" in refs
  for (const c of commits) {
    for (const ref of c.refs) {
      if (ref === "main" || ref === "master") return ref;
    }
  }
  return "main"; // fallback
}

function detectBranch(commit: CommitNode): string {
  // Priority: local non-HEAD ref > inherited from child > "main"
  const localRef = commit.refs.find(
    r => r !== "HEAD" && !r.startsWith("origin/") && !r.startsWith("upstream/")
  );
  return localRef || commit.branch || "main";
}
```

### 5.3 S-Curve Edge Rendering (SVG Path)

This is the core visual algorithm. It produces clean, non-overlapping curves.

```
SAME-LANE edge (lane1 === lane2):
  Straight vertical line: M(x1,y1) L(x2,y2)
  No curve, no filter.

CROSS-LANE edge (lane1 !== lane2):
  S-curve with 3 segments:
  1. VERTICAL DROP from source node down ~70% of one row height
  2. QUADRATIC CURVE turning horizontally toward the target lane
  3. STRAIGHT LINE down to the target node

  Path formula:
    step = rowHeight * 0.7
    midY = y1 + step
    targetY = midY + (y2 - midY) * 0.3

    d = "M {x1},{y1}          // Start at source node
         L {x1},{midY}         // Drop straight down
         Q {x1},{lerp1}        // Curve control point (same X as source)
           {x2},{targetY}      // Curve end point (target X)
         L {x2},{y2}"          // Straight line to target node

  Where lerp1 = midY + (y2 - midY) * 0.15

  This creates a clean "elbow" that:
  - Drops vertically first (no immediate horizontal movement)
  - Turns smoothly with a single quadratic curve
  - Finishes with a vertical segment into the target
  - NEVER crosses other lanes unnecessarily
```

### 5.4 SVG Glow Filter (cross-lane edges only)

```xml
<filter id="glow-N" x="-40%" y="-40%" width="180%" height="180%">
  <feGaussianBlur stdDeviation="1.8" result="blur"/>
  <feMerge>
    <feMergeNode in="blur"/>
    <feMergeNode in="SourceGraphic"/>
  </feMerge>
</filter>
```

Apply `filter="url(#glow-N)"` ONLY to cross-lane edges. Same-lane edges get no filter.

### 5.5 Node Rendering

```
NORMAL COMMIT:
  circle: radius=4, fill=bg0, stroke=branchColor, strokeWidth=2
  If commit has a local ref (non-origin, non-upstream, non-HEAD):
    fill=branchColor (solid filled)

MERGE COMMIT:
  Outer ring: circle radius=5, stroke=branchColor, strokeWidth=1.8, opacity=0.6
  Inner dot:  circle radius=2.5, fill=branchColor, opacity=0.85

SELECTED NODE:
  Background halo: circle radius=10, fill=branchColor, opacity=0.12
  (Drawn BEHIND the node)

SELECTED ROW:
  background: sel color (rgba(47,129,247,0.10))
  border-left: 2px solid branchColor
```

### 5.6 Edge Rendering Order

Render edges **back-to-front**: `[...edges].reverse().map(...)`. This ensures main-lane straight lines draw ON TOP of cross-lane curves, preventing visual clutter.

---

## 6. Branch Sidebar Specification

Width: 210px. Background: bg1. Collapsible.

### 6.1 Data Structure

Build from git data:

```typescript
// For each local branch:
{
  name: "feature/auth-flow",
  type: "local",
  color: branchColors[laneIndex],
  isCurrent: branch === HEAD,
  subRefs: [
    "origin/feature/auth-flow",       // from git for-each-ref refs/remotes/
    "upstream/feature/auth-flow",
  ]
}

// Remote-only refs (exist on remote but not locally):
{
  name: "feature/remote-only",
  type: "remote-ref",
  color: assigned
}
```

### 6.2 Visual Layout

```
BRANCHES                           <
  All branches
  [*] feature/local-ahead-origin
      . origin/feature/local-ahead-origin
      . upstream/feature/local-ahead-...
  [*] feature/local-only
  [*] feature/remote-ahead-or...  current
      . origin/feature/remote-ahead-o...
      . upstream/feature/remote-ahea...
  [*] feature/single-remote
      . origin/feature/single-remote
  [*] master
      . origin/master
      . upstream/master
  REMOTE-ONLY
  origin
      [*] feature/remote-only
```

- `[*]` = colored dot (8px circle, branch color, flexShrink: 0)
- `.` = small dot (4px circle, fgMut, indented 20px)
- `current` = red badge (background: #f8514922, color: #f85149)
- Collapse chevron `<` in header row

---

## 7. Branch Tracking Tab Specification

### 7.1 Layout

```
+--[ Branch Tracking ]--[ Local branches and upstream remotes ]--+
|                                                                  |
| [origin chip: dot+name+url]  [upstream chip: dot+name+url]      |
|                                                                  |
| LOCAL (220px)      | TRACKS (100px)  | REMOTES (flex)            |
|                    |                 |                            |
| [branch-pill]      |  +2 -->  check  | [remote-pill + status]    |
|                    |      -->  check  | [remote-pill + status]    |
|                    |                 |                            |
| [branch-pill]      |  ------  no up  | -                         |
|                    |                 |                            |
| [branch-pill] cur  |      --> -2     | [remote-pill + badge + -2]|
|                    |      -->  check  | [remote-pill + check]     |
|                    |                 |                            |
| Legend: [ahead] [behind] [synced] [untracked] [origin] [upstream]|
|                                                                  |
+=== STICKY BOTTOM ================================================+
| [!] feature/remote-ahead-origin -> origin/feature/remote-...     |
|     2 commits behind                                             |
|     Pull to fast-forward from origin/feature/remote-...          |
|     Checked out: master                                          |
|                                                                  |
| [Push Selected (dim)] [Pull 2 (blue)] [Fetch All] [Set Up] [Prune]|
+------------------------------------------------------------------+
```

### 7.2 Arrow Rendering (Inline SVG, per remote)

```
Each remote tracking entry gets a small inline SVG arrow:

  <svg width={36} height={12}>
    <line x1={0} y1={6} x2={28} y2={6}
          stroke={remoteColor} strokeWidth={1.5} opacity={0.6}/>
    <polygon points="31,6 26,3 26,9" fill={remoteColor} opacity={0.7}/>
  </svg>

No upstream:
  <svg width={48} height={2}>
    <line x1={0} y1={1} x2={48} y2={1}
          stroke={untracked} strokeWidth={1.2} strokeDasharray="4,3"/>
  </svg>
  + italic "no upstream" text
```

### 7.3 Quick Actions Panel (Sticky Bottom)

This panel is **pinned to the bottom** of the tracking tab, always visible.

**Contextual alert section:**
- Scans all branches for the most urgent issue (behind > ahead > diverged)
- Shows: branch name → remote ref, "N commits behind", explanation text
- Shows current checkout: "Checked out: master"

**Action buttons:**
- "Push Selected": dimmed (opacity 0.5) when nothing to push
- "Pull N": highlighted blue when any branch is behind. N = total commits behind.
- "Fetch All Remotes": normal
- "Set Upstream": normal
- "Prune Stale": normal

---

## 8. Data Layer (Extension Host)

### 8.1 vscode.git API Wrapper (api.ts)

```typescript
// Discovers git binary path, repository roots, change events
// See full implementation in spec v2 Section 6.1
```

### 8.2 Git CLI Runner (runner.ts)

```typescript
// Spawns git using discovered binary path with GIT_TERMINAL_PROMPT=0
// See full implementation in spec v2 Section 6.2
```

### 8.3 Git Commands (commands.ts)

```bash
# Commits with date range
git log --all --date-order --format="<RS-delimited fields>" [--after=...] [--skip=N -n M]

# Branches with tracking
git for-each-ref --format='%(refname:short)\t%(upstream:short)\t%(upstream:remotename)' refs/heads/

# All remote refs (for multi-remote + remote-only detection)
git for-each-ref --format='%(refname:short)' refs/remotes/

# Ahead/behind per remote
git rev-list --left-right --count localBranch...remote/branch

# Remote list
git remote -v
```

### 8.4 Sidebar Construction Logic

```
1. Get local branches from refs/heads/
2. Get remote refs from refs/remotes/
3. For each local branch, find matching remote refs across ALL remotes
4. Remote-only refs = remote refs with no matching local branch
5. Group remote-only by remote name
6. Build BranchSidebarItem[] array with correct types and hierarchy
```

### 8.5 Quick Actions Context Detection

```typescript
function detectUrgentAction(branches: BranchTracking[]): UrgentAction | null {
  // Find first branch with behind > 0
  for (const b of branches) {
    for (const r of b.remotes) {
      if (r.behind > 0) {
        return {
          branch: b.name,
          remote: r.ref,
          behind: r.behind,
          message: `Pull to fast-forward ${b.name} from ${r.ref}.`,
        };
      }
    }
  }
  return null;
}
```

---

## 9. Commit Row Specification

Height: 32px. Two visual zones side by side:

### 9.1 Graph Zone (122px fixed)

SVG canvas aligned with commit rows. See Section 5 for rendering.

### 9.2 Description Zone (flex: 1)

Per row, left to right:
1. **Ref badges** (pill shape): for each non-HEAD local/remote ref
   - Local refs: `border: 1px solid branchColor@27%`, `background: branchColor@7%`, `color: branchColor`
   - Remote refs: same styling but `color: fgDim`
   - borderRadius: 10, fontSize: 10.5, padding: 1px 8px, fontFamily: mono
2. **Tag badges**: purple tint, tag icon SVG inline
3. **Commit message**: fontSize 12, fgHi when selected, fg default
   - Merge commits: opacity 0.7 (dimmer than regular commits)
4. **Selected row**: background = sel, border-left = 2px solid branchColor

### 9.3 Simplified Column Layout

The v4 design intentionally removes Author/Date/Hash columns from the main row to reduce noise. This data lives in the CommitDetail panel instead. The row shows ONLY: graph + description.

---

## 10. Badge Specifications

```
REF BADGE (pill):
  fontSize: 10.5, padding: "1px 8px", borderRadius: 10
  border: 1px solid {color}44
  background: {color}12
  color: {color}
  fontFamily: mono, fontWeight: 500
  whiteSpace: nowrap, flexShrink: 0

TAG BADGE:
  Same as ref badge but:
  border: 1px solid rgba(210,168,255,0.25)
  background: rgba(210,168,255,0.10)
  color: #d2a8ff
  Includes inline SVG tag icon (10x10) before text

CURRENT BADGE:
  fontSize: 9, padding: "1px 5px", borderRadius: 4
  background: #f8514922, color: #f85149
  fontWeight: 600, fontFamily: mono

STATUS CHECKMARK:
  <svg 14x14 viewBox="0 0 16 16">
    <polyline points="4,8.5 7,11 12,5"
      fill="none" stroke="#58a6ff" strokeWidth={2}
      strokeLinecap="round" strokeLinejoin="round"/>
  </svg>
```

---

## 11. Extension Manifest (package.json)

```jsonc
{
  "name": "git-graph-pro",
  "displayName": "Git Graph Pro",
  "version": "0.1.0",
  "engines": { "vscode": "^1.100.0" },
  "categories": ["SCM Providers", "Visualization"],
  "activationEvents": ["workspaceContains:.git"],
  "main": "./dist/extension.js",
  "extensionDependencies": ["vscode.git"],
  "contributes": {
    "commands": [{
      "command": "gitGraphPro.show",
      "title": "Git Graph Pro: Show Graph",
      "icon": "$(git-commit)"
    }],
    "menus": {
      "scm/title": [{ "command": "gitGraphPro.show", "group": "navigation" }]
    }
  },
  "scripts": {
    "build": "node esbuild.mjs",
    "watch": "node esbuild.mjs --watch",
    "test": "vitest run",
    "test:integration": "vscode-test",
    "lint": "eslint src/"
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

## 12. Build Script

```javascript
// ── esbuild.mjs ──
import * as esbuild from "esbuild";
const watch = process.argv.includes("--watch");

const ext = { entryPoints:["src/extension.ts"], bundle:true, outfile:"dist/extension.js", external:["vscode"], format:"cjs", platform:"node", target:"node22", sourcemap:true };
const web = { entryPoints:["src/webview/main.tsx"], bundle:true, outfile:"dist/webview/main.js", format:"iife", platform:"browser", target:"es2022", sourcemap:true, loader:{".tsx":"tsx",".ts":"ts"} };

if (watch) {
  const [e,w] = await Promise.all([esbuild.context(ext), esbuild.context(web)]);
  await Promise.all([e.watch(), w.watch()]);
} else {
  await esbuild.build(ext);
  await esbuild.build(web);
}
```

---

## 13. Test Cases (30 tests)

### 13.1 Parser Tests (parser.test.ts) — 8 tests

```typescript
import { describe, it, expect } from "vitest";
import { parseCommits, parseRemotes } from "../../git/parser.js";

describe("parseCommits", () => {
  it("TC-P01: parse single normal commit with refs", () => {
    const raw = ["a".repeat(40),"a1b2c3d","fix: timeout","author","a@e","2026-06-13T14:00:00Z","b".repeat(40),"HEAD -> hotfix/db"].join("\x1e");
    const r = parseCommits(raw);
    expect(r).toHaveLength(1);
    expect(r[0].hashShort).toBe("a1b2c3d");
    expect(r[0].isMerge).toBe(false);
    expect(r[0].refs).toContain("HEAD");
    expect(r[0].refs).toContain("hotfix/db");
  });

  it("TC-P02: parse merge commit with two parents", () => {
    const raw = ["c".repeat(40),"c1d2e3f","Merge PR #42","dev","d@e","2026-06-12T09:00:00Z",`${"d".repeat(40)} ${"e".repeat(40)}`,"main, origin/main, tag: v2.3.0"].join("\x1e");
    const r = parseCommits(raw);
    expect(r[0].isMerge).toBe(true);
    expect(r[0].parents).toHaveLength(2);
    expect(r[0].tags).toContain("v2.3.0");
  });

  it("TC-P03: handle commit with no refs or tags", () => {
    const raw = ["f".repeat(40),"f1a2b3c","fix: typo","dev","d@e","2026-06-10T14:00:00Z","g".repeat(40),""].join("\x1e");
    const r = parseCommits(raw);
    expect(r[0].refs).toHaveLength(0);
    expect(r[0].tags).toHaveLength(0);
  });

  it("TC-P04: handle empty input gracefully", () => {
    expect(parseCommits("")).toHaveLength(0);
  });

  it("TC-P05: reject malformed lines (too few fields)", () => {
    expect(parseCommits("abc\x1edef")).toHaveLength(0);
  });
});

describe("parseRemotes", () => {
  it("TC-P06: parse multi-remote output", () => {
    const raw = "origin\tgit@gh:org/repo.git (fetch)\norigin\tgit@gh:org/repo.git (push)\nupstream\tgit@gh:up/repo.git (fetch)\nupstream\tgit@gh:up/repo.git (push)";
    const r = parseRemotes(raw);
    expect(r).toHaveLength(2);
    expect(r[0].name).toBe("origin");
    expect(r[1].name).toBe("upstream");
  });

  it("TC-P07: deduplicate fetch/push lines", () => {
    const raw = "origin\thttps://gh.com/repo.git (fetch)\norigin\thttps://gh.com/repo.git (push)";
    expect(parseRemotes(raw)).toHaveLength(1);
  });

  it("TC-P08: handle empty remote output", () => {
    expect(parseRemotes("")).toHaveLength(0);
  });
});
```

### 13.2 Lane Assigner Tests (lane-assigner.test.ts) — 6 tests

```typescript
import { describe, it, expect } from "vitest";
import { assignLanes } from "../../git/lane-assigner.js";

describe("assignLanes", () => {
  it("TC-L01: main/master always gets lane 0", () => {
    const commits = [
      { refs: ["main"], parents: [], lane: -1, branch: "" },
      { refs: ["feature/x"], parents: [], lane: -1, branch: "" },
    ];
    assignLanes(commits as any);
    expect(commits[0].lane).toBe(0);
    expect(commits[1].lane).not.toBe(0);
  });

  it("TC-L02: same branch reuses same lane", () => {
    const commits = [
      { refs: ["main"], parents: [], lane: -1, branch: "" },
      { refs: [], parents: [], lane: -1, branch: "main" },
      { refs: [], parents: [], lane: -1, branch: "main" },
    ];
    assignLanes(commits as any);
    expect(commits[0].lane).toBe(commits[1].lane);
    expect(commits[1].lane).toBe(commits[2].lane);
  });

  it("TC-L03: feature branches get lanes 1+", () => {
    const commits = [
      { refs: ["main"], parents: [], lane: -1, branch: "" },
      { refs: ["feature/a"], parents: [], lane: -1, branch: "" },
      { refs: ["feature/b"], parents: [], lane: -1, branch: "" },
    ];
    assignLanes(commits as any);
    expect(commits[1].lane).toBe(1);
    expect(commits[2].lane).toBe(2);
  });

  it("TC-L04: lanes cycle after 5 branches", () => {
    const commits = Array.from({ length: 7 }, (_, i) => ({
      refs: [i === 0 ? "main" : `feat/${i}`], parents: [], lane: -1, branch: "",
    }));
    assignLanes(commits as any);
    expect(commits[6].lane).toBe(commits[1].lane); // 6th feature = lane 1 again
  });

  it("TC-L05: remote-only refs excluded from lane assignment", () => {
    const commits = [
      { refs: ["origin/main"], parents: [], lane: -1, branch: "" },
    ];
    assignLanes(commits as any);
    // origin/main should not match as "main" for lane 0
    expect(commits[0].lane).not.toBe(0);
  });

  it("TC-L06: merge commit inherits target branch lane", () => {
    const commits = [
      { refs: ["main"], parents: ["p1", "p2"], lane: -1, branch: "", isMerge: true },
    ];
    assignLanes(commits as any);
    expect(commits[0].lane).toBe(0); // merge into main = lane 0
  });
});
```

### 13.3 Commands Tests (commands.test.ts) — 7 tests

```typescript
import { describe, it, expect, vi, beforeEach } from "vitest";

vi.mock("../../git/runner.js", () => ({ runGit: vi.fn() }));
import { getCommits, getRemotes, getAheadBehind } from "../../git/commands.js";
import { runGit } from "../../git/runner.js";
const mock = vi.mocked(runGit);

describe("getCommits", () => {
  beforeEach(() => vi.clearAllMocks());

  it("TC-C01: 7d preset passes --after flag", async () => {
    mock.mockResolvedValue({ stdout: "", stderr: "", exitCode: 0 });
    await getCommits("/r", { mode: "preset", presetDays: 7 }, 0, 10);
    expect(mock.mock.calls[0][0].some((a: string) => a.startsWith("--after="))).toBe(true);
  });

  it("TC-C02: 'All' mode passes --skip and -n", async () => {
    mock.mockResolvedValue({ stdout: "", stderr: "", exitCode: 0 });
    await getCommits("/r", { mode: "preset", presetDays: null }, 2, 10);
    expect(mock.mock.calls[0][0]).toContain("--skip=20");
  });

  it("TC-C03: custom range passes --after and --before", async () => {
    mock.mockResolvedValue({ stdout: "", stderr: "", exitCode: 0 });
    await getCommits("/r", { mode: "custom", presetDays: null, customFrom: "2026-06-01", customTo: "2026-06-10" }, 0, 10);
    const args = mock.mock.calls[0][0];
    expect(args.some((a: string) => a.includes("2026-06-01"))).toBe(true);
    expect(args.some((a: string) => a.includes("2026-06-10"))).toBe(true);
  });

  it("TC-C04: throws on non-zero exit", async () => {
    mock.mockResolvedValue({ stdout: "", stderr: "fatal: not a git repo", exitCode: 128 });
    await expect(getCommits("/r", { mode: "preset", presetDays: 7 }, 0, 10)).rejects.toThrow();
  });
});

describe("getAheadBehind", () => {
  it("TC-C05: parses 3 ahead 1 behind", async () => {
    mock.mockResolvedValue({ stdout: "3\t1\n", stderr: "", exitCode: 0 });
    expect(await getAheadBehind("/r", "main", "origin/main")).toEqual({ ahead: 3, behind: 1 });
  });

  it("TC-C06: returns 0/0 on error", async () => {
    mock.mockResolvedValue({ stdout: "", stderr: "err", exitCode: 1 });
    expect(await getAheadBehind("/r", "main", "origin/main")).toEqual({ ahead: 0, behind: 0 });
  });
});

describe("getRemotes", () => {
  it("TC-C07: parses remote list", async () => {
    mock.mockResolvedValue({ stdout: "origin\turl (fetch)\norigin\turl (push)\n", stderr: "", exitCode: 0 });
    const r = await getRemotes("/r");
    expect(r).toHaveLength(1);
    expect(r[0].name).toBe("origin");
  });
});
```

### 13.4 Runner Tests (runner.test.ts) — 3 tests

```typescript
import { describe, it, expect, vi } from "vitest";

vi.mock("node:child_process", () => {
  const { EventEmitter } = require("node:events");
  const { Readable } = require("node:stream");
  return {
    spawn: vi.fn(() => {
      const p = new EventEmitter();
      p.stdout = new Readable({ read() {} });
      p.stderr = new Readable({ read() {} });
      setTimeout(() => { p.stdout.push("ok\n"); p.stdout.push(null); p.stderr.push(null); p.emit("close", 0); }, 5);
      return p;
    }),
  };
});
vi.mock("../../git/api.js", () => ({ getGitBinaryPath: vi.fn().mockResolvedValue("git") }));

import { runGit } from "../../git/runner.js";

describe("runGit", () => {
  it("TC-R01: resolves with stdout", async () => {
    const r = await runGit(["log"], "/tmp");
    expect(r.exitCode).toBe(0);
    expect(r.stdout).toContain("ok");
  });

  it("TC-R02: passes cwd", async () => {
    const { spawn } = await import("node:child_process");
    await runGit(["status"], "/my/repo");
    expect(spawn).toHaveBeenCalledWith("git", ["status"], expect.objectContaining({ cwd: "/my/repo" }));
  });

  it("TC-R03: sets GIT_TERMINAL_PROMPT=0", async () => {
    const { spawn } = await import("node:child_process");
    await runGit(["fetch"], "/tmp");
    expect(spawn).toHaveBeenCalledWith("git", ["fetch"], expect.objectContaining({ env: expect.objectContaining({ GIT_TERMINAL_PROMPT: "0" }) }));
  });
});
```

### 13.5 API Tests (api.test.ts) — 3 tests

```typescript
import { describe, it, expect, vi } from "vitest";
vi.mock("vscode", () => ({
  extensions: { getExtension: vi.fn() },
  workspace: { getConfiguration: vi.fn(() => ({ get: vi.fn(() => undefined) })), createFileSystemWatcher: vi.fn(() => ({ onDidChange: vi.fn(()=>({dispose:vi.fn()})), onDidCreate: vi.fn(()=>({dispose:vi.fn()})), onDidDelete: vi.fn(()=>({dispose:vi.fn()})), dispose: vi.fn() })) },
  Disposable: { from: vi.fn() },
}));
import { getGitBinaryPath, getRepositoryRoots } from "../../git/api.js";
import * as vscode from "vscode";

describe("getGitBinaryPath", () => {
  it("TC-A01: returns 'git' by default", async () => {
    vi.mocked(vscode.extensions.getExtension).mockReturnValue({ isActive: true, activate: vi.fn(), exports: { getAPI: vi.fn(()=>({})) } } as any);
    expect(await getGitBinaryPath()).toBe("git");
  });

  it("TC-A02: throws when git extension missing", async () => {
    vi.mocked(vscode.extensions.getExtension).mockReturnValue(undefined);
    await expect(getGitBinaryPath()).rejects.toThrow();
  });

  it("TC-A03: returns empty array for no repos", async () => {
    vi.mocked(vscode.extensions.getExtension).mockReturnValue({ isActive: true, exports: { getAPI: vi.fn(()=>({ repositories: [] })) } } as any);
    expect(await getRepositoryRoots()).toHaveLength(0);
  });
});
```

### 13.6 Integration Tests — 3 tests

```typescript
// extension.test.ts (runs with @vscode/test-electron)
import * as assert from "node:assert";
import * as vscode from "vscode";

suite("Extension", () => {
  test("TC-I01: activates", async () => {
    const ext = vscode.extensions.getExtension("git-graph-pro.git-graph-pro");
    assert.ok(ext);
    await ext.activate();
    assert.strictEqual(ext.isActive, true);
  });

  test("TC-I02: command registered", async () => {
    const cmds = await vscode.commands.getCommands(true);
    assert.ok(cmds.includes("gitGraphPro.show"));
  });

  test("TC-I03: opens webview", async () => {
    await vscode.commands.executeCommand("gitGraphPro.show");
    await new Promise(r => setTimeout(r, 1000));
  });
});
```

### 13.7 Test Summary

| File | Tests | IDs |
|---|---|---|
| parser.test.ts | 8 | TC-P01..TC-P08 |
| lane-assigner.test.ts | 6 | TC-L01..TC-L06 |
| commands.test.ts | 7 | TC-C01..TC-C07 |
| runner.test.ts | 3 | TC-R01..TC-R03 |
| api.test.ts | 3 | TC-A01..TC-A03 |
| extension.test.ts | 3 | TC-I01..TC-I03 |
| **Total** | **30** | |

Coverage target: 80%+ on `src/git/*.ts`

---

## 14. Implementation Phases

| Phase | Deliverable | Tests |
|---|---|---|
| 1. Scaffold | Extension host, webview panel, postMessage bridge, vscode.git API wrapper | TC-A01..A03, TC-I01..I03 |
| 2. Graph Visual | GraphCanvas SVG, CommitRow, BranchSidebar, CommitDetail (mock data) | Visual QA against mockup |
| 3. Live Data | parser.ts, runner.ts, commands.ts, lane-assigner.ts | TC-P01..P08, TC-L01..L06, TC-R01..R03, TC-C01..C07 |
| 4. Date Range + Pagination | DateRangeBar, Pagination, server-side --skip/-n | TC-C01..C04 |
| 5. Branch Tracking | TrackingTable, RemoteChips, QuickActionsPanel, contextual alert | Visual QA |
| 6. Actions | cherry-pick, revert, checkout, push, pull, fetch wired to git CLI | Manual testing |
| 7. Polish | File watcher auto-refresh, loading states, search, edge cases | All 30 tests green |

---

## 15. Visual Reference

The file `git-graph-v4-final.jsx` is the pixel-perfect visual target.

- **DO** replicate exact layout, colors, typography, spacing.
- **DO** use the S-curve algorithm from Section 5.3 exactly as specified.
- **DO** implement the branch sidebar with local/remote hierarchy (Section 6).
- **DO** implement the sticky QuickActionsPanel at bottom of tracking tab (Section 7.3).
- **DO NOT** add Author/Date/Hash columns to commit rows. That data is in CommitDetail only.
- **DO NOT** use bezier curves (cubic `C` paths) for graph edges. Use the `M-L-Q-L` pattern from Section 5.3.
- **DO NOT** use external icon libraries. All icons are inline SVG from the mockup.
