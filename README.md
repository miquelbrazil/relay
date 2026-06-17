# Relay

A Visual Studio Code panel for [Ray](https://myray.app) debug output.

Relay listens for `spatie/ray` payloads and renders them in a panel inside VS Code, so your dump output appears alongside your code instead of in a separate desktop window.

> **Status: early development.** The transport and rendering layers are still being built. Not yet usable as a daily driver — see the [Roadmap](#roadmap).

## Why

Ray sends debug output to a dedicated desktop app, which means a second window to arrange, focus, and switch back from. On a single laptop screen that is a lot of back-and-forth. Relay is for developers who live in the editor and would rather have that output dock next to the terminal and problems panel — without giving up Ray's rich, expandable rendering.

## How it works

Ray clients (`spatie/ray`, `spatie/laravel-ray`, and others) serialize each `ray()` call to JSON and `POST` it to a local HTTP port — `23517` by default. Relay runs an HTTP server on that port from inside the VS Code extension host. From the client's perspective, Relay *is* the Ray receiver, so **no application code changes are required**: your existing `ray()` calls work unchanged.

Dumped objects and arrays are rendered with [Symfony VarDumper](https://symfony.com/doc/current/components/var_dumper.html) — the same HTML the Ray client already produces before sending — so the familiar expand/collapse tree view is preserved.

Because Relay binds the same port Ray.app uses, the two cannot run at once. During development you can point a single project at a different port (e.g. `23518`) and run both side by side to compare output.

## Roadmap

- [x] Project scaffold (TypeScript + esbuild)
- [ ] Webview panel registered in the bottom panel area
- [ ] HTTP server receiving and acknowledging Ray envelopes
- [ ] Payload store with uuid-keyed mutation (`color`, `label`, `remove`, …)
- [ ] Renderers for common payload types (log, custom/html, table, json, exception)
- [ ] Click-to-jump from origin link to source line
- [ ] Per-project filtering for interleaved output
- [ ] `ray()->pause()` support (Continue / Stop)
- [ ] Status bar indicator and clear/toggle commands

## Requirements

- Visual Studio Code 1.90 or later
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

| Setting            | Default       | Description                                                              |
| ------------------ | ------------- | ------------------------------------------------------------------------ |
| `relay.port`       | `23517`       | Port to listen on. Must match the `port` in your client's `ray.php`.     |
| `relay.host`       | `127.0.0.1`   | Bind address. Use `0.0.0.0` to accept payloads from containers on Linux. |
| `relay.maxItems`   | `500`         | Maximum number of entries kept before the oldest are dropped.            |
| `relay.pathMappings` | `[]`        | Rewrite container paths to local paths for click-to-jump origins.        |

**Containerized projects (Docker, Lando, Sail):** the client must reach the host. Configure your `ray.php` `host` (commonly `host.docker.internal`) as you would for Ray.app. Path mapping for origin links is handled either by `remote_path`/`local_path` in `ray.php` or by `relay.pathMappings`.

## Usage

1. Open the **Ray** view in the bottom panel (alongside Terminal and Output).
2. Make sure Ray.app is not running, or set `relay.port` to a free port.
3. Call `ray(...)` from your application as usual.

Output appears in the panel as it arrives. Click an origin link to open that file at that line.

## Relationship to Ray

Relay is an independent, unofficial project. It is **not affiliated with, endorsed by, or sponsored by Spatie.**

Ray is a polished commercial application with features Relay does not aim to replicate — remote SSH debugging, an MCP server, theming, macros, and more. If you want the full experience, buy a license at [myray.app](https://myray.app); the client libraries Relay depends on are part of that ecosystem. Relay exists for the narrower case of keeping basic dump output inside the editor.

"Ray" is a trademark of Spatie. Relay reads the publicly documented Ray protocol and reuses the open-source [`spatie/ray`](https://github.com/spatie/ray) client output; it does not bundle or redistribute any Spatie application code.

## Development

Scaffolded with `yo code` (TypeScript + esbuild).

```bash
npm install
# Press F5 to launch the Extension Development Host
```

The architecture separates three concerns: an HTTP server (transport), a payload store in the extension host (state, survives the panel being closed), and a webview (rendering). State lives in the host and is replayed to the webview on open, so the panel can be hidden and reopened freely.

## License

MIT
