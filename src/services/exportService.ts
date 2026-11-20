import { proxy, transfer } from 'comlink';
import { toast } from 'sonner';
import { mapRegistry } from '@/core/maps/MapRegistry';
import type { LightingMode } from '@/core/types';
import type { RenderedPreviewImage } from '@/engine3d/offscreen/renderPreview';
import type { SingleExportKind } from '@/export/package';
import { loadPdfFontData } from '@/export/pdf/fontLoader';
import type { PdfPreviewInput } from '@/export/pdf/pdfDoc';
import { buildPdfLabels } from '@/export/pdf/pdfLabels';
import { createTranslator } from '@/i18n';
import { useLocaleStore } from '@/i18n/localeStore';
import { buildExportZipFilename, triggerDownload } from '@/lib/download';
import { useProjectStore } from '@/state/projectStore';
import { getIoWorker } from '@/workers/client';
import { runTask, TaskCancelledError } from '@/workers/tasks';

export type PreviewRendererFn = (
  mode: LightingMode,
  longestSide: number,
) => RenderedPreviewImage | null;

let registeredPreviewRenderer: PreviewRendererFn | null = null;

export function setExportPreviewRenderer(fn: PreviewRendererFn | null): void {
  registeredPreviewRenderer = fn;
}

function getTranslator() {
  return createTranslator(useLocaleStore.getState().locale);
}

function renderRequestedPreviews(
  modes: readonly LightingMode[],
  longestSide: number,
): Partial<Record<LightingMode, PdfPreviewInput>> {
  const result: Partial<Record<LightingMode, PdfPreviewInput>> = {};
  if (!registeredPreviewRenderer) return result;
  for (const mode of modes) {
    const rendered = registeredPreviewRenderer(mode, longestSide);
    if (rendered && rendered.rgb.length > 0) {
      result[mode] = rendered;
    }
  }
  return result;
}

function collectTransferBuffers(
  arrays: ReadonlyArray<Uint8Array | Float32Array | undefined>,
  previews?: Partial<Record<LightingMode, PdfPreviewInput>>,
): ArrayBuffer[] {
  const seen = new Set<ArrayBuffer>();
  const buffers: ArrayBuffer[] = [];
  for (const arr of arrays) {
    if (arr && !seen.has(arr.buffer as ArrayBuffer)) {
      seen.add(arr.buffer as ArrayBuffer);
      buffers.push(arr.buffer as ArrayBuffer);
    }
  }
  if (previews) {
    for (const preview of Object.values(previews)) {
      if (preview && !seen.has(preview.rgb.buffer as ArrayBuffer)) {
        seen.add(preview.rgb.buffer as ArrayBuffer);
        buffers.push(preview.rgb.buffer as ArrayBuffer);
      }
    }
  }
  return buffers;
}

export async function exportPackage(): Promise<void> {
  const t = getTranslator();
  if (!mapRegistry.isAllocated) {
    toast.error(t('export.errorNoProject'));
    return;
  }

  const project = structuredClone(useProjectStore.getState().project);
  const exportedAt = new Date().toISOString();
  const filename = buildExportZipFilename(project.name, new Date(exportedAt));

  try {
    await runTask(
      {
        labelKey: 'export.taskPackage',
        cancellable: true,
      },
      async (ctx) => {
        ctx.throwIfAborted();
        ctx.setProgress(0.05);

        const previews = renderRequestedPreviews(
          ['front', 'back', 'combined'],
          project.export.previewLongestSide,
        );
        ctx.throwIfAborted();
        ctx.setProgress(0.15);

        const fonts = await loadPdfFontData();
        ctx.throwIfAborted();

        const colorCopy = new Uint8Array(mapRegistry.color.effective);
        const heightCopy = new Float32Array(mapRegistry.heightMap.effective);
        const opacityCopy = new Float32Array(mapRegistry.opacity.effective);

        const transferables = collectTransferBuffers(
          [colorCopy, heightCopy, opacityCopy],
          previews,
        );

        const worker = getIoWorker();
        const zipBytes = await worker.exportPackage(
          transfer(
            {
              project,
              colorEffective: colorCopy,
              heightEffective: heightCopy,
              opacityEffective: opacityCopy,
              previews,
              fonts,
              pdfLabels: buildPdfLabels(t),
              exportedAt,
            },
            transferables,
          ),
          proxy((workerProgress: number) => {
            ctx.setProgress(0.2 + workerProgress * 0.8);
          }),
        );

        ctx.throwIfAborted();
        triggerDownload(zipBytes, 'application/zip', filename);
        toast.success(t('export.successPackage', { file: filename }));
      },
    );
  } catch (err) {
    if (err instanceof TaskCancelledError) return;
    const message = err instanceof Error ? err.message : String(err);
    toast.error(t('export.errorFailed', { message }));
  }
}

