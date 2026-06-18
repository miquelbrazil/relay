import type { RelayPayload, RelayOrigin } from '../../src/protocol';

// Collaborators handed to every renderer. Renderers depend on THIS interface, not on
// module-level globals (DOMPurify, the vscode bridge, document) — so each renderer is a
// pure (payload, ctx) => HTMLElement function and can be unit-tested with a fake context.
export interface RenderContext {
  // Typed element factory: el('a') is an HTMLAnchorElement, el('button') a button, etc.
  el<K extends keyof HTMLElementTagNameMap>(tag: K, cls?: string): HTMLElementTagNameMap[K];
  badge(text: string, cls?: string): HTMLSpanElement;
  // Sanitize untrusted HTML off the localhost socket before innerHTML injection.
  sanitize(html: string): string;
  // A click-to-jump link for an origin OR a stack frame (same shape) — posts
  // { type: 'open-origin', origin }, which the host resolves to a local file.
  originLink(origin: RelayOrigin): HTMLAnchorElement;
  // Send a message to the extension host.
  post(message: unknown): void;
}

// One renderer strategy. `type` is the Ray payload.type it owns; the registry keys off it.
export interface PayloadRenderer {
  readonly type: string;
  render(payload: RelayPayload, ctx: RenderContext): HTMLElement;
}
