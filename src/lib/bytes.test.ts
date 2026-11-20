import { describe, expect, it } from 'vitest';
import {
  asUint8Array,
  crc32,
  crc32Hex,
  float32ToLittleEndianBytes,
  formatByteSize,
  littleEndianBytesToFloat32,
} from '@/lib/bytes';

describe('bytes utilities', () => {
  it('computes standard IEEE 802.3 CRC32 for known vectors', () => {
    const empty = new Uint8Array(0);
    expect(crc32(empty)).toBe(0x00000000);
    expect(crc32Hex(empty)).toBe('00000000');

    const checkVec = new TextEncoder().encode('123456789');
    expect(crc32(checkVec)).toBe(0xcbf43926);
    expect(crc32Hex(checkVec)).toBe('cbf43926');
  });

  it('round-trips Float32Array through little-endian bytes', () => {
    const src = new Float32Array([0, 0.25, 0.5, 1, -12.375, 1234.5]);
    const bytes = float32ToLittleEndianBytes(src);
    expect(bytes.byteLength).toBe(src.length * 4);
    const restored = littleEndianBytesToFloat32(bytes);
    expect(Array.from(restored)).toEqual(Array.from(src));
  });

  it('throws when Float32 byte length is not divisible by 4', () => {
    expect(() => littleEndianBytesToFloat32(new Uint8Array(5))).toThrow();
  });

  it('views typed array slices safely and formats byte sizes', () => {
    const clamped = new Uint8ClampedArray([10, 20, 30, 255]);
    const u8 = asUint8Array(clamped);
    expect(Array.from(u8)).toEqual([10, 20, 30, 255]);
    expect(formatByteSize(0)).toBe('0 B');
    expect(formatByteSize(512)).toBe('512 B');
    expect(formatByteSize(2048)).toBe('2.0 KB');
    expect(formatByteSize(5 * 1024 * 1024)).toBe('5.0 MB');
  });
});
