import { proxy, transfer } from 'comlink';
import {
  applyColorAdjustments,
  applyHeightAdjustments,
  applyOpacityAdjustments,
} from '@/core/maps/adjustments';
import { clampRect, isEmptyRect } from '@/core/maps/rect';
import { splitRowStripes } from '@/core/maps/stripes';
import type {
  AdjustmentsSettings,
  ColorAdjustments,
  FitMode,
  HeightAdjustments,
  ImportTransform,
  MapId,
  OpacityAdjustments,
  Rect,
} from '@/core/types';
import {
  gaussianBlurPatchInnerFloat32,
  gaussianBlurPatchInnerRgba8,
  getGaussianKernelPad,
} from '@/imaging/blur';
import { rgbaToGrayscaleFloat32 } from '@/imaging/grayscale';
import {
  resampleFloatWithTransform,
  resampleMaskUint8,
  resampleRgbaWithTransform,
} from '@/imaging/resample';
import {
  getLaplaceKernelPad,
  laplaceSmoothFloat32Region,
  laplaceSmoothRgba8Region,
} from '@/imaging/smooth';
import { createDefaultTransform } from '@/imaging/transform';
import { getActiveImageWorkerCount, getImageWorkerPoolSlot } from '@/workers/client';
import type { ResizeProjectMapsParams, ResizeProjectMapsResult } from '@/workers/image.worker';

export type WorkerPoolOpName =
  | 'computeEffectiveColor'
  | 'computeEffectiveHeight'
  | 'computeEffectiveOpacity'
  | 'blur'
  | 'smooth'
  | 'resample';

export interface WorkerPoolStats {
  poolSize: number;
  activeWorkers: number;
  activeJobs: number;
  totalJobs: number;
  lastDurationsMs: Record<WorkerPoolOpName, number | null>;
}

const MAX_POOL_WORKERS = 6;
const MIN_PARALLEL_PIXELS = 65536;

let activeJobs = 0;
let totalJobs = 0;
const lastDurationsMs: Record<WorkerPoolOpName, number | null> = {
  computeEffectiveColor: null,
  computeEffectiveHeight: null,
  computeEffectiveOpacity: null,
  blur: null,
  smooth: null,
  resample: null,
};

function recordJobDuration(op: WorkerPoolOpName, durationMs: number): void {
  lastDurationsMs[op] = Math.round(durationMs * 100) / 100;
  totalJobs++;
}

export function resolveOptimalPoolSize(height?: number, minRowsPerStripe = 64): number {
  const hw =
    typeof navigator !== 'undefined' &&
    typeof navigator.hardwareConcurrency === 'number' &&
    navigator.hardwareConcurrency > 0
      ? Math.floor(navigator.hardwareConcurrency)
      : 4;
  const maxWorkers = Math.max(1, Math.min(MAX_POOL_WORKERS, hw));
  if (height === undefined) {
    return maxWorkers;
  }
  return splitRowStripes(height, maxWorkers, minRowsPerStripe).length;
}

export function getWorkerPoolStats(): WorkerPoolStats {
  return {
    poolSize: resolveOptimalPoolSize(),
    activeWorkers: getActiveImageWorkerCount(),
    activeJobs,
    totalJobs,
    lastDurationsMs: { ...lastDurationsMs },
  };
}

export function resetWorkerPoolStats(): void {
  activeJobs = 0;
  totalJobs = 0;
  lastDurationsMs.computeEffectiveColor = null;
  lastDurationsMs.computeEffectiveHeight = null;
  lastDurationsMs.computeEffectiveOpacity = null;
  lastDurationsMs.blur = null;
  lastDurationsMs.smooth = null;
  lastDurationsMs.resample = null;
}

let warmUpPromise: Promise<void> | null = null;

export async function warmUpImageWorkerPool(): Promise<void> {
  if (typeof Worker === 'undefined') return;
  if (warmUpPromise) return warmUpPromise;

  const size = resolveOptimalPoolSize();
  warmUpPromise = Promise.all(
    Array.from({ length: size }, (_, i) => getImageWorkerPoolSlot(i).ping()),
  ).then(() => undefined);

  try {
    await warmUpPromise;
  } catch (err) {
    warmUpPromise = null;
    throw err;
  }
}

function canUseWorkers(): boolean {
  return typeof Worker !== 'undefined';
}

