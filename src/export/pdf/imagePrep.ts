import { encode } from 'fast-png';
import { clamp01 } from '@/core/maps/quantize';
import { sampleTurboRgb01 } from '@/core/units/colormaps';
import { encodeRgbBytesPng } from '@/export/png';

export interface EncodedPdfImage {
  width: number;
  height: number;
  pngBytes: Uint8Array;
}

function computeTargetSize(
  srcW: number,
  srcH: number,
  maxLongSide: number,
): { width: number; height: number } {
  const safeW = Math.max(1, srcW);
  const safeH = Math.max(1, srcH);
  const maxDim = Math.max(safeW, safeH);
  if (maxDim <= maxLongSide) {
    return { width: safeW, height: safeH };
  }
  const scale = maxLongSide / maxDim;
  return {
    width: Math.max(1, Math.round(safeW * scale)),
    height: Math.max(1, Math.round(safeH * scale)),
  };
}

function downsampleBytesBox(
  src: Uint8Array | Uint8ClampedArray,
  srcW: number,
  srcH: number,
  dstW: number,
  dstH: number,
  srcStride: number,
  dstChannels: number,
): Uint8Array {
  const out = new Uint8Array(dstW * dstH * dstChannels);
  const scaleX = srcW / dstW;
  const scaleY = srcH / dstH;

  for (let dy = 0; dy < dstH; dy++) {
    const sy0 = Math.floor(dy * scaleY);
    const sy1 = Math.max(sy0 + 1, Math.min(srcH, Math.ceil((dy + 1) * scaleY)));
    for (let dx = 0; dx < dstW; dx++) {
      const sx0 = Math.floor(dx * scaleX);
      const sx1 = Math.max(sx0 + 1, Math.min(srcW, Math.ceil((dx + 1) * scaleX)));
      const count = (sy1 - sy0) * (sx1 - sx0);

      for (let c = 0; c < dstChannels; c++) {
        let sum = 0;
        for (let sy = sy0; sy < sy1; sy++) {
          const rowBase = sy * srcW * srcStride;
          for (let sx = sx0; sx < sx1; sx++) {
            sum += src[rowBase + sx * srcStride + c] ?? 0;
          }
        }
        out[(dy * dstW + dx) * dstChannels + c] = Math.round(sum / count);
      }
    }
  }

  return out;
}

function downsampleFloatBox(
  src: Float32Array,
  srcW: number,
  srcH: number,
  dstW: number,
  dstH: number,
): Float32Array {
  const out = new Float32Array(dstW * dstH);
  const scaleX = srcW / dstW;
  const scaleY = srcH / dstH;

  for (let dy = 0; dy < dstH; dy++) {
    const sy0 = Math.floor(dy * scaleY);
    const sy1 = Math.max(sy0 + 1, Math.min(srcH, Math.ceil((dy + 1) * scaleY)));
    for (let dx = 0; dx < dstW; dx++) {
      const sx0 = Math.floor(dx * scaleX);
      const sx1 = Math.max(sx0 + 1, Math.min(srcW, Math.ceil((dx + 1) * scaleX)));
      const count = (sy1 - sy0) * (sx1 - sx0);
      let sum = 0;
      for (let sy = sy0; sy < sy1; sy++) {
        const rowBase = sy * srcW;
        for (let sx = sx0; sx < sx1; sx++) {
          sum += clamp01(src[rowBase + sx] ?? 0);
        }
      }
      out[dy * dstW + dx] = sum / count;
    }
  }

  return out;
}

export function prepareColorPdfImage(
  rgba: Uint8ClampedArray | Uint8Array,
  srcW: number,
  srcH: number,
  maxLongSide = 960,
): EncodedPdfImage {
  const { width, height } = computeTargetSize(srcW, srcH, maxLongSide);
  const rgb = downsampleBytesBox(rgba, srcW, srcH, width, height, 4, 3);
  return {
    width,
    height,
    pngBytes: encodeRgbBytesPng(rgb, width, height),
  };
}

export function prepareRgbPreviewPdfImage(
  rgb: Uint8Array,
  srcW: number,
  srcH: number,
  maxLongSide = 720,
): EncodedPdfImage {
  const { width, height } = computeTargetSize(srcW, srcH, maxLongSide);
  const sampled =
    width === srcW && height === srcH
      ? rgb
      : downsampleBytesBox(rgb, srcW, srcH, width, height, 3, 3);
  return {
    width,
    height,
    pngBytes: encodeRgbBytesPng(sampled, width, height),
  };
}

export function prepareGrayscalePdfImage(
  values: Float32Array,
  srcW: number,
  srcH: number,
  maxLongSide = 960,
): EncodedPdfImage {
  const { width, height } = computeTargetSize(srcW, srcH, maxLongSide);
  const sampled =
    width === srcW && height === srcH
      ? values
      : downsampleFloatBox(values, srcW, srcH, width, height);
  const gray = new Uint8Array(width * height);
  for (let i = 0; i < gray.length; i++) {
    gray[i] = Math.round(clamp01(sampled[i] ?? 0) * 255);
  }
  return {
    width,
    height,
    pngBytes: encode({ width, height, channels: 1, depth: 8, data: gray }),
  };
}

export function prepareHeatmapPdfImage(
  values: Float32Array,
  srcW: number,
  srcH: number,
  maxLongSide = 960,
): EncodedPdfImage {
  const { width, height } = computeTargetSize(srcW, srcH, maxLongSide);
  const sampled =
    width === srcW && height === srcH
      ? values
      : downsampleFloatBox(values, srcW, srcH, width, height);
  const rgb = new Uint8Array(width * height * 3);
  for (let i = 0; i < sampled.length; i++) {
    const c = sampleTurboRgb01(sampled[i] ?? 0);
    const dst = i * 3;
    rgb[dst] = Math.round(clamp01(c.r) * 255);
    rgb[dst + 1] = Math.round(clamp01(c.g) * 255);
    rgb[dst + 2] = Math.round(clamp01(c.b) * 255);
  }
  return {
    width,
    height,
    pngBytes: encodeRgbBytesPng(rgb, width, height),
  };
}
