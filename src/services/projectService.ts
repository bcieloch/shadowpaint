import { proxy, transfer } from 'comlink';
import { createDefaultProject, type CreateDefaultProjectOptions } from '@/core/constants';
import {
  applyColorAdjustments,
  applyHeightAdjustments,
  applyOpacityAdjustments,
} from '@/core/maps/adjustments';
import { MapMemoryError, MapRegistry, mapRegistry } from '@/core/maps/MapRegistry';
import type { CanvasSettings, ProjectSettings } from '@/core/types';
import { validateCanvasSettings, type CanvasValidationError } from '@/core/units/calibration';
import {
  resampleFloatWithTransform,
  resampleMaskUint8,
  resampleRgbaWithTransform,
} from '@/imaging/resample';
import { createDefaultTransform } from '@/imaging/transform';
import { getMaxTextureSize } from '@/lib/webgl';
import { clearHistory, recordSettingsPatchHistory } from '@/services/historyService';
import { useEditorStore } from '@/state/editorStore';
import { useHistoryStore } from '@/state/historyStore';
import { useProjectStore } from '@/state/projectStore';
import { getImageWorker } from '@/workers/client';
import type { ResizeProjectMapsResult } from '@/workers/image.worker';
import { runTask } from '@/workers/tasks';
import '@/state/mapsVersion';

export type ProjectCreateResult =
  { ok: true; project: ProjectSettings } | { ok: false; error: 'outOfMemory'; requiredMb: number };

export type ResizeProjectResult =
  | { ok: true; resampled: boolean }
  | { ok: false; error: 'validation'; validationErrors: CanvasValidationError[] }
  | { ok: false; error: 'outOfMemory'; requiredMb: number };

