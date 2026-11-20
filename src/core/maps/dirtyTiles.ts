import { TILE_SIZE } from '@/core/constants';
import { recomputeEffectiveRect } from '@/core/maps/adjustments';
import type { MapRegistry } from '@/core/maps/MapRegistry';
import { clampRect, isEmptyRect, unionRect } from '@/core/maps/rect';
import type { MapId, ProjectSettings, Rect } from '@/core/types';

export interface TileCoordRect {
  key: number;
  tx: number;
  ty: number;
  rect: Rect;
}

const ALL_MAP_IDS: readonly MapId[] = ['color', 'height', 'opacity'];

export class DirtyTileTracker {
  readonly tileSize: number;
  private width = 0;
  private height = 0;
  private cols = 0;
  private rows = 0;
  private readonly dirtySets: Record<MapId, Set<number>> = {
    color: new Set(),
    height: new Set(),
    opacity: new Set(),
  };

  constructor(tileSize = TILE_SIZE) {
    this.tileSize = Math.max(16, Math.floor(tileSize));
  }

  reset(width: number, height: number): void {
    this.width = Math.max(0, Math.floor(width));
    this.height = Math.max(0, Math.floor(height));
    this.cols = this.width > 0 ? Math.ceil(this.width / this.tileSize) : 0;
    this.rows = this.height > 0 ? Math.ceil(this.height / this.tileSize) : 0;
    this.clearAll();
  }

  clearAll(): void {
    this.dirtySets.color.clear();
    this.dirtySets.height.clear();
    this.dirtySets.opacity.clear();
  }

  clearMap(mapId: MapId): void {
    this.dirtySets[mapId].clear();
  }

  markAllDirty(mapId: MapId): void {
    const set = this.dirtySets[mapId];
    set.clear();
    const total = this.cols * this.rows;
    for (let i = 0; i < total; i++) {
      set.add(i);
    }
  }

  markRectDirty(mapId: MapId, rect: Rect): void {
    if (this.width <= 0 || this.height <= 0) return;
    const clamped = clampRect(rect, this.width, this.height);
    if (isEmptyRect(clamped)) return;

    const tx0 = Math.floor(clamped.x / this.tileSize);
    const ty0 = Math.floor(clamped.y / this.tileSize);
    const tx1 = Math.floor((clamped.x + clamped.w - 1) / this.tileSize);
    const ty1 = Math.floor((clamped.y + clamped.h - 1) / this.tileSize);
    const set = this.dirtySets[mapId];

    for (let ty = ty0; ty <= ty1; ty++) {
      for (let tx = tx0; tx <= tx1; tx++) {
        set.add(ty * this.cols + tx);
      }
    }
  }

  hasDirty(mapId?: MapId): boolean {
    if (mapId) {
      return this.dirtySets[mapId].size > 0;
    }
    return (
      this.dirtySets.color.size > 0 ||
      this.dirtySets.height.size > 0 ||
      this.dirtySets.opacity.size > 0
    );
  }

  getDirtyCount(mapId?: MapId): number {
    if (mapId) {
      return this.dirtySets[mapId].size;
    }
    return (
      this.dirtySets.color.size + this.dirtySets.height.size + this.dirtySets.opacity.size
    );
  }

  getTileCount(): number {
    return this.cols * this.rows;
  }

  getTileRect(tx: number, ty: number): Rect {
    const x = tx * this.tileSize;
    const y = ty * this.tileSize;
    return {
      x,
      y,
      w: Math.max(0, Math.min(this.tileSize, this.width - x)),
      h: Math.max(0, Math.min(this.tileSize, this.height - y)),
    };
  }

  getDirtyTilesForRect(mapId: MapId, rect: Rect): TileCoordRect[] {
    if (this.dirtySets[mapId].size === 0 || this.width <= 0 || this.height <= 0) return [];
    const clamped = clampRect(rect, this.width, this.height);
    if (isEmptyRect(clamped)) return [];

    const tx0 = Math.floor(clamped.x / this.tileSize);
    const ty0 = Math.floor(clamped.y / this.tileSize);
    const tx1 = Math.floor((clamped.x + clamped.w - 1) / this.tileSize);
    const ty1 = Math.floor((clamped.y + clamped.h - 1) / this.tileSize);
    const set = this.dirtySets[mapId];
    const result: TileCoordRect[] = [];

    for (let ty = ty0; ty <= ty1; ty++) {
      for (let tx = tx0; tx <= tx1; tx++) {
        const key = ty * this.cols + tx;
        if (set.has(key)) {
          result.push({
            key,
            tx,
            ty,
            rect: this.getTileRect(tx, ty),
          });
        }
      }
    }
    return result;
  }

  consumeDirtyBatch(mapId: MapId, maxTiles: number): TileCoordRect[] {
    const set = this.dirtySets[mapId];
    if (set.size === 0 || maxTiles <= 0 || this.cols <= 0) return [];

    const batch: TileCoordRect[] = [];
    for (const key of set) {
      const tx = key % this.cols;
      const ty = Math.floor(key / this.cols);
      batch.push({
        key,
        tx,
        ty,
        rect: this.getTileRect(tx, ty),
      });
      set.delete(key);
      if (batch.length >= maxTiles) break;
    }
    return batch;
  }

  consumeKeys(mapId: MapId, tiles: readonly TileCoordRect[]): void {
    const set = this.dirtySets[mapId];
    for (const tile of tiles) {
      set.delete(tile.key);
    }
  }
}

export function ensureEffectiveRect(
  registry: MapRegistry,
  mapId: MapId,
  rect: Rect,
  adjustments: ProjectSettings['adjustments'],
): Rect | null {
  if (!registry.isAllocated) return null;
  const tiles = registry.dirtyTiles.getDirtyTilesForRect(mapId, rect);
  if (tiles.length === 0) return null;

  let merged: Rect | null = null;
  for (const tile of tiles) {
    recomputeEffectiveRect(registry, mapId, adjustments, tile.rect);
    merged = merged ? unionRect(merged, tile.rect) : tile.rect;
  }
  registry.dirtyTiles.consumeKeys(mapId, tiles);
  return merged;
}

export function flushEffectiveMap(
  registry: MapRegistry,
  mapId: MapId,
  adjustments: ProjectSettings['adjustments'],
  maxTiles = Number.POSITIVE_INFINITY,
): Rect | null {
  if (!registry.isAllocated) return null;
  const batch = registry.dirtyTiles.consumeDirtyBatch(mapId, maxTiles);
  if (batch.length === 0) return null;

  let merged: Rect | null = null;
  for (const tile of batch) {
    recomputeEffectiveRect(registry, mapId, adjustments, tile.rect);
    merged = merged ? unionRect(merged, tile.rect) : tile.rect;
  }
  return merged;
}

export function flushAllEffective(
  registry: MapRegistry,
  adjustments: ProjectSettings['adjustments'],
): void {
  if (!registry.isAllocated) return;
  for (const mapId of ALL_MAP_IDS) {
    flushEffectiveMap(registry, mapId, adjustments);
  }
}
