import { clamp01 } from '@/core/maps/quantize';
import { hexToRgb01 } from '@/core/units/colorTemperature';
import type { MapId, Rect } from '@/core/types';

export type MapDataArray<M extends MapId> = M extends 'color' ? Uint8ClampedArray : Float32Array;

export type LayerBlendMode = 'normal' | 'add' | 'subtract' | 'multiply' | 'max' | 'min';

export const LAYER_BLEND_MODES: readonly LayerBlendMode[] = [
  'normal',
  'add',
  'subtract',
  'multiply',
  'max',
  'min',
];

export interface MapLayer<M extends MapId = MapId> {
  id: string;
  name: string;
  visible: boolean;
  locked: boolean;
  opacity: number;
  blendMode: LayerBlendMode;
  data: MapDataArray<M>;
  mask: Uint8Array;
}

export interface SerializedMapLayer<M extends MapId = MapId> {
  id: string;
  name: string;
  visible: boolean;
  locked: boolean;
  opacity: number;
  blendMode: LayerBlendMode;
  data: MapDataArray<M>;
  mask: Uint8Array;
  isOpaqueFull?: boolean;
}

export interface MapLayerBuffers<M extends MapId> {
  base: MapDataArray<M>;
  working: MapDataArray<M>;
  effective: MapDataArray<M>;
}

function cloneDataArray<M extends MapId>(mapId: M, src: MapDataArray<M>): MapDataArray<M> {
  if (mapId === 'color') {
    return new Uint8ClampedArray(src as Uint8ClampedArray) as MapDataArray<M>;
  }
  return new Float32Array(src as Float32Array) as MapDataArray<M>;
}

function createDataArray<M extends MapId>(mapId: M, pixelCount: number): MapDataArray<M> {
  if (mapId === 'color') {
    return new Uint8ClampedArray(pixelCount * 4) as MapDataArray<M>;
  }
  return new Float32Array(pixelCount) as MapDataArray<M>;
}

function blendScalar(dst: number, src: number, mode: LayerBlendMode): number {
  switch (mode) {
    case 'normal':
      return src;
    case 'add':
      return clamp01(dst + src);
    case 'subtract':
      return clamp01(dst - src);
    case 'multiply':
      return dst * src;
    case 'max':
      return dst > src ? dst : src;
    case 'min':
      return dst < src ? dst : src;
  }
}

function blendChannel8(dst: number, src: number, mode: LayerBlendMode): number {
  switch (mode) {
    case 'normal':
      return src;
    case 'add':
      return dst + src > 255 ? 255 : dst + src;
    case 'subtract':
      return dst - src < 0 ? 0 : dst - src;
    case 'multiply':
      return Math.round((dst * src) / 255);
    case 'max':
      return dst > src ? dst : src;
    case 'min':
      return dst < src ? dst : src;
  }
}

export class MapBuffer<M extends MapId = MapId> {
  readonly mapId: M;
  readonly width: number;
  readonly height: number;
  readonly base: MapDataArray<M>;
  readonly effective: MapDataArray<M>;

  private _layers: MapLayer<M>[] = [];
  private _activeLayerId = 'layer-1';
  private _nextLayerSeq = 2;
  private _composite: MapDataArray<M> | null = null;
  private _baseLayerOpaque = true;

