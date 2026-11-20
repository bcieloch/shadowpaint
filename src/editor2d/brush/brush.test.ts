import { describe, expect, it, vi } from 'vitest';
import { createDefaultProject } from '@/core/constants';
import { MapRegistry } from '@/core/maps/MapRegistry';
import { computeBrushFalloff, stampDab } from '@/editor2d/brush/dab';
import { StrokeSession } from '@/editor2d/brush/stroke';
import { BrushTool } from '@/editor2d/tools/BrushTool';
import { EraserTool } from '@/editor2d/tools/EraserTool';
import { EyedropperTool } from '@/editor2d/tools/EyedropperTool';
import type { Tool, ToolContext, ToolPointerEvent } from '@/editor2d/tools/Tool';
import { useEditorStore } from '@/state/editorStore';

function makePointerEvent(x: number, y: number, pressure = 1): ToolPointerEvent {
  return {
    imagePos: { x, y },
    screenPos: { x, y },
    pressure,
    pointerType: 'mouse',
    buttons: 1,
    shiftKey: false,
    altKey: false,
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
});
