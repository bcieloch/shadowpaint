import { describe, expect, it } from 'vitest';
import { computeRulerStepCm, formatGridCmLabel, generateGridLines } from '@/core/units/grid';

describe('grid unit helpers', () => {
  it('generates 11 vertical lines at x = k * 5 * pxPerCm on a 50 cm canvas with 5 cm spacing', () => {
    const pxPerCm = 60;
    const result = generateGridLines(
      {
        widthCm: 50,
        heightCm: 70,
        widthPx: 50 * pxPerCm,
        heightPx: 70 * pxPerCm,
      },
      {
        spacingCm: 5,
        subdivisions: 1,
        labels: true,
      },
    );

    expect(result.vertical).toHaveLength(11);
    for (let k = 0; k <= 10; k++) {
      const line = result.vertical[k];
      expect(line).toBeDefined();
      expect(line?.isMajor).toBe(true);
      expect(line?.positionCm).toBeCloseTo(k * 5, 6);
      expect(line?.positionPx).toBeCloseTo(k * 5 * pxPerCm, 6);
      expect(line?.label).toBe(String(k * 5));
    }

    expect(result.horizontal).toHaveLength(15);
    expect(result.horizontal[14]?.positionCm).toBeCloseTo(70, 6);
    expect(result.horizontal[14]?.positionPx).toBeCloseTo(70 * pxPerCm, 6);
  });

  it('generates major and minor subdivision lines cleanly', () => {
    const result = generateGridLines(
      {
        widthCm: 10,
        heightCm: 10,
        widthPx: 1000,
        heightPx: 1000,
      },
      {
        spacingCm: 5,
        subdivisions: 5,
        labels: true,
      },
    );

    expect(result.vertical).toHaveLength(11);
    const majors = result.vertical.filter((l) => l.isMajor);
    const minors = result.vertical.filter((l) => !l.isMajor);
    expect(majors.map((m) => m.positionCm)).toEqual([0, 5, 10]);
    expect(majors.map((m) => m.label)).toEqual(['0', '5', '10']);
    expect(minors).toHaveLength(8);
    expect(minors.every((m) => m.label === undefined)).toBe(true);
  });

  it('omits labels when labels=false and formats decimal cm labels cleanly', () => {
    expect(formatGridCmLabel(0)).toBe('0');
    expect(formatGridCmLabel(2.5)).toBe('2.5');
    expect(formatGridCmLabel(10)).toBe('10');

    const result = generateGridLines(
      { widthCm: 5, heightCm: 5, widthPx: 500, heightPx: 500 },
      { spacingCm: 2.5, subdivisions: 1, labels: false },
    );
    expect(result.vertical.map((v) => v.positionCm)).toEqual([0, 2.5, 5]);
    expect(result.vertical.every((v) => v.label === undefined)).toBe(true);
  });

  it('computes adaptive ruler steps across zoom levels', () => {
    const zoomedOut = computeRulerStepCm(0.15, 60);
    expect(zoomedOut.majorCm).toBeGreaterThanOrEqual(5);

    const zoomedIn = computeRulerStepCm(4, 60);
    expect(zoomedIn.majorCm).toBeLessThanOrEqual(0.5);
    expect(zoomedIn.minorDivisions).toBeGreaterThanOrEqual(1);
  });
});
