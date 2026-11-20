import { describe, expect, it } from 'vitest';
import { splitRowStripes } from '@/core/maps/stripes';

describe('splitRowStripes', () => {
  it('returns empty array for zero height', () => {
    expect(splitRowStripes(0, 4)).toEqual([]);
  });

  it('partitions 4200 rows evenly across 4 workers with zero gaps or overlaps', () => {
    const stripes = splitRowStripes(4200, 4);
    expect(stripes).toHaveLength(4);
    expect(stripes.map((s) => s.rows)).toEqual([1050, 1050, 1050, 1050]);
    expect(stripes[0]?.yStart).toBe(0);
    expect(stripes[3]?.yEnd).toBe(4200);
    for (let i = 1; i < stripes.length; i++) {
      expect(stripes[i]?.yStart).toBe(stripes[i - 1]?.yEnd);
    }
  });

  it('distributes remainder rows evenly and respects minRowsPerStripe', () => {
    const rem = splitRowStripes(1000, 3, 100);
    expect(rem.map((s) => s.rows)).toEqual([334, 333, 333]);

    const tiny = splitRowStripes(96, 8, 64);
    expect(tiny).toHaveLength(2);
    expect(tiny.reduce((acc, s) => acc + s.rows, 0)).toBe(96);
  });
});
