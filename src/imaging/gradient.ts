import { clamp01 } from '@/core/maps/quantize';
import type { Rect, SelectionMode, Vec2 } from '@/core/types';
import { hasMaskSelection } from '@/imaging/selectionOps';

export type GradientKind = 'linear' | 'radial';

export interface GradientCommonParams {
  width: number;
  height: number;
  kind: GradientKind;
  p0: Vec2;
  p1: Vec2;
  mask?: Uint8Array;
  selectionMode?: SelectionMode;
  onlyInSelection?: boolean;
  onProgress?: (progress: number) => void;
}

export interface GradientFloatParams extends GradientCommonParams {
  working: Float32Array;
  startValue: number;
  endValue: number;
}

export interface GradientRgbaParams extends GradientCommonParams {
  working: Uint8ClampedArray;
  startRgb: readonly [number, number, number];
  endRgb: readonly [number, number, number];
}

export function computeGradientFactor(
  x: number,
  y: number,
  p0: Vec2,
  p1: Vec2,
  kind: GradientKind,
): number {
  const dx = p1.x - p0.x;
  const dy = p1.y - p0.y;
  const len2 = dx * dx + dy * dy;
  if (len2 <= 1e-8) return 0;

  if (kind === 'radial') {
    const dist = Math.hypot(x - p0.x, y - p0.y);
    const radius = Math.sqrt(len2);
    return clamp01(dist / radius);
  }

  const proj = ((x - p0.x) * dx + (y - p0.y) * dy) / len2;
  return clamp01(proj);
}

function resolvePixelMaskWeight(
  mask: Uint8Array | undefined,
  idx: number,
  selectionMode: SelectionMode,
  hasSelection: boolean,
  onlyInSelection: boolean,
): number {
  if (!hasSelection || !mask) return 1;
  const raw = (mask[idx] ?? 0) / 255;
  if (onlyInSelection) {
    return raw;
  }
  return selectionMode === 'protect' ? 1 - raw : raw;
}

export function applyGradientFloat32(params: GradientFloatParams): {
  out: Float32Array;
  dirtyRect: Rect | null;
} {
  const { width, height, working, kind, p0, p1 } = params;
  const startVal = clamp01(params.startValue);
  const endVal = clamp01(params.endValue);
  const out = new Float32Array(working);
  if (width <= 0 || height <= 0 || out.length < width * height) {
    params.onProgress?.(1);
    return { out, dirtyRect: null };
  }

  const hasSelection = params.mask ? hasMaskSelection(params.mask) : false;
  const selectionMode = params.selectionMode ?? 'protect';
  const onlyInSelection = Boolean(params.onlyInSelection);

  let minX = width;
  let minY = height;
  let maxX = -1;
  let maxY = -1;

  for (let y = 0; y < height; y++) {
    const rowOff = y * width;
    for (let x = 0; x < width; x++) {
      const idx = rowOff + x;
      const w = resolvePixelMaskWeight(
        params.mask,
        idx,
        selectionMode,
        hasSelection,
        onlyInSelection,
      );
      if (w <= 0) continue;

      const t = computeGradientFactor(x, y, p0, p1, kind);
      const grad = startVal + (endVal - startVal) * t;
      const prev = out[idx] ?? 0;
      const next = clamp01(prev + (grad - prev) * w);
      if (Math.abs(next - prev) > 1e-6) {
        out[idx] = next;
        if (x < minX) minX = x;
        if (x > maxX) maxX = x;
        if (y < minY) minY = y;
        if (y > maxY) maxY = y;
      }
    }
    if (params.onProgress && (y & 31) === 0) {
      params.onProgress((y + 1) / height);
    }
  }

  params.onProgress?.(1);
  if (maxX < minX || maxY < minY) {
    return { out, dirtyRect: null };
  }
  return {
    out,
    dirtyRect: { x: minX, y: minY, w: maxX - minX + 1, h: maxY - minY + 1 },
  };
}

export function applyGradientRgba8(params: GradientRgbaParams): {
  out: Uint8ClampedArray;
  dirtyRect: Rect | null;
} {
  const { width, height, working, kind, p0, p1, startRgb, endRgb } = params;
  const out = new Uint8ClampedArray(working);
  if (width <= 0 || height <= 0 || out.length < width * height * 4) {
    params.onProgress?.(1);
    return { out, dirtyRect: null };
  }

  const hasSelection = params.mask ? hasMaskSelection(params.mask) : false;
  const selectionMode = params.selectionMode ?? 'protect';
  const onlyInSelection = Boolean(params.onlyInSelection);

  const [sr, sg, sb] = startRgb;
  const [er, eg, eb] = endRgb;

  let minX = width;
  let minY = height;
  let maxX = -1;
  let maxY = -1;

  for (let y = 0; y < height; y++) {
    const rowOff = y * width;
    for (let x = 0; x < width; x++) {
      const idx = rowOff + x;
      const w = resolvePixelMaskWeight(
        params.mask,
        idx,
        selectionMode,
        hasSelection,
        onlyInSelection,
      );
      if (w <= 0) continue;

      const t = computeGradientFactor(x, y, p0, p1, kind);
      const gr = sr + (er - sr) * t;
      const gg = sg + (eg - sg) * t;
      const gb = sb + (eb - sb) * t;

      const o = idx * 4;
      const pr = out[o] ?? 0;
      const pg = out[o + 1] ?? 0;
      const pb = out[o + 2] ?? 0;

      const nr = Math.max(0, Math.min(255, Math.round(pr + (gr - pr) * w)));
      const ng = Math.max(0, Math.min(255, Math.round(pg + (gg - pg) * w)));
      const nb = Math.max(0, Math.min(255, Math.round(pb + (gb - pb) * w)));

      if (nr !== pr || ng !== pg || nb !== pb || (out[o + 3] ?? 255) !== 255) {
        out[o] = nr;
        out[o + 1] = ng;
        out[o + 2] = nb;
        out[o + 3] = 255;
        if (x < minX) minX = x;
        if (x > maxX) maxX = x;
        if (y < minY) minY = y;
        if (y > maxY) maxY = y;
      }
    }
    if (params.onProgress && (y & 31) === 0) {
      params.onProgress((y + 1) / height);
    }
  }

  params.onProgress?.(1);
  if (maxX < minX || maxY < minY) {
    return { out, dirtyRect: null };
  }
  return {
    out,
    dirtyRect: { x: minX, y: minY, w: maxX - minX + 1, h: maxY - minY + 1 },
  };
}
