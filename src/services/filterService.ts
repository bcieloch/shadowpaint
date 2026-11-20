import { proxy, transfer } from 'comlink';
import type { HistoryActionKind } from '@/core/history/commands';
import { TileHistoryTransaction } from '@/core/history/TileHistory';
import { recomputeEffectiveRect } from '@/core/maps/adjustments';
import { mapRegistry } from '@/core/maps/MapRegistry';
import { clamp01 } from '@/core/maps/quantize';
import { clampRect, isEmptyRect } from '@/core/maps/rect';
import type { MapId, Rect, Vec2 } from '@/core/types';
import { mmToValue } from '@/core/units/calibration';
import { hexToRgb01 } from '@/core/units/colorTemperature';
import {
  gaussianBlurPatchInnerFloat32,
  gaussianBlurPatchInnerRgba8,
  getGaussianKernelPad,
} from '@/imaging/blur';
import {
  applyFloodFillFloat32,
  applyFloodFillRgba8,
  applySelectionFillFloat32,
  applySelectionFillRgba8,
} from '@/imaging/floodFill';
import { applyGradientFloat32, applyGradientRgba8, type GradientKind } from '@/imaging/gradient';
import { recordTileHistory } from '@/services/historyService';
import { useEditorStore } from '@/state/editorStore';
import { useProjectStore } from '@/state/projectStore';
import { getImageWorker } from '@/workers/client';
import { runTask } from '@/workers/tasks';

export interface ApplyRegionBlurStrokeParams {
  mapId: MapId;
  rect: Rect;
  kernelRadiusPx: number;
  weightMask: Float32Array;
}

function hexToRgb255(hex: string): readonly [number, number, number] {
  const rgb01 = hexToRgb01(hex);
  return [Math.round(rgb01.r * 255), Math.round(rgb01.g * 255), Math.round(rgb01.b * 255)];
}

function commitWorkerBufferWithTileHistory(params: {
  mapId: MapId;
  action: HistoryActionKind;
  dirtyRect: Rect;
  rgba8?: Uint8ClampedArray;
  scalar?: Float32Array;
}): void {
  const project = useProjectStore.getState().project;
  const tx = new TileHistoryTransaction(mapRegistry, params.mapId, params.action, 'working');
  tx.ensureTilesForRect(params.dirtyRect);

  const width = mapRegistry.width;
  const rect = params.dirtyRect;

  if (params.mapId === 'color' && params.rgba8) {
    const working = mapRegistry.color.working;
    for (let y = rect.y; y < rect.y + rect.h; y++) {
      const start = (y * width + rect.x) * 4;
      const end = start + rect.w * 4;
      working.set(params.rgba8.subarray(start, end), start);
    }
  } else if (params.scalar) {
    const working = mapRegistry.getMap(params.mapId).working as Float32Array;
    for (let y = rect.y; y < rect.y + rect.h; y++) {
      const start = y * width + rect.x;
      const end = start + rect.w;
      working.set(params.scalar.subarray(start, end), start);
    }
  }

  const entry = tx.commit();
  if (entry) {
    recordTileHistory(entry);
  }
  recomputeEffectiveRect(mapRegistry, params.mapId, project.adjustments, rect);
  mapRegistry.emitDirty(params.mapId, rect);
}

