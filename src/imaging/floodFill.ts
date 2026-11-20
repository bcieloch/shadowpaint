import { clamp01 } from '@/core/maps/quantize';
import type { Rect, SelectionMode } from '@/core/types';
import { hasMaskSelection } from '@/imaging/selectionOps';

export interface FloodFillCommonParams {
  width: number;
  height: number;
  seedX: number;
  seedY: number;
  tolerancePct: number;
  contiguous: boolean;
  mask?: Uint8Array;
  selectionMode?: SelectionMode;
  onProgress?: (progress: number) => void;
}

export interface FloodFillFloatParams extends FloodFillCommonParams {
  working: Float32Array;
  targetValue: number;
}

export interface FloodFillRgbaParams extends FloodFillCommonParams {
  working: Uint8ClampedArray;
  targetRgb: readonly [number, number, number];
}

function getMaskWeight(
  mask: Uint8Array | undefined,
  idx: number,
  selectionMode: SelectionMode,
  hasSelection: boolean,
): number {
  if (!hasSelection || !mask) return 1;
  const raw = (mask[idx] ?? 0) / 255;
  return selectionMode === 'protect' ? 1 - raw : raw;
}

function computeScalarFloodRegions(
  working: Float32Array,
  width: number,
  height: number,
  seedX: number,
  seedY: number,
  tolerancePct: number,
  contiguous: boolean,
  mask: Uint8Array | undefined,
  selectionMode: SelectionMode,
  hasSelection: boolean,
): Uint8Array {
  const total = width * height;
  const hit = new Uint8Array(total);
  if (width <= 0 || height <= 0 || working.length < total) return hit;

  const sx = Math.max(0, Math.min(width - 1, Math.floor(seedX)));
  const sy = Math.max(0, Math.min(height - 1, Math.floor(seedY)));
  const seedIdx = sy * width + sx;
  if (getMaskWeight(mask, seedIdx, selectionMode, hasSelection) <= 0) {
    return hit;
  }

  const tol = Math.max(0, Math.min(1, tolerancePct / 100));
  const seedVal = working[seedIdx] ?? 0;
  const eps = tol + 1e-6;
  const matches = (idx: number) =>
    getMaskWeight(mask, idx, selectionMode, hasSelection) > 0 &&
    Math.abs((working[idx] ?? 0) - seedVal) <= eps;

  if (!contiguous) {
    for (let i = 0; i < total; i++) {
      if (matches(i)) hit[i] = 1;
    }
    return hit;
  }

  const stack: number[] = [sx, sy];
  while (stack.length > 0) {
    const py = stack.pop();
    const px = stack.pop();
    if (px === undefined || py === undefined) continue;

    let x = px;
    const rowOff = py * width;
    while (x >= 0 && !hit[rowOff + x] && matches(rowOff + x)) {
      x--;
    }
    x++;

    let spanAbove = false;
    let spanBelow = false;
    while (x < width && !hit[rowOff + x] && matches(rowOff + x)) {
      const idx = rowOff + x;
      hit[idx] = 1;

      if (py > 0) {
        const upIdx = (py - 1) * width + x;
        const upMatch = !hit[upIdx] && matches(upIdx);
        if (!spanAbove && upMatch) {
          stack.push(x, py - 1);
          spanAbove = true;
        } else if (spanAbove && !upMatch) {
          spanAbove = false;
        }
      }

      if (py < height - 1) {
        const downIdx = (py + 1) * width + x;
        const downMatch = !hit[downIdx] && matches(downIdx);
        if (!spanBelow && downMatch) {
          stack.push(x, py + 1);
          spanBelow = true;
        } else if (spanBelow && !downMatch) {
          spanBelow = false;
        }
      }

      x++;
    }
  }

  return hit;
}

