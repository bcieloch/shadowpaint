import { describe, expect, it } from 'vitest';
import regularFontDataUrl from '@/assets/fonts/DejaVuSans.ttf?inline';
import boldFontDataUrl from '@/assets/fonts/DejaVuSans-Bold.ttf?inline';
import { createDefaultProject } from '@/core/constants';
import { createTranslator } from '@/i18n';
import { buildDocumentationPdf } from '@/export/pdf/pdfDoc';
import { buildPdfLabels } from '@/export/pdf/pdfLabels';
import { computeProjectMapStats } from '@/export/settingsJson';

function extractBase64(dataUrl: string): string {
  const comma = dataUrl.indexOf(',');
  return comma >= 0 ? dataUrl.slice(comma + 1) : dataUrl;
}

function loadTestFonts() {
  return {
    regularBase64: extractBase64(regularFontDataUrl),
    boldBase64: extractBase64(boldFontDataUrl),
  };
}

function makeSampleProject(widthPx = 32, heightPx = 44) {
  const project = createDefaultProject({
    name: 'Zażółć gęślą jaźń — Relief #1',
    canvas: {
      widthCm: 50,
      heightCm: 70,
      widthPx,
      heightPx,
      minThicknessMm: 0,
      maxThicknessMm: 5,
    },
    now: '2026-11-20T12:00:00.000Z',
  });
  const count = widthPx * heightPx;
  const colorEffective = new Uint8Array(count * 4);
  const heightEffective = new Float32Array(count);
  const opacityEffective = new Float32Array(count);
  for (let i = 0; i < count; i++) {
    const t = i / Math.max(1, count - 1);
    colorEffective[i * 4] = Math.round(40 + t * 200);
    colorEffective[i * 4 + 1] = 120;
    colorEffective[i * 4 + 2] = 180;
    colorEffective[i * 4 + 3] = 255;
    heightEffective[i] = t;
    opacityEffective[i] = 1 - t * 0.5;
  }
  const previewRgb = new Uint8Array(20 * 28 * 3).fill(140);
  const previews = {
    front: { mode: 'front' as const, width: 20, height: 28, rgb: previewRgb },
    back: { mode: 'back' as const, width: 20, height: 28, rgb: previewRgb },
    combined: { mode: 'combined' as const, width: 20, height: 28, rgb: previewRgb },
  };
  return { project, colorEffective, heightEffective, opacityEffective, previews };
}

describe('buildDocumentationPdf', () => {
  it('generates a 5-page PDF with embedded Unicode font for EN and PL', () => {
    const fonts = loadTestFonts();
    const { project, colorEffective, heightEffective, opacityEffective, previews } =
      makeSampleProject();
    const stats = computeProjectMapStats(heightEffective, opacityEffective, 0, 5);
    const latin1Decoder = new TextDecoder('latin1');

    for (const locale of ['en', 'pl'] as const) {
      const t = createTranslator(locale);
      const pdfBytes = buildDocumentationPdf({
        project,
        stats,
        colorEffective,
        heightEffective,
        opacityEffective,
        previews,
        fonts,
        labels: buildPdfLabels(t),
        exportedAt: '2026-11-20T12:00:00.000Z',
      });

      const latin1 = latin1Decoder.decode(pdfBytes);
      expect(latin1.startsWith('%PDF-')).toBe(true);
      expect(latin1.includes('DejaVuSans')).toBe(true);
      const pageMatches = latin1.match(/\/Type\s*\/Page\b/g) ?? [];
      expect(pageMatches.length).toBe(5);
      expect(pdfBytes.byteLength).toBeGreaterThan(20_000);
    }
  });

  it('supports portrait A3 and missing previews gracefully', () => {
    const fonts = loadTestFonts();
    const { project, colorEffective, heightEffective, opacityEffective } = makeSampleProject();
    project.export.pdfPageSize = 'A3';
    project.export.pdfOrientation = 'portrait';
    const stats = computeProjectMapStats(heightEffective, opacityEffective, 0, 5);
    const pdfBytes = buildDocumentationPdf({
      project,
      stats,
      colorEffective,
      heightEffective,
      opacityEffective,
      fonts,
      labels: buildPdfLabels(createTranslator('pl')),
      exportedAt: '2026-11-20T12:00:00.000Z',
    });

    const latin1 = new TextDecoder('latin1').decode(pdfBytes);
    expect(latin1.startsWith('%PDF-')).toBe(true);
    const pageMatches = latin1.match(/\/Type\s*\/Page\b/g) ?? [];
    expect(pageMatches.length).toBe(5);
  });
});
