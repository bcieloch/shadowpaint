import { beforeEach, describe, expect, it } from 'vitest';
import { mapRegistry } from '@/core/maps/MapRegistry';
import { BrushTool } from '@/editor2d/tools/BrushTool';
import type { Tool, ToolContext, ToolPointerEvent } from '@/editor2d/tools/Tool';
import { createRectSelectionMask } from '@/imaging/selectionOps';
import {
  recordSettingsPatchHistory,
  recordTileHistory,
  redoGlobal,
  undoGlobal,
  undoMap,
} from '@/services/historyService';
import { createAndActivateProject } from '@/services/projectService';
import {
  applyShapeSelection,
  clearSelection,
  featherSelection,
  invertSelection,
  selectAllSelection,
  setSelectionProtectMode,
} from '@/services/selectionService';
import { useEditorStore } from '@/state/editorStore';
import {
  selectGlobalRedoEntry,
  selectGlobalUndoEntry,
  useHistoryStore,
} from '@/state/historyStore';
import { useProjectStore } from '@/state/projectStore';

function makePointerEvent(x: number, y: number): ToolPointerEvent {
  return {
    imagePos: { x, y },
    screenPos: { x, y },
    pressure: 1,
    pointerType: 'mouse',
    buttons: 1,
    shiftKey: false,
    altKey: false,
  };
}

function makeToolContext(): ToolContext {
  return {
    registry: mapRegistry,
    getProject: () => useProjectStore.getState().project,
    getEditor: () => useEditorStore.getState(),
    setBrushOption: (key, value) => useEditorStore.getState().setBrushOption(key, value),
    onLockedMapAttempt: () => {},
    recordMapTileEntry: recordTileHistory,
  };
}

