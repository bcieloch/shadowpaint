import { proxy, transfer } from 'comlink';
import { estimateSelectionEntryBytes, type SelectionHistoryEntry } from '@/core/history/commands';
import { mapRegistry } from '@/core/maps/MapRegistry';
import type { MapId, Rect, SelectionCombineMode, SelectionMode } from '@/core/types';
import {
  clearSelectionMask,
  combineSelectionMasks,
  createMagicWandMask,
  featherSelectionMask,
  invertSelectionMask,
  selectAllMask,
} from '@/imaging/selectionOps';
import { flushDirtyEffectiveTiles } from '@/services/adjustService';
import { useEditorStore } from '@/state/editorStore';
import { useHistoryStore } from '@/state/historyStore';
import { useProjectStore } from '@/state/projectStore';
import { getImageWorker } from '@/workers/client';
import { runTask } from '@/workers/tasks';

export type SelectionActionKind =
  | 'selectShape'
  | 'selectWand'
  | 'selectAll'
  | 'selectClear'
  | 'selectInvert'
  | 'selectFeather'
  | 'maskBrush';

function buffersEqual(a: Uint8Array, b: Uint8Array): boolean {
  if (a.length !== b.length) return false;
  for (let i = 0; i < a.length; i++) {
    if (a[i] !== b[i]) return false;
  }
  return true;
}

export function commitSelectionMaskChange(params: {
  action: SelectionActionKind;
  nextMask: Uint8Array;
  beforeMask?: Uint8Array;
  dirtyRect?: Rect;
  nextMode?: SelectionMode;
  nextFeatherPx?: number;
}): void {
  if (!mapRegistry.isAllocated) return;
  const projectStore = useProjectStore.getState();
  const modeBefore = projectStore.project.selection.mode;
  const modeAfter = params.nextMode ?? modeBefore;
  const before = params.beforeMask ?? new Uint8Array(mapRegistry.selection);
  const after = new Uint8Array(params.nextMask);

  if (buffersEqual(before, after) && modeBefore === modeAfter) {
    return;
  }

  mapRegistry.selection.set(after);

  projectStore.updateProject((draft) => {
    draft.selection.mode = modeAfter;
    if (params.nextFeatherPx !== undefined) {
      draft.selection.feather = params.nextFeatherPx;
    }
  }, true);

  const entry: Omit<SelectionHistoryEntry, 'seq'> = {
    kind: 'selection',
    meta: { action: params.action },
    before,
    after,
    modeBefore,
    modeAfter,
    byteSize: estimateSelectionEntryBytes(before, after),
  };
  useHistoryStore.getState().pushSelectionEntry(entry);

  const hasSel = mapRegistry.refreshSelectionState();
  useEditorStore.getState().setHasSelection(hasSel);
  mapRegistry.emitSelectionChanged(params.dirtyRect);
}

export function recordMaskBrushStroke(beforeMask: Uint8Array, dirtyRect?: Rect): void {
  if (!mapRegistry.isAllocated) return;
  const after = new Uint8Array(mapRegistry.selection);
  if (buffersEqual(beforeMask, after)) {
    return;
  }

  const mode = useProjectStore.getState().project.selection.mode;
  useProjectStore.getState().updateProject(() => {}, true);
  useHistoryStore.getState().pushSelectionEntry({
    kind: 'selection',
    meta: { action: 'maskBrush' },
    before: beforeMask,
    after,
    modeBefore: mode,
    modeAfter: mode,
    byteSize: estimateSelectionEntryBytes(beforeMask, after),
  });

  const hasSel = mapRegistry.refreshSelectionState();
  useEditorStore.getState().setHasSelection(hasSel);
  mapRegistry.emitSelectionChanged(dirtyRect);
}

export function applyShapeSelection(
  shapeMask: Uint8Array,
  combineMode: SelectionCombineMode,
): void {
  if (!mapRegistry.isAllocated) return;
  const before = new Uint8Array(mapRegistry.selection);
  const next = combineSelectionMasks(before, shapeMask, combineMode);
  commitSelectionMaskChange({
    action: 'selectShape',
    beforeMask: before,
    nextMask: next,
  });
}

let wandSeq = 0;

