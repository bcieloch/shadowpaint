import { encode } from 'fast-png';
import { clamp01 } from '@/core/maps/quantize';

export function encodeColorPng(
  rgba: Uint8ClampedArray | Uint8Array,
  width: number,
  height: number,
  includeAlpha: boolean,
): Uint8Array {
  const pixelCount = width * height;
  if (includeAlpha) {
    const data =
      rgba instanceof Uint8Array
        ? rgba
        : new Uint8Array(rgba.buffer, rgba.byteOffset, rgba.byteLength);
    return encode({
      width,
      height,
      channels: 4,
      depth: 8,
      data,
    });
  }

  const rgb = new Uint8Array(pixelCount * 3);
  for (let i = 0; i < pixelCount; i++) {
    const src = i * 4;
    const dst = i * 3;
    rgb[dst] = rgba[src] ?? 0;
    rgb[dst + 1] = rgba[src + 1] ?? 0;
    rgb[dst + 2] = rgba[src + 2] ?? 0;
  }

  return encode({
    width,
    height,
    channels: 3,
    depth: 8,
    data: rgb,
  });
}

export function encodeGrayscaleMapPng(
  values: Float32Array,
  width: number,
  height: number,
): Uint8Array {
  const pixelCount = width * height;
  const gray = new Uint8Array(pixelCount);
  for (let i = 0; i < pixelCount; i++) {
    gray[i] = Math.round(clamp01(values[i] ?? 0) * 255);
  }
  return encode({
    width,
    height,
    channels: 1,
    depth: 8,
    data: gray,
  });
}

export function encodeRgbBytesPng(rgb: Uint8Array, width: number, height: number): Uint8Array {
  return encode({
    width,
    height,
    channels: 3,
    depth: 8,
    data: rgb,
  });
}
