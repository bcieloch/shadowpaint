import { describe, expect, it, vi } from 'vitest';
import { createDefaultProject } from '@/core/constants';
import { MapRegistry, mapRegistry } from '@/core/maps/MapRegistry';
import { computeBrushFalloff, stampDab } from '@/editor2d/brush/dab';
import { StrokeSession } from '@/editor2d/brush/stroke';
import { BlurTool } from '@/editor2d/tools/BlurTool';
import { BrushTool } from '@/editor2d/tools/BrushTool';
import { EraserTool } from '@/editor2d/tools/EraserTool';
import { EyedropperTool } from '@/editor2d/tools/EyedropperTool';
import { FillTool } from '@/editor2d/tools/FillTool';
import { GradientTool } from '@/editor2d/tools/GradientTool';
import { MaskBrushTool } from '@/editor2d/tools/MaskBrushTool';
import { SmoothTool } from '@/editor2d/tools/SmoothTool';
import type { Tool, ToolContext, ToolPointerEvent } from '@/editor2d/tools/Tool';
import { clearHistory, undoGlobal } from '@/services/historyService';
import { useEditorStore } from '@/state/editorStore';
import { useProjectStore } from '@/state/projectStore';

function makePointerEvent(x: number, y: number, pressure = 1, altKey = false): ToolPointerEvent {
  return {
    imagePos: { x, y },
    screenPos: { x, y },
    pressure,
    pointerType: 'mouse',
    buttons: 1,
    shiftKey: false,
    altKey,
  };
}

function makeToolContext(
  registry: MapRegistry,
  project = createDefaultProject({
    canvas: { widthPx: 64, heightPx: 64, widthCm: 10, heightCm: 10 },
  }),
  onLockedMapAttempt: (mapId: 'color' | 'height' | 'opacity') => void = () => {},
): ToolContext {
  return {
    registry,
    getProject: () => project,
    getEditor: () => useEditorStore.getState(),
    setBrushOption: (key, value) => useEditorStore.getState().setBrushOption(key, value),
    onLockedMapAttempt,
  };
}

