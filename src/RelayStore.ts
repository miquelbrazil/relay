import { EventEmitter } from 'events';
import { RelayEnvelope, RelayPayload } from './RelayServer';

export interface RelayItem {
  uuid: string;
  payloads: RelayPayload[];          // content payloads, in arrival order
  color?: string;
  size?: string;
  label?: string;
  hidden?: boolean;
  receivedAt: number;
  origin?: RelayPayload['origin'];
  projectName?: string;            // derived — see 4.3
}

const MODIFIERS = new Set(['color', 'size', 'label', 'hide', 'remove']);
const SCREEN_CONTROLS = new Set(['new_screen', 'clear_all']);

export class RelayStore extends EventEmitter {
  private items = new Map<string, RelayItem>();  // Map preserves insertion order
  constructor(private maxItems = 500) { super(); }

  ingest(env: RelayEnvelope): void {
    for (const payload of env.payloads) {
      if (SCREEN_CONTROLS.has(payload.type)) {
        this.items.clear();
        this.emit('cleared', payload);
      } else if (MODIFIERS.has(payload.type)) {
        this.applyModifier(env.uuid, payload);
      } else if (payload.type === 'create_lock') {
        this.emit('lock', { uuid: env.uuid, payload });
      } else {
        this.upsertContent(env.uuid, payload);
      }
    }
    this.trim();
  }

  private upsertContent(uuid: string, payload: RelayPayload): void {
    const existing = this.items.get(uuid);
    if (existing) {
      existing.payloads.push(payload);
      this.emit('updated', existing);
    } else {
      const item: RelayItem = {
        uuid, payloads: [payload],
        receivedAt: Date.now(), origin: payload.origin,
      };
      this.items.set(uuid, item);
      this.emit('added', item);
    }
  }

  private applyModifier(uuid: string, payload: RelayPayload): void {
    const item = this.items.get(uuid);
    if (!item) return;  // modifier for an item we trimmed or never saw
    switch (payload.type) {
      case 'color':  item.color = payload.content.color; break;
      case 'size':   item.size = payload.content.size; break;
      case 'label':  item.label = payload.content.label; break;
      case 'hide':   item.hidden = true; break;
      case 'remove': this.items.delete(uuid); this.emit('removed', uuid); return;
    }
    this.emit('updated', item);
  }

  private trim(): void {
    while (this.items.size > this.maxItems) {
      const oldest = this.items.keys().next().value!;
      this.items.delete(oldest);
      this.emit('removed', oldest);
    }
  }

  snapshot(): RelayItem[] { return [...this.items.values()]; }
  clear(): void { this.items.clear(); this.emit('cleared'); }
}
