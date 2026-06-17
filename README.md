# Relay

A Visual Studio Code panel for [Ray](https://myray.app) debug output.

Relay runs a Ray-compatible receiver inside VS Code and renders `spatie/ray` payloads in a panel next to your code — expandable dump trees, color filtering, and click-to-jump origins — so your debug output lives in the editor instead of a separate desktop window.

> **Status: usable, pre-release.** The core loop (capture → store → render) works end to end, including theme-aware dumps and click-to-jump. Some payload types still fall back to raw JSON and packaging isn't published yet — see the [Roadmap](#roadmap).

## Features

- **Drop-in Ray receiver.** Binds the Ray port (`23517` by default) and speaks the Ray protocol, so existing `ray()` calls work with **no application changes**.
- **Rich dump rendering.** Object/array dumps render as the familiar Symfony VarDumper (`sf-dump`) expand/collapse trees — the same HTML the Ray client already produces.
- **Theme-aware.** Dumps recolor to the active VS Code theme — light *or* dark — using the editor's own debug-token colors, and update live when you switch themes.
- **Click-to-jump origins.** Click a `file:line` origin to open it at that line. Paths are resolved even for container paths (`/app/...`) via a zero-config workspace resolver, with an explicit override available.
- **Color filtering.** A toolbar of Ray-style color dots filters output by `ray()->color(...)`, with a clear-all button. Selection persists across the panel being hidden.
- **Labels & timestamps.** A badge is shown only when `ray()->label(...)` is set; each entry shows its origin and receipt time (`HH:MM:SS.mmm`).
- **Survives hide/reopen.** State lives in the extension host and replays to the panel, so the panel can be collapsed or moved without losing history.
- **At-a-glance server state.** A status bar item shows listening / stopped / port-busy and toggles the server on click; a clear button sits in the panel title bar.
- **Safe by construction.** Incoming HTML is sanitized (DOMPurify) and scripts are stripped; the webview CSP never enables `unsafe-inline`.

## Why

Ray sends debug output to a dedicated desktop app — a second window to arrange, focus, and switch back from. On a single laptop screen that's a lot of back-and-forth. Relay is for developers who live in the editor and would rather dock that output next to the terminal and problems panel, without giving up Ray's rich rendering.

## How it works

Ray clients (`spatie/ray`, `spatie/laravel-ray`, and others) serialize each `ray()` call to JSON and `POST` it to a local HTTP port — `23517` by default. Relay runs that HTTP server from inside the VS Code extension host. From the client's perspective, Relay *is* the Ray receiver, so no application code changes are required.

The pipeline is three decoupled stages:

```
ray() ──POST──▶ HTTP server ──▶ payload store ──events──▶ webview (panel UI)
                (transport)      (state, host)             (rendering)
                                      ▲
                                      └── snapshot replayed on (re)open
```

- **HTTP server** acknowledges envelopes immediately (the client blocks your app while waiting), then emits them.
- **Payload store** is the source of truth. It's keyed by uuid so chained calls like `ray($x)->color('red')->label('auth')` mutate one entry in place, applies modifier/screen-control payloads, and keeps a bounded history.
- **Webview** is a dumb renderer. Because VS Code destroys a hidden webview's DOM, the store replays its full snapshot whenever the panel reopens.

Because Relay binds the same port Ray.app uses, the two cannot run at once. During development you can point a single project at a different port (e.g. `23518`) and run both side by side to compare output.

## Design notes

A few decisions that aren't obvious from the code:

- **The availability check must return `404`, not `200`.** The Ray client probes `GET /_availability_check` with `CURLOPT_FAILONERROR` and treats the server as present *only* when curl reports an HTTP error (a 404 → `CURLE_HTTP_NOT_FOUND`). Returning `200` makes the client conclude nothing is listening and silently drop every payload.
- **Origin resolution is a precedence chain**, evaluated per click: (1) explicit `relayPanel.pathMappings` override, (2) the path as-is if it exists on disk (the configured `ray.php` `remote_path`/`local_path` case), then (3) a zero-config fallback that locates the file by its tail under the window's workspace folders — longest match wins, with `origin.hostname` breaking ties between projects that share a relative path. It refuses rather than guessing when still ambiguous.
- **The webview is treated as disposable.** All state is in the host and replayed on `ready`; the panel can be hidden, moved, or reloaded freely.
- **Untrusted HTML is sanitized, not trusted.** Payload HTML arrives over a localhost socket any process can reach. Relay strips `<script>`/`<style>`, sanitizes with DOMPurify, and re-enables the dump tree's interactivity with a *vendored* copy of VarDumper's `Sfdump` — never by relaxing the CSP.
- **Dump colors map to VS Code theme variables** (`--vscode-debugTokenExpression-*`) rather than VarDumper's hardcoded dark palette, so one stylesheet works on every theme.

## Roadmap

- [x] Webview panel registered in the bottom panel area
- [x] HTTP server receiving and acknowledging Ray envelopes
- [x] Payload store with uuid-keyed mutation (`color`, `label`, `remove`, …)
- [x] Renderer for log/dump payloads (sanitized, theme-aware sf-dump trees)
- [x] Click-to-jump from origin link to source line (with workspace path resolution)
- [x] Color filtering with persisted selection
- [x] Status bar indicator and clear/toggle commands
- [ ] First-class renderers for more payload types (`table`, `json`, `exception` with per-frame origins) — currently fall back to raw JSON
- [ ] Text and per-project filtering for interleaved output
- [ ] `ray()->pause()` support (Continue / Stop)
- [ ] Rethink color styling beyond the left border accent
- [ ] Package as a `.vsix` for install via dotfiles

## Requirements

- Visual Studio Code 1.120 or later
- A project using `spatie/ray`, `spatie/laravel-ray`, or another Ray-protocol client

## Installation

Relay is not published to a marketplace. Install from a packaged build:

```bash
# Build the .vsix
npm install
npm run package          # produces relay-<version>.vsix

# Install it
code --install-extension relay-<version>.vsix
```

## Configuration

| Setting                                | Default     | Description                                                                       |
| -------------------------------------- | ----------- | --------------------------------------------------------------------------------- |
| `relayPanel.port`                      | `23517`     | Port to listen on. Must match the `port` in your client's `ray.php`.              |
| `relayPanel.host`                      | `127.0.0.1` | Bind address. Use `0.0.0.0` to accept payloads from containers on Linux.          |
| `relayPanel.maxItems`                  | `500`       | Maximum number of entries kept before the oldest are dropped.                     |
| `relayPanel.resolveOriginsFromWorkspace` | `true`    | Locate click-to-jump targets by their tail under open workspace folders when the path isn't found as-is. |
| `relayPanel.pathMappings`              | `[]`        | Explicit override (highest precedence): rewrite a remote path prefix to a local one, e.g. `{ "remote": "/app", "local": "/Users/you/project" }`. |

**Containerized projects (Docker, Lando, Sail):** the client must reach the host. Set your `ray.php` `host` (commonly `host.docker.internal`) as you would for Ray.app. For click-to-jump, container paths resolve automatically against your open workspace folders — no `ray.php` `remote_path`/`local_path` or `relayPanel.pathMappings` needed unless a path is ambiguous across multiple open projects.

## Usage

1. Open the **Relay** view in the bottom panel (alongside Terminal and Output).
2. Make sure Ray.app is not running, or set `relayPanel.port` to a free port — the status bar item shows `Relay :port busy` on a conflict.
3. Call `ray(...)` from your application as usual.

Output appears in the panel as it arrives. Use the color dots to filter, the clear button (title bar) to reset, and click an origin link to open that file at that line. Raw envelopes are also logged to the **Ray (raw)** output channel for debugging.

## Relationship to Ray

Relay is an independent, unofficial project. It is **not affiliated with, endorsed by, or sponsored by Spatie.**

Ray is a polished commercial application with features Relay does not aim to replicate — remote SSH debugging, an MCP server, theming, macros, and more. If you want the full experience, buy a license at [myray.app](https://myray.app); the client libraries Relay depends on are part of that ecosystem. Relay exists for the narrower case of keeping dump output inside the editor.

"Ray" is a trademark of Spatie. Relay reads the publicly documented Ray protocol and reuses the open-source [`spatie/ray`](https://github.com/spatie/ray) client output; it does not bundle or redistribute any Spatie application code.

## Development

Scaffolded with `yo code` (TypeScript + esbuild).

```bash
npm install
# Press F5 to launch the Extension Development Host
```

Source layout:

| File                      | Responsibility                                                        |
| ------------------------- | -------------------------------------------------------------------- |
| `src/RelayServer.ts`      | HTTP transport: accepts envelopes, handles the availability/lock probes. |
| `src/RelayStore.ts`       | uuid-keyed, mutation-aware payload store with bounded history.        |
| `src/RelayViewProvider.ts`| Webview host: HTML/CSP, replay, and origin path resolution.          |
| `src/extension.ts`        | Wiring: config, server lifecycle, status bar, commands.              |
| `media/`                  | Webview assets — renderer (`main.js`/`main.css`) plus vendored `sf-dump.*` and `purify.min.js`. |

## License

MIT
