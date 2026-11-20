import { describe, expect, it } from 'vitest';
import {
  applyColorAdjustments,
  applyHeightAdjustments,
  applyOpacityAdjustments,
} from '@/core/maps/adjustments';
import { clamp01 } from '@/core/maps/quantize';
import type { ColorAdjustments } from '@/core/types';

function referenceColorAdjustments(
  src: Uint8ClampedArray,
  width: number,
  height: number,
  params: ColorAdjustments,
): Uint8ClampedArray {
  const dst = new Uint8ClampedArray(src.length);
  const c = Math.max(-1, Math.min(1, params.contrast));
  const k = c >= 0 ? 1 / (1 - 0.99 * c) : 1 + c;
  const b = params.brightness;
  const satMult = 1 + params.saturation;

  for (let i = 0; i < width * height * 4; i += 4) {
    let r = (src[i] ?? 0) / 255 + b;
    let g = (src[i + 1] ?? 0) / 255 + b;
    let bl = (src[i + 2] ?? 0) / 255 + b;

    r = (r - 0.5) * k + 0.5;
    g = (g - 0.5) * k + 0.5;
    bl = (bl - 0.5) * k + 0.5;

    const lum = 0.2126 * r + 0.7152 * g + 0.0722 * bl;
    r = clamp01(lum + (r - lum) * satMult);
    g = clamp01(lum + (g - lum) * satMult);
    bl = clamp01(lum + (bl - lum) * satMult);

    dst[i] = Math.round(r * 255);
    dst[i + 1] = Math.round(g * 255);
    dst[i + 2] = Math.round(bl * 255);
    dst[i + 3] = src[i + 3] ?? 255;
  }
  return dst;
}

describe('adjustments', () => {
  it('identity adjustments preserve color, height, and opacity exactly', () => {
    const colorSrc = new Uint8ClampedArray([120, 40, 200, 255, 10, 20, 30, 128]);
    const colorDst = new Uint8ClampedArray(colorSrc.length);
    applyColorAdjustments(colorSrc, colorDst, 2, 1, {
      brightness: 0,
      contrast: 0,
      saturation: 0,
    });
    expect(Array.from(colorDst)).toEqual(Array.from(colorSrc));

    const heightSrc = new Float32Array([0, 0.25, 0.5, 1]);
    const heightDst = new Float32Array(4);
    applyHeightAdjustments(heightSrc, heightDst, 4, 1, {
      invert: false,
      contrast: 0,
      gamma: 1,
    });
    expect(Array.from(heightDst)).toEqual(Array.from(heightSrc));
  });

  it('applies saturation -1 to grayscale and invert on height', () => {
    const colorSrc = new Uint8ClampedArray([255, 0, 0, 255]);
    const colorDst = new Uint8ClampedArray(4);
    applyColorAdjustments(colorSrc, colorDst, 1, 1, {
      brightness: 0,
      contrast: 0,
      saturation: -1,
    });
    expect(colorDst[0]).toBe(colorDst[1]);
    expect(colorDst[1]).toBe(colorDst[2]);
    expect(colorDst[0]).toBe(Math.round(0.2126 * 255));

    const heightSrc = new Float32Array([0.2, 0.8]);
    const heightDst = new Float32Array(2);
    applyHeightAdjustments(heightSrc, heightDst, 2, 1, {
      invert: true,
      contrast: 0,
      gamma: 1,
    });
    expect(heightDst[0]).toBeCloseTo(0.8, 5);
    expect(heightDst[1]).toBeCloseTo(0.2, 5);
  });

  it('maps opacity values to [Tmin, Tmax] transmission range', () => {
    const src = new Float32Array([0, 0.5, 1]);
    const dst = new Float32Array(3);
    applyOpacityAdjustments(src, dst, 3, 1, {
      invert: false,
      contrast: 0,
      maxTransmissionPct: 80,
      maxOpacityPct: 90, // Tmin = 0.1
    });
    expect(dst[0]).toBeCloseTo(0.1, 5);
    expect(dst[1]).toBeCloseTo(0.45, 5);
    expect(dst[2]).toBeCloseTo(0.8, 5);
  });

  it('LUT-optimized color adjustment matches scalar reference across non-trivial params', () => {
    const width = 32;
    const height = 16;
    const src = new Uint8ClampedArray(width * height * 4);
    for (let i = 0; i < src.length; i += 4) {
      src[i] = (i * 7) % 256;
      src[i + 1] = (i * 13 + 40) % 256;
      src[i + 2] = (i * 29 + 90) % 256;
      src[i + 3] = 200;
    }

    for (const params of [
      { brightness: 0.15, contrast: 0.35, saturation: 0 },
      { brightness: -0.2, contrast: 0.4, saturation: 0.5 },
      { brightness: 0.08, contrast: -0.3, saturation: -0.65 },
    ]) {
      const dst = new Uint8ClampedArray(src.length);
      applyColorAdjustments(src, dst, width, height, params);
      const ref = referenceColorAdjustments(src, width, height, params);
      for (let i = 0; i < src.length; i++) {
        expect(Math.abs((dst[i] ?? 0) - (ref[i] ?? 0))).toBeLessThanOrEqual(1);
      }
    }
  });

  it('processes 3000x4200 color rect slices accurately', () => {
    const w = 3000;
    const h = 16;
    const src = new Uint8ClampedArray(w * h * 4);
    src.fill(140);
    const dst = new Uint8ClampedArray(src.length);
    applyColorAdjustments(
      src,
      dst,
      w,
      h,
      { brightness: 0.1, contrast: 0.25, saturation: 0.3 },
      { x: 0, y: 4, w, h: 8 },
    );
    expect(dst[0]).toBe(0);
    expect(dst[(4 * w + 10) * 4]).toBeGreaterThan(140);
  });
});
