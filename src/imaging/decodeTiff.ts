import UTIF from 'utif';
import { MAX_PROJECT_PX } from '@/core/constants';

export interface DecodedImageData {
  width: number;
  height: number;
  bitDepth: number;
  rgba8: Uint8ClampedArray;
  gray16?: Float32Array;
}

export type ImageDecodeErrorCode = 'unsupportedFormat' | 'corruptedFile' | 'imageTooLarge';

const IMAGE_DECODE_ERROR_PREFIX = 'IMAGE_DECODE_ERROR:';

export class ImageDecodeError extends Error {
  readonly code: ImageDecodeErrorCode;

  constructor(code: ImageDecodeErrorCode, message: string) {
    super(`${IMAGE_DECODE_ERROR_PREFIX}${code}:${message}`);
    this.name = 'ImageDecodeError';
    this.code = code;
  }
}

export function extractImageDecodeErrorCode(err: unknown): ImageDecodeErrorCode | null {
  if (err instanceof ImageDecodeError) {
    return err.code;
  }
  if (err && typeof err === 'object') {
    if ('code' in err) {
      const code = (err as { code?: unknown }).code;
      if (code === 'unsupportedFormat' || code === 'corruptedFile' || code === 'imageTooLarge') {
        return code;
      }
    }
    if ('message' in err && typeof (err as { message?: unknown }).message === 'string') {
      const msg = (err as { message: string }).message;
      if (msg.startsWith(IMAGE_DECODE_ERROR_PREFIX)) {
        const rawCode = msg.slice(IMAGE_DECODE_ERROR_PREFIX.length).split(':')[0];
        if (
          rawCode === 'unsupportedFormat' ||
          rawCode === 'corruptedFile' ||
          rawCode === 'imageTooLarge'
        ) {
          return rawCode;
        }
      }
    }
  }
  return null;
}

export function validateDecodedDimensions(width: number, height: number): void {
  if (!Number.isInteger(width) || !Number.isInteger(height) || width <= 0 || height <= 0) {
    throw new ImageDecodeError('corruptedFile', 'Invalid image dimensions');
  }
  if (width > MAX_PROJECT_PX || height > MAX_PROJECT_PX || width * height > 268_435_456) {
    throw new ImageDecodeError(
      'imageTooLarge',
      `Image dimensions ${width}x${height} exceed browser limits`,
    );
  }
}

export function decodeTiffBuffer(buffer: ArrayBuffer): DecodedImageData {
  let ifds: UTIF.TiffIfd[];
  try {
    ifds = UTIF.decode(buffer);
  } catch {
    throw new ImageDecodeError('corruptedFile', 'Failed to parse TIFF directory');
  }

  const first = ifds[0];
  if (!first) {
    throw new ImageDecodeError('corruptedFile', 'TIFF file contains no image frames');
  }

  try {
    UTIF.decodeImage(buffer, first, ifds);
  } catch {
    throw new ImageDecodeError('corruptedFile', 'Failed to decode TIFF image data');
  }

  const width = first.width;
  const height = first.height;
  validateDecodedDimensions(width, height);

  if (!first.data || first.data.length === 0) {
    throw new ImageDecodeError('corruptedFile', 'TIFF image data is empty');
  }

  const bitsPerSample = first.t258?.[0] ?? 8;
  const samplesPerPixel = first.t277?.[0] ?? first.t258?.length ?? 1;
  const photometric = first.t262?.[0] ?? 2;

  let gray16: Float32Array | undefined;
  if (bitsPerSample === 16 && samplesPerPixel === 1 && (photometric === 0 || photometric === 1)) {
    const pixelCount = width * height;
    const expectedBytes = pixelCount * 2;
    if (first.data.byteLength >= expectedBytes) {
      const view = new DataView(first.data.buffer, first.data.byteOffset, first.data.byteLength);
      const isLE = first.isLE ?? true;
      gray16 = new Float32Array(pixelCount);
      const invert = photometric === 0;
      for (let i = 0; i < pixelCount; i++) {
        const norm = view.getUint16(i * 2, isLE) / 65535;
        gray16[i] = invert ? 1 - norm : norm;
      }
    }
  }

  let rgbaRaw: Uint8Array;
  try {
    rgbaRaw = UTIF.toRGBA8(first);
  } catch {
    throw new ImageDecodeError('corruptedFile', 'Failed to convert TIFF to RGBA8');
  }

  if (rgbaRaw.length !== width * height * 4) {
    throw new ImageDecodeError('corruptedFile', 'Decoded TIFF buffer size mismatch');
  }

  const rgba8 = new Uint8ClampedArray(rgbaRaw.length);
  rgba8.set(rgbaRaw);

  if (gray16) {
    for (let i = 0; i < width * height; i++) {
      const byteVal = Math.round((gray16[i] ?? 0) * 255);
      const o = i * 4;
      rgba8[o] = byteVal;
      rgba8[o + 1] = byteVal;
      rgba8[o + 2] = byteVal;
      rgba8[o + 3] = 255;
    }
  }

  return {
    width,
    height,
    bitDepth: bitsPerSample,
    rgba8,
    gray16,
  };
}
