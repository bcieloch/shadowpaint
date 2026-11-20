import type { Rect } from '@/core/types';

const scratchF32 = new Float32Array(1);
const scratchU32 = new Uint32Array(scratchF32.buffer);

/**
 * Converts a 32-bit IEEE 754 float to an IEEE 754 binary16 (half-float) uint16 bit pattern.
 */
export function floatToHalf(value: number): number {
  scratchF32[0] = value;
  const x = scratchU32[0] ?? 0;

  const sign = (x >>> 16) & 0x8000;
  let exp = (x >>> 23) & 0xff;
  let mant = x & 0x007fffff;

  // NaN or Infinity
  if (exp === 0xff) {
    if (mant !== 0) {
      return sign | 0x7e00 | (mant >>> 13);
    }
    return sign | 0x7c00;
  }

  // Rebias exponent from 127 to 15
  exp = exp - 127 + 15;

  // Overflow to Infinity
  if (exp >= 31) {
    return sign | 0x7c00;
  }

  // Subnormal or underflow to zero
  if (exp <= 0) {
    if (exp < -10) {
      return sign;
    }
    mant = (mant | 0x00800000) >>> (1 - exp);
    // Round to nearest even
    if ((mant & 0x00001000) !== 0) {
      mant += 0x00002000;
    }
    return sign | (mant >>> 13);
  }

  // Normal half-float with round-to-nearest-even
  const roundBit = 0x00001000;
  if ((mant & roundBit) !== 0 && ((mant & 0x00000fff) !== 0 || (mant & 0x00002000) !== 0)) {
    mant += 0x00002000;
    if ((mant & 0x00800000) !== 0) {
      mant = 0;
      exp += 1;
      if (exp >= 31) {
        return sign | 0x7c00;
      }
    }
  }

  return sign | (exp << 10) | (mant >>> 13);
}

/**
 * Converts an IEEE 754 binary16 (half-float) uint16 bit pattern back to a JS number.
 */
export function halfToFloat(half: number): number {
  const s = (half & 0x8000) !== 0 ? -1 : 1;
  const e = (half >>> 10) & 0x1f;
  const m = half & 0x03ff;

  if (e === 0) {
    if (m === 0) return s === -1 ? -0 : 0;
    return s * Math.pow(2, -14) * (m / 1024);
  }
  if (e === 31) {
    return m === 0 ? s * Infinity : Number.NaN;
  }
  return s * Math.pow(2, e - 15) * (1 + m / 1024);
}

export function float32ToHalfFloatArray(src: Float32Array, dst?: Uint16Array): Uint16Array {
  const out = dst && dst.length >= src.length ? dst : new Uint16Array(src.length);
  for (let i = 0; i < src.length; i++) {
    out[i] = floatToHalf(src[i] ?? 0);
  }
  return out;
}

export function updateHalfFloatRectInPlace(
  src: Float32Array,
  srcWidth: number,
  rect: Rect,
  dstFull: Uint16Array,
): void {
  const xEnd = rect.x + rect.w;
  const yEnd = rect.y + rect.h;
  for (let y = rect.y; y < yEnd; y++) {
    const rowStart = y * srcWidth;
    for (let x = rect.x; x < xEnd; x++) {
      const idx = rowStart + x;
      dstFull[idx] = floatToHalf(src[idx] ?? 0);
    }
  }
}

export function extractRectToHalfFloat(
  src: Float32Array,
  srcWidth: number,
  rect: Rect,
  dst?: Uint16Array,
): Uint16Array {
  const count = rect.w * rect.h;
  const out = dst && dst.length >= count ? dst : new Uint16Array(count);
  let dstIdx = 0;
  for (let y = 0; y < rect.h; y++) {
    const rowStart = (rect.y + y) * srcWidth + rect.x;
    for (let x = 0; x < rect.w; x++) {
      out[dstIdx++] = floatToHalf(src[rowStart + x] ?? 0);
    }
  }
  return out;
}

export function extractRectRgba8(
  src: Uint8ClampedArray,
  srcWidth: number,
  rect: Rect,
  dst?: Uint8ClampedArray,
): Uint8ClampedArray {
  const byteLen = rect.w * rect.h * 4;
  const out = dst && dst.length >= byteLen ? dst : new Uint8ClampedArray(byteLen);
  const rowBytes = rect.w * 4;
  for (let y = 0; y < rect.h; y++) {
    const srcStart = ((rect.y + y) * srcWidth + rect.x) * 4;
    out.set(src.subarray(srcStart, srcStart + rowBytes), y * rowBytes);
  }
  return out;
}
