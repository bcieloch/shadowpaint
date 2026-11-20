import { describe, expect, it } from 'vitest';
import {
  colorSpecToHex,
  hexToRgb01,
  kelvinToRgb01,
  linearToSrgbChannel,
  rgb01ToHex,
  srgbToLinearChannel,
} from '@/core/units/colorTemperature';

describe('colorTemperature', () => {
  it('returns near-white for 6500K', () => {
    const rgb = kelvinToRgb01(6500);
    expect(rgb.r).toBeCloseTo(1, 1);
    expect(rgb.g).toBeGreaterThan(0.95);
    expect(rgb.b).toBeGreaterThan(0.95);
  });

  it('returns warm tint for low kelvin and cool tint for high kelvin', () => {
    const warm = kelvinToRgb01(2500);
    const cool = kelvinToRgb01(10000);
    expect(warm.r).toBeGreaterThan(warm.b);
    expect(cool.b).toBeGreaterThanOrEqual(cool.r);
  });

  it('round-trips hex and rgb01 and sRGB/linear channels', () => {
    const rgb = hexToRgb01('#38BDF8');
    expect(rgb01ToHex(rgb)).toBe('#38bdf8');
    expect(colorSpecToHex({ mode: 'rgb', kelvin: 4000, rgb: '#F59E0B' })).toBe('#f59e0b');

    const linear = srgbToLinearChannel(0.5);
    expect(linearToSrgbChannel(linear)).toBeCloseTo(0.5, 5);
  });
});
