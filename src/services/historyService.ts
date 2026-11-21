import {
  estimateFullMapEntryBytes,
  estimateSettingsEntryBytes,
  type HistoryEntry,
  type HistoryMeta,
  type MapHistoryEntry,
  type NewHistoryEntry,
  type PixelTypedArray,
  type SettingsPatch,
  type TilesMapHistoryEntry,
} from '@/core/history/commands';
import { applyFullMapHistoryEntry, applyTilesHistoryEntry } from '@/core/history/TileHistory';
import { recomputeEffectiveRect } from '@/core/maps/adjustments';
import type { SerializedMapLayer } from '@/core/maps/MapBuffer';
import { mapRegistry } from '@/core/maps/MapRegistry';
import type { MapId, MapSourceMeta } from '@/core/types';
import { createTranslator, type TranslationKey, type TranslationParams } from '@/i18n';
import { useLocaleStore } from '@/i18n/localeStore';
import { cancelLazyEffectiveFlush, recomputeEffectiveMap } from '@/services/adjustService';
import { useEditorStore } from '@/state/editorStore';
import { useHistoryStore } from '@/state/historyStore';
import { useProjectStore } from '@/state/projectStore';
import { useUiStore } from '@/state/uiStore';

type TranslateFn = (key: TranslationKey, params?: TranslationParams) => string;

let historyStatusTimer: ReturnType<typeof setTimeout> | null = null;

function setTransientHistoryStatus(
  key: 'history.undoneStatus' | 'history.redoneStatus',
  meta: HistoryMeta,
): void {
  const locale = useLocaleStore.getState().locale;
  const t = createTranslator(locale);
  const action = formatHistoryMeta(meta, t);
  useUiStore.getState().setStatusMessage({ key, params: { action } });

  if (historyStatusTimer !== null) {
    clearTimeout(historyStatusTimer);
    historyStatusTimer = null;
  }
  if (typeof window !== 'undefined') {
    historyStatusTimer = setTimeout(() => {
      const current = useUiStore.getState().statusMessage;
      if (current && current.key === key) {
        useUiStore.getState().setStatusMessage(null);
      }
      historyStatusTimer = null;
    }, 2500);
  }
}

export function formatHistoryMeta(meta: HistoryMeta, t: TranslateFn): string {
  const mapName = meta.mapId ? t(`maps.${meta.mapId}` as const) : '';
  switch (meta.action) {
    case 'brushStroke':
      return t('history.brushStroke', { map: mapName });
    case 'eraserStroke':
      return t('history.eraserStroke', { map: mapName });
    case 'smoothStroke':
      return t('history.smoothStroke', { map: mapName });
    case 'blurStroke':
      return t('history.blurStroke', { map: mapName });
    case 'gradientFill':
      return t('history.gradientFill', { map: mapName });
    case 'floodFill':
      return t('history.floodFill', { map: mapName });
    case 'smoothMap':
      return t('history.smoothMap', { map: mapName });
    case 'importMap':
      return t('history.importMap', { map: mapName });
    case 'layerChange':
      return t('history.layerChange', { map: mapName });
    case 'adjustment':
      return t('history.adjustment', { map: mapName });
    case 'resetAdjustments':
      return t('history.resetAdjustments', { map: mapName });
    case 'settingsChange':
      return t('history.settingsChange');
    case 'selectShape':
      return t('history.selectShape');
    case 'selectWand':
      return t('history.selectWand');
    case 'selectAll':
      return t('history.selectAll');
    case 'selectClear':
      return t('history.selectClear');
    case 'selectInvert':
      return t('history.selectInvert');
    case 'selectFeather':
      return t('history.selectFeather');
    case 'maskBrush':
      return t('history.maskBrush');
  }
}

export function recordTileHistory(entry: NewHistoryEntry<TilesMapHistoryEntry>): void {
  useHistoryStore.getState().pushMapEntry(entry.mapId, entry);
  useProjectStore.getState().updateProject(() => {}, true);
}

