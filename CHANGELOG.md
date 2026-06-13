# Changelog

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