describe('brush dab, stroke, and tools', () => {
  it('computes smooth falloff according to hardness', () => {
    expect(computeBrushFalloff(0, 10, 0)).toBe(1);
    expect(computeBrushFalloff(10, 10, 0.5)).toBe(0);
    expect(computeBrushFalloff(12, 10, 1)).toBe(0);
    expect(computeBrushFalloff(8, 10, 1)).toBe(1);
    const midSoft = computeBrushFalloff(5, 10, 0);
    expect(midSoft).toBeCloseTo(0.5, 4);
  });

  it('painting on height map does not modify color or opacity maps', () => {
    const registry = new MapRegistry();
    registry.allocate(64, 64);

    const colorBefore = new Uint8ClampedArray(registry.color.effective);
    const opacityBefore = new Float32Array(registry.opacity.effective);

    const project = createDefaultProject({
      canvas: { widthPx: 64, heightPx: 64, widthCm: 10, heightCm: 10 },
    });

    const dirtyEvents: string[] = [];
    registry.events.on('dirty', ({ mapId }) => dirtyEvents.push(mapId));

    const session = new StrokeSession(registry);
    session.begin({ x: 16, y: 32 }, 1, {
      kind: 'brush',
      mapId: 'height',
      radiusPx: 8,
      hardness: 1,
      flow: 1,
      spacing: 0.25,
      usePressure: false,
      mode: 'set',
      targetValue: 0.5,
      adjustments: project.adjustments,
    });
    session.move({ x: 48, y: 32 }, 1, {
      kind: 'brush',
      mapId: 'height',
      radiusPx: 8,
      hardness: 1,
      flow: 1,
      spacing: 0.25,
      usePressure: false,
      mode: 'set',
      targetValue: 0.5,
      adjustments: project.adjustments,
    });
    session.end();

    // Midpoint along interpolated stroke must be painted
    expect(registry.heightMap.working[32 * 64 + 32]).toBeCloseTo(0.5, 4);
    expect(registry.heightMap.effective[32 * 64 + 32]).toBeCloseTo(0.5, 4);

    // Other maps must be completely unchanged
    expect(registry.color.effective).toEqual(colorBefore);
    expect(registry.opacity.effective).toEqual(opacityBefore);
    expect(dirtyEvents.every((id) => id === 'height')).toBe(true);
  });

  it('supports raise and lower brush modes on float maps', () => {
    const registry = new MapRegistry();
    registry.allocate(32, 32, { height: 0.5 });

    stampDab(registry, {
      kind: 'brush',
      mapId: 'height',
      cx: 16.5,
      cy: 16.5,
      radiusPx: 4,
      hardness: 1,
      flow: 1,
      mode: 'raise',
      raiseLowerStep: 0.2,
    });
    expect(registry.heightMap.working[16 * 32 + 16]).toBeCloseTo(0.7, 5);

    stampDab(registry, {
      kind: 'brush',
      mapId: 'height',
      cx: 16.5,
      cy: 16.5,
      radiusPx: 4,
      hardness: 1,
      flow: 1,
      mode: 'lower',
      raiseLowerStep: 0.3,
    });
    expect(registry.heightMap.working[16 * 32 + 16]).toBeCloseTo(0.4, 5);
  });

  it('eraser restores working buffer toward base without altering base', () => {
    const registry = new MapRegistry();
    registry.allocate(32, 32, { height: 0.25 });

    const project = createDefaultProject({
      canvas: { widthPx: 32, heightPx: 32, widthCm: 10, heightCm: 10 },
    });

    useEditorStore.getState().setActiveMap('height');
    useEditorStore.getState().setBrushOption('sizeUnit', 'px');
    useEditorStore.getState().setBrushOption('sizeValue', 10);
    useEditorStore.getState().setBrushOption('hardness', 1);
    useEditorStore.getState().setBrushOption('flow', 1);
    useEditorStore.getState().setBrushOption('mode', 'set');
    useEditorStore.getState().setBrushOption('heightMm', 5);

    const ctx = makeToolContext(registry, project);
    const brush: Tool = new BrushTool();
    brush.onDown(makePointerEvent(16.5, 16.5), ctx);
    brush.onUp(makePointerEvent(16.5, 16.5), ctx);

    expect(registry.heightMap.working[16 * 32 + 16]).toBeCloseTo(1, 5);
    expect(registry.heightMap.base[16 * 32 + 16]).toBeCloseTo(0.25, 5);

    const eraser: Tool = new EraserTool();
    eraser.onDown(makePointerEvent(16.5, 16.5), ctx);
    eraser.onUp(makePointerEvent(16.5, 16.5), ctx);

    expect(registry.heightMap.working[16 * 32 + 16]).toBeCloseTo(0.25, 5);
    expect(registry.heightMap.effective[16 * 32 + 16]).toBeCloseTo(0.25, 5);
  });

  it('does not edit a locked map and invokes onLockedMapAttempt', () => {
    const registry = new MapRegistry();
    registry.allocate(32, 32, { height: 0.1 });

    const project = createDefaultProject({
      canvas: { widthPx: 32, heightPx: 32, widthCm: 10, heightCm: 10 },
    });
    project.maps.height.locked = true;

    useEditorStore.getState().setActiveMap('height');
    const onLocked = vi.fn();
    const ctx = makeToolContext(registry, project, onLocked);

    const brush: Tool = new BrushTool();
    brush.onDown(makePointerEvent(16, 16), ctx);
    brush.onMove(makePointerEvent(20, 20), ctx);
    brush.onUp(makePointerEvent(20, 20), ctx);

    expect(onLocked).toHaveBeenCalledWith('height');
    expect(registry.heightMap.working[16 * 32 + 16]).toBeCloseTo(0.1, 5);
  });

  it('eyedropper samples effective values from active map', () => {
    const registry = new MapRegistry();
    registry.allocate(16, 16, { color: '#112233', height: 0.5, opacity: 0.4 });
    const project = createDefaultProject({
      canvas: {
        widthPx: 16,
        heightPx: 16,
        widthCm: 10,
        heightCm: 10,
        minThicknessMm: 0,
        maxThicknessMm: 10,
      },
    });
    const ctx = makeToolContext(registry, project);
    const eyedropper: Tool = new EyedropperTool();

    useEditorStore.getState().setActiveMap('color');
    eyedropper.onDown(makePointerEvent(4, 4), ctx);
    eyedropper.onUp(makePointerEvent(4, 4), ctx);
    expect(useEditorStore.getState().brush.colorHex).toBe('#112233');

    useEditorStore.getState().setActiveMap('height');
    eyedropper.onDown(makePointerEvent(4, 4), ctx);
    eyedropper.onUp(makePointerEvent(4, 4), ctx);
    expect(useEditorStore.getState().brush.heightMm).toBeCloseTo(5, 3);

    useEditorStore.getState().setActiveMap('opacity');
    eyedropper.onDown(makePointerEvent(4, 4), ctx);
    eyedropper.onUp(makePointerEvent(4, 4), ctx);
    expect(useEditorStore.getState().brush.opacityPct).toBeCloseTo(40, 1);
  });

  it('respects selection mask in protect and editInside modes and paints everywhere when empty', () => {
    const registry = new MapRegistry();
    registry.allocate(32, 32, { height: 0.1 });
    const project = createDefaultProject({
      canvas: { widthPx: 32, heightPx: 32, widthCm: 10, heightCm: 10 },
    });

    // Mark x < 16 with mask = 255, x >= 16 with mask = 0
    for (let y = 0; y < 32; y++) {
      for (let x = 0; x < 16; x++) {
        registry.selection[y * 32 + x] = 255;
      }
    }
    registry.emitSelectionChanged();

    // 1. Protect mode: x=10 (masked=255) is protected, x=20 (masked=0) is painted
    const sessionProtect = new StrokeSession(registry);
    sessionProtect.begin({ x: 16, y: 16 }, 1, {
      kind: 'brush',
      mapId: 'height',
      radiusPx: 10,
      hardness: 1,
      flow: 1,
      spacing: 0.25,
      usePressure: false,
      mode: 'set',
      targetValue: 0.9,
      adjustments: project.adjustments,
      selectionMode: 'protect',
    });
    sessionProtect.end();

    expect(registry.heightMap.working[16 * 32 + 10]).toBeCloseTo(0.1, 5);
    expect(registry.heightMap.working[16 * 32 + 20]).toBeCloseTo(0.9, 5);

    // 2. EditInside mode: x=10 (masked=255) is edited, x=20 (masked=0) keeps 0.9
    const sessionInside = new StrokeSession(registry);
    sessionInside.begin({ x: 16, y: 16 }, 1, {
      kind: 'brush',
      mapId: 'height',
      radiusPx: 10,
      hardness: 1,
      flow: 1,
      spacing: 0.25,
      usePressure: false,
      mode: 'set',
      targetValue: 0.4,
      adjustments: project.adjustments,
      selectionMode: 'editInside',
    });
    sessionInside.end();

    expect(registry.heightMap.working[16 * 32 + 10]).toBeCloseTo(0.4, 5);
    expect(registry.heightMap.working[16 * 32 + 20]).toBeCloseTo(0.9, 5);

    // 3. Empty selection mask: even with selectionMode = 'editInside', entire stroke paints
    registry.selection.fill(0);
    registry.emitSelectionChanged();
    const sessionEmpty = new StrokeSession(registry);
    sessionEmpty.begin({ x: 16, y: 16 }, 1, {
      kind: 'brush',
      mapId: 'height',
      radiusPx: 10,
      hardness: 1,
      flow: 1,
      spacing: 0.25,
      usePressure: false,
      mode: 'set',
      targetValue: 0.75,
      adjustments: project.adjustments,
      selectionMode: 'editInside',
    });
    sessionEmpty.end();

    expect(registry.heightMap.working[16 * 32 + 10]).toBeCloseTo(0.75, 5);
    expect(registry.heightMap.working[16 * 32 + 20]).toBeCloseTo(0.75, 5);
  });

  it('MaskBrushTool paints, erases with Alt, and rolls back on cancel', () => {
    const registry = new MapRegistry();
    registry.allocate(32, 32);
    const project = createDefaultProject({
      canvas: { widthPx: 32, heightPx: 32, widthCm: 10, heightCm: 10 },
    });

    useEditorStore.getState().setBrushOption('sizeUnit', 'px');
    useEditorStore.getState().setBrushOption('sizeValue', 8);
    useEditorStore.getState().setBrushOption('hardness', 1);
    useEditorStore.getState().setBrushOption('flow', 1);
    useEditorStore.getState().setSelectionToolOption('maskBrushErase', false);
    useEditorStore.getState().setSelectionToolOption('combineMode', 'replace');

    const ctx = makeToolContext(registry, project);
    const maskBrush = new MaskBrushTool();

    // Paint mask around (16, 16)
    maskBrush.onDown(makePointerEvent(16.5, 16.5), ctx);
    maskBrush.onUp(makePointerEvent(16.5, 16.5), ctx);
    expect(registry.selection[16 * 32 + 16]).toBe(255);

    // Erase mask using Alt key
    maskBrush.onDown(makePointerEvent(16.5, 16.5, 1, true), ctx);
    maskBrush.onUp(makePointerEvent(16.5, 16.5, 1, true), ctx);
    expect(registry.selection[16 * 32 + 16]).toBe(0);

    // Paint then cancel -> rolls back cleanly
    maskBrush.onDown(makePointerEvent(16.5, 16.5), ctx);
    expect(registry.selection[16 * 32 + 16]).toBe(255);
    maskBrush.onCancel(ctx);
    expect(registry.selection[16 * 32 + 16]).toBe(0);
  });

  it('SmoothTool smooths height spikes, respects selection mask, and rolls back on cancel', () => {
    const registry = new MapRegistry();
    registry.allocate(32, 32, { height: 0 });
    registry.heightMap.working[16 * 32 + 16] = 1;
    registry.heightMap.working[16 * 32 + 8] = 1;
    registry.selection[16 * 32 + 8] = 255;
    registry.refreshSelectionState();

    const project = createDefaultProject({
      canvas: { widthPx: 32, heightPx: 32, widthCm: 10, heightCm: 10 },
    });

    useEditorStore.getState().setActiveMap('height');
    useEditorStore.getState().setBrushOption('sizeUnit', 'px');
    useEditorStore.getState().setBrushOption('sizeValue', 24);
    useEditorStore.getState().setBrushOption('hardness', 1);
    useEditorStore.getState().setBrushOption('flow', 1);
    useEditorStore.getState().setSmoothToolOption('iterations', 3);

    const recordSpy = vi.fn();
    const ctx: ToolContext = {
      ...makeToolContext(registry, project),
      recordMapTileEntry: recordSpy,
    };

    const smooth = new SmoothTool();
    smooth.onDown(makePointerEvent(16.5, 16.5), ctx);
    smooth.onUp(makePointerEvent(16.5, 16.5), ctx);

    // Protected pixel (8, 16) stays 1, unprotected spike (16, 16) decreases and spreads
    expect(registry.heightMap.working[16 * 32 + 8]).toBeCloseTo(1, 5);
    expect(registry.heightMap.working[16 * 32 + 16]).toBeLessThan(0.8);
    expect(registry.heightMap.working[16 * 32 + 15]).toBeGreaterThan(0.05);
    expect(recordSpy).toHaveBeenCalledTimes(1);

    // Cancel rolls back live dab edits
    const beforeCancel = registry.heightMap.working[16 * 32 + 16];
    smooth.onDown(makePointerEvent(16.5, 16.5), ctx);
    expect(registry.heightMap.working[16 * 32 + 16]).toBeLessThan(beforeCancel ?? 1);
    smooth.onCancel(ctx);
    expect(registry.heightMap.working[16 * 32 + 16]).toBeCloseTo(beforeCancel ?? 0, 5);
  });

  it('BlurTool blurs locally for small radius and via region path for large radius (>12px)', async () => {
    const registry = new MapRegistry();
    registry.allocate(64, 64, { height: 0 });
    for (let y = 24; y < 40; y++) {
      for (let x = 24; x < 40; x++) {
        registry.heightMap.working[y * 64 + x] = 1;
      }
    }

    const project = createDefaultProject({
      canvas: { widthPx: 64, heightPx: 64, widthCm: 10, heightCm: 10 },
    });

    useEditorStore.getState().setActiveMap('height');
    useEditorStore.getState().setBrushOption('sizeUnit', 'px');
    useEditorStore.getState().setBrushOption('sizeValue', 20);
    useEditorStore.getState().setBrushOption('hardness', 1);
    useEditorStore.getState().setBrushOption('flow', 1);
    useEditorStore.getState().setBlurToolOption('radiusUnit', 'px');
    useEditorStore.getState().setBlurToolOption('radiusValue', 4);

    const recordSpy = vi.fn();
    const ctx: ToolContext = {
      ...makeToolContext(registry, project),
      recordMapTileEntry: recordSpy,
    };

    const blur = new BlurTool();
    blur.onDown(makePointerEvent(24, 32), ctx);
    blur.onUp(makePointerEvent(24, 32), ctx);

    // Edge outside bright square receives blurred height and center softens
    expect(registry.heightMap.working[32 * 64 + 22]).toBeGreaterThan(0.01);
    expect(registry.heightMap.working[32 * 64 + 25]).toBeLessThan(0.99);
    expect(recordSpy).toHaveBeenCalledTimes(1);

    // Test large radius (>12px) against singleton mapRegistry used by filterService
    mapRegistry.allocate(64, 64, { color: '#000000' });
    for (let y = 0; y < 64; y++) {
      for (let x = 32; x < 64; x++) {
        const idx = (y * 64 + x) * 4;
        mapRegistry.color.working[idx] = 255;
        mapRegistry.color.working[idx + 1] = 255;
        mapRegistry.color.working[idx + 2] = 255;
      }
    }
    useProjectStore.getState().setProject(
      createDefaultProject({
        canvas: { widthPx: 64, heightPx: 64, widthCm: 10, heightCm: 10 },
      }),
    );
    useEditorStore.getState().setActiveMap('color');
    useEditorStore.getState().setBrushOption('sizeValue', 30);
    useEditorStore.getState().setBlurToolOption('radiusValue', 16);

    const ctxGlobal = makeToolContext(mapRegistry, useProjectStore.getState().project);
    blur.onDown(makePointerEvent(32, 32), ctxGlobal);
    blur.onMove(makePointerEvent(36, 32), ctxGlobal);
    expect(blur.getOverlayPreview()?.kind).toBe('stroke');
    blur.onUp(makePointerEvent(36, 32), ctxGlobal);

    // Async fallback settles quickly (microtask/promise flush)
    await new Promise((r) => setTimeout(r, 20));
    expect(mapRegistry.color.working[(32 * 64 + 28) * 4]).toBeGreaterThan(20);
    expect(mapRegistry.color.working[(32 * 64 + 36) * 4]).toBeLessThan(235);
  });

  it('GradientTool and FillTool apply tile history and support undo', async () => {
    clearHistory();
    mapRegistry.allocate(32, 32, { height: 0, color: '#000000' });
    const project = createDefaultProject({
      canvas: {
        widthPx: 32,
        heightPx: 32,
        widthCm: 10,
        heightCm: 10,
        minThicknessMm: 0,
        maxThicknessMm: 10,
      },
    });
    project.selection.mode = 'editInside';
    useProjectStore.getState().setProject(project);

    // Selection on x in [8, 23]
    for (let y = 0; y < 32; y++) {
      for (let x = 8; x < 24; x++) {
        mapRegistry.selection[y * 32 + x] = 255;
      }
    }
    mapRegistry.refreshSelectionState();

    useEditorStore.getState().setActiveMap('height');
    useEditorStore.getState().setGradientToolOption('kind', 'linear');
    useEditorStore.getState().setGradientToolOption('startHeightMm', 0);
    useEditorStore.getState().setGradientToolOption('endHeightMm', 10);
    useEditorStore.getState().setGradientToolOption('onlyInSelection', true);

    const ctx = makeToolContext(mapRegistry, useProjectStore.getState().project);
    const gradient = new GradientTool();
    gradient.onDown(makePointerEvent(8.5, 16), ctx);
    gradient.onMove(makePointerEvent(23.5, 16));
    expect(gradient.getOverlayPreview()?.kind).toBe('gradient');
    gradient.onUp(makePointerEvent(23.5, 16), ctx);

    await new Promise((r) => setTimeout(r, 20));
    // Unselected x=4 stays 0, selected x=16 has mid-ramp ~0.5
    expect(mapRegistry.heightMap.working[16 * 32 + 4]).toBeCloseTo(0, 4);
    expect(mapRegistry.heightMap.working[16 * 32 + 16]).toBeCloseTo(0.5, 2);

    // Undo restores flat 0
    undoGlobal();
    expect(mapRegistry.heightMap.working[16 * 32 + 16]).toBeCloseTo(0, 4);

    // FillTool on color map
    mapRegistry.selection.fill(0);
    mapRegistry.refreshSelectionState();
    for (let y = 8; y < 24; y++) {
      for (let x = 8; x < 24; x++) {
        const idx = (y * 32 + x) * 4;
        mapRegistry.color.working[idx] = 100;
        mapRegistry.color.working[idx + 1] = 100;
        mapRegistry.color.working[idx + 2] = 100;
      }
    }
    useEditorStore.getState().setActiveMap('color');
    useEditorStore.getState().setFillToolOption('tolerancePct', 0);
    useEditorStore.getState().setFillToolOption('contiguous', true);
    useEditorStore.getState().setBrushOption('colorHex', '#ff4020');

    const fill = new FillTool();
    fill.onDown(
      makePointerEvent(12, 12),
      makeToolContext(mapRegistry, useProjectStore.getState().project),
    );
    fill.onUp();

    await new Promise((r) => setTimeout(r, 20));
    expect(mapRegistry.color.working[(12 * 32 + 12) * 4]).toBe(255);
    expect(mapRegistry.color.working[(12 * 32 + 12) * 4 + 1]).toBe(64);
    expect(mapRegistry.color.working[(2 * 32 + 2) * 4]).toBe(0);

    undoGlobal();
    expect(mapRegistry.color.working[(12 * 32 + 12) * 4]).toBe(100);
    clearHistory();
  });
});
