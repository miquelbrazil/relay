import type { RelayPayload } from '../../../src/protocol';
import type { PayloadRenderer, RenderContext } from '../contract';
import { renderFrames, RayFrame } from './frames';

// `trace` (ray()->trace()) carries { frames[] } — a backtrace. Each frame is click-to-jump.
export class TraceRenderer implements PayloadRenderer {
  readonly type = 'trace';

  render(payload: RelayPayload, ctx: RenderContext): HTMLElement {
    const content = payload.content || {};
    const frames: RayFrame[] = Array.isArray(content.frames) ? content.frames : [];
    const wrap = ctx.el('div', 'relay-trace');
    wrap.appendChild(renderFrames(frames, ctx, payload.origin?.hostname));
    return wrap;
  }
}
