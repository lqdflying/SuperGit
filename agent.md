# SuperGit Agent Notes

These notes capture the practical lessons from building and debugging the SuperGit VS Code extension in this repo. Use them as operating guidance for future coding agents working here.

## Project Intent

- Build a VS Code extension named `SuperGit`.
- The source of truth for product behavior and UI is the `Design/` folder.
- Use `Design/git-graph-extension-spec.md` for implementation details and `Design/git-graph-extension-ui-v2.jsx` as the visual reference.
- Use assets from `assets/`:
  - `assets/icon.png` for the extension/package/panel icon.
  - `assets/logo.png` for the webview title/logo.

## Design Lessons

- Read all files in `Design/` before changing UI or behavior.
- Preserve the design goals:
  - dark VS Code-native webview
  - commit graph tab
  - branch tracking tab
  - multi-remote visibility
  - guarded Git actions
  - compact, tool-like UI, not a landing page
- Keep the webview layout dense and operational. This is a developer tool, so prioritize scanning, status, and actions over decorative UI.
- Use stable dimensions for graph lanes, sidebars, toolbar buttons, rows, and status areas to prevent layout shift.
- Do not replace real design elements with explanatory text. The UI itself should be usable.

## Extension Architecture

- Extension host entry: `src/extension.ts`.
- Git layer:
  - `src/git/api.ts` wraps VS Code's built-in `vscode.git` API.
  - `src/git/runner.ts` runs Git CLI commands with timeouts and noninteractive env.
  - `src/git/parser.ts` parses Git stdout.
  - `src/git/commands.ts` exposes higher-level read models.
  - `src/git/actions.ts` handles guarded write actions.
- Webview:
  - `src/webview/main.tsx` mounts React.
  - `src/webview/App.tsx` owns app state and message handling.
  - `src/webview/components/` contains design-aligned UI sections.
  - `media/styles.css` contains the webview CSS.
- Shared contracts:
  - `src/shared/types.ts`
  - `src/shared/tokens.ts`

## Package Manifest

Important `package.json` entries:

```json
{
  "main": "./dist/extension.js",
  "icon": "assets/icon.png",
  "activationEvents": [
    "onStartupFinished",
    "workspaceContains:.git",
    "onCommand:superGit.show"
  ],
  "extensionDependencies": ["vscode.git"]
}
```

Commands to keep available:

- `superGit.show` -> opens the graph webview.
- `superGit.showLogs` -> shows the SuperGit output channel.
- `superGit.toggleDebug` -> toggles debug logging.

Setting:

```json
{
  "superGit.debug": true
}
```

This setting can be placed in VS Code Settings JSON. Debug output goes to the `SuperGit` output channel and to a log file under the VS Code Server logs.

## Build Lessons

Use esbuild for both extension host and webview bundles.

The webview React bundle must use automatic JSX runtime:

```js
const webviewConfig = {
  format: "iife",
  platform: "browser",
  target: "es2022",
  jsx: "automatic"
};
```

Why this matters: without `jsx: "automatic"`, esbuild can emit `React.createElement(...)` calls. The webview code imports named APIs like `StrictMode`; it does not define a global `React`, so the UI can fail at runtime with:

```text
ReferenceError: React is not defined
```

Verification for this issue:

```bash
rg -n "React\\.createElement\\(" dist/webview/main.js
rg -n "react/jsx-runtime" dist/webview/main.js
```

The first command should not show generated app JSX calls. The second should show the bundled React JSX runtime.

## Webview Lessons

Register the webview message listener before assigning `panel.webview.html`.

Correct order:

1. Create the panel.
2. Set `panel.iconPath`.
3. Register `panel.onDidDispose`.
4. Register `panel.webview.onDidReceiveMessage`.
5. Assign `panel.webview.html`.

Reason: the webview can execute quickly and post `ready` before the extension host starts listening.

Use a fallback inside `#root`:

```html
<div id="root">
  <div class="boot-fallback">
    <strong>SuperGit</strong>
    <span>Loading Git graph...</span>
  </div>
</div>
```

If the user sees only `Loading Git graph...`, HTML and CSS loaded, but React did not complete rendering.

Use webview-stage logging:

- `webview html loaded`
- `webview bundle loaded`
- `react app render scheduled`
- `webview app mounted`
- `ready`

These markers separate CSP/resource problems from JavaScript runtime problems.

Use `acquireVsCodeApi()` once. If an inline bootstrap script gets the API, store it on `window.__SUPERGIT_VSCODE_API__` and reuse it in the React bundle.

## CSP And Resource Lessons

Keep the webview CSP strict:

```html
<meta http-equiv="Content-Security-Policy"
  content="default-src 'none';
  img-src ${webview.cspSource} data:;
  style-src ${webview.cspSource} 'unsafe-inline';
  script-src 'nonce-${nonce}';">
```

Local resource roots must include:

- `dist/webview`
- `media`
- `assets`

Use `webview.asWebviewUri(...)` for `main.js`, `styles.css`, and `logo.png`.

## Debug Logging

The logger is in `src/logger.ts`.

Log levels:

- `info`, `warn`, and `error` always write.
- `debug` writes only when `superGit.debug` is true.

The log file path is under `context.logUri`, usually:

```text
~/.vscode-server/data/logs/<session>/exthost*/supergit.supergit/supergit.log
```

Also check the output channel mirror:

```text
~/.vscode-server/data/logs/<session>/exthost*/output_logging_*/<n>-SuperGit.log
```

## Remote VS Code Server Log Checks

This repo was debugged on a remote VS Code Code Server host. The local `code` CLI may not work from the Codex shell.

Useful log files:

- `~/.vscode-server/data/logs/<session>/remoteagent.1.log`
  - extension install/uninstall events
  - cache invalidation
- `~/.vscode-server/data/logs/<session>/remoteagent.log`
  - server connection and file watcher state
- `~/.vscode-server/data/logs/<session>/exthost*/remoteexthost.log`
  - extension activation events
  - extension host crashes/errors
- `~/.vscode-server/data/logs/<session>/exthost*/supergit.supergit/supergit.log`
  - SuperGit extension diagnostics
- `~/.vscode-server/data/logs/<session>/exthost*/vscode.git/Git.log`
  - built-in Git extension logs

Find latest SuperGit logs:

```bash
find ~/.vscode-server/data/logs -path '*supergit.supergit/supergit.log' -type f -printf '%T@ %p\n'
find ~/.vscode-server/data/logs -path '*SuperGit.log' -type f -printf '%T@ %p\n'
```

Inspect the current one:

```bash
tail -n 220 ~/.vscode-server/data/logs/<session>/exthostN/supergit.supergit/supergit.log
```

Search narrowly. Broad `rg` over all VS Code logs creates huge noise.

Good targeted search:

```bash
rg -n "webview:|webview message received|webview html assigned|resource URIs|command invoked|creating SuperGit|revealing existing|error|warn|failed" ~/.vscode-server/data/logs/<session>/exthostN
```

## Symptom Diagnosis

No status-bar button:

- Check `activationEvents`.
- Check `vscode.window.createStatusBarItem(...)`.
- Check `statusBarItem.command = "superGit.show"`.
- Check `remoteexthost.log` for `ExtensionService#_doActivateExtension supergit.supergit`.

Status button click does nothing:

- Look for `command invoked {"command":"superGit.show"}`.
- If absent, command contribution or status bar command wiring is wrong.

Webview opens but only shows `Loading Git graph...`:

- HTML and CSS loaded.
- Check for:
  - `webview html loaded`
  - `webview bundle loaded`
  - `react app render failed`
  - `webview window error`

`webview html loaded` exists but `webview bundle loaded` is absent:

- Script was blocked or failed to load.
- Check CSP, nonce, `localResourceRoots`, and the `scriptUri`.

`webview bundle loaded` exists but `webview app mounted` is absent:

- JavaScript loaded but React crashed.
- In this session the cause was `React is not defined`, fixed by esbuild `jsx: "automatic"`.

`webview app mounted` exists but no data:

- Check for `webview message received {"type":"ready"}`.
- If missing, message listener registration or VS Code API bridge is wrong.
- If present, check Git/repository logs.

`ready` exists but no commits:

- Check `resolved repository root`.
- Check `vscode.git API resolved`.
- Check Git command logs from `src/git/runner.ts`.
- Check opened workspace is a Git repository.

## Install And Packaging Lessons

Build and package:

```bash
npm run typecheck
npm run test:coverage
npm run build
npm run package
```

For normal test VSIX builds, keep the current package version unless the user explicitly asks for a GA/release/version bump. Same-version test builds are acceptable, but stale installs are common; tell the user to uninstall/reload/reinstall when needed.

The VSIX is:

```text
/home/opc/SuperGit/supergit-0.1.0.vsix
```

Install through the remote VS Code window:

1. Extensions panel.
2. `...` menu.
3. `Install from VSIX...`.
4. Select `/home/opc/SuperGit/supergit-0.1.0.vsix`.
5. Run `Developer: Reload Window`.

Same-version reinstall warning:

