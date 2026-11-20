import type { FitMode, ImportTransform } from '@/core/types';
import {
  computeTransformScales,
  createDefaultTransform,
  mapDstPixelToSrc,
} from '@/imaging/transform';

function catmullRomWeights(t: number): [number, number, number, number] {
  const t2 = t * t;
  const t3 = t2 * t;
  return [
    -0.5 * t + t2 - 0.5 * t3,
    1 - 2.5 * t2 + 1.5 * t3,
    0.5 * t + 2 * t2 - 1.5 * t3,
    -0.5 * t2 + 0.5 * t3,
  ];
}

function clampCoord(v: number, min: number, max: number): number {
  return v < min ? min : v > max ? max : v;
}

export interface ResampleRgbaOptions {
  src: Uint8ClampedArray;
  srcWidth: number;
  srcHeight: number;
  dstWidth: number;
  dstHeight: number;
  fit: FitMode;
  transform: ImportTransform;
  padRgba?: [number, number, number, number];
  dstYStart?: number;
  dstYEnd?: number;
  onProgress?: (progress: number) => void;
}

export function resampleRgbaWithTransform(opts: ResampleRgbaOptions): Uint8ClampedArray {
  const {
    src,
    srcWidth,
    srcHeight,
    dstWidth,
    dstHeight,
    fit,
    transform,
    padRgba = [0, 0, 0, 255],
    dstYStart = 0,
    dstYEnd = dstHeight,
    onProgress,
  } = opts;

  const yStartRow = Math.max(0, Math.min(dstHeight, Math.floor(dstYStart)));
  const yEndRow = Math.max(yStartRow, Math.min(dstHeight, Math.floor(dstYEnd)));
  const outRows = yEndRow - yStartRow;
  if (outRows <= 0 || dstWidth <= 0) {
    onProgress?.(1);
    return new Uint8ClampedArray(0);
  }

  const dst = new Uint8ClampedArray(dstWidth * outRows * 4);
  const scales = computeTransformScales(srcWidth, srcHeight, dstWidth, dstHeight, fit, transform);
  const stepX = 1 / Math.max(1e-6, scales.scaleX);
  const stepY = 1 / Math.max(1e-6, scales.scaleY);
  const isDownscale = stepX > 1.05 || stepY > 1.05;
  const halfBoxX = Math.max(0.5, stepX * 0.5);
  const halfBoxY = Math.max(0.5, stepY * 0.5);

  const minCropX = scales.crop.x;
  const maxCropX = scales.crop.x + scales.crop.w - 1;
  const minCropY = scales.crop.y;
  const maxCropY = scales.crop.y + scales.crop.h - 1;

  for (let y = yStartRow; y < yEndRow; y++) {
    const outRow = y - yStartRow;
    for (let x = 0; x < dstWidth; x++) {
      const mapped = mapDstPixelToSrc(x, y, dstWidth, dstHeight, transform, scales);
      const outIdx = (outRow * dstWidth + x) * 4;

      if (!mapped.inside) {
        dst[outIdx] = padRgba[0];
        dst[outIdx + 1] = padRgba[1];
        dst[outIdx + 2] = padRgba[2];
        dst[outIdx + 3] = padRgba[3];
        continue;
      }

      if (isDownscale) {
        const xStart = Math.max(minCropX, Math.floor(mapped.srcX + 0.5 - halfBoxX));
        const xEnd = Math.min(maxCropX, Math.floor(mapped.srcX + 0.5 + halfBoxX - 1e-6));
        const yStart = Math.max(minCropY, Math.floor(mapped.srcY + 0.5 - halfBoxY));
        const yEnd = Math.min(maxCropY, Math.floor(mapped.srcY + 0.5 + halfBoxY - 1e-6));

        let rSum = 0;
        let gSum = 0;
        let bSum = 0;
        let aSum = 0;
        let count = 0;

        for (let sy = yStart; sy <= yEnd; sy++) {
          for (let sx = xStart; sx <= xEnd; sx++) {
            const idx = (sy * srcWidth + sx) * 4;
            rSum += src[idx] ?? 0;
            gSum += src[idx + 1] ?? 0;
            bSum += src[idx + 2] ?? 0;
            aSum += src[idx + 3] ?? 255;
            count++;
          }
        }

        if (count > 0) {
          dst[outIdx] = Math.round(rSum / count);
          dst[outIdx + 1] = Math.round(gSum / count);
          dst[outIdx + 2] = Math.round(bSum / count);
          dst[outIdx + 3] = Math.round(aSum / count);
        }
      } else {
        const ix = Math.floor(mapped.srcX);
        const iy = Math.floor(mapped.srcY);
        const wx = catmullRomWeights(mapped.srcX - ix);
        const wy = catmullRomWeights(mapped.srcY - iy);

        let rSum = 0;
        let gSum = 0;
        let bSum = 0;
        let aSum = 0;

        for (let ky = -1; ky <= 2; ky++) {
          const sy = clampCoord(iy + ky, minCropY, maxCropY);
          const wyv = wy[ky + 1] ?? 0;
          for (let kx = -1; kx <= 2; kx++) {
            const sx = clampCoord(ix + kx, minCropX, maxCropX);
            const w = wyv * (wx[kx + 1] ?? 0);
            const idx = (sy * srcWidth + sx) * 4;
            rSum += (src[idx] ?? 0) * w;
            gSum += (src[idx + 1] ?? 0) * w;
            bSum += (src[idx + 2] ?? 0) * w;
            aSum += (src[idx + 3] ?? 255) * w;
          }
        }

        dst[outIdx] = clampCoord(Math.round(rSum), 0, 255);
        dst[outIdx + 1] = clampCoord(Math.round(gSum), 0, 255);
        dst[outIdx + 2] = clampCoord(Math.round(bSum), 0, 255);
        dst[outIdx + 3] = clampCoord(Math.round(aSum), 0, 255);
      }
    }

    if (onProgress && (outRow & 31) === 0) {
      onProgress((outRow + 1) / outRows);
    }
  }

  onProgress?.(1);
  return dst;
}

