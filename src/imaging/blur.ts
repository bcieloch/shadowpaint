import { clamp01 } from '@/core/maps/quantize';

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
