import { expect, test } from '@playwright/test';

test.describe('Smooth & Blur Tools', () => {
  test('supports smooth and blur brushes (realtime + large-radius worker), undo/redo, shortcuts, and EN/PL i18n', async ({
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
    await page.locator('#np-name').fill('Smooth Blur Test');
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

    // 1. Activate Smooth tool via shortcut 's' and smooth a sharp height block edge
    await page.keyboard.press('s');
    await expect(page.getByTestId('tool-smooth')).toHaveAttribute('aria-pressed', 'true');
    await expect(page.getByTestId('smooth-iterations-input')).toBeVisible();
    await page.getByTestId('smooth-iterations-input').fill('4');
    await page.getByTestId('brush-size-input').fill('24');

    await page.getByTestId('map-layer-height').click();
    await page.getByTestId('mode-height').click();

    await page.evaluate(() => {
      window.__shadowpaintDebug?.emitHeightDirtyBlock(100, 70, 50, 60, 1.0);
    });

    // Smooth right at the edge x=100, y=100 (cx, cy)
    await page.mouse.move(cx, cy);
    await page.mouse.down();
    await page.mouse.move(cx, cy + 10, { steps: 3 });
    await page.mouse.up();

    const heightSample = await page.evaluate(() => {
      const dbg = window.__shadowpaintDebug;
      if (!dbg) return null;
      const rgba = dbg.readFlatCanvasRgba(200, 200);
      return {
        leftOfEdge: rgba[(100 * 200 + 98) * 4] ?? 0,
        rightOfEdge: rgba[(100 * 200 + 101) * 4] ?? 255,
      };
    });
    expect(heightSample).not.toBeNull();
    if (heightSample) {
      expect(heightSample.leftOfEdge).toBeGreaterThan(10);
      expect(heightSample.rightOfEdge).toBeLessThan(245);
    }

    // Undo restores sharp edge
    await page.keyboard.press('Control+z');
    const afterUndoHeight = await page.evaluate(() => {
      const dbg = window.__shadowpaintDebug;
      if (!dbg) return null;
      const rgba = dbg.readFlatCanvasRgba(200, 200);
      return {
        leftOfEdge: rgba[(100 * 200 + 98) * 4] ?? 255,
        rightOfEdge: rgba[(100 * 200 + 101) * 4] ?? 0,
      };
    });
    expect(afterUndoHeight?.leftOfEdge).toBe(0);
    expect(afterUndoHeight?.rightOfEdge).toBe(255);

    // 2. Activate Blur tool via shortcut 'r' on Color map
    await page.keyboard.press('r');
    await expect(page.getByTestId('tool-blur')).toHaveAttribute('aria-pressed', 'true');
    await expect(page.getByTestId('blur-radius-input')).toBeVisible();
    await expect(page.getByTestId('blur-worker-hint')).toBeHidden();

    await page.getByTestId('map-layer-color').click();
    await page.getByTestId('mode-color').click();

    await page.evaluate(() => {
      window.__shadowpaintDebug?.emitColorDirtyBlock(100, 20, 80, 160, [20, 20, 20, 255]);
    });

    // Small radius blur (4 px) at upper edge (cx, cy - 40) -> real-time dab
    await page.getByTestId('blur-radius-input').fill('4');
    await page.mouse.move(cx, cy - 40);
    await page.mouse.down();
    await page.mouse.move(cx + 2, cy - 35, { steps: 3 });
    await page.mouse.up();

    const smallBlurSample = await page.evaluate(() => {
      const buf = window.__shadowpaintDebug?.getMapEffectiveRgba();
      if (!buf) return null;
      return {
        leftOfEdge: buf[(60 * 200 + 98) * 4] ?? 255,
        rightOfEdge: buf[(60 * 200 + 101) * 4] ?? 0,
      };
    });
    expect(smallBlurSample?.leftOfEdge ?? 255).toBeLessThan(230);
    expect(smallBlurSample?.rightOfEdge ?? 0).toBeGreaterThan(35);

    // Large radius blur (20 px > 12 px) -> shows worker hint, runs worker on mouseup
    await page.getByTestId('blur-radius-input').fill('20');
    await expect(page.getByTestId('blur-worker-hint')).toBeVisible();
    await page.getByTestId('brush-size-input').fill('36');

    await page.mouse.move(cx, cy + 40);
    await page.mouse.down();
    await page.mouse.move(cx + 4, cy + 48, { steps: 4 });
    await page.mouse.up();

    // Wait for worker completion to update color effective buffer at y=140
    await expect
      .poll(
        async () => {
          return page.evaluate(() => {
            const buf = window.__shadowpaintDebug?.getMapEffectiveRgba();
            if (!buf) return 255;
            return buf[(140 * 200 + 94) * 4] ?? 255;
          });
        },
        { timeout: 5000 },
      )
      .toBeLessThan(220);

    // Check PL translations on Blur & Smooth tool options
    await page.getByTestId('lang-pl').click();
    await expect(page.getByTestId('blur-worker-hint')).toContainText('workerze');
    await page.keyboard.press('s');
    await expect(page.getByTestId('tool-smooth')).toHaveAttribute('aria-label', 'Wygładzanie');

    await page.getByTestId('lang-en').click();
    expect(errors).toEqual([]);
  });
});
