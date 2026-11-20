import { TileHistoryTransaction } from '@/core/history/TileHistory';
import { recomputeEffectiveRect } from '@/core/maps/adjustments';
import { clamp01 } from '@/core/maps/quantize';
import { brushSizeToPx, getCalibrationMetrics, mmToValue } from '@/core/units/calibration';
import { hexToRgb01 } from '@/core/units/colorTemperature';
import { StrokeSession, type StrokeParams } from '@/editor2d/brush/stroke';
import type { Tool, ToolContext, ToolPointerEvent } from '@/editor2d/tools/Tool';

function buildStrokeParams(kind: 'brush' | 'eraser', ctx: ToolContext): StrokeParams {
  const project = ctx.getProject();
  const editor = ctx.getEditor();
  const { activeMap, brush } = editor;
  const metrics = getCalibrationMetrics(project.canvas);
  const diameterPx = Math.max(1, brushSizeToPx(brush.sizeValue, brush.sizeUnit, metrics.pxPerCm));
  const radiusPx = Math.max(0.5, diameterPx / 2);

  const rgb01 = hexToRgb01(brush.colorHex);
  const targetColorRgb: readonly [number, number, number] = [
    Math.round(rgb01.r * 255),
    Math.round(rgb01.g * 255),
    Math.round(rgb01.b * 255),
  ];

  const targetValue =
    activeMap === 'height'
      ? mmToValue(brush.heightMm, project.canvas.minThicknessMm, project.canvas.maxThicknessMm)
      : clamp01(brush.opacityPct / 100);

  return {
    kind,
    mapId: activeMap,
    radiusPx,
    hardness: brush.hardness,
    flow: brush.flow,
    spacing: brush.spacing,
    usePressure: brush.usePressure,
    mode: brush.mode,
    targetColorRgb,
    targetValue,
    adjustments: project.adjustments,
  };
}

function resolvePressure(e: ToolPointerEvent): number {
  if (e.pointerType === 'pen' && Number.isFinite(e.pressure) && e.pressure > 0) {
    return Math.max(0.05, Math.min(1, e.pressure));
  }
  return 1;
}

export class BrushTool implements Tool {
  readonly id = 'brush' as const;
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
    const tx = new TileHistoryTransaction(ctx.registry, activeMap, 'brushStroke', 'working');
    this.transaction = tx;
    this.session = new StrokeSession(ctx.registry, {
      onBeforeWriteRect: (rect) => tx.ensureTilesForRect(rect),
    });
    const params = buildStrokeParams('brush', ctx);
    this.session.begin(e.imagePos, resolvePressure(e), params);
  }

  onMove(e: ToolPointerEvent, ctx: ToolContext): void {
    if (this.lockedWarned || !this.session?.isActive) return;
    const params = buildStrokeParams('brush', ctx);
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

export { buildStrokeParams, resolvePressure };
