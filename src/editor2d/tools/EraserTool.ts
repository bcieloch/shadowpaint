import { TileHistoryTransaction } from '@/core/history/TileHistory';
import { recomputeEffectiveRect } from '@/core/maps/adjustments';
import { StrokeSession } from '@/editor2d/brush/stroke';
import { buildStrokeParams, resolvePressure } from '@/editor2d/tools/BrushTool';
import type { Tool, ToolContext, ToolPointerEvent } from '@/editor2d/tools/Tool';

export class EraserTool implements Tool {
  readonly id = 'eraser' as const;
  private session: StrokeSession | null = null;
  private transaction: TileHistoryTransaction | null = null;
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
    const tx = new TileHistoryTransaction(ctx.registry, activeMap, 'eraserStroke', 'working');
    this.transaction = tx;
    this.session = new StrokeSession(ctx.registry, {
      onBeforeWriteRect: (rect) => tx.ensureTilesForRect(rect),
    });
    const params = buildStrokeParams('eraser', ctx);
    this.session.begin(e.imagePos, resolvePressure(e), params);
  }

  onMove(e: ToolPointerEvent, ctx: ToolContext): void {
    if (this.lockedWarned || !this.session?.isActive) return;
    const params = buildStrokeParams('eraser', ctx);
    this.session.move(e.imagePos, resolvePressure(e), params);
  }

  onUp(_e: ToolPointerEvent, ctx: ToolContext): void {
    this.lockedWarned = false;
    if (this.session?.isActive) {
      this.session.end();
    }
    const entry = this.transaction?.commit();
    if (entry) {
      ctx.recordMapTileEntry?.(entry);
    }
    this.session = null;
    this.transaction = null;
  }

  onCancel(ctx: ToolContext): void {
    this.lockedWarned = false;
    this.session?.cancel();
    if (this.transaction) {
      const dirty = this.transaction.rollback();
      if (dirty) {
        recomputeEffectiveRect(
          ctx.registry,
          this.transaction.mapId,
          ctx.getProject().adjustments,
          dirty,
        );
        ctx.registry.emitDirty(this.transaction.mapId, dirty);
      }
    }
    this.session = null;
    this.transaction = null;
  }
}
