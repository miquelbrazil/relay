import type { RelayPayload } from '../../../src/protocol';
import type { PayloadRenderer, RenderContext } from '../contract';
import { renderFrames, RayFrame } from './frames';

// `exception` carries { class, message, frames[] }. The class + message head, then the
// stack — each frame is click-to-jump via the shared frame helper.
export class ExceptionRenderer implements PayloadRenderer {
  readonly type = 'exception';

  render(payload: RelayPayload, ctx: RenderContext): HTMLElement {
    const content = payload.content || {};
    const wrap = ctx.el('div', 'relay-exception');

    const head = ctx.el('div', 'relay-exception-head');
    head.appendChild(ctx.badge(content.class || 'Exception', 'relay-exception-class'));
    wrap.appendChild(head);

    if (content.message) {
      const message = ctx.el('div', 'relay-exception-message');
      message.textContent = content.message;
      wrap.appendChild(message);
    }

    const frames: RayFrame[] = Array.isArray(content.frames) ? content.frames : [];
    if (frames.length) {
      wrap.appendChild(renderFrames(frames, ctx, payload.origin?.hostname));
    }
    return wrap;
  }
}
