import { encodeColorPng } from '@/export/png';

export function downscaleRgbaNearest(
  rgba: Uint8Array | Uint8ClampedArray,
  srcWidth: number,
  srcHeight: number,
  maxLongestSide = 512,
): { rgba: Uint8Array; width: number; height: number } {
  const safeW = Math.max(1, srcWidth);
  const safeH = Math.max(1, srcHeight);
  const longest = Math.max(safeW, safeH);
  const scale = longest > maxLongestSide ? maxLongestSide / longest : 1;
  const dstWidth = Math.max(1, Math.round(safeW * scale));
  const dstHeight = Math.max(1, Math.round(safeH * scale));

  if (dstWidth === safeW && dstHeight === safeH) {
    const out = new Uint8Array(rgba.byteLength);
    out.set(rgba);
    return { rgba: out, width: safeW, height: safeH };
  }

  const out = new Uint8Array(dstWidth * dstHeight * 4);
  for (let y = 0; y < dstHeight; y++) {
    const sy = Math.min(safeH - 1, Math.floor((y * safeH) / dstHeight));
    for (let x = 0; x < dstWidth; x++) {
      const sx = Math.min(safeW - 1, Math.floor((x * safeW) / dstWidth));
      const srcIdx = (sy * safeW + sx) * 4;
      const dstIdx = (y * dstWidth + x) * 4;
      out[dstIdx] = rgba[srcIdx] ?? 0;
      out[dstIdx + 1] = rgba[srcIdx + 1] ?? 0;
      out[dstIdx + 2] = rgba[srcIdx + 2] ?? 0;
      out[dstIdx + 3] = rgba[srcIdx + 3] ?? 255;
    }
  }

  return { rgba: out, width: dstWidth, height: dstHeight };
}

export function encodeThumbnailPngSync(
  rgba: Uint8Array | Uint8ClampedArray,
  width: number,
  height: number,
  maxLongestSide = 512,
): Uint8Array {
  const scaled = downscaleRgbaNearest(rgba, width, height, maxLongestSide);
  return encodeColorPng(scaled.rgba, scaled.width, scaled.height, true);
}