export async function applyRegionBlurStroke(params: ApplyRegionBlurStrokeParams): Promise<void> {
  if (!mapRegistry.isAllocated || params.kernelRadiusPx <= 0.25) return;

  const width = mapRegistry.width;
  const height = mapRegistry.height;
  const rect = clampRect(params.rect, width, height);
  if (isEmptyRect(rect)) return;

  const expectedLen = rect.w * rect.h;
  if (params.weightMask.length !== expectedLen) return;

  let hasNonZeroWeight = false;
  for (let i = 0; i < expectedLen; i++) {
    if ((params.weightMask[i] ?? 0) > 0) {
      hasNonZeroWeight = true;
      break;
    }
  }
  if (!hasNonZeroWeight) return;

  const projectIdAtStart = useProjectStore.getState().project.id;
  const pad = getGaussianKernelPad(params.kernelRadiusPx);
  const px0 = Math.max(0, rect.x - pad);
  const py0 = Math.max(0, rect.y - pad);
  const px1 = Math.min(width, rect.x + rect.w + pad);
  const py1 = Math.min(height, rect.y + rect.h + pad);
  const pw = px1 - px0;
  const ph = py1 - py0;
  if (pw <= 0 || ph <= 0) return;

  const innerX = rect.x - px0;
  const innerY = rect.y - py0;
  const innerW = rect.w;
  const innerH = rect.h;

  let blurredRgba: Uint8ClampedArray | undefined;
  let blurredScalar: Float32Array | undefined;

  if (params.mapId === 'color') {
    const src = mapRegistry.color.working;
    const patch = new Uint8ClampedArray(pw * ph * 4);
    for (let y = 0; y < ph; y++) {
      const sOff = ((py0 + y) * width + px0) * 4;
      patch.set(src.subarray(sOff, sOff + pw * 4), y * pw * 4);
    }

    if (typeof Worker !== 'undefined') {
      const worker = getImageWorker();
      const res = await runTask(
        { labelKey: 'toolOptions.taskBlurStroke', cancellable: false },
        async (ctx) =>
          worker.blurRegion(
            transfer(
              {
                mapId: 'color',
                patchW: pw,
                patchH: ph,
                innerX,
                innerY,
                innerW,
                innerH,
                radiusPx: params.kernelRadiusPx,
                rgba8: patch,
              },
              [patch.buffer],
            ),
            proxy((p: number) => ctx.setProgress(p)),
          ),
      );
      blurredRgba = res.rgba8;
    } else {
      blurredRgba = gaussianBlurPatchInnerRgba8(
        patch,
        pw,
        ph,
        { x: innerX, y: innerY, w: innerW, h: innerH },
        params.kernelRadiusPx,
      );
    }
  } else {
    const src = mapRegistry.getMap(params.mapId).working as Float32Array;
    const patch = new Float32Array(pw * ph);
    for (let y = 0; y < ph; y++) {
      const sOff = (py0 + y) * width + px0;
      patch.set(src.subarray(sOff, sOff + pw), y * pw);
    }

    if (typeof Worker !== 'undefined') {
      const worker = getImageWorker();
      const res = await runTask(
        { labelKey: 'toolOptions.taskBlurStroke', cancellable: false },
        async (ctx) =>
          worker.blurRegion(
            transfer(
              {
                mapId: params.mapId,
                patchW: pw,
                patchH: ph,
                innerX,
                innerY,
                innerW,
                innerH,
                radiusPx: params.kernelRadiusPx,
                scalar: patch,
              },
              [patch.buffer],
            ),
            proxy((p: number) => ctx.setProgress(p)),
          ),
      );
      blurredScalar = res.scalar;
    } else {
      blurredScalar = gaussianBlurPatchInnerFloat32(
        patch,
        pw,
        ph,
        { x: innerX, y: innerY, w: innerW, h: innerH },
        params.kernelRadiusPx,
      );
    }
  }

  const project = useProjectStore.getState().project;
  if (
    !mapRegistry.isAllocated ||
    mapRegistry.width !== width ||
    mapRegistry.height !== height ||
    project.id !== projectIdAtStart
  ) {
    return;
  }

  if (project.maps[params.mapId].locked) return;

  const tx = new TileHistoryTransaction(mapRegistry, params.mapId, 'blurStroke', 'working');
  tx.ensureTilesForRect(rect);

  if (params.mapId === 'color' && blurredRgba) {
    const working = mapRegistry.color.working;
    for (let ly = 0; ly < rect.h; ly++) {
      const imgRow = (rect.y + ly) * width + rect.x;
      const patchRow = ly * rect.w;
      for (let lx = 0; lx < rect.w; lx++) {
        const w = params.weightMask[patchRow + lx] ?? 0;
        if (w <= 0) continue;
        const di = (imgRow + lx) * 4;
        const si = (patchRow + lx) * 4;
        working[di] = Math.round(
          (working[di] ?? 0) + ((blurredRgba[si] ?? 0) - (working[di] ?? 0)) * w,
        );
        working[di + 1] = Math.round(
          (working[di + 1] ?? 0) + ((blurredRgba[si + 1] ?? 0) - (working[di + 1] ?? 0)) * w,
        );
        working[di + 2] = Math.round(
          (working[di + 2] ?? 0) + ((blurredRgba[si + 2] ?? 0) - (working[di + 2] ?? 0)) * w,
        );
      }
    }
  } else if (blurredScalar) {
    const working = mapRegistry.getMap(params.mapId).working as Float32Array;
    for (let ly = 0; ly < rect.h; ly++) {
      const imgRow = (rect.y + ly) * width + rect.x;
      const patchRow = ly * rect.w;
      for (let lx = 0; lx < rect.w; lx++) {
        const w = params.weightMask[patchRow + lx] ?? 0;
        if (w <= 0) continue;
        const idx = imgRow + lx;
        const cur = working[idx] ?? 0;
        const target = blurredScalar[patchRow + lx] ?? cur;
        working[idx] = clamp01(cur + (target - cur) * w);
      }
    }
  }

  const entry = tx.commit();
  if (entry) {
    recordTileHistory(entry);
  }
  recomputeEffectiveRect(mapRegistry, params.mapId, project.adjustments, rect);
  mapRegistry.emitDirty(params.mapId, rect);
}

