import { describe, expect, it } from 'vitest';
import {
  bilinearSampleFloat,
  crossSectionToCsv,
  interpolateCrossSectionSample,
  sampleCrossSection,
} from '@/core/geometry/crossSection';

describe('crossSection geometry sampling', () => {
  it('performs exact bilinear interpolation inside a Float32Array', () => {
    const data = new Float32Array([0, 1, 0.5, 0.5]); // 2x2
    expect(bilinearSampleFloat(data, 2, 2, 0, 0)).toBeCloseTo(0, 6);
    expect(bilinearSampleFloat(data, 2, 2, 1, 0)).toBeCloseTo(1, 6);
    expect(bilinearSampleFloat(data, 2, 2, 0.5, 0)).toBeCloseTo(0.5, 6);
    expect(bilinearSampleFloat(data, 2, 2, 0.5, 1)).toBeCloseTo(0.5, 6);
    expect(bilinearSampleFloat(data, 2, 2, 0.25, 0.5)).toBeCloseTo(0.375, 6);
    // Clamps cleanly out of bounds
    expect(bilinearSampleFloat(data, 2, 2, -5, -2)).toBeCloseTo(0, 6);
    expect(bilinearSampleFloat(data, 2, 2, 10, 0)).toBeCloseTo(1, 6);
  });

  it('samples linear height ramp into exact linear thickness mm and opacity transmission %', () => {
    const widthPx = 101;
    const heightPx = 20;
    const height = new Float32Array(widthPx * heightPx);
    const opacity = new Float32Array(widthPx * heightPx);

    for (let y = 0; y < heightPx; y++) {
      for (let x = 0; x < widthPx; x++) {
        const ramp = x / (widthPx - 1);
        height[y * widthPx + x] = ramp;
        opacity[y * widthPx + x] = 1 - ramp * 0.5; // 100% -> 50%
      }
    }

    const profile = sampleCrossSection(
      { p0: { x: 0, y: 10 }, p1: { x: 100, y: 10 } },
      height,
      opacity,
      {
        widthCm: 10.1,
        heightCm: 2,
        widthPx,
        heightPx,
        minThicknessMm: 0,
        maxThicknessMm: 5,
      },
    );

    expect(profile.sampleCount).toBe(100);
    expect(profile.totalLengthCm).toBeCloseTo(10, 4);
    expect(profile.thicknessMm[0]).toBeCloseTo(0, 5);
    expect(profile.thicknessMm[profile.sampleCount - 1]).toBeCloseTo(5, 5);
    expect(profile.stats.minMm).toBeCloseTo(0, 5);
    expect(profile.stats.maxMm).toBeCloseTo(5, 5);
    expect(profile.stats.meanMm).toBeCloseTo(2.5, 4);

    expect(profile.transmissionPct[0]).toBeCloseTo(100, 4);
    expect(profile.transmissionPct[profile.sampleCount - 1]).toBeCloseTo(50, 4);

    // Every sample matches linear relation mm = t * 5
    for (let i = 0; i < profile.sampleCount; i++) {
      const t = i / (profile.sampleCount - 1);
      expect(profile.thicknessMm[i]).toBeCloseTo(t * 5, 4);
      expect(profile.distanceCm[i]).toBeCloseTo(t * 10, 4);
    }
  });

  it('computes calibrated diagonal 3-4-5 cm length and interpolates hover samples', () => {
    const widthPx = 600;
    const heightPx = 600;
    const height = new Float32Array(widthPx * heightPx).fill(0.4); // 2.0 mm in 0..5 range
    const opacity = new Float32Array(widthPx * heightPx).fill(0.75); // 75 %

    const profile = sampleCrossSection(
      { p0: { x: 60, y: 60 }, p1: { x: 240, y: 300 } }, // dx=180px=3cm, dy=240px=4cm -> 5cm
      height,
      opacity,
      {
        widthCm: 10,
        heightCm: 10,
        widthPx,
        heightPx,
        minThicknessMm: 0,
        maxThicknessMm: 5,
      },
    );

    expect(profile.totalLengthCm).toBeCloseTo(5, 6);
    expect(profile.sampleCount).toBe(300);

    const mid = interpolateCrossSectionSample(profile, 0.5);
    expect(mid.distanceCm).toBeCloseTo(2.5, 5);
    expect(mid.xPx).toBeCloseTo(150, 4);
    expect(mid.yPx).toBeCloseTo(180, 4);
    expect(mid.thicknessMm).toBeCloseTo(2.0, 5);
    expect(mid.transmissionPct).toBeCloseTo(75, 4);
  });

  it('formats valid CSV output with distance_cm, thickness_mm, transmission_pct columns', () => {
    const height = new Float32Array([0, 1]);
    const opacity = new Float32Array([0.25, 0.75]);
    const profile = sampleCrossSection(
      { p0: { x: 0, y: 0 }, p1: { x: 1, y: 0 } },
      height,
      opacity,
      {
        widthCm: 2,
        heightCm: 1,
        widthPx: 2,
        heightPx: 1,
        minThicknessMm: 1,
        maxThicknessMm: 5,
      },
    );

    const csv = crossSectionToCsv(profile);
    const rows = csv.trim().split('\n');
    expect(rows[0]).toBe('distance_cm,thickness_mm,transmission_pct');
    expect(rows).toHaveLength(3);
    expect(rows[1]).toBe('0.0000,1.0000,25.00');
    expect(rows[2]).toBe('1.0000,5.0000,75.00');
  });
});
