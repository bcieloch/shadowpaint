import { unzlibSync } from 'fflate';
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

function makeSampleProject(widthPx = 32, heightPx = 44, widthCm = 50, heightCm = 70) {
  const project = createDefaultProject({
    name: 'Zażółć gęślą jaźń — Relief #1',
    canvas: {
      widthCm,
      heightCm,
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

function extractInflatedPdfStreams(pdfBytes: Uint8Array): string[] {
  const latin1 = new TextDecoder('latin1').decode(pdfBytes);
  const streams: string[] = [];
  let cursor = 0;
  while (cursor < latin1.length) {
    const startToken = latin1.indexOf('stream', cursor);
    if (startToken === -1) break;
    // Skip dictionary keys like /Length or object names containing "stream"
    const prevChar = startToken > 0 ? latin1[startToken - 1] : '\n';
    if (prevChar !== '\n' && prevChar !== '\r' && prevChar !== '>' && prevChar !== ' ') {
      cursor = startToken + 6;
      continue;
    }
    let dataStart = startToken + 6;
    if (latin1[dataStart] === '\r' && latin1[dataStart + 1] === '\n') {
      dataStart += 2;
    } else if (latin1[dataStart] === '\n' || latin1[dataStart] === '\r') {
      dataStart += 1;
    } else {
      cursor = startToken + 6;
      continue;
    }
    const endToken = latin1.indexOf('endstream', dataStart);
    if (endToken === -1) break;
    let dataEnd = endToken;
    while (dataEnd > dataStart && (latin1[dataEnd - 1] === '\n' || latin1[dataEnd - 1] === '\r')) {
      dataEnd -= 1;
    }
    const rawSlice = pdfBytes.slice(dataStart, dataEnd);
    try {
      const inflated = unzlibSync(rawSlice);
      streams.push(new TextDecoder('latin1').decode(inflated));
    } catch {
      streams.push(latin1.slice(dataStart, dataEnd));
    }
    cursor = endToken + 9;
  }
  return streams;
}

describe('buildDocumentationPdf', () => {
  it('generates a 7-page extended PDF with embedded Unicode font for EN and PL', () => {
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
      expect(pageMatches.length).toBe(7);
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
    expect(pageMatches.length).toBe(7);
  });

  it('appends 1:1 printable tiled pages with exact 283.46 pt (10 cm) scale and >= 8 pt fonts', () => {
    const fonts = loadTestFonts();
    const { project, colorEffective, heightEffective, opacityEffective, previews } =
      makeSampleProject(40, 40, 10, 10);
    project.export.includeTiles1to1 = true;
    project.export.gridSheetSpacingCm = 2.5;
    const stats = computeProjectMapStats(heightEffective, opacityEffective, 0, 5);

    const pdfBytes = buildDocumentationPdf({
      project,
      stats,
      colorEffective,
      heightEffective,
      opacityEffective,
      previews,
      fonts,
      labels: buildPdfLabels(createTranslator('en')),
      exportedAt: '2026-11-20T12:00:00.000Z',
    });

    const latin1 = new TextDecoder('latin1').decode(pdfBytes);
    const pageMatches = latin1.match(/\/Type\s*\/Page\b/g) ?? [];
    // 7 base pages + 1 tile page (10x10 cm fits on a single A4 Landscape sheet)
    expect(pageMatches.length).toBe(8);

    const streams = extractInflatedPdfStreams(pdfBytes);
    const pageStreams = streams.filter((s) => s.includes(' Tf'));
    expect(pageStreams.length).toBe(8);

    // 1. Audit minimum font size >= 8 pt on every PDF page
    const fontSizes: number[] = [];
    for (const stream of pageStreams) {
      const matches = stream.matchAll(/\/F\d+\s+([\d.]+)\s+Tf/g);
      for (const m of matches) {
        fontSizes.push(Number(m[1]));
      }
    }
    expect(fontSizes.length).toBeGreaterThan(20);
    expect(Math.min(...fontSizes)).toBeGreaterThanOrEqual(8);

    // 2. Verify exact 1:1 scale (10 cm = 283.4646 pt ± 0.5 pt) on the tile page stream
    const tileStream = pageStreams[pageStreams.length - 1] ?? '';

    // Check embedded 10x10 cm tile image transform matrix: `a 0 0 d e f cm` before `/I... Do`
    const imgCmMatches = [...tileStream.matchAll(/([\d.]+)\s+0\s+0\s+([\d.]+)\s+[\d.-]+\s+[\d.-]+\s+cm\s+\/I\d+\s+Do/g)];
    expect(imgCmMatches.length).toBeGreaterThan(0);
    const lastImgCm = imgCmMatches[imgCmMatches.length - 1];
    const tileWidthPt = Number(lastImgCm?.[1]);
    const tileHeightPt = Number(lastImgCm?.[2]);
    expect(Math.abs(tileWidthPt - 283.46)).toBeLessThanOrEqual(0.5);
    expect(Math.abs(tileHeightPt - 283.46)).toBeLessThanOrEqual(0.5);

    // Check 10 cm calibration control ruler horizontal vector line: `x1 y m x2 y l S`
    const hLineMatches = [...tileStream.matchAll(/([\d.]+)\s+([\d.]+)\s+m\s+([\d.]+)\s+([\d.]+)\s+l/g)];
    const has10CmRuler = hLineMatches.some((m) => {
      const x1 = Number(m[1]);
      const y1 = Number(m[2]);
      const x2 = Number(m[3]);
      const y2 = Number(m[4]);
      return Math.abs(y1 - y2) < 0.1 && Math.abs(Math.abs(x2 - x1) - 283.46) <= 0.5;
    });
    expect(has10CmRuler).toBe(true);
  });

  it('tiles large 50x70 cm canvas into multiple 1:1 pages when includeTiles1to1 is enabled', () => {
    const fonts = loadTestFonts();
    const { project, colorEffective, heightEffective, opacityEffective } = makeSampleProject(
      32,
      44,
      50,
      70,
    );
    project.export.includeTiles1to1 = true;
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
    const pageMatches = latin1.match(/\/Type\s*\/Page\b/g) ?? [];
    expect(pageMatches.length).toBeGreaterThan(7);
  });
});