export async function computeEffectiveColorParallel(
  working: Uint8ClampedArray,
  width: number,
  height: number,
  params: ColorAdjustments,
  targetDst?: Uint8ClampedArray,
): Promise<Uint8ClampedArray> {
  const out =
    targetDst && targetDst.length === working.length
      ? targetDst
      : new Uint8ClampedArray(working.length);

  const t0 = performance.now();
  const isIdentity = params.brightness === 0 && params.contrast === 0 && params.saturation === 0;
  if (isIdentity || !canUseWorkers() || width * height < MIN_PARALLEL_PIXELS || height < 128) {
    applyColorAdjustments(working, out, width, height, params);
    recordJobDuration('computeEffectiveColor', performance.now() - t0);
    return out;
  }

  const stripes = splitRowStripes(height, resolveOptimalPoolSize(), 64);
  activeJobs++;
  try {
    await Promise.all(
      stripes.map(async (stripe) => {
        const start = stripe.yStart * width * 4;
        const end = stripe.yEnd * width * 4;
        const chunk = working.slice(start, end);
        const worker = getImageWorkerPoolSlot(stripe.index);
        const processed = await worker.computeEffectiveColor(
          transfer(chunk, [chunk.buffer]),
          width,
          stripe.rows,
          params,
          true,
        );
        out.set(processed, start);
      }),
    );
    recordJobDuration('computeEffectiveColor', performance.now() - t0);
    return out;
  } finally {
    activeJobs = Math.max(0, activeJobs - 1);
  }
}

export async function computeEffectiveHeightParallel(
  working: Float32Array,
  width: number,
  height: number,
  params: HeightAdjustments,
  targetDst?: Float32Array,
): Promise<Float32Array> {
  const out =
    targetDst && targetDst.length === working.length ? targetDst : new Float32Array(working.length);

  const t0 = performance.now();
  const isIdentity = !params.invert && params.contrast === 0 && params.gamma === 1;
  if (isIdentity || !canUseWorkers() || width * height < MIN_PARALLEL_PIXELS || height < 128) {
    applyHeightAdjustments(working, out, width, height, params);
    recordJobDuration('computeEffectiveHeight', performance.now() - t0);
    return out;
  }

  const stripes = splitRowStripes(height, resolveOptimalPoolSize(), 64);
  activeJobs++;
  try {
    await Promise.all(
      stripes.map(async (stripe) => {
        const start = stripe.yStart * width;
        const end = stripe.yEnd * width;
        const chunk = working.slice(start, end);
        const worker = getImageWorkerPoolSlot(stripe.index);
        const processed = await worker.computeEffectiveHeight(
          transfer(chunk, [chunk.buffer]),
          width,
          stripe.rows,
          params,
          true,
        );
        out.set(processed, start);
      }),
    );
    recordJobDuration('computeEffectiveHeight', performance.now() - t0);
    return out;
  } finally {
    activeJobs = Math.max(0, activeJobs - 1);
  }
}

export async function computeEffectiveOpacityParallel(
  working: Float32Array,
  width: number,
  height: number,
  params: OpacityAdjustments,
  targetDst?: Float32Array,
): Promise<Float32Array> {
  const out =
    targetDst && targetDst.length === working.length ? targetDst : new Float32Array(working.length);

  const t0 = performance.now();
  const isIdentity =
    !params.invert &&
    params.contrast === 0 &&
    params.maxTransmissionPct === 100 &&
    params.maxOpacityPct === 100;
  if (isIdentity || !canUseWorkers() || width * height < MIN_PARALLEL_PIXELS || height < 128) {
    applyOpacityAdjustments(working, out, width, height, params);
    recordJobDuration('computeEffectiveOpacity', performance.now() - t0);
    return out;
  }

  const stripes = splitRowStripes(height, resolveOptimalPoolSize(), 64);
  activeJobs++;
  try {
    await Promise.all(
      stripes.map(async (stripe) => {
        const start = stripe.yStart * width;
        const end = stripe.yEnd * width;
        const chunk = working.slice(start, end);
        const worker = getImageWorkerPoolSlot(stripe.index);
        const processed = await worker.computeEffectiveOpacity(
          transfer(chunk, [chunk.buffer]),
          width,
          stripe.rows,
          params,
          true,
        );
        out.set(processed, start);
      }),
    );
    recordJobDuration('computeEffectiveOpacity', performance.now() - t0);
    return out;
  } finally {
    activeJobs = Math.max(0, activeJobs - 1);
  }
}