  constructor(
    mapId: M,
    width: number,
    height: number,
    defaultValue: number | string,
    existing?: MapLayerBuffers<M>,
  ) {
    this.mapId = mapId;
    this.width = width;
    this.height = height;

    const pixelCount = width * height;
    const expectedLength = mapId === 'color' ? pixelCount * 4 : pixelCount;

    if (existing) {
      if (
        existing.base.length !== expectedLength ||
        existing.working.length !== expectedLength ||
        existing.effective.length !== expectedLength
      ) {
        throw new Error(
          `Buffer length mismatch for ${mapId} (${width}x${height}): expected ${expectedLength}`,
        );
      }
      this.base = existing.base;
      this.effective = existing.effective;
      const baseMask = new Uint8Array(pixelCount);
      baseMask.fill(255);
      this._layers = [
        {
          id: 'layer-1',
          name: 'Layer 1',
          visible: true,
          locked: false,
          opacity: 1,
          blendMode: 'normal',
          data: existing.working,
          mask: baseMask,
        },
      ];
      this._activeLayerId = 'layer-1';
      return;
    }

    this.base = createDataArray(mapId, pixelCount);
    const initialWorking = createDataArray(mapId, pixelCount);
    this.effective = createDataArray(mapId, pixelCount);
    const baseMask = new Uint8Array(pixelCount);
    baseMask.fill(255);

    this._layers = [
      {
        id: 'layer-1',
        name: 'Layer 1',
        visible: true,
        locked: false,
        opacity: 1,
        blendMode: 'normal',
        data: initialWorking,
        mask: baseMask,
      },
    ];
    this._activeLayerId = 'layer-1';

    this.fillAll(defaultValue);
  }

  static fromBuffers<M extends MapId>(
    mapId: M,
    width: number,
    height: number,
    buffers: MapLayerBuffers<M>,
  ): MapBuffer<M> {
    return new MapBuffer(mapId, width, height, mapId === 'color' ? '#f4f1ea' : 0, buffers);
  }

  get layers(): readonly MapLayer<M>[] {
    return this._layers;
  }

  get activeLayerId(): string {
    return this._activeLayerId;
  }

  get activeLayerIndex(): number {
    const idx = this._layers.findIndex((l) => l.id === this._activeLayerId);
    return idx >= 0 ? idx : 0;
  }

  get activeLayer(): MapLayer<M> {
    const found = this._layers.find((l) => l.id === this._activeLayerId);
    if (found) return found;
    const fallback = this._layers[0];
    if (!fallback) {
      throw new Error(`MapBuffer (${this.mapId}) has no layers`);
    }
    this._activeLayerId = fallback.id;
    return fallback;
  }

  get isOverlayLayerActive(): boolean {
    return this.activeLayerIndex > 0 || !this._baseLayerOpaque;
  }

  get working(): MapDataArray<M> {
    return this.activeLayer.data;
  }

  get activeMask(): Uint8Array {
    return this.activeLayer.mask;
  }

  getLayerById(layerId: string): MapLayer<M> | undefined {
    return this._layers.find((l) => l.id === layerId);
  }

  setActiveLayer(layerId: string): boolean {
    if (!this._layers.some((l) => l.id === layerId)) return false;
    this._activeLayerId = layerId;
    return true;
  }

  addLayer(options?: {
    id?: string;
    name?: string;
    opacity?: number;
    blendMode?: LayerBlendMode;
  }): MapLayer<M> {
    const seq = this._nextLayerSeq++;
    const id = options?.id ?? `layer-${seq}`;
    const name = options?.name ?? `Layer ${seq}`;
    const pixelCount = this.width * this.height;
    const data = createDataArray(this.mapId, pixelCount);
    const mask = new Uint8Array(pixelCount);

    const newLayer: MapLayer<M> = {
      id,
      name,
      visible: true,
      locked: false,
      opacity: clamp01(options?.opacity ?? 1),
      blendMode: options?.blendMode ?? 'normal',
      data,
      mask,
    };

    const insertIdx = this.activeLayerIndex + 1;
    this._layers.splice(insertIdx, 0, newLayer);
    this._activeLayerId = newLayer.id;
    return newLayer;
  }

  duplicateLayer(layerId?: string, newName?: string): MapLayer<M> | null {
    const targetId = layerId ?? this._activeLayerId;
    const idx = this._layers.findIndex((l) => l.id === targetId);
    const src = idx >= 0 ? this._layers[idx] : undefined;
    if (!src) return null;
    const seq = this._nextLayerSeq++;
    const dup: MapLayer<M> = {
      id: `layer-${seq}`,
      name: newName ?? `${src.name} Copy`,
      visible: src.visible,
      locked: false,
      opacity: src.opacity,
      blendMode: src.blendMode,
      data: cloneDataArray(this.mapId, src.data),
      mask: new Uint8Array(src.mask),
    };
    this._layers.splice(idx + 1, 0, dup);
    this._activeLayerId = dup.id;
    return dup;
  }

