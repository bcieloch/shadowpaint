import { DEFAULT_COLOR_HEX, DEFAULT_HEIGHT_VALUE, DEFAULT_OPACITY_VALUE } from '@/core/constants';
import { TypedEmitter } from '@/core/events';
import { MapBuffer } from '@/core/maps/MapBuffer';
import type { MapId, Rect } from '@/core/types';

export interface MapDirtyEvent {
  mapId: MapId;
  rect: Rect;
}

export interface MapReplacedEvent {
  mapId: MapId | 'all';
  width: number;
  height: number;
}

export type MapRegistryEvents = {
  dirty: MapDirtyEvent;
  replaced: MapReplacedEvent;
};

export class MapMemoryError extends Error {
  readonly requiredBytes: number;

  constructor(requiredBytes: number, cause?: unknown) {
    super(`Failed to allocate map buffers (${Math.round(requiredBytes / (1024 * 1024))} MB)`);
    this.name = 'MapMemoryError';
    this.requiredBytes = requiredBytes;
    if (cause !== undefined) {
      this.cause = cause;
    }
  }
}

export interface MapDefaults {
  color?: string;
  height?: number;
  opacity?: number;
}

export interface ReplaceAllMapsParams {
  width: number;
  height: number;
  colorBase: Uint8ClampedArray;
  colorWorking: Uint8ClampedArray;
  colorEffective: Uint8ClampedArray;
  heightBase: Float32Array;
  heightWorking: Float32Array;
  heightEffective: Float32Array;
  opacityBase: Float32Array;
  opacityWorking: Float32Array;
  opacityEffective: Float32Array;
  selection?: Uint8Array;
}

const BYTES_PER_PIXEL_TOTAL = 4 * 3 + 4 * 3 + 4 * 3 + 1; // 37 bytes/px

export class MapRegistry {
  readonly events = new TypedEmitter<MapRegistryEvents>();

  private _width = 0;
  private _height = 0;
  private _color: MapBuffer<'color'> | null = null;
  private _heightMap: MapBuffer<'height'> | null = null;
  private _opacity: MapBuffer<'opacity'> | null = null;
  private _selection: Uint8Array | null = null;

  static estimateBytes(width: number, height: number): number {
    return Math.max(0, width) * Math.max(0, height) * BYTES_PER_PIXEL_TOTAL;
  }

  get width(): number {
    return this._width;
  }

  get height(): number {
    return this._height;
  }

  get isAllocated(): boolean {
    return (
      this._color !== null &&
      this._heightMap !== null &&
      this._opacity !== null &&
      this._selection !== null
    );
  }

  get color(): MapBuffer<'color'> {
    if (!this._color) throw new Error('MapRegistry is not allocated');
    return this._color;
  }

  get heightMap(): MapBuffer<'height'> {
    if (!this._heightMap) throw new Error('MapRegistry is not allocated');
    return this._heightMap;
  }

  get opacity(): MapBuffer<'opacity'> {
    if (!this._opacity) throw new Error('MapRegistry is not allocated');
    return this._opacity;
  }

  get selection(): Uint8Array {
    if (!this._selection) throw new Error('MapRegistry is not allocated');
    return this._selection;
  }

  getMap<M extends MapId>(mapId: M): MapBuffer<M> {
    if (mapId === 'color') return this.color as MapBuffer<M>;
    if (mapId === 'height') return this.heightMap as MapBuffer<M>;
    return this.opacity as MapBuffer<M>;
  }

  allocate(width: number, height: number, defaults: MapDefaults = {}): void {
    const requiredBytes = MapRegistry.estimateBytes(width, height);
    try {
      const nextColor = new MapBuffer('color', width, height, defaults.color ?? DEFAULT_COLOR_HEX);
      const nextHeight = new MapBuffer(
        'height',
        width,
        height,
        defaults.height ?? DEFAULT_HEIGHT_VALUE,
      );
      const nextOpacity = new MapBuffer(
        'opacity',
        width,
        height,
        defaults.opacity ?? DEFAULT_OPACITY_VALUE,
      );
      const nextSelection = new Uint8Array(width * height);

      this._width = width;
      this._height = height;
      this._color = nextColor;
      this._heightMap = nextHeight;
      this._opacity = nextOpacity;
      this._selection = nextSelection;
    } catch (err) {
      throw new MapMemoryError(requiredBytes, err);
    }

    this.events.emit('replaced', { mapId: 'all', width, height });
  }

  replaceAll(params: ReplaceAllMapsParams): void {
    const { width, height } = params;
    const pixelCount = width * height;
    const requiredBytes = MapRegistry.estimateBytes(width, height);

    try {
      const nextColor = MapBuffer.fromBuffers('color', width, height, {
        base: params.colorBase,
        working: params.colorWorking,
        effective: params.colorEffective,
      });
      const nextHeight = MapBuffer.fromBuffers('height', width, height, {
        base: params.heightBase,
        working: params.heightWorking,
        effective: params.heightEffective,
      });
      const nextOpacity = MapBuffer.fromBuffers('opacity', width, height, {
        base: params.opacityBase,
        working: params.opacityWorking,
        effective: params.opacityEffective,
      });
      const nextSelection = params.selection ?? new Uint8Array(pixelCount);
      if (nextSelection.length !== pixelCount) {
        throw new Error(
          `Selection buffer length mismatch: expected ${pixelCount}, got ${nextSelection.length}`,
        );
      }

      this._width = width;
      this._height = height;
      this._color = nextColor;
      this._heightMap = nextHeight;
      this._opacity = nextOpacity;
      this._selection = nextSelection;
    } catch (err) {
      if (err instanceof RangeError) {
        throw new MapMemoryError(requiredBytes, err);
      }
      throw err;
    }

    this.events.emit('replaced', { mapId: 'all', width, height });
  }

  emitDirty(mapId: MapId, rect: Rect): void {
    this.events.emit('dirty', { mapId, rect });
  }

  emitReplaced(mapId: MapId | 'all'): void {
    this.events.emit('replaced', { mapId, width: this._width, height: this._height });
  }
}

export const mapRegistry = new MapRegistry();
