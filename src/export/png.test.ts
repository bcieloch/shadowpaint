import { decode } from 'fast-png';
import { describe, expect, it } from 'vitest';
import { encodeColorPng, encodeGrayscaleMapPng } from '@/export/png';

interface PngIhdrInfo {
  width: number;
  height: number;
  bitDepth: number;
  colorType: number;
}

function parsePngIhdr(png: Uint8Array): PngIhdrInfo {
  // Signature: 89 50 4E 47 0D 0A 1A 0A, followed by IHDR length(4), "IHDR"(4), width(4), height(4), bitDepth(1), colorType(1)
  const view = new DataView(png.buffer, png.byteOffset, png.byteLength);
  expect(png[0]).toBe(0x89);
  expect(png[1]).toBe(0x50);
  expect(png[2]).toBe(0x4e);
  expect(png[3]).toBe(0x47);
  return {
    width: view.getUint32(16, false),
    height: view.getUint32(20, false),
    bitDepth: png[24] ?? -1,
    colorType: png[25] ?? -1,
  };
}

describe('PNG export encoders (fast-png)', () => {
  it('encodes height/opacity maps as 8-bit Grayscale Color Type 0 with round(v*255) values', () => {
    const width = 4;
    const height = 2;
    const src = new Float32Array([0, 0.25, 0.5, 191 / 255, 1, -0.2, 1.4, 0.1234]);
    const png = encodeGrayscaleMapPng(src, width, height);

    const ihdr = parsePngIhdr(png);
    expect(ihdr.width).toBe(width);
    expect(ihdr.height).toBe(height);
    expect(ihdr.bitDepth).toBe(8);
    expect(ihdr.colorType).toBe(0);

    const decoded = decode(png);
    expect(decoded.width).toBe(width);
    expect(decoded.height).toBe(height);
    expect(decoded.channels).toBe(1);
    expect(decoded.depth).toBe(8);
    expect(Array.from(decoded.data)).toEqual([
      0,
      64,
      128,
      191,
      255,
      0,
      255,
      Math.round(0.1234 * 255),
    ]);
  });

  it('encodes color map as CT2 (RGB) when alpha is false and CT6 (RGBA) when alpha is true', () => {
    const width = 2;
    const height = 1;
    const rgba = new Uint8ClampedArray([10, 20, 30, 128, 200, 210, 220, 255]);

    const rgbPng = encodeColorPng(rgba, width, height, false);
    const rgbIhdr = parsePngIhdr(rgbPng);
    expect(rgbIhdr.width).toBe(2);
    expect(rgbIhdr.height).toBe(1);
    expect(rgbIhdr.bitDepth).toBe(8);
    expect(rgbIhdr.colorType).toBe(2);

    const rgbaPng = encodeColorPng(rgba, width, height, true);
    const rgbaIhdr = parsePngIhdr(rgbaPng);
    expect(rgbaIhdr.bitDepth).toBe(8);
    expect(rgbaIhdr.colorType).toBe(6);

    const decodedRgba = decode(rgbaPng);
    expect(Array.from(decodedRgba.data)).toEqual([10, 20, 30, 128, 200, 210, 220, 255]);
  });
});
