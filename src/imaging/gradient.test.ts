import { describe, expect, it } from 'vitest';
import {
  applyGradientFloat32,
  applyGradientRgba8,
  computeGradientFactor,
} from '@/imaging/gradient';

describe('gradient imaging ops', () => {
  it('computes linear and radial gradient factors at start, midpoint, and end', () => {
    const p0 = { x: 0, y: 0 };
    const p1 = { x: 10, y: 0 };
    expect(computeGradientFactor(0, 0, p0, p1, 'linear')).toBeCloseTo(0, 5);
    expect(computeGradientFactor(5, 0, p0, p1, 'linear')).toBeCloseTo(0.5, 5);
    expect(computeGradientFactor(10, 0, p0, p1, 'linear')).toBeCloseTo(1, 5);
    expect(computeGradientFactor(15, 0, p0, p1, 'linear')).toBe(1);

    expect(computeGradientFactor(0, 0, p0, p1, 'radial')).toBeCloseTo(0, 5);
    expect(computeGradientFactor(0, 5, p0, p1, 'radial')).toBeCloseTo(0.5, 5);
    expect(computeGradientFactor(0, 10, p0, p1, 'radial')).toBeCloseTo(1, 5);
  });

  it('applies linear and radial gradients to Float32 buffers with start, mid, and end values', () => {
    const w = 11;
    const h = 11;
    const src = new Float32Array(w * h);

    const linear = applyGradientFloat32({
      working: src,
      width: w,
      height: h,
      kind: 'linear',
      p0: { x: 0, y: 5 },
      p1: { x: 10, y: 5 },
      startValue: 0.2,
      endValue: 0.8,
    });
    expect(linear.dirtyRect).toEqual({ x: 0, y: 0, w: 11, h: 11 });
    expect(linear.out[5 * w + 0]).toBeCloseTo(0.2, 5);
    expect(linear.out[5 * w + 5]).toBeCloseTo(0.5, 5);
    expect(linear.out[5 * w + 10]).toBeCloseTo(0.8, 5);

    const radial = applyGradientFloat32({
      working: src,
      width: w,
      height: h,
      kind: 'radial',
      p0: { x: 5, y: 5 },
      p1: { x: 10, y: 5 },
      startValue: 1,
      endValue: 0,
    });
    expect(radial.out[5 * w + 5]).toBeCloseTo(1, 5);
    expect(radial.out[5 * w + 10]).toBeCloseTo(0, 5);
    expect(radial.out[2 * w + 5]).toBeCloseTo(0.4, 5);
  });

  it('applies RGBA8 gradient and restricts to selection when onlyInSelection is enabled', () => {
    const w = 11;
    const h = 4;
    const rgba = new Uint8ClampedArray(w * h * 4);
    for (let i = 0; i < w * h; i++) {
      rgba[i * 4] = 10;
      rgba[i * 4 + 1] = 20;
      rgba[i * 4 + 2] = 30;
      rgba[i * 4 + 3] = 255;
    }

    const mask = new Uint8Array(w * h);
    for (let y = 0; y < h; y++) {
      for (let x = 2; x <= 8; x++) {
        mask[y * w + x] = 255;
      }
    }

    const res = applyGradientRgba8({
      working: rgba,
      width: w,
      height: h,
      kind: 'linear',
      p0: { x: 0, y: 0 },
      p1: { x: 10, y: 0 },
      startRgb: [0, 100, 200],
      endRgb: [200, 100, 0],
      mask,
      selectionMode: 'protect',
      onlyInSelection: true,
    });

    expect(res.dirtyRect).toEqual({ x: 2, y: 0, w: 7, h: 4 });
    // Unselected pixels stay untouched
    expect(res.out[0]).toBe(10);
    expect(res.out[1]).toBe(20);
    expect(res.out[2]).toBe(30);
    // Midpoint x=5 inside selection gets midpoint RGB [100, 100, 100]
    const mid = (0 * w + 5) * 4;
    expect(res.out[mid]).toBe(100);
    expect(res.out[mid + 1]).toBe(100);
    expect(res.out[mid + 2]).toBe(100);
  });
});
