import { recomputeEffectiveRect } from '@/core/maps/adjustments';
import type { MapRegistry } from '@/core/maps/MapRegistry';
import { isEmptyRect, unionRect } from '@/core/maps/rect';
import type { MapId, ProjectSettings, Rect, Vec2 } from '@/core/types';
import { stampDab, type BrushMode } from '@/editor2d/brush/dab';

export interface StrokeParams {
  kind: 'brush' | 'eraser';
  mapId: MapId;
  radiusPx: number;
  hardness: number;
  flow: number;
  spacing: number;
  usePressure: boolean;
  mode: BrushMode;
  targetColorRgb?: readonly [number, number, number];
  targetValue?: number;
  adjustments: ProjectSettings['adjustments'];
}

export class StrokeSession {
  private readonly registry: MapRegistry;
  private active = false;
  private lastPos: Vec2 = { x: 0, y: 0 };
  private lastPressure = 1;
  private residualDist = 0;
  private totalDirtyRect: Rect | null = null;

  constructor(registry: MapRegistry) {
    this.registry = registry;
  }

  get isActive(): boolean {
    return this.active;
  }

  begin(pos: Vec2, pressure: number, params: StrokeParams): Rect | null {
    if (!this.registry.isAllocated) return null;

    this.active = true;
    this.lastPos = { x: pos.x, y: pos.y };
    this.lastPressure = pressure;
    this.residualDist = 0;
    this.totalDirtyRect = null;

    const effectiveFlow = this.computeEffectiveFlow(params.flow, pressure, params.usePressure);
    const rect = stampDab(this.registry, {
      kind: params.kind,
      mapId: params.mapId,
      cx: pos.x,
      cy: pos.y,
      radiusPx: params.radiusPx,
      hardness: params.hardness,
      flow: effectiveFlow,
      mode: params.mode,
      targetColorRgb: params.targetColorRgb,
      targetValue: params.targetValue,
    });

    if (rect && !isEmptyRect(rect)) {
      this.commitDirtyRect(params.mapId, params.adjustments, rect);
      this.totalDirtyRect = rect;
    }

    return rect;
  }

  move(pos: Vec2, pressure: number, params: StrokeParams): Rect | null {
    if (!this.active || !this.registry.isAllocated) return null;

    const dx = pos.x - this.lastPos.x;
    const dy = pos.y - this.lastPos.y;
    const segLen = Math.hypot(dx, dy);

    if (segLen < 1e-4) {
      return null;
    }

    const diameterPx = Math.max(1, params.radiusPx * 2);
    const stepPx = Math.max(1, diameterPx * Math.max(0.05, Math.min(1, params.spacing)));

    let dist = stepPx - this.residualDist;
    let segmentDirty: Rect | null = null;

    while (dist <= segLen) {
      const t = dist / segLen;
      const cx = this.lastPos.x + dx * t;
      const cy = this.lastPos.y + dy * t;
      const p = this.lastPressure + (pressure - this.lastPressure) * t;
      const effectiveFlow = this.computeEffectiveFlow(params.flow, p, params.usePressure);

      const rect = stampDab(this.registry, {
        kind: params.kind,
        mapId: params.mapId,
        cx,
        cy,
        radiusPx: params.radiusPx,
        hardness: params.hardness,
        flow: effectiveFlow,
        mode: params.mode,
        targetColorRgb: params.targetColorRgb,
        targetValue: params.targetValue,
      });

      if (rect && !isEmptyRect(rect)) {
        segmentDirty = segmentDirty ? unionRect(segmentDirty, rect) : rect;
      }

      dist += stepPx;
    }

    this.residualDist = segLen - (dist - stepPx);
    this.lastPos = { x: pos.x, y: pos.y };
    this.lastPressure = pressure;

    if (segmentDirty && !isEmptyRect(segmentDirty)) {
      this.commitDirtyRect(params.mapId, params.adjustments, segmentDirty);
      this.totalDirtyRect = this.totalDirtyRect
        ? unionRect(this.totalDirtyRect, segmentDirty)
        : segmentDirty;
    }

    return segmentDirty;
  }

  end(): Rect | null {
    this.active = false;
    const bounds = this.totalDirtyRect;
    this.totalDirtyRect = null;
    return bounds;
  }

  cancel(): void {
    this.active = false;
    this.totalDirtyRect = null;
  }

  private computeEffectiveFlow(baseFlow: number, pressure: number, usePressure: boolean): number {
    const p = usePressure ? Math.max(0.05, Math.min(1, pressure)) : 1;
    return Math.max(0, Math.min(1, baseFlow * p));
  }

  private commitDirtyRect(
    mapId: MapId,
    adjustments: ProjectSettings['adjustments'],
    rect: Rect,
  ): void {
    recomputeEffectiveRect(this.registry, mapId, adjustments, rect);
    this.registry.emitDirty(mapId, rect);
  }
}
