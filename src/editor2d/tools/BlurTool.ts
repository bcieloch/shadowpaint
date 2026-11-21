import { TileHistoryTransaction } from '@/core/history/TileHistory';
import { recomputeEffectiveRect } from '@/core/maps/adjustments';
import { isEmptyRect, unionRect } from '@/core/maps/rect';
import type { MapId, Rect, Vec2 } from '@/core/types';
import { brushSizeToPx, getCalibrationMetrics } from '@/core/units/calibration';
import { computeDabBounds } from '@/editor2d/brush/dab';
import {
  accumulateBrushDabWeights,
  stampGaussianBlurDab,
  type FilterDabSpec,
} from '@/editor2d/brush/filterDab';
import type { SelectionDraftPreview } from '@/editor2d/overlay/OverlayRenderer';
import {
  createSelectionMaskConfig,
  type SelectionMaskConfig,
} from '@/editor2d/selection/SelectionMask';
import { resolvePressure } from '@/editor2d/tools/BrushTool';
import type { Tool, ToolContext, ToolPointerEvent } from '@/editor2d/tools/Tool';
import { applyRegionBlurStroke } from '@/services/filterService';

export const BLUR_REALTIME_MAX_RADIUS_PX = 12;

export class BlurTool implements Tool {
  readonly id = 'blur' as const;
  private active = false;
  private lockedWarned = false;
  private activeMap: MapId = 'height';
  private useWorkerMode = false;
  private kernelRadiusPx = 6;
  private transaction: TileHistoryTransaction | null = null;
  private maskConfig: SelectionMaskConfig | undefined = undefined;
  private lastPos: Vec2 = { x: 0, y: 0 };
  private lastPressure = 1;
  private residualDist = 0;

  // Worker region accumulation state (when kernelRadiusPx > BLUR_REALTIME_MAX_RADIUS_PX)
  private dabs: FilterDabSpec[] = [];
  private strokeBounds: Rect | null = null;
  private strokePoints: Vec2[] = [];

  onDown(e: ToolPointerEvent, ctx: ToolContext): void {
    const project = ctx.getProject();
    const { activeMap, brush, blurTool } = ctx.getEditor();
    if (
      project.maps[activeMap].locked ||
      (ctx.registry.isAllocated && ctx.registry.getMap(activeMap).activeLayer.locked)
    ) {
      this.lockedWarned = true;
      ctx.onLockedMapAttempt(activeMap);
      return;
    }
    if (!ctx.registry.isAllocated) return;

    const metrics = getCalibrationMetrics(project.canvas);
    const kernelRadiusPx = Math.max(
      0.5,
      brushSizeToPx(blurTool.radiusValue, blurTool.radiusUnit, metrics.pxPerCm),
    );
    const radiusPx = Math.max(
      0.5,
      brushSizeToPx(brush.sizeValue, brush.sizeUnit, metrics.pxPerCm) / 2,
    );

    this.lockedWarned = false;
    this.active = true;
    this.activeMap = activeMap;
    this.kernelRadiusPx = kernelRadiusPx;
    this.useWorkerMode = kernelRadiusPx > BLUR_REALTIME_MAX_RADIUS_PX;
    this.lastPos = { x: e.imagePos.x, y: e.imagePos.y };
    this.lastPressure = resolvePressure(e);
    this.residualDist = 0;
    this.maskConfig = createSelectionMaskConfig(ctx.registry, project.selection.mode);
    this.dabs = [];
    this.strokeBounds = null;
    this.strokePoints = [];

    const effectiveFlow = this.computeFlow(brush.flow, this.lastPressure, brush.usePressure);

    if (this.useWorkerMode) {
      this.transaction = null;
      this.strokePoints = [{ x: e.imagePos.x, y: e.imagePos.y }];
      if (effectiveFlow > 0) {
        const dabBounds = computeDabBounds(
          e.imagePos.x,
          e.imagePos.y,
          radiusPx,
          ctx.registry.width,
          ctx.registry.height,
        );
        if (dabBounds) {
          this.dabs.push({
            cx: e.imagePos.x,
            cy: e.imagePos.y,
            radiusPx,
            hardness: brush.hardness,
            flow: effectiveFlow,
          });
          this.strokeBounds = dabBounds;
        }
      }
      return;
    }

    const tx = new TileHistoryTransaction(ctx.registry, activeMap, 'blurStroke', 'working');
    this.transaction = tx;
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

    const rect = stampGaussianBlurDab(ctx.registry, {
      mapId: activeMap,
      cx: e.imagePos.x,
      cy: e.imagePos.y,
      radiusPx,
      hardness: brush.hardness,
      flow: effectiveFlow,
      kernelRadiusPx,
      mask: this.maskConfig,
    });

    if (rect && !isEmptyRect(rect)) {
      recomputeEffectiveRect(ctx.registry, activeMap, project.adjustments, rect);
      ctx.registry.emitDirty(activeMap, rect);
    }
  }

