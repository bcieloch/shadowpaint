import { estimateFullMapEntryBytes } from '@/core/history/commands';
import { ensureEffectiveRect, flushEffectiveMap } from '@/core/maps/dirtyTiles';
import { mapRegistry } from '@/core/maps/MapRegistry';
import { isEmptyRect } from '@/core/maps/rect';
import type { MapId, ProjectSettings, Rect } from '@/core/types';
import { valueToMm } from '@/core/units/calibration';
import { useHistoryStore } from '@/state/historyStore';
import { useProjectStore } from '@/state/projectStore';
import {
  computeEffectiveColorParallel,
  computeEffectiveHeightParallel,
  computeEffectiveOpacityParallel,
  smoothFloatMapParallel,
} from '@/workers/pool';
import { runTask } from '@/workers/tasks';

const ALL_MAP_IDS: readonly MapId[] = ['color', 'height', 'opacity'];
const LAZY_TILE_THRESHOLD_PIXELS = 512 * 512;
const LAZY_BACKGROUND_TILES_PER_SLICE = 16;

const requestSeq: Record<MapId, number> = {
  color: 0,
  height: 0,
  opacity: 0,
};

interface ScheduledIdleHandle {
  kind: 'idle' | 'timeout';
  id: number;
}

const pendingLazyFlush: Record<MapId, ScheduledIdleHandle | null> = {
  color: null,
  height: null,
  opacity: null,
};

const lastRecomputeTimingMs: Record<MapId, number | null> = {
  color: null,
  height: null,
  opacity: null,
};

function cancelScheduledHandle(handle: ScheduledIdleHandle | null): void {
  if (!handle) return;
  if (
    handle.kind === 'idle' &&
    typeof window !== 'undefined' &&
    typeof window.cancelIdleCallback === 'function'
  ) {
    window.cancelIdleCallback(handle.id);
    return;
  }
  clearTimeout(handle.id);
}

export function cancelLazyEffectiveFlush(mapId?: MapId): void {
  if (mapId) {
    requestSeq[mapId]++;
    cancelScheduledHandle(pendingLazyFlush[mapId]);
    pendingLazyFlush[mapId] = null;
    return;
  }
  for (const id of ALL_MAP_IDS) {
    requestSeq[id]++;
    cancelScheduledHandle(pendingLazyFlush[id]);
    pendingLazyFlush[id] = null;
  }
}

function scheduleLazyBackgroundStep(mapId: MapId, seq: number): void {
  if (pendingLazyFlush[mapId]) {
    cancelScheduledHandle(pendingLazyFlush[mapId]);
    pendingLazyFlush[mapId] = null;
  }
  if (!mapRegistry.isAllocated || !mapRegistry.dirtyTiles.hasDirty(mapId)) {
    return;
  }

  const runSlice = () => {
    pendingLazyFlush[mapId] = null;
    if (seq !== requestSeq[mapId] || !mapRegistry.isAllocated) {
      return;
    }
    const adjustments = useProjectStore.getState().project.adjustments;
    const flushed = flushEffectiveMap(
      mapRegistry,
      mapId,
      adjustments,
      LAZY_BACKGROUND_TILES_PER_SLICE,
    );
    if (flushed && !isEmptyRect(flushed)) {
      mapRegistry.emitDirty(mapId, flushed);
    }
    if (mapRegistry.dirtyTiles.hasDirty(mapId) && seq === requestSeq[mapId]) {
      scheduleLazyBackgroundStep(mapId, seq);
    }
  };

  if (typeof window !== 'undefined' && typeof window.requestIdleCallback === 'function') {
    const id = window.requestIdleCallback(() => runSlice(), { timeout: 120 });
    pendingLazyFlush[mapId] = { kind: 'idle', id };
  } else {
    const id = setTimeout(runSlice, 16) as unknown as number;
    pendingLazyFlush[mapId] = { kind: 'timeout', id };
  }
}

function isIdentityAdjustment(mapId: MapId, adjustments: ProjectSettings['adjustments']): boolean {
  if (mapId === 'color') {
    const c = adjustments.color;
    return c.brightness === 0 && c.contrast === 0 && c.saturation === 0;
  }
  if (mapId === 'height') {
    const h = adjustments.height;
    return !h.invert && h.contrast === 0 && h.gamma === 1;
  }
  const o = adjustments.opacity;
  return !o.invert && o.contrast === 0 && o.maxTransmissionPct === 100 && o.maxOpacityPct === 100;
}

