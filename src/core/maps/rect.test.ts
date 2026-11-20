import { describe, expect, it } from 'vitest';
import { floatToUint16, floatToUint8, uint16ToFloat, uint8ToFloat } from '@/core/maps/quantize';
import { clampRect, expandRect, intersectRect, isEmptyRect, unionRect } from '@/core/maps/rect';

describe('rect and quantize', () => {
  it('clamps, intersects, unions, and expands rects', () => {
    expect(clampRect({ x: -5, y: 2, w: 20, h: 30 }, 10, 20)).toEqual({ x: 0, y: 2, w: 10, h: 18 });
    expect(intersectRect({ x: 0, y: 0, w: 10, h: 10 }, { x: 5, y: 5, w: 10, h: 10 })).toEqual({
      x: 5,
      y: 5,
      w: 5,
      h: 5,
    });
    expect(unionRect({ x: 2, y: 3, w: 4, h: 5 }, { x: 0, y: 0, w: 0, h: 0 })).toEqual({
      x: 2,
      y: 3,
      w: 4,
      h: 5,
    });
    expect(expandRect({ x: 5, y: 5, w: 10, h: 10 }, 2)).toEqual({ x: 3, y: 3, w: 14, h: 14 });
    expect(isEmptyRect({ x: 0, y: 0, w: 0, h: 5 })).toBe(true);
  });

  it('quantizes floats to uint8 and uint16 with clamping', () => {
    expect(floatToUint8(-0.2)).toBe(0);
    expect(floatToUint8(0.5)).toBe(128);
    expect(floatToUint8(1.5)).toBe(255);
    expect(uint8ToFloat(255)).toBe(1);

    expect(floatToUint16(1)).toBe(65535);
    expect(uint16ToFloat(65535)).toBe(1);
  });
});