export function createAndActivateProject(
  options: CreateDefaultProjectOptions = {},
): ProjectCreateResult {
  const settings = createDefaultProject(options);
  try {
    mapRegistry.allocate(settings.canvas.widthPx, settings.canvas.heightPx, {
      color: String(settings.maps.color.defaultValue),
      height: Number(settings.maps.height.defaultValue),
      opacity: Number(settings.maps.opacity.defaultValue),
    });
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

  useHistoryStore.getState().clearAll();
  useProjectStore.getState().setProject(settings, false);
  const editor = useEditorStore.getState();
  editor.setHasSelection(mapRegistry.hasSelection);
  editor.setRulerLine(null);
  editor.setCrossSectionLine(null);
  return { ok: true, project: settings };
}

export function ensureInitialProjectAllocated(): ProjectCreateResult {
  if (mapRegistry.isAllocated) {
    return { ok: true, project: useProjectStore.getState().project };
  }
  const current = useProjectStore.getState().project;
  return createAndActivateProject({
    id: current.id,
    name: current.name,
    canvas: current.canvas,
    now: current.createdAt,
  });
}

export function updateCanvasWithoutResample(
  nextCanvas: CanvasSettings,
  maxTextureSize = typeof document !== 'undefined' ? getMaxTextureSize() : undefined,
): ResizeProjectResult {
  const validationErrors = validateCanvasSettings(nextCanvas, maxTextureSize);
  if (validationErrors.length > 0) {
    return { ok: false, error: 'validation', validationErrors };
  }

  const projectStore = useProjectStore.getState();
  const before = structuredClone(projectStore.project.canvas);
  const after: CanvasSettings = { ...nextCanvas };

  if (JSON.stringify(before) === JSON.stringify(after)) {
    return { ok: true, resampled: false };
  }

  projectStore.updateProject((draft) => {
    draft.canvas = { ...after };
  }, true);

  recordSettingsPatchHistory('settingsChange', {
    path: 'canvas',
    before,
    after,
  });

  return { ok: true, resampled: false };
}

function resizeMapsSynchronously(params: {
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
  selection: Uint8Array;
  adjustments: ProjectSettings['adjustments'];
}): ResizeProjectMapsResult {
  const transform = createDefaultTransform(params.srcWidth, params.srcHeight);

  const colorBase = resampleRgbaWithTransform({
    src: params.colorBase,
    srcWidth: params.srcWidth,
    srcHeight: params.srcHeight,
    dstWidth: params.dstWidth,
    dstHeight: params.dstHeight,
    fit: 'stretch',
    transform,
  });
  const colorWorking = resampleRgbaWithTransform({
    src: params.colorWorking,
    srcWidth: params.srcWidth,
    srcHeight: params.srcHeight,
    dstWidth: params.dstWidth,
    dstHeight: params.dstHeight,
    fit: 'stretch',
    transform,
  });
  const heightBase = resampleFloatWithTransform({
    src: params.heightBase,
    srcWidth: params.srcWidth,
    srcHeight: params.srcHeight,
    dstWidth: params.dstWidth,
    dstHeight: params.dstHeight,
    fit: 'stretch',
    transform,
  });
  const heightWorking = resampleFloatWithTransform({
    src: params.heightWorking,
    srcWidth: params.srcWidth,
    srcHeight: params.srcHeight,
    dstWidth: params.dstWidth,
    dstHeight: params.dstHeight,
    fit: 'stretch',
    transform,
  });
  const opacityBase = resampleFloatWithTransform({
    src: params.opacityBase,
    srcWidth: params.srcWidth,
    srcHeight: params.srcHeight,
    dstWidth: params.dstWidth,
    dstHeight: params.dstHeight,
    fit: 'stretch',
    transform,
  });
  const opacityWorking = resampleFloatWithTransform({
    src: params.opacityWorking,
    srcWidth: params.srcWidth,
    srcHeight: params.srcHeight,
    dstWidth: params.dstWidth,
    dstHeight: params.dstHeight,
    fit: 'stretch',
    transform,
  });
  const selection = resampleMaskUint8(
    params.selection,
    params.srcWidth,
    params.srcHeight,
    params.dstWidth,
    params.dstHeight,
  );

  const colorEffective = new Uint8ClampedArray(colorWorking.length);
  const heightEffective = new Float32Array(heightWorking.length);
  const opacityEffective = new Float32Array(opacityWorking.length);

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

export async function resizeProject(
  nextCanvas: CanvasSettings,
  maxTextureSize = typeof document !== 'undefined' ? getMaxTextureSize() : undefined,
): Promise<ResizeProjectResult> {
  const validationErrors = validateCanvasSettings(nextCanvas, maxTextureSize);
  if (validationErrors.length > 0) {
    return { ok: false, error: 'validation', validationErrors };
  }

  if (
    !mapRegistry.isAllocated ||
    (nextCanvas.widthPx === mapRegistry.width && nextCanvas.heightPx === mapRegistry.height)
  ) {
    return updateCanvasWithoutResample(nextCanvas, maxTextureSize);
  }

  const projectStore = useProjectStore.getState();
  const adjustments = structuredClone(projectStore.project.adjustments);
  const srcWidth = mapRegistry.width;
  const srcHeight = mapRegistry.height;
  const dstWidth = nextCanvas.widthPx;
  const dstHeight = nextCanvas.heightPx;

  let colorBaseCopy: Uint8ClampedArray;
  let colorWorkingCopy: Uint8ClampedArray;
  let heightBaseCopy: Float32Array;
  let heightWorkingCopy: Float32Array;
  let opacityBaseCopy: Float32Array;
  let opacityWorkingCopy: Float32Array;
  let selectionCopy: Uint8Array;

  try {
    colorBaseCopy = new Uint8ClampedArray(mapRegistry.color.base);
    colorWorkingCopy = new Uint8ClampedArray(mapRegistry.color.working);
    heightBaseCopy = new Float32Array(mapRegistry.heightMap.base);
    heightWorkingCopy = new Float32Array(mapRegistry.heightMap.working);
    opacityBaseCopy = new Float32Array(mapRegistry.opacity.base);
    opacityWorkingCopy = new Float32Array(mapRegistry.opacity.working);
    selectionCopy = new Uint8Array(mapRegistry.selection);
  } catch (err) {
    if (err instanceof RangeError) {
      return {
        ok: false,
        error: 'outOfMemory',
        requiredMb: Math.round(MapRegistry.estimateBytes(dstWidth, dstHeight) / (1024 * 1024)),
      };
    }
    throw err;
  }

  let resized: ResizeProjectMapsResult;
  if (typeof Worker !== 'undefined') {
    const worker = getImageWorker();
    resized = await runTask(
      { labelKey: 'canvas.taskResizing', cancellable: false },
      async (ctx) => {
        return worker.resizeProjectMaps(
          transfer(
            {
              srcWidth,
              srcHeight,
              dstWidth,
              dstHeight,
              colorBase: colorBaseCopy,
              colorWorking: colorWorkingCopy,
              heightBase: heightBaseCopy,
              heightWorking: heightWorkingCopy,
              opacityBase: opacityBaseCopy,
              opacityWorking: opacityWorkingCopy,
              selection: selectionCopy,
              adjustments,
            },
            [
              colorBaseCopy.buffer,
              colorWorkingCopy.buffer,
              heightBaseCopy.buffer,
              heightWorkingCopy.buffer,
              opacityBaseCopy.buffer,
              opacityWorkingCopy.buffer,
              selectionCopy.buffer,
            ],
          ),
          proxy((p: number) => ctx.setProgress(p)),
        );
      },
    );
  } else {
    resized = resizeMapsSynchronously({
      srcWidth,
      srcHeight,
      dstWidth,
      dstHeight,
      colorBase: colorBaseCopy,
      colorWorking: colorWorkingCopy,
      heightBase: heightBaseCopy,
      heightWorking: heightWorkingCopy,
      opacityBase: opacityBaseCopy,
      opacityWorking: opacityWorkingCopy,
      selection: selectionCopy,
      adjustments,
    });
  }

  try {
    mapRegistry.replaceAll({
      width: dstWidth,
      height: dstHeight,
      ...resized,
    });
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

  clearHistory();
  projectStore.updateProject((draft) => {
    draft.canvas = { ...nextCanvas };
  }, true);
  useEditorStore.getState().setHasSelection(mapRegistry.hasSelection);

  return { ok: true, resampled: true };
}
