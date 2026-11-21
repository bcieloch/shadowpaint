import { encode } from 'fast-png';
import { clamp01 } from '@/core/maps/quantize';
import { valueToMm } from '@/core/units/calibration';
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

function downsampleBytesRectBox(
  src: Uint8Array | Uint8ClampedArray,
  fullW: number,
  fullH: number,
  cropX: number,
  cropY: number,
  cropW: number,
  cropH: number,
  dstW: number,
  dstH: number,
): Uint8Array {
  const out = new Uint8Array(dstW * dstH * 3);
  const scaleX = cropW / dstW;
  const scaleY = cropH / dstH;

  for (let dy = 0; dy < dstH; dy++) {
    const sy0 = Math.max(0, Math.min(fullH - 1, cropY + Math.floor(dy * scaleY)));
    const sy1 = Math.max(sy0 + 1, Math.min(fullH, cropY + Math.ceil((dy + 1) * scaleY)));
    for (let dx = 0; dx < dstW; dx++) {
      const sx0 = Math.max(0, Math.min(fullW - 1, cropX + Math.floor(dx * scaleX)));
      const sx1 = Math.max(sx0 + 1, Math.min(fullW, cropX + Math.ceil((dx + 1) * scaleX)));
      const count = (sy1 - sy0) * (sx1 - sx0);
      let rSum = 0;
      let gSum = 0;
      let bSum = 0;
      for (let sy = sy0; sy < sy1; sy++) {
        const rowBase = sy * fullW * 4;
        for (let sx = sx0; sx < sx1; sx++) {
          const idx = rowBase + sx * 4;
          rSum += src[idx] ?? 0;
          gSum += src[idx + 1] ?? 0;
          bSum += src[idx + 2] ?? 0;
        }
      }
      const dstIdx = (dy * dstW + dx) * 3;
      out[dstIdx] = Math.round(rSum / count);
      out[dstIdx + 1] = Math.round(gSum / count);
      out[dstIdx + 2] = Math.round(bSum / count);
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

export function prepareColorTilePdfImage(
  rgba: Uint8ClampedArray | Uint8Array,
  fullW: number,
  fullH: number,
  crop: { x: number; y: number; w: number; h: number },
  maxLongSide = 1200,
): EncodedPdfImage {
  const safeW = Math.max(1, crop.w);
  const safeH = Math.max(1, crop.h);
  const { width, height } = computeTargetSize(safeW, safeH, maxLongSide);
  const rgb = downsampleBytesRectBox(
    rgba,
    fullW,
    fullH,
    crop.x,
    crop.y,
    safeW,
    safeH,
    width,
    height,
  );
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

export function prepareHeightContoursPdfImage(
  values: Float32Array,
  srcW: number,
  srcH: number,
  minMm: number,
  maxMm: number,
  maxLongSide = 960,
): EncodedPdfImage {
  const { width, height } = computeTargetSize(srcW, srcH, maxLongSide);
  const sampled =
    width === srcW && height === srcH
      ? values
      : downsampleFloatBox(values, srcW, srcH, width, height);
  const spanMm = Math.max(0.01, maxMm - minMm);
  const contourStepMm = spanMm >= 1 ? 1 : spanMm / 5;
  const rgb = new Uint8Array(width * height * 3);

  for (let y = 0; y < height; y++) {
    for (let x = 0; x < width; x++) {
      const idx = y * width + x;
      const v = clamp01(sampled[idx] ?? 0);
      const mm = valueToMm(v, minMm, maxMm);
      const bin = Math.floor(mm / contourStepMm);
      const binRight =
        x + 1 < width
          ? Math.floor(valueToMm(clamp01(sampled[idx + 1] ?? v), minMm, maxMm) / contourStepMm)
          : bin;
      const binDown =
        y + 1 < height
          ? Math.floor(
              valueToMm(clamp01(sampled[idx + width] ?? v), minMm, maxMm) / contourStepMm,
            )
          : bin;

      const dst = idx * 3;
      if (bin !== binRight || bin !== binDown) {
        // High-contrast dark amber/charcoal 1 mm iso-contour line
        rgb[dst] = 180;
        rgb[dst + 1] = 65;
        rgb[dst + 2] = 14;
      } else {
        // Lightened elevation backdrop (105..248) so grid overlay and contours stay readable
        const shade = Math.round(105 + v * 143);
        rgb[dst] = shade;
        rgb[dst + 1] = shade;
        rgb[dst + 2] = Math.min(255, shade + 4);
      }
    }
  }

  return {
    width,
    height,
    pngBytes: encodeRgbBytesPng(rgb, width, height),
  };
}
