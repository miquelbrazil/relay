import type { RelayPayload } from '../../../src/protocol';
import type { PayloadRenderer, RenderContext } from '../contract';

// `custom` is Ray's catch-all display type — ray()->html(), ->text(), ->image(), and
// ->send(custom) ALL serialize as type 'custom', differentiated only by content.label
// ("HTML" / "Text" / "Image" / arbitrary). content.content is a pre-rendered HTML string
// (an <img> tag for images). We surface the label as a chip (the old code dropped it) and
// inject the sanitized body. Note: remote image URLs may be blocked by the webview CSP
// (img-src), which only allows the webview origin + data: URIs.
export class CustomRenderer implements PayloadRenderer {
  readonly type = 'custom';

  render(payload: RelayPayload, ctx: RenderContext): HTMLElement {
    const content = payload.content || {};
    const wrap = ctx.el('div', 'relay-custom');

    if (content.label) {
      const header = ctx.el('div', 'relay-custom-header');
      header.appendChild(ctx.badge(content.label, 'relay-custom-label'));
      wrap.appendChild(header);
    }

    const body = ctx.el('div', 'relay-custom-body');
    if (typeof content.content === 'string') {
      body.innerHTML = ctx.sanitize(content.content);
    } else {
      body.textContent = JSON.stringify(content, null, 2);
    }
    wrap.appendChild(body);
    return wrap;
  }
}
