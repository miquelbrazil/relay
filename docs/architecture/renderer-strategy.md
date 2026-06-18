# Architecture: Webview Renderer Strategy

**Status:** Accepted
**Last Updated:** 2026-06-18
**Related:** PRD: First-Class Payload Renderers (docs/blueprint/prd/payload-renderers.md)

This records how Relay's webview renders Ray payloads, and *why* it is structured the way
it is. It doubles as the contributor guide for adding a new payload type (§5).

## 1. Context

Relay receives Ray payloads, each tagged with a string `type`. The webview must turn each
into a DOM node. Originally a single `renderPayload()` function dispatched on the *shape* of
`content` (was `values` an array? was `content` a string?) and rendered everything else as
raw JSON. Adding a type meant extending that branchy function, and the "contract" a renderer
had to satisfy lived only in one author's head.

## 2. Decision

Render via a **strategy pattern**: one class per type implementing a shared
`PayloadRenderer` interface, selected at runtime by a type-keyed **registry** with an
explicit fallback. To make the interface a *compiled* contract (not a convention), the
webview is built by esbuild as its own TypeScript bundle and **shares the wire types with
the host** via `src/protocol.ts`.

```
RelayPayload ──▶ RendererRegistry.resolve(type) ──▶ PayloadRenderer.render(payload, ctx) ──▶ HTMLElement
                          │ miss
                          └────────────────────────▶ FallbackRenderer (pre-rendered HTML, else JSON)
```

### 2.1 The contract — `media/src/contract.ts`

```ts
interface PayloadRenderer {
  readonly type: string;                                  // the Ray payload.type it owns
  render(payload: RelayPayload, ctx: RenderContext): HTMLElement;
}
interface RenderContext {                                 // injected collaborators
  el, badge, sanitize, originLink, post
}
```

`RenderContext` is **dependency injection**: renderers receive their collaborators rather
than reaching for module globals (`DOMPurify`, the vscode bridge, `document`). That keeps
each renderer a pure `(payload, ctx) => HTMLElement` function — trivially unit-testable with
a fake context, and free of hidden coupling.

### 2.2 The registry — `media/src/registry.ts`

A `Map<type, PayloadRenderer>` with O(1) lookup and an explicit `FallbackRenderer`. Type
discrimination is a plain string, so a map beats a `canRender(payload)` predicate scan. If
structure-based matching is ever needed (e.g. two renderers competing for one type), the
predicate variant is the documented escape hatch — but it is not built, because nothing
needs it. The `FallbackRenderer` reproduces the original structure-sniff verbatim, so
unknown and not-yet-implemented types degrade exactly as they did before this refactor.

### 2.3 Why the webview is its own bundle — `esbuild.js`

The host and webview are **two programs in two runtimes**:

- **Host** (`src/extension.ts` → `dist/extension.js`): Node, `require('vscode')`, fs,
  sockets. Built `platform:node, format:cjs, external:['vscode']`, no DOM lib.
- **Webview** (`media/src/main.ts` → `media/main.js`): a sandboxed browser iframe with DOM +
  `acquireVsCodeApi()`, **no `require`, no Node, no `vscode`**. Built `platform:browser,
  format:iife`, DOM lib. Loaded by the browser via a `vscode-webview://` URI under CSP.

They cannot share one bundle: the build options are mutually exclusive, bundling one
runtime's code into the other breaks at load, and the webview is delivered as a standalone
file referenced from its HTML regardless. So there are **two esbuild entry points**. What
they *do* share is **source, not a bundle**: `src/protocol.ts` (the wire types) is imported
by both and esbuild inlines a copy into each output — one source of truth for the protocol,
two runtimes.

`DOMPurify` and `Sfdump` stay as separate vendored `<script>` tags (declared ambient in
`media/src/ambient.d.ts`); they are not bundled.

## 3. File map

```
src/protocol.ts                 # shared wire types (host owns; webview imports)
media/src/
  main.ts                       # entry: builds ctx + registry, message switch, toolbar, initDumps
  contract.ts                   # PayloadRenderer, RenderContext
  registry.ts                   # RendererRegistry
  context.ts                    # el/badge/sanitize + createContext(post) -> RenderContext
  ambient.d.ts                  # DOMPurify, Sfdump, acquireVsCodeApi
  renderers/
    html.ts                     # injectHtml() — shared sanitized-HTML injection
    frames.ts                   # RayFrame + renderFrame(s) — shared by exception/trace/caller
    LogRenderer.ts … CarbonRenderer.ts, FallbackRenderer.ts
media/main.js                   # BUILD OUTPUT (gitignored)
```

## 4. Click-to-jump reuse (exception / trace / caller)

Click-to-jump is **origin-driven and stateless on the host**: the webview posts
`{ type:'open-origin', origin }` and the host resolves it per click
(`RelayViewProvider.resolveOrigin`/`suffixResolve`). A stack frame is the same shape as an
origin once you map its `file_name`/`line_number` keys, so the frame renderers call
`ctx.originLink({ file: frame.file_name, line_number, hostname })` — the **exact** helper
footer origins use. Result: per-frame jump works with **zero host changes**. `hostname` is
threaded from the payload origin so `suffixResolve` can disambiguate identical relative
paths across containers.

## 5. How to add a renderer (recipe)

1. **Confirm the wire shape.** Find the type's `getType()` and `getContent()` in
   `spatie/ray` `src/Payloads/`, or capture a real payload from the "Ray (raw)" output
   channel. Note that several helpers share `type:'custom'` (differentiated by
   `content.label`).
2. **Write the class** in `media/src/renderers/YourRenderer.ts` implementing
   `PayloadRenderer`: set `readonly type = '<wire type>'` and build DOM via `ctx.el` /
   `ctx.badge`; inject untrusted HTML only through `ctx.sanitize`.
3. **Register it** in `media/src/main.ts` (add to the `RendererRegistry` array).
4. **Style it** in `media/main.css`. The wrapper carries `data-payload-type="<type>"`, and
   your class names are yours to style — no JS change needed for styling.
5. **Build & check:** `npm run compile` (or `npm run watch`) builds both bundles;
   `npm run check-types` covers host + webview; `npm run lint` covers `src` + `media/src`.
6. **Verify** in the Extension Development Host with a real `ray()` call.

Renderers are pure functions of `(payload, ctx)`, so they are tested headlessly with a
fake `RenderContext` (no browser, no DOMPurify): **`npm run smoke`**
(`scripts/smoke-renderers.ts`) exercises registry dispatch, each renderer's output, the
JSON fallback, and the frame `file_name`/`line_number` → origin mapping that powers
click-to-jump. Add a case there when you add a renderer.

## 6. Trade-offs

- **A build step now sits between editing the webview and seeing it.** `npm run watch`
  rebuilds on save, so in practice this is a reload, not a manual step. The gain is a
  compiled contract and shared protocol types instead of hand-duplicated wire shapes.
- **`media/main.js` is generated** (gitignored). Cloning then requires a build before the
  webview works — standard for build output, consistent with `dist/`.
