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
  Rect,
  SelectionMode,
  Vec2,
} from '@/core/types';
import {
  gaussianBlurFloat32,
  gaussianBlurPatchInnerFloat32,
  gaussianBlurPatchInnerRgba8,
} from '@/imaging/blur';
import {
  decodeTiffBuffer,
  ImageDecodeError,
  validateDecodedDimensions,
} from '@/imaging/decodeTiff';
import { detectImageFormat } from '@/imaging/detectFormat';
import {
  applyFloodFillFloat32,
  applyFloodFillRgba8,
  applySelectionFillFloat32,
  applySelectionFillRgba8,
} from '@/imaging/floodFill';
import { applyGradientFloat32, applyGradientRgba8, type GradientKind } from '@/imaging/gradient';
import { rgbaToGrayscaleFloat32 } from '@/imaging/grayscale';
import {
  resampleFloatWithTransform,
  resampleMaskUint8,
  resampleRgbaWithTransform,
} from '@/imaging/resample';
import { createMagicWandMask, featherSelectionMask } from '@/imaging/selectionOps';
import { laplaceSmoothFloat32Region, laplaceSmoothRgba8Region } from '@/imaging/smooth';
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
      rgba8?: Uint8ClampedArray;
      gray16?: Float32Array;
      srcWidth: number;
      srcHeight: number;
      dstWidth: number;
      dstHeight: number;
      fit: FitMode;
      transform: ImportTransform;
      padRgba?: [number, number, number, number];
      padValue?: number;
      dstYStart?: number;
      dstYEnd?: number;
    },
    onProgress?: ProgressCallback,
  ): { rgba8?: Uint8ClampedArray; float32?: Float32Array } {
    if (params.mapId === 'color' && params.rgba8) {
      const resampled = resampleRgbaWithTransform({
        src: params.rgba8,
        srcWidth: params.srcWidth,
        srcHeight: params.srcHeight,
        dstWidth: params.dstWidth,
        dstHeight: params.dstHeight,
        fit: params.fit,
        transform: params.transform,
        padRgba: params.padRgba ?? [244, 241, 234, 255],
        dstYStart: params.dstYStart,
        dstYEnd: params.dstYEnd,
        onProgress,
      });
      return transfer({ rgba8: resampled }, [resampled.buffer]);
    }

    const srcFloat =
      params.gray16 ??
      (params.rgba8 ? rgbaToGrayscaleFloat32(params.rgba8) : new Float32Array(0));
    const resampled = resampleFloatWithTransform({
      src: srcFloat,
      srcWidth: params.srcWidth,
      srcHeight: params.srcHeight,
      dstWidth: params.dstWidth,
      dstHeight: params.dstHeight,
      fit: params.fit,
      transform: params.transform,
      padValue: params.padValue ?? 0,
      dstYStart: params.dstYStart,
      dstYEnd: params.dstYEnd,
      onProgress,
    });
    return transfer({ float32: resampled }, [resampled.buffer]);
  },

  resampleMaskStripe(params: {
    selection: Uint8Array;
    srcWidth: number;
    srcHeight: number;
    dstWidth: number;
    dstHeight: number;
    dstYStart?: number;
    dstYEnd?: number;
  }): Uint8Array {
    const out = resampleMaskUint8(
      params.selection,
      params.srcWidth,
      params.srcHeight,
      params.dstWidth,
      params.dstHeight,
      params.dstYStart,
      params.dstYEnd,
    );
    return transfer(out, [out.buffer]);
  },

  computeEffectiveColor(
    working: Uint8ClampedArray,
    width: number,
    height: number,
    params: ColorAdjustments,
    inPlace = false,
  ): Uint8ClampedArray {
    const out = inPlace ? working : new Uint8ClampedArray(working.length);
    applyColorAdjustments(working, out, width, height, params);
    return transfer(out, [out.buffer]);
  },

  computeEffectiveHeight(
    working: Float32Array,
    width: number,
    height: number,
    params: HeightAdjustments,
    inPlace = false,
  ): Float32Array {
    const out = inPlace ? working : new Float32Array(working.length);
    applyHeightAdjustments(working, out, width, height, params);
    return transfer(out, [out.buffer]);
  },

  computeEffectiveOpacity(
    working: Float32Array,
    width: number,
    height: number,
    params: OpacityAdjustments,
    inPlace = false,
  ): Float32Array {
    const out = inPlace ? working : new Float32Array(working.length);
    applyOpacityAdjustments(working, out, width, height, params);
    return transfer(out, [out.buffer]);
  },

  blurRegion(
    params: {
      mapId: MapId;
      patchW: number;
      patchH: number;
      innerX: number;
      innerY: number;
      innerW: number;
      innerH: number;
      radiusPx: number;
      rgba8?: Uint8ClampedArray;
      scalar?: Float32Array;
    },
    onProgress?: ProgressCallback,
  ): { rgba8?: Uint8ClampedArray; scalar?: Float32Array } {
    const inner = {
      x: params.innerX,
      y: params.innerY,
      w: params.innerW,
      h: params.innerH,
    };
    if (params.mapId === 'color' && params.rgba8) {
      const out = gaussianBlurPatchInnerRgba8(
        params.rgba8,
        params.patchW,
        params.patchH,
        inner,
        params.radiusPx,
        onProgress,
      );
      return transfer({ rgba8: out }, [out.buffer]);
    }
    if (params.scalar) {
      const out = gaussianBlurPatchInnerFloat32(
        params.scalar,
        params.patchW,
        params.patchH,
        inner,
        params.radiusPx,
        onProgress,
      );
      return transfer({ scalar: out }, [out.buffer]);
    }
    return {};
  },

  smoothRegion(params: {
    mapId: MapId;
    patchW: number;
    patchH: number;
    innerX: number;
    innerY: number;
    innerW: number;
    innerH: number;
    iterations: number;
    rgba8?: Uint8ClampedArray;
    scalar?: Float32Array;
  }): { rgba8?: Uint8ClampedArray; scalar?: Float32Array } {
    const inner = {
      x: params.innerX,
      y: params.innerY,
      w: params.innerW,
      h: params.innerH,
    };
    if (params.mapId === 'color' && params.rgba8) {
      const out = laplaceSmoothRgba8Region(
        params.rgba8,
        params.patchW,
        params.patchH,
        inner,
        params.iterations,
      );
      return transfer({ rgba8: out }, [out.buffer]);
    }
    if (params.scalar) {
      const out = laplaceSmoothFloat32Region(
        params.scalar,
        params.patchW,
        params.patchH,
        inner,
        params.iterations,
      );
      return transfer({ scalar: out }, [out.buffer]);
    }
    return {};
  },

  gradientFill(
    params: {
      mapId: MapId;
      width: number;
      height: number;
      kind: GradientKind;
      p0: Vec2;
      p1: Vec2;
      onlyInSelection: boolean;
      selectionMode: SelectionMode;
      startValue?: number;
      endValue?: number;
      startRgb?: readonly [number, number, number];
      endRgb?: readonly [number, number, number];
      rgba8?: Uint8ClampedArray;
      scalar?: Float32Array;
      mask?: Uint8Array;
    },
    onProgress?: ProgressCallback,
  ): { rgba8?: Uint8ClampedArray; scalar?: Float32Array; dirtyRect: Rect | null } {
    if (params.mapId === 'color' && params.rgba8) {
      const res = applyGradientRgba8({
        working: params.rgba8,
        width: params.width,
        height: params.height,
        kind: params.kind,
        p0: params.p0,
        p1: params.p1,
        startRgb: params.startRgb ?? [0, 0, 0],
        endRgb: params.endRgb ?? [255, 255, 255],
        mask: params.mask,
        selectionMode: params.selectionMode,
        onlyInSelection: params.onlyInSelection,
        onProgress,
      });
      return transfer({ rgba8: res.out, dirtyRect: res.dirtyRect }, [res.out.buffer]);
    }
    if (params.scalar) {
      const res = applyGradientFloat32({
        working: params.scalar,
        width: params.width,
        height: params.height,
        kind: params.kind,
        p0: params.p0,
        p1: params.p1,
        startValue: params.startValue ?? 0,
        endValue: params.endValue ?? 1,
        mask: params.mask,
        selectionMode: params.selectionMode,
        onlyInSelection: params.onlyInSelection,
        onProgress,
      });
      return transfer({ scalar: res.out, dirtyRect: res.dirtyRect }, [res.out.buffer]);
    }
    return { dirtyRect: null };
  },

  floodFill(
    params: {
      mapId: MapId;
      width: number;
      height: number;
      seedX: number;
      seedY: number;
      tolerancePct: number;
      contiguous: boolean;
      fillSelectionOnly?: boolean;
      selectionMode: SelectionMode;
      targetValue?: number;
      targetRgb?: readonly [number, number, number];
      rgba8?: Uint8ClampedArray;
      scalar?: Float32Array;
      mask?: Uint8Array;
    },
    onProgress?: ProgressCallback,
  ): { rgba8?: Uint8ClampedArray; scalar?: Float32Array; dirtyRect: Rect | null } {
    if (params.mapId === 'color' && params.rgba8) {
      const res = params.fillSelectionOnly
        ? applySelectionFillRgba8({
            working: params.rgba8,
            width: params.width,
            height: params.height,
            targetRgb: params.targetRgb ?? [255, 255, 255],
            mask: params.mask,
            onProgress,
          })
        : applyFloodFillRgba8({
            working: params.rgba8,
            width: params.width,
            height: params.height,
            seedX: params.seedX,
            seedY: params.seedY,
            tolerancePct: params.tolerancePct,
            contiguous: params.contiguous,
            targetRgb: params.targetRgb ?? [255, 255, 255],
            mask: params.mask,
            selectionMode: params.selectionMode,
            onProgress,
          });
      return transfer({ rgba8: res.out, dirtyRect: res.dirtyRect }, [res.out.buffer]);
    }
    if (params.scalar) {
      const res = params.fillSelectionOnly
        ? applySelectionFillFloat32({
            working: params.scalar,
            width: params.width,
            height: params.height,
            targetValue: params.targetValue ?? 0,
            mask: params.mask,
            onProgress,
          })
        : applyFloodFillFloat32({
            working: params.scalar,
            width: params.width,
            height: params.height,
            seedX: params.seedX,
            seedY: params.seedY,
            tolerancePct: params.tolerancePct,
            contiguous: params.contiguous,
            targetValue: params.targetValue ?? 0,
            mask: params.mask,
            selectionMode: params.selectionMode,
            onProgress,
          });
      return transfer({ scalar: res.out, dirtyRect: res.dirtyRect }, [res.out.buffer]);
    }
    return { dirtyRect: null };
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

  featherSelectionMask(
    src: Uint8Array,
    width: number,
    height: number,
    radiusPx: number,
    onProgress?: ProgressCallback,
  ): Uint8Array {
    const out = featherSelectionMask(src, width, height, radiusPx, onProgress);
    return transfer(out, [out.buffer]);
  },

  magicWandSelection(params: {
    width: number;
    height: number;
    seedX: number;
    seedY: number;
    tolerancePct: number;
    contiguous: boolean;
    sourceKind: MapId;
    colorData?: Uint8ClampedArray;
    scalarData?: Float32Array;
  }): Uint8Array {
    const out = createMagicWandMask(params);
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
