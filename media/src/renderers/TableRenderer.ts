import type { RelayPayload } from '../../../src/protocol';
import type { PayloadRenderer, RenderContext } from '../contract';

// `table` (ray()->table([...])) carries { values, label }. `values` is an associative map
// (row label -> value); each value is run through Ray's ArgumentConverter, so it is either
// a scalar or a pre-rendered sf-dump HTML string. We detect HTML and inject it sanitized
// (initDumps then makes any sf-dump tree interactive), else show the scalar as text.
export class TableRenderer implements PayloadRenderer {
  readonly type = 'table';

  render(payload: RelayPayload, ctx: RenderContext): HTMLElement {
    const content = payload.content || {};
    const wrap = ctx.el('div', 'relay-table-wrap');

    if (content.label) {
      wrap.appendChild(ctx.badge(content.label, 'relay-table-label'));
    }

    const table = ctx.el('table', 'relay-table');
    const values = content.values || {};
    const entries: Array<[string, unknown]> = Array.isArray(values)
      ? values.map((v, i) => [String(i), v] as [string, unknown])
      : Object.entries(values);

    for (const [key, value] of entries) {
      const row = ctx.el('tr');
      const th = ctx.el('th');
      th.textContent = key;
      row.appendChild(th);

      const td = ctx.el('td');
      if (typeof value === 'string' && /<[a-z]/i.test(value)) {
        td.innerHTML = ctx.sanitize(value);
      } else {
        td.textContent = typeof value === 'string' ? value : JSON.stringify(value);
      }
      row.appendChild(td);
      table.appendChild(row);
    }

    wrap.appendChild(table);
    return wrap;
  }
}
