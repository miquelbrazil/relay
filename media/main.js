const vscode = acquireVsCodeApi();

const list = document.getElementById('relay-list');

// uuid -> the rendered DOM node, so updates/removes can target it in place.
const nodes = new Map();

window.addEventListener('message', (event) => {
  const msg = event.data;
  switch (msg.type) {
    case 'replay':
      list.textContent = '';
      nodes.clear();
      for (const item of msg.items) {
        upsert(item);
      }
      break;
    case 'item-added':
    case 'item-updated':
      upsert(msg.item);
      break;
    case 'item-removed':
      remove(msg.uuid);
      break;
    case 'cleared':
      list.textContent = '';
      nodes.clear();
      break;
  }
});

// Insert a new item or replace the existing node for its uuid (chained calls like
// ray()->color()->label() mutate an item already on screen).
function upsert(item) {
  const node = renderItem(item);
  const existing = nodes.get(item.uuid);
  if (existing) {
    list.replaceChild(node, existing);
  } else {
    list.appendChild(node);
  }
  nodes.set(item.uuid, node);
}

function remove(uuid) {
  const existing = nodes.get(uuid);
  if (existing) {
    existing.remove();
    nodes.delete(uuid);
  }
}

function renderItem(item) {
  const container = el('div', 'relay-item');
  container.dataset.uuid = item.uuid;
  if (item.hidden) {
    container.classList.add('relay-hidden');
  }
  if (item.color) {
    container.classList.add('relay-color-' + item.color);
  }

  const header = el('div', 'relay-header');
  if (item.label) {
    header.appendChild(badge(item.label));
  }
  for (const p of item.payloads) {
    header.appendChild(badge(p.type, 'relay-type'));
  }
  container.appendChild(header);

  for (const p of item.payloads) {
    container.appendChild(renderPayload(p));
  }

  if (item.origin && item.origin.file) {
    container.appendChild(originLine(item.origin));
  }

  return container;
}

// Phase 4 renderer: safe, text-only. `log` payloads carry pre-rendered VarDumper HTML
// in content.values — we strip it to plain text for now. Phase 5 swaps this for the
// vendored sf-dump tree (with sanitization + Sfdump init) per the guide.
function renderPayload(p) {
  const wrap = el('div', 'relay-payload');
  const c = p.content || {};
  if (Array.isArray(c.values)) {
    wrap.textContent = c.values.map(htmlToText).join('\n');
  } else if (typeof c.content === 'string') {
    wrap.textContent = htmlToText(c.content);
  } else {
    wrap.textContent = JSON.stringify(c, null, 2);
  }
  return wrap;
}

function originLine(origin) {
  const span = el('span', 'relay-origin');
  const file = String(origin.file || '');
  const short = file.split('/').pop() || file;
  span.textContent = `${short}:${origin.line_number ?? ''}`;
  return span;
}

// Strip tags by letting the browser parse, then reading textContent. Assigning to
// innerHTML never executes <script>, so this is safe for the plain-text Phase 4 view.
// Real HTML rendering in Phase 5 must go through a sanitizer (DOMPurify).
function htmlToText(s) {
  if (typeof s !== 'string') {
    return String(s);
  }
  const div = document.createElement('div');
  div.innerHTML = s;
  return div.textContent || '';
}

function badge(text, cls) {
  const b = el('span', cls ? `relay-badge ${cls}` : 'relay-badge');
  b.textContent = text;
  return b;
}

function el(tag, cls) {
  const e = document.createElement(tag);
  if (cls) {
    e.className = cls;
  }
  return e;
}

vscode.postMessage({ type: 'ready' });
