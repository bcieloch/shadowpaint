import { expose, transfer } from 'comlink';
import {
  applyColorAdjustments,
  applyHeightAdjustments,
  applyOpacityAdjustments,
} from '@/core/maps/adjustments';
import type {
  AdjustmentsSettings,
  ColorAdjustments,
  FitMode,
  HeightAdjustments,
  ImageFormat,
  ImportTransform,
  MapId,
  OpacityAdjustments,
} from '@/core/types';
import { gaussianBlurFloat32 } from '@/imaging/blur';
import {
  decodeTiffBuffer,
  ImageDecodeError,
  validateDecodedDimensions,
} from '@/imaging/decodeTiff';
import { detectImageFormat } from '@/imaging/detectFormat';
import { rgbaToGrayscaleFloat32 } from '@/imaging/grayscale';
import {
  resampleFloatWithTransform,
  resampleMaskUint8,
  resampleRgbaWithTransform,
} from '@/imaging/resample';
import { createDefaultTransform } from '@/imaging/transform';

export type ProgressCallback = (progress: number) => void;

export interface DecodedAssetResult {
  format: ImageFormat;
  width: number;
  height: number;
  bitDepth: number;
  rgba8: Uint8ClampedArray;
  gray16?: Float32Array;
  thumbRgba: Uint8ClampedArray;
  thumbWidth: number;
  thumbHeight: number;
}

export interface ResizeProjectMapsParams {
  srcWidth: number;
  srcHeight: number;
  dstWidth: number;
  dstHeight: number;
  colorBase: Uint8ClampedArray;
  colorWorking: Uint8ClampedArray;
  heightBase: Float32Array;
  heightWorking: Float32Array;
  opacityBase: Float32Array;
  opacityWorking: Float32Array;
  selection?: Uint8Array;
  adjustments?: AdjustmentsSettings;
}

export interface ResizeProjectMapsResult {
  colorBase: Uint8ClampedArray;
  colorWorking: Uint8ClampedArray;
  colorEffective: Uint8ClampedArray;
  heightBase: Float32Array;
  heightWorking: Float32Array;
  heightEffective: Float32Array;
  opacityBase: Float32Array;
  opacityWorking: Float32Array;
  opacityEffective: Float32Array;
  selection: Uint8Array;
}

function buildThumbnail(
  rgba8: Uint8ClampedArray,
  width: number,
  height: number,
  maxSide = 512,
): { thumbRgba: Uint8ClampedArray; thumbWidth: number; thumbHeight: number } {
  const longest = Math.max(width, height);
  if (longest <= maxSide) {
    const copy = new Uint8ClampedArray(rgba8.length);
    copy.set(rgba8);
    return { thumbRgba: copy, thumbWidth: width, thumbHeight: height };
  }
  const scale = maxSide / longest;
  const thumbWidth = Math.max(1, Math.round(width * scale));
  const thumbHeight = Math.max(1, Math.round(height * scale));
  const thumbRgba = resampleRgbaWithTransform({
    src: rgba8,
    srcWidth: width,
    srcHeight: height,
    dstWidth: thumbWidth,
    dstHeight: thumbHeight,
    fit: 'stretch',
    transform: createDefaultTransform(width, height),
  });
  return { thumbRgba, thumbWidth, thumbHeight };
}

