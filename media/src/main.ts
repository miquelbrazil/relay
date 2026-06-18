import type { RelayItem, RelayPayload } from '../../src/protocol';
import { el, badge, createContext } from './context';
import { RendererRegistry } from './registry';
import { LogRenderer } from './renderers/LogRenderer';
import { CustomRenderer } from './renderers/CustomRenderer';
import { JsonStringRenderer } from './renderers/JsonStringRenderer';
import { ExceptionRenderer } from './renderers/ExceptionRenderer';
import { TraceRenderer } from './renderers/TraceRenderer';
import { CallerRenderer } from './renderers/CallerRenderer';
import { TableRenderer } from './renderers/TableRenderer';
import { MeasureRenderer } from './renderers/MeasureRenderer';
import { CarbonRenderer } from './renderers/CarbonRenderer';
import { FallbackRenderer } from './renderers/FallbackRenderer';

const vscode = acquireVsCodeApi();

// Shared collaborators (el/badge/sanitize/originLink/post) handed to every renderer.
const ctx = createContext((message) => vscode.postMessage(message));

// One renderer per Ray payload type, with an explicit fallback for everything else.
// Register a new type by adding its renderer here — see docs/architecture/renderer-strategy.md.
// Note: ray()->html()/text()/image()/send() all arrive as type 'custom' (CustomRenderer
// branches on content.label).
const registry = new RendererRegistry(
  [
    new LogRenderer(),
    new CustomRenderer(),
    new JsonStringRenderer(),
    new ExceptionRenderer(),
    new TraceRenderer(),
    new CallerRenderer(),
    new TableRenderer(),
    new MeasureRenderer(),
    new CarbonRenderer(),
  ],
  new FallbackRenderer(),
);

const list = document.getElementById('relay-list')!;

// uuid -> the rendered DOM node, so updates/removes can target it in place.
const nodes = new Map<string, HTMLElement>();

// Ray's filterable color palette. Order mirrors the dots in the Ray.app toolbar.
const COLORS = ['gray', 'red', 'orange', 'green', 'blue', 'purple'];

// Each color resolves to a theme variable, exposed per-item as --relay-color so the
// active color style (border/tint/dot/origin, see main.css) can reference one value.
const COLOR_VARS: Record<string, string> = {
  gray: 'var(--vscode-descriptionForeground)',
  red: 'var(--vscode-charts-red)',
  orange: 'var(--vscode-charts-orange)',
  green: 'var(--vscode-charts-green)',
  blue: 'var(--vscode-charts-blue)',
  purple: 'var(--vscode-charts-purple)',
};

// Active color filter. Empty = show everything. Persisted via the webview state so it
// survives the panel being hidden/redrawn (the DOM is disposable; this isn't).
const saved = vscode.getState() || {};
const activeColors = new Set<string>(Array.isArray(saved.activeColors) ? saved.activeColors : []);

window.addEventListener('message', (event: MessageEvent) => {
  const msg = event.data;
  switch (msg.type) {
    case 'replay':
      list.textContent = '';
      nodes.clear();
      for (const item of msg.items) {
        upsert(item);
      }
      applyFilter();
      break;
    case 'item-added':
    case 'item-updated':
      upsert(msg.item);
      applyFilter();
      break;
    case 'item-removed':
      remove(msg.uuid);
      break;
    case 'cleared':
      list.textContent = '';
      nodes.clear();
      break;
    case 'set-color-style':
      // CSS keys off body[data-color-style], so existing items restyle instantly.
      document.body.dataset.colorStyle = msg.style || 'border';
      break;
  }
});

// Insert a new item or replace the existing node for its uuid (chained calls like
// ray()->color()->label() mutate an item already on screen).
function upsert(item: RelayItem): void {
  const node = renderItem(item);
  const existing = nodes.get(item.uuid);
  if (existing) {
    list.replaceChild(node, existing);
  } else {
    list.appendChild(node);
  }
  nodes.set(item.uuid, node);
  // Sfdump resolves dumps by id via the document, so it must run AFTER attachment.
  initDumps(node);
}

function remove(uuid: string): void {
  const existing = nodes.get(uuid);
  if (existing) {
    existing.remove();
    nodes.delete(uuid);
  }
}

function renderItem(item: RelayItem): HTMLElement {
  const container = el('div', 'relay-item');
  container.dataset.uuid = item.uuid;
  container.dataset.color = item.color || '';
  if (item.hidden) {
    container.classList.add('relay-hidden');
  }
  // Tag colored items with the accent variable; the active color style decides how
  // (border, tint, dot, or footer chip) it's drawn. Unknown colors get no accent.
  const accent = item.color ? COLOR_VARS[item.color] : undefined;
  if (accent) {
    container.classList.add('relay-colored');
    container.style.setProperty('--relay-color', accent);
  }

  // A badge is shown ONLY when a label is applied (ray()->label('...')), styled like
  // Ray's label chip. The payload type is no longer surfaced as a badge.
  if (item.label) {
    const header = el('div', 'relay-header');
    header.appendChild(badge(item.label, 'relay-label'));
    container.appendChild(header);
  }

  for (const p of item.payloads) {
    container.appendChild(renderPayload(p));
  }

  container.appendChild(renderFooter(item));
  return container;
}

