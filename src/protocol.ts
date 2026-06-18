// The Ray wire protocol — the single source of truth for the shapes that cross the
// socket and the host↔webview postMessage boundary. Owned by the host (it defines the
// protocol); imported as types by BOTH esbuild bundles (src/extension.ts and
// media/src/main.ts). esbuild inlines a copy into each output, so this is shared source,
// not a shared runtime — see docs/architecture/renderer-strategy.md.

// Where a payload was emitted from. Resolved to a local file on click by the host
// (resolveOrigin/suffixResolve in RelayViewProvider). A stack frame is the same shape,
// which is why per-frame click-to-jump reuses the exact same path.
export interface RelayOrigin {
  function_name?: string | null;
  file?: string;
  line_number?: number;
  hostname?: string;
}

// One Ray payload. `type` is the discriminator the renderer registry keys off; `content`
// is type-specific and intentionally open (the wire format is PHP-defined).
export interface RelayPayload {
  type: string;
  content: Record<string, any>;
  origin?: RelayOrigin;
}

// A batch of payloads sharing one uuid (a single ray() call and its chained modifiers).
export interface RelayEnvelope {
  uuid: string;
  payloads: RelayPayload[];
  meta?: Record<string, unknown>;
}

// A rendered entry as the store/webview track it: the content payloads plus the
// modifiers (color/size/label/hide) folded in by RelayStore.applyModifier.
export interface RelayItem {
  uuid: string;
  payloads: RelayPayload[];          // content payloads, in arrival order
  color?: string;
  size?: string;
  label?: string;
  hidden?: boolean;
  receivedAt: number;
  origin?: RelayOrigin;
  projectName?: string;              // derived
}