export interface ResampleFloatOptions {
  src: Float32Array;
  srcWidth: number;
  srcHeight: number;
  dstWidth: number;
  dstHeight: number;
  fit: FitMode;
  transform: ImportTransform;
  padValue?: number;
  dstYStart?: number;
  dstYEnd?: number;
  onProgress?: (progress: number) => void;
}

export function resampleFloatWithTransform(opts: ResampleFloatOptions): Float32Array {
  const {
    src,
    srcWidth,
    srcHeight,
    dstWidth,
    dstHeight,
    fit,
    transform,
    padValue = 0,
    dstYStart = 0,
    dstYEnd = dstHeight,
    onProgress,
  } = opts;

  const yStartRow = Math.max(0, Math.min(dstHeight, Math.floor(dstYStart)));
  const yEndRow = Math.max(yStartRow, Math.min(dstHeight, Math.floor(dstYEnd)));
  const outRows = yEndRow - yStartRow;
  if (outRows <= 0 || dstWidth <= 0) {
    onProgress?.(1);
    return new Float32Array(0);
  }

  const dst = new Float32Array(dstWidth * outRows);
  const scales = computeTransformScales(srcWidth, srcHeight, dstWidth, dstHeight, fit, transform);
  const stepX = 1 / Math.max(1e-6, scales.scaleX);
  const stepY = 1 / Math.max(1e-6, scales.scaleY);
  const isDownscale = stepX > 1.05 || stepY > 1.05;
  const halfBoxX = Math.max(0.5, stepX * 0.5);
  const halfBoxY = Math.max(0.5, stepY * 0.5);

  const minCropX = scales.crop.x;
  const maxCropX = scales.crop.x + scales.crop.w - 1;
  const minCropY = scales.crop.y;
  const maxCropY = scales.crop.y + scales.crop.h - 1;

  for (let y = yStartRow; y < yEndRow; y++) {
    const outRow = y - yStartRow;
    for (let x = 0; x < dstWidth; x++) {
      const mapped = mapDstPixelToSrc(x, y, dstWidth, dstHeight, transform, scales);
      const outIdx = outRow * dstWidth + x;

      if (!mapped.inside) {
        dst[outIdx] = padValue;
        continue;
      }

      if (isDownscale) {
        const xStart = Math.max(minCropX, Math.floor(mapped.srcX + 0.5 - halfBoxX));
        const xEnd = Math.min(maxCropX, Math.floor(mapped.srcX + 0.5 + halfBoxX - 1e-6));
        const yStart = Math.max(minCropY, Math.floor(mapped.srcY + 0.5 - halfBoxY));
        const yEnd = Math.min(maxCropY, Math.floor(mapped.srcY + 0.5 + halfBoxY - 1e-6));

        let sum = 0;
        let count = 0;
        for (let sy = yStart; sy <= yEnd; sy++) {
          for (let sx = xStart; sx <= xEnd; sx++) {
            sum += src[sy * srcWidth + sx] ?? 0;
            count++;
          }
        }
        dst[outIdx] = count > 0 ? clampCoord(sum / count, 0, 1) : padValue;
      } else {
        const ix = Math.floor(mapped.srcX);
        const iy = Math.floor(mapped.srcY);
        const wx = catmullRomWeights(mapped.srcX - ix);
        const wy = catmullRomWeights(mapped.srcY - iy);

        let sum = 0;
        for (let ky = -1; ky <= 2; ky++) {
          const sy = clampCoord(iy + ky, minCropY, maxCropY);
          const wyv = wy[ky + 1] ?? 0;
          for (let kx = -1; kx <= 2; kx++) {
            const sx = clampCoord(ix + kx, minCropX, maxCropX);
            sum += (src[sy * srcWidth + sx] ?? 0) * wyv * (wx[kx + 1] ?? 0);
          }
        }
        dst[outIdx] = clampCoord(sum, 0, 1);
      }
    }

    if (onProgress && (outRow & 31) === 0) {
      onProgress((outRow + 1) / outRows);
    }
  }

  onProgress?.(1);
  return dst;
}