export function recordFullMapHistory(params: {
  mapId: MapId;
  action: 'smoothMap' | 'importMap' | 'layerChange';
  workingBefore: PixelTypedArray;
  workingAfter: PixelTypedArray;
  baseBefore?: PixelTypedArray;
  baseAfter?: PixelTypedArray;
  sourceBefore?: MapSourceMeta | null;
  sourceAfter?: MapSourceMeta | null;
  layersBefore?: readonly SerializedMapLayer[];
  layersAfter?: readonly SerializedMapLayer[];
  activeLayerIdBefore?: string;
  activeLayerIdAfter?: string;
}): void {
  useHistoryStore.getState().pushMapEntry(params.mapId, {
    kind: 'full',
    mapId: params.mapId,
    meta: {
      action: params.action,
      mapId: params.mapId,
    },
    workingBefore: params.workingBefore,
    workingAfter: params.workingAfter,
    baseBefore: params.baseBefore,
    baseAfter: params.baseAfter,
    sourceBefore: params.sourceBefore,
    sourceAfter: params.sourceAfter,
    layersBefore: params.layersBefore,
    layersAfter: params.layersAfter,
    activeLayerIdBefore: params.activeLayerIdBefore,
    activeLayerIdAfter: params.activeLayerIdAfter,
    byteSize: estimateFullMapEntryBytes(
      params.workingBefore,
      params.workingAfter,
      params.baseBefore,
      params.baseAfter,
    ),
  });
}

export function recordSettingsPatchHistory(
  action: 'adjustment' | 'resetAdjustments' | 'settingsChange',
  patch: SettingsPatch,
): void {
  if (JSON.stringify(patch.before) === JSON.stringify(patch.after)) {
    return;
  }
  const mapId = 'affectedMapId' in patch ? patch.affectedMapId : undefined;
  useHistoryStore.getState().pushSettingsEntry({
    kind: 'settings',
    meta: {
      action,
      mapId,
    },
    patch,
    byteSize: estimateSettingsEntryBytes(),
  });
}

function applySettingsPatch(patch: SettingsPatch, direction: 'undo' | 'redo'): void {
  const projectStore = useProjectStore.getState();
  projectStore.updateProject((draft) => {
    if (patch.path === 'adjustments.color') {
      const value = direction === 'undo' ? patch.before : patch.after;
      draft.adjustments.color = { ...value };
    } else if (patch.path === 'adjustments.height') {
      const value = direction === 'undo' ? patch.before : patch.after;
      draft.adjustments.height = { ...value };
    } else if (patch.path === 'adjustments.opacity') {
      const value = direction === 'undo' ? patch.before : patch.after;
      draft.adjustments.opacity = { ...value };
    } else if (patch.path === 'canvas') {
      const value = direction === 'undo' ? patch.before : patch.after;
      draft.canvas = { ...value };
    } else if (patch.path === 'lighting') {
      const value = direction === 'undo' ? patch.before : patch.after;
      draft.lighting = structuredClone(value);
    } else if (patch.path === 'view3d') {
      const value = direction === 'undo' ? patch.before : patch.after;
      draft.view3d = { ...value };
    } else if (patch.path === 'grid') {
      const value = direction === 'undo' ? patch.before : patch.after;
      draft.grid = { ...value };
    } else if (patch.path === 'material') {
      const value = direction === 'undo' ? patch.before : patch.after;
      draft.material = { ...value };
    } else if (patch.path === 'selection') {
      const value = direction === 'undo' ? patch.before : patch.after;
      draft.selection = { ...value };
    } else {
      const value = direction === 'undo' ? patch.before : patch.after;
      draft.export = { ...value };
    }
  }, true);

  if (!mapRegistry.isAllocated || !('affectedMapId' in patch)) return;
  if (typeof Worker !== 'undefined') {
    void recomputeEffectiveMap(patch.affectedMapId);
  } else {
    cancelLazyEffectiveFlush(patch.affectedMapId);
    mapRegistry.dirtyTiles.clearMap(patch.affectedMapId);
    recomputeEffectiveRect(
      mapRegistry,
      patch.affectedMapId,
      useProjectStore.getState().project.adjustments,
      { x: 0, y: 0, w: mapRegistry.width, h: mapRegistry.height },
    );
    mapRegistry.emitReplaced(patch.affectedMapId, 'effective');
  }
}

