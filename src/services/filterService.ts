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
import { blurRegionParallel } from '@/workers/pool';
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

function isMapOrLayerLocked(mapId: MapId): boolean {
  const project = useProjectStore.getState().project;
  if (project.maps[mapId].locked) return true;
  if (mapRegistry.isAllocated && mapRegistry.getMap(mapId).activeLayer.locked) return true;
  return false;
}

function commitWorkerBufferWithTileHistory(params: {
  mapId: MapId;
  action: HistoryActionKind;
  dirtyRect: Rect;
  rgba8?: Uint8ClampedArray;
  scalar?: Float32Array;
  sourceRgba8?: Uint8ClampedArray;
  sourceScalar?: Float32Array;
}): void {
  const project = useProjectStore.getState().project;
  const tx = new TileHistoryTransaction(mapRegistry, params.mapId, params.action, 'working');
  tx.ensureTilesForRect(params.dirtyRect);

  const width = mapRegistry.width;
  const rect = params.dirtyRect;
  const buf = mapRegistry.getMap(params.mapId);
  const isOverlay = buf.isOverlayLayerActive;
  const layerMask = buf.activeMask;

  if (params.mapId === 'color' && params.rgba8) {
    const working = mapRegistry.color.working;
    const refBuf = params.sourceRgba8 ?? working;
    for (let y = rect.y; y < rect.y + rect.h; y++) {
      const rowOffset = y * width;
      for (let x = rect.x; x < rect.x + rect.w; x++) {
        const pxIdx = rowOffset + x;
        const p = pxIdx * 4;
        const nr = params.rgba8[p] ?? 0;
        const ng = params.rgba8[p + 1] ?? 0;
        const nb = params.rgba8[p + 2] ?? 0;
        const changed =
          !isOverlay ||
          params.action === 'gradientFill' ||
          nr !== (refBuf[p] ?? 0) ||
          ng !== (refBuf[p + 1] ?? 0) ||
          nb !== (refBuf[p + 2] ?? 0);
        if (changed) {
          working[p] = nr;
          working[p + 1] = ng;
          working[p + 2] = nb;
          working[p + 3] = 255;
          if (isOverlay) {
            layerMask[pxIdx] = 255;
          }
        }
      }
    }
  } else if (params.scalar) {
    const working = buf.working as Float32Array;
    const refBuf = params.sourceScalar ?? working;
    for (let y = rect.y; y < rect.y + rect.h; y++) {
      const rowOffset = y * width;
      for (let x = rect.x; x < rect.x + rect.w; x++) {
        const pxIdx = rowOffset + x;
        const nv = params.scalar[pxIdx] ?? 0;
        const changed =
          !isOverlay || params.action === 'gradientFill' || nv !== (refBuf[pxIdx] ?? 0);
        if (changed) {
          working[pxIdx] = nv;
          if (isOverlay) {
            layerMask[pxIdx] = 255;
          }
        }
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

export async function applyRegionBlurStroke(params: ApplyRegionBlurStrokeParams): Promise<void> {
  if (!mapRegistry.isAllocated || params.kernelRadiusPx <= 0.25) return;
  if (isMapOrLayerLocked(params.mapId)) return;

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

  const blurred = await runTask(
    { labelKey: 'toolOptions.taskBlurStroke', cancellable: false },
    async (ctx) =>
      blurRegionParallel(
        {
          mapId: params.mapId,
          rgba8: params.mapId === 'color' ? mapRegistry.color.working : undefined,
          scalar:
            params.mapId === 'color'
              ? undefined
              : (mapRegistry.getMap(params.mapId).working as Float32Array),
          width,
          height,
          rect,
          radiusPx: params.kernelRadiusPx,
        },
        (p: number) => ctx.setProgress(p),
      ),
  );

  const blurredRgba = blurred.rgba8;
  const blurredScalar = blurred.scalar;

  const project = useProjectStore.getState().project;
  if (
    !mapRegistry.isAllocated ||
    mapRegistry.width !== width ||
    mapRegistry.height !== height ||
    project.id !== projectIdAtStart
  ) {
    return;
  }

  if (isMapOrLayerLocked(params.mapId)) return;

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
  if (isMapOrLayerLocked(params.mapId)) return;
  const project = useProjectStore.getState().project;

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
    isMapOrLayerLocked(params.mapId) ||
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
  if (isMapOrLayerLocked(params.mapId)) return;
  const project = useProjectStore.getState().project;

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
  let sourceRgba8: Uint8ClampedArray | undefined;
  let sourceScalar: Float32Array | undefined;
  let dirtyRect: Rect | null;

  const buf = mapRegistry.getMap(params.mapId);
  const isOverlay = buf.isOverlayLayerActive;

  if (typeof Worker !== 'undefined') {
    const worker = getImageWorker();
    const maskCopy = mapRegistry.hasSelection ? new Uint8Array(mapRegistry.selection) : undefined;
    if (params.mapId === 'color') {
      const srcBuf = isOverlay ? mapRegistry.color.getCompositeBuffer() : mapRegistry.color.working;
      sourceRgba8 = isOverlay ? new Uint8ClampedArray(srcBuf) : undefined;
      const workCopy = new Uint8ClampedArray(srcBuf);
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
      const scalarBuf = (isOverlay ? buf.getCompositeBuffer() : buf.working) as Float32Array;
      sourceScalar = isOverlay ? new Float32Array(scalarBuf) : undefined;
      const workCopy = new Float32Array(scalarBuf);
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
      const srcBuf = isOverlay ? mapRegistry.color.getCompositeBuffer() : mapRegistry.color.working;
      sourceRgba8 = isOverlay ? new Uint8ClampedArray(srcBuf) : undefined;
      const res = params.fillSelectionOnly
        ? applySelectionFillRgba8({
            working: srcBuf,
            width,
            height,
            targetRgb,
            mask,
          })
        : applyFloodFillRgba8({
            working: srcBuf,
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
      const working = (isOverlay ? buf.getCompositeBuffer() : buf.working) as Float32Array;
      sourceScalar = isOverlay ? new Float32Array(working) : undefined;
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
    isMapOrLayerLocked(params.mapId) ||
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
    sourceRgba8,
    sourceScalar,
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