export async function blurRegionParallel(
  params: {
    mapId: MapId;
    rgba8?: Uint8ClampedArray;
    scalar?: Float32Array;
    width: number;
    height: number;
    rect: Rect;
    radiusPx: number;
  },
  onProgress?: (progress: number) => void,
): Promise<{ rgba8?: Uint8ClampedArray; scalar?: Float32Array }> {
  const rect = clampRect(params.rect, params.width, params.height);
  if (isEmptyRect(rect)) {
    onProgress?.(1);
    return params.mapId === 'color'
      ? { rgba8: new Uint8ClampedArray(0) }
      : { scalar: new Float32Array(0) };
  }

  const t0 = performance.now();
  const pad = getGaussianKernelPad(params.radiusPx);
  const px0 = Math.max(0, rect.x - pad);
  const px1 = Math.min(params.width, rect.x + rect.w + pad);
  const pw = px1 - px0;
  const innerX = rect.x - px0;

  const stripes = splitRowStripes(rect.h, resolveOptimalPoolSize(), 64);
  const completedRows = new Array<number>(stripes.length).fill(0);
  const report = () => {
    if (!onProgress) return;
    let done = 0;
    for (let i = 0; i < completedRows.length; i++) {
      done += completedRows[i] ?? 0;
    }
    onProgress(Math.min(1, done / Math.max(1, rect.h)));
  };

  if (params.mapId === 'color' && params.rgba8) {
    const src = params.rgba8;
    const out = new Uint8ClampedArray(rect.w * rect.h * 4);
    activeJobs++;
    try {
      await Promise.all(
        stripes.map(async (stripe) => {
          const globalY0 = rect.y + stripe.yStart;
          const sy0 = Math.max(0, globalY0 - pad);
          const sy1 = Math.min(params.height, globalY0 + stripe.rows + pad);
          const ph = sy1 - sy0;
          const innerY = globalY0 - sy0;

          const patch = new Uint8ClampedArray(pw * ph * 4);
          for (let y = 0; y < ph; y++) {
            const sOff = ((sy0 + y) * params.width + px0) * 4;
            patch.set(src.subarray(sOff, sOff + pw * 4), y * pw * 4);
          }

          let innerOut: Uint8ClampedArray | undefined;
          if (canUseWorkers()) {
            const worker = getImageWorkerPoolSlot(stripe.index);
            const res = await worker.blurRegion(
              transfer(
                {
                  mapId: 'color',
                  patchW: pw,
                  patchH: ph,
                  innerX,
                  innerY,
                  innerW: rect.w,
                  innerH: stripe.rows,
                  radiusPx: params.radiusPx,
                  rgba8: patch,
                },
                [patch.buffer],
              ),
              onProgress
                ? proxy((p: number) => {
                    completedRows[stripe.index] = p * stripe.rows;
                    report();
                  })
                : undefined,
            );
            innerOut = res.rgba8;
          } else {
            innerOut = gaussianBlurPatchInnerRgba8(
              patch,
              pw,
              ph,
              { x: innerX, y: innerY, w: rect.w, h: stripe.rows },
              params.radiusPx,
            );
            completedRows[stripe.index] = stripe.rows;
            report();
          }

          if (innerOut) {
            out.set(innerOut, stripe.yStart * rect.w * 4);
          }
        }),
      );
      onProgress?.(1);
      recordJobDuration('blur', performance.now() - t0);
      return { rgba8: out };
    } finally {
      activeJobs = Math.max(0, activeJobs - 1);
    }
  }

  if (params.scalar) {
    const src = params.scalar;
    const out = new Float32Array(rect.w * rect.h);
    activeJobs++;
    try {
      await Promise.all(
        stripes.map(async (stripe) => {
          const globalY0 = rect.y + stripe.yStart;
          const sy0 = Math.max(0, globalY0 - pad);
          const sy1 = Math.min(params.height, globalY0 + stripe.rows + pad);
          const ph = sy1 - sy0;
          const innerY = globalY0 - sy0;

          const patch = new Float32Array(pw * ph);
          for (let y = 0; y < ph; y++) {
            const sOff = (sy0 + y) * params.width + px0;
            patch.set(src.subarray(sOff, sOff + pw), y * pw);
          }

          let innerOut: Float32Array | undefined;
          if (canUseWorkers()) {
            const worker = getImageWorkerPoolSlot(stripe.index);
            const res = await worker.blurRegion(
              transfer(
                {
                  mapId: params.mapId,
                  patchW: pw,
                  patchH: ph,
                  innerX,
                  innerY,
                  innerW: rect.w,
                  innerH: stripe.rows,
                  radiusPx: params.radiusPx,
                  scalar: patch,
                },
                [patch.buffer],
              ),
              onProgress
                ? proxy((p: number) => {
                    completedRows[stripe.index] = p * stripe.rows;
                    report();
                  })
                : undefined,
            );
            innerOut = res.scalar;
          } else {
            innerOut = gaussianBlurPatchInnerFloat32(
              patch,
              pw,
              ph,
              { x: innerX, y: innerY, w: rect.w, h: stripe.rows },
              params.radiusPx,
            );
            completedRows[stripe.index] = stripe.rows;
            report();
          }

          if (innerOut) {
            out.set(innerOut, stripe.yStart * rect.w);
          }
        }),
      );
      onProgress?.(1);
      recordJobDuration('blur', performance.now() - t0);
      return { scalar: out };
    } finally {
      activeJobs = Math.max(0, activeJobs - 1);
    }
  }

  onProgress?.(1);
  return {};
}

