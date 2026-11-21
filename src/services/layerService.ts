import type { PixelTypedArray } from '@/core/history/commands';
import { recomputeEffectiveRect } from '@/core/maps/adjustments';
import type { LayerBlendMode, MapLayer } from '@/core/maps/MapBuffer';
import { mapRegistry } from '@/core/maps/MapRegistry';
import type { MapId } from '@/core/types';
import { createTranslator } from '@/i18n';
import { useLocaleStore } from '@/i18n/localeStore';
import { cancelLazyEffectiveFlush } from '@/services/adjustService';
import { recordFullMapHistory } from '@/services/historyService';
import { useMapsVersionStore } from '@/state/mapsVersion';
import { useProjectStore } from '@/state/projectStore';

function cloneCompositeAsWorking(mapId: MapId): PixelTypedArray {
  const buf = mapRegistry.getMap(mapId);
  const comp = buf.getCompositeBuffer();
  return mapId === 'color'
    ? new Uint8ClampedArray(comp as Uint8ClampedArray)
    : new Float32Array(comp as Float32Array);
}

function flushLayerRecompute(mapId: MapId): void {
  if (!mapRegistry.isAllocated) return;
  cancelLazyEffectiveFlush(mapId);
  mapRegistry.dirtyTiles.clearMap(mapId);
  recomputeEffectiveRect(mapRegistry, mapId, useProjectStore.getState().project.adjustments, {
    x: 0,
    y: 0,
    w: mapRegistry.width,
    h: mapRegistry.height,
  });
  mapRegistry.emitReplaced(mapId, 'working');
}

function runWithLayerHistory<T>(mapId: MapId, mutate: () => T): T | null {
  if (!mapRegistry.isAllocated) return null;
  const project = useProjectStore.getState().project;
  if (project.maps[mapId].locked) return null;

  const buf = mapRegistry.getMap(mapId);
  const layersBefore = buf.snapshotLayers();
  const activeLayerIdBefore = buf.activeLayerId;
  const workingBefore = cloneCompositeAsWorking(mapId);

  const result = mutate();
  if (!result) return result;

  const layersAfter = buf.snapshotLayers();
  const activeLayerIdAfter = buf.activeLayerId;
  const workingAfter = cloneCompositeAsWorking(mapId);

  recordFullMapHistory({
    mapId,
    action: 'layerChange',
    workingBefore,
    workingAfter,
    layersBefore,
    layersAfter,
    activeLayerIdBefore,
    activeLayerIdAfter,
  });

  useProjectStore.getState().updateProject(() => {}, true);
  flushLayerRecompute(mapId);
  return result;
}

export function addLayerToMap(mapId: MapId, name?: string): MapLayer | null {
  const t = createTranslator(useLocaleStore.getState().locale);
  const buf = mapRegistry.isAllocated ? mapRegistry.getMap(mapId) : null;
  const nextIndex = (buf?.layers.length ?? 1) + 1;
  const resolvedName = name ?? t('maps.defaultLayerName', { index: nextIndex });

  return runWithLayerHistory(mapId, () => {
    const mapBuf = mapRegistry.getMap(mapId);
    return mapBuf.addLayer({ name: resolvedName });
  });
}

export function duplicateLayerOnMap(
  mapId: MapId,
  layerId?: string,
  newName?: string,
): MapLayer | null {
  const t = createTranslator(useLocaleStore.getState().locale);
  return runWithLayerHistory(mapId, () => {
    const mapBuf = mapRegistry.getMap(mapId);
    const src = layerId ? mapBuf.getLayerById(layerId) : mapBuf.activeLayer;
    if (!src) return null;
    const resolvedName = newName ?? t('maps.duplicateLayerName', { name: src.name });
    return mapBuf.duplicateLayer(src.id, resolvedName);
  });
}

export function deleteLayerFromMap(mapId: MapId, layerId?: string): boolean {
  const res = runWithLayerHistory(mapId, () => {
    const mapBuf = mapRegistry.getMap(mapId);
    return mapBuf.removeLayer(layerId ?? mapBuf.activeLayerId);
  });
  return Boolean(res);
}

export function clearLayerOnMap(mapId: MapId, layerId?: string): boolean {
  const res = runWithLayerHistory(mapId, () => {
    const mapBuf = mapRegistry.getMap(mapId);
    const target = layerId ? mapBuf.getLayerById(layerId) : mapBuf.activeLayer;
    if (!target || target.locked) return false;
    return mapBuf.clearLayer(target.id);
  });
  return Boolean(res);
}

export function mergeLayerDownOnMap(mapId: MapId, layerId?: string): boolean {
  const res = runWithLayerHistory(mapId, () => {
    const mapBuf = mapRegistry.getMap(mapId);
    return mapBuf.mergeLayerDown(layerId ?? mapBuf.activeLayerId);
  });
  return Boolean(res);
}

export function flattenMapLayers(mapId: MapId): boolean {
  const t = createTranslator(useLocaleStore.getState().locale);
  const res = runWithLayerHistory(mapId, () => {
    const mapBuf = mapRegistry.getMap(mapId);
    if (mapBuf.layers.length <= 1) return false;
    mapBuf.flattenLayers(t('maps.defaultLayerName', { index: 1 }));
    return true;
  });
  return Boolean(res);
}

export function moveLayerOnMap(mapId: MapId, layerId: string, direction: 'up' | 'down'): boolean {
  const res = runWithLayerHistory(mapId, () => {
    const mapBuf = mapRegistry.getMap(mapId);
    return mapBuf.moveLayer(layerId, direction);
  });
  return Boolean(res);
}

export function selectLayerOnMap(mapId: MapId, layerId: string): boolean {
  if (!mapRegistry.isAllocated) return false;
  const mapBuf = mapRegistry.getMap(mapId);
  const ok = mapBuf.setActiveLayer(layerId);
  if (ok) {
    useMapsVersionStore.getState().bump(mapId);
  }
  return ok;
}

export function updateLayerPropsOnMap(
  mapId: MapId,
  layerId: string,
  patch: Partial<{
    name: string;
    visible: boolean;
    locked: boolean;
    opacity: number;
    blendMode: LayerBlendMode;
  }>,
): boolean {
  if (!mapRegistry.isAllocated) return false;
  const mapBuf = mapRegistry.getMap(mapId);
  const ok = mapBuf.updateLayer(layerId, patch);
  if (!ok) return false;

  const needsRecompute =
    patch.visible !== undefined || patch.opacity !== undefined || patch.blendMode !== undefined;
  if (needsRecompute) {
    useProjectStore.getState().updateProject(() => {}, true);
    flushLayerRecompute(mapId);
  } else {
    useMapsVersionStore.getState().bump(mapId);
  }
  return true;
}