// Dispatch a payload to the renderer that owns its type (unknown types hit the fallback).
// The .relay-payload wrapper carries data-payload-type so main.css can style per type.
function renderPayload(p: RelayPayload): HTMLElement {
  const wrap = el('div', 'relay-payload');
  wrap.dataset.payloadType = p.type;
  wrap.appendChild(registry.resolve(p.type).render(p, ctx));
  return wrap;
}

// Origin pointer and timestamp share one footer line, matching the Ray.app layout
// ("DashboardViewAction.php:19   01:29:14.901").
function renderFooter(item: RelayItem): HTMLElement {
  const footer = el('div', 'relay-footer');
  // Color chip — a real element (not a ::before) so it can carry a tooltip naming the
  // color. Hidden by CSS for styles that don't use it.
  if (item.color && COLOR_VARS[item.color]) {
    const chip = el('span', 'relay-chip');
    chip.title = `Color: ${item.color}`;
    footer.appendChild(chip);
  }
  if (item.origin && item.origin.file) {
    footer.appendChild(ctx.originLink(item.origin));
  }
  if (item.receivedAt) {
    const time = el('span', 'relay-time');
    time.textContent = formatTime(item.receivedAt);
    footer.appendChild(time);
  }
  return footer;
}

function formatTime(ms: number): string {
  const d = new Date(ms);
  const p = (n: number, len = 2) => String(n).padStart(len, '0');
  return `${p(d.getHours())}:${p(d.getMinutes())}:${p(d.getSeconds())}.${p(d.getMilliseconds(), 3)}`;
}

// --- Color filtering (Ray.app-style dots) ----------------------------------

function buildToolbar(): void {
  const bar = document.getElementById('relay-toolbar');
  if (!bar) {
    return;
  }

  // Clear-all action — a hollow circle with an × that resets every color filter.
  // It's a momentary action, not a toggle, so it has no active state.
  const clear = el('button', 'relay-dot relay-dot-clear');
  clear.type = 'button';
  clear.title = 'Clear color filters';
  clear.textContent = '×';
  clear.addEventListener('click', () => {
    if (activeColors.size === 0) {
      return;
    }
    activeColors.clear();
    for (const active of bar.querySelectorAll('.relay-dot-active')) {
      active.classList.remove('relay-dot-active');
    }
    vscode.setState({ activeColors: [] });
    applyFilter();
  });
  bar.appendChild(clear);

  for (const color of COLORS) {
    const dot = el('button', 'relay-dot relay-dot-' + color);
    dot.type = 'button';
    dot.title = `Show only ${color}`;
    dot.dataset.color = color;
    if (activeColors.has(color)) {
      dot.classList.add('relay-dot-active');
    }
    dot.addEventListener('click', () => {
      if (activeColors.has(color)) {
        activeColors.delete(color);
      } else {
        activeColors.add(color);
      }
      dot.classList.toggle('relay-dot-active', activeColors.has(color));
      vscode.setState({ activeColors: [...activeColors] });
      applyFilter();
    });
    bar.appendChild(dot);
  }
}

// An item is visible when no filter is active, or when its color is among the active
// ones. Uncolored items are hidden while any color filter is on (matching Ray.app).
function applyFilter(): void {
  for (const node of nodes.values()) {
    const color = node.dataset.color || '';
    const visible = activeColors.size === 0 || (color && activeColors.has(color));
    node.classList.toggle('relay-filtered', !visible);
  }
}

// The inline `Sfdump("sf-dump-NNN")` call that normally follows each dump is stripped by
// the sanitizer, so we initialize each dump ourselves once, after it's in the document.
function initDumps(root: HTMLElement): void {
  if (typeof Sfdump !== 'function') {
    return;
  }
  for (const pre of root.querySelectorAll<HTMLElement>('pre.sf-dump')) {
    if (pre.dataset.relayInit) {
      continue;
    }
    if (!pre.id) {
      pre.id = 'sf-dump-' + Math.random().toString(36).slice(2);
    }
    pre.dataset.relayInit = '1';
    try {
      Sfdump(pre.id);
    } catch (e) {
      /* a malformed dump shouldn't take down the panel */
    }
  }
}

buildToolbar();
vscode.postMessage({ type: 'ready' });