export async function smoothFloatMapParallel(
  working: Float32Array,
  width: number,
  height: number,
  radiusPx: number,
  onProgress?: (progress: number) => void,
): Promise<Float32Array> {
  const t0 = performance.now();
  const res = await blurRegionParallel(
    {
      mapId: 'height',
      scalar: working,
      width,
      height,
      rect: { x: 0, y: 0, w: width, h: height },
      radiusPx,
    },
    onProgress,
  );
  recordJobDuration('smooth', performance.now() - t0);
  return res.scalar ?? new Float32Array(working);
}

export async function smoothRegionParallel(params: {
  mapId: MapId;
  rgba8?: Uint8ClampedArray;
  scalar?: Float32Array;
  width: number;
  height: number;
  rect: Rect;
  iterations: number;
}): Promise<{ rgba8?: Uint8ClampedArray; scalar?: Float32Array }> {
  const rect = clampRect(params.rect, params.width, params.height);
  if (isEmptyRect(rect)) {
    return params.mapId === 'color'
      ? { rgba8: new Uint8ClampedArray(0) }
      : { scalar: new Float32Array(0) };
  }

  const t0 = performance.now();
  const pad = getLaplaceKernelPad(params.iterations);
  const px0 = Math.max(0, rect.x - pad);
  const px1 = Math.min(params.width, rect.x + rect.w + pad);
  const pw = px1 - px0;
  const innerX = rect.x - px0;
  const stripes = splitRowStripes(rect.h, resolveOptimalPoolSize(), 64);

  if (params.mapId === 'color' && params.rgba8) {
    const src = params.rgba8;
    const out = new Uint8ClampedArray(rect.w * rect.h * 4);
    activeJobs++;
    try {
      await Promise.all(
        stripes.map(async (stripe) => {
          const globalY0 = rect.y + stripe.yStart;
          const sy0 = Math.max(0, globalY0 - pad);
          const sy1 = Math.min(params.height, globalY0 + stripe.rows + pad);
          const ph = sy1 - sy0;
          const innerY = globalY0 - sy0;

          const patch = new Uint8ClampedArray(pw * ph * 4);
          for (let y = 0; y < ph; y++) {
            const sOff = ((sy0 + y) * params.width + px0) * 4;
            patch.set(src.subarray(sOff, sOff + pw * 4), y * pw * 4);
          }

          let innerOut: Uint8ClampedArray | undefined;
          if (canUseWorkers()) {
            const worker = getImageWorkerPoolSlot(stripe.index);
            const res = await worker.smoothRegion(
              transfer(
                {
                  mapId: 'color',
                  patchW: pw,
                  patchH: ph,
                  innerX,
                  innerY,
                  innerW: rect.w,
                  innerH: stripe.rows,
                  iterations: params.iterations,
                  rgba8: patch,
                },
                [patch.buffer],
              ),
            );
            innerOut = res.rgba8;
          } else {
            innerOut = laplaceSmoothRgba8Region(
              patch,
              pw,
              ph,
              { x: innerX, y: innerY, w: rect.w, h: stripe.rows },
              params.iterations,
            );
          }
          if (innerOut) {
            out.set(innerOut, stripe.yStart * rect.w * 4);
          }
        }),
      );
      recordJobDuration('smooth', performance.now() - t0);
      return { rgba8: out };
    } finally {
      activeJobs = Math.max(0, activeJobs - 1);
    }
  }

  if (params.scalar) {
    const src = params.scalar;
    const out = new Float32Array(rect.w * rect.h);
    activeJobs++;
    try {
      await Promise.all(
        stripes.map(async (stripe) => {
          const globalY0 = rect.y + stripe.yStart;
          const sy0 = Math.max(0, globalY0 - pad);
          const sy1 = Math.min(params.height, globalY0 + stripe.rows + pad);
          const ph = sy1 - sy0;
          const innerY = globalY0 - sy0;

          const patch = new Float32Array(pw * ph);
          for (let y = 0; y < ph; y++) {
            const sOff = (sy0 + y) * params.width + px0;
            patch.set(src.subarray(sOff, sOff + pw), y * pw);
          }

          let innerOut: Float32Array | undefined;
          if (canUseWorkers()) {
            const worker = getImageWorkerPoolSlot(stripe.index);
            const res = await worker.smoothRegion(
              transfer(
                {
                  mapId: params.mapId,
                  patchW: pw,
                  patchH: ph,
                  innerX,
                  innerY,
                  innerW: rect.w,
                  innerH: stripe.rows,
                  iterations: params.iterations,
                  scalar: patch,
                },
                [patch.buffer],
              ),
            );
            innerOut = res.scalar;
          } else {
            innerOut = laplaceSmoothFloat32Region(
              patch,
              pw,
              ph,
              { x: innerX, y: innerY, w: rect.w, h: stripe.rows },
              params.iterations,
            );
          }
          if (innerOut) {
            out.set(innerOut, stripe.yStart * rect.w);
          }
        }),
      );
      recordJobDuration('smooth', performance.now() - t0);
      return { scalar: out };
    } finally {
      activeJobs = Math.max(0, activeJobs - 1);
    }
  }

  return {};
}

