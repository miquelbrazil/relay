import type { RenderContext } from '../contract';

// Ray sends pre-rendered output in one of two shapes: `values` (an array of dump HTML
// fragments, used by log/dump) or `content` (a single HTML string, used by html()/text()
// and many custom helpers). Both are untrusted HTML off the localhost socket, so they are
// sanitized before injection. Returns true if it injected HTML, false if neither shape was
// present (so callers can fall back to e.g. a JSON dump).
export function injectHtml(
  content: Record<string, any>,
  ctx: RenderContext,
  holder: HTMLElement,
): boolean {
  if (Array.isArray(content.values)) {
    holder.innerHTML = ctx.sanitize(content.values.join(''));
    return true;
  }
  if (typeof content.content === 'string') {
    holder.innerHTML = ctx.sanitize(content.content);
    return true;
  }
  return false;
}