  onMove(e: ToolPointerEvent, ctx: ToolContext): void {
    if (this.lockedWarned || !this.active || !ctx.registry.isAllocated) {
      return;
    }

    const dx = e.imagePos.x - this.lastPos.x;
    const dy = e.imagePos.y - this.lastPos.y;
    const segLen = Math.hypot(dx, dy);
    if (segLen < 1e-4) return;

    const project = ctx.getProject();
    const { brush } = ctx.getEditor();
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

    if (this.useWorkerMode) {
      const last = this.strokePoints[this.strokePoints.length - 1];
      if (!last || Math.hypot(e.imagePos.x - last.x, e.imagePos.y - last.y) >= 1.5) {
        this.strokePoints.push({ x: e.imagePos.x, y: e.imagePos.y });
      }
    }

    while (dist <= segLen) {
      const t = dist / segLen;
      const cx = this.lastPos.x + dx * t;
      const cy = this.lastPos.y + dy * t;
      const p = this.lastPressure + (pressure - this.lastPressure) * t;
      const effectiveFlow = this.computeFlow(brush.flow, p, brush.usePressure);

      if (this.useWorkerMode) {
        if (effectiveFlow > 0) {
          const dabBounds = computeDabBounds(
            cx,
            cy,
            radiusPx,
            ctx.registry.width,
            ctx.registry.height,
          );
          if (dabBounds) {
            this.dabs.push({
              cx,
              cy,
              radiusPx,
              hardness: brush.hardness,
              flow: effectiveFlow,
            });
            this.strokeBounds = this.strokeBounds
              ? unionRect(this.strokeBounds, dabBounds)
              : dabBounds;
          }
        }
      } else if (this.transaction) {
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

        const rect = stampGaussianBlurDab(ctx.registry, {
          mapId: this.activeMap,
          cx,
          cy,
          radiusPx,
          hardness: brush.hardness,
          flow: effectiveFlow,
          kernelRadiusPx: this.kernelRadiusPx,
          mask: this.maskConfig,
        });

        if (rect && !isEmptyRect(rect)) {
          segmentDirty = segmentDirty ? unionRect(segmentDirty, rect) : rect;
        }
      }

      dist += stepPx;
    }

    this.residualDist = segLen - (dist - stepPx);
    this.lastPos = { x: e.imagePos.x, y: e.imagePos.y };
    this.lastPressure = pressure;

    if (!this.useWorkerMode && segmentDirty && !isEmptyRect(segmentDirty)) {
      recomputeEffectiveRect(ctx.registry, this.activeMap, project.adjustments, segmentDirty);
      ctx.registry.emitDirty(this.activeMap, segmentDirty);
    }
  }

  onUp(_e: ToolPointerEvent, ctx: ToolContext): void {
    const wasWorkerMode = this.useWorkerMode;
    const strokeBounds = this.strokeBounds;
    const dabs = this.dabs;
    const maskConfig = this.maskConfig;
    const activeMap = this.activeMap;
    const kernelRadiusPx = this.kernelRadiusPx;
    const wasLocked = this.lockedWarned;

    this.resetState();

    if (wasLocked || !ctx.registry.isAllocated) return;

    if (wasWorkerMode) {
      if (strokeBounds && !isEmptyRect(strokeBounds) && dabs.length > 0) {
        const weightMask = accumulateBrushDabWeights(ctx.registry, strokeBounds, dabs, maskConfig);
        void applyRegionBlurStroke({
          mapId: activeMap,
          rect: strokeBounds,
          kernelRadiusPx,
          weightMask,
        });
      }
      return;
    }

    const entry = this.transaction?.commit();
    if (entry) {
      ctx.recordMapTileEntry?.(entry);
    }
    this.transaction = null;
  }

  onCancel(ctx: ToolContext): void {
    const tx = this.transaction;
    this.resetState();
    this.transaction = null;

    if (tx) {
      const dirty = tx.rollback();
      if (dirty) {
        recomputeEffectiveRect(ctx.registry, tx.mapId, ctx.getProject().adjustments, dirty);
        ctx.registry.emitDirty(tx.mapId, dirty);
      }
    }
  }

  getOverlayPreview(): SelectionDraftPreview | null {
    if (!this.active || !this.useWorkerMode || this.strokePoints.length < 2) {
      return null;
    }
    return {
      kind: 'stroke',
      points: this.strokePoints,
    };
  }

  private resetState(): void {
    this.lockedWarned = false;
    this.active = false;
    this.useWorkerMode = false;
    this.maskConfig = undefined;
    this.dabs = [];
    this.strokeBounds = null;
    this.strokePoints = [];
  }

  private computeFlow(baseFlow: number, pressure: number, usePressure: boolean): number {
    const p = usePressure ? Math.max(0.05, Math.min(1, pressure)) : 1;
    return Math.max(0, Math.min(1, baseFlow * p));
  }
}
