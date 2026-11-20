import { beforeEach, describe, expect, it } from 'vitest';
import { createDefaultProject } from '@/core/constants';
import { mapRegistry } from '@/core/maps/MapRegistry';
import { CrossSectionTool } from '@/editor2d/tools/CrossSectionTool';
import type { ToolContext, ToolPointerEvent } from '@/editor2d/tools/Tool';
import { useEditorStore } from '@/state/editorStore';

function makePointerEvent(x: number, y: number, shiftKey = false): ToolPointerEvent {
  return {
    imagePos: { x, y },
    screenPos: { x, y },
    pressure: 1,
    pointerType: 'mouse',
    buttons: 1,
    shiftKey,
    altKey: false,
  };
}

function makeCtx(): ToolContext {
  const project = createDefaultProject({
    canvas: { widthCm: 50, heightCm: 70, widthPx: 3000, heightPx: 4200 },
  });
  return {
    registry: mapRegistry,
    getProject: () => project,
    getEditor: () => useEditorStore.getState(),
    getZoom: () => 1,
    setBrushOption: (k, v) => useEditorStore.getState().setBrushOption(k, v),
    setCrossSectionLine: (line) => useEditorStore.getState().setCrossSectionLine(line),
    onLockedMapAttempt: () => {},
  };
}

describe('CrossSectionTool', () => {
  beforeEach(() => {
    useEditorStore.getState().setCrossSectionLine(null);
  });

  it('draws a section segment, snaps with Shift, and drags existing endpoints', () => {
    const tool = new CrossSectionTool();
    const ctx = makeCtx();

    tool.onDown(makePointerEvent(120, 140), ctx);
    tool.onMove(makePointerEvent(420, 380), ctx);
    tool.onUp(makePointerEvent(420, 380), ctx);

    expect(useEditorStore.getState().crossSectionLine).toEqual({
      p0: { x: 120, y: 140 },
      p1: { x: 420, y: 380 },
    });

    // Drag p1 with Shift close to horizontal
    tool.onDown(makePointerEvent(421, 381), ctx);
    tool.onMove(makePointerEvent(600, 146, true), ctx);
    tool.onUp(makePointerEvent(600, 146, true), ctx);

    const updated = useEditorStore.getState().crossSectionLine;
    expect(updated?.p0).toEqual({ x: 120, y: 140 });
    expect(updated?.p1.y).toBeCloseTo(140, 3);
    expect(updated?.p1.x).toBeGreaterThan(590);
  });

  it('clears the section line on stationary click away from endpoints', () => {
    const tool = new CrossSectionTool();
    const ctx = makeCtx();

    useEditorStore.getState().setCrossSectionLine({ p0: { x: 50, y: 50 }, p1: { x: 250, y: 50 } });
    tool.onDown(makePointerEvent(800, 800), ctx);
    tool.onUp(makePointerEvent(800, 800), ctx);

    expect(useEditorStore.getState().crossSectionLine).toBeNull();
  });
});
