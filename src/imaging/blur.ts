import { clamp01 } from '@/core/maps/quantize';
import type { Rect } from '@/core/types';

function buildGaussianKernel(radius: number): Float32Array {
  const r = Math.max(1, Math.ceil(radius));
  const sigma = Math.max(0.5, radius / 2);
  const len = r * 2 + 1;
  const kernel = new Float32Array(len);
  let sum = 0;
  for (let i = -r; i <= r; i++) {
    const w = Math.exp(-(i * i) / (2 * sigma * sigma));
    kernel[i + r] = w;
    sum += w;
  }
  for (let i = 0; i < len; i++) {
    kernel[i] = (kernel[i] ?? 0) / sum;
  }
  return kernel;
}

export function getGaussianKernelPad(radiusPx: number): number {
  if (radiusPx <= 0.25) return 0;
  return Math.max(1, Math.ceil(radiusPx));
}

export function gaussianBlurFloat32(
  src: Float32Array,
  width: number,
  height: number,
  radiusPx: number,
  onProgress?: (progress: number) => void,
): Float32Array {
  if (radiusPx <= 0.25) {
    onProgress?.(1);
    return new Float32Array(src);
  }

  const kernel = buildGaussianKernel(radiusPx);
  const r = (kernel.length - 1) >> 1;
  const temp = new Float32Array(width * height);
  const dst = new Float32Array(width * height);

  for (let y = 0; y < height; y++) {
    const rowOff = y * width;
    for (let x = 0; x < width; x++) {
      let acc = 0;
      for (let k = -r; k <= r; k++) {
        const sx = x + k < 0 ? 0 : x + k >= width ? width - 1 : x + k;
        acc += (src[rowOff + sx] ?? 0) * (kernel[k + r] ?? 0);
      }
      temp[rowOff + x] = acc;
    }
    if (onProgress && (y & 31) === 0) {
      onProgress((y + 1) / (height * 2));
    }
  }

  for (let y = 0; y < height; y++) {
    for (let x = 0; x < width; x++) {
      let acc = 0;
      for (let k = -r; k <= r; k++) {
        const sy = y + k < 0 ? 0 : y + k >= height ? height - 1 : y + k;
        acc += (temp[sy * width + x] ?? 0) * (kernel[k + r] ?? 0);
      }
      dst[y * width + x] = clamp01(acc);
    }
    if (onProgress && (y & 31) === 0) {
      onProgress(0.5 + (y + 1) / (height * 2));
    }
  }

  onProgress?.(1);
  return dst;
}

export function gaussianBlurUint8(
  src: Uint8Array,
  width: number,
  height: number,
  radiusPx: number,
  onProgress?: (progress: number) => void,
): Uint8Array {
  if (radiusPx <= 0.25) {
    onProgress?.(1);
    return new Uint8Array(src);
  }

  const kernel = buildGaussianKernel(radiusPx);
  const r = (kernel.length - 1) >> 1;
  const temp = new Float32Array(width * height);
  const dst = new Uint8Array(width * height);

  for (let y = 0; y < height; y++) {
    const rowOff = y * width;
    for (let x = 0; x < width; x++) {
      let acc = 0;
      for (let k = -r; k <= r; k++) {
        const sx = x + k < 0 ? 0 : x + k >= width ? width - 1 : x + k;
        acc += (src[rowOff + sx] ?? 0) * (kernel[k + r] ?? 0);
      }
      temp[rowOff + x] = acc;
    }
    if (onProgress && (y & 31) === 0) {
      onProgress((y + 1) / (height * 2));
    }
  }

  for (let y = 0; y < height; y++) {
    const rowOff = y * width;
    for (let x = 0; x < width; x++) {
      let acc = 0;
      for (let k = -r; k <= r; k++) {
        const sy = y + k < 0 ? 0 : y + k >= height ? height - 1 : y + k;
        acc += (temp[sy * width + x] ?? 0) * (kernel[k + r] ?? 0);
      }
      dst[rowOff + x] = Math.max(0, Math.min(255, Math.round(acc)));
    }
    if (onProgress && (y & 31) === 0) {
      onProgress(0.5 + (y + 1) / (height * 2));
    }
  }

  onProgress?.(1);
  return dst;
}

