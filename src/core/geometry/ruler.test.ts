import { describe, expect, it } from 'vitest';
import { measureRulerLine, snapSegment15Deg } from '@/core/geometry/ruler';

describe('ruler geometry', () => {
  it('measures a 3-4-5 cm right triangle at 60 px/cm accurately', () => {
    // 50x70 cm canvas at 3000x4200 px => 60 px/cm on both axes
    const calibration = {
      widthCm: 50,
      heightCm: 70,
      widthPx: 3000,
      heightPx: 4200,
    };
    const m = measureRulerLine(
      {
        p0: { x: 60, y: 300 }, // (1 cm, 5 cm)
        p1: { x: 240, y: 60 }, // (4 cm, 1 cm) => dx = +3 cm, dy = -4 cm
      },
      calibration,
    );

    expect(m.dxPx).toBeCloseTo(180, 6);
    expect(m.dyPx).toBeCloseTo(-240, 6);
    expect(m.lengthPx).toBeCloseTo(300, 6);
    expect(m.dxCm).toBeCloseTo(3, 6);
    expect(m.dyCm).toBeCloseTo(-4, 6);
    expect(m.lengthCm).toBeCloseTo(5, 6);
    expect(m.lengthMm).toBeCloseTo(50, 6);
    expect(m.angleDeg).toBeCloseTo((Math.atan2(4, 3) * 180) / Math.PI, 4);
  });

  it('snaps endpoint to 15-degree increments while preserving distance', () => {
    const p0 = { x: 100, y: 100 };
    // ~17 deg from p0 -> should snap to 15 deg
    const rawP1 = {
      x: 100 + Math.cos((17 * Math.PI) / 180) * 100,
      y: 100 + Math.sin((17 * Math.PI) / 180) * 100,
    };
    const snapped = snapSegment15Deg(p0, rawP1);
    const angleDeg = (Math.atan2(snapped.y - p0.y, snapped.x - p0.x) * 180) / Math.PI;
    expect(angleDeg).toBeCloseTo(15, 5);
    expect(Math.hypot(snapped.x - p0.x, snapped.y - p0.y)).toBeCloseTo(100, 5);
  });

  it('returns zero angle and zero length for coincident points', () => {
    const m = measureRulerLine(
      { p0: { x: 10, y: 20 }, p1: { x: 10, y: 20 } },
      { widthCm: 10, heightCm: 10, widthPx: 100, heightPx: 100 },
    );
    expect(m.lengthCm).toBe(0);
    expect(m.lengthPx).toBe(0);
    expect(m.angleDeg).toBe(0);
  });
});
