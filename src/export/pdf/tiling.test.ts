import { describe, expect, it } from 'vitest';
import {
  columnIndexToLetters,
  computeGridDivisions,
  computeTiles1to1Layout,
  formatTileId,
} from '@/export/pdf/tiling';

describe('PDF reference grid & 1:1 tiling geometry', () => {
  it('generates Excel-style column letters and tile IDs', () => {
    expect(columnIndexToLetters(0)).toBe('A');
    expect(columnIndexToLetters(25)).toBe('Z');
    expect(columnIndexToLetters(26)).toBe('AA');
    expect(formatTileId(0, 0)).toBe('A1');
    expect(formatTileId(2, 3)).toBe('C4');
  });

  it('computes grid divisions every spacingCm cleanly', () => {
    const cols = computeGridDivisions(50, 5, 'col');
    expect(cols).toHaveLength(10);
    expect(cols[0]).toEqual({ index: 0, label: 'A', startCm: 0, endCm: 5 });
    expect(cols[9]).toEqual({ index: 9, label: 'J', startCm: 45, endCm: 50 });

    const rows = computeGridDivisions(72, 10, 'row');
    expect(rows).toHaveLength(8);
    expect(rows[7]).toEqual({ index: 7, label: '8', startCm: 70, endCm: 72 });
  });

  it('slices 50x70 cm canvas into 1:1 physical tiles with 10 mm overlap and full pixel coverage', () => {
    const tiles = computeTiles1to1Layout({
      widthCm: 50,
      heightCm: 70,
      widthPx: 3000,
      heightPx: 4200,
      slotWmm: 260,
      slotHmm: 150,
      overlapMm: 10,
    });

    // 500 mm wide with step 250 mm -> 2 columns: [0..260] and [250..500]
    const cols = new Set(tiles.map((t) => t.col));
    expect(cols.size).toBe(2);

    const a1 = tiles.find((t) => t.id === 'A1');
    const b1 = tiles.find((t) => t.id === 'B1');
    expect(a1).toBeDefined();
    expect(b1).toBeDefined();
    expect(a1?.tileWmm).toBeCloseTo(260, 4);
    expect(a1?.overlapLeftMm).toBe(0);
    expect(a1?.overlapRightMm).toBe(10);
    expect(b1?.x0Mm).toBe(250);
    expect(b1?.tileWmm).toBeCloseTo(250, 4);
    expect(b1?.overlapLeftMm).toBe(10);
    expect(b1?.overlapRightMm).toBe(0);

    // Full width and height covered without gaps
    const maxRight = Math.max(...tiles.map((t) => t.x0Mm + t.tileWmm));
    const maxBottom = Math.max(...tiles.map((t) => t.y0Mm + t.tileHmm));
    expect(maxRight).toBeCloseTo(500, 4);
    expect(maxBottom).toBeCloseTo(700, 4);
  });

  it('returns single 1:1 tile when canvas fits within one printable sheet', () => {
    const tiles = computeTiles1to1Layout({
      widthCm: 20,
      heightCm: 14,
      widthPx: 400,
      heightPx: 280,
      slotWmm: 260,
      slotHmm: 150,
      overlapMm: 10,
    });
    expect(tiles).toHaveLength(1);
    expect(tiles[0]?.id).toBe('A1');
    expect(tiles[0]?.tileWmm).toBe(200);
    expect(tiles[0]?.tileHmm).toBe(140);
    expect(tiles[0]?.srcW).toBe(400);
    expect(tiles[0]?.srcH).toBe(280);
  });
});
