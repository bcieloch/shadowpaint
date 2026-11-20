import { describe, expect, it, vi } from 'vitest';
import { MapMemoryError, MapRegistry } from '@/core/maps/MapRegistry';

describe('MapRegistry', () => {
  it('allocates all three maps and selection with identical dimensions', () => {
    const registry = new MapRegistry();
    registry.allocate(16, 24);

    expect(registry.isAllocated).toBe(true);
    expect(registry.width).toBe(16);
    expect(registry.height).toBe(24);
    expect(registry.color.base.length).toBe(16 * 24 * 4);
    expect(registry.heightMap.base.length).toBe(16 * 24);
    expect(registry.opacity.base.length).toBe(16 * 24);
    expect(registry.selection.length).toBe(16 * 24);
    expect(registry.heightMap.working[0]).toBe(0);
    expect(registry.opacity.working[0]).toBe(1);
    expect(registry.color.working[0]).toBe(0xf4);
  });

  it('keeps maps completely isolated when mutating one map', () => {
    const registry = new MapRegistry();
    registry.allocate(8, 8);

    const colorSnapshot = new Uint8ClampedArray(registry.color.working);
    const opacitySnapshot = new Float32Array(registry.opacity.working);

    registry.heightMap.working.fill(0.75);
    registry.heightMap.copyEffectiveFromWorking();

    expect(registry.color.working).toEqual(colorSnapshot);
    expect(registry.opacity.working).toEqual(opacitySnapshot);
    expect(registry.heightMap.base[0]).toBe(0);
    expect(registry.heightMap.effective[0]).toBe(0.75);
  });

  it('emits replaced and dirty events', () => {
    const registry = new MapRegistry();
    const onReplaced = vi.fn();
    const onDirty = vi.fn();
    registry.events.on('replaced', onReplaced);
    registry.events.on('dirty', onDirty);

    registry.allocate(10, 10);
    expect(onReplaced).toHaveBeenCalledWith({ mapId: 'all', width: 10, height: 10 });

    registry.emitDirty('height', { x: 1, y: 2, w: 3, h: 4 });
    expect(onDirty).toHaveBeenCalledWith({
      mapId: 'height',
      rect: { x: 1, y: 2, w: 3, h: 4 },
    });
  });

  it('throws MapMemoryError and preserves previous buffers on allocation failure', () => {
    const registry = new MapRegistry();
    registry.allocate(4, 4);

    expect(() => registry.allocate(100_000_000, 100_000_000)).toThrow(MapMemoryError);
    expect(registry.width).toBe(4);
    expect(registry.height).toBe(4);
  });
});
