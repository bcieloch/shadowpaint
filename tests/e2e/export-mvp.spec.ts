import fs from 'node:fs/promises';
import { expect, test, type Download } from '@playwright/test';
import { decode } from 'fast-png';
import { unzipSync } from 'fflate';

function readPngIhdr(bytes: Uint8Array) {
  const view = new DataView(bytes.buffer, bytes.byteOffset, bytes.byteLength);
  return {
    signatureOk: bytes[0] === 0x89 && bytes[1] === 0x50 && bytes[2] === 0x4e && bytes[3] === 0x47,
    width: view.getUint32(16, false),
    height: view.getUint32(20, false),
    bitDepth: bytes[24],
    colorType: bytes[25],
  };
}

async function readDownloadBytes(download: Download): Promise<Uint8Array> {
  const filePath = await download.path();
  if (!filePath) {
    throw new Error(`Download path missing for ${download.suggestedFilename()}`);
  }
  const buf = await fs.readFile(filePath);
  return new Uint8Array(buf.buffer, buf.byteOffset, buf.byteLength);
}

test.describe('Export MVP & Extended PDF Verification', () => {
  test('exports valid PNG maps (CT0/CT2), settings JSON, 7-page Unicode PDF, 3D previews, and ZIP package via UI and Ctrl+E', async ({
    page,
  }) => {
    const errors: string[] = [];
    page.on('pageerror', (err) => errors.push(err.message));
    page.on('console', (msg) => {
      if (msg.type() === 'error') errors.push(msg.text());
    });

    await page.setViewportSize({ width: 1280, height: 800 });
    await page.goto('/');

    // Create 50x70 cm, 100x140 px project
    await page.getByTestId('btn-new-project').click();
    await page.locator('#np-name').fill('Zażółć Eksport Test');
    await page.locator('#np-res-mode').click();
    await page.getByRole('option', { name: 'Width in px' }).click();
    await page.locator('#np-width-px').fill('100');
    await page.getByTestId('new-project-submit').click();
    await expect(page.getByRole('dialog')).toBeHidden();
    await page.waitForTimeout(80);

    // Paint deterministic blocks on color, height, and opacity
    await page.evaluate(() => {
      const dbg = window.__shadowpaintDebug;
      if (!dbg) return;
      dbg.emitColorDirtyBlock(10, 10, 40, 40, [0x22, 0x88, 0xcc, 255]);
      dbg.emitHeightDirtyBlock(10, 10, 40, 40, 0.5);
      dbg.emitOpacityDirtyBlock(10, 10, 40, 40, 0.6);
    });
    await page.waitForTimeout(80);

    // Lower meshDetail to 256 for fast software WebGL preview render
    await page.getByTestId('right-tab-canvas').click();
    await page.getByTestId('canvas-mesh-detail').click();
    await page.getByRole('option', { name: /^256 / }).click();

    // Open Export tab
    await page.getByTestId('right-tab-export').click();
    await expect(page.getByTestId('btn-export-package-panel')).toBeVisible();

    // 1. Download individual height_map.png
    const [heightDownload] = await Promise.all([
      page.waitForEvent('download'),
      page.getByTestId('btn-download-heightPng').click(),
    ]);
    expect(heightDownload.suggestedFilename()).toBe('height_map.png');
    const heightBytes = await readDownloadBytes(heightDownload);
    expect(readPngIhdr(heightBytes)).toEqual({
      signatureOk: true,
      width: 100,
      height: 140,
      bitDepth: 8,
      colorType: 0,
    });
    const decodedHeight = decode(heightBytes);
    expect(decodedHeight.data[20 * 100 + 20]).toBe(Math.round(0.5 * 255));

    // 2. Download individual project_settings.json
    const [jsonDownload] = await Promise.all([
      page.waitForEvent('download'),
      page.getByTestId('btn-download-settingsJson').click(),
    ]);
    expect(jsonDownload.suggestedFilename()).toBe('project_settings.json');
    const jsonText = new TextDecoder('utf-8').decode(await readDownloadBytes(jsonDownload));
    const parsedJson = JSON.parse(jsonText);
    expect(parsedJson.format).toBe('shadowpaint-settings');
    expect(parsedJson.project.canvas.widthPx).toBe(100);
    expect(parsedJson.project.canvas.heightPx).toBe(140);
    expect(parsedJson.maps['height_map.png'].colorType).toBe(0);
    expect(parsedJson.stats.height.maxMm).toBeCloseTo(2.5, 2);

    // 3. Download individual preview_front.png
    const [previewDownload] = await Promise.all([
      page.waitForEvent('download'),
      page.getByTestId('btn-download-previewFrontPng').click(),
    ]);
    expect(previewDownload.suggestedFilename()).toBe('preview_front.png');
    const previewIhdr = readPngIhdr(await readDownloadBytes(previewDownload));
    expect(previewIhdr.signatureOk).toBe(true);
    expect(previewIhdr.colorType).toBe(2);
    expect(previewIhdr.height).toBe(2048);

    // 4. Switch to PL, set previewLongestSide = 1024, export full ZIP via Ctrl+E
    await page.getByTestId('lang-pl').click();
    await page.getByTestId('export-preview-size').click();
    await page.getByRole('option', { name: '1024 px' }).click();
    await page.waitForTimeout(50);

    // Click viewport title / top area so focus is not inside a button that blocks Ctrl+E
    await page.getByTestId('viewport-canvas-area').click({ position: { x: 20, y: 20 } });

    const [zipDownload] = await Promise.all([
      page.waitForEvent('download'),
      page.keyboard.press('Control+e'),
    ]);

    expect(zipDownload.suggestedFilename()).toMatch(
      /^shadowpaint_zazolc-eksport-test_\d{8}-\d{4}\.zip$/,
    );

    const zipBytes = await readDownloadBytes(zipDownload);
    const archive = unzipSync(zipBytes);
    expect(Object.keys(archive).sort()).toEqual([
      'color_map.png',
      'documentation.pdf',
      'height_map.png',
      'opacity_map.png',
      'previews/preview_back.png',
      'previews/preview_combined.png',
      'previews/preview_front.png',
      'project_settings.json',
    ]);

    expect(readPngIhdr(archive['color_map.png'] as Uint8Array)).toEqual({
      signatureOk: true,
      width: 100,
      height: 140,
      bitDepth: 8,
      colorType: 2,
    });
    expect(readPngIhdr(archive['opacity_map.png'] as Uint8Array).colorType).toBe(0);
    expect(readPngIhdr(archive['previews/preview_combined.png'] as Uint8Array).height).toBe(1024);

    const pdfLatin1 = new TextDecoder('latin1').decode(archive['documentation.pdf'] as Uint8Array);
    expect(pdfLatin1.startsWith('%PDF-')).toBe(true);
    expect(pdfLatin1.includes('DejaVuSans')).toBe(true);
    expect((pdfLatin1.match(/\/Type\s*\/Page\b/g) ?? []).length).toBe(7);

    expect(errors).toEqual([]);
  });

  test('generates 1:1 printable tile PDF sheets and RGBA CT6 color PNG when configured in ExportPanel', async ({
    page,
  }) => {
    const errors: string[] = [];
    page.on('pageerror', (err) => errors.push(err.message));
    page.on('console', (msg) => {
      if (msg.type() === 'error') errors.push(msg.text());
    });

    await page.setViewportSize({ width: 1280, height: 800 });
    await page.goto('/');

    // Create 50x70 cm, 100x140 px project so physical tiling spans multiple sheets cleanly & fast
    await page.getByTestId('btn-new-project').click();
    await page.locator('#np-name').fill('Tiles 1to1 Test');
    await page.locator('#np-res-mode').click();
    await page.getByRole('option', { name: 'Width in px' }).click();
    await page.locator('#np-width-px').fill('100');
    await page.getByTestId('new-project-submit').click();
    await expect(page.getByRole('dialog')).toBeHidden();
    await page.waitForTimeout(80);

    // Lower meshDetail to 256 for fast software WebGL thumbnail render
    await page.getByTestId('right-tab-canvas').click();
    await page.getByTestId('canvas-mesh-detail').click();
    await page.getByRole('option', { name: /^256 / }).click();

    // Open Export tab
    await page.getByTestId('right-tab-export').click();
    await expect(page.getByTestId('export-grid-spacing-cm')).toBeVisible();
    await expect(page.getByTestId('export-include-tiles-1to1')).toBeVisible();

    // Configure custom grid spacing = 10 cm, enable 1:1 tiles, enable RGBA color PNG, disable 3D previews
    const spacingInput = page.getByTestId('export-grid-spacing-cm');
    await spacingInput.fill('10');
    await spacingInput.press('Enter');

    await page.getByTestId('export-include-tiles-1to1').click();
    await expect(page.getByTestId('export-include-tiles-1to1')).toBeChecked();

    await page.getByTestId('export-color-alpha').click();
    await expect(page.getByTestId('export-color-alpha')).toBeChecked();

    await page.getByTestId('export-include-previews').click();
    await expect(page.getByTestId('export-include-previews')).not.toBeChecked();

    // Export standalone PDF and inspect page count (> 7 because 50x70 cm spans multiple 1:1 sheets)
    const [pdfDownload] = await Promise.all([
      page.waitForEvent('download'),
      page.getByTestId('btn-download-documentationPdf').click(),
    ]);
    expect(pdfDownload.suggestedFilename()).toBe('documentation.pdf');
    const pdfLatin1 = new TextDecoder('latin1').decode(await readDownloadBytes(pdfDownload));
    expect(pdfLatin1.startsWith('%PDF-')).toBe(true);
    const tilePdfPages = (pdfLatin1.match(/\/Type\s*\/Page\b/g) ?? []).length;
    expect(tilePdfPages).toBeGreaterThan(7);

    // Export ZIP package and inspect CT6 RGBA + JSON settings fidelity
    const [zipDownload] = await Promise.all([
      page.waitForEvent('download'),
      page.getByTestId('btn-export-package-panel').click(),
    ]);
    const archive = unzipSync(await readDownloadBytes(zipDownload));
    expect(Object.keys(archive).sort()).toEqual([
      'color_map.png',
      'documentation.pdf',
      'height_map.png',
      'opacity_map.png',
      'project_settings.json',
    ]);

    expect(readPngIhdr(archive['color_map.png'] as Uint8Array)).toEqual({
      signatureOk: true,
      width: 100,
      height: 140,
      bitDepth: 8,
      colorType: 6,
    });
    expect(readPngIhdr(archive['height_map.png'] as Uint8Array)).toEqual({
      signatureOk: true,
      width: 100,
      height: 140,
      bitDepth: 8,
      colorType: 0,
    });
    expect(readPngIhdr(archive['opacity_map.png'] as Uint8Array)).toEqual({
      signatureOk: true,
      width: 100,
      height: 140,
      bitDepth: 8,
      colorType: 0,
    });

    const parsedJson = JSON.parse(
      new TextDecoder('utf-8').decode(archive['project_settings.json'] as Uint8Array),
    );
    expect(parsedJson.project.export.gridSheetSpacingCm).toBe(10);
    expect(parsedJson.project.export.includeTiles1to1).toBe(true);
    expect(parsedJson.maps['color_map.png'].colorType).toBe(6);

    // Check PL localization on the new Export controls
    await page.getByTestId('lang-pl').click();
    await expect(page.getByText('Odstęp siatki referencyjnej')).toBeVisible();
    await expect(page.getByText('Dołącz kafelki druku 1:1 do PDF')).toBeVisible();

    expect(errors).toEqual([]);
  });
});
