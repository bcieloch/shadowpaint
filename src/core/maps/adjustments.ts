import type { MapRegistry } from '@/core/maps/MapRegistry';
import { clamp01 } from '@/core/maps/quantize';
import type {
  ColorAdjustments,
  HeightAdjustments,
  MapId,
  OpacityAdjustments,
  ProjectSettings,
  Rect,
} from '@/core/types';

function contrastFactor(c: number): number {
  const clamped = Math.max(-1, Math.min(1, c));
  return clamped >= 0 ? 1 / (1 - 0.99 * clamped) : 1 + clamped;
}

function copyRgbaRect(
  src: Uint8ClampedArray,
  dst: Uint8ClampedArray,
  width: number,
  x0: number,
  y0: number,
  x1: number,
  y1: number,
  fullWidth: number,
  fullHeight: number,
): void {
  if (x0 === 0 && y0 === 0 && x1 === fullWidth && y1 === fullHeight && src.length === dst.length) {
    dst.set(src);
    return;
  }
  const rowBytes = (x1 - x0) * 4;
  for (let y = y0; y < y1; y++) {
    const start = (y * width + x0) * 4;
    dst.set(src.subarray(start, start + rowBytes), start);
  }
}

function copyFloatRect(
  src: Float32Array,
  dst: Float32Array,
  width: number,
  x0: number,
  y0: number,
  x1: number,
  y1: number,
  fullWidth: number,
  fullHeight: number,
): void {
  if (x0 === 0 && y0 === 0 && x1 === fullWidth && y1 === fullHeight && src.length === dst.length) {
    dst.set(src);
    return;
  }
  const span = x1 - x0;
  for (let y = y0; y < y1; y++) {
    const start = y * width + x0;
    dst.set(src.subarray(start, start + span), start);
  }
}

export function applyColorAdjustments(
  src: Uint8ClampedArray,
  dst: Uint8ClampedArray,
  width: number,
  height: number,
  params: ColorAdjustments,
  rect?: Rect,
): void {
  const b = params.brightness;
  const k = contrastFactor(params.contrast);
  const satMult = 1 + params.saturation;

  const x0 = rect ? Math.max(0, rect.x) : 0;
  const y0 = rect ? Math.max(0, rect.y) : 0;
  const x1 = rect ? Math.min(width, rect.x + rect.w) : width;
  const y1 = rect ? Math.min(height, rect.y + rect.h) : height;
  if (x0 >= x1 || y0 >= y1) return;

  if (b === 0 && params.contrast === 0 && params.saturation === 0) {
    copyRgbaRect(src, dst, width, x0, y0, x1, y1, width, height);
    return;
  }

  if (params.saturation === 0) {
    const lut = new Uint8Array(256);
    for (let i = 0; i < 256; i++) {
      const c = (i / 255 + b - 0.5) * k + 0.5;
      lut[i] = Math.round(clamp01(c) * 255);
    }

    for (let y = y0; y < y1; y++) {
      let idx = (y * width + x0) * 4;
      for (let x = x0; x < x1; x++) {
        dst[idx] = lut[src[idx] as number] as number;
        dst[idx + 1] = lut[src[idx + 1] as number] as number;
        dst[idx + 2] = lut[src[idx + 2] as number] as number;
        dst[idx + 3] = src[idx + 3] as number;
        idx += 4;
      }
    }
    return;
  }

  const lut = new Float64Array(256);
  for (let i = 0; i < 256; i++) {
    lut[i] = (i / 255 + b - 0.5) * k + 0.5;
  }
  const oneMinusSat = 1 - satMult;

  for (let y = y0; y < y1; y++) {
    let idx = (y * width + x0) * 4;
    for (let x = x0; x < x1; x++) {
      const r = lut[src[idx] as number] as number;
      const g = lut[src[idx + 1] as number] as number;
      const bl = lut[src[idx + 2] as number] as number;

      const lumTerm = (0.2126 * r + 0.7152 * g + 0.0722 * bl) * oneMinusSat;
      const rr = lumTerm + r * satMult;
      const gg = lumTerm + g * satMult;
      const bb = lumTerm + bl * satMult;

      dst[idx] = rr <= 0 ? 0 : rr >= 1 ? 255 : (rr * 255 + 0.5) | 0;
      dst[idx + 1] = gg <= 0 ? 0 : gg >= 1 ? 255 : (gg * 255 + 0.5) | 0;
      dst[idx + 2] = bb <= 0 ? 0 : bb >= 1 ? 255 : (bb * 255 + 0.5) | 0;
      dst[idx + 3] = src[idx + 3] as number;
      idx += 4;
    }
  }
}

