# Changelog

## 2.1.0 - 2026-06-29

### Added

- Branch Tracking now shows fixed **Behind(Default)** and **Ahead(Default)** columns after **Remotes**.
- Default comparison counts are computed per remote row against that remote's own default branch, including multi-remote cases where defaults differ (for example `origin/main` and `upstream/master`).
- Files Diff shows compact default comparison counts for the selected refs using the same remote-default comparison data.

### Changed

- Remote-default comparison prefers enriched `remote.defaultBranch`, then local `refs/remotes/<remote>/HEAD`, then the repository default branch name as fallback.
- Branch data reloads after background remote-default enrichment so comparison counts can update when remote defaults are discovered.

### Verified

- `npm run typecheck`
- `npm run test:coverage` (179 tests)
- `npm run build`
- `npm run package`

## 2.0.1 - 2026-06-25

### Fixed

- Deleting a remote branch now immediately clears every local upstream configured for that exact remote ref, so the Branch Tracking relationship arrow disappears after the normal post-action reload.
- Remote deletion remains successful if local upstream cleanup cannot complete and directs the user to **Prune Stale** for recovery.

### Verified

- `npm run typecheck`
- `npm run test:coverage` (175 tests)
- `npm run build`
- `npm run package`

## 2.0.0 - 2026-06-17

### Breaking

- Removed the Branch History tab and its timeline/caching data path. Branch divergence and sync state remain available in Branch Tracking.

### Added

- **Files Diff** tab: compare any two local or remote branch refs using cached refs and direct `git diff <leftRef> <rightRef>` comparison.
- Changed-file tally with file count, additions, deletions, renamed files, binary file count, and status-aware changed-file rows.
- Per-file opening through VS Code's native side-by-side diff editor using the existing `supergit:` content provider.
- Files Diff product rules, docs, screenshot, parser/read-model tests, and webview utility tests.

### Changed

- SuperGit's third tab is now Files Diff: Commit Graph, Branch Tracking, Files Diff.
- Branch action refresh reloads the active Files Diff comparison when applicable.
- Package description and README now describe branch file comparisons.
- Removed obsolete Branch History components, Git lifecycle/status code, cache/generation helpers, styles, tests, rules, and screenshot asset.

### Verified

- `npm run typecheck`
- `npm run test:coverage` (169 tests)
- `npm run build`
- `npm run package`

## 1.4.0 - 2026-06-15

### Added

- **Checkout New Branch** in Branch Tracking: create and switch to a new local branch from the selected local branch, remote tracking row, or remote-only ref (`checkout-new-local-branch`).
- Local pill source uses `git checkout -b <new> <sourceBranch>`; remote source uses `git checkout -b <new> --track <remote>/<branch>` with branch-name validation via `git check-ref-format --branch`.
- Unit tests for local/remote checkout paths, cancellation, invalid names, and stale remote refs.

### Changed

- Documented Checkout New Branch semantics in `.cursor/rules/supergit-webview.mdc`, `supergit-project.mdc`, and `AGENTS.md` — distinct from remote-only **Create Local Branch** (`pull` fetch without checkout).

### Verified

- `npm run typecheck`
- `npm run test:coverage` (226 tests)
- `npm run build`
- `npm run package`

## 1.3.0 - 2026-06-14

### Added

- **Multi-remote upstream tracking**: `Add Remote Tracking` action pushes/fetches to additional remotes without changing the default upstream; `Set as Default Upstream` reassigns the configured default.
- **Branch History caching** (`src/extension/branchHistoryCache.ts`): per-root keyed cache with dirty/epoch invalidation — instant tab re-entry when data unchanged.
- **Refresh policy classifiers** (`src/extension/refreshPolicy.ts`): action-driven gating of remote-default enrichment, commit graph reload, and history cache invalidation.
- **Commit graph dirty deferral**: skip `loadCommits` when Graph tab is inactive; reload once on next tab switch (epoch-guarded to prevent stale clears).
- **`superGit.addUpstream.skipRemoteProbe`** setting: skip `ls-remote --heads` preflight for `add-upstream` in trusted environments — trades graceful validation for instant action start.
- Epoch/generation guards for Branch History cache and commit-graph dirty flag — prevent in-flight async loads from overwriting newer state.

