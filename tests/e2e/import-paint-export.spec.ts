import fs from 'node:fs/promises';
import path from 'node:path';
import { expect, test, type Download, type Page } from '@playwright/test';
import { decode } from 'fast-png';
import { unzipSync } from 'fflate';

const FIXTURES_DIR = path.resolve(import.meta.dirname, 'fixtures');

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
    throw new Error(`Missing download path for ${download.suggestedFilename()}`);
  }
  const buf = await fs.readFile(filePath);
  return new Uint8Array(buf.buffer, buf.byteOffset, buf.byteLength);
}

async function assertNoRawTranslationKeys(page: Page) {
  const rawKeys = await page.evaluate(() => {
    const walker = document.createTreeWalker(document.body, NodeFilter.SHOW_TEXT);
    const bad: string[] = [];
    const keyRe = /^[a-z][a-zA-Z0-9]*(\.[a-zA-Z0-9_-]+)+$/;
    const fileExtRe = /\.(png|jpe?g|tiff?|pdf|json|zip|relief)$/i;
    let node = walker.nextNode();
    while (node) {
      const txt = node.textContent?.trim() ?? '';
      if (txt && keyRe.test(txt) && !fileExtRe.test(txt)) {
        bad.push(txt);
      }
      node = walker.nextNode();
    }
    return bad;
  });
  expect(rawKeys).toEqual([]);
}