export function gaussianBlurPatchInnerFloat32(
  patch: Float32Array,
  patchW: number,
  patchH: number,
  inner: Rect,
  radiusPx: number,
  onProgress?: (progress: number) => void,
): Float32Array {
  const ix0 = Math.max(0, inner.x);
  const iy0 = Math.max(0, inner.y);
  const ix1 = Math.min(patchW, inner.x + inner.w);
  const iy1 = Math.min(patchH, inner.y + inner.h);
  const iw = ix1 - ix0;
  const ih = iy1 - iy0;
  if (iw <= 0 || ih <= 0) {
    onProgress?.(1);
    return new Float32Array(0);
  }

  if (radiusPx <= 0.25) {
    const out = new Float32Array(iw * ih);
    for (let y = 0; y < ih; y++) {
      const sOff = (iy0 + y) * patchW + ix0;
      const dOff = y * iw;
      for (let x = 0; x < iw; x++) {
        out[dOff + x] = patch[sOff + x] ?? 0;
      }
    }
    onProgress?.(1);
    return out;
  }

  const kernel = buildGaussianKernel(radiusPx);
  const r = (kernel.length - 1) >> 1;
  // Horizontal pass needs rows [max(0, iy0 - r) .. min(patchH, iy1 + r)] and columns [ix0 .. ix1]
  const hy0 = Math.max(0, iy0 - r);
  const hy1 = Math.min(patchH, iy1 + r);
  const hSpan = hy1 - hy0;
  const temp = new Float32Array(iw * hSpan);

  for (let y = 0; y < hSpan; y++) {
    const rowOff = (hy0 + y) * patchW;
    const tOff = y * iw;
    for (let x = 0; x < iw; x++) {
      const cx = ix0 + x;
      let acc = 0;
      for (let k = -r; k <= r; k++) {
        const sx = cx + k < 0 ? 0 : cx + k >= patchW ? patchW - 1 : cx + k;
        acc += (patch[rowOff + sx] ?? 0) * (kernel[k + r] ?? 0);
      }
      temp[tOff + x] = acc;
    }
    if (onProgress && (y & 31) === 0) {
      onProgress((y + 1) / (hSpan * 2));
    }
  }

  const out = new Float32Array(iw * ih);
  for (let y = 0; y < ih; y++) {
    const cy = iy0 + y;
    const dOff = y * iw;
    for (let x = 0; x < iw; x++) {
      let acc = 0;
      for (let k = -r; k <= r; k++) {
        const sy = cy + k < 0 ? 0 : cy + k >= patchH ? patchH - 1 : cy + k;
        acc += (temp[(sy - hy0) * iw + x] ?? 0) * (kernel[k + r] ?? 0);
      }
      out[dOff + x] = clamp01(acc);
    }
    if (onProgress && (y & 31) === 0) {
      onProgress(0.5 + (y + 1) / (ih * 2));
    }
  }

  onProgress?.(1);
  return out;
}