### Changed

- Post-action refresh uses selective `invalidateRemoteDataCaches({ defaultBranches })` — full invalidation only for `fetch`, `prune-stale`, `delete-remote`; list-only for safe actions.
- `loadRemotes` accepts `{ enrichDefaults }` option; post-action calls skip `ls-remote --symref` enrichment for actions that cannot change remote HEAD.
- `loadInitialData` marks branch history dirty **before** parallel reload (epoch bumped eagerly); inline `loadBranchHistory` only when History tab is active after success.
- `canAddRemoteTracking` button gating uses `hasMissingRemoteTrackingForTarget()` with single target branch name (was checking all branch names, causing false positives).
- Updated AGENTS.md and `.cursor/rules/` with performance architecture lessons, epoch patterns, and new module documentation.

### Fixed

- "Add Remote Tracking" button disappeared when clicking local branch pill (gating checked `hasConfiguredUpstream` instead of `hasExistingTracking`).
- Redundant `localRemoteTrackingRefExists()` call removed from `executeAddUpstream` preflight — was duplicate network-class latency before `ls-remote`.
- In-flight `loadBranchHistory` could write stale data when a newer action bumped cache epoch mid-flight (epoch guard discards outdated results).
- In-flight `loadCommits` could clear a newer `commitGraphDirty` flag set by a branch action during its execution (epoch guard prevents premature clear).
- `tab-changed` to Graph no longer clears `commitGraphDirty` before `loadCommits` completes (deferred clear prevents swallowed retries on failure).

### Verified

- `npm run typecheck`
- `npm run test:coverage` (219 tests)
- `npm run build`
- `npm run package`

## 1.2.1 - 2026-06-14

### Added

- Per-remote **default branch** indicators: gold ★ icon on remote rows, default badge on top remote chips, and footer legend (`--sg-default-branch` token).
- **Prune Stale** clears broken upstream links after fetch/prune (with confirmation); shows which branches were updated.
- Remote default-branch resolution and caching (`remote-default.ts`); delete-remote guard blocks remote default branches.
- Refresh coordination rules and managed-refresh guard (`supergit-refresh-coordination.mdc`).
- Branch History responsive timeline (`timelineLayout.ts`, `useTimelineLayout.ts`): `ResizeObserver` scales day columns to panel width.

### Changed

- Branch Tracking table uses fixed column widths (228 / 170 / 272px) so rows do not stretch across the panel.
- Title-bar Refresh fetches and prunes only — upstream cleanup is explicit via **Prune Stale**, not silent on Refresh.
- After branch actions, reload commits for **fetch**, **prune-stale**, and **delete-remote** (graph and history stay in sync).
- Branch History timeline fits the panel (no horizontal scrollbar); smart hiding for hash labels and remote markers at narrow widths.
- **Set upstream** / **Push and Set Upstream** use extension-host QuickPick when multiple remotes are configured (no manual `remote/branch` input).
- README screenshots updated for Commit Graph, Branch Tracking, and Branch History.

### Fixed

- Managed refresh prevents duplicate reloads and repo-watcher races during fetch/prune.
- Webview commit requests use query-key matching (no swallowed filter/page changes after hydration).
- `invalidateRemoteDataCaches` clears remotes list and default-branch cache after fetch/prune/actions.
- `unsetStaleUpstreamLinks` aborts when remote ref listing fails (no mass upstream wipe).
- Fetch and Set Upstream uses explicit refspec to create `refs/remotes/<remote>/<branch>` before set-upstream.
- Remote chip default badge no longer crushed by generic `.remote-chip span` sizing (use `.remote-chip-dot`).