describe('historyStore and historyService', () => {
  beforeEach(() => {
    createAndActivateProject({
      canvas: {
        widthCm: 10,
        heightCm: 10,
        widthPx: 128,
        heightPx: 128,
        minThicknessMm: 0,
        maxThicknessMm: 5,
      },
    });
    useEditorStore.getState().setBrushOption('sizeUnit', 'px');
    useEditorStore.getState().setBrushOption('sizeValue', 12);
    useEditorStore.getState().setBrushOption('hardness', 1);
    useEditorStore.getState().setBrushOption('flow', 1);
    useEditorStore.getState().setBrushOption('mode', 'set');
    useEditorStore.getState().setBrushOption('colorHex', '#cc2211');
    useEditorStore.getState().setBrushOption('heightMm', 4);
  });

  it('global undo and redo restore map buffers byte-for-byte in seq order', () => {
    const initialColor = new Uint8ClampedArray(mapRegistry.color.effective);
    const initialHeight = new Float32Array(mapRegistry.heightMap.effective);

    const ctx = makeToolContext();
    const brush: Tool = new BrushTool();

    // 1. Paint Color
    useEditorStore.getState().setActiveMap('color');
    brush.onDown(makePointerEvent(32, 32), ctx);
    brush.onUp(makePointerEvent(32, 32), ctx);
    const afterColor = new Uint8ClampedArray(mapRegistry.color.effective);
    expect(afterColor).not.toEqual(initialColor);

    // 2. Paint Height
    useEditorStore.getState().setActiveMap('height');
    brush.onDown(makePointerEvent(64, 64), ctx);
    brush.onUp(makePointerEvent(64, 64), ctx);
    const afterHeight = new Float32Array(mapRegistry.heightMap.effective);
    expect(afterHeight).not.toEqual(initialHeight);

    // Global undo #1 must undo Height (highest seq)
    const undone1 = undoGlobal();
    expect(undone1?.meta.mapId).toBe('height');
    expect(mapRegistry.heightMap.effective).toEqual(initialHeight);
    expect(mapRegistry.color.effective).toEqual(afterColor);

    // Global undo #2 must undo Color
    const undone2 = undoGlobal();
    expect(undone2?.meta.mapId).toBe('color');
    expect(mapRegistry.color.effective).toEqual(initialColor);

    // Global redo restores Color then Height byte-for-byte
    const redone1 = redoGlobal();
    expect(redone1?.meta.mapId).toBe('color');
    expect(mapRegistry.color.effective).toEqual(afterColor);
    expect(mapRegistry.heightMap.effective).toEqual(initialHeight);

    const redone2 = redoGlobal();
    expect(redone2?.meta.mapId).toBe('height');
    expect(mapRegistry.heightMap.effective).toEqual(afterHeight);
  });

  it('per-map undo restores only that map without altering other maps', () => {
    const initialColor = new Uint8ClampedArray(mapRegistry.color.working);
    const ctx = makeToolContext();
    const brush: Tool = new BrushTool();

    useEditorStore.getState().setActiveMap('color');
    brush.onDown(makePointerEvent(32, 32), ctx);
    brush.onUp(makePointerEvent(32, 32), ctx);

    useEditorStore.getState().setActiveMap('height');
    brush.onDown(makePointerEvent(64, 64), ctx);
    brush.onUp(makePointerEvent(64, 64), ctx);
    const heightAfterPaint = new Float32Array(mapRegistry.heightMap.working);

    const undoneColor = undoMap('color');
    expect(undoneColor?.mapId).toBe('color');
    expect(mapRegistry.color.working).toEqual(initialColor);
    expect(mapRegistry.heightMap.working).toEqual(heightAfterPaint);
  });

  it('clears redo only for the target stack when a new action is recorded', () => {
    const ctx = makeToolContext();
    const brush: Tool = new BrushTool();

    useEditorStore.getState().setActiveMap('height');
    brush.onDown(makePointerEvent(40, 40), ctx);
    brush.onUp(makePointerEvent(40, 40), ctx);

    useEditorStore.getState().setActiveMap('color');
    brush.onDown(makePointerEvent(40, 40), ctx);
    brush.onUp(makePointerEvent(40, 40), ctx);

    // Undo both color and height
    undoGlobal();
    undoGlobal();
    expect(useHistoryStore.getState().stacks.color.redo).toHaveLength(1);
    expect(useHistoryStore.getState().stacks.height.redo).toHaveLength(1);

    // Paint new stroke on color -> only color.redo clears; height.redo stays intact
    useEditorStore.getState().setActiveMap('color');
    brush.onDown(makePointerEvent(80, 80), ctx);
    brush.onUp(makePointerEvent(80, 80), ctx);

    expect(useHistoryStore.getState().stacks.color.redo).toHaveLength(0);
    expect(useHistoryStore.getState().stacks.height.redo).toHaveLength(1);
  });

  it('undoes and redoes settings adjustments and updates effective map', () => {
    const initialHeightEffective = new Float32Array(mapRegistry.heightMap.effective);
    const before = { ...useProjectStore.getState().project.adjustments.height };
    const after = { ...before, invert: true };

    useProjectStore.getState().updateProject((d) => {
      d.adjustments.height = after;
    });
    recordSettingsPatchHistory('adjustment', {
      path: 'adjustments.height',
      affectedMapId: 'height',
      before,
      after,
    });

    undoGlobal();
    expect(useProjectStore.getState().project.adjustments.height.invert).toBe(false);
    expect(mapRegistry.heightMap.effective).toEqual(initialHeightEffective);

    redoGlobal();
    expect(useProjectStore.getState().project.adjustments.height.invert).toBe(true);
    expect(mapRegistry.heightMap.effective[0]).toBeCloseTo(1, 5);
  });

  it('undoes and redoes lighting settings patches cleanly with deep clone', () => {
    const before = structuredClone(useProjectStore.getState().project.lighting);
    const after = structuredClone(before);
    after.front.xCm = 90;
    after.front.castShadows = false;
    after.front.color.mode = 'rgb';
    after.front.color.rgb = '#ff9944';
    after.exposure = 1.4;

    useProjectStore.getState().updateProject((d) => {
      d.lighting = structuredClone(after);
    });
    recordSettingsPatchHistory('settingsChange', {
      path: 'lighting',
      before,
      after,
    });

    expect(useProjectStore.getState().project.lighting.front.xCm).toBe(90);
    expect(useProjectStore.getState().project.lighting.front.castShadows).toBe(false);

    undoGlobal();
    expect(useProjectStore.getState().project.lighting).toEqual(before);

    redoGlobal();
    expect(useProjectStore.getState().project.lighting).toEqual(after);
  });

  it('undoes and redoes material settings patches cleanly', () => {
    const before = structuredClone(useProjectStore.getState().project.material);
    const after = structuredClone(before);
    after.muA = 0.85;
    after.muS = 1.4;
    after.kTint = 0.72;
    after.canvasTransmittance = 0.4;
    after.canvasBackColor = '#e8dfd0';
    after.roughness = 0.35;

    useProjectStore.getState().updateProject((d) => {
      d.material = structuredClone(after);
    });
    recordSettingsPatchHistory('settingsChange', {
      path: 'material',
      before,
      after,
    });

    expect(useProjectStore.getState().project.material.muA).toBe(0.85);
    expect(useProjectStore.getState().project.material.canvasBackColor).toBe('#e8dfd0');

    undoGlobal();
    expect(useProjectStore.getState().project.material).toEqual(before);

    redoGlobal();
    expect(useProjectStore.getState().project.material).toEqual(after);
  });

  it('undoes and redoes export settings patches cleanly', () => {
    const before = structuredClone(useProjectStore.getState().project.export);
    const after = structuredClone(before);
    after.pdfPageSize = 'A3';
    after.pdfOrientation = 'portrait';
    after.previewLongestSide = 1024;
    after.includePreviews = false;
    after.colorPngAlpha = true;

    useProjectStore.getState().updateProject((d) => {
      d.export = structuredClone(after);
    });
    recordSettingsPatchHistory('settingsChange', {
      path: 'export',
      before,
      after,
    });

    expect(useProjectStore.getState().project.export.pdfPageSize).toBe('A3');
    undoGlobal();
    expect(useProjectStore.getState().project.export).toEqual(before);
    redoGlobal();
    expect(useProjectStore.getState().project.export).toEqual(after);
  });

  it('undoes and redoes selection mask operations and mode changes byte-for-byte', async () => {
    const rectMask = createRectSelectionMask(128, 128, { x: 16, y: 16, w: 32, h: 32 });
    applyShapeSelection(rectMask, 'replace');
    expect(useEditorStore.getState().hasSelection).toBe(true);
    expect(mapRegistry.selection[20 * 128 + 20]).toBe(255);
    expect(mapRegistry.selection[5 * 128 + 5]).toBe(0);

    setSelectionProtectMode('editInside');
    expect(useProjectStore.getState().project.selection.mode).toBe('editInside');

    invertSelection();
    expect(mapRegistry.selection[20 * 128 + 20]).toBe(0);
    expect(mapRegistry.selection[5 * 128 + 5]).toBe(255);

    await featherSelection(3);
    expect(mapRegistry.selection[16 * 128 + 16]).toBeGreaterThan(0);
    expect(mapRegistry.selection[16 * 128 + 16]).toBeLessThan(255);

    selectAllSelection();
    expect(mapRegistry.selection[20 * 128 + 20]).toBe(255);

    clearSelection();
    expect(useEditorStore.getState().hasSelection).toBe(false);
    expect(mapRegistry.selection[20 * 128 + 20]).toBe(0);

    // Undo back through clear -> selectAll -> feather -> invert -> mode -> shape
    undoGlobal(); // undo clear -> all 255
    expect(useEditorStore.getState().hasSelection).toBe(true);
    expect(mapRegistry.selection[20 * 128 + 20]).toBe(255);

    undoGlobal(); // undo selectAll -> feathered inverted
    undoGlobal(); // undo feather -> inverted
    expect(mapRegistry.selection[20 * 128 + 20]).toBe(0);
    expect(mapRegistry.selection[5 * 128 + 5]).toBe(255);

    undoGlobal(); // undo invert -> original rect
    expect(mapRegistry.selection[20 * 128 + 20]).toBe(255);

    undoGlobal(); // undo mode change
    expect(useProjectStore.getState().project.selection.mode).toBe('protect');

    undoGlobal(); // undo shape -> empty selection
    expect(useEditorStore.getState().hasSelection).toBe(false);
    expect(mapRegistry.selection[20 * 128 + 20]).toBe(0);

    // Redo shape -> restored byte-for-byte
    redoGlobal();
    expect(useEditorStore.getState().hasSelection).toBe(true);
    expect(mapRegistry.selection).toEqual(rectMask);
  });

  it('evicts oldest entries when step limit or memory limit is exceeded', () => {
    const ctx = makeToolContext();
    const brush: Tool = new BrushTool();
    useEditorStore.getState().setActiveMap('height');

    // Limit to 3 steps total
    useHistoryStore.getState().setLimits({ maxSteps: 3 });

    for (let i = 0; i < 5; i++) {
      brush.onDown(makePointerEvent(16 + i * 20, 16), ctx);
      brush.onUp(makePointerEvent(16 + i * 20, 16), ctx);
    }

    expect(useHistoryStore.getState().stacks.height.undo).toHaveLength(3);
    expect(useHistoryStore.getState().stacks.height.undo[0]?.seq).toBe(3);

    // Now constrain memory limit so oldest entries are evicted until totalBytes <= maxBytes
    const singleEntryBytes = useHistoryStore.getState().stacks.height.undo[2]?.byteSize ?? 1;
    useHistoryStore.getState().setLimits({ maxBytes: singleEntryBytes * 2 - 1 });
    expect(useHistoryStore.getState().stacks.height.undo).toHaveLength(1);
    expect(useHistoryStore.getState().totalBytes).toBeLessThanOrEqual(singleEntryBytes * 2 - 1);
  });

  it('clears history on creating a new project', () => {
    const ctx = makeToolContext();
    const brush: Tool = new BrushTool();
    brush.onDown(makePointerEvent(20, 20), ctx);
    brush.onUp(makePointerEvent(20, 20), ctx);

    expect(selectGlobalUndoEntry(useHistoryStore.getState())).not.toBeNull();

    createAndActivateProject({
      canvas: { widthCm: 10, heightCm: 10, widthPx: 64, heightPx: 64 },
    });

    expect(selectGlobalUndoEntry(useHistoryStore.getState())).toBeNull();
    expect(selectGlobalRedoEntry(useHistoryStore.getState())).toBeNull();
    expect(useHistoryStore.getState().totalBytes).toBe(0);
  });
});