function applyHistoryEntry(entry: HistoryEntry, direction: 'undo' | 'redo'): void {
  if (entry.kind === 'tiles') {
    if (!mapRegistry.isAllocated) return;
    const dirtyRect = applyTilesHistoryEntry(mapRegistry, entry, direction);
    const adjustments = useProjectStore.getState().project.adjustments;
    recomputeEffectiveRect(mapRegistry, entry.mapId, adjustments, dirtyRect);
    mapRegistry.emitDirty(entry.mapId, dirtyRect);
    useProjectStore.getState().updateProject(() => {}, true);
    return;
  }

  if (entry.kind === 'full') {
    if (!mapRegistry.isAllocated) return;
    cancelLazyEffectiveFlush(entry.mapId);
    mapRegistry.dirtyTiles.clearMap(entry.mapId);
    applyFullMapHistoryEntry(mapRegistry, entry, direction);
    if (entry.sourceBefore !== undefined || entry.sourceAfter !== undefined) {
      const nextSource =
        direction === 'undo' ? (entry.sourceBefore ?? null) : (entry.sourceAfter ?? null);
      useProjectStore.getState().updateProject((draft) => {
        draft.maps[entry.mapId].source = nextSource ? structuredClone(nextSource) : null;
      }, true);
    } else {
      useProjectStore.getState().updateProject(() => {}, true);
    }

    recomputeEffectiveRect(
      mapRegistry,
      entry.mapId,
      useProjectStore.getState().project.adjustments,
      { x: 0, y: 0, w: mapRegistry.width, h: mapRegistry.height },
    );
    mapRegistry.emitReplaced(entry.mapId, entry.baseBefore ? 'all' : 'working');
    return;
  }

  if (entry.kind === 'selection') {
    if (!mapRegistry.isAllocated) return;
    const maskData = direction === 'undo' ? entry.before : entry.after;
    const modeValue = direction === 'undo' ? entry.modeBefore : entry.modeAfter;
    if (mapRegistry.selection.length === maskData.length) {
      mapRegistry.selection.set(maskData);
    }
    useProjectStore.getState().updateProject((draft) => {
      draft.selection.mode = modeValue;
    }, true);
    const hasSel = mapRegistry.refreshSelectionState();
    useEditorStore.getState().setHasSelection(hasSel);
    mapRegistry.emitSelectionChanged();
    return;
  }

  if (entry.kind === 'settings') {
    applySettingsPatch(entry.patch, direction);
  }
}

export function undoGlobal(): HistoryEntry | null {
  const entry = useHistoryStore.getState().popGlobalUndo();
  if (!entry) return null;
  applyHistoryEntry(entry, 'undo');
  setTransientHistoryStatus('history.undoneStatus', entry.meta);
  return entry;
}

export function redoGlobal(): HistoryEntry | null {
  const entry = useHistoryStore.getState().popGlobalRedo();
  if (!entry) return null;
  applyHistoryEntry(entry, 'redo');
  setTransientHistoryStatus('history.redoneStatus', entry.meta);
  return entry;
}

export function undoMap(mapId: MapId): MapHistoryEntry | null {
  const entry = useHistoryStore.getState().popMapUndo(mapId);
  if (!entry) return null;
  applyHistoryEntry(entry, 'undo');
  setTransientHistoryStatus('history.undoneStatus', entry.meta);
  return entry;
}

export function undoActiveMap(): MapHistoryEntry | null {
  const activeMap = useEditorStore.getState().activeMap;
  return undoMap(activeMap);
}

export function clearHistory(): void {
  if (historyStatusTimer !== null) {
    clearTimeout(historyStatusTimer);
    historyStatusTimer = null;
  }
  useHistoryStore.getState().clearAll();
}
