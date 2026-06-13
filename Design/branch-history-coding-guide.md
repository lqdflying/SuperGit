# Branch History Tab — Design & Coding Guide

> **Visual reference:** [`branch-history-v2.jsx`](branch-history-v2.jsx)
> **Live code references:** [`src/webview/App.tsx`](../src/webview/App.tsx), [`src/webview/components/tracking/TrackingView.tsx`](../src/webview/components/tracking/TrackingView.tsx), [`media/styles.css`](../media/styles.css)
> **Phase:** 5.5 (after Branch Tracking)

---

## 1. Overview

SuperGit has three complementary views:

| Tab | Model | Answers |
|-----|-------|---------|
| **Commit Graph** | Commit-centric (one row per commit) | What happened, when, on which refs? |
| **Branch Tracking** | Sync-centric (local ↔ remote diagram) | Is this branch ahead, behind, synced, or missing upstream? |
| **Branch History** | Time-centric (one horizontal lane per branch) | How have branches lived, diverged, gone stale, and been pushed over time? |

Branch History is **branch-centric**: time flows left-to-right; each branch is a horizontal lane. It answers:

- Which branches have diverged from the default branch and how severely?
- Which branches are stale (no recent commits)?
- Where has each branch been pushed, and what is still unpushed?
- How does divergence differ across multiple remotes?

The signature visualization is the **ghost track** under diverged lanes: a faded copy of the default branch’s progression since the last common ancestor (LCA), making the growing gap visible at a glance.

---

## 2. User Flows

### 2.1 Open tab

1. User clicks **Branch History** in the tab bar (third tab after Commit Graph and Branch Tracking).
2. Webview posts `request-branch-history` with the shared `dateRange` from `App.tsx`.
3. Extension host loads lifecycles via `getBranchLifecycles()` and posts `branch-history-data`.
4. Timeline renders; default selection is the checked-out branch if visible, else the first diverged lane, else default branch.

### 2.2 Change date range

1. User clicks a preset (`7d`, `14d`, `30d`, `All`) or sets **Custom** on the shared `DateRangeBar` (same component as Commit Graph).
2. Range state lives in `App.tsx`; switching tabs does **not** reset it.
3. On first visit to Branch History only, if range is still the graph default (`7d`), promote to `30d` once (timeline needs more horizon).
4. Webview re-requests `branch-history-data`; lanes outside the window are hidden; bar positions and commit dots clamp to visible days.

### 2.3 Select a lane

1. Click a branch label or bar → lane gets `.selected` styling; detail panel updates.
2. `.current` pill shows on the checked-out branch (separate from `.selected`).
3. Remote-only lanes (no local branch) are selectable; detail shows **Remote branch only** status.

### 2.4 Run an action

1. User clicks a contextual action in the detail panel (e.g. **Push 2**, **Pull 5**, **Create Local Branch**).
2. Webview posts `execute-branch-action` with explicit `branchName` and `remote` (same contract as Tracking).
3. On success, extension refreshes in order: `loadBranches` → `loadRemotes` → `loadBranchHistory` → `loadCommits` (if history changed).

### 2.5 Refresh

Toolbar **Refresh** or repo-change event triggers the same reload chain as above.

---

## 3. UI Specification

### 3.1 Tab shell

Branch History renders inside the existing SuperGit shell:

```
┌─ TitleBar (product title "Git Graph", toolbar: Search, Fetch, Pull, Push, Refresh) ─┐
├─ TabBar: [Commit Graph] [Branch Tracking] [Branch History*]                          ┤
├─ main-body: BranchHistoryTab                                                         │
│    ├─ DateRangeBar (shared component, .date-range-bar)                               │
│    ├─ .branch-history-summary (tab-local stats strip)                                │
│    ├─ .branch-history-legend (status icons, compact)                                 │
│    └─ flex row: [.branch-history-timeline | .branch-history-detail 320px]            │
└─ StatusBar (shared footer: current branch, remotes, commits, last fetched) ──────────┘
```

- **Tab icon:** add `history` to `IconName` — horizontal timeline with three branch bars (document in icons.tsx when implementing).
- **Tab state:** `useState<"graph" | "branches" | "history">` in `App.tsx`.
- **No** standalone page title, theme toggle, or replacement of `StatusBar`.

### 3.2 Tab-local summary strip (`.branch-history-summary`)

Positioned below `DateRangeBar`, above the legend:

```
3 active · 2 diverged · 2 merged · 2 stale · May 15 — Jun 13
```

- Counts reflect **visible** lanes in the current range only.
- Date span uses ISO-derived labels from range start/end.
- Colors: active=`--sg-ahead` family / ok token, diverged=`--sg-history-danger`, merged=`--sg-history-merged`, stale=`--sg-history-stale`.

### 3.3 Layout constants

| Element | Size | Notes |
|---------|------|-------|
| Branch label column | `220px` | Matches `.tracking-head-local` |
| Detail panel | `320px` fixed | `border-left: var(--sg-border)`; no splitter in v1 |
| Day column | `30px` | `lx(day) = LABEL_W + (day - rangeStart) * DAY_W + DAY_W/2` |
| Normal lane height | `72px` | |
| Diverged lane height | `96px` | `72 + DIV_GAP(14) + 10` for ghost track |
| Bar height | `8px` | Main lane slightly thicker stroke |
| Commit dot radius | `3.5px` (`3px` on default branch) | |

### 3.4 SVG timeline

See §6 (preserved from prior draft) for gridlines, branch bars, commit dots, hash labels, remote markers, ghost tracks, stale pills, and the rule **no cross-lane fork/merge connector curves**.

### 3.5 Branch label area (left, 220px)

Per lane, via `<foreignObject>`:

```
[color-dot 10px]  branch-name [current pill]   (mono 12px, fontWeight 600)
  [StatusIcon] Status [· Severity]  [stale tag]  +N -N
```

| Element | Rule |
|---------|------|
| Status icon | ● Active, ⚠ Diverged, ✓ Merged, ○ Remote-only |
| Severity | Only when diverged: · Mild / High / Severe |
| Stale tag | Gray pill `stale`; independent of primary status |
| Ahead/behind | Green `+N`, yellow/red `-N` vs default branch |
| Remote-only | Label shows `origin/feature/x`; subline `no local branch` |
| Current | Tiny red `.current` pill inside label row (checked-out branch) |

**Remote-only lane bar:** dashed stroke, `opacity: 0.35`, color from `remoteColor(colorIndex)`.

### 3.6 Date range bar

Reuse [`DateRangeBar`](../src/webview/components/graph/DateRangeBar.tsx) — same `.date-range-bar` / `.range-button` classes as Commit Graph.

| Preset | `DateRange` | Window |
|--------|-------------|--------|
| `7d` | `presetDays: 7` | Last 7 days |
| `14d` | `presetDays: 14` | Last 14 days |
| `30d` | `presetDays: 30` | Last 30 days |
| `All` | `presetDays: null` | Cap at **90 days** for performance |
| `Custom` | `mode: "custom"` | `customFrom` / `customTo` from App state |

Switching range: filter lanes (`endDay >= rangeStart`), clamp bar starts, filter commit dots, update summary strip counts and date span.

### 3.7 Detail panel (320px, `.branch-history-detail`)

Sections (top to bottom):

1. **Header** — color dot (14px), branch name, status pill (+ severity), stale pill, auto-generated description.
2. **Commit References** — fork point, local HEAD (or merge commit), LCA hash + ISO dates in mono pills.
3. **Remote Tracking** — one card per remote: dot, name, hash pill, push status, push date, `vs {remote}/{defaultBranch}: -N behind`.
4. **Divergence from {defaultBranch}** — meter bar (green ahead / red-warn behind) or “In sync” / “Fully merged”.
5. **Metrics** — 2×2 grid: Commits, Age, Last active, Status.
6. **Quick Actions** — contextual; see §10.

Primary action buttons use `.quick-button.primary` (same as Tracking). Danger delete uses red text on hover.

### 3.8 Theme

**VS Code-native only** — no manual dark/light toggle in the webview.

- CSS: `--sg-*` aliases in [`media/styles.css`](../media/styles.css); add history tokens:

```css
--sg-history-grid: …;
--sg-history-grid-week: …;
--sg-history-merged: var(--vscode-descriptionForeground, #8b949e);
--sg-history-stale: var(--vscode-disabledForeground, #484f58);
--sg-history-warn: …;
--sg-history-danger: var(--sg-behind);
```

- React/SVG: `useThemeColors()` → `theme.branch[colorIndex]`, `theme.remote[colorIndex]`, `theme.ahead`, `theme.behind`, `theme.bg0` (node stroke).
- `ThemeProvider` observes `data-vscode-theme-kind` on `document.body` (existing behavior).

