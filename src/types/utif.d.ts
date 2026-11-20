declare module 'utif' {
  export interface TiffIfd {
    width: number;
    height: number;
    data: Uint8Array;
    isLE?: boolean;
    t256?: number[];
    t257?: number[];
    t258?: number[];
    t259?: number[];
    t262?: number[];
    t277?: number[];
    [tag: string]: unknown;
  }

  export function decode(buffer: ArrayBufferLike): TiffIfd[];
  export function decodeImage(buffer: ArrayBufferLike, img: TiffIfd, ifds: TiffIfd[]): void;
  export function toRGBA8(img: TiffIfd): Uint8Array;
  export function encodeImage(
    rgba: Uint8Array | Uint8ClampedArray,
    width: number,
    height: number,
    metadata?: Record<string, unknown>,
  ): ArrayBuffer;
}