  removeLayer(layerId: string): boolean {
    if (this._layers.length <= 1) return false;
    const idx = this._layers.findIndex((l) => l.id === layerId);
    if (idx < 0) return false;
    this._layers.splice(idx, 1);
    if (idx === 0) {
      this._baseLayerOpaque = false;
    }
    if (this._activeLayerId === layerId) {
      const nextIdx = Math.max(0, Math.min(this._layers.length - 1, idx - 1));
      const nextLayer = this._layers[nextIdx];
      if (nextLayer) {
        this._activeLayerId = nextLayer.id;
      }
    }
    return true;
  }

  clearLayer(layerId?: string): boolean {
    const targetId = layerId ?? this._activeLayerId;
    const idx = this._layers.findIndex((l) => l.id === targetId);
    const layer = idx >= 0 ? this._layers[idx] : undefined;
    if (!layer) return false;
    if (idx === 0 && this._baseLayerOpaque) {
      layer.data.set(this.base as never);
      layer.mask.fill(255);
    } else {
      (layer.data as Uint8ClampedArray | Float32Array).fill(0);
      layer.mask.fill(0);
    }
    return true;
  }

  moveLayer(layerId: string, direction: 'up' | 'down'): boolean {
    const idx = this._layers.findIndex((l) => l.id === layerId);
    if (idx < 0) return false;
    const targetIdx = direction === 'up' ? idx + 1 : idx - 1;
    if (targetIdx < 0 || targetIdx >= this._layers.length) return false;
    const [item] = this._layers.splice(idx, 1);
    if (!item) return false;
    this._layers.splice(targetIdx, 0, item);
    if (idx === 0 || targetIdx === 0) {
      this._baseLayerOpaque = false;
    }
    return true;
  }

  updateLayer(
    layerId: string,
    patch: Partial<Pick<MapLayer<M>, 'name' | 'visible' | 'locked' | 'opacity' | 'blendMode'>>,
  ): boolean {
    const layer = this._layers.find((l) => l.id === layerId);
    if (!layer) return false;
    if (patch.name !== undefined) {
      const trimmed = patch.name.trim();
      if (trimmed.length > 0) layer.name = trimmed;
    }
    if (patch.visible !== undefined) layer.visible = patch.visible;
    if (patch.locked !== undefined) layer.locked = patch.locked;
    if (patch.opacity !== undefined) layer.opacity = clamp01(patch.opacity);
    if (patch.blendMode !== undefined) layer.blendMode = patch.blendMode;
    return true;
  }

