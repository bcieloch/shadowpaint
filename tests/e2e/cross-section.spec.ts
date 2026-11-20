import { expect, test } from '@playwright/test';

test.describe('Cross-Section Tool & Profile Panel', () => {
  test('slices height & transmission, toggles True scale, syncs 2D/3D hover markers, exports CSV, and translates EN/PL', async ({
    page,
  }) => {
    const errors: string[] = [];
    page.on('pageerror', (err) => errors.push(err.message));
    page.on('console', (msg) => {
      if (msg.type() === 'error') errors.push(msg.text());
    });

    await page.setViewportSize({ width: 1280, height: 800 });
    await page.goto('/');

    // Paint an elevated region in the middle of the height map so the slice has real relief variation
    await page.evaluate(() => {
      window.__shadowpaintDebug?.emitHeightDirtyBlock(900, 1200, 1200, 1800, 0.8);
      window.__shadowpaintDebug?.emitOpacityDirtyBlock(900, 1200, 1200, 1800, 0.5);
    });

    // Activate Cross-Section via X shortcut
    await page.keyboard.press('x');
    await expect(page.getByTestId('tool-crossSection')).toHaveAttribute('aria-pressed', 'true');
    await expect(page.getByTestId('cross-section-options-empty')).toBeVisible();

    const viewport = page.getByTestId('viewport-canvas-area');
    const box = await viewport.boundingBox();
    expect(box).not.toBeNull();
    if (!box) return;

    const x0 = box.x + Math.round(box.width * 0.25);
    const y0 = box.y + Math.round(box.height * 0.5);
    const x1 = box.x + Math.round(box.width * 0.75);
    const y1 = box.y + Math.round(box.height * 0.5);

    await page.mouse.move(x0, y0);
    await page.mouse.down();
    await page.mouse.move(x1, y1, { steps: 6 });
    await page.mouse.up();

    // Open Section panel via LeftPanel contextual button
    await page.getByTestId('btn-open-section-panel').click();
    await expect(page.getByTestId('cross-section-panel')).toBeVisible();
    await expect(page.getByTestId('cross-section-svg')).toBeVisible();

    const fitPathD = await page.getByTestId('section-height-path').getAttribute('d');
    expect(fitPathD).toBeTruthy();
    expect(fitPathD?.length ?? 0).toBeGreaterThan(20);

    await expect(page.getByTestId('section-transmission-path')).toBeVisible();
    await expect(page.getByTestId('section-stats')).toContainText('4.00 mm');

    // Toggle True scale (1 mm Y = 0.1 cm X) and verify SVG geometry changes
    await page.getByTestId('section-scale-true').click();
    const truePathD = await page.getByTestId('section-height-path').getAttribute('d');
    expect(truePathD).toBeTruthy();
    expect(truePathD).not.toEqual(fitPathD);

    // Switch back to Fit and hover over SVG plot to sync 2D & 3D markers
    await page.getByTestId('section-scale-fit').click();
    const surface = page.getByTestId('section-hover-surface');
    const sBox = await surface.boundingBox();
    expect(sBox).not.toBeNull();
    if (!sBox) return;

    await page.mouse.move(sBox.x + sBox.width * 0.5, sBox.y + sBox.height * 0.5);
    await expect(page.getByTestId('section-svg-hover-marker')).toBeVisible();
    await expect(page.getByTestId('section-hover-readout')).toContainText('mm');
    await expect(page.getByTestId('section-hover-readout')).toContainText('T ');

    // Verify amber line and cyan hover marker rendered on the 2D overlay canvas
    const overlayStats = await page.evaluate(() => {
      const c = document.querySelector('[data-testid="viewport-overlay-canvas"]');
      if (!(c instanceof HTMLCanvasElement)) return { amber: 0, cyan: 0 };
      const ctx = c.getContext('2d');
      if (!ctx) return { amber: 0, cyan: 0 };
      const img = ctx.getImageData(40, 40, c.width - 80, c.height - 80).data;
      let amber = 0;
      let cyan = 0;
      for (let i = 0; i < img.length; i += 4) {
        const r = img[i] ?? 0;
        const g = img[i + 1] ?? 0;
        const b = img[i + 2] ?? 0;
        const a = img[i + 3] ?? 0;
        if (a > 120 && r > 200 && g > 120 && b < 80) amber++;
        if (a > 120 && b > 180 && g > 140 && b > r + 80) cyan++;
      }
      return { amber, cyan };
    });
    expect(overlayStats.amber).toBeGreaterThan(20);
    expect(overlayStats.cyan).toBeGreaterThan(5);

    // Export CSV and verify contents
    const [download] = await Promise.all([
      page.waitForEvent('download'),
      page.getByTestId('btn-section-csv').click(),
    ]);
    expect(download.suggestedFilename()).toContain('_cross_section.csv');
    const stream = await download.createReadStream();
    const chunks: Buffer[] = [];
    for await (const chunk of stream) {
      chunks.push(Buffer.from(chunk));
    }
    const csvText = Buffer.concat(chunks).toString('utf8');
    const csvLines = csvText.trim().split('\n');
    expect(csvLines[0]).toBe('distance_cm,thickness_mm,transmission_pct');
    expect(csvLines.length).toBeGreaterThan(100);

    // Switch to 3D view and verify the 3D displaced surface line & hover marker
    await page.keyboard.press('F2');
    const stats3d = await page.evaluate(() => window.__shadowpaintDebug?.getCrossSection3DStats());
    expect(stats3d).not.toBeNull();
    expect(stats3d?.visible).toBe(true);
    expect(stats3d?.vertexCount ?? 0).toBeGreaterThan(50);
    expect(stats3d?.maxZCm ?? 0).toBeGreaterThan(stats3d?.minZCm ?? 0);

    // Switch UI to Polish and verify translations + clear line
    await page.getByTestId('lang-pl').click();
    await expect(page.getByText('Profil przekroju')).toBeVisible();
    await expect(page.getByTestId('section-scale-true')).toContainText('Skala 1:1');
    await expect(page.getByTestId('btn-section-csv')).toContainText('Pobierz CSV');

    await page.getByTestId('btn-section-clear').click();
    await expect(page.getByTestId('cross-section-empty')).toBeVisible();

    expect(errors).toEqual([]);
  });
});