export async function applyGradientToActiveMap(params: {
  mapId: MapId;
  kind: GradientKind;
  p0: Vec2;
  p1: Vec2;
}): Promise<void> {
  if (!mapRegistry.isAllocated) return;
  const project = useProjectStore.getState().project;
  if (project.maps[params.mapId].locked) return;

  const editor = useEditorStore.getState();
  const { width, height } = mapRegistry;
  const projectIdAtStart = project.id;
  const gradOpts = editor.gradientTool;
  const selectionMode = project.selection.mode;

  const startRgb = hexToRgb255(gradOpts.startColorHex);
  const endRgb = hexToRgb255(gradOpts.endColorHex);
  const startValue =
    params.mapId === 'height'
      ? mmToValue(
          gradOpts.startHeightMm,
          project.canvas.minThicknessMm,
          project.canvas.maxThicknessMm,
        )
      : clamp01(gradOpts.startOpacityPct / 100);
  const endValue =
    params.mapId === 'height'
      ? mmToValue(
          gradOpts.endHeightMm,
          project.canvas.minThicknessMm,
          project.canvas.maxThicknessMm,
        )
      : clamp01(gradOpts.endOpacityPct / 100);

  let outRgba: Uint8ClampedArray | undefined;
  let outScalar: Float32Array | undefined;
  let dirtyRect: Rect | null;

  if (typeof Worker !== 'undefined') {
    const worker = getImageWorker();
    const maskCopy = mapRegistry.hasSelection ? new Uint8Array(mapRegistry.selection) : undefined;
    if (params.mapId === 'color') {
      const workCopy = new Uint8ClampedArray(mapRegistry.color.working);
      const transferables: Transferable[] = [workCopy.buffer];
      if (maskCopy) transferables.push(maskCopy.buffer);
      const res = await runTask(
        { labelKey: 'toolOptions.taskGradient', cancellable: false },
        async (ctx) =>
          worker.gradientFill(
            transfer(
              {
                mapId: 'color',
                width,
                height,
                kind: params.kind,
                p0: params.p0,
                p1: params.p1,
                onlyInSelection: gradOpts.onlyInSelection,
                selectionMode,
                startRgb,
                endRgb,
                rgba8: workCopy,
                mask: maskCopy,
              },
              transferables,
            ),
            proxy((p: number) => ctx.setProgress(p)),
          ),
      );
      outRgba = res.rgba8;
      dirtyRect = res.dirtyRect;
    } else {
      const workCopy = new Float32Array(mapRegistry.getMap(params.mapId).working as Float32Array);
      const transferables: Transferable[] = [workCopy.buffer];
      if (maskCopy) transferables.push(maskCopy.buffer);
      const res = await runTask(
        { labelKey: 'toolOptions.taskGradient', cancellable: false },
        async (ctx) =>
          worker.gradientFill(
            transfer(
              {
                mapId: params.mapId,
                width,
                height,
                kind: params.kind,
                p0: params.p0,
                p1: params.p1,
                onlyInSelection: gradOpts.onlyInSelection,
                selectionMode,
                startValue,
                endValue,
                scalar: workCopy,
                mask: maskCopy,
              },
              transferables,
            ),
            proxy((p: number) => ctx.setProgress(p)),
          ),
      );
      outScalar = res.scalar;
      dirtyRect = res.dirtyRect;
    }
  } else {
    const mask = mapRegistry.hasSelection ? mapRegistry.selection : undefined;
    if (params.mapId === 'color') {
      const res = applyGradientRgba8({
        working: mapRegistry.color.working,
        width,
        height,
        kind: params.kind,
        p0: params.p0,
        p1: params.p1,
        startRgb,
        endRgb,
        mask,
        selectionMode,
        onlyInSelection: gradOpts.onlyInSelection,
      });
      outRgba = res.out;
      dirtyRect = res.dirtyRect;
    } else {
      const res = applyGradientFloat32({
        working: mapRegistry.getMap(params.mapId).working as Float32Array,
        width,
        height,
        kind: params.kind,
        p0: params.p0,
        p1: params.p1,
        startValue,
        endValue,
        mask,
        selectionMode,
        onlyInSelection: gradOpts.onlyInSelection,
      });
      outScalar = res.out;
      dirtyRect = res.dirtyRect;
    }
  }

  const latestProject = useProjectStore.getState().project;
  if (
    !mapRegistry.isAllocated ||
    mapRegistry.width !== width ||
    mapRegistry.height !== height ||
    latestProject.id !== projectIdAtStart ||
    latestProject.maps[params.mapId].locked ||
    !dirtyRect ||
    isEmptyRect(dirtyRect)
  ) {
    return;
  }

  commitWorkerBufferWithTileHistory({
    mapId: params.mapId,
    action: 'gradientFill',
    dirtyRect,
    rgba8: outRgba,
    scalar: outScalar,
  });
}

