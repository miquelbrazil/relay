// Headless smoke test for the webview renderers. They are pure (payload, ctx) => node,
// so we can exercise registry dispatch + each renderer with a fake RenderContext (no
// browser, no DOMPurify). Bundled to CJS by esbuild and run with node — see npm script.
import type { RenderContext } from '../media/src/contract';
import type { RelayOrigin } from '../src/protocol';
import { RendererRegistry } from '../media/src/registry';
import { LogRenderer } from '../media/src/renderers/LogRenderer';
import { CustomRenderer } from '../media/src/renderers/CustomRenderer';
import { JsonStringRenderer } from '../media/src/renderers/JsonStringRenderer';
import { ExceptionRenderer } from '../media/src/renderers/ExceptionRenderer';
import { TraceRenderer } from '../media/src/renderers/TraceRenderer';
import { CallerRenderer } from '../media/src/renderers/CallerRenderer';
import { TableRenderer } from '../media/src/renderers/TableRenderer';
import { MeasureRenderer } from '../media/src/renderers/MeasureRenderer';
import { CarbonRenderer } from '../media/src/renderers/CarbonRenderer';
import { FallbackRenderer } from '../media/src/renderers/FallbackRenderer';

// --- a minimal fake DOM node + RenderContext -------------------------------
interface FakeNode {
  tag: string;
  className: string;
  text: string;
  html: string;
  classes: string[];
  children: FakeNode[];
  dataset: Record<string, string>;
  style: { setProperty: () => void };
  title?: string;
  href?: string;
  type?: string;
  appendChild: (c: FakeNode) => FakeNode;
  classList: { add: (c: string) => void };
  addEventListener: () => void;
  set textContent(v: string);
  get textContent(): string;
  set innerHTML(v: string);
  get innerHTML(): string;
}

const capturedOrigins: RelayOrigin[] = [];

function makeNode(tag: string, cls?: string): FakeNode {
  const node: FakeNode = {
    tag,
    className: cls || '',
    text: '',
    html: '',
    classes: cls ? cls.split(' ') : [],
    children: [],
    dataset: {},
    style: { setProperty: () => {} },
    appendChild(c) { this.children.push(c); return c; },
    classList: { add: (c: string) => { node.classes.push(c); } },
    addEventListener: () => {},
    get textContent() { return this.text; },
    set textContent(v) { this.text = v; },
    get innerHTML() { return this.html; },
    set innerHTML(v) { this.html = v; },
  };
  return node;
}

const ctx = {
  el: ((tag: string, cls?: string) => makeNode(tag, cls)) as unknown as RenderContext['el'],
  badge: (text: string, cls?: string) => { const n = makeNode('span', cls); n.text = text; return n as unknown as HTMLSpanElement; },
  sanitize: (html: string) => html,
  originLink: (origin: RelayOrigin) => { capturedOrigins.push(origin); const n = makeNode('a', 'relay-origin'); return n as unknown as HTMLAnchorElement; },
  post: () => {},
} as unknown as RenderContext;

// --- serialize a node tree to a flat string for substring assertions -------
function serialize(n: FakeNode): string {
  const self = `<${n.tag} class="${[n.className, ...n.classes.filter((c) => !n.className.split(' ').includes(c))].join(' ').trim()}">${n.text}${n.html}`;
  return self + n.children.map(serialize).join('');
}

const registry = new RendererRegistry(
  [
    new LogRenderer(), new CustomRenderer(), new JsonStringRenderer(),
    new ExceptionRenderer(), new TraceRenderer(), new CallerRenderer(),
    new TableRenderer(), new MeasureRenderer(), new CarbonRenderer(),
  ],
  new FallbackRenderer(),
);

let failures = 0;
function check(name: string, cond: boolean, detail = '') {
  if (cond) {
    console.log(`  ok   ${name}`);
  } else {
    failures += 1;
    console.log(`  FAIL ${name} ${detail}`);
  }
}

function render(type: string, content: any, origin?: RelayOrigin): string {
  const node = registry.resolve(type).render({ type, content, origin } as any, ctx) as unknown as FakeNode;
  return serialize(node);
}

console.log('registry dispatch + renderer output:');
check('log', render('log', { values: ['<pre class="sf-dump">x</pre>'] }).includes('sf-dump'));
check('custom/html shows label + body', (() => {
  const s = render('custom', { content: '<b>hi</b>', label: 'HTML' });
  return s.includes('HTML') && s.includes('<b>hi</b>');
})());
check('json_string pretty-prints', render('json_string', { value: '{"a":1}' }).includes('"a": 1'));
check('table renders key + value', (() => {
  const s = render('table', { values: { Name: 'Ada' }, label: 'Table' });
  return s.includes('Name') && s.includes('Ada') && s.includes('Table');
})());
check('measure shows name + total', render('measure', { name: 't', total_time: 0.0123, is_new_timer: true, max_memory_usage_during_total_time: 1048576 }).includes('12.30 ms'));
check('carbon shows formatted', render('carbon', { formatted: '2026-06-18 10:00', timezone: 'UTC' }).includes('2026-06-18'));
check('unknown type -> JSON fallback', render('totally_unknown', { foo: 'bar' }).includes('"foo": "bar"'));

console.log('\nclick-to-jump frame mapping (file_name/line_number -> origin):');
capturedOrigins.length = 0;
render('exception', { class: 'RuntimeException', message: 'boom', frames: [{ file_name: '/app/Foo.php', line_number: 42, class: 'Foo', method: 'bar', vendor_frame: false }] }, { hostname: 'web' });
check('exception frame -> origin.file', capturedOrigins.some((o) => o.file === '/app/Foo.php'), JSON.stringify(capturedOrigins));
check('exception frame -> origin.line_number', capturedOrigins.some((o) => o.line_number === 42));
check('exception frame -> hostname threaded', capturedOrigins.some((o) => o.hostname === 'web'));

capturedOrigins.length = 0;
render('caller', { frame: { file_name: '/app/Bar.php', line_number: 7 } });
check('caller frame -> origin', capturedOrigins.some((o) => o.file === '/app/Bar.php' && o.line_number === 7));

capturedOrigins.length = 0;
render('trace', { frames: [{ file_name: '/app/A.php', line_number: 1 }, { file_name: '/app/B.php', line_number: 2 }] });
check('trace renders all frames', capturedOrigins.length === 2);

console.log(failures === 0 ? '\nALL SMOKE CHECKS PASSED' : `\n${failures} SMOKE CHECK(S) FAILED`);
if (failures > 0) {
  process.exit(1);
}