const imageWorkerApi = {
  ping(): string {
    return 'image-worker-ok';
  },

  async decodeImageBuffer(buffer: ArrayBuffer): Promise<DecodedAssetResult> {
    const bytes = new Uint8Array(buffer);
    const format = detectImageFormat(bytes);
    if (!format) {
      throw new ImageDecodeError('unsupportedFormat', 'Unsupported image file format');
    }

    let width: number;
    let height: number;
    let bitDepth = 8;
    let rgba8: Uint8ClampedArray;
    let gray16: Float32Array | undefined;

    if (format === 'tiff') {
      const decoded = decodeTiffBuffer(buffer);
      width = decoded.width;
      height = decoded.height;
      bitDepth = decoded.bitDepth;
      rgba8 = decoded.rgba8;
      gray16 = decoded.gray16;
    } else {
      const mime = format === 'png' ? 'image/png' : 'image/jpeg';
      let bitmap: ImageBitmap;
      try {
        bitmap = await createImageBitmap(new Blob([buffer], { type: mime }), {
          colorSpaceConversion: 'none',
          premultiplyAlpha: 'none',
        });
      } catch {
        throw new ImageDecodeError('corruptedFile', 'Failed to decode PNG/JPEG image');
      }

      try {
        width = bitmap.width;
        height = bitmap.height;
        validateDecodedDimensions(width, height);

        const canvas = new OffscreenCanvas(width, height);
        const ctx = canvas.getContext('2d', {
          willReadFrequently: true,
          colorSpace: 'srgb',
        });
        if (!ctx) {
          throw new ImageDecodeError('corruptedFile', 'OffscreenCanvas 2D context unavailable');
        }
        ctx.drawImage(bitmap, 0, 0);
        rgba8 = ctx.getImageData(0, 0, width, height).data;
      } finally {
        bitmap.close();
      }
    }

    const thumb = buildThumbnail(rgba8, width, height, 512);
    const transferables: Transferable[] = [rgba8.buffer, thumb.thumbRgba.buffer];
    if (gray16) {
      transferables.push(gray16.buffer);
    }

    return transfer(
      {
        format,
        width,
        height,
        bitDepth,
        rgba8,
        gray16,
        thumbRgba: thumb.thumbRgba,
        thumbWidth: thumb.thumbWidth,
        thumbHeight: thumb.thumbHeight,
      },
      transferables,
    );
  },

  fitAndResampleMap(
    params: {
      mapId: MapId;
      rgba8: Uint8ClampedArray;
      gray16?: Float32Array;
      srcWidth: number;
      srcHeight: number;
      dstWidth: number;
      dstHeight: number;
      fit: FitMode;
      transform: ImportTransform;
      padRgba?: [number, number, number, number];
      padValue?: number;
    },
    onProgress?: ProgressCallback,
  ): { rgba8?: Uint8ClampedArray; float32?: Float32Array } {
    if (params.mapId === 'color') {
      const resampled = resampleRgbaWithTransform({
        src: params.rgba8,
        srcWidth: params.srcWidth,
        srcHeight: params.srcHeight,
        dstWidth: params.dstWidth,
        dstHeight: params.dstHeight,
        fit: params.fit,
        transform: params.transform,
        padRgba: params.padRgba ?? [244, 241, 234, 255],
        onProgress,
      });
      return transfer({ rgba8: resampled }, [resampled.buffer]);
    }

    const srcFloat = params.gray16 ?? rgbaToGrayscaleFloat32(params.rgba8);
    const resampled = resampleFloatWithTransform({
      src: srcFloat,
      srcWidth: params.srcWidth,
      srcHeight: params.srcHeight,
      dstWidth: params.dstWidth,
      dstHeight: params.dstHeight,
      fit: params.fit,
      transform: params.transform,
      padValue: params.padValue ?? 0,
      onProgress,
    });
    return transfer({ float32: resampled }, [resampled.buffer]);
  },

  computeEffectiveColor(
    working: Uint8ClampedArray,
    width: number,
    height: number,
    params: ColorAdjustments,
  ): Uint8ClampedArray {
    const out = new Uint8ClampedArray(working.length);
    applyColorAdjustments(working, out, width, height, params);
    return transfer(out, [out.buffer]);
  },

  computeEffectiveHeight(
    working: Float32Array,
    width: number,
    height: number,
    params: HeightAdjustments,
  ): Float32Array {
    const out = new Float32Array(working.length);
    applyHeightAdjustments(working, out, width, height, params);
    return transfer(out, [out.buffer]);
  },

  computeEffectiveOpacity(
    working: Float32Array,
    width: number,
    height: number,
    params: OpacityAdjustments,
  ): Float32Array {
    const out = new Float32Array(working.length);
    applyOpacityAdjustments(working, out, width, height, params);
    return transfer(out, [out.buffer]);
  },

  smoothFloatMap(
    working: Float32Array,
    width: number,
    height: number,
    radiusPx: number,
    onProgress?: ProgressCallback,
  ): Float32Array {
    const out = gaussianBlurFloat32(working, width, height, radiusPx, onProgress);
    return transfer(out, [out.buffer]);
  },

  resizeProjectMaps(
    params: ResizeProjectMapsParams,
    onProgress?: ProgressCallback,
  ): ResizeProjectMapsResult {
    const transform = createDefaultTransform(params.srcWidth, params.srcHeight);
    const step = (offset: number, span: number) => (p: number) => onProgress?.(offset + p * span);

    const colorBase = resampleRgbaWithTransform({
      src: params.colorBase,
      srcWidth: params.srcWidth,
      srcHeight: params.srcHeight,
      dstWidth: params.dstWidth,
      dstHeight: params.dstHeight,
      fit: 'stretch',
      transform,
      onProgress: step(0, 0.16),
    });
    const colorWorking = resampleRgbaWithTransform({
      src: params.colorWorking,
      srcWidth: params.srcWidth,
      srcHeight: params.srcHeight,
      dstWidth: params.dstWidth,
      dstHeight: params.dstHeight,
      fit: 'stretch',
      transform,
      onProgress: step(0.16, 0.16),
    });
    const heightBase = resampleFloatWithTransform({
      src: params.heightBase,
      srcWidth: params.srcWidth,
      srcHeight: params.srcHeight,
      dstWidth: params.dstWidth,
      dstHeight: params.dstHeight,
      fit: 'stretch',
      transform,
      onProgress: step(0.32, 0.15),
    });
    const heightWorking = resampleFloatWithTransform({
      src: params.heightWorking,
      srcWidth: params.srcWidth,
      srcHeight: params.srcHeight,
      dstWidth: params.dstWidth,
      dstHeight: params.dstHeight,
      fit: 'stretch',
      transform,
      onProgress: step(0.47, 0.15),
    });
    const opacityBase = resampleFloatWithTransform({
      src: params.opacityBase,
      srcWidth: params.srcWidth,
      srcHeight: params.srcHeight,
      dstWidth: params.dstWidth,
      dstHeight: params.dstHeight,
      fit: 'stretch',
      transform,
      onProgress: step(0.62, 0.14),
    });
    const opacityWorking = resampleFloatWithTransform({
      src: params.opacityWorking,
      srcWidth: params.srcWidth,
      srcHeight: params.srcHeight,
      dstWidth: params.dstWidth,
      dstHeight: params.dstHeight,
      fit: 'stretch',
      transform,
      onProgress: step(0.76, 0.14),
    });

    const selection = params.selection
      ? resampleMaskUint8(
          params.selection,
          params.srcWidth,
          params.srcHeight,
          params.dstWidth,
          params.dstHeight,
        )
      : new Uint8Array(params.dstWidth * params.dstHeight);

    const colorEffective = new Uint8ClampedArray(colorWorking.length);
    const heightEffective = new Float32Array(heightWorking.length);
    const opacityEffective = new Float32Array(opacityWorking.length);

    if (params.adjustments) {
      applyColorAdjustments(
        colorWorking,
        colorEffective,
        params.dstWidth,
        params.dstHeight,
        params.adjustments.color,
      );
      applyHeightAdjustments(
        heightWorking,
        heightEffective,
        params.dstWidth,
        params.dstHeight,
        params.adjustments.height,
      );
      applyOpacityAdjustments(
        opacityWorking,
        opacityEffective,
        params.dstWidth,
        params.dstHeight,
        params.adjustments.opacity,
      );
    } else {
      colorEffective.set(colorWorking);
      heightEffective.set(heightWorking);
      opacityEffective.set(opacityWorking);
    }

    onProgress?.(1);

    return transfer(
      {
        colorBase,
        colorWorking,
        colorEffective,
        heightBase,
        heightWorking,
        heightEffective,
        opacityBase,
        opacityWorking,
        opacityEffective,
        selection,
      },
      [
        colorBase.buffer,
        colorWorking.buffer,
        colorEffective.buffer,
        heightBase.buffer,
        heightWorking.buffer,
        heightEffective.buffer,
        opacityBase.buffer,
        opacityWorking.buffer,
        opacityEffective.buffer,
        selection.buffer,
      ],
    );
  },
};

export type ImageWorkerApi = typeof imageWorkerApi;

expose(imageWorkerApi);