### Verified

- `npm run typecheck`
- `npm run test:coverage` (171 tests)
- `npm run build`
- `npm run package`

## 1.2.0 - 2026-06-13

### Added

- **Branch History** tab: horizontal timeline lanes, divergence ghost tracks, remote push markers, summary strip, and contextual quick actions (`branch-lifecycle.ts`, `branch-status.ts`, `components/history/`).
- **Native swimlane commit graph**: topology-driven lane assignment (`swimlanes.ts`) with per-row SVG rendering aligned to VS Code SCM graph behavior.
- Commit table **Author**, **Date**, and **Hash** columns; hash copy icon wired to `copy-hash` action.
- README screenshot for Branch History; updated Commit Graph and Branch Tracking screenshots.
- Cursor rules: `supergit-commit-graph.mdc`; Design folder guidance absorbed into `.cursor/rules/` and removed from repo.

### Changed

- Tab bar uses pill-style buttons with border, hover, and accent active state.
- Commit graph uses `--topo-order` log and dynamic graph column width (no fixed lane cap).
- `AGENTS.md` and agent rules reference `.cursor/rules/` instead of `Design/`.

### Fixed

- Commit table metadata no longer clipped when the graph pane is narrow (horizontal scroll + sticky header).
- Row keyboard handler no longer intercepts Enter/Space on the hash copy button.
- Branch History light-theme contrast for lane labels, hashes, LCA text, and summary stats.
- Parser/ref handling: `remoteNames` for slash remotes, `HEAD` vs `{remote}/HEAD`, swimlane merge-parent join-back.

### Verified

- `npm run typecheck`
- `npm run test:coverage` (118 tests)
- `npm run build`
- `npm run package`

## 1.1.1 - 2026-06-13

### Fixed

- Commit Graph **All** date range now loads the full history in one scrollable list instead of capping at 8 commits per page.
- Graph panel layout constrains height correctly so the commit list scrolls inside the panel.

### Verified

- `npm run typecheck`
- `npm run test:coverage` (68 tests)
- `npm run build`
- `npm run package`

## 1.1.0 - 2026-06-13

### Added

- v4 webview layout: denser commit graph (5 lanes, S-curves, Graph + Description columns), row-based branch tracking table, sidebar color dots and red current badge.
- VS Code theme adaptation: `--sg-*` CSS aliases mapped to `--vscode-*` variables, `ThemeProvider` for SVG/inline colors, `colorIndex` on branch/remote models, live refresh on theme change.
- Remote-only branches in Branch Tracking with Create Local Branch action.

### Changed

- Main/master lane reserved on lane 0; side lanes cycle 1–4.
- Design spec, AGENTS.md, and webview rules updated for hybrid theming (replaces hardcoded GitHub-dark-only guidance).

### Fixed

- Branch tracking pill borders and selected-state text contrast on themes such as Monokai Pro and Material Theme Kit (`--vscode-list-activeSelectionForeground`).

### Verified

- `npm run typecheck`
- `npm run test:coverage` (68 tests)
- `npm run build`
- `npm run package`

## 1.0.1 - 2026-06-13

### Added

- README screenshots for Commit Graph and Branch Tracking on the extension details page.
- `assets/CommitGraph.png` and `assets/BranchTracking.png` bundled with the extension.

### Changed

- Branch tracking Quick Actions dock stays pinned at the bottom while scrolling long branch lists.
- `vsce package` uses `--githubBranch main` so README screenshot links rewrite to GitHub raw URLs.
- Agent docs: fix vs GA workflow, dynamic version resolution, README screenshot packaging rules.

### Fixed

- Extension details page screenshots now resolve after PNGs are on `main` and the VSIX is rebuilt (relative README paths are rewritten to HTTPS on package).

### Verified

- `npm run typecheck`
- `npm run test:coverage` (67 tests)
- `npm run build`
- `npm run package`

## 1.0.0 - 2026-06-13

