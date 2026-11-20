import type { Tool, ToolContext, ToolPointerEvent } from '@/editor2d/tools/Tool';
import { applyFloodFillToActiveMap } from '@/services/filterService';

export class FillTool implements Tool {
  readonly id = 'fill' as const;

  onDown(e: ToolPointerEvent, ctx: ToolContext): void {
    const project = ctx.getProject();
    const { activeMap } = ctx.getEditor();
    if (project.maps[activeMap].locked) {
      ctx.onLockedMapAttempt(activeMap);
      return;
    }
    if (!ctx.registry.isAllocated) return;

    const ix = Math.floor(e.imagePos.x);
    const iy = Math.floor(e.imagePos.y);
    if (ix < 0 || iy < 0 || ix >= ctx.registry.width || iy >= ctx.registry.height) {
      return;
    }

    void applyFloodFillToActiveMap({
      mapId: activeMap,
      seedX: ix,
      seedY: iy,
    });
  }

  onMove(): void {}

  onUp(): void {}

  onCancel(): void {}
}