- This project currently packages as `0.1.0`.
- VS Code may keep an old same-version install.
- If fixes do not appear, uninstall SuperGit, reload, install the VSIX, reload again.

The generic `code --install-extension` may fail on this host with:

```text
No installation of Visual Studio Code stable was found.
```

The remote CLI may also refuse non-VS Code terminals:

```text
Command is only available in WSL or inside a Visual Studio Code terminal.
```

When that happens, tell the user to install from the VS Code UI rather than forcing writes into `~/.vscode-server/extensions`.

Do not install, reinstall, reload, or manually overwrite the VS Code Server extension from agent actions unless the user explicitly asks. Build/package the VSIX and let the user install/reload it.

For this repo, `npm run package` currently uses `vsce package --no-dependencies --allow-missing-repository` because the React webview and extension code are bundled into `dist/`. Before a GA release, re-check the VSIX contents and runtime dependency story. If any runtime dependency is not bundled, remove `--no-dependencies` or otherwise ensure `vsce` includes it.

## GA Release Policy

Use this only when the user explicitly asks for GA, release, publish prep, or version bump.

Release checklist:

1. Bump `package.json` and `package-lock.json` to the requested version.
2. Add a dated `CHANGELOG.md` entry with explicit release notes.
3. Run the full local verification suite:

   ```bash
   npm run typecheck
   npm run test:coverage
   npm run build
   npm run package
   ```

4. Inspect the VSIX contents with `unzip -l`.
5. Commit the release changes.
6. Push the release commit.
7. Create and push tag `vX.Y.Z`.
8. Create a GitHub release with the matching `supergit-X.Y.Z.vsix` asset.
9. Verify the release asset uploaded.

Do not publish to the VS Code Marketplace from agent actions unless the maintainer explicitly asks for marketplace publishing and provides the required credentials/process. The normal policy is that the maintainer publishes manually.

If a release must be redone for the same version:

1. Delete the GitHub release.
2. Delete or move the tag as appropriate.
3. Apply the fix.
4. Rebuild and repackage the VSIX.
5. Commit and push.
6. Recreate the tag at the corrected commit.
7. Recreate the GitHub release with explicit notes and the rebuilt asset.

## Verification Lessons

Always run:

```bash
npm run typecheck
npm run test:coverage
npm run build
npm run package
```

Current expected unit status:

- 53 tests passing.
- Coverage above the design target for `src/git/*.ts`.

`npm run test:integration` may fail in managed containers because Electron cannot start before extension load due to sandbox/display restrictions. Report this clearly instead of treating it as a product failure.

Check VSIX contents:

```bash
unzip -l supergit-0.1.0.vsix
```

Expected included files:

- `extension/package.json`
- `extension/readme.md`
- `extension/changelog.md`
- `extension/assets/icon.png`
- `extension/assets/logo.png`
- `extension/dist/extension.js`
- `extension/dist/webview/main.js`
- `extension/media/styles.css`

## Git Safety Lessons

- The worktree may be dirty because this repo is being created/iterated.
- Do not revert user changes.
- Keep fixes scoped.
- Avoid destructive Git commands unless explicitly requested.
- Use `rg` and `rg --files` first for searches.
- Use `apply_patch` for manual file edits.

## General Agent Policy

- If a repo-specific memory or agent instruction file exists, read only the relevant repo-specific guidance. Do not import unrelated memories from other projects.
- Do not infer hidden request fields from summarized debug logs. If a field or event is not visible in the log summary, treat the log as inconclusive and add better diagnostics instead of claiming it happened.
- When logs are large, search narrowly by current session and extension name. Broad searches over all VS Code Server logs create noise and can hide the useful signal.
- When the user provides screenshots or image URLs, fetch or open the image and inspect it directly. Do not infer UI details from the filename or URL alone.
- Keep release notes explicit and based on the changelog or actual commit summary. Do not rely only on generated release notes.
- For current model, API, provider, or platform metadata in other projects, verify official documentation rather than relying on memory. For SuperGit, this applies most directly to VS Code extension API behavior and packaging rules.

## Final Checklist For Future UI Failures

1. Enable debug:

   ```json
   {
     "superGit.debug": true
   }
   ```

2. Reload VS Code window.
3. Click `SuperGit`.
4. Open `SuperGit: Show Logs`.
5. Confirm stages:

   ```text
   command invoked
   creating SuperGit webview panel
   webview html assigned
   webview: webview html loaded
   webview: webview bundle loaded
   webview: react app render scheduled
   webview: webview app mounted
   webview message received {"type":"ready"}
   repository state loaded
   commits loaded
   branches loaded
   remotes loaded
   ```

6. If any stage is missing, debug from that boundary.
