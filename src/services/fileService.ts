import { proxy, transfer } from 'comlink';
import { toast } from 'sonner';
import { mapRegistry } from '@/core/maps/MapRegistry';
import { createTranslator } from '@/i18n';
import { useLocaleStore } from '@/i18n/localeStore';
import { asUint8Array } from '@/lib/bytes';
import { sanitizeExportSlug } from '@/lib/download';
import { autosaveController } from '@/persistence/autosave';
import {
  getActiveFileHandle,
  pickAndSaveReliefFile,
  setActiveFileHandle,
  writeBytesToFileHandle,
  type ReliefFileHandle,
} from '@/persistence/fileAccess';
import {
  isProjectCorruptedError,
  packReliefProject,
  unpackReliefProject,
  type UnpackedReliefProject,
} from '@/persistence/projectArchive';
import { useEditorStore } from '@/state/editorStore';
import { useHistoryStore } from '@/state/historyStore';
import { useProjectStore } from '@/state/projectStore';
import { useUiStore } from '@/state/uiStore';
import { getIoWorker } from '@/workers/client';
import { runTask } from '@/workers/tasks';

export const OPEN_PROJECT_EVENT = 'shadowpaint:open-project';

export function isReliefArchiveFileName(name: string): boolean {
  const lower = name.trim().toLowerCase();
  return lower.endsWith('.relief') || lower.endsWith('.zip');
}

export function triggerOpenProjectDialog(): void {
  if (typeof window !== 'undefined') {
    window.dispatchEvent(new CustomEvent(OPEN_PROJECT_EVENT));
  }
}

