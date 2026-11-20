import { describe, expect, it } from 'vitest';
import {
  SPLIT_RATIO_MAX,
  SPLIT_RATIO_MIN,
  clampSplitRatio,
  computeSplitPanes,
  isPointInPane,
} from '@/editor2d/splitLayout';

describe('splitLayout', () => {
  it('clamps splitRatio into valid bounds and handles non-finite inputs', () => {
    expect(clampSplitRatio(0.5)).toBe(0.5);
    expect(clampSplitRatio(0.05)).toBe(SPLIT_RATIO_MIN);
    expect(clampSplitRatio(0.95)).toBe(SPLIT_RATIO_MAX);
    expect(clampSplitRatio(Number.NaN)).toBe(0.5);
    expect(clampSplitRatio(Number.POSITIVE_INFINITY)).toBe(0.5);
  });

  it('computes non-overlapping left and right panes spanning the full viewport', () => {
    const panes = computeSplitPanes(1000, 700, 0.5);
    expect(panes.dividerX).toBe(500);
    expect(panes.leftPane).toEqual({ x: 0, y: 0, width: 500, height: 700 });
    expect(panes.rightPane).toEqual({ x: 500, y: 0, width: 500, height: 700 });
    expect(panes.leftPane.width + panes.rightPane.width).toBe(1000);
  });

  it('respects minimum pane width and custom ratios', () => {
    const narrow = computeSplitPanes(400, 600, 0.2);
    expect(narrow.leftPane.width).toBe(160);
    expect(narrow.rightPane.width).toBe(240);

    const wide = computeSplitPanes(1000, 600, 0.65);
    expect(wide.dividerX).toBe(650);
    expect(wide.leftPane.width).toBe(650);
    expect(wide.rightPane.width).toBe(350);
  });

  it('determines pane hit-testing accurately at boundary dividerX', () => {
    const panes = computeSplitPanes(800, 600, 0.5);
    expect(isPointInPane(399, 100, panes.leftPane)).toBe(true);
    expect(isPointInPane(399, 100, panes.rightPane)).toBe(false);
    expect(isPointInPane(400, 100, panes.leftPane)).toBe(false);
    expect(isPointInPane(400, 100, panes.rightPane)).toBe(true);
  });
});
