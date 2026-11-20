import { describe, expect, it } from 'vitest';
import UTIF from 'utif';
import { decodeTiffBuffer, ImageDecodeError } from '@/imaging/decodeTiff';
import { detectImageFormat } from '@/imaging/detectFormat';
import { rgbaToGrayscaleFloat32 } from '@/imaging/grayscale';

/**
 * Builds a minimal uncompressed 16-bit grayscale (BlackIsZero, little-endian) TIFF in memory.
 */
function build16BitGrayscaleTiff(width: number, height: number, values: number[]): ArrayBuffer {
  const pixelBytes = width * height * 2;
  const ifdOffset = 8 + pixelBytes;
  const entriesCount = 8;
  const totalBytes = ifdOffset + 2 + entriesCount * 12 + 4;
  const buf = new ArrayBuffer(totalBytes);
  const view = new DataView(buf);
  const bytes = new Uint8Array(buf);

  // Header: II 42 + IFD offset
  bytes[0] = 0x49;
  bytes[1] = 0x49;
  view.setUint16(2, 42, true);
  view.setUint32(4, ifdOffset, true);

  for (let i = 0; i < width * height; i++) {
    view.setUint16(8 + i * 2, values[i] ?? 0, true);
  }

  let p = ifdOffset;
  view.setUint16(p, entriesCount, true);
  p += 2;

  const writeTag = (tag: number, type: number, count: number, value: number) => {
    view.setUint16(p, tag, true);
    view.setUint16(p + 2, type, true);
    view.setUint32(p + 4, count, true);
    if (type === 3 && count === 1) {
      view.setUint16(p + 8, value, true);
      view.setUint16(p + 10, 0, true);
    } else {
      view.setUint32(p + 8, value, true);
    }
    p += 12;
  };

  writeTag(256, 4, 1, width); // ImageWidth
  writeTag(257, 4, 1, height); // ImageLength
  writeTag(258, 3, 1, 16); // BitsPerSample
  writeTag(259, 3, 1, 1); // Compression = None
  writeTag(262, 3, 1, 1); // Photometric = BlackIsZero
  writeTag(273, 4, 1, 8); // StripOffsets
  writeTag(277, 3, 1, 1); // SamplesPerPixel
  writeTag(279, 4, 1, pixelBytes); // StripByteCounts
  view.setUint32(p, 0, true);

  return buf;
}

describe('detectImageFormat and decodeTiffBuffer', () => {
  it('detects PNG, JPEG, and TIFF magic bytes', () => {
    expect(detectImageFormat(new Uint8Array([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a]))).toBe('png');
    expect(detectImageFormat(new Uint8Array([0xff, 0xd8, 0xff, 0xe0]))).toBe('jpeg');
    expect(detectImageFormat(new Uint8Array([0x49, 0x49, 0x2a, 0x00]))).toBe('tiff');
    expect(detectImageFormat(new Uint8Array([0x4d, 0x4d, 0x00, 0x2a]))).toBe('tiff');
    expect(detectImageFormat(new Uint8Array([0x00, 0x01, 0x02, 0x03]))).toBeNull();
  });

  it('decodes 8-bit RGB TIFF encoded with UTIF', () => {
    const rgba = new Uint8Array([
      255, 0, 0, 255,
      0, 255, 0, 255,
      0, 0, 255, 255,
      255, 255, 255, 255,
    ]);
    const tiff = UTIF.encodeImage(rgba, 2, 2);
    const decoded = decodeTiffBuffer(tiff);

    expect(decoded.width).toBe(2);
    expect(decoded.height).toBe(2);
    expect(decoded.bitDepth).toBe(8);
    expect(decoded.gray16).toBeUndefined();
    expect(Array.from(decoded.rgba8)).toEqual(Array.from(rgba));
  });

  it('decodes 16-bit grayscale TIFF preserving full precision in gray16', () => {
    const tiff = build16BitGrayscaleTiff(2, 2, [0, 32768, 65535, 16384]);
    const decoded = decodeTiffBuffer(tiff);

    expect(decoded.width).toBe(2);
    expect(decoded.height).toBe(2);
    expect(decoded.bitDepth).toBe(16);
    expect(decoded.gray16).toBeDefined();
    expect(decoded.gray16?.[0]).toBe(0);
    expect(decoded.gray16?.[1]).toBeCloseTo(32768 / 65535, 5);
    expect(decoded.gray16?.[2]).toBe(1);
    expect(decoded.gray16?.[3]).toBeCloseTo(16384 / 65535, 5);
  });

  it('throws ImageDecodeError for corrupted TIFF bytes', () => {
    const bad = new Uint8Array([0x49, 0x49, 0x2a, 0x00, 0xff, 0xff, 0xff, 0xff]).buffer;
    expect(() => decodeTiffBuffer(bad)).toThrow(ImageDecodeError);
  });

  it('converts RGBA to Rec.709 grayscale with alpha composited over black', () => {
    const rgba = new Uint8ClampedArray([
      255, 255, 255, 255,
      255, 0, 0, 255,
      255, 255, 255, 0,
    ]);
    const gray = rgbaToGrayscaleFloat32(rgba);
    expect(gray[0]).toBeCloseTo(1, 5);
    expect(gray[1]).toBeCloseTo(0.2126, 4);
    expect(gray[2]).toBe(0);
  });
});
