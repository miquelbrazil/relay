import type { RelayPayload } from '../../../src/protocol';
import type { PayloadRenderer, RenderContext } from '../contract';

// `carbon` (ray()->carbon($date)) carries { formatted, timestamp, timezone }.
export class CarbonRenderer implements PayloadRenderer {
  readonly type = 'carbon';

  render(payload: RelayPayload, ctx: RenderContext): HTMLElement {
    const content = payload.content || {};
    const wrap = ctx.el('div', 'relay-carbon');

    const formatted = ctx.el('span', 'relay-carbon-formatted');
    formatted.textContent = content.formatted || String(content.timestamp ?? '');
    wrap.appendChild(formatted);

    if (content.timezone) {
      const tz = ctx.el('span', 'relay-carbon-tz');
      tz.textContent = content.timezone;
      wrap.appendChild(tz);
    }
    return wrap;
  }
}
