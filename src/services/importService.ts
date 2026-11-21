import { create } from 'zustand';
import {
  ASPECT_RATIO_TOLERANCE,
  DEFAULT_COLOR_HEX,
  DEFAULT_HEIGHT_VALUE,
  DEFAULT_OPACITY_VALUE,
} from '@/core/constants';
import { MapMemoryError, mapRegistry } from '@/core/maps/MapRegistry';
import type { CanvasSettings, FitMode, ImportTransform, MapId } from '@/core/types';
import { computeHeightFromWidthPx } from '@/core/units/calibration';
import { hexToRgb01 } from '@/core/units/colorTemperature';
import { extractImageDecodeErrorCode, type ImageDecodeErrorCode } from '@/imaging/decodeTiff';
import { createDefaultTransform } from '@/imaging/transform';
import { cancelLazyEffectiveFlush } from '@/services/adjustService';
import { clearHistory, recordFullMapHistory } from '@/services/historyService';
import { useProjectStore } from '@/state/projectStore';
import { getImageWorker, type DecodedAssetResult } from '@/workers/client';
import {
  computeEffectiveColorParallel,
  computeEffectiveHeightParallel,
  computeEffectiveOpacityParallel,
  fitAndResampleMapParallel,
} from '@/workers/pool';
import { runTask } from '@/workers/tasks';

export interface ImportSlotDraft {
  fileName: string;
  decoded: DecodedAssetResult;
  thumbDataUrl: string;
  fit: FitMode;
  transform: ImportTransform;
}

export type ImportSlotsDraft = Record<MapId, ImportSlotDraft | null>;

interface ImportDraftStoreState {
  slots: ImportSlotsDraft;
  setSlot: (mapId: MapId, draft: ImportSlotDraft | null) => void;
  updateSlot: (mapId: MapId, updater: (prev: ImportSlotDraft) => ImportSlotDraft) => void;
  swapSlots: (a: MapId, b: MapId) => void;
  clearAll: () => void;
}

export const useImportDraftStore = create<ImportDraftStoreState>((set) => ({
  slots: { color: null, height: null, opacity: null },
  setSlot: (mapId, draft) => set((s) => ({ slots: { ...s.slots, [mapId]: draft } })),
  updateSlot: (mapId, updater) =>
    set((s) => {
      const current = s.slots[mapId];
      if (!current) return s;
      return { slots: { ...s.slots, [mapId]: updater(current) } };
    }),
  swapSlots: (a, b) =>
    set((s) => ({
      slots: { ...s.slots, [a]: s.slots[b], [b]: s.slots[a] },
    })),
  clearAll: () => set({ slots: { color: null, height: null, opacity: null } }),
}));

function rgbaToDataUrl(rgba: Uint8ClampedArray, width: number, height: number): string {
  if (typeof document === 'undefined') return '';
  const canvas = document.createElement('canvas');
  canvas.width = width;
  canvas.height = height;
  const ctx = canvas.getContext('2d');
  if (!ctx) return '';
  const copy = new Uint8ClampedArray(rgba.length);
  copy.set(rgba);
  ctx.putImageData(new ImageData(copy, width, height), 0, 0);
  return canvas.toDataURL('image/png');
}

export async function decodeFileToSlot(file: File, mapId: MapId): Promise<ImportSlotDraft> {
  const buffer = await file.arrayBuffer();
  const worker = getImageWorker();

  const decoded = await runTask(
    { labelKey: 'import.taskDecoding', labelParams: { name: file.name }, cancellable: false },
    async (ctx) => {
      ctx.setProgress(0.3);
      const res = await worker.decodeImageBuffer(buffer);
      ctx.setProgress(1);
      return res;
    },
  );

  const thumbDataUrl = rgbaToDataUrl(decoded.thumbRgba, decoded.thumbWidth, decoded.thumbHeight);
  const draft: ImportSlotDraft = {
    fileName: file.name,
    decoded,
    thumbDataUrl,
    fit: 'fit',
    transform: createDefaultTransform(decoded.width, decoded.height),
  };

  useImportDraftStore.getState().setSlot(mapId, draft);
  return draft;
}

export function classifyDecodeError(err: unknown): ImageDecodeErrorCode {
  return extractImageDecodeErrorCode(err) ?? 'corruptedFile';
}

export interface ImportMismatchInfo {
  aspectMismatches: {
    mapId: MapId;
    srcAspect: number;
    canvasAspect: number;
  }[];
  resolutionMismatch: boolean;
  upscaleWarnings: {
    mapId: MapId;
    width: number;
    height: number;
  }[];
}

