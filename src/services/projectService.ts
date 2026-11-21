import { createDefaultProject, type CreateDefaultProjectOptions } from '@/core/constants';
import { MapMemoryError, MapRegistry, mapRegistry } from '@/core/maps/MapRegistry';
import type { CanvasSettings, ProjectSettings } from '@/core/types';
import { validateCanvasSettings, type CanvasValidationError } from '@/core/units/calibration';
import { selectDefaultQualityForGpu } from '@/core/units/gpuQuality';
import { getMaxTextureSize, probeGpuCapabilities } from '@/lib/webgl';
import { clearActiveFileHandle } from '@/persistence/fileAccess';
import { cancelLazyEffectiveFlush } from '@/services/adjustService';
import { clearHistory, recordSettingsPatchHistory } from '@/services/historyService';
import { useEditorStore } from '@/state/editorStore';
import { useHistoryStore } from '@/state/historyStore';
import { useProjectStore } from '@/state/projectStore';
import { resizeProjectMapsParallel } from '@/workers/pool';
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
  cancelLazyEffectiveFlush();
  const settings = createDefaultProject(options);
  const caps = probeGpuCapabilities();
  if (caps.webgl2) {
    const quality = selectDefaultQualityForGpu(caps);
    settings.view3d.meshDetail = quality.meshDetail;
    settings.lighting.front.shadowMapSize = quality.shadowMapSize;
  }
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

  clearActiveFileHandle();
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

  cancelLazyEffectiveFlush();

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
    colorWorkingCopy = new Uint8ClampedArray(mapRegistry.color.getCompositeBuffer());
    heightBaseCopy = new Float32Array(mapRegistry.heightMap.base);
    heightWorkingCopy = new Float32Array(mapRegistry.heightMap.getCompositeBuffer());
    opacityBaseCopy = new Float32Array(mapRegistry.opacity.base);
    opacityWorkingCopy = new Float32Array(mapRegistry.opacity.getCompositeBuffer());
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

  const resized = await runTask(
    { labelKey: 'canvas.taskResizing', cancellable: false },
    async (ctx) =>
      resizeProjectMapsParallel(
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
        (p: number) => ctx.setProgress(p),
      ),
  );

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
