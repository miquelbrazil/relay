import type { RelayOrigin } from '../../src/protocol';
import type { RenderContext } from './contract';

// Typed element factory: el('a') is an HTMLAnchorElement, el('button') a button, etc.
export function el<K extends keyof HTMLElementTagNameMap>(tag: K, cls?: string): HTMLElementTagNameMap[K] {
  const e = document.createElement(tag);
  if (cls) {
    e.className = cls;
  }
  return e;
}

export function badge(text: string, cls?: string): HTMLSpanElement {
  const b = el('span', cls ? `relay-badge ${cls}` : 'relay-badge');
  b.textContent = text;
  return b;
}

// Strip <script>/<style> (we vendor our own sf-dump assets) but keep sf-dump's classes
// and data-* attributes, which DOMPurify preserves by default. Never use 'unsafe-inline'
// in the CSP to make raw payload scripts run — sanitize here instead.
export function sanitize(html: string): string {
  if (typeof html !== 'string') {
    return '';
  }
  return DOMPurify.sanitize(html, { FORBID_TAGS: ['script', 'style'] });
}

// Build the RenderContext handed to every renderer. `post` is injected (rather than
// reaching for the vscode global) so renderers — and originLink — stay testable.
export function createContext(post: (message: unknown) => void): RenderContext {
  function originLink(origin: RelayOrigin): HTMLAnchorElement {
    const a = el('a', 'relay-origin');
    a.href = '#';
    const file = String(origin.file || '');
    const short = file.split('/').pop() || file;
    a.textContent = `${short}:${origin.line_number ?? ''}`;
    a.addEventListener('click', (e) => {
      e.preventDefault();
      post({ type: 'open-origin', origin });
    });
    return a;
  }

  return { el, badge, sanitize, originLink, post };
}
