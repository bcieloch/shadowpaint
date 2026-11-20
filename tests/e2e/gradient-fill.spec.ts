import { expect, test } from '@playwright/test';

test.describe('Gradient & Fill Tools', () => {
  test('supports linear/radial gradients, flood fill, fill selection, undo/redo, shortcuts, and EN/PL i18n', async ({
    page,
  }) => {
    const errors: string[] = [];
    page.on('pageerror', (err) => errors.push(err.message));
    page.on('console', (msg) => {
      if (msg.type() === 'error') {
        errors.push(msg.text());
      }
    });

    await page.setViewportSize({ width: 1280, height: 800 });
    await page.goto('/');

    // Create a clean 10x10 cm, 200x200 px project
    await page.getByTestId('btn-new-project').click();
    await page.locator('#np-name').fill('Gradient Fill Test');
    await page.locator('#np-lock-aspect').uncheck();
    await page.locator('#np-width-cm').fill('10');
    await page.locator('#np-height-cm').fill('10');
    await page.locator('#np-res-mode').click();
    await page.getByRole('option', { name: 'Width in px' }).click();
    await page.locator('#np-width-px').fill('200');
    await page.getByTestId('new-project-submit').click();
    await expect(page.getByRole('dialog')).toBeHidden();

    await page.getByTestId('btn-zoom-100').click();
    await expect(page.getByTestId('viewport-zoom-pct')).toHaveText('100%');

    const canvasArea = page.getByTestId('viewport-canvas-area');
    const box = await canvasArea.boundingBox();
    expect(box).not.toBeNull();
    if (!box) return;

    const cx = box.x + box.width / 2;
    const cy = box.y + box.height / 2;
    const imgOriginX = cx - 100;
    const imgOriginY = cy - 100;

    // 1. Select center rectangle [50..150, 50..150] and apply linear gradient on Height map
    await page.keyboard.press('m');
    await page.mouse.move(imgOriginX + 50, imgOriginY + 50);
    await page.mouse.down();
    await page.mouse.move(imgOriginX + 150, imgOriginY + 150, { steps: 3 });
    await page.mouse.up();

    await page.keyboard.press('g');
    await expect(page.getByTestId('tool-gradient')).toHaveAttribute('aria-pressed', 'true');
    await expect(page.getByTestId('gradient-kind-linear')).toHaveAttribute('aria-checked', 'true');
    await expect(page.getByTestId('gradient-only-selection')).toBeChecked();

    // Hide red selection overlay so height grayscale pixels are untinted
    await page.locator('#selection-strip-overlay').click();

    await page.getByTestId('map-layer-height').click();
    await page.getByTestId('mode-height').click();

    await page.mouse.move(imgOriginX + 50, imgOriginY + 100);
    await page.mouse.down();
    await page.mouse.move(imgOriginX + 150, imgOriginY + 100, { steps: 4 });
    await page.mouse.up();

    // Poll until worker gradient completes
    await expect
      .poll(
        async () =>
          page.evaluate(() => {
            const dbg = window.__shadowpaintDebug;
            if (!dbg) return 0;
            const rgba = dbg.readFlatCanvasRgba(200, 200);
            return rgba[(100 * 200 + 100) * 4] ?? 0;
          }),
        { timeout: 5000 },
      )
      .toBeGreaterThan(100);

    const gradCheck = await page.evaluate(() => {
      const dbg = window.__shadowpaintDebug;
      if (!dbg) return null;
      const rgba = dbg.readFlatCanvasRgba(200, 200);
      return {
        outsideLeft: rgba[(100 * 200 + 25) * 4] ?? 255,
        insideStart: rgba[(100 * 200 + 55) * 4] ?? 255,
        insideMid: rgba[(100 * 200 + 100) * 4] ?? 0,
        insideEnd: rgba[(100 * 200 + 145) * 4] ?? 0,
      };
    });
    expect(gradCheck).not.toBeNull();
    if (gradCheck) {
      // Note: readFlatCanvasRgba outputs sRGB bytes (0.05 -> 63, 0.5 -> 187, 0.95 -> 249)
      expect(gradCheck.outsideLeft, JSON.stringify(gradCheck)).toBe(0);
      expect(gradCheck.insideStart, JSON.stringify(gradCheck)).toBeLessThan(80);
      expect(gradCheck.insideMid, JSON.stringify(gradCheck)).toBeGreaterThan(150);
      expect(gradCheck.insideMid, JSON.stringify(gradCheck)).toBeLessThan(210);
      expect(gradCheck.insideEnd, JSON.stringify(gradCheck)).toBeGreaterThan(230);
    }

    // Undo removes the gradient
    await page.keyboard.press('Control+z');
    await expect
      .poll(async () =>
        page.evaluate(() => {
          const rgba = window.__shadowpaintDebug?.readFlatCanvasRgba(200, 200);
          return rgba ? (rgba[(100 * 200 + 100) * 4] ?? 255) : 255;
        }),
      )
      .toBe(0);

    // Clear selection and apply radial gradient at center (100, 100) -> radius 40
    await page.keyboard.press('Control+d');
    await page.getByTestId('gradient-kind-radial').click();
    await expect(page.getByTestId('gradient-kind-radial')).toHaveAttribute('aria-checked', 'true');
    await page.mouse.move(imgOriginX + 100, imgOriginY + 100);
    await page.mouse.down();
    await page.mouse.move(imgOriginX + 140, imgOriginY + 100, { steps: 3 });
    await page.mouse.up();

    await expect
      .poll(
        async () =>
          page.evaluate(() => {
            const rgba = window.__shadowpaintDebug?.readFlatCanvasRgba(200, 200);
            return rgba ? (rgba[(100 * 200 + 140) * 4] ?? 0) : 0;
          }),
        { timeout: 5000 },
      )
      .toBeGreaterThan(230);

    const radialCenter = await page.evaluate(() => {
      const rgba = window.__shadowpaintDebug?.readFlatCanvasRgba(200, 200);
      return rgba ? (rgba[(100 * 200 + 100) * 4] ?? 255) : 255;
    });
    expect(radialCenter).toBeLessThan(30);

    // Test Fill tool + Fill selection on Color map
    await page.getByTestId('map-layer-color').click();
    await page.getByTestId('mode-color').click();

    await page.evaluate(() => {
      window.__shadowpaintDebug?.emitColorDirtyBlock(30, 30, 50, 50, [40, 80, 120, 255]);
      window.__shadowpaintDebug?.emitColorDirtyBlock(120, 120, 40, 40, [40, 80, 120, 255]);
    });

    await page.keyboard.press('f');
    await expect(page.getByTestId('tool-fill')).toHaveAttribute('aria-pressed', 'true');
    await page.getByTestId('brush-color-hex').fill('#ff0000');
    await page.getByTestId('brush-color-hex').press('Enter');

    // Contiguous fill at (50, 50) fills first block only
    await page.mouse.click(imgOriginX + 50, imgOriginY + 50);

    await expect
      .poll(
        async () =>
          page.evaluate(() => {
            const buf = window.__shadowpaintDebug?.getMapEffectiveRgba();
            return buf ? (buf[(50 * 200 + 50) * 4] ?? 0) : 0;
          }),
        { timeout: 5000 },
      )
      .toBe(255);

    const secondBlockStillOriginal = await page.evaluate(() => {
      const buf = window.__shadowpaintDebug?.getMapEffectiveRgba();
      return buf ? (buf[(140 * 200 + 140) * 4] ?? 0) : 0;
    });
    expect(secondBlockStillOriginal).toBe(40);

    // Check Fill selection button fills a new rectangle selection
    await page.keyboard.press('m');
    await page.mouse.move(imgOriginX + 10, imgOriginY + 160);
    await page.mouse.down();
    await page.mouse.move(imgOriginX + 40, imgOriginY + 190, { steps: 2 });
    await page.mouse.up();

    await page.keyboard.press('f');
    await page.getByTestId('brush-color-hex').fill('#00ff80');
    await page.getByTestId('brush-color-hex').press('Enter');
    await page.getByTestId('btn-fill-selection').click();

    await expect
      .poll(
        async () =>
          page.evaluate(() => {
            const buf = window.__shadowpaintDebug?.getMapEffectiveRgba();
            return buf ? (buf[(175 * 200 + 25) * 4 + 1] ?? 0) : 0;
          }),
        { timeout: 5000 },
      )
      .toBe(255);

    // Verify PL translations on Gradient and Fill tools
    await page.getByTestId('lang-pl').click();
    await expect(page.getByTestId('btn-fill-selection')).toHaveText('Wypełnij zaznaczenie');
    await page.keyboard.press('g');
    await expect(page.getByTestId('gradient-swap-btn')).toContainText('Zamień początek z końcem');
    await expect(page.getByTestId('gradient-kind-radial')).toHaveText('Radialny');

    await page.getByTestId('lang-en').click();
    expect(errors).toEqual([]);
  });
});
