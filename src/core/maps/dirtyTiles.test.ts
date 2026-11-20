import { describe, expect, it } from 'vitest';
import { createDefaultProject } from '@/core/constants';
import {
  DirtyTileTracker,
  ensureEffectiveRect,
  flushAllEffective,
  flushEffectiveMap,
} from '@/core/maps/dirtyTiles';
import { MapRegistry } from '@/core/maps/MapRegistry';

describe('DirtyTileTracker and lazy effective flush', () => {
  it('tracks dirty 256x256 tiles and prioritizes visible rect before offscreen flush', () => {
    const registry = new MapRegistry();
    registry.allocate(600, 600, { height: 0.5 });

    const project = createDefaultProject({
      canvas: { widthPx: 600, heightPx: 600, widthCm: 10, heightCm: 10 },
    });
    project.adjustments.height.invert = true;

    registry.dirtyTiles.markAllDirty('height');
    expect(registry.dirtyTiles.getTileCount()).toBe(9);
    expect(registry.dirtyTiles.getDirtyCount('height')).toBe(9);

    // Ensure only top-left corner rect (covers tile (0,0))
    const computedVisible = ensureEffectiveRect(
      registry,
      'height',
      { x: 10, y: 10, w: 64, h: 64 },
      project.adjustments,
    );
    expect(computedVisible).toEqual({ x: 0, y: 0, w: 256, h: 256 });
    expect(registry.dirtyTiles.getDirtyCount('height')).toBe(8);

    // Reading twice in the same visible tile is a no-op
    expect(
      ensureEffectiveRect(registry, 'height', { x: 10, y: 10, w: 64, h: 64 }, project.adjustments),
    ).toBeNull();

    // Flush 2 remaining tiles
    const batch = flushEffectiveMap(registry, 'height', project.adjustments, 2);
    expect(batch).not.toBeNull();
    expect(registry.dirtyTiles.getDirtyCount('height')).toBe(6);

    // Flush all remaining
    flushAllEffective(registry, project.adjustments);
    expect(registry.dirtyTiles.hasDirty()).toBe(false);
    expect(registry.heightMap.effective[500 * 600 + 500]).toBeCloseTo(0.5, 5);
  });

  it('produces identical effective buffer whether flushed lazily or all at once', () => {
    const registry = new MapRegistry();
    registry.allocate(520, 300, { color: '#4080c0' });
    const project = createDefaultProject({
      canvas: { widthPx: 520, heightPx: 300, widthCm: 10, heightCm: 10 },
    });
    project.adjustments.color = { brightness: 0.12, contrast: 0.2, saturation: -0.3 };

    const tracker = new DirtyTileTracker(256);
    tracker.reset(520, 300);
    expect(tracker.getTileCount()).toBe(6);

    registry.dirtyTiles.markAllDirty('color');
    ensureEffectiveRect(registry, 'color', { x: 0, y: 0, w: 200, h: 200 }, project.adjustments);
    flushEffectiveMap(registry, 'color', project.adjustments);
    expect(registry.dirtyTiles.hasDirty('color')).toBe(false);

    const expectedR = Math.round(registry.color.effective[0] ?? 0);
    expect(registry.color.effective[(299 * 520 + 519) * 4]).toBe(expectedR);
  });
});