export function detectImportMismatches(
  slots: ImportSlotsDraft,
  canvas: CanvasSettings,
): ImportMismatchInfo {
  const canvasAspect = canvas.widthCm / canvas.heightCm;
  const aspectMismatches: ImportMismatchInfo['aspectMismatches'] = [];
  const upscaleWarnings: ImportMismatchInfo['upscaleWarnings'] = [];
  const resolutions: { w: number; h: number }[] = [];

  for (const mapId of ['color', 'height', 'opacity'] as const) {
    const slot = slots[mapId];
    if (!slot) continue;
    const effW = slot.transform.rotate90 % 2 === 0 ? slot.transform.crop.w : slot.transform.crop.h;
    const effH = slot.transform.rotate90 % 2 === 0 ? slot.transform.crop.h : slot.transform.crop.w;
    const srcAspect = effW / Math.max(1, effH);
    const deviation = Math.abs(srcAspect - canvasAspect) / canvasAspect;
    if (deviation > ASPECT_RATIO_TOLERANCE && slot.fit === 'stretch') {
      aspectMismatches.push({ mapId, srcAspect, canvasAspect });
    } else if (deviation > ASPECT_RATIO_TOLERANCE) {
      aspectMismatches.push({ mapId, srcAspect, canvasAspect });
    }
    resolutions.push({ w: slot.decoded.width, h: slot.decoded.height });
    if (slot.decoded.width < canvas.widthPx || slot.decoded.height < canvas.heightPx) {
      upscaleWarnings.push({ mapId, width: slot.decoded.width, height: slot.decoded.height });
    }
  }

  let resolutionMismatch = false;
  if (resolutions.length > 1) {
    const first = resolutions[0];
    resolutionMismatch = resolutions.some((r) => r.w !== first?.w || r.h !== first?.h);
  }

  return { aspectMismatches, resolutionMismatch, upscaleWarnings };
}

