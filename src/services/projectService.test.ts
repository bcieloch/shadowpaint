import { describe, expect, it } from 'vitest';
import { mapRegistry } from '@/core/maps/MapRegistry';
import { getCalibrationMetrics } from '@/core/units/calibration';
import { recordTileHistory, undoGlobal } from '@/services/historyService';
import {
  createAndActivateProject,
  resizeProject,
  updateCanvasWithoutResample,
} from '@/services/projectService';
import { useHistoryStore } from '@/state/historyStore';
import { useProjectStore } from '@/state/projectStore';

describe('projectService canvas calibration & resize', () => {
  it('updates cm without resampling pixels and preserves history', () => {
    const created = createAndActivateProject({
      canvas: {
        widthCm: 20,
        heightCm: 20,
        widthPx: 40,
        heightPx: 40,
        minThicknessMm: 0,
        maxThicknessMm: 5,
      },
    });
    expect(created.ok).toBe(true);

    // Paint distinct pixel values across all three maps
    mapRegistry.color.working[0] = 123;
    mapRegistry.heightMap.working[5] = 0.75;
    mapRegistry.opacity.working[9] = 0.35;

    const colorSnapshot = new Uint8ClampedArray(mapRegistry.color.working);
    const heightSnapshot = new Float32Array(mapRegistry.heightMap.working);
    const opacitySnapshot = new Float32Array(mapRegistry.opacity.working);

    recordTileHistory({
      kind: 'tiles',
      mapId: 'height',
      layer: 'working',
      meta: { action: 'brushStroke', mapId: 'height' },
      tiles: [
        {
          tx: 0,
          ty: 0,
          x: 0,
          y: 0,
          w: 40,
          h: 40,
          before: new Float32Array(1600),
          after: new Float32Array(heightSnapshot),
        },
      ],
      dirtyRect: { x: 0, y: 0, w: 40, h: 40 },
      byteSize: 1600 * 8,
    });

    const res = updateCanvasWithoutResample({
      widthCm: 40,
      heightCm: 40,
      widthPx: 40,
      heightPx: 40,
      minThicknessMm: 0,
      maxThicknessMm: 5,
    });
    expect(res).toEqual({ ok: true, resampled: false });

    const canvas = useProjectStore.getState().project.canvas;
    expect(canvas.widthCm).toBe(40);
    expect(canvas.heightCm).toBe(40);
    expect(getCalibrationMetrics(canvas).pxPerCm).toBe(1);

    // Pixel buffers must remain byte-for-byte identical
    expect(mapRegistry.width).toBe(40);
    expect(mapRegistry.height).toBe(40);
    expect(mapRegistry.color.working).toEqual(colorSnapshot);
    expect(mapRegistry.heightMap.working).toEqual(heightSnapshot);
    expect(mapRegistry.opacity.working).toEqual(opacitySnapshot);

    // History still has both brush + settingsChange entries and undo reverts cm
    expect(useHistoryStore.getState().stacks.settings.undo.length).toBe(1);
    expect(useHistoryStore.getState().stacks.height.undo.length).toBe(1);
    undoGlobal();
    expect(useProjectStore.getState().project.canvas.widthCm).toBe(20);
  });

  it('atomically resamples all three maps + selection on pixel resize and clears history', async () => {
    const created = createAndActivateProject({
      canvas: {
        widthCm: 20,
        heightCm: 20,
        widthPx: 32,
        heightPx: 32,
        minThicknessMm: 0,
        maxThicknessMm: 5,
      },
    });
    expect(created.ok).toBe(true);

    // Fill constant distinctive values on all 3 maps + selection
    for (let i = 0; i < 32 * 32; i++) {
      mapRegistry.color.base[i * 4] = 80;
      mapRegistry.color.base[i * 4 + 1] = 160;
      mapRegistry.color.base[i * 4 + 2] = 200;
      mapRegistry.color.base[i * 4 + 3] = 255;
    }
    mapRegistry.color.working.set(mapRegistry.color.base);
    mapRegistry.heightMap.base.fill(0.4);
    mapRegistry.heightMap.working.fill(0.6);
    mapRegistry.opacity.base.fill(0.8);
    mapRegistry.opacity.working.fill(0.5);
    mapRegistry.selection.fill(255);

    recordTileHistory({
      kind: 'tiles',
      mapId: 'color',
      layer: 'working',
      meta: { action: 'brushStroke', mapId: 'color' },
      tiles: [
        {
          tx: 0,
          ty: 0,
          x: 0,
          y: 0,
          w: 32,
          h: 32,
          before: new Uint8ClampedArray(32 * 32 * 4),
          after: new Uint8ClampedArray(mapRegistry.color.working),
        },
      ],
      dirtyRect: { x: 0, y: 0, w: 32, h: 32 },
      byteSize: 32 * 32 * 8,
    });
    expect(useHistoryStore.getState().stacks.color.undo.length).toBe(1);

    const res = await resizeProject({
      widthCm: 20,
      heightCm: 20,
      widthPx: 64,
      heightPx: 64,
      minThicknessMm: 0,
      maxThicknessMm: 5,
    });
    expect(res).toEqual({ ok: true, resampled: true });

    // All maps + selection have exact new dimensions 64x64
    expect(mapRegistry.width).toBe(64);
    expect(mapRegistry.height).toBe(64);
    expect(mapRegistry.color.base.length).toBe(64 * 64 * 4);
    expect(mapRegistry.color.working.length).toBe(64 * 64 * 4);
    expect(mapRegistry.color.effective.length).toBe(64 * 64 * 4);
    expect(mapRegistry.heightMap.base.length).toBe(64 * 64);
    expect(mapRegistry.heightMap.working.length).toBe(64 * 64);
    expect(mapRegistry.heightMap.effective.length).toBe(64 * 64);
    expect(mapRegistry.opacity.base.length).toBe(64 * 64);
    expect(mapRegistry.opacity.working.length).toBe(64 * 64);
    expect(mapRegistry.opacity.effective.length).toBe(64 * 64);
    expect(mapRegistry.selection.length).toBe(64 * 64);

    // Uniform values remain intact across resampling
    expect(mapRegistry.color.working[0]).toBe(80);
    expect(mapRegistry.color.working[1]).toBe(160);
    expect(mapRegistry.color.working[2]).toBe(200);
    expect(mapRegistry.heightMap.base[100]).toBeCloseTo(0.4, 3);
    expect(mapRegistry.heightMap.working[100]).toBeCloseTo(0.6, 3);
    expect(mapRegistry.opacity.base[100]).toBeCloseTo(0.8, 3);
    expect(mapRegistry.opacity.working[100]).toBeCloseTo(0.5, 3);
    expect(mapRegistry.selection[100]).toBe(255);

    // History cleared after resize
    expect(useHistoryStore.getState().stacks.color.undo.length).toBe(0);
    expect(useHistoryStore.getState().totalBytes).toBe(0);
    expect(useProjectStore.getState().project.canvas.widthPx).toBe(64);
    expect(useProjectStore.getState().project.canvas.heightPx).toBe(64);
  });
});
