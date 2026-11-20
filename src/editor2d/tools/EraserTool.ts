import { StrokeSession } from '@/editor2d/brush/stroke';
import { buildStrokeParams, resolvePressure } from '@/editor2d/tools/BrushTool';
import type { Tool, ToolContext, ToolPointerEvent } from '@/editor2d/tools/Tool';

export class EraserTool implements Tool {
  readonly id = 'eraser' as const;
  private session: StrokeSession | null = null;
  private lockedWarned = false;

  onDown(e: ToolPointerEvent, ctx: ToolContext): void {
    const project = ctx.getProject();
    const { activeMap } = ctx.getEditor();
    if (project.maps[activeMap].locked) {
      this.lockedWarned = true;
      ctx.onLockedMapAttempt(activeMap);
      return;
    }

    this.lockedWarned = false;
    this.session = new StrokeSession(ctx.registry);
    const params = buildStrokeParams('eraser', ctx);
    this.session.begin(e.imagePos, resolvePressure(e), params);
  }

  onMove(e: ToolPointerEvent, ctx: ToolContext): void {
    if (this.lockedWarned || !this.session?.isActive) return;
    const params = buildStrokeParams('eraser', ctx);
    this.session.move(e.imagePos, resolvePressure(e), params);
  }

  onUp(): void {
    this.lockedWarned = false;
    if (this.session?.isActive) {
      this.session.end();
    }
    this.session = null;
  }

  onCancel(): void {
    this.lockedWarned = false;
    this.session?.cancel();
    this.session = null;
  }
}
