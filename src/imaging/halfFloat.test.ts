import { describe, expect, it } from 'vitest';
import {
  extractRectRgba8,
  extractRectToHalfFloat,
  float32ToHalfFloatArray,
  floatToHalf,
  halfToFloat,
} from '@/imaging/halfFloat';

describe('halfFloat', () => {
  it('converts canonical values cleanly', () => {
    expect(floatToHalf(0)).toBe(0x0000);
    expect(floatToHalf(-0)).toBe(0x8000);
    expect(floatToHalf(1)).toBe(0x3c00);
    expect(floatToHalf(-1)).toBe(0xbc00);
    expect(floatToHalf(0.5)).toBe(0x3800);
    expect(floatToHalf(0.25)).toBe(0x3400);
    expect(floatToHalf(0.75)).toBe(0x3a00);
    expect(floatToHalf(Infinity)).toBe(0x7c00);
    expect(floatToHalf(-Infinity)).toBe(0xfc00);
    expect(Number.isNaN(halfToFloat(floatToHalf(Number.NaN)))).toBe(true);
  });

  it('round-trips [0, 1] values within binary16 precision', () => {
    const samples = [0, 1 / 255, 0.1, 0.25, 0.3333, 0.5, 128 / 255, 0.75, 0.999, 1];
    for (const v of samples) {
      const h = floatToHalf(v);
      const back = halfToFloat(h);
      expect(Math.abs(back - v)).toBeLessThan(1e-3);
    }
  });

  it('handles subnormals and overflow', () => {
    const subnormal = 1e-6;
    expect(halfToFloat(floatToHalf(subnormal))).toBeCloseTo(subnormal, 6);
    expect(floatToHalf(1e-10)).toBe(0);
    expect(floatToHalf(70000)).toBe(0x7c00);
  });

  it('converts a Float32Array buffer and extracts rectangular regions', () => {
    const src = new Float32Array([
      0.0, 0.1, 0.2, 0.3,
      0.4, 0.5, 0.6, 0.7,
      0.8, 0.9, 1.0, 0.25,
    ]);
    const full = float32ToHalfFloatArray(src);
    expect(full.length).toBe(src.length);
    expect(halfToFloat(full[10] ?? 0)).toBe(1);

    const rectHalf = extractRectToHalfFloat(src, 4, { x: 1, y: 1, w: 2, h: 2 });
    expect(Array.from(rectHalf).map(halfToFloat)).toEqual([
      halfToFloat(floatToHalf(0.5)),
      halfToFloat(floatToHalf(0.6)),
      halfToFloat(floatToHalf(0.9)),
      halfToFloat(floatToHalf(1.0)),
    ]);
  });

  it('extracts RGBA8 sub-rectangles accurately', () => {
    const src = new Uint8ClampedArray([
      1, 2, 3, 255, 10, 20, 30, 255, 40, 50, 60, 255,
      70, 80, 90, 255, 100, 110, 120, 255, 130, 140, 150, 255,
    ]);
    const sub = extractRectRgba8(src, 3, { x: 1, y: 0, w: 2, h: 2 });
    expect(Array.from(sub)).toEqual([
      10, 20, 30, 255, 40, 50, 60, 255,
      100, 110, 120, 255, 130, 140, 150, 255,
    ]);
  });
});
