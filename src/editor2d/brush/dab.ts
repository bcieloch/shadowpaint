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
  const hasMask = Boolean(maskCfg?.active);
  const maskData = maskCfg?.data;
  const maskMode = maskCfg?.mode ?? 'protect';

  const cx = config.cx;
  const cy = config.cy;
  const h = Math.max(0, Math.min(1, config.hardness));
  const hardPlateau = h >= 0.999;
  const radiusSq = radius * radius;
  const innerRadius = radius * h;
  const innerRadiusSq = innerRadius * innerRadius;
  const invRadius = 1 / radius;
  const invOneMinusH = hardPlateau ? 1 : 1 / (1 - h);

  if (config.mapId === 'color') {
    const buf = registry.color;
    const working = buf.working;
    const base = buf.base;
    const layerMask = buf.activeMask;
    const isOverlay = buf.isOverlayLayerActive;
    const target = config.targetColorRgb ?? [255, 255, 255];
    const tr = target[0];
    const tg = target[1];
    const tb = target[2];
    const isEraser = config.kind === 'eraser';

    const applyColorPixel = (pxIdx: number, alpha: number) => {
      const idx = pxIdx * 4;
      if (isOverlay) {
        if (isEraser) {
          const prevM = layerMask[pxIdx] ?? 0;
          if (prevM > 0) {
            const nextM = Math.round(prevM * (1 - alpha));
            layerMask[pxIdx] = nextM;
            working[idx + 3] = nextM;
          }
          return;
        }
        const prevCov = (layerMask[pxIdx] ?? 0) / 255;
        const nextCov = prevCov + alpha * (1 - prevCov);
        const w = prevCov <= 0 ? 1 : Math.min(1, alpha / nextCov);
        const wr = working[idx] as number;
        const wg = working[idx + 1] as number;
        const wb = working[idx + 2] as number;
        working[idx] = Math.round(wr + (tr - wr) * w);
        working[idx + 1] = Math.round(wg + (tg - wg) * w);
        working[idx + 2] = Math.round(wb + (tb - wb) * w);
        const nextM = Math.max(1, Math.min(255, Math.round(nextCov * 255)));
        layerMask[pxIdx] = nextM;
        working[idx + 3] = nextM;
        return;
      }

      if (isEraser) {
        const br = base[idx] as number;
        const bg = base[idx + 1] as number;
        const bb = base[idx + 2] as number;
        const ba = base[idx + 3] as number;
        const wr = working[idx] as number;
        const wg = working[idx + 1] as number;
        const wb = working[idx + 2] as number;
        const wa = working[idx + 3] as number;
        working[idx] = Math.round(wr + (br - wr) * alpha);
        working[idx + 1] = Math.round(wg + (bg - wg) * alpha);
        working[idx + 2] = Math.round(wb + (bb - wb) * alpha);
        working[idx + 3] = Math.round(wa + (ba - wa) * alpha);
      } else if (alpha >= 1) {
        working[idx] = tr;
        working[idx + 1] = tg;
        working[idx + 2] = tb;
        working[idx + 3] = 255;
      } else {
        const wr = working[idx] as number;
        const wg = working[idx + 1] as number;
        const wb = working[idx + 2] as number;
        working[idx] = Math.round(wr + (tr - wr) * alpha);
        working[idx + 1] = Math.round(wg + (tg - wg) * alpha);
        working[idx + 2] = Math.round(wb + (tb - wb) * alpha);
        working[idx + 3] = 255;
      }
    };

    if (isSinglePixelBrush) {
      if (singlePxX >= x0 && singlePxX < x1 && singlePxY >= y0 && singlePxY < y1) {
        const pxIdx = singlePxY * width + singlePxX;
        const maskWeight =
          hasMask && maskData ? getSelectionMaskWeight(maskData, pxIdx, maskMode, true) : 1;
        if (maskWeight > 0) {
          applyColorPixel(pxIdx, Math.min(1, flow * maskWeight));
        }
      }
      return bounds;
    }

    for (let y = y0; y < y1; y++) {
      const dy = y + 0.5 - cy;
      const dySq = dy * dy;
      if (dySq >= radiusSq) continue;
      const maxDx = Math.sqrt(radiusSq - dySq);
      const rowX0 = Math.max(x0, Math.floor(cx - maxDx - 0.5));
      const rowX1 = Math.min(x1, Math.ceil(cx + maxDx - 0.5) + 1);
      const rowOffset = y * width;

      for (let x = rowX0; x < rowX1; x++) {
        const dx = x + 0.5 - cx;
        const distSq = dx * dx + dySq;
        if (distSq >= radiusSq) continue;

        let falloff: number;
        if (hardPlateau || distSq <= innerRadiusSq) {
          falloff = 1;
        } else {
          const dist = Math.sqrt(distSq);
          const t = (dist * invRadius - h) * invOneMinusH;
          falloff = 1 - t * t * (3 - 2 * t);
        }
        if (falloff <= 0) continue;

        const pxIdx = rowOffset + x;
        const maskWeight =
          hasMask && maskData ? getSelectionMaskWeight(maskData, pxIdx, maskMode, true) : 1;
        if (maskWeight <= 0) continue;

        const alpha = falloff * flow * maskWeight;
        if (alpha <= 0) continue;

        applyColorPixel(pxIdx, alpha);
      }
    }

    return bounds;
  }

  const buf = registry.getMap(config.mapId);
  const working = buf.working as Float32Array;
  const base = buf.base as Float32Array;
  const layerMask = buf.activeMask;
  const isOverlay = buf.isOverlayLayerActive;
  const targetVal = clamp01(config.targetValue ?? 0);
  const step = config.raiseLowerStep ?? DEFAULT_RAISE_LOWER_STEP;
  const isEraser = config.kind === 'eraser';
  const mode = config.mode;

  const applyScalarPixel = (idx: number, alpha: number) => {
    if (isOverlay) {
      if (isEraser) {
        const prevM = layerMask[idx] ?? 0;
        if (prevM > 0) {
          layerMask[idx] = Math.round(prevM * (1 - alpha));
        }
        return;
      }
      const prevCov = (layerMask[idx] ?? 0) / 255;
      const nextCov = prevCov + alpha * (1 - prevCov);
      const cur = prevCov > 0 ? (working[idx] as number) : buf.getUnderlyingValueAt(idx);
      let nextVal: number;
      if (mode === 'raise') {
        nextVal = cur + alpha * step;
        layerMask[idx] = 255;
      } else if (mode === 'lower') {
        nextVal = cur - alpha * step;
        layerMask[idx] = 255;
      } else {
        const w = prevCov <= 0 ? 1 : Math.min(1, alpha / nextCov);
        nextVal = cur + (targetVal - cur) * w;
        layerMask[idx] = Math.max(1, Math.min(255, Math.round(nextCov * 255)));
      }
      working[idx] = nextVal < 0 ? 0 : nextVal > 1 ? 1 : nextVal;
      return;
    }

    const cur = working[idx] as number;
    let nextVal: number;
    if (isEraser) {
      nextVal = cur + ((base[idx] as number) - cur) * alpha;
    } else if (mode === 'raise') {
      nextVal = cur + alpha * step;
    } else if (mode === 'lower') {
      nextVal = cur - alpha * step;
    } else {
      nextVal = alpha >= 1 ? targetVal : cur + (targetVal - cur) * alpha;
    }
    working[idx] = nextVal < 0 ? 0 : nextVal > 1 ? 1 : nextVal;
  };

  if (isSinglePixelBrush) {
    if (singlePxX >= x0 && singlePxX < x1 && singlePxY >= y0 && singlePxY < y1) {
      const idx = singlePxY * width + singlePxX;
      const maskWeight =
        hasMask && maskData ? getSelectionMaskWeight(maskData, idx, maskMode, true) : 1;
      if (maskWeight > 0) {
        applyScalarPixel(idx, Math.min(1, flow * maskWeight));
      }
    }
    return bounds;
  }

  for (let y = y0; y < y1; y++) {
    const dy = y + 0.5 - cy;
    const dySq = dy * dy;
    if (dySq >= radiusSq) continue;
    const maxDx = Math.sqrt(radiusSq - dySq);
    const rowX0 = Math.max(x0, Math.floor(cx - maxDx - 0.5));
    const rowX1 = Math.min(x1, Math.ceil(cx + maxDx - 0.5) + 1);
    const rowOffset = y * width;

    for (let x = rowX0; x < rowX1; x++) {
      const dx = x + 0.5 - cx;
      const distSq = dx * dx + dySq;
      if (distSq >= radiusSq) continue;

      let falloff: number;
      if (hardPlateau || distSq <= innerRadiusSq) {
        falloff = 1;
      } else {
        const dist = Math.sqrt(distSq);
        const t = (dist * invRadius - h) * invOneMinusH;
        falloff = 1 - t * t * (3 - 2 * t);
      }
      if (falloff <= 0) continue;

      const idx = rowOffset + x;
      const maskWeight =
        hasMask && maskData ? getSelectionMaskWeight(maskData, idx, maskMode, true) : 1;
      if (maskWeight <= 0) continue;

      const alpha = falloff * flow * maskWeight;
      if (alpha <= 0) continue;

      applyScalarPixel(idx, alpha);
    }
  }

  return bounds;
}