export async function runMagicWandAt(
  seedX: number,
  seedY: number,
  combineOverride?: SelectionCombineMode,
): Promise<void> {
  if (!mapRegistry.isAllocated) return;
  const seq = ++wandSeq;
  const { width, height } = mapRegistry;
  const editor = useEditorStore.getState();
  const { combineMode, wandTolerancePct, wandContiguous, wandSampleMap } = editor.selectionTools;
  const effectiveCombine = combineOverride ?? combineMode;
  const sourceKind: MapId = wandSampleMap === 'active' ? editor.activeMap : wandSampleMap;

  flushDirtyEffectiveTiles(sourceKind, true);

  const totalPixels = width * height;
  let wandMask: Uint8Array;

  if (typeof Worker !== 'undefined' && totalPixels >= 131072) {
    const worker = getImageWorker();
    if (sourceKind === 'color') {
      const colorCopy = new Uint8ClampedArray(mapRegistry.color.effective);
      wandMask = await runTask({ labelKey: 'selection.taskWand', cancellable: false }, async () =>
        worker.magicWandSelection(
          transfer(
            {
              width,
              height,
              seedX,
              seedY,
              tolerancePct: wandTolerancePct,
              contiguous: wandContiguous,
              sourceKind,
              colorData: colorCopy,
            },
            [colorCopy.buffer],
          ),
        ),
      );
    } else {
      const scalarCopy = new Float32Array(mapRegistry.getMap(sourceKind).effective);
      wandMask = await runTask({ labelKey: 'selection.taskWand', cancellable: false }, async () =>
        worker.magicWandSelection(
          transfer(
            {
              width,
              height,
              seedX,
              seedY,
              tolerancePct: wandTolerancePct,
              contiguous: wandContiguous,
              sourceKind,
              scalarData: scalarCopy,
            },
            [scalarCopy.buffer],
          ),
        ),
      );
    }
    if (seq !== wandSeq || !mapRegistry.isAllocated) return;
  } else {
    wandMask = createMagicWandMask({
      width,
      height,
      seedX,
      seedY,
      tolerancePct: wandTolerancePct,
      contiguous: wandContiguous,
      sourceKind,
      colorData: sourceKind === 'color' ? mapRegistry.color.effective : undefined,
      scalarData: sourceKind === 'color' ? undefined : mapRegistry.getMap(sourceKind).effective,
    });
  }

  const before = new Uint8Array(mapRegistry.selection);
  const next = combineSelectionMasks(before, wandMask, effectiveCombine);
  commitSelectionMaskChange({
    action: 'selectWand',
    beforeMask: before,
    nextMask: next,
  });
}

export function selectAllSelection(): void {
  if (!mapRegistry.isAllocated) return;
  const before = new Uint8Array(mapRegistry.selection);
  const next = new Uint8Array(before.length);
  selectAllMask(next);
  commitSelectionMaskChange({
    action: 'selectAll',
    beforeMask: before,
    nextMask: next,
  });
}

export function clearSelection(): void {
  if (!mapRegistry.isAllocated) return;
  const before = new Uint8Array(mapRegistry.selection);
  const next = new Uint8Array(before.length);
  clearSelectionMask(next);
  commitSelectionMaskChange({
    action: 'selectClear',
    beforeMask: before,
    nextMask: next,
  });
}

export function invertSelection(): void {
  if (!mapRegistry.isAllocated) return;
  const before = new Uint8Array(mapRegistry.selection);
  const next = invertSelectionMask(before);
  commitSelectionMaskChange({
    action: 'selectInvert',
    beforeMask: before,
    nextMask: next,
  });
}

export async function featherSelection(radiusPx: number): Promise<void> {
  if (!mapRegistry.isAllocated || !mapRegistry.hasSelection) return;
  const clampedRadius = Math.max(0, Math.min(128, radiusPx));
  if (clampedRadius <= 0) return;

  const { width, height } = mapRegistry;
  const before = new Uint8Array(mapRegistry.selection);
  let feathered: Uint8Array;

  if (typeof Worker !== 'undefined') {
    const srcCopy = new Uint8Array(before);
    const worker = getImageWorker();
    feathered = await runTask(
      { labelKey: 'selection.taskFeather', cancellable: false },
      async (ctx) =>
        worker.featherSelectionMask(
          transfer(srcCopy, [srcCopy.buffer]),
          width,
          height,
          clampedRadius,
          proxy((p: number) => ctx.setProgress(p)),
        ),
    );
  } else {
    feathered = featherSelectionMask(before, width, height, clampedRadius);
  }

  if (!mapRegistry.isAllocated) return;
  commitSelectionMaskChange({
    action: 'selectFeather',
    beforeMask: before,
    nextMask: feathered,
    nextFeatherPx: clampedRadius,
  });
}

export function setSelectionProtectMode(mode: SelectionMode): void {
  const projectStore = useProjectStore.getState();
  const current = projectStore.project.selection;
  if (current.mode === mode) return;

  const before = { ...current };
  projectStore.updateProject((draft) => {
    draft.selection.mode = mode;
  }, true);
  const after = { ...useProjectStore.getState().project.selection };

  useHistoryStore.getState().pushSettingsEntry({
    kind: 'settings',
    meta: { action: 'settingsChange' },
    patch: {
      path: 'selection',
      before,
      after,
    },
    byteSize: 512,
  });
}
