import type { RelayPayload } from '../../../src/protocol';
import type { PayloadRenderer, RenderContext } from '../contract';
import { renderFrameRow, RayFrame } from './frames';

// `caller` (ray()->caller()) carries a SINGLE frame under content.frame (not an array).
export class CallerRenderer implements PayloadRenderer {
  readonly type = 'caller';

  render(payload: RelayPayload, ctx: RenderContext): HTMLElement {
    const frame: RayFrame | undefined = payload.content?.frame;
    const wrap = ctx.el('div', 'relay-caller');
    if (frame) {
      wrap.appendChild(renderFrameRow(frame, ctx, payload.origin?.hostname));
    }
    return wrap;
  }
}