export async function applyFloodFillToActiveMap(params: {
  mapId: MapId;
  seedX: number;
  seedY: number;
  fillSelectionOnly?: boolean;
}): Promise<void> {
  if (!mapRegistry.isAllocated) return;
  const project = useProjectStore.getState().project;
  if (project.maps[params.mapId].locked) return;

  const editor = useEditorStore.getState();
  const { width, height } = mapRegistry;
  const projectIdAtStart = project.id;
  const fillOpts = editor.fillTool;
  const selectionMode = project.selection.mode;

  const targetRgb = hexToRgb255(editor.brush.colorHex);
  const targetValue =
    params.mapId === 'height'
      ? mmToValue(
          editor.brush.heightMm,
          project.canvas.minThicknessMm,
          project.canvas.maxThicknessMm,
        )
      : clamp01(editor.brush.opacityPct / 100);

  let outRgba: Uint8ClampedArray | undefined;
  let outScalar: Float32Array | undefined;
  let dirtyRect: Rect | null;

  if (typeof Worker !== 'undefined') {
    const worker = getImageWorker();
    const maskCopy = mapRegistry.hasSelection ? new Uint8Array(mapRegistry.selection) : undefined;
    if (params.mapId === 'color') {
      const workCopy = new Uint8ClampedArray(mapRegistry.color.working);
      const transferables: Transferable[] = [workCopy.buffer];
      if (maskCopy) transferables.push(maskCopy.buffer);
      const res = await runTask(
        { labelKey: 'toolOptions.taskFloodFill', cancellable: false },
        async (ctx) =>
          worker.floodFill(
            transfer(
              {
                mapId: 'color',
                width,
                height,
                seedX: params.seedX,
                seedY: params.seedY,
                tolerancePct: fillOpts.tolerancePct,
                contiguous: fillOpts.contiguous,
                fillSelectionOnly: params.fillSelectionOnly,
                selectionMode,
                targetRgb,
                rgba8: workCopy,
                mask: maskCopy,
              },
              transferables,
            ),
            proxy((p: number) => ctx.setProgress(p)),
          ),
      );
      outRgba = res.rgba8;
      dirtyRect = res.dirtyRect;
    } else {
      const workCopy = new Float32Array(mapRegistry.getMap(params.mapId).working as Float32Array);
      const transferables: Transferable[] = [workCopy.buffer];
      if (maskCopy) transferables.push(maskCopy.buffer);
      const res = await runTask(
        { labelKey: 'toolOptions.taskFloodFill', cancellable: false },
        async (ctx) =>
          worker.floodFill(
            transfer(
              {
                mapId: params.mapId,
                width,
                height,
                seedX: params.seedX,
                seedY: params.seedY,
                tolerancePct: fillOpts.tolerancePct,
                contiguous: fillOpts.contiguous,
                fillSelectionOnly: params.fillSelectionOnly,
                selectionMode,
                targetValue,
                scalar: workCopy,
                mask: maskCopy,
              },
              transferables,
            ),
            proxy((p: number) => ctx.setProgress(p)),
          ),
      );
      outScalar = res.scalar;
      dirtyRect = res.dirtyRect;
    }
  } else {
    const mask = mapRegistry.hasSelection ? mapRegistry.selection : undefined;
    if (params.mapId === 'color') {
      const res = params.fillSelectionOnly
        ? applySelectionFillRgba8({
            working: mapRegistry.color.working,
            width,
            height,
            targetRgb,
            mask,
          })
        : applyFloodFillRgba8({
            working: mapRegistry.color.working,
            width,
            height,
            seedX: params.seedX,
            seedY: params.seedY,
            tolerancePct: fillOpts.tolerancePct,
            contiguous: fillOpts.contiguous,
            targetRgb,
            mask,
            selectionMode,
          });
      outRgba = res.out;
      dirtyRect = res.dirtyRect;
    } else {
      const working = mapRegistry.getMap(params.mapId).working as Float32Array;
      const res = params.fillSelectionOnly
        ? applySelectionFillFloat32({
            working,
            width,
            height,
            targetValue,
            mask,
          })
        : applyFloodFillFloat32({
            working,
            width,
            height,
            seedX: params.seedX,
            seedY: params.seedY,
            tolerancePct: fillOpts.tolerancePct,
            contiguous: fillOpts.contiguous,
            targetValue,
            mask,
            selectionMode,
          });
      outScalar = res.out;
      dirtyRect = res.dirtyRect;
    }
  }

  const latestProject = useProjectStore.getState().project;
  if (
    !mapRegistry.isAllocated ||
    mapRegistry.width !== width ||
    mapRegistry.height !== height ||
    latestProject.id !== projectIdAtStart ||
    latestProject.maps[params.mapId].locked ||
    !dirtyRect ||
    isEmptyRect(dirtyRect)
  ) {
    return;
  }

  commitWorkerBufferWithTileHistory({
    mapId: params.mapId,
    action: 'floodFill',
    dirtyRect,
    rgba8: outRgba,
    scalar: outScalar,
  });
}

export async function applyFillSelectionToActiveMap(): Promise<void> {
  const { activeMap } = useEditorStore.getState();
  await applyFloodFillToActiveMap({
    mapId: activeMap,
    seedX: 0,
    seedY: 0,
    fillSelectionOnly: true,
  });
}
