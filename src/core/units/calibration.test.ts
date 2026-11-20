import { describe, expect, it } from 'vitest';
import { DEFAULT_CANVAS } from '@/core/constants';
import {
  brushSizeToPx,
  cmToPx,
  cmToWorldXY,
  computeDisplacementParams,
  computeHeightFromWidthPx,
  computeMeshSegments,
  getCalibrationMetrics,
  level8ToMm,
  mmToLevel8,
  mmToValue,
  pxToCm,
  pxToWorldXY,
  validateCanvasSettings,
  valueToMm,
  valueToWorldZCm,
  worldXYToCm,
  worldXYToPx,
} from '@/core/units/calibration';

describe('calibration', () => {
  it('computes pxPerCm and DPI for 50x70 cm at 3000x4200 px', () => {
    const metrics = getCalibrationMetrics(DEFAULT_CANVAS);
    expect(metrics.pxPerCmX).toBe(60);
    expect(metrics.pxPerCmY).toBe(60);
    expect(metrics.pxPerCm).toBe(60);
    expect(metrics.dpi).toBeCloseTo(152.4, 5);
    expect(metrics.isAspectConsistent).toBe(true);
  });

  it('converts 8-bit height levels and normalized values to mm accurately for 0-5 mm', () => {
    expect(level8ToMm(0, 0, 5)).toBe(0);
    expect(level8ToMm(64, 0, 5)).toBeCloseTo(1.2549, 4);
    expect(level8ToMm(128, 0, 5)).toBeCloseTo(2.5098, 4);
    expect(level8ToMm(191, 0, 5)).toBeCloseTo(3.7451, 4);
    expect(level8ToMm(255, 0, 5)).toBe(5);

    expect(valueToMm(0, 0, 5)).toBe(0);
    expect(valueToMm(0.25, 0, 5)).toBe(1.25);
    expect(valueToMm(0.5, 0, 5)).toBe(2.5);
    expect(valueToMm(0.75, 0, 5)).toBe(3.75);
    expect(valueToMm(1, 0, 5)).toBe(5);

    expect(mmToValue(2.5, 0, 5)).toBeCloseTo(0.5, 6);
    expect(mmToLevel8(5, 0, 5)).toBe(255);
  });

  it('round-trips px <-> cm <-> world coordinates', () => {
    const cm = pxToCm(1500, 2100, DEFAULT_CANVAS);
    expect(cm).toEqual({ x: 25, y: 35 });
    expect(cmToPx(cm.x, cm.y, DEFAULT_CANVAS)).toEqual({ x: 1500, y: 2100 });

    const centerWorld = pxToWorldXY(1500, 2100, DEFAULT_CANVAS);
    expect(centerWorld).toEqual({ x: 0, y: 0 });
    expect(worldXYToPx(0, 0, DEFAULT_CANVAS)).toEqual({ x: 1500, y: 2100 });

    const topLeftWorld = cmToWorldXY(0, 0, DEFAULT_CANVAS);
    expect(topLeftWorld).toEqual({ x: -25, y: 35 });
    expect(worldXYToCm(topLeftWorld.x, topLeftWorld.y, DEFAULT_CANVAS)).toEqual({ x: 0, y: 0 });
  });

  it('computes world Z displacement in cm and displacement scale/bias with relief multiplier', () => {
    expect(valueToWorldZCm(1, 0, 5, 1)).toBeCloseTo(0.5, 6);
    expect(valueToWorldZCm(1, 0, 5, 4)).toBeCloseTo(2.0, 6);

    const d0 = computeDisplacementParams(0, 5, 1);
    expect(d0.displacementScale).toBeCloseTo(0.5, 6);
    expect(d0.displacementBias).toBeCloseTo(0, 6);
    expect(d0.maxDisplacementCm).toBeCloseTo(0.5, 6);

    const d1 = computeDisplacementParams(1, 5, 3);
    expect(d1.displacementBias).toBeCloseTo(0.3, 6);
    expect(d1.displacementScale).toBeCloseTo(1.2, 6);
    expect(d1.minDisplacementCm).toBeCloseTo(0.3, 6);
    expect(d1.maxDisplacementCm).toBeCloseTo(1.5, 6);
  });

  it('converts brush size between px and cm', () => {
    expect(brushSizeToPx(2, 'cm', 60)).toBe(120);
    expect(brushSizeToPx(45, 'px', 60)).toBe(45);
  });

  it('computes proportional mesh segments and vertex count for 3D LOD', () => {
    const portrait = computeMeshSegments(50, 70, 1024);
    expect(portrait.segY).toBe(1024);
    expect(portrait.segX).toBe(Math.round(1024 * (50 / 70)));
    expect(portrait.vertices).toBe((portrait.segX + 1) * (portrait.segY + 1));

    const landscape = computeMeshSegments(80, 40, 512);
    expect(landscape.segX).toBe(512);
    expect(landscape.segY).toBe(256);
    expect(landscape.vertices).toBe(513 * 257);
  });

  it('validates canvas settings and aspect ratio consistency', () => {
    expect(validateCanvasSettings(DEFAULT_CANVAS)).toEqual([]);
    expect(computeHeightFromWidthPx(3000, 50, 70)).toBe(4200);

    const mismatched = { ...DEFAULT_CANVAS, heightPx: 3000 };
    expect(validateCanvasSettings(mismatched)).toContain('aspectMismatch');

    const badThickness = { ...DEFAULT_CANVAS, minThicknessMm: 5, maxThicknessMm: 2 };
    expect(validateCanvasSettings(badThickness)).toContain('invalidThicknessRange');
  });
});