  mergeLayerDown(layerId?: string): boolean {
    const targetId = layerId ?? this._activeLayerId;
    const idx = this._layers.findIndex((l) => l.id === targetId);
    if (idx <= 0) return false;

    const upper = this._layers[idx];
    const lower = this._layers[idx - 1];
    if (!upper || !lower) return false;
    const pixelCount = this.width * this.height;

    if (upper.visible && upper.opacity > 0) {
      if (this.mapId === 'color') {
        const uData = upper.data as Uint8ClampedArray;
        const lData = lower.data as Uint8ClampedArray;
        for (let i = 0; i < pixelCount; i++) {
          const uCov = ((upper.mask[i] ?? 0) / 255) * upper.opacity;
          if (uCov <= 0) continue;
          const lCov = (lower.mask[i] ?? 0) / 255;
          const outCov = lCov + uCov * (1 - lCov);
          const w = lCov <= 0 ? 1 : outCov > 1e-6 ? uCov / outCov : 0;
          const p = i * 4;
          const br = blendChannel8(lData[p] ?? 0, uData[p] ?? 0, upper.blendMode);
          const bg = blendChannel8(lData[p + 1] ?? 0, uData[p + 1] ?? 0, upper.blendMode);
          const bb = blendChannel8(lData[p + 2] ?? 0, uData[p + 2] ?? 0, upper.blendMode);
          lData[p] = Math.round((lData[p] ?? 0) + (br - (lData[p] ?? 0)) * w);
          lData[p + 1] = Math.round((lData[p + 1] ?? 0) + (bg - (lData[p + 1] ?? 0)) * w);
          lData[p + 2] = Math.round((lData[p + 2] ?? 0) + (bb - (lData[p + 2] ?? 0)) * w);
          const nextMask = Math.round(outCov * 255);
          lower.mask[i] = nextMask;
          lData[p + 3] = nextMask;
        }
      } else {
        const uData = upper.data as Float32Array;
        const lData = lower.data as Float32Array;
        for (let i = 0; i < pixelCount; i++) {
          const uCov = ((upper.mask[i] ?? 0) / 255) * upper.opacity;
          if (uCov <= 0) continue;
          const lCov = (lower.mask[i] ?? 0) / 255;
          const outCov = lCov + uCov * (1 - lCov);
          const w = lCov <= 0 ? 1 : outCov > 1e-6 ? uCov / outCov : 0;
          const cur = lData[i] ?? 0;
          const blended = blendScalar(cur, uData[i] ?? 0, upper.blendMode);
          lData[i] = clamp01(cur + (blended - cur) * w);
          lower.mask[i] = Math.round(outCov * 255);
        }
      }
    }

    this._layers.splice(idx, 1);
    this._activeLayerId = lower.id;
    return true;
  }

  flattenLayers(baseLayerName = 'Layer 1'): void {
    const composited = cloneDataArray(this.mapId, this.getCompositeBuffer());
    const pixelCount = this.width * this.height;
    const baseMask = new Uint8Array(pixelCount);
    baseMask.fill(255);
    this._layers = [
      {
        id: 'layer-1',
        name: baseLayerName,
        visible: true,
        locked: false,
        opacity: 1,
        blendMode: 'normal',
        data: composited,
        mask: baseMask,
      },
    ];
    this._activeLayerId = 'layer-1';
    this._baseLayerOpaque = true;
  }

  snapshotLayers(): SerializedMapLayer<M>[] {
    return this._layers.map((l) => ({
      id: l.id,
      name: l.name,
      visible: l.visible,
      locked: l.locked,
      opacity: l.opacity,
      blendMode: l.blendMode,
      data: cloneDataArray(this.mapId, l.data),
      mask: new Uint8Array(l.mask),
      isOpaqueFull: this._baseLayerOpaque,
    }));
  }

  restoreLayers(snapshots: readonly SerializedMapLayer<M>[], activeLayerId?: string): void {
    if (snapshots.length === 0) return;
    this._layers = snapshots.map((s) => ({
      id: s.id,
      name: s.name,
      visible: s.visible,
      locked: s.locked,
      opacity: s.opacity,
      blendMode: s.blendMode,
      data: cloneDataArray(this.mapId, s.data),
      mask: new Uint8Array(s.mask),
    }));
    this._baseLayerOpaque = snapshots[0]?.isOpaqueFull ?? true;
    const firstId = this._layers[0]?.id ?? 'layer-1';
    const nextActive =
      activeLayerId && this._layers.some((l) => l.id === activeLayerId) ? activeLayerId : firstId;
    this._activeLayerId = nextActive;
  }

  getUnderlyingValueAt(pxIdx: number): number {
    if (this.mapId === 'color') return 0;
    const activeIdx = this.activeLayerIndex;
    let val = (this.base as Float32Array)[pxIdx] ?? 0;
    for (let i = 0; i < activeIdx; i++) {
      const layer = this._layers[i];
      if (!layer || !layer.visible || layer.opacity <= 0) continue;
      const cov = ((layer.mask[pxIdx] ?? 0) / 255) * layer.opacity;
      if (cov <= 0) continue;
      const src = (layer.data as Float32Array)[pxIdx] ?? 0;
      const blended = blendScalar(val, src, layer.blendMode);
      val = clamp01(val + (blended - val) * cov);
    }
    return val;
  }

