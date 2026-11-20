import { zipSync, type Zippable } from 'fflate';
import type { LightingMode, ProjectSettings } from '@/core/types';
import type { PdfFontData } from '@/export/pdf/fontLoader';
import { buildDocumentationPdf, type PdfLabels, type PdfPreviewInput } from '@/export/pdf/pdfDoc';
import { encodeColorPng, encodeGrayscaleMapPng, encodeRgbBytesPng } from '@/export/png';
import {
  buildExportSettingsJson,
  computeProjectMapStats,
  serializeSettingsJson,
} from '@/export/settingsJson';

export interface ExportPackageInput {
  project: ProjectSettings;
  colorEffective: Uint8Array;
  heightEffective: Float32Array;
  opacityEffective: Float32Array;
  previews?: Partial<Record<LightingMode, PdfPreviewInput>>;
  fonts: PdfFontData;
  pdfLabels: PdfLabels;
  exportedAt?: string;
  onProgress?: (progress01: number) => void;
}

export function buildExportPackageZip(input: ExportPackageInput): Uint8Array {
  const {
    project,
    colorEffective,
    heightEffective,
    opacityEffective,
    previews,
    fonts,
    pdfLabels,
    onProgress,
  } = input;
  const exportedAt = input.exportedAt ?? new Date().toISOString();
  const { widthPx, heightPx } = project.canvas;

  onProgress?.(0.05);
  const colorPng = encodeColorPng(colorEffective, widthPx, heightPx, project.export.colorPngAlpha);
  onProgress?.(0.2);

  const heightPng = encodeGrayscaleMapPng(heightEffective, widthPx, heightPx);
  onProgress?.(0.32);

  const opacityPng = encodeGrayscaleMapPng(opacityEffective, widthPx, heightPx);
  onProgress?.(0.45);

  const settingsDoc = buildExportSettingsJson({
    project,
    heightEffective,
    opacityEffective,
    exportedAt,
  });
  const settingsJsonBytes = serializeSettingsJson(settingsDoc);
  onProgress?.(0.5);

  const pdfBytes = buildDocumentationPdf({
    project,
    stats: settingsDoc.stats,
    colorEffective,
    heightEffective,
    opacityEffective,
    previews,
    fonts,
    labels: pdfLabels,
    exportedAt,
    onProgress: (pdfProg) => {
      onProgress?.(0.5 + pdfProg * 0.35);
    },
  });

  const entries: Zippable = {
    'color_map.png': [colorPng, { level: 6 }],
    'height_map.png': [heightPng, { level: 6 }],
    'opacity_map.png': [opacityPng, { level: 6 }],
    'project_settings.json': [settingsJsonBytes, { level: 6 }],
    'documentation.pdf': [pdfBytes, { level: 6 }],
  };

  if (project.export.includePreviews && previews) {
    for (const mode of ['front', 'back', 'combined'] as const) {
      const p = previews[mode];
      if (p && p.rgb.length >= p.width * p.height * 3) {
        entries[`previews/preview_${mode}.png`] = [
          encodeRgbBytesPng(p.rgb, p.width, p.height),
          { level: 6 },
        ];
      }
    }
  }

  onProgress?.(0.92);
  const archive = zipSync(entries, { level: 6 });
  onProgress?.(1);
  return archive;
}

export type SingleExportKind =
  | 'colorPng'
  | 'heightPng'
  | 'opacityPng'
  | 'settingsJson'
  | 'documentationPdf'
  | 'previewFrontPng'
  | 'previewBackPng'
  | 'previewCombinedPng';

export interface SingleExportInput {
  kind: SingleExportKind;
  project: ProjectSettings;
  colorEffective?: Uint8Array;
  heightEffective?: Float32Array;
  opacityEffective?: Float32Array;
  previews?: Partial<Record<LightingMode, PdfPreviewInput>>;
  fonts?: PdfFontData;
  pdfLabels?: PdfLabels;
  exportedAt?: string;
  onProgress?: (progress01: number) => void;
}

export function encodeSingleExportArtifact(input: SingleExportInput): {
  bytes: Uint8Array;
  mimeType: string;
  filename: string;
} {
  const { project, kind, onProgress } = input;
  const { widthPx, heightPx } = project.canvas;
  const exportedAt = input.exportedAt ?? new Date().toISOString();
  onProgress?.(0.15);

  if (kind === 'colorPng') {
    if (!input.colorEffective) throw new Error('Missing color map data');
    const bytes = encodeColorPng(
      input.colorEffective,
      widthPx,
      heightPx,
      project.export.colorPngAlpha,
    );
    onProgress?.(1);
    return { bytes, mimeType: 'image/png', filename: 'color_map.png' };
  }

  if (kind === 'heightPng') {
    if (!input.heightEffective) throw new Error('Missing height map data');
    const bytes = encodeGrayscaleMapPng(input.heightEffective, widthPx, heightPx);
    onProgress?.(1);
    return { bytes, mimeType: 'image/png', filename: 'height_map.png' };
  }

  if (kind === 'opacityPng') {
    if (!input.opacityEffective) throw new Error('Missing opacity map data');
    const bytes = encodeGrayscaleMapPng(input.opacityEffective, widthPx, heightPx);
    onProgress?.(1);
    return { bytes, mimeType: 'image/png', filename: 'opacity_map.png' };
  }

  if (kind === 'settingsJson') {
    if (!input.heightEffective || !input.opacityEffective) {
      throw new Error('Missing height or opacity map data');
    }
    const doc = buildExportSettingsJson({
      project,
      heightEffective: input.heightEffective,
      opacityEffective: input.opacityEffective,
      exportedAt,
    });
    const bytes = serializeSettingsJson(doc);
    onProgress?.(1);
    return { bytes, mimeType: 'application/json', filename: 'project_settings.json' };
  }

  if (kind === 'documentationPdf') {
    if (
      !input.colorEffective ||
      !input.heightEffective ||
      !input.opacityEffective ||
      !input.fonts ||
      !input.pdfLabels
    ) {
      throw new Error('Missing data or fonts for PDF generation');
    }
    const stats = computeProjectMapStats(
      input.heightEffective,
      input.opacityEffective,
      project.canvas.minThicknessMm,
      project.canvas.maxThicknessMm,
    );
    const bytes = buildDocumentationPdf({
      project,
      stats,
      colorEffective: input.colorEffective,
      heightEffective: input.heightEffective,
      opacityEffective: input.opacityEffective,
      previews: input.previews,
      fonts: input.fonts,
      labels: input.pdfLabels,
      exportedAt,
      onProgress,
    });
    return { bytes, mimeType: 'application/pdf', filename: 'documentation.pdf' };
  }

  const modeMap: Record<
    'previewFrontPng' | 'previewBackPng' | 'previewCombinedPng',
    { mode: LightingMode; filename: string }
  > = {
    previewFrontPng: { mode: 'front', filename: 'preview_front.png' },
    previewBackPng: { mode: 'back', filename: 'preview_back.png' },
    previewCombinedPng: { mode: 'combined', filename: 'preview_combined.png' },
  };
  const target = modeMap[kind];
  const preview = input.previews?.[target.mode];
  if (!preview) {
    throw new Error(`Missing ${target.mode} preview image`);
  }
  const bytes = encodeRgbBytesPng(preview.rgb, preview.width, preview.height);
  onProgress?.(1);
  return { bytes, mimeType: 'image/png', filename: target.filename };
}