export async function fitAndResampleMapParallel(
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
  },
  onProgress?: (progress: number) => void,
): Promise<{ rgba8?: Uint8ClampedArray; float32?: Float32Array }> {
  const t0 = performance.now();
  const stripes = splitRowStripes(params.dstHeight, resolveOptimalPoolSize(), 64);
  const completedRows = new Array<number>(stripes.length).fill(0);
  const report = () => {
    if (!onProgress) return;
    let done = 0;
    for (let i = 0; i < completedRows.length; i++) {
      done += completedRows[i] ?? 0;
    }
    onProgress(Math.min(1, done / Math.max(1, params.dstHeight)));
  };

  if (params.mapId === 'color' && params.rgba8) {
    const src = params.rgba8;
    const out = new Uint8ClampedArray(params.dstWidth * params.dstHeight * 4);
    if (!canUseWorkers() || stripes.length <= 1) {
      const full = resampleRgbaWithTransform({
        src,
        srcWidth: params.srcWidth,
        srcHeight: params.srcHeight,
        dstWidth: params.dstWidth,
        dstHeight: params.dstHeight,
        fit: params.fit,
        transform: params.transform,
        padRgba: params.padRgba ?? [244, 241, 234, 255],
        onProgress,
      });
      recordJobDuration('resample', performance.now() - t0);
      return { rgba8: full };
    }

    activeJobs++;
    try {
      await Promise.all(
        stripes.map(async (stripe) => {
          const srcCopy = new Uint8ClampedArray(src);
          const worker = getImageWorkerPoolSlot(stripe.index);
          const res = await worker.fitAndResampleMap(
            transfer(
              {
                mapId: 'color',
                rgba8: srcCopy,
                srcWidth: params.srcWidth,
                srcHeight: params.srcHeight,
                dstWidth: params.dstWidth,
                dstHeight: params.dstHeight,
                fit: params.fit,
                transform: params.transform,
                padRgba: params.padRgba,
                dstYStart: stripe.yStart,
                dstYEnd: stripe.yEnd,
              },
              [srcCopy.buffer],
            ),
            onProgress
              ? proxy((p: number) => {
                  completedRows[stripe.index] = p * stripe.rows;
                  report();
                })
              : undefined,
          );
          if (res.rgba8) {
            out.set(res.rgba8, stripe.yStart * params.dstWidth * 4);
          }
        }),
      );
      onProgress?.(1);
      recordJobDuration('resample', performance.now() - t0);
      return { rgba8: out };
    } finally {
      activeJobs = Math.max(0, activeJobs - 1);
    }
  }

  const srcFloat =
    params.gray16 ?? (params.rgba8 ? rgbaToGrayscaleFloat32(params.rgba8) : new Float32Array(0));
  const out = new Float32Array(params.dstWidth * params.dstHeight);

  if (!canUseWorkers() || stripes.length <= 1) {
    const full = resampleFloatWithTransform({
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
    recordJobDuration('resample', performance.now() - t0);
    return { float32: full };
  }

  activeJobs++;
  try {
    await Promise.all(
      stripes.map(async (stripe) => {
        const floatCopy = new Float32Array(srcFloat);
        const worker = getImageWorkerPoolSlot(stripe.index);
        const res = await worker.fitAndResampleMap(
          transfer(
            {
              mapId: params.mapId,
              gray16: floatCopy,
              srcWidth: params.srcWidth,
              srcHeight: params.srcHeight,
              dstWidth: params.dstWidth,
              dstHeight: params.dstHeight,
              fit: params.fit,
              transform: params.transform,
              padValue: params.padValue,
              dstYStart: stripe.yStart,
              dstYEnd: stripe.yEnd,
            },
            [floatCopy.buffer],
          ),
          onProgress
            ? proxy((p: number) => {
                completedRows[stripe.index] = p * stripe.rows;
                report();
              })
            : undefined,
        );
        if (res.float32) {
          out.set(res.float32, stripe.yStart * params.dstWidth);
        }
      }),
    );
    onProgress?.(1);
    recordJobDuration('resample', performance.now() - t0);
    return { float32: out };
  } finally {
    activeJobs = Math.max(0, activeJobs - 1);
  }
}

export async function resampleMaskParallel(params: {
  selection: Uint8Array;
  srcWidth: number;
  srcHeight: number;
  dstWidth: number;
  dstHeight: number;
}): Promise<Uint8Array> {
  const t0 = performance.now();
  const stripes = splitRowStripes(params.dstHeight, resolveOptimalPoolSize(), 128);
  if (!canUseWorkers() || stripes.length <= 1 || params.dstWidth * params.dstHeight < MIN_PARALLEL_PIXELS) {
    const out = resampleMaskUint8(
      params.selection,
      params.srcWidth,
      params.srcHeight,
      params.dstWidth,
      params.dstHeight,
    );
    recordJobDuration('resample', performance.now() - t0);
    return out;
  }

  const out = new Uint8Array(params.dstWidth * params.dstHeight);
  activeJobs++;
  try {
    await Promise.all(
      stripes.map(async (stripe) => {
        const copy = new Uint8Array(params.selection);
        const worker = getImageWorkerPoolSlot(stripe.index);
        const res = await worker.resampleMaskStripe(
          transfer(
            {
              selection: copy,
              srcWidth: params.srcWidth,
              srcHeight: params.srcHeight,
              dstWidth: params.dstWidth,
              dstHeight: params.dstHeight,
              dstYStart: stripe.yStart,
              dstYEnd: stripe.yEnd,
            },
            [copy.buffer],
          ),
        );
        out.set(res, stripe.yStart * params.dstWidth);
      }),
    );
    recordJobDuration('resample', performance.now() - t0);
    return out;
  } finally {
    activeJobs = Math.max(0, activeJobs - 1);
  }
}

export async function resizeProjectMapsParallel(
  params: ResizeProjectMapsParams,
  onProgress?: (progress: number) => void,
): Promise<ResizeProjectMapsResult> {
  const transform = createDefaultTransform(params.srcWidth, params.srcHeight);
  const step = (offset: number, span: number) => (p: number) => onProgress?.(offset + p * span);

  const [colorBaseRes, colorWorkingRes, heightBaseRes, heightWorkingRes, opacityBaseRes, opacityWorkingRes, selection] =
    await Promise.all([
      fitAndResampleMapParallel(
        {
          mapId: 'color',
          rgba8: params.colorBase,
          srcWidth: params.srcWidth,
          srcHeight: params.srcHeight,
          dstWidth: params.dstWidth,
          dstHeight: params.dstHeight,
          fit: 'stretch',
          transform,
        },
        step(0, 0.14),
      ),
      fitAndResampleMapParallel(
        {
          mapId: 'color',
          rgba8: params.colorWorking,
          srcWidth: params.srcWidth,
          srcHeight: params.srcHeight,
          dstWidth: params.dstWidth,
          dstHeight: params.dstHeight,
          fit: 'stretch',
          transform,
        },
        step(0.14, 0.14),
      ),
      fitAndResampleMapParallel(
        {
          mapId: 'height',
          gray16: params.heightBase,
          srcWidth: params.srcWidth,
          srcHeight: params.srcHeight,
          dstWidth: params.dstWidth,
          dstHeight: params.dstHeight,
          fit: 'stretch',
          transform,
        },
        step(0.28, 0.14),
      ),
      fitAndResampleMapParallel(
        {
          mapId: 'height',
          gray16: params.heightWorking,
          srcWidth: params.srcWidth,
          srcHeight: params.srcHeight,
          dstWidth: params.dstWidth,
          dstHeight: params.dstHeight,
          fit: 'stretch',
          transform,
        },
        step(0.42, 0.14),
      ),
      fitAndResampleMapParallel(
        {
          mapId: 'opacity',
          gray16: params.opacityBase,
          srcWidth: params.srcWidth,
          srcHeight: params.srcHeight,
          dstWidth: params.dstWidth,
          dstHeight: params.dstHeight,
          fit: 'stretch',
          transform,
        },
        step(0.56, 0.14),
      ),
      fitAndResampleMapParallel(
        {
          mapId: 'opacity',
          gray16: params.opacityWorking,
          srcWidth: params.srcWidth,
          srcHeight: params.srcHeight,
          dstWidth: params.dstWidth,
          dstHeight: params.dstHeight,
          fit: 'stretch',
          transform,
        },
        step(0.7, 0.14),
      ),
      params.selection
        ? resampleMaskParallel({
            selection: params.selection,
            srcWidth: params.srcWidth,
            srcHeight: params.srcHeight,
            dstWidth: params.dstWidth,
            dstHeight: params.dstHeight,
          })
        : Promise.resolve(new Uint8Array(params.dstWidth * params.dstHeight)),
    ]);

  const colorBase = colorBaseRes.rgba8 ?? new Uint8ClampedArray(params.dstWidth * params.dstHeight * 4);
  const colorWorking =
    colorWorkingRes.rgba8 ?? new Uint8ClampedArray(params.dstWidth * params.dstHeight * 4);
  const heightBase = heightBaseRes.float32 ?? new Float32Array(params.dstWidth * params.dstHeight);
  const heightWorking =
    heightWorkingRes.float32 ?? new Float32Array(params.dstWidth * params.dstHeight);
  const opacityBase = opacityBaseRes.float32 ?? new Float32Array(params.dstWidth * params.dstHeight);
  const opacityWorking =
    opacityWorkingRes.float32 ?? new Float32Array(params.dstWidth * params.dstHeight);

  const adjustments: AdjustmentsSettings | undefined = params.adjustments;
  const [colorEffective, heightEffective, opacityEffective] = adjustments
    ? await Promise.all([
        computeEffectiveColorParallel(
          colorWorking,
          params.dstWidth,
          params.dstHeight,
          adjustments.color,
        ),
        computeEffectiveHeightParallel(
          heightWorking,
          params.dstWidth,
          params.dstHeight,
          adjustments.height,
        ),
        computeEffectiveOpacityParallel(
          opacityWorking,
          params.dstWidth,
          params.dstHeight,
          adjustments.opacity,
        ),
      ])
    : [
        new Uint8ClampedArray(colorWorking),
        new Float32Array(heightWorking),
        new Float32Array(opacityWorking),
      ];

  onProgress?.(1);

  return {
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
  };
}
