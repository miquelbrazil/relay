# PRD: First-Class Payload Renderers

**Status:** Implemented
**Version:** 1.0
**Last Updated:** 2026-06-18
**Related:** Architecture: Webview Renderer Strategy (docs/architecture/renderer-strategy.md)
**Tags:** `relay`, `webview`, `ray-protocol`, `renderers`, `scope:relay-panel-evolution`

## Changelog

| Version | Date | Summary |
|---|---|---|
| 1.0 | 2026-06-18 | First-class renderers for the Ray display types; webview moved to a TypeScript strategy-pattern bundle. |

## 1. Summary

Relay receives many payload **types** from the spatie/ray protocol, but historically only
`log` rendered richly. Every other type fell through to a raw `JSON.stringify` dump. This
feature adds **first-class renderers for the remaining display types** — exception, trace,
caller, table, json, measure, carbon, and the `custom` family (html/text/image/send) — so
Relay presents them the way Ray.app does instead of as raw JSON.

Behavioral/control types (notify, confetti, `create_lock`/pause) are **explicitly out of
scope** for this iteration (see §5).

## 2. Problem & Motivation

`ray()` can emit far more than dumps. A developer calling `ray()->table($rows)`,
`ray()->exception($e)`, or `ray()->measure()` got an unreadable JSON blob in Relay, with no
formatting and — critically for exceptions and traces — **no click-to-jump on stack
frames**. The single `log` renderer made Relay a partial Ray replacement; the gap was every
non-dump call.

A second, structural problem: the webview renderer dispatched on the *shape* of
`content` rather than the payload `type`, so adding a type meant extending a tangle of
`if (Array.isArray(...))` branches. That does not scale to a dozen types.

## 3. Goals

- A dedicated, readable renderer for each Ray **display** type.
- Per-frame **click-to-jump** for `exception`, `trace`, and `caller`, reusing the existing
  origin-resolution path (no new host code).
- Unknown / not-yet-supported types **degrade exactly as before** (pre-rendered HTML if
  present, else a JSON dump) — never a hard failure.
- A renderer architecture where adding a type is a mechanical, local change (see the
  architecture doc's recipe).

## 4. The type catalog (as implemented)

Discriminators and content shapes confirmed against `spatie/ray@main` `src/Payloads/`.

| `type` | Ray call | Renderer | Notes |
|---|---|---|---|
| `log` | `ray($x)` | `LogRenderer` | sf-dump HTML in `content.values[]` (unchanged behavior). |
| `custom` | `ray()->html()` / `->text()` / `->image()` / `->send()` | `CustomRenderer` | **All four share `type:'custom'`**, distinguished by `content.label`. Body is `content.content` HTML; label shown as a chip (previously dropped). |
| `json_string` | `ray()->json('...')` | `JsonStringRenderer` | Pretty-prints `content.value` (a JSON string). |
| `exception` | `ray()->exception($e)` | `ExceptionRenderer` | `{ class, message, frames[] }`; per-frame click-to-jump. |
| `trace` | `ray()->trace()` | `TraceRenderer` | `{ frames[] }`; per-frame click-to-jump. |
| `caller` | `ray()->caller()` | `CallerRenderer` | single `content.frame`. |
| `table` | `ray()->table($rows)` | `TableRenderer` | `content.values` is an associative map; values may be sf-dump HTML or scalars. |
| `measure` | `ray()->measure()` | `MeasureRenderer` | timing + peak-memory stats. |
| `carbon` | `ray()->carbon($d)` | `CarbonRenderer` | `{ formatted, timestamp, timezone }`. |
| *anything else* | — | `FallbackRenderer` | pre-rendered HTML or JSON dump — the pre-feature behavior. |

**Frame click-to-jump key names (authoritative):** frames serialize file/line as
`file_name` / `line_number` (snake_case) — not `file`. Each frame is mapped to an origin
`{ file: file_name, line_number, hostname }` and handed to the same `open-origin` path
footer origins use, so the host resolves it with `resolveOrigin`/`suffixResolve` unchanged.

## 5. Out of scope (deferred)

Behavioral and app-control payloads, which are not list entries and need host/socket
plumbing rather than a renderer:

- `notify` — should raise a native `showInformationMessage`, not a list row.
- `confetti` — a transient webview effect.
- `create_lock` / `ray()->pause()` — needs Continue/Stop UI and a **stateful** `/locks/`
  endpoint so PHP execution actually blocks (today `RelayServer` releases unconditionally).
- `hide_app` / `show_app`, `screen_color`, `separator`, `notify`, and the other
  non-display payloads in `src/Payloads/`.

These all currently hit the `FallbackRenderer` (JSON), which is acceptable until scoped.

## 6. Known limitations

- **Remote images.** `ray()->image($url)` injects an `<img src="$url">`. The webview CSP
  `img-src` allows only the webview origin and `data:` URIs, so remote-URL images may not
  load. Broadening the CSP is a separate decision.
- **Exception snippets.** Exception frames carry a `snippet` array (source context); v1
  renders the frame list only, not inline snippets.

## 7. Verification

Point a PHP project's `ray()` calls at Relay (or replay captured envelopes) and confirm
each type renders first-class rather than as JSON: `table`, `json`, `exception`, `trace`,
`caller`, `measure`, `carbon`, `html`/`text`/`image`/`send`. For `exception`/`trace`,
click a frame and confirm it opens the right file/line (including container paths, which
exercise `suffixResolve`). Regression: `log` dumps stay interactive, the color/label
filters still work, and a synthetic unknown type still falls back to JSON.
