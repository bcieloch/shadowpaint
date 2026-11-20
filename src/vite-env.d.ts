/// <reference types="vite/client" />

declare module '*.glsl?raw' {
  const source: string;
  export default source;
}

export interface ShadowPaintDebugHandle {
  getMemoryInfo: () => { geometries: number; textures: number; programs: number };
  readFlatCanvasRgba: (width?: number, height?: number) => Uint8Array;
  getMapEffectiveRgba: () => Uint8ClampedArray;
  emitColorDirtyPixel: (
    x: number,
    y: number,
    rgba: [number, number, number, number],
  ) => void;
}

declare global {
  interface Window {
    __shadowpaintDebug?: ShadowPaintDebugHandle;
  }
}
