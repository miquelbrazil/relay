import type { RelayPayload } from '../../../src/protocol';
import type { PayloadRenderer, RenderContext } from '../contract';

function formatDuration(seconds: unknown): string {
  const s = typeof seconds === 'number' ? seconds : Number(seconds);
  if (!isFinite(s)) {
    return '—';
  }
  if (s < 1) {
    return `${(s * 1000).toFixed(2)} ms`;
  }
  return `${s.toFixed(3)} s`;
}

function formatBytes(bytes: unknown): string {
  let n = typeof bytes === 'number' ? bytes : Number(bytes);
  if (!isFinite(n) || n <= 0) {
    return '0 B';
  }
  const units = ['B', 'KB', 'MB', 'GB'];
  let unit = 0;
  while (n >= 1024 && unit < units.length - 1) {
    n /= 1024;
    unit += 1;
  }
  return `${n.toFixed(unit === 0 ? 0 : 1)} ${units[unit]}`;
}

// `measure` (ray()->measure()) carries timing + peak-memory stats. is_new_timer is true on
// the first call (no "since last call" delta to show yet).
export class MeasureRenderer implements PayloadRenderer {
  readonly type = 'measure';

  render(payload: RelayPayload, ctx: RenderContext): HTMLElement {
    const content = payload.content || {};
    const wrap = ctx.el('div', 'relay-measure');

    const name = ctx.el('span', 'relay-measure-name');
    name.textContent = content.name || 'measure';
    wrap.appendChild(name);

    const addStat = (label: string, value: string) => {
      const stat = ctx.el('span', 'relay-measure-stat');
      stat.textContent = `${label} ${value}`;
      wrap.appendChild(stat);
    };

    addStat('total', formatDuration(content.total_time));
    if (!content.is_new_timer) {
      addStat('since last', formatDuration(content.time_since_last_call));
    }
    addStat('mem', formatBytes(content.max_memory_usage_during_total_time));
    return wrap;
  }
}