  getCompositeBuffer(rect?: Rect): MapDataArray<M> {
    const first = this._layers[0];
    if (
      this._layers.length === 1 &&
      first &&
      this._baseLayerOpaque &&
      first.visible &&
      first.opacity >= 0.9999 &&
      first.blendMode === 'normal'
    ) {
      return first.data;
    }

    const pixelCount = this.width * this.height;
    if (!this._composite || this._composite.length !== this.base.length) {
      this._composite = createDataArray(this.mapId, pixelCount);
      this._composite.set(this.base as never);
    }

    const x0 = rect ? Math.max(0, rect.x) : 0;
    const y0 = rect ? Math.max(0, rect.y) : 0;
    const x1 = rect ? Math.min(this.width, rect.x + rect.w) : this.width;
    const y1 = rect ? Math.min(this.height, rect.y + rect.h) : this.height;
    if (x0 >= x1 || y0 >= y1) return this._composite;

    const fullRect = x0 === 0 && y0 === 0 && x1 === this.width && y1 === this.height;

    if (this.mapId === 'color') {
      const comp = this._composite as Uint8ClampedArray;
      const base = this.base as Uint8ClampedArray;
      if (fullRect) {
        comp.set(base);
      } else {
        const rowLen = (x1 - x0) * 4;
        for (let y = y0; y < y1; y++) {
          const start = (y * this.width + x0) * 4;
          comp.set(base.subarray(start, start + rowLen), start);
        }
      }

      for (let li = 0; li < this._layers.length; li++) {
        const layer = this._layers[li];
        if (!layer || !layer.visible || layer.opacity <= 0) continue;
        const lData = layer.data as Uint8ClampedArray;
        const lMask = layer.mask;
        const lOp = layer.opacity;
        const mode = layer.blendMode;

        if (li === 0 && this._baseLayerOpaque && lOp >= 0.9999 && mode === 'normal') {
          if (fullRect) {
            comp.set(lData);
          } else {
            const rowLen = (x1 - x0) * 4;
            for (let y = y0; y < y1; y++) {
              const start = (y * this.width + x0) * 4;
              comp.set(lData.subarray(start, start + rowLen), start);
            }
          }
          continue;
        }

        for (let y = y0; y < y1; y++) {
          const rowOffset = y * this.width;
          for (let x = x0; x < x1; x++) {
            const pxIdx = rowOffset + x;
            const cov = ((lMask[pxIdx] ?? 0) / 255) * lOp;
            if (cov <= 0) continue;
            const idx = pxIdx * 4;
            const dr = comp[idx] ?? 0;
            const dg = comp[idx + 1] ?? 0;
            const db = comp[idx + 2] ?? 0;
            const sr = lData[idx] ?? 0;
            const sg = lData[idx + 1] ?? 0;
            const sb = lData[idx + 2] ?? 0;
            const br = blendChannel8(dr, sr, mode);
            const bg = blendChannel8(dg, sg, mode);
            const bb = blendChannel8(db, sb, mode);
            comp[idx] = Math.round(dr + (br - dr) * cov);
            comp[idx + 1] = Math.round(dg + (bg - dg) * cov);
            comp[idx + 2] = Math.round(db + (bb - db) * cov);
            comp[idx + 3] = 255;
          }
        }
      }

      return this._composite;
    }

    const comp = this._composite as Float32Array;
    const base = this.base as Float32Array;
    if (fullRect) {
      comp.set(base);
    } else {
      const span = x1 - x0;
      for (let y = y0; y < y1; y++) {
        const start = y * this.width + x0;
        comp.set(base.subarray(start, start + span), start);
      }
    }

    for (let li = 0; li < this._layers.length; li++) {
      const layer = this._layers[li];
      if (!layer || !layer.visible || layer.opacity <= 0) continue;
      const lData = layer.data as Float32Array;
      const lMask = layer.mask;
      const lOp = layer.opacity;
      const mode = layer.blendMode;

      if (li === 0 && this._baseLayerOpaque && lOp >= 0.9999 && mode === 'normal') {
        if (fullRect) {
          comp.set(lData);
        } else {
          const span = x1 - x0;
          for (let y = y0; y < y1; y++) {
            const start = y * this.width + x0;
            comp.set(lData.subarray(start, start + span), start);
          }
        }
        continue;
      }

      for (let y = y0; y < y1; y++) {
        const rowOffset = y * this.width;
        for (let x = x0; x < x1; x++) {
          const pxIdx = rowOffset + x;
          const cov = ((lMask[pxIdx] ?? 0) / 255) * lOp;
          if (cov <= 0) continue;
          const dst = comp[pxIdx] ?? 0;
          const src = lData[pxIdx] ?? 0;
          const blended = blendScalar(dst, src, mode);
          comp[pxIdx] = clamp01(dst + (blended - dst) * cov);
        }
      }
    }

    return this._composite;
  }

