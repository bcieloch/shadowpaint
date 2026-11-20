import { describe, expect, it } from 'vitest';
import {
  applyColorAdjustments,
  applyHeightAdjustments,
  applyOpacityAdjustments,
} from '@/core/maps/adjustments';

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
});
