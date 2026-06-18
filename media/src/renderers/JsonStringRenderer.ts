import type { RelayPayload } from '../../../src/protocol';
import type { PayloadRenderer, RenderContext } from '../contract';

// `json_string` (ray()->json(...)) sends content.value as a JSON string. Pretty-print it;
// if it somehow isn't valid JSON, show it raw rather than erroring.
export class JsonStringRenderer implements PayloadRenderer {
  readonly type = 'json_string';

  render(payload: RelayPayload, ctx: RenderContext): HTMLElement {
    const raw = payload.content?.value;
    let pretty = typeof raw === 'string' ? raw : JSON.stringify(raw, null, 2);
    if (typeof raw === 'string') {
      try {
        pretty = JSON.stringify(JSON.parse(raw), null, 2);
      } catch {
        /* not valid JSON — fall back to the raw string */
      }
    }
    const wrap = ctx.el('div', 'relay-json');
    const pre = ctx.el('pre', 'relay-json-pre');
    pre.textContent = pretty;
    wrap.appendChild(pre);
    return wrap;
  }
}
