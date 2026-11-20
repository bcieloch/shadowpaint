import { TILE_SIZE } from '@/core/constants';
import {
  estimateTileSnapshotsBytes,
  type FullMapHistoryEntry,
  type HistoryActionKind,
  type NewHistoryEntry,
  type PixelTileSnapshot,
  type PixelTypedArray,
  type TilesMapHistoryEntry,
} from '@/core/history/commands';
import type { MapRegistry } from '@/core/maps/MapRegistry';
import { clampRect, isEmptyRect, unionRect } from '@/core/maps/rect';
import type { MapId, Rect } from '@/core/types';

function createTypedArray(mapId: MapId, length: number): PixelTypedArray {
  return mapId === 'color' ? new Uint8ClampedArray(length) : new Float32Array(length);
}

export function extractTilePixels(
  src: PixelTypedArray,
  width: number,
  channels: 1 | 4,
  rect: Rect,
  mapId: MapId,
): PixelTypedArray {
  const out = createTypedArray(mapId, rect.w * rect.h * channels);
  const rowLen = rect.w * channels;
  for (let row = 0; row < rect.h; row++) {
    const srcStart = ((rect.y + row) * width + rect.x) * channels;
    const dstStart = row * rowLen;
    out.set(src.subarray(srcStart, srcStart + rowLen) as never, dstStart);
  }
  return out;
}

export function writeTilePixels(
  dst: PixelTypedArray,
  width: number,
  channels: 1 | 4,
  rect: Rect,
  tileData: PixelTypedArray,
): void {
  const rowLen = rect.w * channels;
  for (let row = 0; row < rect.h; row++) {
    const srcStart = row * rowLen;
    const dstStart = ((rect.y + row) * width + rect.x) * channels;
    dst.set(tileData.subarray(srcStart, srcStart + rowLen) as never, dstStart);
  }
}

export function arraysEqual(a: PixelTypedArray, b: PixelTypedArray): boolean {
  if (a.length !== b.length) return false;
  for (let i = 0; i < a.length; i++) {
    if (a[i] !== b[i]) return false;
  }
  return true;
}

interface CapturedTileBefore {
  tx: number;
  ty: number;
  x: number;
  y: number;
  w: number;
  h: number;
  before: PixelTypedArray;
}

export class TileHistoryTransaction {
  readonly mapId: MapId;
  readonly layer: 'working' | 'base';
  readonly action: HistoryActionKind;
  readonly tileSize: number;

  private readonly registry: MapRegistry;
  private readonly tilesBefore = new Map<string, CapturedTileBefore>();
  private dirtyBounds: Rect | null = null;

  constructor(
    registry: MapRegistry,
    mapId: MapId,
    action: HistoryActionKind,
    layer: 'working' | 'base' = 'working',
    tileSize = TILE_SIZE,
  ) {
    this.registry = registry;
    this.mapId = mapId;
    this.action = action;
    this.layer = layer;
    this.tileSize = Math.max(1, Math.floor(tileSize));
  }

  ensureTilesForRect(rect: Rect): void {
    if (!this.registry.isAllocated) return;
    const clamped = clampRect(rect, this.registry.width, this.registry.height);
    if (isEmptyRect(clamped)) return;

    this.dirtyBounds = this.dirtyBounds ? unionRect(this.dirtyBounds, clamped) : clamped;

    const width = this.registry.width;
    const height = this.registry.height;
    const channels: 1 | 4 = this.mapId === 'color' ? 4 : 1;
    const buf = this.registry.getMap(this.mapId)[this.layer] as PixelTypedArray;

    const tx0 = Math.floor(clamped.x / this.tileSize);
    const ty0 = Math.floor(clamped.y / this.tileSize);
    const tx1 = Math.floor((clamped.x + clamped.w - 1) / this.tileSize);
    const ty1 = Math.floor((clamped.y + clamped.h - 1) / this.tileSize);

    for (let ty = ty0; ty <= ty1; ty++) {
      for (let tx = tx0; tx <= tx1; tx++) {
        const key = `${tx},${ty}`;
        if (this.tilesBefore.has(key)) continue;

        const x = tx * this.tileSize;
        const y = ty * this.tileSize;
        const w = Math.min(this.tileSize, width - x);
        const h = Math.min(this.tileSize, height - y);
        const before = extractTilePixels(buf, width, channels, { x, y, w, h }, this.mapId);
        this.tilesBefore.set(key, { tx, ty, x, y, w, h, before });
      }
    }
  }