---

## 4. Visual Reference

Pixel target: [`branch-history-v2.jsx`](branch-history-v2.jsx).

**DO:**

- Render timeline horizontally (time →, branches ↓).
- Keep default branch as topmost lane with thicker bar.
- Show hash labels at both ends of every branch bar.
- Show remote triangle flags only when `behindLocal > 0`.
- Show ghost track for **all** diverged local branches.
- Use three-tier gridlines (daily subtle, weekly labeled, Today accent).
- Embed inside SuperGit tab shell (tab bar stub, shared date bar, shared status bar).
- Include at least one remote-only sample lane.
- Show `.current` pill on checked-out branch.

**DO NOT:**

- Render fork/merge connector lines between lanes.
- Use `stale` as a primary status (it is a secondary flag).
- Show remote markers when fully pushed (`behindLocal = 0`).
- Hardcode colors — use `ThemeColors` / `--sg-*`.
- Show ghost track for active, merged, or remote-only lanes.
- Add a standalone theme toggle or replace `StatusBar`.

---

## 5. Data Model

### 5.1 Types (add to `src/shared/types.ts`)

```typescript
export interface BranchLifecycle {
  name: string;
  colorIndex: number;           // Resolve via branchColor() / remoteColor()

  isCurrent: boolean;           // Checked out in Git
  remoteOnly?: boolean;         // true when no local refs/heads/<name>
  remote?: string;              // Set when remoteOnly (e.g. "origin")

  status: "active" | "diverged" | "merged" | "remote-only";
  severity?: "mild" | "high" | "severe";   // diverged only
  stale: boolean;               // Secondary flag, NOT a status

  // Timeline (day indices: 0 = oldest day in computed range)
  startDay: number;
  endDay: number;
  commitDays: number[];
  totalCommits: number;

  // ISO dates for detail panel / tooltips
  startDate: string;
  endDate: string;
  commitDates: string[];

  hashStart: string;            // 7-char
  hashEnd: string;
  hashLca?: string;

  forkedFrom: { branch: string; day: number; date: string } | null;
  mergedInto: { branch: string; day: number; date: string } | null;

  aheadOfMain: number;
  behindMain: number;
  lastCommonAncestorDay: number;
  lastCommonAncestorDate?: string;

  remotes: RemotePosition[];
  divergePerRemote?: PerRemoteDivergence[];

  description: string;          // Server-generated in branch-status.ts
}

export interface RemotePosition {
  name: string;
  colorIndex: number;
  pushDay: number;
  pushDate: string;
  hash: string;
  behindLocal: number;          // Unpushed commit count
}

export interface PerRemoteDivergence {
  remote: string;
  behind: number;               // Commits behind that remote's default branch
  mainRef: string;              // e.g. "origin/main"
}

export interface RemoteMainPosition {
  name: string;
  colorIndex: number;
  lastDay: number;
  lastDate: string;
  hash: string;
  commits: number[];            // Default-branch commit day indices in range
}

export interface BranchHistoryPayload {
  lifecycles: BranchLifecycle[];
  defaultBranch: string;        // Resolved mainline name (e.g. "main")
  remoteMains: RemoteMainPosition[];
}
```

`DateRange` is the **existing** shared type (`mode`, `presetDays`, `customFrom`, `customTo`) — do not introduce a separate `days: 7|14|30|90` type.

### 5.2 Day-index computation

1. Determine `[rangeStart, rangeEnd]` from `DateRange` (All → max 90 days back from today).
2. `totalDays = inclusive day count`; map each commit ISO timestamp to `dayIndex = floor((date - rangeStart) / 1 day)`.
3. Day indices are **view-model only**; persist ISO strings in the payload for the detail panel.
4. `endDay` for active branches = today index; for merged = merge commit day; for remote-only = remote ref commit day.

---

## 6. SVG Rendering Specification

### 6.1 Layout constants

```typescript
const LABEL_WIDTH = 220;
const DAY_WIDTH = 30;
const LANE_HEIGHT = 72;
const LANE_HEIGHT_DIV = 96;
const BAR_HEIGHT = 8;
const DIV_GAP = 14;
const DOT_RADIUS = 3.5;
```

### 6.2 Gridlines (three tiers)

