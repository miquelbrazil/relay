import type { PayloadRenderer } from './contract';

// Maps a Ray payload.type to the renderer that owns it, with an explicit fallback for
// unknown/future types. O(1) lookup: types are discriminated by a plain string, so a
// type→renderer map beats a canRender() predicate scan. (If structure-based matching is
// ever needed, a predicate variant is the documented escape hatch — see the architecture doc.)
export class RendererRegistry {
  private byType = new Map<string, PayloadRenderer>();

  constructor(renderers: PayloadRenderer[], private fallback: PayloadRenderer) {
    for (const renderer of renderers) {
      this.byType.set(renderer.type, renderer);
    }
  }

  resolve(type: string): PayloadRenderer {
    return this.byType.get(type) ?? this.fallback;
  }
}
