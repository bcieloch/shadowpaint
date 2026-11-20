import { unionRect } from '@/core/maps/rect';
import type { Rect, Vec2 } from '@/core/types';
import { brushSizeToPx, getCalibrationMetrics } from '@/core/units/calibration';
import { stampMaskDab } from '@/editor2d/selection/SelectionMask';
import { resolvePressure } from '@/editor2d/tools/BrushTool';
import type { Tool, ToolContext, ToolPointerEvent } from '@/editor2d/tools/Tool';
import { recordMaskBrushStroke } from '@/services/selectionService';

export class MaskBrushTool implements Tool {
  readonly id = 'maskBrush' as const;
  private beforeMask: Uint8Array | null = null;
  private dirtyRect: Rect | null = null;
  private lastPos: Vec2 = { x: 0, y: 0 };
  private lastPressure = 1;
  private residualDist = 0;

  onDown(e: ToolPointerEvent, ctx: ToolContext): void {
    if (!ctx.registry.isAllocated) return;
    this.beforeMask = new Uint8Array(ctx.registry.selection);
    this.dirtyRect = null;
    this.lastPos = { ...e.imagePos };
    this.lastPressure = resolvePressure(e);
    this.residualDist = 0;

    const { radiusPx, hardness, flow, erase } = this.readParams(e, ctx, this.lastPressure);
    const rect = stampMaskDab(ctx.registry, {
      cx: e.imagePos.x,
      cy: e.imagePos.y,
      radiusPx,
      hardness,
      flow,
      erase,
    });
    if (rect) {
      this.dirtyRect = rect;
      ctx.registry.emitSelectionChanged(rect);
    }
  }

  onMove(e: ToolPointerEvent, ctx: ToolContext): void {
    if (!this.beforeMask || !ctx.registry.isAllocated) return;

    const dx = e.imagePos.x - this.lastPos.x;
    const dy = e.imagePos.y - this.lastPos.y;
    const segLen = Math.hypot(dx, dy);
    if (segLen < 1e-4) return;

    const pressure = resolvePressure(e);
    const { brush, selectionTools } = ctx.getEditor();
    const project = ctx.getProject();
    const metrics = getCalibrationMetrics(project.canvas);
    const diameterPx = Math.max(1, brushSizeToPx(brush.sizeValue, brush.sizeUnit, metrics.pxPerCm));
    const radiusPx = Math.max(0.5, diameterPx / 2);
    const stepPx = Math.max(1, diameterPx * Math.max(0.05, Math.min(1, brush.spacing)));
    const erase =
      e.altKey || selectionTools.maskBrushErase || selectionTools.combineMode === 'subtract';

    let dist = stepPx - this.residualDist;
    let segmentDirty: Rect | null = null;

    while (dist <= segLen) {
      const t = dist / segLen;
      const cx = this.lastPos.x + dx * t;
      const cy = this.lastPos.y + dy * t;
      const p = this.lastPressure + (pressure - this.lastPressure) * t;
      const effP = brush.usePressure ? Math.max(0.05, Math.min(1, p)) : 1;
      const flow = Math.max(0, Math.min(1, brush.flow * effP));

      const rect = stampMaskDab(ctx.registry, {
        cx,
        cy,
        radiusPx,
        hardness: brush.hardness,
        flow,
        erase,
      });
      if (rect) {
        segmentDirty = segmentDirty ? unionRect(segmentDirty, rect) : rect;
      }
      dist += stepPx;
    }

    this.residualDist = segLen - (dist - stepPx);
    this.lastPos = { ...e.imagePos };
    this.lastPressure = pressure;

    if (segmentDirty) {
      this.dirtyRect = this.dirtyRect ? unionRect(this.dirtyRect, segmentDirty) : segmentDirty;
      ctx.registry.emitSelectionChanged(segmentDirty);
    }
  }

  onUp(_e: ToolPointerEvent, ctx: ToolContext): void {
    if (this.beforeMask && ctx.registry.isAllocated) {
      recordMaskBrushStroke(this.beforeMask, this.dirtyRect ?? undefined);
    }
    this.beforeMask = null;
    this.dirtyRect = null;
  }

  onCancel(ctx: ToolContext): void {
    if (this.beforeMask && ctx.registry.isAllocated) {
      ctx.registry.selection.set(this.beforeMask);
      ctx.registry.emitSelectionChanged(this.dirtyRect ?? undefined);
    }
    this.beforeMask = null;
    this.dirtyRect = null;
  }

  private readParams(e: ToolPointerEvent, ctx: ToolContext, pressure: number) {
    const { brush, selectionTools } = ctx.getEditor();
    const project = ctx.getProject();
    const metrics = getCalibrationMetrics(project.canvas);
    const diameterPx = Math.max(1, brushSizeToPx(brush.sizeValue, brush.sizeUnit, metrics.pxPerCm));
    const radiusPx = Math.max(0.5, diameterPx / 2);
    const effP = brush.usePressure ? Math.max(0.05, Math.min(1, pressure)) : 1;
    const flow = Math.max(0, Math.min(1, brush.flow * effP));
    const erase =
      e.altKey || selectionTools.maskBrushErase || selectionTools.combineMode === 'subtract';
    return { radiusPx, hardness: brush.hardness, flow, erase };
  }
}
