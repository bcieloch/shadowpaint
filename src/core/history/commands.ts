import type {
  CanvasSettings,
  ExportSettings,
  ColorAdjustments,
  HeightAdjustments,
  LightingSettings,
  MapId,
  MapSourceMeta,
  MaterialSettings,
  OpacityAdjustments,
  Rect,
  SelectionMode,
  View3DSettings,
} from '@/core/types';

export const DEFAULT_HISTORY_MAX_BYTES = 512 * 1024 * 1024;
export const MIN_HISTORY_MAX_BYTES = 128 * 1024 * 1024;
export const MAX_HISTORY_MAX_BYTES = 2048 * 1024 * 1024;
export const DEFAULT_HISTORY_MAX_STEPS = 200;

export type HistoryActionKind =
  | 'brushStroke'
  | 'eraserStroke'
  | 'smoothMap'
  | 'importMap'
  | 'adjustment'
  | 'resetAdjustments'
  | 'settingsChange';

export interface HistoryMeta {
  action: HistoryActionKind;
  mapId?: MapId;
}

export type PixelTypedArray = Uint8ClampedArray | Float32Array;

export interface PixelTileSnapshot {
  tx: number;
  ty: number;
  x: number;
  y: number;
  w: number;
  h: number;
  before: PixelTypedArray;
  after: PixelTypedArray;
}

export interface TilesMapHistoryEntry {
  kind: 'tiles';
  seq: number;
  mapId: MapId;
  layer: 'working' | 'base';
  meta: HistoryMeta;
  tiles: PixelTileSnapshot[];
  dirtyRect: Rect;
  byteSize: number;
}

export interface FullMapHistoryEntry {
  kind: 'full';
  seq: number;
  mapId: MapId;
  meta: HistoryMeta;
  workingBefore: PixelTypedArray;
  workingAfter: PixelTypedArray;
  baseBefore?: PixelTypedArray;
  baseAfter?: PixelTypedArray;
  sourceBefore?: MapSourceMeta | null;
  sourceAfter?: MapSourceMeta | null;
  byteSize: number;
}

export type MapHistoryEntry = TilesMapHistoryEntry | FullMapHistoryEntry;

export type SettingsPatch =
  | {
      path: 'adjustments.color';
      affectedMapId: 'color';
      before: ColorAdjustments;
      after: ColorAdjustments;
    }
  | {
      path: 'adjustments.height';
      affectedMapId: 'height';
      before: HeightAdjustments;
      after: HeightAdjustments;
    }
  | {
      path: 'adjustments.opacity';
      affectedMapId: 'opacity';
      before: OpacityAdjustments;
      after: OpacityAdjustments;
    }
  | {
      path: 'canvas';
      before: CanvasSettings;
      after: CanvasSettings;
    }
  | {
      path: 'view3d';
      before: View3DSettings;
      after: View3DSettings;
    }
  | {
      path: 'lighting';
      before: LightingSettings;
      after: LightingSettings;
    }
  | {
      path: 'material';
      before: MaterialSettings;
      after: MaterialSettings;
    }
  | {
      path: 'export';
      before: ExportSettings;
      after: ExportSettings;
    };

export interface SettingsHistoryEntry {
  kind: 'settings';
  seq: number;
  meta: HistoryMeta;
  patch: SettingsPatch;
  byteSize: number;
}

export interface SelectionHistoryEntry {
  kind: 'selection';
  seq: number;
  meta: HistoryMeta;
  before: Uint8Array;
  after: Uint8Array;
  modeBefore: SelectionMode;
  modeAfter: SelectionMode;
  byteSize: number;
}

export type HistoryEntry = MapHistoryEntry | SettingsHistoryEntry | SelectionHistoryEntry;

export type NewHistoryEntry<T extends HistoryEntry> = T extends unknown ? Omit<T, 'seq'> : never;

export function estimateTileSnapshotsBytes(tiles: readonly PixelTileSnapshot[]): number {
  let total = 0;
  for (const tile of tiles) {
    total += tile.before.byteLength + tile.after.byteLength + 64;
  }
  return total;
}

export function estimateFullMapEntryBytes(
  workingBefore: PixelTypedArray,
  workingAfter: PixelTypedArray,
  baseBefore?: PixelTypedArray,
  baseAfter?: PixelTypedArray,
): number {
  return (
    workingBefore.byteLength +
    workingAfter.byteLength +
    (baseBefore?.byteLength ?? 0) +
    (baseAfter?.byteLength ?? 0) +
    256
  );
}

export function estimateSettingsEntryBytes(): number {
  return 512;
}
