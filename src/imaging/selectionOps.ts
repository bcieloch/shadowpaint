import { clampRect, isEmptyRect } from '@/core/maps/rect';
import type { MapId, Rect, SelectionCombineMode, Vec2 } from '@/core/types';
import { gaussianBlurUint8 } from '@/imaging/blur';

export function hasMaskSelection(mask: Uint8Array): boolean {
  for (let i = 0; i < mask.length; i++) {
    if ((mask[i] ?? 0) > 0) return true;
  }
  return false;
}

export function computeSelectionBounds(
  mask: Uint8Array,
  width: number,
  height: number,
): Rect | null {
  let minX = width;
  let minY = height;
  let maxX = -1;
  let maxY = -1;

  for (let y = 0; y < height; y++) {
    const rowOff = y * width;
    for (let x = 0; x < width; x++) {
      if ((mask[rowOff + x] ?? 0) > 0) {
        if (x < minX) minX = x;
        if (x > maxX) maxX = x;
        if (y < minY) minY = y;
        if (y > maxY) maxY = y;
      }
    }
  }

  if (maxX < minX || maxY < minY) return null;
  return { x: minX, y: minY, w: maxX - minX + 1, h: maxY - minY + 1 };
}

export function normalizeSelectionRect(a: Vec2, b: Vec2, constrainSquare = false): Rect {
  let dx = b.x - a.x;
  let dy = b.y - a.y;
  if (constrainSquare) {
    const side = Math.max(Math.abs(dx), Math.abs(dy));
    dx = dx >= 0 ? side : -side;
    dy = dy >= 0 ? side : -side;
  }
  const x0 = Math.floor(Math.min(a.x, a.x + dx));
  const y0 = Math.floor(Math.min(a.y, a.y + dy));
  const x1 = Math.ceil(Math.max(a.x, a.x + dx));
  const y1 = Math.ceil(Math.max(a.y, a.y + dy));
  return { x: x0, y: y0, w: Math.max(0, x1 - x0), h: Math.max(0, y1 - y0) };
}

export function createRectSelectionMask(width: number, height: number, rawRect: Rect): Uint8Array {
  const out = new Uint8Array(width * height);
  const rect = clampRect(rawRect, width, height);
  if (isEmptyRect(rect)) return out;

  const x0 = Math.floor(rect.x);
  const y0 = Math.floor(rect.y);
  const x1 = Math.min(width, Math.ceil(rect.x + rect.w));
  const y1 = Math.min(height, Math.ceil(rect.y + rect.h));

  for (let y = y0; y < y1; y++) {
    out.fill(255, y * width + x0, y * width + x1);
  }
  return out;
}

export function createEllipseSelectionMask(
  width: number,
  height: number,
  rawRect: Rect,
): Uint8Array {
  const out = new Uint8Array(width * height);
  if (rawRect.w <= 0 || rawRect.h <= 0) return out;

  const cx = rawRect.x + rawRect.w / 2;
  const cy = rawRect.y + rawRect.h / 2;
  const rx = rawRect.w / 2;
  const ry = rawRect.h / 2;
  if (rx <= 0 || ry <= 0) return out;

  const clipped = clampRect(rawRect, width, height);
  if (isEmptyRect(clipped)) return out;

  const x0 = Math.floor(clipped.x);
  const y0 = Math.floor(clipped.y);
  const x1 = Math.min(width, Math.ceil(clipped.x + clipped.w));
  const y1 = Math.min(height, Math.ceil(clipped.y + clipped.h));

  const invRx2 = 1 / (rx * rx);
  const invRy2 = 1 / (ry * ry);

  for (let y = y0; y < y1; y++) {
    const dy = y + 0.5 - cy;
    const ny2 = dy * dy * invRy2;
    if (ny2 > 1) continue;
    const rowOff = y * width;
    for (let x = x0; x < x1; x++) {
      const dx = x + 0.5 - cx;
      if (dx * dx * invRx2 + ny2 <= 1) {
        out[rowOff + x] = 255;
      }
    }
  }
  return out;
}

export function createLassoSelectionMask(
  width: number,
  height: number,
  polygon: readonly Vec2[],
): Uint8Array {
  const out = new Uint8Array(width * height);
  if (polygon.length < 3 || width <= 0 || height <= 0) return out;

  let minY = height;
  let maxY = 0;
  for (const pt of polygon) {
    if (pt.y < minY) minY = pt.y;
    if (pt.y > maxY) maxY = pt.y;
  }

  const yStart = Math.max(0, Math.floor(minY));
  const yEnd = Math.min(height - 1, Math.ceil(maxY));
  const intersections: number[] = [];

  for (let y = yStart; y <= yEnd; y++) {
    const sy = y + 0.5;
    intersections.length = 0;

    for (let i = 0, j = polygon.length - 1; i < polygon.length; j = i++) {
      const pi = polygon[i];
      const pj = polygon[j];
      if (!pi || !pj) continue;

      const yi = pi.y;
      const yj = pj.y;
      if ((yi <= sy && yj > sy) || (yj <= sy && yi > sy)) {
        const t = (sy - yi) / (yj - yi);
        intersections.push(pi.x + t * (pj.x - pi.x));
      }
    }

    if (intersections.length < 2) continue;
    intersections.sort((a, b) => a - b);

    const rowOff = y * width;
    for (let k = 0; k + 1 < intersections.length; k += 2) {
      const lx = intersections[k] ?? 0;
      const rx = intersections[k + 1] ?? 0;
      const x0 = Math.max(0, Math.floor(lx));
      const x1 = Math.min(width, Math.ceil(rx));
      if (x1 > x0) {
        out.fill(255, rowOff + x0, rowOff + x1);
      }
    }
  }

  return out;
}

