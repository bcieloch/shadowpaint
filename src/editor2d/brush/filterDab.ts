import type { MapRegistry } from '@/core/maps/MapRegistry';
import { clamp01 } from '@/core/maps/quantize';
import type { MapId, Rect } from '@/core/types';
import { computeBrushFalloff, computeDabBounds } from '@/editor2d/brush/dab';
import {
  getSelectionMaskWeight,
  type SelectionMaskConfig,
} from '@/editor2d/selection/SelectionMask';
import { gaussianBlurRegionFloat32, gaussianBlurRegionRgba8 } from '@/imaging/blur';
import { laplaceSmoothFloat32Region, laplaceSmoothRgba8Region } from '@/imaging/smooth';

export interface FilterDabSpec {
  cx: number;
  cy: number;
  radiusPx: number;
  hardness: number;
  flow: number;
}

export interface SmoothDabConfig extends FilterDabSpec {
  mapId: MapId;
  iterations: number;
  mask?: SelectionMaskConfig;
}

export interface BlurDabConfig extends FilterDabSpec {
  mapId: MapId;
  kernelRadiusPx: number;
  mask?: SelectionMaskConfig;
}

function blendPatchIntoMap(
  registry: MapRegistry,
  mapId: MapId,
  bounds: Rect,
  patch: Float32Array | Uint8ClampedArray,
  cx: number,
  cy: number,
  radius: number,
  hardness: number,
  flow: number,
  maskCfg?: SelectionMaskConfig,
): boolean {
  const width = registry.width;
  const x0 = bounds.x;
  const y0 = bounds.y;
  const rw = bounds.w;
  const rh = bounds.h;
  const isSinglePixel = radius < 1;
  const singlePxX = Math.floor(cx);
  const singlePxY = Math.floor(cy);

  let changed = false;

  if (mapId === 'color') {
    const working = registry.color.working;
    const src = patch as Uint8ClampedArray;
    for (let ly = 0; ly < rh; ly++) {
      const y = y0 + ly;
      const rowOff = y * width;
      const patchRow = ly * rw;
      for (let lx = 0; lx < rw; lx++) {
        const x = x0 + lx;
        const falloff = isSinglePixel
          ? x === singlePxX && y === singlePxY
            ? 1
            : 0
          : computeBrushFalloff(Math.hypot(x + 0.5 - cx, y + 0.5 - cy), radius, hardness);
        if (falloff <= 0) continue;

        const pxIdx = rowOff + x;
        const maskWeight = maskCfg?.active
          ? getSelectionMaskWeight(maskCfg.data, pxIdx, maskCfg.mode, true)
          : 1;
        if (maskWeight <= 0) continue;

        const alpha = Math.min(1, falloff * flow * maskWeight);
        if (alpha <= 0) continue;

        const di = pxIdx * 4;
        const pi = (patchRow + lx) * 4;
        working[di] = Math.round(
          (working[di] ?? 0) + ((src[pi] ?? 0) - (working[di] ?? 0)) * alpha,
        );
        working[di + 1] = Math.round(
          (working[di + 1] ?? 0) + ((src[pi + 1] ?? 0) - (working[di + 1] ?? 0)) * alpha,
        );
        working[di + 2] = Math.round(
          (working[di + 2] ?? 0) + ((src[pi + 2] ?? 0) - (working[di + 2] ?? 0)) * alpha,
        );
        changed = true;
      }
    }
    return changed;
  }

  const working = registry.getMap(mapId).working as Float32Array;
  const src = patch as Float32Array;
  for (let ly = 0; ly < rh; ly++) {
    const y = y0 + ly;
    const rowOff = y * width;
    const patchRow = ly * rw;
    for (let lx = 0; lx < rw; lx++) {
      const x = x0 + lx;
      const falloff = isSinglePixel
        ? x === singlePxX && y === singlePxY
          ? 1
          : 0
        : computeBrushFalloff(Math.hypot(x + 0.5 - cx, y + 0.5 - cy), radius, hardness);
      if (falloff <= 0) continue;

      const pxIdx = rowOff + x;
      const maskWeight = maskCfg?.active
        ? getSelectionMaskWeight(maskCfg.data, pxIdx, maskCfg.mode, true)
        : 1;
      if (maskWeight <= 0) continue;

      const alpha = Math.min(1, falloff * flow * maskWeight);
      if (alpha <= 0) continue;

      const cur = working[pxIdx] ?? 0;
      const target = src[patchRow + lx] ?? cur;
      working[pxIdx] = clamp01(cur + (target - cur) * alpha);
      changed = true;
    }
  }
  return changed;
}

