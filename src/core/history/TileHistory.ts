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

function extractMaskTilePixels(src: Uint8Array, width: number, rect: Rect): Uint8Array {
  const out = new Uint8Array(rect.w * rect.h);
  for (let row = 0; row < rect.h; row++) {
    const srcStart = (rect.y + row) * width + rect.x;
    const dstStart = row * rect.w;
    out.set(src.subarray(srcStart, srcStart + rect.w), dstStart);
  }
  return out;
}

function writeMaskTilePixels(
  dst: Uint8Array,
  width: number,
  rect: Rect,
  tileMask: Uint8Array,
): void {
  for (let row = 0; row < rect.h; row++) {
    const srcStart = row * rect.w;
    const dstStart = (rect.y + row) * width + rect.x;
    dst.set(tileMask.subarray(srcStart, srcStart + rect.w), dstStart);
  }
}

export function arraysEqual(
  a: PixelTypedArray | Uint8Array,
  b: PixelTypedArray | Uint8Array,
): boolean {
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
  maskBefore?: Uint8Array;
}

export class TileHistoryTransaction {
  readonly mapId: MapId;
  readonly layer: 'working' | 'base';
  readonly targetLayerId: string;
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
    this.targetLayerId = registry.isAllocated ? registry.getMap(mapId).activeLayerId : 'layer-1';
    this.tileSize = Math.max(1, Math.floor(tileSize));
  }

  private getTargetBuffers(): { data: PixelTypedArray; mask?: Uint8Array } {
    const mapBuf = this.registry.getMap(this.mapId);
    if (this.layer === 'base') {
      return { data: mapBuf.base as PixelTypedArray };
    }
    const targetLayer = mapBuf.getLayerById(this.targetLayerId) ?? mapBuf.activeLayer;
    return {
      data: targetLayer.data as PixelTypedArray,
      mask: targetLayer.mask,
    };
  }

  ensureTilesForRect(rect: Rect): void {
    if (!this.registry.isAllocated) return;
    const clamped = clampRect(rect, this.registry.width, this.registry.height);
    if (isEmptyRect(clamped)) return;

    this.dirtyBounds = this.dirtyBounds ? unionRect(this.dirtyBounds, clamped) : clamped;

    const width = this.registry.width;
    const height = this.registry.height;
    const channels: 1 | 4 = this.mapId === 'color' ? 4 : 1;
    const { data: buf, mask } = this.getTargetBuffers();

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
        const maskBefore = mask ? extractMaskTilePixels(mask, width, { x, y, w, h }) : undefined;
        this.tilesBefore.set(key, { tx, ty, x, y, w, h, before, maskBefore });
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
    const { data: buf, mask } = this.getTargetBuffers();
    const changedTiles: PixelTileSnapshot[] = [];

    for (const captured of this.tilesBefore.values()) {
      const tileRect = { x: captured.x, y: captured.y, w: captured.w, h: captured.h };
      const after = extractTilePixels(buf, width, channels, tileRect, this.mapId);
      const maskAfter =
        mask && captured.maskBefore ? extractMaskTilePixels(mask, width, tileRect) : undefined;
      const dataUnchanged = arraysEqual(captured.before, after);
      const maskUnchanged =
        !captured.maskBefore || !maskAfter || arraysEqual(captured.maskBefore, maskAfter);
      if (dataUnchanged && maskUnchanged) {
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
        maskBefore: captured.maskBefore,
        maskAfter,
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
      targetLayerId: this.targetLayerId,
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
    const { data: buf, mask } = this.getTargetBuffers();
    for (const tile of this.tilesBefore.values()) {
      const tileRect = { x: tile.x, y: tile.y, w: tile.w, h: tile.h };
      writeTilePixels(buf, width, channels, tileRect, tile.before);
      if (mask && tile.maskBefore) {
        writeMaskTilePixels(mask, width, tileRect, tile.maskBefore);
      }
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
  const mapBuf = registry.getMap(entry.mapId);
  const targetLayer =
    entry.layer === 'working' && entry.targetLayerId
      ? (mapBuf.getLayerById(entry.targetLayerId) ?? mapBuf.activeLayer)
      : mapBuf.activeLayer;
  const target = (entry.layer === 'base' ? mapBuf.base : targetLayer.data) as PixelTypedArray;
  const targetMask = entry.layer === 'working' ? targetLayer.mask : undefined;

  for (const tile of entry.tiles) {
    const tileRect = { x: tile.x, y: tile.y, w: tile.w, h: tile.h };
    const data = direction === 'undo' ? tile.before : tile.after;
    writeTilePixels(target, width, channels, tileRect, data);
    const maskData = direction === 'undo' ? tile.maskBefore : tile.maskAfter;
    if (targetMask && maskData) {
      writeMaskTilePixels(targetMask, width, tileRect, maskData);
    }
  }

  return clampRect(entry.dirtyRect, registry.width, registry.height);
}

export function applyFullMapHistoryEntry(
  registry: MapRegistry,
  entry: FullMapHistoryEntry,
  direction: 'undo' | 'redo',
): void {
  const mapBuffer = registry.getMap(entry.mapId);
  const layersSnap = direction === 'undo' ? entry.layersBefore : entry.layersAfter;
  const activeLayerSnap =
    direction === 'undo' ? entry.activeLayerIdBefore : entry.activeLayerIdAfter;
  if (layersSnap && layersSnap.length > 0) {
    mapBuffer.restoreLayers(layersSnap as never, activeLayerSnap);
  } else {
    const workingSrc = direction === 'undo' ? entry.workingBefore : entry.workingAfter;
    const targetLayer = entry.targetLayerId
      ? (mapBuffer.getLayerById(entry.targetLayerId) ?? mapBuffer.activeLayer)
      : mapBuffer.activeLayer;
    targetLayer.data.set(workingSrc as never);
  }

  const baseSrc = direction === 'undo' ? entry.baseBefore : entry.baseAfter;
  if (baseSrc) {
    (mapBuffer.base as PixelTypedArray).set(baseSrc as never);
  }
}
