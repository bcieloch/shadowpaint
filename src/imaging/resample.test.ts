import { describe, expect, it } from 'vitest';
import { resampleFloatWithTransform, resampleRgbaWithTransform } from '@/imaging/resample';
import { createDefaultTransform } from '@/imaging/transform';

describe('transform and resample', () => {
  it('preserves constant image across upscale and fit padding', () => {
    const src = new Float32Array(16).fill(0.42);
    const out = resampleFloatWithTransform({
      src,
      srcWidth: 4,
      srcHeight: 4,
      dstWidth: 8,
      dstHeight: 8,
      fit: 'stretch',
      transform: createDefaultTransform(4, 4),
    });

    for (let i = 0; i < out.length; i++) {
      expect(out[i]).toBeCloseTo(0.42, 5);
    }
  });

  it('downscales 2x using 2x2 box average', () => {
    const src = new Float32Array([
      0.0, 0.4, 1.0, 1.0,
      0.2, 0.6, 1.0, 1.0,
      0.5, 0.5, 0.0, 0.2,
      0.5, 0.5, 0.4, 0.6,
    ]);
    const out = resampleFloatWithTransform({
      src,
      srcWidth: 4,
      srcHeight: 4,
      dstWidth: 2,
      dstHeight: 2,
      fit: 'stretch',
      transform: createDefaultTransform(4, 4),
    });

    expect(out[0]).toBeCloseTo(0.3, 5);
    expect(out[1]).toBeCloseTo(1.0, 5);
    expect(out[2]).toBeCloseTo(0.5, 5);
    expect(out[3]).toBeCloseTo(0.3, 5);
  });

  it('supports fit padding and flipH on RGBA images', () => {
    const src = new Uint8ClampedArray([
      255, 0, 0, 255,
      0, 0, 255, 255,
      255, 0, 0, 255,
      0, 0, 255, 255,
    ]);
    const transform = createDefaultTransform(2, 2);
    transform.flipH = true;

    const out = resampleRgbaWithTransform({
      src,
      srcWidth: 2,
      srcHeight: 2,
      dstWidth: 4,
      dstHeight: 2,
      fit: 'fit',
      transform,
      padRgba: [10, 20, 30, 255],
    });

    // Left padding column should be padRgba
    expect(Array.from(out.slice(0, 4))).toEqual([10, 20, 30, 255]);
    // Flipped: left side of image becomes blue (0,0,255)
    expect(out[4]).toBe(0);
    expect(out[6]).toBe(255);
  });
});