function computeRgbaFloodRegions(
  working: Uint8ClampedArray,
  width: number,
  height: number,
  seedX: number,
  seedY: number,
  tolerancePct: number,
  contiguous: boolean,
  mask: Uint8Array | undefined,
  selectionMode: SelectionMode,
  hasSelection: boolean,
): Uint8Array {
  const total = width * height;
  const hit = new Uint8Array(total);
  if (width <= 0 || height <= 0 || working.length < total * 4) return hit;

  const sx = Math.max(0, Math.min(width - 1, Math.floor(seedX)));
  const sy = Math.max(0, Math.min(height - 1, Math.floor(seedY)));
  const seedIdx = sy * width + sx;
  if (getMaskWeight(mask, seedIdx, selectionMode, hasSelection) <= 0) {
    return hit;
  }

  const tol255 = Math.max(0, Math.min(1, tolerancePct / 100)) * 255 + 1e-4;
  const sOff = seedIdx * 4;
  const sr = working[sOff] ?? 0;
  const sg = working[sOff + 1] ?? 0;
  const sb = working[sOff + 2] ?? 0;

  const matches = (idx: number) => {
    if (getMaskWeight(mask, idx, selectionMode, hasSelection) <= 0) return false;
    const o = idx * 4;
    const dr = Math.abs((working[o] ?? 0) - sr);
    const dg = Math.abs((working[o + 1] ?? 0) - sg);
    const db = Math.abs((working[o + 2] ?? 0) - sb);
    return Math.max(dr, dg, db) <= tol255;
  };

  if (!contiguous) {
    for (let i = 0; i < total; i++) {
      if (matches(i)) hit[i] = 1;
    }
    return hit;
  }

  const stack: number[] = [sx, sy];
  while (stack.length > 0) {
    const py = stack.pop();
    const px = stack.pop();
    if (px === undefined || py === undefined) continue;

    let x = px;
    const rowOff = py * width;
    while (x >= 0 && !hit[rowOff + x] && matches(rowOff + x)) {
      x--;
    }
    x++;

    let spanAbove = false;
    let spanBelow = false;
    while (x < width && !hit[rowOff + x] && matches(rowOff + x)) {
      const idx = rowOff + x;
      hit[idx] = 1;

      if (py > 0) {
        const upIdx = (py - 1) * width + x;
        const upMatch = !hit[upIdx] && matches(upIdx);
        if (!spanAbove && upMatch) {
          stack.push(x, py - 1);
          spanAbove = true;
        } else if (spanAbove && !upMatch) {
          spanAbove = false;
        }
      }

      if (py < height - 1) {
        const downIdx = (py + 1) * width + x;
        const downMatch = !hit[downIdx] && matches(downIdx);
        if (!spanBelow && downMatch) {
          stack.push(x, py + 1);
          spanBelow = true;
        } else if (spanBelow && !downMatch) {
          spanBelow = false;
        }
      }

      x++;
    }
  }

  return hit;
}

