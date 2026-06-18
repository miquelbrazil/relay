import type { RelayPayload } from '../../../src/protocol';
import type { PayloadRenderer, RenderContext } from '../contract';
import { injectHtml } from './html';

// `log` payloads carry pre-rendered VarDumper HTML (sf-dump trees) in content.values.
// This reproduces the original happy path exactly: sanitize + inject, then main's
// initDumps() (run after attachment) makes the tree interactive.
export class LogRenderer implements PayloadRenderer {
  readonly type = 'log';

  render(payload: RelayPayload, ctx: RenderContext): HTMLElement {
    const holder = ctx.el('div');
    injectHtml(payload.content || {}, ctx, holder);
    return holder;
  }
}
