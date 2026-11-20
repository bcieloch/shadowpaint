/// <reference types="vite/client" />

declare module '*.glsl?raw' {
  const source: string;
  export default source;
}

export interface ShadowPaintDebugHandle {
  getMemoryInfo: () => { geometries: number; textures: number; programs: number };
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
  } | null;
  readFlatCanvasRgba: (width?: number, height?: number) => Uint8Array;
  read3DViewportRgba: (width?: number, height?: number) => Uint8Array;
  getMapEffectiveRgba: () => Uint8ClampedArray;
  emitColorDirtyPixel: (x: number, y: number, rgba: [number, number, number, number]) => void;
  emitHeightDirtyBlock: (x: number, y: number, w: number, h: number, value: number) => void;
}

declare global {
  interface Window {
    __shadowpaintDebug?: ShadowPaintDebugHandle;
  }
}