export function applyFloodFillFloat32(params: FloodFillFloatParams): {
  out: Float32Array;
  dirtyRect: Rect | null;
} {
  const { width, height, working } = params;
  const out = new Float32Array(working);
  const hasSelection = params.mask ? hasMaskSelection(params.mask) : false;
  const selectionMode = params.selectionMode ?? 'protect';
  const targetVal = clamp01(params.targetValue);

  const hit = computeScalarFloodRegions(
    working,
    width,
    height,
    params.seedX,
    params.seedY,
    params.tolerancePct,
    params.contiguous,
    params.mask,
    selectionMode,
    hasSelection,
  );

  let minX = width;
  let minY = height;
  let maxX = -1;
  let maxY = -1;

  for (let y = 0; y < height; y++) {
    const rowOff = y * width;
    for (let x = 0; x < width; x++) {
      const idx = rowOff + x;
      if (!hit[idx]) continue;
      const w = getMaskWeight(params.mask, idx, selectionMode, hasSelection);
      if (w <= 0) continue;
      const prev = out[idx] ?? 0;
      const next = clamp01(prev + (targetVal - prev) * w);
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
  if (maxX < minX || maxY < minY) return { out, dirtyRect: null };
  return {
    out,
    dirtyRect: { x: minX, y: minY, w: maxX - minX + 1, h: maxY - minY + 1 },
  };
}

export function applyFloodFillRgba8(params: FloodFillRgbaParams): {
  out: Uint8ClampedArray;
  dirtyRect: Rect | null;
} {
  const { width, height, working, targetRgb } = params;
  const out = new Uint8ClampedArray(working);
  const hasSelection = params.mask ? hasMaskSelection(params.mask) : false;
  const selectionMode = params.selectionMode ?? 'protect';
  const [tr, tg, tb] = targetRgb;

  const hit = computeRgbaFloodRegions(
    working,
    width,
    height,
    params.seedX,
    params.seedY,
    params.tolerancePct,
    params.contiguous,
    params.mask,
    selectionMode,
    hasSelection,
  );

  let minX = width;
  let minY = height;
  let maxX = -1;
  let maxY = -1;

  for (let y = 0; y < height; y++) {
    const rowOff = y * width;
    for (let x = 0; x < width; x++) {
      const idx = rowOff + x;
      if (!hit[idx]) continue;
      const w = getMaskWeight(params.mask, idx, selectionMode, hasSelection);
      if (w <= 0) continue;
      const o = idx * 4;
      const pr = out[o] ?? 0;
      const pg = out[o + 1] ?? 0;
      const pb = out[o + 2] ?? 0;
      const nr = Math.max(0, Math.min(255, Math.round(pr + (tr - pr) * w)));
      const ng = Math.max(0, Math.min(255, Math.round(pg + (tg - pg) * w)));
      const nb = Math.max(0, Math.min(255, Math.round(pb + (tb - pb) * w)));
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
  if (maxX < minX || maxY < minY) return { out, dirtyRect: null };
  return {
    out,
    dirtyRect: { x: minX, y: minY, w: maxX - minX + 1, h: maxY - minY + 1 },
  };
}

export function applySelectionFillFloat32(params: {
  working: Float32Array;
  width: number;
  height: number;
  targetValue: number;
  mask?: Uint8Array;
  onProgress?: (progress: number) => void;
}): { out: Float32Array; dirtyRect: Rect | null } {
  const { width, height, working, mask } = params;
  const out = new Float32Array(working);
  const target = clamp01(params.targetValue);
  const hasSelection = mask ? hasMaskSelection(mask) : false;

  let minX = width;
  let minY = height;
  let maxX = -1;
  let maxY = -1;

  for (let y = 0; y < height; y++) {
    const rowOff = y * width;
    for (let x = 0; x < width; x++) {
      const idx = rowOff + x;
      const w = hasSelection && mask ? (mask[idx] ?? 0) / 255 : 1;
      if (w <= 0) continue;
      const prev = out[idx] ?? 0;
      const next = clamp01(prev + (target - prev) * w);
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
  if (maxX < minX || maxY < minY) return { out, dirtyRect: null };
  return { out, dirtyRect: { x: minX, y: minY, w: maxX - minX + 1, h: maxY - minY + 1 } };
}

export function applySelectionFillRgba8(params: {
  working: Uint8ClampedArray;
  width: number;
  height: number;
  targetRgb: readonly [number, number, number];
  mask?: Uint8Array;
  onProgress?: (progress: number) => void;
}): { out: Uint8ClampedArray; dirtyRect: Rect | null } {
  const { width, height, working, mask, targetRgb } = params;
  const out = new Uint8ClampedArray(working);
  const [tr, tg, tb] = targetRgb;
  const hasSelection = mask ? hasMaskSelection(mask) : false;

  let minX = width;
  let minY = height;
  let maxX = -1;
  let maxY = -1;

  for (let y = 0; y < height; y++) {
    const rowOff = y * width;
    for (let x = 0; x < width; x++) {
      const idx = rowOff + x;
      const w = hasSelection && mask ? (mask[idx] ?? 0) / 255 : 1;
      if (w <= 0) continue;
      const o = idx * 4;
      const pr = out[o] ?? 0;
      const pg = out[o + 1] ?? 0;
      const pb = out[o + 2] ?? 0;
      const nr = Math.max(0, Math.min(255, Math.round(pr + (tr - pr) * w)));
      const ng = Math.max(0, Math.min(255, Math.round(pg + (tg - pg) * w)));
      const nb = Math.max(0, Math.min(255, Math.round(pb + (tb - pb) * w)));
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
  if (maxX < minX || maxY < minY) return { out, dirtyRect: null };
  return { out, dirtyRect: { x: minX, y: minY, w: maxX - minX + 1, h: maxY - minY + 1 } };
}