export async function exportSingleFile(kind: SingleExportKind): Promise<void> {
  const t = getTranslator();
  if (!mapRegistry.isAllocated) {
    toast.error(t('export.errorNoProject'));
    return;
  }

  const fileLabelMap: Record<SingleExportKind, string> = {
    colorPng: 'color_map.png',
    heightPng: 'height_map.png',
    opacityPng: 'opacity_map.png',
    settingsJson: 'project_settings.json',
    documentationPdf: 'documentation.pdf',
    previewFrontPng: 'preview_front.png',
    previewBackPng: 'preview_back.png',
    previewCombinedPng: 'preview_combined.png',
  };

  const project = structuredClone(useProjectStore.getState().project);
  const exportedAt = new Date().toISOString();

  try {
    await runTask(
      {
        labelKey: 'export.taskFile',
        labelParams: { file: fileLabelMap[kind] },
        cancellable: true,
      },
      async (ctx) => {
        ctx.throwIfAborted();
        ctx.setProgress(0.08);

        let previews: Partial<Record<LightingMode, PdfPreviewInput>> | undefined;
        if (kind === 'documentationPdf') {
          previews = renderRequestedPreviews(
            ['front', 'back', 'combined'],
            project.export.previewLongestSide,
          );
        } else if (kind === 'previewFrontPng') {
          previews = renderRequestedPreviews(['front'], project.export.previewLongestSide);
          if (!previews.front) throw new Error(t('export.errorPreviewUnavailable'));
        } else if (kind === 'previewBackPng') {
          previews = renderRequestedPreviews(['back'], project.export.previewLongestSide);
          if (!previews.back) throw new Error(t('export.errorPreviewUnavailable'));
        } else if (kind === 'previewCombinedPng') {
          previews = renderRequestedPreviews(['combined'], project.export.previewLongestSide);
          if (!previews.combined) throw new Error(t('export.errorPreviewUnavailable'));
        }
        ctx.throwIfAborted();

        const colorCopy =
          kind === 'colorPng' || kind === 'documentationPdf'
            ? new Uint8Array(mapRegistry.color.effective)
            : undefined;
        const heightCopy =
          kind === 'heightPng' || kind === 'settingsJson' || kind === 'documentationPdf'
            ? new Float32Array(mapRegistry.heightMap.effective)
            : undefined;
        const opacityCopy =
          kind === 'opacityPng' || kind === 'settingsJson' || kind === 'documentationPdf'
            ? new Float32Array(mapRegistry.opacity.effective)
            : undefined;

        const fonts = kind === 'documentationPdf' ? await loadPdfFontData() : undefined;
        ctx.throwIfAborted();

        const transferables = collectTransferBuffers(
          [colorCopy, heightCopy, opacityCopy],
          previews,
        );

        const worker = getIoWorker();
        const result = await worker.exportSingleFile(
          transfer(
            {
              kind,
              project,
              colorEffective: colorCopy,
              heightEffective: heightCopy,
              opacityEffective: opacityCopy,
              previews,
              fonts,
              pdfLabels: kind === 'documentationPdf' ? buildPdfLabels(t) : undefined,
              exportedAt,
            },
            transferables,
          ),
          proxy((workerProgress: number) => {
            ctx.setProgress(0.15 + workerProgress * 0.85);
          }),
        );

        ctx.throwIfAborted();
        triggerDownload(result.bytes, result.mimeType, result.filename);
        toast.success(t('export.successFile', { file: result.filename }));
      },
    );
  } catch (err) {
    if (err instanceof TaskCancelledError) return;
    const message = err instanceof Error ? err.message : String(err);
    toast.error(t('export.errorFailed', { message }));
  }
}
