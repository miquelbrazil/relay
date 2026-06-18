# PRD: Message Archive

**Status:** Draft
**Version:** 0.1
**Last Updated:** 2026-06-17
**Tags:** `relay`, `archive`, `debugging`, `clear`, `webview`, `scope:relay-panel-evolution`

## Changelog

| Version | Date | Summary |
|---|---|---|
| 0.1 | 2026-06-17 | Initial draft. |

## 1. Summary

Make clearing the Relay panel **non-destructive**. Today, clearing discards debug output
permanently. This feature sends cleared output to an **archive** the developer can browse and
restore from — mirroring the archiving behavior Ray introduced in v3, where clearing the
screen to "start fresh between attempts" preserves the previous attempt for reference.

## 2. Problem & Motivation

Relay discards messages in three places, all silently and irreversibly:

1. **Manual clear** — the `relay.clear` title-bar / palette command empties the store.
2. **Ray screen controls** — a `ray()->newScreen()` or `clear_all` from instrumented code
   wipes the store remotely, often mid-session and unexpectedly.
3. **Trim eviction** — once the store passes `relayPanel.maxItems` (default 500), the oldest
   entries are dropped without notice.

The cost: a developer iterating on a bug clears the screen for a clean run, then realizes the
previous run held the value they needed — and it's gone. Ray solved exactly this with
archiving. Relay has the same destructive-clear problem and should adopt the same remedy.

## 3. Goals

- Clearing the live view moves entries to an archive instead of deleting them.
- A developer can browse archived entries without leaving the panel.
- A developer can restore one or more archived entries back to the live view.
- Archived entries retain full fidelity (payloads, color, label, origin, timestamp) and remain
  interactive (expandable dumps, click-to-jump origins).

## 4. Non-Goals

- Cross-session / on-disk persistence of the archive (see §8, Open Questions — deferred).
- Search or filtering *within* the archive beyond the existing color filters (future revision).
- Exporting the archive to a file (future revision).
- Any multi-window / side-by-side presentation — that is the separate Split-Screen Interface
  PRD (`scope:relay-panel-evolution`).

## 5. User Stories

- **Clear without loss.** As a developer, when I clear the panel to start a fresh run, my
  previous messages move to the archive so I can get them back if I need them.
- **Survive a remote new-screen.** As a developer, when my instrumented code calls
  `newScreen()`, the messages it cleared are archived rather than lost.
- **Browse the archive.** As a developer, I can switch the panel to an Archive view and scroll
  prior messages with the same cards, colors, and dump trees as the live view.
- **Restore selectively.** As a developer, I can send an archived entry (or the whole archive)
  back to the live view to compare it against current output.
- **Reclaim a clean slate.** As a developer, I can permanently empty the archive when I no
  longer need its contents.

## 6. Functional Requirements

### 6.1 Store
- Introduce an `archived` collection alongside the live `items` map in `RelayStore`, preserving
  insertion order and entry shape (`RelayItem`).
- On **manual clear** and **Ray screen controls** (`new_screen` / `clear_all`): move live
  entries into `archived` (newest-appended), then clear the live map. Emit the existing
  `cleared` event plus a new `archived` event carrying the moved entries.
- On **trim eviction**: evicted entries move to `archived` rather than vanishing (configurable;
  see §6.4).
- The archive is itself bounded by `relayPanel.maxArchivedItems`; overflow drops the oldest
  archived entries (true deletion at the archive boundary).
- New methods: `archiveSnapshot()`, `restore(uuid)` / `restoreAll()`, `clearArchive()`.

### 6.2 View
- The webview gains an **Archive view mode** toggled via a title-bar action and reflected as a
  body attribute (e.g. `data-view="archive"`), reusing the existing card renderer — no second
  rendering path.
- A visible count/affordance indicates how many entries the archive holds.
- The active color filters apply within whichever view is shown.

### 6.3 Commands & Menus
- `relay.showArchive` / `relay.showLive` (or a single toggle) in `view/title` and the palette.
- `relay.clearArchive` (palette; archive view title bar).
- `relay.restoreAll` (archive view) and per-entry restore affordance.

### 6.4 Settings
- `relayPanel.maxArchivedItems` (number, default e.g. 2000) — archive capacity bound.
- `relayPanel.archiveOnTrim` (boolean, default `true`) — whether trim-evicted live entries are
  archived or dropped.

## 7. Acceptance Criteria

- Clearing the live view (manual or via `clear_all`/`new_screen`) results in an archive
  containing exactly the entries that were live, in order, with fields intact.
- Switching to the Archive view renders those entries with working dump expansion and
  click-to-jump.
- Restoring an archived entry makes it appear in the live view and (per design) removes/keeps
  it in the archive consistently and without duplication.
- `relay.clearArchive` empties the archive and only the archive.
- With `archiveOnTrim` true, exceeding `maxItems` archives the oldest live entries rather than
  dropping them; with it false, behavior matches today.
- No regression to live ingest, color filtering, or the color-style picker.

## 8. Open Questions

- **Persistence across reloads.** The store is in-memory; nothing survives a window reload
  today. Ray's archive persists. Should Relay persist the archive (workspaceState / globalState
  / disk), and at what size cost? Deferred from v0.1; revisit before `Active`.
- **Restore semantics.** Does restoring *move* an entry (archive → live) or *copy* it? Moving
  avoids duplicate UUIDs in two collections; copying preserves the archive as a record.
- **Archive bound vs. Ray's "no limit."** Ray imposes no archive cap. A bound protects extension
  memory; confirm a default that is generous but safe.

## 9. References

- Ray archiving: https://myray.app/docs/getting-started/using-ray#archiving-messages
- Related effort: PRD: Split-Screen Interface (`scope:relay-panel-evolution`).