export interface MagicWandParams {
  width: number;
  height: number;
  seedX: number;
  seedY: number;
  tolerancePct: number;
  contiguous: boolean;
  sourceKind: MapId;
  colorData?: Uint8ClampedArray;
  scalarData?: Float32Array;
}

export function createMagicWandMask(params: MagicWandParams): Uint8Array {
  const { width, height, tolerancePct, contiguous, sourceKind, colorData, scalarData } = params;
  const total = width * height;
  const out = new Uint8Array(total);
  if (width <= 0 || height <= 0) return out;

  const sx = Math.max(0, Math.min(width - 1, Math.floor(params.seedX)));
  const sy = Math.max(0, Math.min(height - 1, Math.floor(params.seedY)));
  const tol = Math.max(0, Math.min(1, tolerancePct / 100));
  const seedIdx = sy * width + sx;

  let matches: (idx: number) => boolean;

  if (sourceKind === 'color') {
    if (!colorData || colorData.length < total * 4) return out;
    const sOff = seedIdx * 4;
    const sr = colorData[sOff] ?? 0;
    const sg = colorData[sOff + 1] ?? 0;
    const sb = colorData[sOff + 2] ?? 0;
    const tol255 = tol * 255 + 1e-4;
    matches = (idx: number) => {
      const o = idx * 4;
      const dr = Math.abs((colorData[o] ?? 0) - sr);
      const dg = Math.abs((colorData[o + 1] ?? 0) - sg);
      const db = Math.abs((colorData[o + 2] ?? 0) - sb);
      return Math.max(dr, dg, db) <= tol255;
    };
  } else {
    if (!scalarData || scalarData.length < total) return out;
    const sv = scalarData[seedIdx] ?? 0;
    const eps = tol + 1e-6;
    matches = (idx: number) => Math.abs((scalarData[idx] ?? 0) - sv) <= eps;
  }

  if (!contiguous) {
    for (let i = 0; i < total; i++) {
      if (matches(i)) {
        out[i] = 255;
      }
    }
    return out;
  }

  // Iterative scanline flood fill (no recursion, safe on 3000x4200)
  const visited = new Uint8Array(total);
  const stack: number[] = [sx, sy];

  while (stack.length > 0) {
    const py = stack.pop();
    const px = stack.pop();
    if (px === undefined || py === undefined) continue;

    let x = px;
    const rowOff = py * width;
    while (x >= 0 && !visited[rowOff + x] && matches(rowOff + x)) {
      x--;
    }
    x++;

    let spanAbove = false;
    let spanBelow = false;
    while (x < width && !visited[rowOff + x] && matches(rowOff + x)) {
      const idx = rowOff + x;
      visited[idx] = 1;
      out[idx] = 255;

      if (py > 0) {
        const upIdx = (py - 1) * width + x;
        const upMatch = !visited[upIdx] && matches(upIdx);
        if (!spanAbove && upMatch) {
          stack.push(x, py - 1);
          spanAbove = true;
        } else if (spanAbove && !upMatch) {
          spanAbove = false;
        }
      }

      if (py < height - 1) {
        const downIdx = (py + 1) * width + x;
        const downMatch = !visited[downIdx] && matches(downIdx);
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

  return out;
}

export function combineSelectionMasks(
  current: Uint8Array,
  shape: Uint8Array,
  op: SelectionCombineMode,
  out = new Uint8Array(current.length),
): Uint8Array {
  const n = Math.min(current.length, shape.length, out.length);
  if (op === 'replace') {
    out.set(shape.subarray(0, n));
    return out;
  }
  if (op === 'add') {
    for (let i = 0; i < n; i++) {
      const a = current[i] ?? 0;
      const b = shape[i] ?? 0;
      out[i] = a >= b ? a : b;
    }
    return out;
  }
  if (op === 'subtract') {
    for (let i = 0; i < n; i++) {
      const a = current[i] ?? 0;
      const b = shape[i] ?? 0;
      out[i] = b === 0 ? a : b === 255 ? 0 : Math.max(0, Math.round(a * (1 - b / 255)));
    }
    return out;
  }
  for (let i = 0; i < n; i++) {
    const a = current[i] ?? 0;
    const b = shape[i] ?? 0;
    out[i] = Math.round((a * b) / 255);
  }
  return out;
}

export function selectAllMask(out: Uint8Array): void {
  out.fill(255);
}

export function clearSelectionMask(out: Uint8Array): void {
  out.fill(0);
}

export function invertSelectionMask(src: Uint8Array, out = new Uint8Array(src.length)): Uint8Array {
  for (let i = 0; i < src.length; i++) {
    out[i] = 255 - (src[i] ?? 0);
  }
  return out;
}

export function featherSelectionMask(
  src: Uint8Array,
  width: number,
  height: number,
  radiusPx: number,
  onProgress?: (progress: number) => void,
): Uint8Array {
  return gaussianBlurUint8(src, width, height, radiusPx, onProgress);
}
