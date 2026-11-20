import { describe, expect, it } from 'vitest';
import {
  applyFloodFillFloat32,
  applyFloodFillRgba8,
  applySelectionFillFloat32,
} from '@/imaging/floodFill';

describe('floodFill imaging ops', () => {
  it('supports tolerance 0 vs 100 and contiguous vs global fill on Float32 maps', () => {
    const w = 10;
    const h = 10;
    // Two separate regions of 0.2 separated by a vertical wall of 0.9 at x=4, plus a region of 0.3
    const src = new Float32Array(w * h);
    for (let y = 0; y < h; y++) {
      for (let x = 0; x < w; x++) {
        if (x === 4) {
          src[y * w + x] = 0.9;
        } else if (x >= 7 && y >= 5) {
          src[y * w + x] = 0.3;
        } else {
          src[y * w + x] = 0.2;
        }
      }
    }

    // 1. Tolerance 0, contiguous at (1, 1): fills left side x=0..3, not wall x=4 or right side x=5..9
    const c0 = applyFloodFillFloat32({
      working: src,
      width: w,
      height: h,
      seedX: 1,
      seedY: 1,
      tolerancePct: 0,
      contiguous: true,
      targetValue: 0.7,
    });
    expect(c0.dirtyRect).toEqual({ x: 0, y: 0, w: 4, h: 10 });
    expect(c0.out[1 * w + 1]).toBeCloseTo(0.7, 5);
    expect(c0.out[1 * w + 4]).toBeCloseTo(0.9, 5);
    expect(c0.out[1 * w + 6]).toBeCloseTo(0.2, 5);

    // 2. Tolerance 0, global (non-contiguous) at (1, 1): fills both 0.2 regions, keeps 0.9 wall and 0.3 island
    const g0 = applyFloodFillFloat32({
      working: src,
      width: w,
      height: h,
      seedX: 1,
      seedY: 1,
      tolerancePct: 0,
      contiguous: false,
      targetValue: 0.7,
    });
    expect(g0.out[1 * w + 1]).toBeCloseTo(0.7, 5);
    expect(g0.out[1 * w + 6]).toBeCloseTo(0.7, 5);
    expect(g0.out[1 * w + 4]).toBeCloseTo(0.9, 5);
    expect(g0.out[6 * w + 8]).toBeCloseTo(0.3, 5);

    // 3. Tolerance 100, contiguous at (1, 1): floods across wall x=4 as well
    const c100 = applyFloodFillFloat32({
      working: src,
      width: w,
      height: h,
      seedX: 1,
      seedY: 1,
      tolerancePct: 100,
      contiguous: true,
      targetValue: 0.5,
    });
    expect(c100.dirtyRect).toEqual({ x: 0, y: 0, w: 10, h: 10 });
    expect(c100.out[1 * w + 4]).toBeCloseTo(0.5, 5);
    expect(c100.out[6 * w + 8]).toBeCloseTo(0.5, 5);
  });

  it('respects selection mask on RGBA8 floodFill and fills selection directly', () => {
    const w = 8;
    const h = 8;
    const rgba = new Uint8ClampedArray(w * h * 4);
    for (let i = 0; i < w * h; i++) {
      rgba[i * 4] = 40;
      rgba[i * 4 + 1] = 40;
      rgba[i * 4 + 2] = 40;
      rgba[i * 4 + 3] = 255;
    }

    const mask = new Uint8Array(w * h);
    for (let y = 0; y < h; y++) {
      for (let x = 0; x < 4; x++) {
        mask[y * w + x] = 255;
      }
    }

    // Protect mode: x < 4 is protected, clicking at (6, 4) fills only x >= 4
    const res = applyFloodFillRgba8({
      working: rgba,
      width: w,
      height: h,
      seedX: 6,
      seedY: 4,
      tolerancePct: 10,
      contiguous: true,
      targetRgb: [200, 100, 50],
      mask,
      selectionMode: 'protect',
    });
    expect(res.dirtyRect).toEqual({ x: 4, y: 0, w: 4, h: 8 });
    expect(res.out[(4 * w + 1) * 4]).toBe(40);
    expect(res.out[(4 * w + 6) * 4]).toBe(200);

    // applySelectionFillFloat32 fills inside selection mask
    const fSrc = new Float32Array(w * h).fill(0.1);
    const fRes = applySelectionFillFloat32({
      working: fSrc,
      width: w,
      height: h,
      targetValue: 0.9,
      mask,
    });
    expect(fRes.dirtyRect).toEqual({ x: 0, y: 0, w: 4, h: 8 });
    expect(fRes.out[4 * w + 1]).toBeCloseTo(0.9, 5);
    expect(fRes.out[4 * w + 6]).toBeCloseTo(0.1, 5);
  });
});
