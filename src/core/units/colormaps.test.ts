import { describe, expect, it } from 'vitest';
import {
  buildHeightCssGradient,
  computeNiceScaleTicks,
  sampleTopoRgb01,
  sampleTurboRgb01,
} from '@/core/units/colormaps';

describe('colormaps', () => {
  it('samples Turbo and Topo within [0, 1] range', () => {
    for (let i = 0; i <= 20; i++) {
      const t = i / 20;
      const turbo = sampleTurboRgb01(t);
      const topo = sampleTopoRgb01(t);
      for (const c of [turbo.r, turbo.g, turbo.b, topo.r, topo.g, topo.b]) {
        expect(c).toBeGreaterThanOrEqual(0);
        expect(c).toBeLessThanOrEqual(1);
      }
    }
  });

  it('generates CSS gradients for gray, heat, and topo', () => {
    expect(buildHeightCssGradient('gray')).toContain('linear-gradient(');
    expect(buildHeightCssGradient('heat')).toContain('linear-gradient(');
    expect(buildHeightCssGradient('topo')).toContain('linear-gradient(');
  });

  it('computes monotonic scale ticks including endpoints', () => {
    const ticks = computeNiceScaleTicks(0, 5, 6);
    expect(ticks[0]).toBe(0);
    expect(ticks[ticks.length - 1]).toBe(5);
    for (let i = 1; i < ticks.length; i++) {
      expect(ticks[i] ?? 0).toBeGreaterThan(ticks[i - 1] ?? -1);
    }
  });
});