export async function buildActiveReliefBytes(
  onProgress?: (progress01: number) => void,
): Promise<{ filename: string; bytes: Uint8Array }> {
  const project = structuredClone(useProjectStore.getState().project);
  const filename = `${sanitizeExportSlug(project.name)}.relief`;

  const colorBase = new Uint8Array(asUint8Array(mapRegistry.color.base));
  const colorWorking = new Uint8Array(asUint8Array(mapRegistry.color.working));
  const colorEffective = new Uint8Array(asUint8Array(mapRegistry.color.effective));
  const heightBase = new Float32Array(mapRegistry.heightMap.base);
  const heightWorking = new Float32Array(mapRegistry.heightMap.working);
  const heightEffective = new Float32Array(mapRegistry.heightMap.effective);
  const opacityBase = new Float32Array(mapRegistry.opacity.base);
  const opacityWorking = new Float32Array(mapRegistry.opacity.working);
  const opacityEffective = new Float32Array(mapRegistry.opacity.effective);
  const selection = new Uint8Array(mapRegistry.selection);

  let bytes: Uint8Array;
  if (typeof Worker !== 'undefined') {
    const worker = getIoWorker();
    bytes = await worker.packReliefProject(
      transfer(
        {
          project,
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
      ),
      onProgress ? proxy(onProgress) : undefined,
    );
  } else {
    bytes = packReliefProject({
      project,
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
      onProgress,
    });
  }

  return { filename, bytes };
}

export async function saveProjectRelief(
  options: { saveAs?: boolean; forceDownload?: boolean } = {},
): Promise<boolean> {
  if (!mapRegistry.isAllocated) return false;
  const tr = createTranslator(useLocaleStore.getState().locale);

  try {
    const { filename, bytes } = await runTask(
      { labelKey: 'projectFile.taskSaving', cancellable: false },
      async (ctx) => buildActiveReliefBytes((p) => ctx.setProgress(p)),
    );

    const existingHandle = getActiveFileHandle();
    if (!options.saveAs && !options.forceDownload && existingHandle) {
      try {
        await writeBytesToFileHandle(existingHandle, bytes);
        useProjectStore.getState().setClean();
        toast.success(tr('projectFile.savedToast', { file: existingHandle.name || filename }));
        return true;
      } catch {
        // Permission may have been revoked; fall back to save picker / download
      }
    }

    const res = await pickAndSaveReliefFile(filename, bytes, {
      forceDownload: options.forceDownload,
    });
    if (res.status === 'cancelled') {
      return false;
    }
    if (res.status === 'saved-fs') {
      setActiveFileHandle(res.handle, res.fileName);
      useProjectStore.getState().setClean();
      toast.success(tr('projectFile.savedToast', { file: res.fileName }));
      return true;
    }

    useProjectStore.getState().setClean();
    toast.success(tr('projectFile.downloadedToast', { file: res.fileName }));
    return true;
  } catch (err) {
    const message = err instanceof Error ? err.message : String(err);
    toast.error(tr('projectFile.saveFailedError', { message }));
    return false;
  }
}

export async function requestOpenReliefFile(
  file: File,
  handle: ReliefFileHandle | null = null,
): Promise<boolean> {
  if (useProjectStore.getState().isDirty) {
    useUiStore.getState().setPendingOpenRelief({ file, handle });
    return false;
  }
  return await performOpenReliefFile(file, handle);
}

export async function confirmAndOpenPendingRelief(): Promise<boolean> {
  const pending = useUiStore.getState().pendingOpenRelief;
  useUiStore.getState().setPendingOpenRelief(null);
  if (!pending) return false;
  return await performOpenReliefFile(pending.file, pending.handle);
}

export function cancelPendingOpenRelief(): void {
  useUiStore.getState().setPendingOpenRelief(null);
}

export async function performOpenReliefFile(
  file: File,
  handle: ReliefFileHandle | null = null,
): Promise<boolean> {
  const tr = createTranslator(useLocaleStore.getState().locale);

  try {
    const rawBytes = new Uint8Array(await file.arrayBuffer());
    const unpacked: UnpackedReliefProject = await runTask(
      {
        labelKey: 'projectFile.taskOpening',
        labelParams: { file: file.name },
        cancellable: false,
      },
      async (ctx) => {
        if (typeof Worker !== 'undefined') {
          const worker = getIoWorker();
          return await worker.unpackReliefProject(
            transfer(rawBytes, [rawBytes.buffer]),
            proxy((p: number) => ctx.setProgress(p)),
          );
        }
        return unpackReliefProject(rawBytes, (p) => ctx.setProgress(p));
      },
    );

    autosaveController.runSuppressed(() => {
      mapRegistry.replaceAll({
        width: unpacked.project.canvas.widthPx,
        height: unpacked.project.canvas.heightPx,
        colorBase: unpacked.colorBase,
        colorWorking: unpacked.colorWorking,
        colorEffective: unpacked.colorEffective,
        heightBase: unpacked.heightBase,
        heightWorking: unpacked.heightWorking,
        heightEffective: unpacked.heightEffective,
        opacityBase: unpacked.opacityBase,
        opacityWorking: unpacked.opacityWorking,
        opacityEffective: unpacked.opacityEffective,
        selection: unpacked.selection,
      });
      useHistoryStore.getState().clearAll();
      useProjectStore.getState().setProject(unpacked.project, false);
      const editor = useEditorStore.getState();
      editor.setHasSelection(mapRegistry.hasSelection);
      editor.setRulerLine(null);
      editor.setCrossSectionLine(null);
    });

    setActiveFileHandle(handle, file.name);
    autosaveController.resetTracking();
    autosaveController.markAllDirty();
    void autosaveController.flushNow();

    if (unpacked.usedPngFallback) {
      toast.warning(tr('projectFile.openedFallbackToast', { file: file.name }));
    } else {
      toast.success(tr('projectFile.openedToast', { file: file.name }));
    }
    return true;
  } catch (err) {
    if (isProjectCorruptedError(err)) {
      toast.error(tr('projectFile.corruptedError', { file: file.name }));
    } else {
      const message = err instanceof Error ? err.message : String(err);
      toast.error(tr('projectFile.openFailedError', { file: file.name, message }));
    }
    return false;
  }
}
