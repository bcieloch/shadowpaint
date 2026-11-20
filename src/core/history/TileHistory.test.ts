import { describe, expect, it } from 'vitest';
import { applyTilesHistoryEntry, TileHistoryTransaction } from '@/core/history/TileHistory';
import { MapRegistry } from '@/core/maps/MapRegistry';

function paintColorBlock(
  registry: MapRegistry,
  x0: number,
  y0: number,
  w: number,
  h: number,
  rgba: readonly [number, number, number, number],
): void {
  const width = registry.width;
  const working = registry.color.working;
  for (let y = y0; y < y0 + h; y++) {
    for (let x = x0; x < x0 + w; x++) {
      const idx = (y * width + x) * 4;
      working[idx] = rgba[0];
      working[idx + 1] = rgba[1];
      working[idx + 2] = rgba[2];
      working[idx + 3] = rgba[3];
    }
  }
}

function paintHeightBlock(
  registry: MapRegistry,
  x0: number,
  y0: number,
  w: number,
  h: number,
  value: number,
): void {
  const width = registry.width;
  const working = registry.heightMap.working;
  for (let y = y0; y < y0 + h; y++) {
    for (let x = x0; x < x0 + w; x++) {
      working[y * width + x] = value;
    }
  }
}

describe('TileHistoryTransaction', () => {
  it('captures touched 256x256 tiles across boundaries and restores byte-for-byte', () => {
    const registry = new MapRegistry();
    // 300x300 spans 2x2 tiles with partial edge tiles (44px)
    registry.allocate(300, 300, { color: '#f4f1ea', height: 0.25, opacity: 1 });

    const originalColor = new Uint8ClampedArray(registry.color.working);

    const tx = new TileHistoryTransaction(registry, 'color', 'brushStroke', 'working', 256);
    const dabRect = { x: 240, y: 240, w: 40, h: 40 };
    tx.ensureTilesForRect(dabRect);
    paintColorBlock(registry, dabRect.x, dabRect.y, dabRect.w, dabRect.h, [200, 30, 40, 255]);

    const committed = tx.commit();
    expect(committed).not.toBeNull();
    if (!committed) return;

    // Crosses (0,0), (1,0), (0,1), (1,1)
    expect(committed.tiles).toHaveLength(4);
    expect(committed.byteSize).toBeGreaterThan(0);

    const afterStrokeColor = new Uint8ClampedArray(registry.color.working);
    expect(afterStrokeColor).not.toEqual(originalColor);

    const entry = { ...committed, seq: 1 };
    applyTilesHistoryEntry(registry, entry, 'undo');
    expect(registry.color.working).toEqual(originalColor);

    applyTilesHistoryEntry(registry, entry, 'redo');
    expect(registry.color.working).toEqual(afterStrokeColor);
  });

  it('skips unchanged tiles and returns null on no-op commit', () => {
    const registry = new MapRegistry();
    registry.allocate(64, 64, { height: 0.5 });

    const tx = new TileHistoryTransaction(registry, 'height', 'brushStroke', 'working', 32);
    tx.ensureTilesForRect({ x: 0, y: 0, w: 32, h: 32 });
    // No mutation made
    expect(tx.commit()).toBeNull();
  });

  it('rollback restores working buffer on stroke cancellation', () => {
    const registry = new MapRegistry();
    registry.allocate(64, 64, { height: 0.2 });
    const before = new Float32Array(registry.heightMap.working);

    const tx = new TileHistoryTransaction(registry, 'height', 'brushStroke', 'working', 32);
    tx.ensureTilesForRect({ x: 10, y: 10, w: 20, h: 20 });
    paintHeightBlock(registry, 10, 10, 20, 20, 0.9);

    expect(registry.heightMap.working).not.toEqual(before);
    const dirty = tx.rollback();
    expect(dirty).not.toBeNull();
    expect(registry.heightMap.working).toEqual(before);
  });
});
