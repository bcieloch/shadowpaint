import { TileHistoryTransaction } from '@/core/history/TileHistory';
import { recomputeEffectiveRect } from '@/core/maps/adjustments';
import { isEmptyRect, unionRect } from '@/core/maps/rect';
import type { MapId, Rect, Vec2 } from '@/core/types';
import { brushSizeToPx, getCalibrationMetrics } from '@/core/units/calibration';
import { computeDabBounds } from '@/editor2d/brush/dab';
import { stampSmoothDab } from '@/editor2d/brush/filterDab';
import {
  createSelectionMaskConfig,
  type SelectionMaskConfig,
} from '@/editor2d/selection/SelectionMask';
import { resolvePressure } from '@/editor2d/tools/BrushTool';
import type { Tool, ToolContext, ToolPointerEvent } from '@/editor2d/tools/Tool';

export class SmoothTool implements Tool {
  readonly id = 'smooth' as const;
  private active = false;
  private lockedWarned = false;
  private activeMap: MapId = 'height';
  private transaction: TileHistoryTransaction | null = null;
  private maskConfig: SelectionMaskConfig | undefined = undefined;
  private lastPos: Vec2 = { x: 0, y: 0 };
  private lastPressure = 1;
  private residualDist = 0;

  onDown(e: ToolPointerEvent, ctx: ToolContext): void {
    const project = ctx.getProject();
    const { activeMap, brush, smoothTool } = ctx.getEditor();
    if (project.maps[activeMap].locked) {
      this.lockedWarned = true;
      ctx.onLockedMapAttempt(activeMap);
      return;
    }
    if (!ctx.registry.isAllocated) return;

    this.lockedWarned = false;
    this.active = true;
    this.activeMap = activeMap;
    this.lastPos = { x: e.imagePos.x, y: e.imagePos.y };
    this.lastPressure = resolvePressure(e);
    this.residualDist = 0;

    const tx = new TileHistoryTransaction(ctx.registry, activeMap, 'smoothStroke', 'working');
    this.transaction = tx;
    this.maskConfig = createSelectionMaskConfig(ctx.registry, project.selection.mode);

    const metrics = getCalibrationMetrics(project.canvas);
    const radiusPx = Math.max(
      0.5,
      brushSizeToPx(brush.sizeValue, brush.sizeUnit, metrics.pxPerCm) / 2,
    );
    const effectiveFlow = this.computeFlow(brush.flow, this.lastPressure, brush.usePressure);
    if (effectiveFlow > 0) {
      const predicted = computeDabBounds(
        e.imagePos.x,
        e.imagePos.y,
        radiusPx,
        ctx.registry.width,
        ctx.registry.height,
      );
      if (predicted) {
        tx.ensureTilesForRect(predicted);
      }
    }

    const rect = stampSmoothDab(ctx.registry, {
      mapId: activeMap,
      cx: e.imagePos.x,
      cy: e.imagePos.y,
      radiusPx,
      hardness: brush.hardness,
      flow: effectiveFlow,
      iterations: smoothTool.iterations,
      mask: this.maskConfig,
    });

    if (rect && !isEmptyRect(rect)) {
      recomputeEffectiveRect(ctx.registry, activeMap, project.adjustments, rect);
      ctx.registry.emitDirty(activeMap, rect);
    }
  }

  onMove(e: ToolPointerEvent, ctx: ToolContext): void {
    if (this.lockedWarned || !this.active || !this.transaction || !ctx.registry.isAllocated) {
      return;
    }

    const dx = e.imagePos.x - this.lastPos.x;
    const dy = e.imagePos.y - this.lastPos.y;
    const segLen = Math.hypot(dx, dy);
    if (segLen < 1e-4) return;

    const project = ctx.getProject();
    const { brush, smoothTool } = ctx.getEditor();
    const metrics = getCalibrationMetrics(project.canvas);
    const radiusPx = Math.max(
      0.5,
      brushSizeToPx(brush.sizeValue, brush.sizeUnit, metrics.pxPerCm) / 2,
    );
    const pressure = resolvePressure(e);
    const diameterPx = Math.max(1, radiusPx * 2);
    const stepPx = Math.max(1, diameterPx * Math.max(0.05, Math.min(1, brush.spacing)));

    let dist = stepPx - this.residualDist;
    let segmentDirty: Rect | null = null;

    while (dist <= segLen) {
      const t = dist / segLen;
      const cx = this.lastPos.x + dx * t;
      const cy = this.lastPos.y + dy * t;
      const p = this.lastPressure + (pressure - this.lastPressure) * t;
      const effectiveFlow = this.computeFlow(brush.flow, p, brush.usePressure);

      if (effectiveFlow > 0) {
        const predicted = computeDabBounds(
          cx,
          cy,
          radiusPx,
          ctx.registry.width,
          ctx.registry.height,
        );
        if (predicted) {
          this.transaction.ensureTilesForRect(predicted);
        }
      }

      const rect = stampSmoothDab(ctx.registry, {
        mapId: this.activeMap,
        cx,
        cy,
        radiusPx,
        hardness: brush.hardness,
        flow: effectiveFlow,
        iterations: smoothTool.iterations,
        mask: this.maskConfig,
      });

      if (rect && !isEmptyRect(rect)) {
        segmentDirty = segmentDirty ? unionRect(segmentDirty, rect) : rect;
      }

      dist += stepPx;
    }

    this.residualDist = segLen - (dist - stepPx);
    this.lastPos = { x: e.imagePos.x, y: e.imagePos.y };
    this.lastPressure = pressure;

    if (segmentDirty && !isEmptyRect(segmentDirty)) {
      recomputeEffectiveRect(ctx.registry, this.activeMap, project.adjustments, segmentDirty);
      ctx.registry.emitDirty(this.activeMap, segmentDirty);
    }
  }

  onUp(_e: ToolPointerEvent, ctx: ToolContext): void {
    this.lockedWarned = false;
    this.active = false;
    this.maskConfig = undefined;
    const entry = this.transaction?.commit();
    if (entry) {
      ctx.recordMapTileEntry?.(entry);
    }
    this.transaction = null;
  }

  onCancel(ctx: ToolContext): void {
    this.lockedWarned = false;
    this.active = false;
    this.maskConfig = undefined;
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
    this.transaction = null;
  }

  private computeFlow(baseFlow: number, pressure: number, usePressure: boolean): number {
    const p = usePressure ? Math.max(0.05, Math.min(1, pressure)) : 1;
    return Math.max(0, Math.min(1, baseFlow * p));
  }
}
