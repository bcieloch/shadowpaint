export function rgbaToGrayscaleFloat32(rgba: Uint8ClampedArray | Uint8Array): Float32Array {
  const pixelCount = Math.floor(rgba.length / 4);
  const out = new Float32Array(pixelCount);

  for (let i = 0; i < pixelCount; i++) {
    const o = i * 4;
    const r = (rgba[o] ?? 0) / 255;
    const g = (rgba[o + 1] ?? 0) / 255;
    const b = (rgba[o + 2] ?? 0) / 255;
    const a = (rgba[o + 3] ?? 255) / 255;
    const lum = 0.2126 * r + 0.7152 * g + 0.0722 * b;
    out[i] = Math.max(0, Math.min(1, lum * a));
  }

  return out;
}