```
DAILY:   stroke historyGrid, strokeWidth 0.5, opacity 0.25
WEEKLY:  stroke historyGridWeek, strokeWidth 1, opacity 0.5, label "May 15" mono 10.5px (Mondays + first day)
TODAY:   stroke accent, strokeWidth 1.5, opacity 0.5, "Today" pill (36×14, rx=7)
```

### 6.3 Branch bar

| State | Rendering |
|-------|-----------|
| Active | Rounded rect, `branchColor`, opacity 0.5 (0.65 default branch) |
| Merged | Fill `--sg-history-merged`, opacity 0.35 |
| Stale | Solid to last commit, dashed extension to `endDay` |
| Diverged | Active bar + underline (warn/danger) from LCA + ghost track (§6.7) |
| Remote-only | Dashed rounded rect, `remoteColor`, opacity 0.35 |

### 6.4 Commit dots

Circle at each `commitDay >= rangeStart`; `r = 3.5` (3 on default branch); fill branch color; stroke `theme.bg0`.

### 6.5 Hash labels

Above bar (`y = barY - 5`): left = fork hash (muted); right = HEAD hash (status-colored). Stale lanes anchor right hash at last commit.

### 6.6 Remote position markers

Only when `behindLocal > 0`:

- Triangle flag at `pushDay` (fill `remoteColor`, opacity 0.7).
- Label `{remote}/{hash[0:4]}` above flag.
- Unpushed bracket below bar to `endX` with `{N} unpushed` text.

### 6.7 Divergence ghost track

For `status === "diverged"` and not default branch:

1. Extra lane height (`LANE_HEIGHT_DIV`).
2. Label `{defaultBranch}` at left (mono, default branch color, opacity 0.45).
3. Ghost bar LCA → today (opacity 0.15).
4. Hollow dots for default-branch commits after LCA.
5. Dashed LCA connector + `LCA {hash}` label.
6. Gap bracket at branch tip.
7. Behind badge `-N` at ghost bar end.

### 6.8 Stale pill

At `endX + 8`: `{N}d idle` pill when `stale === true`.

### 6.9 No fork/merge connector lines

Hash labels at bar endpoints are sufficient. Do not draw cross-lane curves.

---

## 7. Git Layer

### 7.1 Default branch resolution

```bash
# Preferred: remote HEAD symbolic ref
git symbolic-ref refs/remotes/origin/HEAD
# → refs/remotes/origin/main → strip to "main"

# Fallback order:
# 1. local branch "main"
# 2. local branch "master"
# 3. first local branch from getBranches()
```

All `aheadOfMain`, `behindMain`, LCA, merge detection, and ghost-track labels use this resolved ref.

### 7.2 Branch lifecycle commands

```bash
# Local branches with creation date
git for-each-ref --format='%(refname:short)%09%(creatordate:iso)%09%(objectname:short)' refs/heads/

# Commits on branch in range
git log <branch> --format="%aI%09%h" --after="<range_start>" --before="<today>"

# Fork point
git merge-base <defaultBranch> <branch>
git log -1 --format="%aI%09%h" <merge-base-hash>

# Merged check
git merge-base --is-ancestor <branch> <defaultBranch>   # exit 0 = merged

# Ahead/behind vs local default branch
git rev-list --left-right --count <defaultBranch>...<branch>
# "behind\tahead"
```

### 7.3 Multi-remote

```bash
git rev-parse --verify origin/<branch>
git log -1 --format="%aI%09%h" origin/<branch>
git rev-list --count origin/<branch>..<branch>    # unpushed

git log -1 --format="%aI%09%h" origin/<defaultBranch>
git rev-list --left-right --count origin/<defaultBranch>...<branch>
```

### 7.4 Remote-only lanes

From `getRemoteBranches()`: include refs where `localBranchName` is unset.

- `remoteOnly: true`, `name` = short branch name, `remote` = remote name.
- No ghost track; status always `remote-only`.
- `colorIndex` from remote config.

### 7.5 `computePerRemoteDivergence`

```typescript
async function computePerRemoteDivergence(
  cwd: string,
  branchName: string,
  remotes: string[],
  defaultBranch: string
): Promise<PerRemoteDivergence[]> {
  const results: PerRemoteDivergence[] = [];
  for (const remote of remotes) {
    const mainRef = `${remote}/${defaultBranch}`;
    const exists = await runGit(["rev-parse", "--verify", mainRef], cwd);
    if (exists.exitCode !== 0) continue;
    const ab = await runGit(
      ["rev-list", "--left-right", "--count", `${mainRef}...${branchName}`],
      cwd
    );
    const [behindStr] = ab.stdout.trim().split(/\s+/);
    results.push({ remote, behind: parseInt(behindStr, 10) || 0, mainRef });
  }
  return results;
}
```