  commit(): NewHistoryEntry<TilesMapHistoryEntry> | null {
    if (!this.registry.isAllocated || this.tilesBefore.size === 0 || !this.dirtyBounds) {
      this.tilesBefore.clear();
      this.dirtyBounds = null;
      return null;
    }

    const width = this.registry.width;
    const channels: 1 | 4 = this.mapId === 'color' ? 4 : 1;
    const buf = this.registry.getMap(this.mapId)[this.layer] as PixelTypedArray;
    const changedTiles: PixelTileSnapshot[] = [];

    for (const captured of this.tilesBefore.values()) {
      const after = extractTilePixels(
        buf,
        width,
        channels,
        { x: captured.x, y: captured.y, w: captured.w, h: captured.h },
        this.mapId,
      );
      if (arraysEqual(captured.before, after)) {
        continue;
      }
      changedTiles.push({
        tx: captured.tx,
        ty: captured.ty,
        x: captured.x,
        y: captured.y,
        w: captured.w,
        h: captured.h,
        before: captured.before,
        after,
      });
    }

    const dirtyRect = clampRect(this.dirtyBounds, this.registry.width, this.registry.height);
    this.tilesBefore.clear();
    this.dirtyBounds = null;

    if (changedTiles.length === 0 || isEmptyRect(dirtyRect)) {
      return null;
    }

    return {
      kind: 'tiles',
      mapId: this.mapId,
      layer: this.layer,
      meta: {
        action: this.action,
        mapId: this.mapId,
      },
      tiles: changedTiles,
      dirtyRect,
      byteSize: estimateTileSnapshotsBytes(changedTiles),
    };
  }

  rollback(): Rect | null {
    if (!this.registry.isAllocated || this.tilesBefore.size === 0) {
      this.tilesBefore.clear();
      this.dirtyBounds = null;
      return null;
    }

    const width = this.registry.width;
    const channels: 1 | 4 = this.mapId === 'color' ? 4 : 1;
    const buf = this.registry.getMap(this.mapId)[this.layer] as PixelTypedArray;
    for (const tile of this.tilesBefore.values()) {
      writeTilePixels(
        buf,
        width,
        channels,
        { x: tile.x, y: tile.y, w: tile.w, h: tile.h },
        tile.before,
      );
    }

    const dirty = this.dirtyBounds
      ? clampRect(this.dirtyBounds, this.registry.width, this.registry.height)
      : null;
    this.tilesBefore.clear();
    this.dirtyBounds = null;
    return dirty && !isEmptyRect(dirty) ? dirty : null;
  }
}

export function applyTilesHistoryEntry(
  registry: MapRegistry,
  entry: TilesMapHistoryEntry,
  direction: 'undo' | 'redo',
): Rect {
  const width = registry.width;
  const channels: 1 | 4 = entry.mapId === 'color' ? 4 : 1;
  const target = registry.getMap(entry.mapId)[entry.layer] as PixelTypedArray;

  for (const tile of entry.tiles) {
    const data = direction === 'undo' ? tile.before : tile.after;
    writeTilePixels(target, width, channels, { x: tile.x, y: tile.y, w: tile.w, h: tile.h }, data);
  }

  return clampRect(entry.dirtyRect, registry.width, registry.height);
}

export function applyFullMapHistoryEntry(
  registry: MapRegistry,
  entry: FullMapHistoryEntry,
  direction: 'undo' | 'redo',
): void {
  const mapBuffer = registry.getMap(entry.mapId);
  const workingSrc = direction === 'undo' ? entry.workingBefore : entry.workingAfter;
  mapBuffer.replaceWorking(workingSrc as never);

  const baseSrc = direction === 'undo' ? entry.baseBefore : entry.baseAfter;
  if (baseSrc) {
    (mapBuffer.base as PixelTypedArray).set(baseSrc as never);
  }
}
