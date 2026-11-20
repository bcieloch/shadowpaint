import { hexToRgb01 } from '@/core/units/colorTemperature';
import type { MapId } from '@/core/types';

export type MapDataArray<M extends MapId> = M extends 'color' ? Uint8ClampedArray : Float32Array;

export interface MapLayerBuffers<M extends MapId> {
  base: MapDataArray<M>;
  working: MapDataArray<M>;
  effective: MapDataArray<M>;
}

export class MapBuffer<M extends MapId = MapId> {
  readonly mapId: M;
  readonly width: number;
  readonly height: number;
  readonly base: MapDataArray<M>;
  readonly working: MapDataArray<M>;
  readonly effective: MapDataArray<M>;

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
      this.working = existing.working;
      this.effective = existing.effective;
      return;
    }

    if (mapId === 'color') {
      const byteCount = pixelCount * 4;
      this.base = new Uint8ClampedArray(byteCount) as MapDataArray<M>;
      this.working = new Uint8ClampedArray(byteCount) as MapDataArray<M>;
      this.effective = new Uint8ClampedArray(byteCount) as MapDataArray<M>;
    } else {
      this.base = new Float32Array(pixelCount) as MapDataArray<M>;
      this.working = new Float32Array(pixelCount) as MapDataArray<M>;
      this.effective = new Float32Array(pixelCount) as MapDataArray<M>;
    }

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

  fillAll(defaultValue: number | string): void {
    if (this.mapId === 'color') {
      const hex = typeof defaultValue === 'string' ? defaultValue : '#f4f1ea';
      const rgb = hexToRgb01(hex);
      const r = Math.round(rgb.r * 255);
      const g = Math.round(rgb.g * 255);
      const b = Math.round(rgb.b * 255);
      const base = this.base as Uint8ClampedArray;
      const working = this.working as Uint8ClampedArray;
      const effective = this.effective as Uint8ClampedArray;
      for (let i = 0; i < base.length; i += 4) {
        base[i] = r;
        base[i + 1] = g;
        base[i + 2] = b;
        base[i + 3] = 255;
      }
      working.set(base);
      effective.set(base);
    } else {
      const v = typeof defaultValue === 'number' ? defaultValue : 0;
      (this.base as Float32Array).fill(v);
      (this.working as Float32Array).fill(v);
      (this.effective as Float32Array).fill(v);
    }
  }

  replaceBase(data: MapDataArray<M>): void {
    if (data.length !== this.base.length) {
      throw new Error(
        `Buffer size mismatch for ${this.mapId}: expected ${this.base.length}, got ${data.length}`,
      );
    }
    this.base.set(data as never);
    this.working.set(data as never);
    this.effective.set(data as never);
  }

  replaceWorking(data: MapDataArray<M>): void {
    if (data.length !== this.working.length) {
      throw new Error(
        `Buffer size mismatch for ${this.mapId}: expected ${this.working.length}, got ${data.length}`,
      );
    }
    this.working.set(data as never);
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
    this.working.set(this.base as never);
  }

  copyEffectiveFromWorking(): void {
    this.effective.set(this.working as never);
  }
}
