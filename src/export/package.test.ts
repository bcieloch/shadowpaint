import { decode } from 'fast-png';
import { unzipSync } from 'fflate';
import { describe, expect, it } from 'vitest';
import boldFontDataUrl from '@/assets/fonts/DejaVuSans-Bold.ttf?inline';
import regularFontDataUrl from '@/assets/fonts/DejaVuSans.ttf?inline';
import { createDefaultProject } from '@/core/constants';
import { buildExportPackageZip } from '@/export/package';
import { buildPdfLabels } from '@/export/pdf/pdfLabels';
import { createTranslator } from '@/i18n';

function extractBase64(dataUrl: string): string {
  const comma = dataUrl.indexOf(',');
  return comma >= 0 ? dataUrl.slice(comma + 1) : dataUrl;
}

function readPngIhdr(pngBytes: Uint8Array) {
  const view = new DataView(pngBytes.buffer, pngBytes.byteOffset, pngBytes.byteLength);
  return {
    signatureOk:
      pngBytes[0] === 0x89 && pngBytes[1] === 0x50 && pngBytes[2] === 0x4e && pngBytes[3] === 0x47,
    width: view.getUint32(16, false),
    height: view.getUint32(20, false),
    bitDepth: pngBytes[24],
    colorType: pngBytes[25],
  };
}

function loadTestFonts() {
  return {
    regularBase64: extractBase64(regularFontDataUrl),
    boldBase64: extractBase64(boldFontDataUrl),
  };
}

describe('buildExportPackageZip', () => {
  it('bundles valid PNGs, project_settings.json, 5-page PDF, and optional 3D previews', () => {
    const W = 16;
    const H = 20;
    const project = createDefaultProject({
      name: 'Gallery Export Test',
      canvas: {
        widthCm: 40,
        heightCm: 50,
        widthPx: W,
        heightPx: H,
        minThicknessMm: 0,
        maxThicknessMm: 4,
      },
      now: '2026-11-20T12:00:00.000Z',
    });

    const colorEffective = new Uint8Array(W * H * 4);
    const heightEffective = new Float32Array(W * H);
    const opacityEffective = new Float32Array(W * H);
    for (let i = 0; i < W * H; i++) {
      colorEffective[i * 4] = 200;
      colorEffective[i * 4 + 1] = 100;
      colorEffective[i * 4 + 2] = 50;
      colorEffective[i * 4 + 3] = 255;
      heightEffective[i] = i === 0 ? 0.5 : 0.25;
      opacityEffective[i] = i === 0 ? 0.8 : 1;
    }

    const previewRgb = new Uint8Array(16 * 20 * 3).fill(180);
    const zipBytes = buildExportPackageZip({
      project,
      colorEffective,
      heightEffective,
      opacityEffective,
      previews: {
        front: { mode: 'front', width: 16, height: 20, rgb: previewRgb },
        back: { mode: 'back', width: 16, height: 20, rgb: previewRgb },
        combined: { mode: 'combined', width: 16, height: 20, rgb: previewRgb },
      },
      fonts: loadTestFonts(),
      pdfLabels: buildPdfLabels(createTranslator('en')),
      exportedAt: '2026-11-20T12:00:00.000Z',
    });

    const files = unzipSync(zipBytes);
    expect(Object.keys(files).sort()).toEqual([
      'color_map.png',
      'documentation.pdf',
      'height_map.png',
      'opacity_map.png',
      'previews/preview_back.png',
      'previews/preview_combined.png',
      'previews/preview_front.png',
      'project_settings.json',
    ]);

    const colorIhdr = readPngIhdr(files['color_map.png'] as Uint8Array);
    expect(colorIhdr).toEqual({
      signatureOk: true,
      width: W,
      height: H,
      bitDepth: 8,
      colorType: 2,
    });

    const heightIhdr = readPngIhdr(files['height_map.png'] as Uint8Array);
    expect(heightIhdr).toEqual({
      signatureOk: true,
      width: W,
      height: H,
      bitDepth: 8,
      colorType: 0,
    });
    const decodedHeight = decode(files['height_map.png'] as Uint8Array);
    expect(decodedHeight.data[0]).toBe(Math.round(0.5 * 255));
    expect(decodedHeight.data[1]).toBe(Math.round(0.25 * 255));

    const opacityIhdr = readPngIhdr(files['opacity_map.png'] as Uint8Array);
    expect(opacityIhdr).toEqual({
      signatureOk: true,
      width: W,
      height: H,
      bitDepth: 8,
      colorType: 0,
    });
    const decodedOpacity = decode(files['opacity_map.png'] as Uint8Array);
    expect(decodedOpacity.data[0]).toBe(Math.round(0.8 * 255));

    const settingsText = new TextDecoder('utf-8').decode(
      files['project_settings.json'] as Uint8Array,
    );
    const settings = JSON.parse(settingsText);
    expect(settings.format).toBe('shadowpaint-settings');
    expect(settings.maps['height_map.png'].colorType).toBe(0);

    const pdfLatin1 = new TextDecoder('latin1').decode(files['documentation.pdf'] as Uint8Array);
    expect(pdfLatin1.startsWith('%PDF-')).toBe(true);
    expect((pdfLatin1.match(/\/Type\s*\/Page\b/g) ?? []).length).toBe(5);
  });
});
