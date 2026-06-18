import type { RenderContext } from '../contract';

// A single stack frame as Ray serializes it (snake_case on the wire). Shared by the
// exception, trace, and caller payloads. The file_name/line_number keys are what the
// host's resolveOrigin needs, so each frame becomes a click-to-jump origin verbatim.
export interface RayFrame {
  file_name?: string;
  line_number?: number;
  class?: string | null;
  method?: string | null;
  vendor_frame?: boolean;
}

// One frame row: a click-to-jump link (reusing ctx.originLink — the SAME path footer
// origins use, so the host needs no new code) plus the class::method signature. Vendor
// frames are tagged so CSS can dim them. `hostname` is threaded from the payload origin so
// the host's suffixResolve can disambiguate identical relative paths across containers.
export function renderFrameRow(frame: RayFrame, ctx: RenderContext, hostname?: string): HTMLElement {
  const row = ctx.el('div', 'relay-frame');
  if (frame.vendor_frame) {
    row.classList.add('relay-frame-vendor');
  }
  if (frame.file_name) {
    row.appendChild(ctx.originLink({
      file: frame.file_name,
      line_number: frame.line_number,
      hostname,
    }));
  }
  const signature = `${frame.class ?? ''}${frame.class ? '::' : ''}${frame.method ?? ''}`;
  if (signature) {
    const sig = ctx.el('span', 'relay-frame-fn');
    sig.textContent = signature;
    row.appendChild(sig);
  }
  return row;
}

// A list of frame rows in a scrollable stack container.
export function renderFrames(frames: RayFrame[], ctx: RenderContext, hostname?: string): HTMLElement {
  const stack = ctx.el('div', 'relay-frames');
  for (const frame of frames) {
    stack.appendChild(renderFrameRow(frame, ctx, hostname));
  }
  return stack;
}
