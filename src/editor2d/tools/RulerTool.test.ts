import { beforeEach, describe, expect, it } from 'vitest';
import { createDefaultProject } from '@/core/constants';
import { mapRegistry } from '@/core/maps/MapRegistry';
import { RulerTool } from '@/editor2d/tools/RulerTool';
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
    setRulerLine: (line) => useEditorStore.getState().setRulerLine(line),
    onLockedMapAttempt: () => {},
  };
}

describe('RulerTool', () => {
  beforeEach(() => {
    useEditorStore.getState().setRulerLine(null);
  });

  it('creates a segment, allows dragging endpoints, and snaps with Shift', () => {
    const tool = new RulerTool();
    const ctx = makeCtx();

    // Draw initial line from (100, 100) to (280, 340) => dx=180, dy=240
    tool.onDown(makePointerEvent(100, 100), ctx);
    tool.onMove(makePointerEvent(280, 340), ctx);
    tool.onUp(makePointerEvent(280, 340), ctx);

    expect(useEditorStore.getState().rulerLine).toEqual({
      p0: { x: 100, y: 100 },
      p1: { x: 280, y: 340 },
    });

    // Drag endpoint p1 near (280, 340) to (400, 100) with Shift -> horizontal snap (0 deg)
    tool.onDown(makePointerEvent(282, 338), ctx);
    tool.onMove(makePointerEvent(400, 108, true), ctx);
    tool.onUp(makePointerEvent(400, 108, true), ctx);

    const afterDragP1 = useEditorStore.getState().rulerLine;
    expect(afterDragP1?.p0).toEqual({ x: 100, y: 100 });
    expect(afterDragP1?.p1.y).toBeCloseTo(100, 3);
    expect(afterDragP1?.p1.x).toBeGreaterThan(390);

    // Drag endpoint p0 near (100, 100) to (150, 200)
    tool.onDown(makePointerEvent(103, 98), ctx);
    tool.onMove(makePointerEvent(150, 200), ctx);
    tool.onUp(makePointerEvent(150, 200), ctx);

    const afterDragP0 = useEditorStore.getState().rulerLine;
    expect(afterDragP0?.p0).toEqual({ x: 150, y: 200 });
    expect(afterDragP0?.p1.y).toBeCloseTo(100, 3);
  });

  it('clears the ruler on a stationary click when creating a new line away from endpoints', () => {
    const tool = new RulerTool();
    const ctx = makeCtx();

    useEditorStore.getState().setRulerLine({ p0: { x: 50, y: 50 }, p1: { x: 200, y: 50 } });

    tool.onDown(makePointerEvent(500, 500), ctx);
    tool.onUp(makePointerEvent(500, 500), ctx);

    expect(useEditorStore.getState().rulerLine).toBeNull();
  });
});
