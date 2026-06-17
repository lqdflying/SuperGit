# Design workspace

Optional scratch area for UI mockups, proposals, and visual exploration.

**Canonical product behavior and UI rules live in** [`.cursor/rules/supergit-*.mdc`](../.cursor/rules/).

When a design is approved for implementation:

1. Absorb the behavior into the relevant scoped rule file (e.g. `supergit-files-diff.mdc`).
2. Implement in `src/webview/` (and Git layer if needed).
3. Remove or archive superseded mockups from this folder.

Do not treat files here as runtime source of truth — the extension reads bundled code and rules, not this directory.