export function getAdjustServiceTimingStats(): Record<MapId, number | null> {
  return { ...lastRecomputeTimingMs };
}

export function ensureEffectiveRectForActiveProject(mapId: MapId, rect: Rect): Rect | null {
  if (!mapRegistry.isAllocated || !mapRegistry.dirtyTiles.hasDirty(mapId)) return null;
  const adjustments = useProjectStore.getState().project.adjustments;
  const flushed = ensureEffectiveRect(mapRegistry, mapId, rect, adjustments);
  if (!mapRegistry.dirtyTiles.hasDirty(mapId) && pendingLazyFlush[mapId]) {
    cancelScheduledHandle(pendingLazyFlush[mapId]);
    pendingLazyFlush[mapId] = null;
  }
  return flushed;
}

export function flushVisibleEffectiveRect(visibleRect: Rect): void {
  if (!mapRegistry.isAllocated || !mapRegistry.dirtyTiles.hasDirty()) return;
  const adjustments = useProjectStore.getState().project.adjustments;
  for (const mapId of ALL_MAP_IDS) {
    if (!mapRegistry.dirtyTiles.hasDirty(mapId)) continue;
    const flushed = ensureEffectiveRect(mapRegistry, mapId, visibleRect, adjustments);
    if (flushed && !isEmptyRect(flushed)) {
      mapRegistry.emitDirty(mapId, flushed);
    }
    if (!mapRegistry.dirtyTiles.hasDirty(mapId) && pendingLazyFlush[mapId]) {
      cancelScheduledHandle(pendingLazyFlush[mapId]);
      pendingLazyFlush[mapId] = null;
    }
  }
}

export function flushDirtyEffectiveTiles(mapId?: MapId, emitDirty = false): void {
  if (!mapRegistry.isAllocated) return;
  const adjustments = useProjectStore.getState().project.adjustments;
  const targets = mapId ? [mapId] : ALL_MAP_IDS;
  for (const id of targets) {
    if (pendingLazyFlush[id]) {
      cancelScheduledHandle(pendingLazyFlush[id]);
      pendingLazyFlush[id] = null;
    }
    if (!mapRegistry.dirtyTiles.hasDirty(id)) continue;
    const flushed = flushEffectiveMap(mapRegistry, id, adjustments);
    if (emitDirty && flushed && !isEmptyRect(flushed)) {
      mapRegistry.emitDirty(id, flushed);
    }
  }
}

export async function recomputeEffectiveMap(mapId: MapId): Promise<void> {
  if (!mapRegistry.isAllocated) return;
  cancelScheduledHandle(pendingLazyFlush[mapId]);
  pendingLazyFlush[mapId] = null;
  const seq = ++requestSeq[mapId];
  mapRegistry.dirtyTiles.clearMap(mapId);

  const { width, height } = mapRegistry;
  const project = useProjectStore.getState().project;
  const t0 = performance.now();

  if (mapId === 'color') {
    const out = await computeEffectiveColorParallel(
      mapRegistry.color.getCompositeBuffer(),
      width,
      height,
      project.adjustments.color,
      mapRegistry.color.effective,
    );
    if (seq !== requestSeq.color) return;
    if (out !== mapRegistry.color.effective) {
      mapRegistry.color.replaceEffective(out);
    }
    lastRecomputeTimingMs.color = Math.round((performance.now() - t0) * 100) / 100;
    mapRegistry.emitReplaced('color', 'effective');
    return;
  }

  if (mapId === 'height') {
    const out = await computeEffectiveHeightParallel(
      mapRegistry.heightMap.getCompositeBuffer(),
      width,
      height,
      project.adjustments.height,
      mapRegistry.heightMap.effective,
    );
    if (seq !== requestSeq.height) return;
    if (out !== mapRegistry.heightMap.effective) {
      mapRegistry.heightMap.replaceEffective(out);
    }
    lastRecomputeTimingMs.height = Math.round((performance.now() - t0) * 100) / 100;
    mapRegistry.emitReplaced('height', 'effective');
    return;
  }

  const out = await computeEffectiveOpacityParallel(
    mapRegistry.opacity.getCompositeBuffer(),
    width,
    height,
    project.adjustments.opacity,
    mapRegistry.opacity.effective,
  );
  if (seq !== requestSeq.opacity) return;
  if (out !== mapRegistry.opacity.effective) {
    mapRegistry.opacity.replaceEffective(out);
  }
  lastRecomputeTimingMs.opacity = Math.round((performance.now() - t0) * 100) / 100;
  mapRegistry.emitReplaced('opacity', 'effective');
}

