import { proxy, transfer } from 'comlink';
import { TileHistoryTransaction } from '@/core/history/TileHistory';
import { recomputeEffectiveRect } from '@/core/maps/adjustments';
import { mapRegistry } from '@/core/maps/MapRegistry';
import { clamp01 } from '@/core/maps/quantize';
import { clampRect, isEmptyRect } from '@/core/maps/rect';
import type { MapId, Rect } from '@/core/types';
import {
  gaussianBlurPatchInnerFloat32,
  gaussianBlurPatchInnerRgba8,
  getGaussianKernelPad,
} from '@/imaging/blur';
import { recordTileHistory } from '@/services/historyService';
import { useProjectStore } from '@/state/projectStore';
import { getImageWorker } from '@/workers/client';
import { runTask } from '@/workers/tasks';

export interface ApplyRegionBlurStrokeParams {
  mapId: MapId;
  rect: Rect;
  kernelRadiusPx: number;
  weightMask: Float32Array;
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