export async function applyImportToProject(
  slots: ImportSlotsDraft,
  targetCanvasOverride?: CanvasSettings,
): Promise<{ ok: true } | { ok: false; error: 'outOfMemory'; requiredMb: number }> {
  const projectStore = useProjectStore.getState();
  const project = projectStore.project;
  const targetCanvas = targetCanvasOverride ?? project.canvas;
  const { widthPx: dstW, heightPx: dstH } = targetCanvas;

  const dimensionsChanged =
    targetCanvas.widthPx !== mapRegistry.width || targetCanvas.heightPx !== mapRegistry.height;

  if (dimensionsChanged) {
    cancelLazyEffectiveFlush();
    try {
      mapRegistry.allocate(dstW, dstH, {
        color: String(project.maps.color.defaultValue),
        height: Number(project.maps.height.defaultValue),
        opacity: Number(project.maps.opacity.defaultValue),
      });
      clearHistory();
    } catch (err) {
      if (err instanceof MapMemoryError) {
        return {
          ok: false,
          error: 'outOfMemory',
          requiredMb: Math.round(err.requiredBytes / (1024 * 1024)),
        };
      }
      throw err;
    }
  }

  const defaultRgb = hexToRgb01(DEFAULT_COLOR_HEX);
  const padRgba: [number, number, number, number] = [
    Math.round(defaultRgb.r * 255),
    Math.round(defaultRgb.g * 255),
    Math.round(defaultRgb.b * 255),
    255,
  ];

  const now = new Date().toISOString();

  for (const mapId of ['color', 'height', 'opacity'] as const) {
    const slot = slots[mapId];
    if (!slot) continue;

    cancelLazyEffectiveFlush(mapId);

    const res = await runTask(
      { labelKey: 'import.taskImporting', labelParams: { map: mapId }, cancellable: false },
      async (ctx) =>
        fitAndResampleMapParallel(
          {
            mapId,
            rgba8: slot.decoded.rgba8,
            gray16: slot.decoded.gray16,
            srcWidth: slot.decoded.width,
            srcHeight: slot.decoded.height,
            dstWidth: dstW,
            dstHeight: dstH,
            fit: slot.fit,
            transform: slot.transform,
            padRgba,
            padValue: mapId === 'height' ? DEFAULT_HEIGHT_VALUE : DEFAULT_OPACITY_VALUE,
          },
          (p: number) => ctx.setProgress(p),
        ),
    );

    const prevSource = structuredClone(useProjectStore.getState().project.maps[mapId].source);
    const nextSource = {
      fileName: slot.fileName,
      format: slot.decoded.format,
      widthPx: slot.decoded.width,
      heightPx: slot.decoded.height,
      bitDepth: slot.decoded.bitDepth,
      fit: slot.fit,
      transform: slot.transform,
      importedAt: now,
    };

    const currentAdjustments = useProjectStore.getState().project.adjustments;

    if (mapId === 'color' && res.rgba8) {
      const buf = mapRegistry.color;
      const workingBefore = !dimensionsChanged ? new Uint8ClampedArray(buf.working) : null;
      const baseBefore = !dimensionsChanged ? new Uint8ClampedArray(buf.base) : null;
      buf.replaceBase(res.rgba8);
      mapRegistry.dirtyTiles.clearMap('color');
      await computeEffectiveColorParallel(
        buf.working,
        dstW,
        dstH,
        currentAdjustments.color,
        buf.effective,
      );
      mapRegistry.emitReplaced('color');

      if (workingBefore && baseBefore) {
        recordFullMapHistory({
          mapId: 'color',
          action: 'importMap',
          workingBefore,
          workingAfter: new Uint8ClampedArray(buf.working),
          baseBefore,
          baseAfter: new Uint8ClampedArray(buf.base),
          sourceBefore: prevSource,
          sourceAfter: nextSource,
        });
      }
    } else if (mapId === 'height' && res.float32) {
      const buf = mapRegistry.heightMap;
      const workingBefore = !dimensionsChanged ? new Float32Array(buf.working) : null;
      const baseBefore = !dimensionsChanged ? new Float32Array(buf.base) : null;
      buf.replaceBase(res.float32);
      mapRegistry.dirtyTiles.clearMap('height');
      await computeEffectiveHeightParallel(
        buf.working,
        dstW,
        dstH,
        currentAdjustments.height,
        buf.effective,
      );
      mapRegistry.emitReplaced('height');

      if (workingBefore && baseBefore) {
        recordFullMapHistory({
          mapId: 'height',
          action: 'importMap',
          workingBefore,
          workingAfter: new Float32Array(buf.working),
          baseBefore,
          baseAfter: new Float32Array(buf.base),
          sourceBefore: prevSource,
          sourceAfter: nextSource,
        });
      }
    } else if (mapId === 'opacity' && res.float32) {
      const buf = mapRegistry.opacity;
      const workingBefore = !dimensionsChanged ? new Float32Array(buf.working) : null;
      const baseBefore = !dimensionsChanged ? new Float32Array(buf.base) : null;
      buf.replaceBase(res.float32);
      mapRegistry.dirtyTiles.clearMap('opacity');
      await computeEffectiveOpacityParallel(
        buf.working,
        dstW,
        dstH,
        currentAdjustments.opacity,
        buf.effective,
      );
      mapRegistry.emitReplaced('opacity');

      if (workingBefore && baseBefore) {
        recordFullMapHistory({
          mapId: 'opacity',
          action: 'importMap',
          workingBefore,
          workingAfter: new Float32Array(buf.working),
          baseBefore,
          baseAfter: new Float32Array(buf.base),
          sourceBefore: prevSource,
          sourceAfter: nextSource,
        });
      }
    }

    projectStore.updateProject((draft) => {
      draft.canvas = { ...targetCanvas };
      draft.maps[mapId].source = nextSource;
    });
  }

  return { ok: true };
}

export function buildCanvasForSlotResolution(
  currentCanvas: CanvasSettings,
  slot: ImportSlotDraft,
): CanvasSettings {
  const heightPx = computeHeightFromWidthPx(
    slot.decoded.width,
    currentCanvas.widthCm,
    currentCanvas.heightCm,
  );
  return {
    ...currentCanvas,
    widthPx: slot.decoded.width,
    heightPx,
  };
}

export function buildCanvasForSlotAspect(
  currentCanvas: CanvasSettings,
  slot: ImportSlotDraft,
): CanvasSettings {
  const effW = slot.transform.rotate90 % 2 === 0 ? slot.transform.crop.w : slot.transform.crop.h;
  const effH = slot.transform.rotate90 % 2 === 0 ? slot.transform.crop.h : slot.transform.crop.w;
  const nextHeightCm = Number(((currentCanvas.widthCm * effH) / Math.max(1, effW)).toFixed(2));
  const nextHeightPx = computeHeightFromWidthPx(
    currentCanvas.widthPx,
    currentCanvas.widthCm,
    nextHeightCm,
  );
  return {
    ...currentCanvas,
    heightCm: nextHeightCm,
    heightPx: nextHeightPx,
  };
}
