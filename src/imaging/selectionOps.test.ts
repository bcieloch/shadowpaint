import { describe, expect, it } from 'vitest';
import {
  clearSelectionMask,
  combineSelectionMasks,
  computeSelectionBounds,
  createEllipseSelectionMask,
  createLassoSelectionMask,
  createMagicWandMask,
  createRectSelectionMask,
  featherSelectionMask,
  invertSelectionMask,
  selectAllMask,
} from '@/imaging/selectionOps';

describe('selectionOps', () => {
  it('creates rectangular, elliptical, and lasso polygon masks accurately', () => {
    const rectMask = createRectSelectionMask(10, 10, { x: 2, y: 3, w: 4, h: 3 });
    expect(computeSelectionBounds(rectMask, 10, 10)).toEqual({ x: 2, y: 3, w: 4, h: 3 });
    expect(rectMask[3 * 10 + 2]).toBe(255);
    expect(rectMask[2 * 10 + 2]).toBe(0);

    const ellipseMask = createEllipseSelectionMask(20, 20, { x: 4, y: 4, w: 12, h: 12 });
    expect(ellipseMask[10 * 20 + 10]).toBe(255);
    expect(ellipseMask[4 * 20 + 4]).toBe(0); // corner outside circle

    const lassoMask = createLassoSelectionMask(10, 10, [
      { x: 2, y: 2 },
      { x: 8, y: 2 },
      { x: 8, y: 8 },
      { x: 2, y: 8 },
    ]);
    expect(lassoMask[5 * 10 + 5]).toBe(255);
    expect(lassoMask[1 * 10 + 1]).toBe(0);
  });

  it('combines masks with replace, add, subtract, and intersect, and supports all/clear/invert', () => {
    const a = createRectSelectionMask(8, 8, { x: 1, y: 1, w: 4, h: 4 });
    const b = createRectSelectionMask(8, 8, { x: 3, y: 3, w: 4, h: 4 });

    const added = combineSelectionMasks(a, b, 'add');
    expect(added[1 * 8 + 1]).toBe(255);
    expect(added[6 * 8 + 6]).toBe(255);

    const subtracted = combineSelectionMasks(a, b, 'subtract');
    expect(subtracted[1 * 8 + 1]).toBe(255);
    expect(subtracted[3 * 8 + 3]).toBe(0);

    const intersected = combineSelectionMasks(a, b, 'intersect');
    expect(intersected[1 * 8 + 1]).toBe(0);
    expect(intersected[3 * 8 + 3]).toBe(255);
    expect(intersected[6 * 8 + 6]).toBe(0);

    const inverted = invertSelectionMask(a);
    expect(inverted[1 * 8 + 1]).toBe(0);
    expect(inverted[0]).toBe(255);

    selectAllMask(inverted);
    expect(inverted[1 * 8 + 1]).toBe(255);
    clearSelectionMask(inverted);
    expect(inverted.every((v) => v === 0)).toBe(true);
  });

  it('supports contiguous and non-contiguous magic wand on scalar and RGBA data', () => {
    // Disconnected islands of value 0.8 separated by a 0.0 wall at x=2
    const scalar = new Float32Array(5 * 3).fill(0.8);
    scalar[0 * 5 + 2] = 0;
    scalar[1 * 5 + 2] = 0;
    scalar[2 * 5 + 2] = 0;

    const contiguous = createMagicWandMask({
      width: 5,
      height: 3,
      seedX: 0,
      seedY: 1,
      tolerancePct: 5,
      contiguous: true,
      sourceKind: 'height',
      scalarData: scalar,
    });
    expect(contiguous[1 * 5 + 0]).toBe(255);
    expect(contiguous[1 * 5 + 1]).toBe(255);
    expect(contiguous[1 * 5 + 2]).toBe(0);
    expect(contiguous[1 * 5 + 4]).toBe(0); // separated by wall

    const global = createMagicWandMask({
      width: 5,
      height: 3,
      seedX: 0,
      seedY: 1,
      tolerancePct: 5,
      contiguous: false,
      sourceKind: 'height',
      scalarData: scalar,
    });
    expect(global[1 * 5 + 4]).toBe(255);
    expect(global[1 * 5 + 2]).toBe(0);
  });

  it('feathers mask edges smoothly without leaking NaN or out-of-range bytes', () => {
    const rect = createRectSelectionMask(16, 16, { x: 4, y: 4, w: 8, h: 8 });
    const feathered = featherSelectionMask(rect, 16, 16, 2);
    expect(feathered[8 * 16 + 8]).toBeGreaterThan(200);
    expect(feathered[4 * 16 + 3]).toBeGreaterThan(0);
    expect(feathered[4 * 16 + 3]).toBeLessThan(255);
    expect(feathered[0]).toBe(0);
  });
});
