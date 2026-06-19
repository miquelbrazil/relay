import * as assert from 'assert';
import { RelayStore } from '../RelayStore';
import { RelayEnvelope } from '../protocol';

// One ray() "log" call as it arrives over the wire — the smallest real envelope.
function logEnvelope(uuid: string, value = 'hello'): RelayEnvelope {
  return { uuid, payloads: [{ type: 'log', content: { values: [value] } }] };
}

// Mocha's TDD interface: `suite` groups tests (≈ Pest's describe), `test` is one case
// (≈ it). Assertions use node's built-in `assert`. No vscode API is touched here because
// RelayStore is pure host logic — which is exactly why it's a good first thing to test.
suite('RelayStore', () => {
  test('ingesting a content payload creates one item', () => {
    const store = new RelayStore();
    store.ingest(logEnvelope('a'));
    const items = store.snapshot();
    assert.strictEqual(items.length, 1);
    assert.strictEqual(items[0].uuid, 'a');
  });

  test('a chained color modifier mutates the same item in place', () => {
    const store = new RelayStore();
    store.ingest(logEnvelope('a'));
    store.ingest({ uuid: 'a', payloads: [{ type: 'color', content: { color: 'red' } }] });
    assert.strictEqual(store.snapshot().length, 1);       // still one item, not a second
    assert.strictEqual(store.snapshot()[0].color, 'red'); // the modifier folded in
  });

  test('emits "added" then "updated" as an item is created and modified', () => {
    const store = new RelayStore();
    const seen: string[] = [];
    store.on('added', () => seen.push('added'));
    store.on('updated', () => seen.push('updated'));
    store.ingest(logEnvelope('a'));
    store.ingest({ uuid: 'a', payloads: [{ type: 'label', content: { label: 'auth' } }] });
    assert.deepStrictEqual(seen, ['added', 'updated']);
  });

  test('a remove modifier deletes the item and emits its uuid', () => {
    const store = new RelayStore();
    let removed: string | undefined;
    store.on('removed', (uuid: string) => { removed = uuid; });
    store.ingest(logEnvelope('a'));
    store.ingest({ uuid: 'a', payloads: [{ type: 'remove', content: {} }] });
    assert.strictEqual(store.snapshot().length, 0);
    assert.strictEqual(removed, 'a');
  });

  test('history is bounded: the oldest item is trimmed past the cap', () => {
    const store = new RelayStore(2);   // keep at most 2
    store.ingest(logEnvelope('a'));
    store.ingest(logEnvelope('b'));
    store.ingest(logEnvelope('c'));    // pushes 'a' out
    assert.deepStrictEqual(store.snapshot().map((i) => i.uuid), ['b', 'c']);
  });
});