test.describe('MVP end-to-end verification', () => {
  test('imports PNG/TIFF/JPG with mismatched aspects, paints height with undo/redo, exports ZIP, and switches EN/PL across all panels', async ({
    page,
  }) => {
    const errors: string[] = [];
    page.on('pageerror', (err) => errors.push(err.message));
    page.on('console', (msg) => {
      if (msg.type() === 'error') errors.push(msg.text());
    });

    await page.setViewportSize({ width: 1280, height: 800 });
    await page.goto('/');

    // 1. Create a 10x14 cm, 100x140 px project
    await page.getByTestId('btn-new-project').click();
    await page.locator('#np-name').fill('MVP Full Test');
    await page.locator('#np-lock-aspect').uncheck();
    await page.locator('#np-width-cm').fill('10');
    await page.locator('#np-height-cm').fill('14');
    await page.locator('#np-px-cm').fill('10');
    await page.getByTestId('new-project-submit').click();
    await expect(page.getByRole('dialog')).toBeHidden();
    await expect(page.getByTestId('topbar-project-name')).toHaveText('MVP Full Test');

    // 2. Open Import Wizard and upload PNG (64x64), 16-bit TIFF (48x72), JPG (80x40)
    await page.getByTestId('btn-import-wizard').click();
    await expect(page.getByRole('dialog')).toBeVisible();

    await page
      .getByTestId('import-slot-color')
      .locator('input[type="file"]')
      .setInputFiles(path.join(FIXTURES_DIR, 'color-square.png'));
    await page
      .getByTestId('import-slot-height')
      .locator('input[type="file"]')
      .setInputFiles(path.join(FIXTURES_DIR, 'height-portrait.tiff'));
    await page
      .getByTestId('import-slot-opacity')
      .locator('input[type="file"]')
      .setInputFiles(path.join(FIXTURES_DIR, 'opacity-landscape.jpg'));

    // Disparate aspect ratios + resolutions trigger MismatchAlert
    await expect(page.getByTestId('import-mismatch-alert')).toBeVisible();

    // Apply Stretch all so all 3 fill 100x140 deterministically, then commit import
    await page.getByRole('button', { name: 'Stretch all' }).click();
    await page.getByTestId('import-apply-btn').click();
    await expect(page.getByRole('dialog')).toBeHidden();

    // Wait for worker decode/resample/effective upload to settle
    await expect(page.getByTestId('btn-undo')).toBeEnabled();

    // Snapshot rendered COLOR and OPACITY buffers before painting on HEIGHT
    await page.getByTestId('mode-color').click();
    const colorBefore = await page.evaluate(() =>
      Array.from(window.__shadowpaintDebug?.readFlatCanvasRgba(100, 140) ?? []),
    );
    await page.getByTestId('mode-opacity').click();
    const opacityBefore = await page.evaluate(() =>
      Array.from(window.__shadowpaintDebug?.readFlatCanvasRgba(100, 140) ?? []),
    );
    await page.getByTestId('mode-height').click();
    const heightBefore = await page.evaluate(() =>
      Array.from(window.__shadowpaintDebug?.readFlatCanvasRgba(100, 140) ?? []),
    );
    expect(colorBefore.length).toBe(100 * 140 * 4);
    expect(heightBefore.length).toBe(100 * 140 * 4);
    expect(opacityBefore.length).toBe(100 * 140 * 4);

    // Verify imported color fixture actually updated the center pixel (red-orange tint, R > 150)
    const centerIdx = (70 * 100 + 50) * 4;
    expect(colorBefore[centerIdx] ?? 0).toBeGreaterThan(150);

    // 3. Paint Height with Brush ('2' = height, 'b' = brush, mode = Raise)
    await page.keyboard.press('2');
    await page.keyboard.press('b');
    await page.getByTestId('brush-mode-raise').click();

    const canvasBox = await page.getByTestId('viewport-canvas-area').boundingBox();
    if (!canvasBox) throw new Error('Missing viewport-canvas-area');
    const cx = canvasBox.x + canvasBox.width / 2;
    const cy = canvasBox.y + canvasBox.height / 2;

    await page.mouse.move(cx - 30, cy);
    await page.mouse.down();
    await page.mouse.move(cx + 30, cy, { steps: 6 });
    await page.mouse.up();

    const heightAfterBrush = await page.evaluate(() =>
      Array.from(window.__shadowpaintDebug?.readFlatCanvasRgba(100, 140) ?? []),
    );
    expect(heightAfterBrush[centerIdx] ?? 0).toBeGreaterThan((heightBefore[centerIdx] ?? 0) + 10);

    // Painting Height must NOT modify Color or Opacity
    await page.getByTestId('mode-color').click();
    const colorAfterBrush = await page.evaluate(() =>
      Array.from(window.__shadowpaintDebug?.readFlatCanvasRgba(100, 140) ?? []),
    );
    expect(colorAfterBrush).toEqual(colorBefore);

    await page.getByTestId('mode-opacity').click();
    const opacityAfterBrush = await page.evaluate(() =>
      Array.from(window.__shadowpaintDebug?.readFlatCanvasRgba(100, 140) ?? []),
    );
    expect(opacityAfterBrush).toEqual(opacityBefore);

    // 4. Undo (Ctrl+Z) and Redo (Ctrl+Shift+Z)
    await page.getByTestId('mode-height').click();
    await page.keyboard.press('Control+z');
    const heightAfterUndo = await page.evaluate(() =>
      Array.from(window.__shadowpaintDebug?.readFlatCanvasRgba(100, 140) ?? []),
    );
    expect(heightAfterUndo).toEqual(heightBefore);

    await page.keyboard.press('Control+Shift+z');
    const heightAfterRedo = await page.evaluate(() =>
      Array.from(window.__shadowpaintDebug?.readFlatCanvasRgba(100, 140) ?? []),
    );
    expect(heightAfterRedo).toEqual(heightAfterBrush);

    // 5. Lower meshDetail for fast software WebGL, check 3D layout, then return to 2D
    await page.getByTestId('right-tab-canvas').click();
    await page.getByTestId('canvas-mesh-detail').click();
    await page.getByRole('option', { name: /^256 / }).click();

    await page.getByTestId('layout-3d').click();
    await expect(page.getByTestId('btn-reset-view-3d')).toBeVisible();
    const stats3d = await page.evaluate(() => window.__shadowpaintDebug?.get3DStats() ?? null);
    expect(stats3d?.displacement.maxDisplacementCm).toBeCloseTo(0.5, 4);
    await page.getByTestId('layout-2d').click();

    // 6. Export full ZIP package via Export panel and inspect all contents
    await page.getByTestId('right-tab-export').click();
    await page.getByTestId('export-preview-size').click();
    await page.getByRole('option', { name: '1024 px' }).click();

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

    const decodedHeightPng = decode(archive['height_map.png'] as Uint8Array);
    expect(decodedHeightPng.width).toBe(100);
    expect(decodedHeightPng.height).toBe(140);
    expect(decodedHeightPng.data[70 * 100 + 50]).toBeGreaterThan(100);

    const parsedSettings = JSON.parse(
      new TextDecoder('utf-8').decode(archive['project_settings.json'] as Uint8Array),
    );
    expect(parsedSettings.project.canvas.widthPx).toBe(100);
    expect(parsedSettings.project.canvas.heightPx).toBe(140);
    expect(parsedSettings.maps['height_map.png'].colorType).toBe(0);
    expect(parsedSettings.maps['opacity_map.png'].colorType).toBe(0);

    const pdfLatin1 = new TextDecoder('latin1').decode(archive['documentation.pdf'] as Uint8Array);
    expect(pdfLatin1.startsWith('%PDF-')).toBe(true);
    expect(pdfLatin1.includes('DejaVuSans')).toBe(true);
    expect((pdfLatin1.match(/\/Type\s*\/Page\b/g) ?? []).length).toBe(7);

    // 7. Full EN <-> PL live translation verification across all MVP tabs
    await page.getByTestId('lang-pl').click();
    await expect(page.getByTestId('btn-new-project')).toContainText('Nowy projekt');
    await expect(page.getByTestId('btn-export-package')).toContainText('Eksportuj paczkę');
    await expect(page.getByTestId('right-tab-map')).toHaveText('Mapa');
    await expect(page.getByTestId('right-tab-canvas')).toHaveText('Płótno');
    await expect(page.getByTestId('right-tab-light')).toHaveText('Światło');
    await expect(page.getByTestId('right-tab-material')).toHaveText('Materiał');
    await expect(page.getByTestId('right-tab-export')).toHaveText('Eksport');
    await expect(page.getByTestId('statusbar-message')).toHaveText('Gotowy');

    for (const tabId of [
      'right-tab-map',
      'right-tab-canvas',
      'right-tab-light',
      'right-tab-material',
      'right-tab-export',
    ]) {
      await page.getByTestId(tabId).click();
      await assertNoRawTranslationKeys(page);
    }

    await page.getByTestId('lang-en').click();
    await expect(page.getByTestId('btn-new-project')).toContainText('New Project');
    await expect(page.getByTestId('btn-export-package')).toContainText('Export Package');
    await expect(page.getByTestId('right-tab-map')).toHaveText('Map');
    await expect(page.getByTestId('right-tab-canvas')).toHaveText('Canvas');
    await expect(page.getByTestId('right-tab-light')).toHaveText('Light');
    await expect(page.getByTestId('right-tab-material')).toHaveText('Material');
    await expect(page.getByTestId('right-tab-export')).toHaveText('Export');
    await expect(page.getByTestId('statusbar-message')).toHaveText('Ready');

    for (const tabId of [
      'right-tab-map',
      'right-tab-canvas',
      'right-tab-light',
      'right-tab-material',
      'right-tab-export',
    ]) {
      await page.getByTestId(tabId).click();
      await assertNoRawTranslationKeys(page);
    }

    expect(errors).toEqual([]);
  });
});