### 7.6 Host modules

```
src/git/branch-lifecycle.ts   # getBranchLifecycles(cwd, dateRange)
src/git/branch-status.ts      # detectStatus(), generateDescription()
```

---

## 8. Status Algorithm

```typescript
const STALE_THRESHOLD_DAYS = 7;

export function detectStatus(branch: RawBranchData): {
  status: "active" | "diverged" | "merged";
  severity?: "mild" | "high" | "severe";
  stale: boolean;
} {
  if (branch.isMergedIntoMain) {
    return { status: "merged", stale: false };
  }
  const stale = branch.daysSinceActivity > STALE_THRESHOLD_DAYS;
  if (branch.aheadOfMain > 0 && branch.behindMain > 0) {
    let severity: "mild" | "high" | "severe";
    if (branch.behindMain <= 5) severity = "mild";
    else if (branch.behindMain <= 12) severity = "high";
    else severity = "severe";
    return { status: "diverged", severity, stale };
  }
  return { status: "active", stale };
}
```

| Status | Condition | Token |
|--------|-----------|-------|
| Active | `behindMain = 0` | ok / ahead color |
| Diverged mild | `ahead > 0` and `behind 1–5` | `--sg-history-warn` |
| Diverged high | `behind 6–12` | `--sg-history-danger` |
| Diverged severe | `behind 13+` | `--sg-history-danger` |
| Merged | tip ancestor of default branch | `--sg-history-merged` |
| Remote-only | no local branch | muted / untracked |

**Stale** is a flag on any non-merged local branch when `daysSinceActivity > 7`.

---

## 9. Messaging

### 9.1 Webview → extension

```typescript
| { type: "request-branch-history"; dateRange: DateRange }
| { type: "execute-branch-action"; action: BranchAction; branchName?: string; remote?: string }
```

(`request-branch-history` is new; `execute-branch-action` is existing.)

### 9.2 Extension → webview

```typescript
| { type: "branch-history-data"; lifecycles: BranchLifecycle[]; defaultBranch: string; remoteMains: RemoteMainPosition[] }
| { type: "loading"; loading: boolean; scope?: … | "branch-history" }
| { type: "action-result"; success: boolean; message: string }
```

### 9.3 Refresh after branch actions

```
loadBranches(root)
  → loadRemotes(root)
  → loadBranchHistory(root, dateRange)
  → loadCommits(...)   // when push/pull/delete changed history
```

---

## 10. Actions Matrix

All actions use existing `BranchAction` and `execute-branch-action`. Pass `branchName` + `remote` explicitly.

| Selection context | Primary | Secondary |
|-------------------|---------|-----------|
| Active, ahead only | **Push N** | Fetch |
| Active, behind only | **Pull N** | Fetch |
| Active, synced | — | Fetch |
| Diverged | **Push N**, **Pull N** (both `.primary`) | Fetch |
| No upstream | **Set Upstream** | Fetch |
| Remote-only | **Create Local Branch** (pull/fetch `remote:branch`) | Fetch |
| Merged + stale | Delete branch (danger, confirm) | — |
| Any | Fetch | Prune stale refs |

**Out of scope v1** (do not show as actions): rebase onto main, create pull request, checkout branch, copy branch name, view in commit graph (future: link via `historyScope`).

---

## 11. Sort Order

Lanes top-to-bottom:

1. Default branch (always first)
2. Diverged severe
3. Diverged high
4. Diverged mild
5. Active (most recent `startDay` first)
6. Remote-only (grouped by remote, then name)
7. Merged (most recent `endDay` first)

---

## 12. Integration Map

```
src/shared/types.ts                          BranchLifecycle, messages
src/extension.ts                             handle request-branch-history, refresh chain
src/git/branch-lifecycle.ts                  getBranchLifecycles()
src/git/branch-status.ts                     detectStatus(), generateDescription()
src/webview/App.tsx                          tab state, dateRange, load on tab switch
src/webview/components/history/
  BranchHistoryTab.tsx                       root tab component
  TimelineSvg.tsx                            grid + lanes (or inline in tab)
  BranchLane.tsx                             single lane
  GhostTrack.tsx                             diverged ghost
  RemoteMarker.tsx                           triangle + bracket
  HistoryDetail.tsx                          320px panel
src/webview/icons.tsx                        history icon
media/styles.css                             .branch-history-*, --sg-history-* tokens
src/test/unit/branch-status.test.ts          TC-BH01..BH12
```

