import type { RelayPayload } from '../../../src/protocol';
import type { PayloadRenderer, RenderContext } from '../contract';
import { injectHtml } from './html';

// The registry's fallback for any type without a dedicated renderer. Reproduces the
// original structure-sniff verbatim — pre-rendered HTML if present, else a JSON dump — so
// unknown and not-yet-implemented types degrade exactly as they did before the refactor.
// `type` is a sentinel; this renderer is wired in as the registry fallback, not by type.
export class FallbackRenderer implements PayloadRenderer {
  readonly type = '__fallback__';

  render(payload: RelayPayload, ctx: RenderContext): HTMLElement {
    const holder = ctx.el('div');
    const content = payload.content || {};
    if (!injectHtml(content, ctx, holder)) {
      holder.textContent = JSON.stringify(content, null, 2);
    }
    return holder;
  }
}