export function recomputeEffectiveMapLazy(mapId: MapId, visibleRect?: Rect | null): void {
  if (!mapRegistry.isAllocated) return;
  const { width, height } = mapRegistry;
  const project = useProjectStore.getState().project;
  const totalPixels = width * height;

  if (
    !visibleRect ||
    isEmptyRect(visibleRect) ||
    totalPixels <= LAZY_TILE_THRESHOLD_PIXELS ||
    isIdentityAdjustment(mapId, project.adjustments)
  ) {
    void recomputeEffectiveMap(mapId);
    return;
  }

  mapRegistry.dirtyTiles.markAllDirty(mapId);
  const totalTiles = mapRegistry.dirtyTiles.getTileCount();
  const visibleTiles = mapRegistry.dirtyTiles.getDirtyTilesForRect(mapId, visibleRect);

  if (totalTiles <= 1 || visibleTiles.length >= totalTiles * 0.65) {
    void recomputeEffectiveMap(mapId);
    return;
  }

  cancelScheduledHandle(pendingLazyFlush[mapId]);
  pendingLazyFlush[mapId] = null;
  const seq = ++requestSeq[mapId];

  const t0 = performance.now();
  const flushed = ensureEffectiveRect(mapRegistry, mapId, visibleRect, project.adjustments);
  lastRecomputeTimingMs[mapId] = Math.round((performance.now() - t0) * 100) / 100;
  if (flushed && !isEmptyRect(flushed)) {
    mapRegistry.emitDirty(mapId, flushed);
  }

  if (mapRegistry.dirtyTiles.hasDirty(mapId)) {
    scheduleLazyBackgroundStep(mapId, seq);
  }
}

export async function smoothFloatMap(mapId: 'height' | 'opacity', radiusPx: number): Promise<void> {
  if (!mapRegistry.isAllocated) return;
  const { width, height } = mapRegistry;
  const buf = mapRegistry.getMap(mapId);
  const workingBefore = new Float32Array(buf.working);

  const smoothed = await runTask(
    { labelKey: 'mapParams.taskSmoothing', labelParams: { map: mapId }, cancellable: false },
    async (ctx) =>
      smoothFloatMapParallel(workingBefore, width, height, radiusPx, (p: number) =>
        ctx.setProgress(p),
      ),
  );

  const workingAfter = new Float32Array(smoothed);
  buf.activeLayer.data.set(smoothed);
  mapRegistry.dirtyTiles.clearMap(mapId);
  useHistoryStore.getState().pushMapEntry(mapId, {
    kind: 'full',
    mapId,
    targetLayerId: buf.activeLayerId,
    meta: { action: 'smoothMap', mapId },
    workingBefore,
    workingAfter,
    byteSize: estimateFullMapEntryBytes(workingBefore, workingAfter),
  });
  useProjectStore.getState().updateProject(() => {}, true);
  mapRegistry.emitReplaced(mapId, 'working');
  await recomputeEffectiveMap(mapId);
}

export interface FloatMapStats {
  min: number;
  max: number;
  mean: number;
}

export function computeFloatMapStats(
  mapId: 'height' | 'opacity',
  flushDirty = true,
): FloatMapStats {
  if (!mapRegistry.isAllocated) {
    return { min: 0, max: 0, mean: 0 };
  }
  if (flushDirty) {
    flushDirtyEffectiveTiles(mapId);
  }
  const effective = mapRegistry.getMap(mapId).effective;
  const len = effective.length;
  if (len === 0) return { min: 0, max: 0, mean: 0 };

  let minV = 1;
  let maxV = 0;
  let sum = 0;
  for (let i = 0; i < len; i++) {
    const v = effective[i] ?? 0;
    if (v < minV) minV = v;
    if (v > maxV) maxV = v;
    sum += v;
  }
  const meanV = sum / len;

  if (mapId === 'height') {
    const { minThicknessMm, maxThicknessMm } = useProjectStore.getState().project.canvas;
    return {
      min: valueToMm(minV, minThicknessMm, maxThicknessMm),
      max: valueToMm(maxV, minThicknessMm, maxThicknessMm),
      mean: valueToMm(meanV, minThicknessMm, maxThicknessMm),
    };
  }

  return {
    min: minV * 100,
    max: maxV * 100,
    mean: meanV * 100,
  };
}