Reuse `DateRangeBar` from graph — do **not** duplicate under `history/`.

---

## 13. Tests

```typescript
// src/test/unit/branch-status.test.ts

describe("detectStatus", () => {
  it("TC-BH01: merged when branch tip is ancestor of default branch", () => { … });
  it("TC-BH02: diverged mild when behind 1-5", () => { … });
  it("TC-BH03: diverged high when behind 6-12", () => { … });
  it("TC-BH04: diverged severe when behind 13+", () => { … });
  it("TC-BH05: stale flag independent of diverged", () => { … });
  it("TC-BH06: active when behind=0 even if ahead>0", () => { … });
  it("TC-BH07: active when both counts zero", () => { … });
  it("TC-BH08: merged takes priority over stale", () => { … });
});

describe("computePerRemoteDivergence", () => {
  it("TC-BH09: different behind counts per remote", () => { … });
  it("TC-BH10: skips remotes without default branch ref", () => { … });
});

describe("resolveDefaultBranch", () => {
  it("TC-BH11: uses origin HEAD symbolic ref", () => { … });
  it("TC-BH12: falls back main → master → first local", () => { … });
});

describe("buildBranchLifecycles", () => {
  it("TC-BH13: includes remote-only refs without localBranchName", () => { … });
});
```

---

## 14. Implementation Phases

| Step | What | Depends on |
|------|------|------------|
| 0 | Types + `request-branch-history` / `branch-history-data` messages | — |
| 5.5a | `branch-lifecycle.ts` + `branch-status.ts` | runner, parser |
| 5.5b | `BranchHistoryTab.tsx` — SVG timeline | React scaffold |
| 5.5c | `GhostTrack.tsx` | 5.5b |
| 5.5d | `RemoteMarker.tsx` | 5.5b |
| 5.5e | `HistoryDetail.tsx` + actions wiring | 5.5b |
| 5.5f | Shared `dateRange` + first-visit 30d promotion | App.tsx |
| 5.5g | `--sg-history-*` CSS + ThemeColors extensions | styles.css |
| 5.5h | Tab bar + extension refresh chain | App, extension |

---

## 15. Out of Scope (v1)

- Rebase onto default branch
- Create pull request
- Checkout branch / copy branch name from history panel
- Detail panel resize splitter
- Cross-tab “view in commit graph” navigation
- Standalone theme toggle
- Pagination of lanes (render all visible in range; cap All at 90 days)

---

## 16. Changelog from Draft

| Topic | Original draft | This spec |
|-------|----------------|-----------|
| Parent spec | `git-graph-extension-spec-v4.md` | Live code refs (`App.tsx`, `TrackingView.tsx`, `styles.css`) |
| Colors | `color: string`, hardcoded remote hex | `colorIndex` + `ThemeColors` |
| Theme | Dark/light toggle in mock | VS Code `--sg-*` only |
| Date range | Local `days: 7\|14\|30\|90` type | Shared `DateRange`; All capped at 90d |
| Date default | 30d always | Shared state; promote 7d→30d on first History visit |
| Tab shell | Standalone page + custom footer | SuperGit TitleBar / TabBar / StatusBar + `.branch-history-summary` |
| Actions | Rebase, PR, checkout, copy | Existing `BranchAction` only |
| Default branch | Hardcoded `main` | Dynamic resolution |
| Remote-only | Not shown | Lanes + Create Local Branch |
| Detail panel actions | Fantasy labels | Push N / Pull N / Set Upstream / Delete / Fetch / Prune |
| `DateRangeBar.tsx` under history/ | Duplicate component | Reuse graph `DateRangeBar` |

---

## 17. File Structure (additions)

```
src/
  git/
    branch-lifecycle.ts
    branch-status.ts
  webview/
    components/
      history/
        BranchHistoryTab.tsx
        BranchLane.tsx
        GhostTrack.tsx
        RemoteMarker.tsx
        HistoryDetail.tsx
```

Visual reference: [`branch-history-v2.jsx`](branch-history-v2.jsx).
