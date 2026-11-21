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

  it('atomically replaces all three maps and selection on replaceAll', () => {
    const registry = new MapRegistry();
    registry.allocate(8, 8);

    const onReplaced = vi.fn();
    registry.events.on('replaced', onReplaced);

    const n = 12 * 16;
    const colorBase = new Uint8ClampedArray(n * 4).fill(10);
    const colorWorking = new Uint8ClampedArray(n * 4).fill(20);
    const colorEffective = new Uint8ClampedArray(n * 4).fill(30);
    const heightBase = new Float32Array(n).fill(0.2);
    const heightWorking = new Float32Array(n).fill(0.4);
    const heightEffective = new Float32Array(n).fill(0.6);
    const opacityBase = new Float32Array(n).fill(0.5);
    const opacityWorking = new Float32Array(n).fill(0.7);
    const opacityEffective = new Float32Array(n).fill(0.9);
    const selection = new Uint8Array(n).fill(128);

    registry.replaceAll({
      width: 12,
      height: 16,
      colorBase,
      colorWorking,
      colorEffective,
      heightBase,
      heightWorking,
      heightEffective,
      opacityBase,
      opacityWorking,
      opacityEffective,
      selection,
    });

    expect(registry.width).toBe(12);
    expect(registry.height).toBe(16);
    expect(registry.color.effective[0]).toBe(30);
    expect(registry.heightMap.working[0]).toBeCloseTo(0.4, 5);
    expect(registry.opacity.base[0]).toBeCloseTo(0.5, 5);
    expect(registry.selection[0]).toBe(128);
    expect(onReplaced).toHaveBeenCalledWith({ mapId: 'all', width: 12, height: 16 });
  });

  it('throws MapMemoryError and preserves previous buffers on allocation failure', () => {
    const registry = new MapRegistry();
    registry.allocate(4, 4);

    expect(() => registry.allocate(100_000_000, 100_000_000)).toThrow(MapMemoryError);
    expect(registry.width).toBe(4);
    expect(registry.height).toBe(4);
  });

  it('supports multi-layer creation, compositing blend modes, visibility, opacity, merge down, and flatten', () => {
    const registry = new MapRegistry();
    registry.allocate(4, 4);

    const heightBuf = registry.heightMap;
    expect(heightBuf.layers.length).toBe(1);
    heightBuf.working.fill(0.3);

    // Add second layer with 'add' blend mode
    const layer2 = heightBuf.addLayer({ name: 'Impasto Details', blendMode: 'add', opacity: 0.5 });
    expect(heightBuf.layers.length).toBe(2);
    expect(heightBuf.activeLayerId).toBe(layer2.id);

    // Paint value 0.4 on pixel 0 of layer 2 with full mask coverage
    heightBuf.working[0] = 0.4;
    heightBuf.activeMask[0] = 255;

    // Composite: base 0.3 + (0.3 + 0.4 - 0.3) * 0.5 = 0.5
    const compAdd = heightBuf.getCompositeBuffer();
    expect(compAdd[0]).toBeCloseTo(0.5, 5);
    expect(compAdd[1]).toBeCloseTo(0.3, 5);

    // Hide layer 2 -> composite falls back to 0.3
    heightBuf.updateLayer(layer2.id, { visible: false });
    expect(heightBuf.getCompositeBuffer()[0]).toBeCloseTo(0.3, 5);

    // Show layer 2 and switch to 'max' blend mode at 100% opacity
    heightBuf.updateLayer(layer2.id, { visible: true, blendMode: 'max', opacity: 1 });
    expect(heightBuf.getCompositeBuffer()[0]).toBeCloseTo(0.4, 5);

    // Duplicate layer 2 and merge down
    const dup = heightBuf.duplicateLayer(layer2.id, 'Copy');
    expect(dup).not.toBeNull();
    expect(heightBuf.layers.length).toBe(3);

    expect(heightBuf.mergeLayerDown(dup?.id)).toBe(true);
    expect(heightBuf.layers.length).toBe(2);

    // Flatten back to 1 layer
    heightBuf.flattenLayers('Base');
    expect(heightBuf.layers.length).toBe(1);
    expect(heightBuf.working[0]).toBeCloseTo(0.4, 5);
  });
});