export function gaussianBlurPatchInnerRgba8(
  patch: Uint8ClampedArray,
  patchW: number,
  patchH: number,
  inner: Rect,
  radiusPx: number,
  onProgress?: (progress: number) => void,
): Uint8ClampedArray {
  const ix0 = Math.max(0, inner.x);
  const iy0 = Math.max(0, inner.y);
  const ix1 = Math.min(patchW, inner.x + inner.w);
  const iy1 = Math.min(patchH, inner.y + inner.h);
  const iw = ix1 - ix0;
  const ih = iy1 - iy0;
  if (iw <= 0 || ih <= 0) {
    onProgress?.(1);
    return new Uint8ClampedArray(0);
  }

  if (radiusPx <= 0.25) {
    const out = new Uint8ClampedArray(iw * ih * 4);
    for (let y = 0; y < ih; y++) {
      const sOff = ((iy0 + y) * patchW + ix0) * 4;
      const dOff = y * iw * 4;
      out.set(patch.subarray(sOff, sOff + iw * 4), dOff);
    }
    onProgress?.(1);
    return out;
  }

  const kernel = buildGaussianKernel(radiusPx);
  const r = (kernel.length - 1) >> 1;
  const hy0 = Math.max(0, iy0 - r);
  const hy1 = Math.min(patchH, iy1 + r);
  const hSpan = hy1 - hy0;

  const tempR = new Float32Array(iw * hSpan);
  const tempG = new Float32Array(iw * hSpan);
  const tempB = new Float32Array(iw * hSpan);

  for (let y = 0; y < hSpan; y++) {
    const rowOff = (hy0 + y) * patchW;
    const tOff = y * iw;
    for (let x = 0; x < iw; x++) {
      const cx = ix0 + x;
      let accR = 0;
      let accG = 0;
      let accB = 0;
      for (let k = -r; k <= r; k++) {
        const sx = cx + k < 0 ? 0 : cx + k >= patchW ? patchW - 1 : cx + k;
        const w = kernel[k + r] ?? 0;
        const si = (rowOff + sx) * 4;
        accR += (patch[si] ?? 0) * w;
        accG += (patch[si + 1] ?? 0) * w;
        accB += (patch[si + 2] ?? 0) * w;
      }
      tempR[tOff + x] = accR;
      tempG[tOff + x] = accG;
      tempB[tOff + x] = accB;
    }
    if (onProgress && (y & 31) === 0) {
      onProgress((y + 1) / (hSpan * 2));
    }
  }

  const out = new Uint8ClampedArray(iw * ih * 4);
  for (let y = 0; y < ih; y++) {
    const cy = iy0 + y;
    const sRow = cy * patchW + ix0;
    const dRow = y * iw;
    for (let x = 0; x < iw; x++) {
      let accR = 0;
      let accG = 0;
      let accB = 0;
      for (let k = -r; k <= r; k++) {
        const sy = cy + k < 0 ? 0 : cy + k >= patchH ? patchH - 1 : cy + k;
        const w = kernel[k + r] ?? 0;
        const ti = (sy - hy0) * iw + x;
        accR += (tempR[ti] ?? 0) * w;
        accG += (tempG[ti] ?? 0) * w;
        accB += (tempB[ti] ?? 0) * w;
      }
      const di = (dRow + x) * 4;
      const si = (sRow + x) * 4;
      out[di] = Math.max(0, Math.min(255, Math.round(accR)));
      out[di + 1] = Math.max(0, Math.min(255, Math.round(accG)));
      out[di + 2] = Math.max(0, Math.min(255, Math.round(accB)));
      out[di + 3] = patch[si + 3] ?? 255;
    }
    if (onProgress && (y & 31) === 0) {
      onProgress(0.5 + (y + 1) / (ih * 2));
    }
  }

  onProgress?.(1);
  return out;
}

export function gaussianBlurRegionFloat32(
  src: Float32Array,
  width: number,
  height: number,
  rect: Rect,
  radiusPx: number,
  onProgress?: (progress: number) => void,
): Float32Array {
  const pad = getGaussianKernelPad(radiusPx);
  const px0 = Math.max(0, rect.x - pad);
  const py0 = Math.max(0, rect.y - pad);
  const px1 = Math.min(width, rect.x + rect.w + pad);
  const py1 = Math.min(height, rect.y + rect.h + pad);
  const pw = px1 - px0;
  const ph = py1 - py0;
  if (pw <= 0 || ph <= 0) {
    onProgress?.(1);
    return new Float32Array(0);
  }
  const patch = new Float32Array(pw * ph);
  for (let y = 0; y < ph; y++) {
    const sOff = (py0 + y) * width + px0;
    patch.set(src.subarray(sOff, sOff + pw), y * pw);
  }
  return gaussianBlurPatchInnerFloat32(
    patch,
    pw,
    ph,
    { x: rect.x - px0, y: rect.y - py0, w: rect.w, h: rect.h },
    radiusPx,
    onProgress,
  );
}

export function gaussianBlurRegionRgba8(
  src: Uint8ClampedArray,
  width: number,
  height: number,
  rect: Rect,
  radiusPx: number,
  onProgress?: (progress: number) => void,
): Uint8ClampedArray {
  const pad = getGaussianKernelPad(radiusPx);
  const px0 = Math.max(0, rect.x - pad);
  const py0 = Math.max(0, rect.y - pad);
  const px1 = Math.min(width, rect.x + rect.w + pad);
  const py1 = Math.min(height, rect.y + rect.h + pad);
  const pw = px1 - px0;
  const ph = py1 - py0;
  if (pw <= 0 || ph <= 0) {
    onProgress?.(1);
    return new Uint8ClampedArray(0);
  }
  const patch = new Uint8ClampedArray(pw * ph * 4);
  for (let y = 0; y < ph; y++) {
    const sOff = ((py0 + y) * width + px0) * 4;
    patch.set(src.subarray(sOff, sOff + pw * 4), y * pw * 4);
  }
  return gaussianBlurPatchInnerRgba8(
    patch,
    pw,
    ph,
    { x: rect.x - px0, y: rect.y - py0, w: rect.w, h: rect.h },
    radiusPx,
    onProgress,
  );
}
