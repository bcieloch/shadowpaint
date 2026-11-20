import { deflateSync, inflateSync } from 'fflate';

export function deflateBytesSync(bytes: Uint8Array, level = 1): Uint8Array {
  return deflateSync(bytes, { level: level as 0 | 1 | 2 | 3 | 4 | 5 | 6 | 7 | 8 | 9 });
}

export function inflateBytesSync(bytes: Uint8Array): Uint8Array {
  return inflateSync(bytes);
}
