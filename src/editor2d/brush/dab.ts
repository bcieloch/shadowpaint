import type { MapRegistry } from '@/core/maps/MapRegistry';
import { clamp01 } from '@/core/maps/quantize';
import type { MapId, Rect } from '@/core/types';
import {
  getSelectionMaskWeight,
  type SelectionMaskConfig,
} from '@/editor2d/selection/SelectionMask';

export type BrushMode = 'set' | 'raise' | 'lower';

export interface BrushDabConfig {
  kind: 'brush' | 'eraser';
  mapId: MapId;
  cx: number;
  cy: number;
  radiusPx: number;
  hardness: number;
  flow: number;
  mode: BrushMode;
  targetColorRgb?: readonly [number, number, number];
  targetValue?: number;
  raiseLowerStep?: number;
  mask?: SelectionMaskConfig;
}

const DEFAULT_RAISE_LOWER_STEP = 0.08;

export function computeDabBounds(
  cx: number,
  cy: number,
  radiusPx: number,
  width: number,
  height: number,
): Rect | null {
  const radius = Math.max(0.5, radiusPx);
  const x0 = Math.max(0, Math.floor(cx - radius));
  const y0 = Math.max(0, Math.floor(cy - radius));
  const x1 = Math.min(width, Math.ceil(cx + radius));
  const y1 = Math.min(height, Math.ceil(cy + radius));
  if (x0 >= x1 || y0 >= y1) return null;
  return { x: x0, y: y0, w: x1 - x0, h: y1 - y0 };
}

export function computeBrushFalloff(dist: number, radiusPx: number, hardness: number): number {
  if (radiusPx <= 0 || dist >= radiusPx) return 0;
  const h = Math.max(0, Math.min(1, hardness));
  const norm = dist / radiusPx;
  if (h >= 0.999 || norm <= h) return 1;
  const t = (norm - h) / (1 - h);
  return 1 - t * t * (3 - 2 * t);
}

export function stampDab(registry: MapRegistry, config: BrushDabConfig): Rect | null {
  if (!registry.isAllocated) return null;

  const width = registry.width;
  const height = registry.height;
  const radius = Math.max(0.5, config.radiusPx);
  const flow = Math.max(0, Math.min(1, config.flow));
  if (flow <= 0) return null;

  const bounds = computeDabBounds(config.cx, config.cy, radius, width, height);
  if (!bounds) return null;

  const x0 = bounds.x;
  const y0 = bounds.y;
  const x1 = bounds.x + bounds.w;
  const y1 = bounds.y + bounds.h;

  const isSinglePixelBrush = radius < 1;
  const singlePxX = Math.floor(config.cx);
  const singlePxY = Math.floor(config.cy);
  const maskCfg = config.mask;

  if (config.mapId === 'color') {
    const buf = registry.color;
    const working = buf.working;
    const base = buf.base;
    const target = config.targetColorRgb ?? [255, 255, 255];
    const tr = target[0];
    const tg = target[1];
    const tb = target[2];

    for (let y = y0; y < y1; y++) {
      const rowOffset = y * width;
      for (let x = x0; x < x1; x++) {
        let falloff: number;
        if (isSinglePixelBrush) {
          falloff = x === singlePxX && y === singlePxY ? 1 : 0;
        } else {
          const dx = x + 0.5 - config.cx;
          const dy = y + 0.5 - config.cy;
          const dist = Math.hypot(dx, dy);
          falloff = computeBrushFalloff(dist, radius, config.hardness);
        }
        if (falloff <= 0) continue;

        const pxIdx = rowOffset + x;
        const maskWeight = maskCfg?.active
          ? getSelectionMaskWeight(maskCfg.data, pxIdx, maskCfg.mode, true)
          : 1;
        if (maskWeight <= 0) continue;

        const alpha = Math.min(1, falloff * flow * maskWeight);
        if (alpha <= 0) continue;

        const idx = pxIdx * 4;
        if (config.kind === 'eraser') {
          const br = base[idx] ?? 0;
          const bg = base[idx + 1] ?? 0;
          const bb = base[idx + 2] ?? 0;
          const ba = base[idx + 3] ?? 255;
          working[idx] = Math.round((working[idx] ?? 0) + (br - (working[idx] ?? 0)) * alpha);
          working[idx + 1] = Math.round(
            (working[idx + 1] ?? 0) + (bg - (working[idx + 1] ?? 0)) * alpha,
          );
          working[idx + 2] = Math.round(
            (working[idx + 2] ?? 0) + (bb - (working[idx + 2] ?? 0)) * alpha,
          );
          working[idx + 3] = Math.round(
            (working[idx + 3] ?? 255) + (ba - (working[idx + 3] ?? 255)) * alpha,
          );
        } else {
          working[idx] = Math.round((working[idx] ?? 0) + (tr - (working[idx] ?? 0)) * alpha);
          working[idx + 1] = Math.round(
            (working[idx + 1] ?? 0) + (tg - (working[idx + 1] ?? 0)) * alpha,
          );
          working[idx + 2] = Math.round(
            (working[idx + 2] ?? 0) + (tb - (working[idx + 2] ?? 0)) * alpha,
          );
          working[idx + 3] = 255;
        }
      }
    }

    return bounds;
  }

  const buf = registry.getMap(config.mapId);
  const working = buf.working as Float32Array;
  const base = buf.base as Float32Array;
  const targetVal = clamp01(config.targetValue ?? 0);
  const step = config.raiseLowerStep ?? DEFAULT_RAISE_LOWER_STEP;

  for (let y = y0; y < y1; y++) {
    const rowOffset = y * width;
    for (let x = x0; x < x1; x++) {
      let falloff: number;
      if (isSinglePixelBrush) {
        falloff = x === singlePxX && y === singlePxY ? 1 : 0;
      } else {
        const dx = x + 0.5 - config.cx;
        const dy = y + 0.5 - config.cy;
        const dist = Math.hypot(dx, dy);
        falloff = computeBrushFalloff(dist, radius, config.hardness);
      }
      if (falloff <= 0) continue;

      const idx = rowOffset + x;
      const maskWeight = maskCfg?.active
        ? getSelectionMaskWeight(maskCfg.data, idx, maskCfg.mode, true)
        : 1;
      if (maskWeight <= 0) continue;

      const alpha = Math.min(1, falloff * flow * maskWeight);
      if (alpha <= 0) continue;

      const cur = working[idx] ?? 0;

      if (config.kind === 'eraser') {
        const b = base[idx] ?? 0;
        working[idx] = clamp01(cur + (b - cur) * alpha);
      } else if (config.mode === 'raise') {
        working[idx] = clamp01(cur + alpha * step);
      } else if (config.mode === 'lower') {
        working[idx] = clamp01(cur - alpha * step);
      } else {
        working[idx] = clamp01(cur + (targetVal - cur) * alpha);
      }
    }
  }

  return bounds;
}