### Added

- Scoped commit history filtering (all branches, local branch, remote branch) from the graph sidebar.
- Remote-only branch listing grouped by remote in the branch sidebar.
- Lazy-loaded changed-files list in commit detail with click-to-open file diffs via `vscode.diff`.
- SuperGit diff content provider for in-editor commit file comparisons.
- Resizable commit detail panel with persisted width ratio (`detailShare`).
- Merge-parent continuation stubs in the commit graph when an off-page parent would break lane continuity.
- Branch tracking selection: click a local branch or remote row to choose the push/pull target.
- Contextual tracking recommendations (ahead → push, behind → pull, synced, diverged, no upstream) with primary action highlighting.
- Multi-remote QuickPick for fetch, push, and pull when multiple remotes are configured.
- Fast-forward pull for non-checked-out branches via `git fetch <remote> <branch>:<branch>`.
- Cursor agent rules under `.cursor/rules/` and expanded `AGENTS.md` operational guidance.

### Changed

- Branch tracking Quick Actions now target the selected branch/remote instead of only the checked-out branch.
- Branch tracking layout uses fixed column widths and truncates long branch names cleanly.
- Push/pull/set-upstream refresh branch tracking data immediately after successful actions.
- Commit detail diffs open beside the panel with `preserveFocus` so SuperGit stays focused.
- Commit table date format is `MM/DD HH:mm` (24-hour, single line).
- Webview buttons and branch pills use explicit dark-theme styling (`color-scheme: dark`).
- Unit test count increased to 67 with coverage for scoped history, remote branches, merge lanes, name-status parsing, and multi-remote actions.

### Fixed

- Pull on a selected non-checked-out branch no longer merges into the wrong branch while reporting success.
- Branch tracking ahead/behind badges now update after pull/push completes.
- White/unstyled branch and file buttons in the webview dark theme.
- `current` and `upstream` pills staying inside truncated branch rows.

### Verified

- `npm run typecheck`
- `npm run test:coverage` (67 tests)
- `npm run build`
- `npm run package`

### Known Limitations

- VS Code/Electron integration tests require a desktop-capable environment. Headless containers may fail `npm run test:integration` before extension load.

## 0.1.0 - 2026-06-13

### Added

- Initial SuperGit VS Code extension implementation.
- Dark VS Code-native webview for commit graph and branch tracking.
- Live Git data loading through a hybrid VS Code Git API plus Git CLI layer.
- Commit graph with branch lanes, merge rendering, refs, tags, selected commit detail, and pagination.
- Date filtering for 7 days, 14 days, 30 days, All, and custom ranges.
- Full-range commit search across message, hash, author, refs, and tags.
- Branch tracking diagram with multi-remote relationships and ahead/behind status.
- Guarded Git actions for fetch, pull, push, checkout, cherry-pick, revert, branch creation, tag creation, upstream setup, and pruning.
- Bottom VS Code status-bar button for opening SuperGit.
- `superGit.debug` setting and `SuperGit` output channel diagnostics.
- `SuperGit: Show Logs` and `SuperGit: Toggle Debug Logging` commands.
- Extension icon and webview logo from `assets/`.
- Unit tests for parser, runner, Git API wrapper, commands, and guarded actions.

### Changed

- Push actions without an explicit branch now run normal current-branch `git push` instead of `git push --all`.
- Webview implementation split into design-aligned components under `src/webview/components/`.
- Status bar now displays last-fetched timing when data is loaded.
- Webview JSX bundling now uses the automatic React runtime, preventing `React is not defined` render failures.
- Publisher ID is `lqdflying` for VS Code Marketplace publishing.

### Verified

- `npm run typecheck`
- `npm run test:coverage`
- `npm run build`
- `npm run package`

### Known Limitations

- VS Code/Electron integration tests require a desktop-capable environment. The current container cannot complete `npm run test:integration` because Electron fails before extension load due to sandbox/display restrictions.