export function resampleMaskUint8(
  src: Uint8Array,
  srcWidth: number,
  srcHeight: number,
  dstWidth: number,
  dstHeight: number,
  dstYStart = 0,
  dstYEnd = dstHeight,
): Uint8Array {
  const yStartRow = Math.max(0, Math.min(dstHeight, Math.floor(dstYStart)));
  const yEndRow = Math.max(yStartRow, Math.min(dstHeight, Math.floor(dstYEnd)));
  const outRows = yEndRow - yStartRow;
  if (outRows <= 0 || dstWidth <= 0) {
    return new Uint8Array(0);
  }

  let hasNonZero = false;
  for (let i = 0; i < src.length; i++) {
    if ((src[i] ?? 0) !== 0) {
      hasNonZero = true;
      break;
    }
  }
  const dst = new Uint8Array(dstWidth * outRows);
  if (!hasNonZero) {
    return dst;
  }

  const floatSrc = new Float32Array(src.length);
  for (let i = 0; i < src.length; i++) {
    floatSrc[i] = (src[i] ?? 0) / 255;
  }
  const resampled = resampleFloatWithTransform({
    src: floatSrc,
    srcWidth,
    srcHeight,
    dstWidth,
    dstHeight,
    fit: 'stretch',
    transform: createDefaultTransform(srcWidth, srcHeight),
    dstYStart: yStartRow,
    dstYEnd: yEndRow,
  });
  for (let i = 0; i < resampled.length; i++) {
    dst[i] = clampCoord(Math.round((resampled[i] ?? 0) * 255), 0, 255);
  }
  return dst;
}