export function applyHeightAdjustments(
  src: Float32Array,
  dst: Float32Array,
  width: number,
  height: number,
  params: HeightAdjustments,
  rect?: Rect,
): void {
  const k = contrastFactor(params.contrast);
  const gamma = Math.max(0.2, Math.min(5, params.gamma));
  const invGamma = 1 / gamma;
  const invert = params.invert;

  const x0 = rect ? Math.max(0, rect.x) : 0;
  const y0 = rect ? Math.max(0, rect.y) : 0;
  const x1 = rect ? Math.min(width, rect.x + rect.w) : width;
  const y1 = rect ? Math.min(height, rect.y + rect.h) : height;
  if (x0 >= x1 || y0 >= y1) return;

  if (!invert && params.contrast === 0 && gamma === 1) {
    copyFloatRect(src, dst, width, x0, y0, x1, y1, width, height);
    return;
  }

  const useGamma = gamma !== 1;
  for (let y = y0; y < y1; y++) {
    let idx = y * width + x0;
    for (let x = x0; x < x1; x++) {
      let v = src[idx] as number;
      if (invert) v = 1 - v;
      v = (v - 0.5) * k + 0.5;
      if (v <= 0) {
        v = 0;
      } else if (v >= 1) {
        v = 1;
      } else if (useGamma) {
        v = Math.pow(v, invGamma);
      }
      dst[idx] = v;
      idx++;
    }
  }
}

export function applyOpacityAdjustments(
  src: Float32Array,
  dst: Float32Array,
  width: number,
  height: number,
  params: OpacityAdjustments,
  rect?: Rect,
): void {
  const k = contrastFactor(params.contrast);
  const invert = params.invert;
  const tMax = clamp01(params.maxTransmissionPct / 100);
  const rawTMin = clamp01(1 - params.maxOpacityPct / 100);
  const tMin = Math.min(rawTMin, tMax);
  const span = tMax - tMin;

  const x0 = rect ? Math.max(0, rect.x) : 0;
  const y0 = rect ? Math.max(0, rect.y) : 0;
  const x1 = rect ? Math.min(width, rect.x + rect.w) : width;
  const y1 = rect ? Math.min(height, rect.y + rect.h) : height;
  if (x0 >= x1 || y0 >= y1) return;

  if (!invert && params.contrast === 0 && tMin === 0 && span === 1) {
    copyFloatRect(src, dst, width, x0, y0, x1, y1, width, height);
    return;
  }

  for (let y = y0; y < y1; y++) {
    let idx = y * width + x0;
    for (let x = x0; x < x1; x++) {
      let o = src[idx] as number;
      if (invert) o = 1 - o;
      o = (o - 0.5) * k + 0.5;
      if (o <= 0) o = 0;
      else if (o >= 1) o = 1;
      dst[idx] = tMin + o * span;
      idx++;
    }
  }
}

export function recomputeEffectiveRect(
  registry: MapRegistry,
  mapId: MapId,
  adjustments: ProjectSettings['adjustments'],
  rect: Rect,
): void {
  if (!registry.isAllocated) return;
  const { width, height } = registry;
  if (mapId === 'color') {
    const src = registry.color.getCompositeBuffer(rect);
    applyColorAdjustments(src, registry.color.effective, width, height, adjustments.color, rect);
    return;
  }
  if (mapId === 'height') {
    const src = registry.heightMap.getCompositeBuffer(rect);
    applyHeightAdjustments(
      src,
      registry.heightMap.effective,
      width,
      height,
      adjustments.height,
      rect,
    );
    return;
  }
  const src = registry.opacity.getCompositeBuffer(rect);
  applyOpacityAdjustments(
    src,
    registry.opacity.effective,
    width,
    height,
    adjustments.opacity,
    rect,
  );
}