export function stampSmoothDab(registry: MapRegistry, config: SmoothDabConfig): Rect | null {
  if (!registry.isAllocated) return null;
  const radius = Math.max(0.5, config.radiusPx);
  const flow = Math.max(0, Math.min(1, config.flow));
  if (flow <= 0) return null;

  const bounds = computeDabBounds(config.cx, config.cy, radius, registry.width, registry.height);
  if (!bounds) return null;

  const patch =
    config.mapId === 'color'
      ? laplaceSmoothRgba8Region(
          registry.color.working,
          registry.width,
          registry.height,
          bounds,
          config.iterations,
        )
      : laplaceSmoothFloat32Region(
          registry.getMap(config.mapId).working as Float32Array,
          registry.width,
          registry.height,
          bounds,
          config.iterations,
        );

  const changed = blendPatchIntoMap(
    registry,
    config.mapId,
    bounds,
    patch,
    config.cx,
    config.cy,
    radius,
    config.hardness,
    flow,
    config.mask,
  );

  return changed ? bounds : null;
}

export function stampGaussianBlurDab(registry: MapRegistry, config: BlurDabConfig): Rect | null {
  if (!registry.isAllocated) return null;
  const radius = Math.max(0.5, config.radiusPx);
  const flow = Math.max(0, Math.min(1, config.flow));
  if (flow <= 0 || config.kernelRadiusPx <= 0.25) return null;

  const bounds = computeDabBounds(config.cx, config.cy, radius, registry.width, registry.height);
  if (!bounds) return null;

  const patch =
    config.mapId === 'color'
      ? gaussianBlurRegionRgba8(
          registry.color.working,
          registry.width,
          registry.height,
          bounds,
          config.kernelRadiusPx,
        )
      : gaussianBlurRegionFloat32(
          registry.getMap(config.mapId).working as Float32Array,
          registry.width,
          registry.height,
          bounds,
          config.kernelRadiusPx,
        );

  const changed = blendPatchIntoMap(
    registry,
    config.mapId,
    bounds,
    patch,
    config.cx,
    config.cy,
    radius,
    config.hardness,
    flow,
    config.mask,
  );

  return changed ? bounds : null;
}

export function accumulateBrushDabWeights(
  registry: MapRegistry,
  rect: Rect,
  dabs: readonly FilterDabSpec[],
  maskCfg?: SelectionMaskConfig,
): Float32Array {
  const weights = new Float32Array(Math.max(0, rect.w * rect.h));
  if (rect.w <= 0 || rect.h <= 0 || dabs.length === 0) {
    return weights;
  }

  const width = registry.width;
  const rx0 = rect.x;
  const ry0 = rect.y;
  const rx1 = rect.x + rect.w;
  const ry1 = rect.y + rect.h;

  for (const dab of dabs) {
    const radius = Math.max(0.5, dab.radiusPx);
    const flow = Math.max(0, Math.min(1, dab.flow));
    if (flow <= 0) continue;

    const dx0 = Math.max(rx0, Math.floor(dab.cx - radius));
    const dy0 = Math.max(ry0, Math.floor(dab.cy - radius));
    const dx1 = Math.min(rx1, Math.ceil(dab.cx + radius));
    const dy1 = Math.min(ry1, Math.ceil(dab.cy + radius));
    if (dx0 >= dx1 || dy0 >= dy1) continue;

    const isSinglePixel = radius < 1;
    const singlePxX = Math.floor(dab.cx);
    const singlePxY = Math.floor(dab.cy);

    for (let y = dy0; y < dy1; y++) {
      const ly = y - ry0;
      const wRow = ly * rect.w;
      const imgRow = y * width;
      for (let x = dx0; x < dx1; x++) {
        const falloff = isSinglePixel
          ? x === singlePxX && y === singlePxY
            ? 1
            : 0
          : computeBrushFalloff(
              Math.hypot(x + 0.5 - dab.cx, y + 0.5 - dab.cy),
              radius,
              dab.hardness,
            );
        if (falloff <= 0) continue;

        const maskWeight = maskCfg?.active
          ? getSelectionMaskWeight(maskCfg.data, imgRow + x, maskCfg.mode, true)
          : 1;
        if (maskWeight <= 0) continue;

        const alpha = Math.min(1, falloff * flow * maskWeight);
        if (alpha <= 0) continue;

        const wi = wRow + (x - rx0);
        const cur = weights[wi] ?? 0;
        weights[wi] = Math.min(1, cur + (1 - cur) * alpha);
      }
    }
  }

  return weights;
}
