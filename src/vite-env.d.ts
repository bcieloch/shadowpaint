/// <reference types="vite/client" />
import type { ColorAdjustments, MapId } from '@/core/types';
import type { EnginePerformanceSnapshot } from '@/engine3d/Engine';
import type { GpuCapabilities } from '@/lib/webgl';
import type { WorkerPoolStats } from '@/workers/pool';

declare module '*.glsl?raw' {
  const source: string;
  export default source;
}

declare module '*.ttf?inline' {
  const dataUrl: string;
  export default dataUrl;
}

export interface ShadowPaintDebugHandle {
  getMemoryInfo: () => { geometries: number; textures: number; programs: number };
  getPerformanceSnapshot: () => EnginePerformanceSnapshot | null;
  getWorkerPoolStats: () => WorkerPoolStats;
  getGpuCapabilities: () => GpuCapabilities;
  flushDirtyEffectiveTiles: (mapId?: MapId, emitDirty?: boolean) => void;
  benchmarkComputeEffectiveColor: (adjustments?: ColorAdjustments) => Promise<{
    durationMs: number;
    width: number;
    height: number;
    activeWorkers: number;
  }>;
  getBuiltDimensions: () => {
    widthPx: number;
    heightPx: number;
    widthCm: number;
    heightCm: number;
  };
  get3DStats: () => {
    boundingBoxSizeCm: { x: number; y: number; z: number };
    displacement: {
      displacementScale: number;
      displacementBias: number;
      minDisplacementCm: number;
      maxDisplacementCm: number;
    };
    segX: number;
    segY: number;
    vertices: number;
    frameVisible: boolean;
    gridVisible: boolean;
  } | null;
  getFrontLightStats: () => {
    position: { x: number; y: number; z: number };
    target: { x: number; y: number; z: number };
    intensity: number;
    castShadow: boolean;
    shadowMapSize: 2048 | 4096 | 8192;
    gizmoVisible: boolean;
  } | null;
  getBackLightStats: () => {
    type: 'point' | 'panel';
    position: { x: number; y: number; z: number };
    intensity: number;
    globalTransmissionPct: number;
    attenuation: number;
    backScale: number;
    gizmoVisible: boolean;
  } | null;
  getCrossSection3DStats: () => {
    visible: boolean;
    vertexCount: number;
    hoverVisible: boolean;
    minZCm: number | null;
    maxZCm: number | null;
  } | null;
  getCursor3DStats: () => {
    visible: boolean;
    worldPos: { x: number; y: number; z: number } | null;
  } | null;
  getSelectionStats: () => {
    hasSelection: boolean;
    selectedPixels: number;
    mode: 'protect' | 'editInside';
  };
  sampleRenderedPixel: (cssX: number, cssY: number) => [number, number, number, number];
  readFlatCanvasRgba: (
    width?: number,
    height?: number,
    options?: { toneMapping?: 'aces' | 'none' },
  ) => Uint8Array;
  read3DViewportRgba: (width?: number, height?: number) => Uint8Array;
  getMapEffectiveRgba: () => Uint8ClampedArray;
  emitColorDirtyPixel: (x: number, y: number, rgba: [number, number, number, number]) => void;
  emitColorDirtyBlock: (
    x: number,
    y: number,
    w: number,
    h: number,
    rgba: [number, number, number, number],
  ) => void;
  emitHeightDirtyBlock: (x: number, y: number, w: number, h: number, value: number) => void;
  emitOpacityDirtyBlock: (x: number, y: number, w: number, h: number, value: number) => void;
}

declare global {
  interface Window {
    __shadowpaintDebug?: ShadowPaintDebugHandle;
  }
}
