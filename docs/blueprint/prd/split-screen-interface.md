# PRD: Split-Screen Interface

**Status:** Draft
**Version:** 0.1
**Last Updated:** 2026-06-17
**Related:** PRD: Message Archive (docs/blueprint/prd/message-archive.md)
**Tags:** `relay`, `webview`, `multi-window`, `ux`, `exploratory`, `scope:relay-panel-evolution`

## Changelog

| Version | Date | Summary |
|---|---|---|
| 0.1 | 2026-06-17 | Initial draft (exploratory; potential uses captured for later discussion). |

## 1. Summary

Explore letting Relay present **more than one surface at a time** — for example, the live
stream and the archive side by side, or two independently-filtered views of the same output.
This is an **exploratory** Blueprint: it scopes the architectural change and, per the request,
records **potential uses as a discussion point for later** (§6) rather than committing to a
build.

## 2. Problem & Motivation

Relay today is a **singleton webview view** (`relayPanel.view` in the `relayPanelContainer`
panel). The webview-view API permits one instance per view ID, and a single HTTP server feeds a
single store feeds that one view. Consequently a developer can only ever see **one lens** on the
output at a time. To compare two perspectives — errors vs. everything, current run vs. previous
run, project A vs. project B — they must toggle state back and forth and hold the difference in
their head.

The Message Archive PRD makes this concrete: once an archive exists, "live in one column,
archive in another" is the natural next ask, and a toggle cannot satisfy it.

## 3. Goals (if pursued)

- Allow a second Relay surface to be opened alongside the first.
- Let each surface carry independent view state (which view: live/archive; which color filters).
- Keep a single source of truth: one server, one store, broadcasting to N surfaces.

## 4. Non-Goals

- Independent data per surface (multiple servers/stores). All surfaces observe the same store.
- Replacing the existing panel-docked view; the split is additive.
- Built-in window management beyond what VS Code already provides.

## 5. Design Direction (sketch, not committed)

- Move the secondary surface from the webview-**view** API to a **`WebviewPanel`**
  (`createWebviewPanel`), which can occupy an editor column and be dragged to another VS Code
  window/monitor.
- Generalize `RelayViewProvider`'s "dumb renderer fed by store events" contract so the store
  can fan out `added/updated/removed/cleared/archived` events to multiple registered webviews.
- Per-surface UI state (view mode, color filters) lives in each webview's own `getState`, as the
  color filter already does today.

## 6. Potential Uses — Discussion Point for Later

> Captured for a future decision on whether to build this. Not yet prioritized.

- **Live + Archive together.** The motivating case: watch the current run while the previous
  run stays visible beside it. Turns the archive from a flip-to-view into a true comparison.
- **Independent filter slices.** One surface pinned to red (errors), another showing the full
  stream — instead of toggling the single filter set back and forth.
- **Per-project columns.** Items already carry `projectName`; separate surfaces could each pin
  one project when several apps POST to the same Ray port (e.g. frontend + API).
- **Multi-monitor debugging.** Pop a surface onto a second monitor while code stays on the
  primary. *Caveat:* recent VS Code already supports "Move View into New Window" for the
  existing view, which may cover this case without any code change — to be verified before this
  is used to justify the work.
- **Focused dump pinning (stretch).** A surface dedicated to a single pinned payload/dump while
  the main surface keeps streaming.

## 7. Risks & Considerations

- **Architectural cost.** Switching from the declarative webview-view model to programmatic
  `WebviewPanel`s, plus store fan-out, is a non-trivial refactor of the current single-view
  contract.
- **Maintenance surface.** Every future panel feature must work across N surfaces.
- **Possible redundancy.** If VS Code's native window-moving already satisfies the multi-monitor
  need, only the *simultaneous independent surfaces* use cases justify the build. Validate the
  native baseline first.

## 8. Sequencing

Recommended: ship **Message Archive** first within the singleton view. Treat constant
Live↔Archive toggling as the empirical signal that this PRD is worth promoting from
exploratory to a committed build. Do not undertake the refactor solely to host the archive.

## 9. Open Questions

- Does VS Code's current "Move View into New Window" already satisfy the multi-monitor use case
  for the existing single view? (Determines how much value remains.)
- Minimum viable scope if pursued: exactly two surfaces, or arbitrary N?
- Does any use case truly need independent *data*, or do all reduce to independent *views* of
  one store? (Current assumption: the latter.)

## 10. References

- Related effort: PRD: Message Archive (`scope:relay-panel-evolution`).
- Ray archiving (motivating prior art): https://myray.app/docs/getting-started/using-ray#archiving-messages
