import { clamp01 } from '@/core/maps/quantize';
import type { Rect } from '@/core/types';

function clampInt(v: number, min: number, max: number): number {
  return v < min ? min : v > max ? max : v;
}

export function laplaceSmoothFloat32Region(
  src: Float32Array,
  width: number,
  height: number,
  rect: Rect,
  iterations: number,
): Float32Array {
  const iter = clampInt(Math.round(iterations), 1, 10);
  const rx0 = clampInt(rect.x, 0, width);
  const ry0 = clampInt(rect.y, 0, height);
  const rx1 = clampInt(rect.x + rect.w, 0, width);
  const ry1 = clampInt(rect.y + rect.h, 0, height);
  const rw = rx1 - rx0;
  const rh = ry1 - ry0;

  if (rw <= 0 || rh <= 0) {
    return new Float32Array(0);
  }

  const px0 = Math.max(0, rx0 - iter);
  const py0 = Math.max(0, ry0 - iter);
  const px1 = Math.min(width, rx1 + iter);
  const py1 = Math.min(height, ry1 + iter);
  const pw = px1 - px0;
  const ph = py1 - py0;

  let cur = new Float32Array(pw * ph);
  let next = new Float32Array(pw * ph);

  for (let y = 0; y < ph; y++) {
    const srcOff = (py0 + y) * width + px0;
    const dstOff = y * pw;
    for (let x = 0; x < pw; x++) {
      cur[dstOff + x] = src[srcOff + x] ?? 0;
    }
  }

  for (let k = 0; k < iter; k++) {
    for (let y = 0; y < ph; y++) {
      const yUp = y > 0 ? y - 1 : 0;
      const yDn = y < ph - 1 ? y + 1 : ph - 1;
      const row = y * pw;
      const rowUp = yUp * pw;
      const rowDn = yDn * pw;
      for (let x = 0; x < pw; x++) {
        const xL = x > 0 ? x - 1 : 0;
        const xR = x < pw - 1 ? x + 1 : pw - 1;
        const c = cur[row + x] ?? 0;
        const avg4 =
          ((cur[row + xL] ?? 0) +
            (cur[row + xR] ?? 0) +
            (cur[rowUp + x] ?? 0) +
            (cur[rowDn + x] ?? 0)) *
          0.25;
        next[row + x] = clamp01(0.5 * c + 0.5 * avg4);
      }
    }
    const tmp = cur;
    cur = next;
    next = tmp;
  }

  const out = new Float32Array(rw * rh);
  const offX = rx0 - px0;
  const offY = ry0 - py0;
  for (let y = 0; y < rh; y++) {
    const srcOff = (offY + y) * pw + offX;
    const dstOff = y * rw;
    for (let x = 0; x < rw; x++) {
      out[dstOff + x] = cur[srcOff + x] ?? 0;
    }
  }
  return out;
}

export function laplaceSmoothRgba8Region(
  src: Uint8ClampedArray,
  width: number,
  height: number,
  rect: Rect,
  iterations: number,
): Uint8ClampedArray {
  const iter = clampInt(Math.round(iterations), 1, 10);
  const rx0 = clampInt(rect.x, 0, width);
  const ry0 = clampInt(rect.y, 0, height);
  const rx1 = clampInt(rect.x + rect.w, 0, width);
  const ry1 = clampInt(rect.y + rect.h, 0, height);
  const rw = rx1 - rx0;
  const rh = ry1 - ry0;

  if (rw <= 0 || rh <= 0) {
    return new Uint8ClampedArray(0);
  }

  const px0 = Math.max(0, rx0 - iter);
  const py0 = Math.max(0, ry0 - iter);
  const px1 = Math.min(width, rx1 + iter);
  const py1 = Math.min(height, ry1 + iter);
  const pw = px1 - px0;
  const ph = py1 - py0;

  let curR = new Float32Array(pw * ph);
  let curG = new Float32Array(pw * ph);
  let curB = new Float32Array(pw * ph);
  let nextR = new Float32Array(pw * ph);
  let nextG = new Float32Array(pw * ph);
  let nextB = new Float32Array(pw * ph);

  for (let y = 0; y < ph; y++) {
    const srcOff = (py0 + y) * width + px0;
    const dstOff = y * pw;
    for (let x = 0; x < pw; x++) {
      const si = (srcOff + x) * 4;
      curR[dstOff + x] = src[si] ?? 0;
      curG[dstOff + x] = src[si + 1] ?? 0;
      curB[dstOff + x] = src[si + 2] ?? 0;
    }
  }

  for (let k = 0; k < iter; k++) {
    for (let y = 0; y < ph; y++) {
      const yUp = y > 0 ? y - 1 : 0;
      const yDn = y < ph - 1 ? y + 1 : ph - 1;
      const row = y * pw;
      const rowUp = yUp * pw;
      const rowDn = yDn * pw;
      for (let x = 0; x < pw; x++) {
        const xL = x > 0 ? x - 1 : 0;
        const xR = x < pw - 1 ? x + 1 : pw - 1;
        const idx = row + x;
        const iL = row + xL;
        const iR = row + xR;
        const iU = rowUp + x;
        const iD = rowDn + x;

        nextR[idx] =
          0.5 * (curR[idx] ?? 0) +
          0.125 * ((curR[iL] ?? 0) + (curR[iR] ?? 0) + (curR[iU] ?? 0) + (curR[iD] ?? 0));
        nextG[idx] =
          0.5 * (curG[idx] ?? 0) +
          0.125 * ((curG[iL] ?? 0) + (curG[iR] ?? 0) + (curG[iU] ?? 0) + (curG[iD] ?? 0));
        nextB[idx] =
          0.5 * (curB[idx] ?? 0) +
          0.125 * ((curB[iL] ?? 0) + (curB[iR] ?? 0) + (curB[iU] ?? 0) + (curB[iD] ?? 0));
      }
    }
    [curR, nextR] = [nextR, curR];
    [curG, nextG] = [nextG, curG];
    [curB, nextB] = [nextB, curB];
  }

  const out = new Uint8ClampedArray(rw * rh * 4);
  const offX = rx0 - px0;
  const offY = ry0 - py0;
  for (let y = 0; y < rh; y++) {
    const patchRow = (offY + y) * pw + offX;
    const srcRow = (ry0 + y) * width + rx0;
    const dstRow = y * rw;
    for (let x = 0; x < rw; x++) {
      const pi = patchRow + x;
      const di = (dstRow + x) * 4;
      const si = (srcRow + x) * 4;
      out[di] = Math.max(0, Math.min(255, Math.round(curR[pi] ?? 0)));
      out[di + 1] = Math.max(0, Math.min(255, Math.round(curG[pi] ?? 0)));
      out[di + 2] = Math.max(0, Math.min(255, Math.round(curB[pi] ?? 0)));
      out[di + 3] = src[si + 3] ?? 255;
    }
  }
  return out;
}
