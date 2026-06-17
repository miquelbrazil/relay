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
  // Sfdump resolves dumps by id via the document, so it must run AFTER attachment.
  initDumps(node);
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

  if (item.origin && item.origin.file) {
    container.appendChild(originLine(item.origin));
  }

  return container;
}

// `log` payloads carry pre-rendered VarDumper HTML (sf-dump trees) in content.values;
// many helpers (html(), text(), custom packages) arrive as a `content` string. Both are
// untrusted HTML off a localhost socket, so we sanitize before injecting, then let the
// vendored Sfdump make the tree interactive (see initDumps).
function renderPayload(p) {
  const wrap = el('div', 'relay-payload');
  const c = p.content || {};
  if (Array.isArray(c.values)) {
    wrap.innerHTML = sanitize(c.values.join(''));
  } else if (typeof c.content === 'string') {
    wrap.innerHTML = sanitize(c.content);
  } else {
    wrap.textContent = JSON.stringify(c, null, 2);
  }
  return wrap;
}

function originLine(origin) {
  const a = el('a', 'relay-origin');
  a.href = '#';
  const file = String(origin.file || '');
  const short = file.split('/').pop() || file;
  a.textContent = `${short}:${origin.line_number ?? ''}`;
  a.addEventListener('click', (e) => {
    e.preventDefault();
    vscode.postMessage({ type: 'open-origin', origin });
  });
  return a;
}

// Strip <script>/<style> (we vendor our own sf-dump assets) but keep sf-dump's classes
// and data-* attributes, which DOMPurify preserves by default. Never use 'unsafe-inline'
// in the CSP to make raw payload scripts run — sanitize here instead.
function sanitize(html) {
  if (typeof html !== 'string') {
    return '';
  }
  return DOMPurify.sanitize(html, { FORBID_TAGS: ['script', 'style'] });
}

// The inline `Sfdump("sf-dump-NNN")` call that normally follows each dump is stripped by
// the sanitizer, so we initialize each dump ourselves once, after it's in the document.
function initDumps(root) {
  if (typeof Sfdump !== 'function') {
    return;
  }
  for (const pre of root.querySelectorAll('pre.sf-dump')) {
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