  fillAll(defaultValue: number | string): void {
    if (this.mapId === 'color') {
      const hex = typeof defaultValue === 'string' ? defaultValue : '#f4f1ea';
      const rgb = hexToRgb01(hex);
      const r = Math.round(rgb.r * 255);
      const g = Math.round(rgb.g * 255);
      const b = Math.round(rgb.b * 255);
      const base = this.base as Uint8ClampedArray;
      for (let i = 0; i < base.length; i += 4) {
        base[i] = r;
        base[i + 1] = g;
        base[i + 2] = b;
        base[i + 3] = 255;
      }
    } else {
      const v = typeof defaultValue === 'number' ? defaultValue : 0;
      (this.base as Float32Array).fill(v);
    }

    const baseLayer = this._layers[0];
    if (baseLayer) {
      baseLayer.data.set(this.base as never);
      baseLayer.mask.fill(255);
      this._layers = [baseLayer];
      this._activeLayerId = baseLayer.id;
    }
    this._baseLayerOpaque = true;
    this.effective.set(this.base as never);
  }

  replaceBase(data: MapDataArray<M>): void {
    if (data.length !== this.base.length) {
      throw new Error(
        `Buffer size mismatch for ${this.mapId}: expected ${this.base.length}, got ${data.length}`,
      );
    }
    this.base.set(data as never);
    const baseLayer = this._layers[0];
    if (baseLayer) {
      baseLayer.data.set(data as never);
      baseLayer.mask.fill(255);
    }
    if (this._layers.length === 1) {
      this._baseLayerOpaque = true;
      this.effective.set(data as never);
    } else {
      this.effective.set(this.getCompositeBuffer() as never);
    }
  }

  replaceWorking(data: MapDataArray<M>): void {
    const active = this.activeLayer;
    if (data.length !== active.data.length) {
      throw new Error(
        `Buffer size mismatch for ${this.mapId}: expected ${active.data.length}, got ${data.length}`,
      );
    }
    active.data.set(data as never);
    active.mask.fill(255);
    if (this.activeLayerIndex === 0) {
      this._baseLayerOpaque = true;
    }
  }

  replaceEffective(data: MapDataArray<M>): void {
    if (data.length !== this.effective.length) {
      throw new Error(
        `Buffer size mismatch for ${this.mapId}: expected ${this.effective.length}, got ${data.length}`,
      );
    }
    this.effective.set(data as never);
  }

  copyWorkingFromBase(): void {
    const baseLayer = this._layers[0];
    if (baseLayer) {
      baseLayer.data.set(this.base as never);
      baseLayer.mask.fill(255);
    }
    this._baseLayerOpaque = true;
  }

  copyEffectiveFromWorking(): void {
    this.effective.set(this.getCompositeBuffer() as never);
  }
}
