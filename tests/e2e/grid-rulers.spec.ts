import { expect, test } from '@playwright/test';

test.describe('Measurement Grid & Edge Rulers', () => {
  test('renders 2D overlay grid, calibrated edge rulers, 3D shader grid, shortcuts, undo/redo, and PL i18n', async ({
    page,
  }) => {
    const errors: string[] = [];
    page.on('pageerror', (err) => errors.push(err.message));
    page.on('console', (msg) => {
      if (msg.type() === 'error') errors.push(msg.text());
    });

    await page.setViewportSize({ width: 1280, height: 800 });
    await page.goto('/');

    // Create small 50x50 cm (200x200 px) project for fast WebGL verification
    await page.getByTestId('btn-new-project').click();
    await page.locator('#np-name').fill('Grid Test');
    await page.locator('#np-lock-aspect').uncheck();
    await page.locator('#np-width-cm').fill('50');
    await page.locator('#np-height-cm').fill('50');
    await page.locator('#np-res-mode').click();
    await page.getByRole('option', { name: 'Width in px' }).click();
    await page.locator('#np-width-px').fill('200');
    await page.getByTestId('new-project-submit').click();
    await expect(page.getByRole('dialog')).toBeHidden();
    await page.waitForTimeout(80);

    // Rulers are on by default; verify Ctrl+R toggles them off and back on without reloading
    await expect(page.getByTestId('btn-toggle-rulers')).toHaveAttribute('aria-pressed', 'true');
    const rulerAlphaOn = await page.evaluate(() => {
      const c = document.querySelector('[data-testid="viewport-overlay-canvas"]');
      if (!(c instanceof HTMLCanvasElement)) return 0;
      const ctx = c.getContext('2d');
      if (!ctx) return 0;
      const data = ctx.getImageData(4, 4, 10, 10).data;
      let maxA = 0;
      for (let i = 3; i < data.length; i += 4) maxA = Math.max(maxA, data[i] ?? 0);
      return maxA;
    });
    expect(rulerAlphaOn).toBeGreaterThan(100);

    await page.keyboard.press('Control+KeyR');
    await expect(page.getByTestId('btn-toggle-rulers')).toHaveAttribute('aria-pressed', 'false');
    await page.waitForTimeout(40);
    const rulerAlphaOff = await page.evaluate(() => {
      const c = document.querySelector('[data-testid="viewport-overlay-canvas"]');
      if (!(c instanceof HTMLCanvasElement)) return 0;
      const ctx = c.getContext('2d');
      if (!ctx) return 0;
      const data = ctx.getImageData(4, 4, 10, 10).data;
      let maxA = 0;
      for (let i = 3; i < data.length; i += 4) maxA = Math.max(maxA, data[i] ?? 0);
      return maxA;
    });
    expect(rulerAlphaOff).toBe(0);

    await page.keyboard.press('Control+KeyR');
    await expect(page.getByTestId('btn-toggle-rulers')).toHaveAttribute('aria-pressed', 'true');

    // Open Canvas tab and verify grid controls + Ctrl+' shortcut
    await page.getByTestId('right-tab-canvas').click();
    await expect(page.getByTestId('canvas-grid-section')).toBeVisible();
    await expect(page.getByTestId('grid-show-2d')).toHaveAttribute('aria-checked', 'false');

    // Ctrl+' toggles 2D grid on (and records history)
    await page.keyboard.press('Control+Quote');
    await expect(page.getByTestId('grid-show-2d')).toHaveAttribute('aria-checked', 'true');
    await expect(page.getByTestId('btn-toggle-grid-2d')).toHaveAttribute('aria-pressed', 'true');

    // Configure high-contrast green grid and spacing = 5 cm, subdivisions = 1, opacity = 100%
    await page.getByTestId('grid-spacing-preset-5').click();
    await page.getByTestId('grid-subdivisions').fill('1');
    await page.getByTestId('grid-subdivisions').press('Enter');
    await page.getByTestId('grid-color-hex').fill('#00ff88');
    await page.getByTestId('grid-color-hex').press('Enter');
    await page.waitForTimeout(60);

    // Check center pixels of overlay canvas contain grid color
    const overlayGreenCount = await page.evaluate(() => {
      const c = document.querySelector('[data-testid="viewport-overlay-canvas"]');
      if (!(c instanceof HTMLCanvasElement)) return 0;
      const ctx = c.getContext('2d');
      if (!ctx) return 0;
      const img = ctx.getImageData(40, 40, c.width - 80, c.height - 80).data;
      let greenHits = 0;
      for (let i = 0; i < img.length; i += 4) {
        const r = img[i] ?? 0;
        const g = img[i + 1] ?? 0;
        const b = img[i + 2] ?? 0;
        const a = img[i + 3] ?? 0;
        if (a > 20 && g > r + 40 && g > b) greenHits++;
      }
      return greenHits;
    });
    expect(overlayGreenCount).toBeGreaterThan(50);

    // Switch to 3D layout and test 3D shader grid + Ctrl+' + pixel output change
    await page.getByTestId('layout-3d').click();
    await page.waitForTimeout(80);
    const frame3DOff = await page.evaluate(() =>
      Array.from(window.__shadowpaintDebug?.read3DViewportRgba(192, 192) ?? []),
    );
    const statsOff = await page.evaluate(() => window.__shadowpaintDebug?.get3DStats());
    expect(statsOff?.gridVisible).toBe(false);

    // Set grid opacity to 100% and toggle 3D grid ON via Ctrl+'
    const opacitySlider = page.getByTestId('canvas-grid-section').getByRole('slider');
    await opacitySlider.focus();
    await page.keyboard.press('End');
    await page.keyboard.press('Control+Quote');
    await expect(page.getByTestId('btn-toggle-grid-3d')).toHaveAttribute('aria-pressed', 'true');
    await expect(page.getByTestId('grid-show-3d')).toHaveAttribute('aria-checked', 'true');
    await page.waitForTimeout(80);

    const statsOn = await page.evaluate(() => window.__shadowpaintDebug?.get3DStats());
    expect(statsOn?.gridVisible).toBe(true);

    const frame3DOn = await page.evaluate(() =>
      Array.from(window.__shadowpaintDebug?.read3DViewportRgba(192, 192) ?? []),
    );
    let diffPixels = 0;
    for (let i = 0; i < frame3DOn.length; i += 4) {
      const dg = (frame3DOn[i + 1] ?? 0) - (frame3DOff[i + 1] ?? 0);
      if (Math.abs(dg) > 15) diffPixels++;
    }
    expect(diffPixels).toBeGreaterThan(40);

    // Undo should turn 3D grid back off cleanly
    await page.getByTestId('btn-undo').click();
    await expect(page.getByTestId('grid-show-3d')).toHaveAttribute('aria-checked', 'false');

    // Verify PL translations on Canvas grid section
    await page.getByTestId('lang-pl').click();
    await expect(page.getByText('Siatka pomiarowa i linijki')).toBeVisible();
    await expect(page.getByText('Pokaż siatkę w shaderze 3D')).toBeVisible();

    expect(errors).toEqual([]);
  });
});
