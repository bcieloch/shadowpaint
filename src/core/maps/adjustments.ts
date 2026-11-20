import { clamp01 } from '@/core/maps/quantize';
import type {
  ColorAdjustments,
  HeightAdjustments,
  OpacityAdjustments,
  Rect,
} from '@/core/types';

function contrastFactor(c: number): number {
  const clamped = Math.max(-1, Math.min(1, c));
  return clamped >= 0 ? 1 / (1 - 0.99 * clamped) : 1 + clamped;
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

  for (let y = y0; y < y1; y++) {
    let idx = (y * width + x0) * 4;
    for (let x = x0; x < x1; x++) {
      let r = (src[idx] ?? 0) / 255 + b;
      let g = (src[idx + 1] ?? 0) / 255 + b;
      let bl = (src[idx + 2] ?? 0) / 255 + b;

      r = (r - 0.5) * k + 0.5;
      g = (g - 0.5) * k + 0.5;
      bl = (bl - 0.5) * k + 0.5;

      const lum = 0.2126 * r + 0.7152 * g + 0.0722 * bl;
      r = clamp01(lum + (r - lum) * satMult);
      g = clamp01(lum + (g - lum) * satMult);
      bl = clamp01(lum + (bl - lum) * satMult);

      dst[idx] = Math.round(r * 255);
      dst[idx + 1] = Math.round(g * 255);
      dst[idx + 2] = Math.round(bl * 255);
      dst[idx + 3] = src[idx + 3] ?? 255;
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

  for (let y = y0; y < y1; y++) {
    let idx = y * width + x0;
    for (let x = x0; x < x1; x++) {
      let v = src[idx] ?? 0;
      if (invert) v = 1 - v;
      v = clamp01((v - 0.5) * k + 0.5);
      if (gamma !== 1) {
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

  for (let y = y0; y < y1; y++) {
    let idx = y * width + x0;
    for (let x = x0; x < x1; x++) {
      let o = src[idx] ?? 0;
      if (invert) o = 1 - o;
      o = clamp01((o - 0.5) * k + 0.5);
      dst[idx] = tMin + o * span;
      idx++;
    }
  }
}
