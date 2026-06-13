# Changelog

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
