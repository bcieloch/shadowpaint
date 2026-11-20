import { describe, expect, it } from 'vitest';
import {
  gaussianBlurFloat32,
  gaussianBlurRegionFloat32,
  gaussianBlurRegionRgba8,
} from '@/imaging/blur';
import { laplaceSmoothFloat32Region, laplaceSmoothRgba8Region } from '@/imaging/smooth';

describe('smooth and region blur imaging ops', () => {
  it('laplaceSmoothFloat32Region preserves constant fields and reduces spikes monotonically', () => {
    const w = 16;
    const h = 16;
    const flat = new Float32Array(w * h).fill(0.42);
    const smoothedFlat = laplaceSmoothFloat32Region(flat, w, h, { x: 2, y: 2, w: 8, h: 8 }, 5);
    for (const v of smoothedFlat) {
      expect(v).toBeCloseTo(0.42, 5);
    }

    const spike = new Float32Array(w * h);
    spike[8 * w + 8] = 1;
    const s1 = laplaceSmoothFloat32Region(spike, w, h, { x: 4, y: 4, w: 9, h: 9 }, 1);
    const s4 = laplaceSmoothFloat32Region(spike, w, h, { x: 4, y: 4, w: 9, h: 9 }, 4);
    const centerIdx = 4 * 9 + 4;
    expect(s1[centerIdx]).toBeCloseTo(0.5, 5);
    expect(s4[centerIdx] ?? 1).toBeLessThan(s1[centerIdx] ?? 0);
    expect(s4[centerIdx] ?? 0).toBeGreaterThan(0);
    // Neighbor receives diffused energy
    expect(s1[4 * 9 + 5]).toBeCloseTo(0.125, 5);
  });

  it('laplaceSmoothRgba8Region smooths RGB channels while preserving alpha', () => {
    const w = 12;
    const h = 12;
    const rgba = new Uint8ClampedArray(w * h * 4);
    for (let i = 0; i < w * h; i++) {
      rgba[i * 4] = 20;
      rgba[i * 4 + 1] = 20;
      rgba[i * 4 + 2] = 20;
      rgba[i * 4 + 3] = 255;
    }
    const spikeIdx = (6 * w + 6) * 4;
    rgba[spikeIdx] = 220;
    rgba[spikeIdx + 1] = 120;
    rgba[spikeIdx + 2] = 20;

    const out = laplaceSmoothRgba8Region(rgba, w, h, { x: 4, y: 4, w: 5, h: 5 }, 2);
    const outCenter = (2 * 5 + 2) * 4;
    expect(out[outCenter] ?? 255).toBeLessThan(220);
    expect(out[outCenter] ?? 0).toBeGreaterThan(20);
    expect(out[outCenter + 1] ?? 255).toBeLessThan(120);
    expect(out[outCenter + 3]).toBe(255);
  });

  it('gaussianBlurRegionFloat32 matches full gaussianBlurFloat32 in the interior region', () => {
    const w = 32;
    const h = 32;
    const src = new Float32Array(w * h);
    for (let y = 0; y < h; y++) {
      for (let x = 0; x < w; x++) {
        src[y * w + x] = x >= 12 && x <= 19 && y >= 12 && y <= 19 ? 1 : 0.1;
      }
    }

    const rect = { x: 10, y: 10, w: 12, h: 12 };
    const full = gaussianBlurFloat32(src, w, h, 3);
    const region = gaussianBlurRegionFloat32(src, w, h, rect, 3);

    for (let y = 0; y < rect.h; y++) {
      for (let x = 0; x < rect.w; x++) {
        const fVal = full[(rect.y + y) * w + (rect.x + x)] ?? 0;
        const rVal = region[y * rect.w + x] ?? 0;
        expect(Math.abs(fVal - rVal)).toBeLessThan(1e-5);
      }
    }
  });

  it('gaussianBlurRegionRgba8 blends RGB step edges and preserves alpha', () => {
    const w = 24;
    const h = 24;
    const src = new Uint8ClampedArray(w * h * 4);
    for (let y = 0; y < h; y++) {
      for (let x = 0; x < w; x++) {
        const i = (y * w + x) * 4;
        src[i] = x < 12 ? 0 : 240;
        src[i + 1] = 60;
        src[i + 2] = 120;
        src[i + 3] = 255;
      }
    }
    const out = gaussianBlurRegionRgba8(src, w, h, { x: 8, y: 8, w: 8, h: 8 }, 3);
    // Seam around x=11..12 (local x=3..4) should be blurred between 0 and 240
    const leftEdge = (4 * 8 + 3) * 4;
    const rightEdge = (4 * 8 + 4) * 4;
    expect(out[leftEdge] ?? 0).toBeGreaterThan(20);
    expect(out[rightEdge] ?? 255).toBeLessThan(220);
    expect(out[leftEdge + 3]).toBe(255);
  });
});
