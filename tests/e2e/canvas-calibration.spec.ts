import { expect, test } from '@playwright/test';

test('calibrates canvas cm without resampling and resizes px atomically via dialog', async ({
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

  // Create deterministic 20x20 cm, 200x200 px project
  await page.getByTestId('btn-new-project').click();
  await page.locator('#np-lock-aspect').uncheck();
  await page.locator('#np-width-cm').fill('20');
  await page.locator('#np-height-cm').fill('20');
  await page.locator('#np-px-cm').fill('10');
  await page.getByTestId('new-project-submit').click();
  await expect(page.getByRole('dialog')).toBeHidden();

  // Paint a red stroke on Color map so history is non-empty and pixel data differs from base
  await page.keyboard.press('1');
  await page.keyboard.press('b');
  await page.getByTestId('brush-color-hex').fill('#ff0000');
  await page.getByTestId('brush-color-hex').press('Enter');

  const canvasBox = await page.getByTestId('viewport-canvas-area').boundingBox();
  if (!canvasBox) throw new Error('Missing viewport-canvas-area bounding box');
  const cx = canvasBox.x + canvasBox.width / 2;
  const cy = canvasBox.y + canvasBox.height / 2;

  await page.mouse.move(cx - 10, cy);
  await page.mouse.down();
  await page.mouse.move(cx + 10, cy, { steps: 3 });
  await page.mouse.up();
  await expect(page.getByTestId('btn-undo')).toBeEnabled();

  // Open Canvas tab
  await page.getByTestId('right-tab-canvas').click();
  await expect(page.getByTestId('canvas-metrics-summary')).toContainText('200 × 200 px');
  await expect(page.getByTestId('canvas-metrics-summary')).toContainText('10.0 px/cm');

  // 1. Change cm only (20 -> 40 cm with lock aspect) — no resampling, preserves history & pixels
  await page.getByTestId('canvas-width-cm').fill('40');
  await page.getByTestId('canvas-width-cm').press('Enter');
  await expect(page.getByTestId('canvas-height-cm')).toHaveValue('40');
  await expect(page.getByTestId('canvas-px-cm')).toHaveValue('5');
  await page.getByTestId('btn-apply-canvas-resize').click();

  await expect(page.getByTestId('resize-project-dialog')).toBeHidden();
  await expect(page.getByTestId('btn-undo')).toBeEnabled();

  await expect
    .poll(async () => page.evaluate(() => window.__shadowpaintDebug?.getBuiltDimensions()))
    .toEqual({ widthPx: 200, heightPx: 200, widthCm: 40, heightCm: 40 });

  // Painted center pixel stays red
  const centerAfterCm = await page.evaluate(() => {
    const dbg = window.__shadowpaintDebug;
    if (!dbg) return 0;
    const rgba = dbg.readFlatCanvasRgba(200, 200);
    return rgba[(100 * 200 + 100) * 4] ?? 0;
  });
  expect(centerAfterCm).toBeGreaterThan(200);

  // 2. Thickness max mm updates HeightLegend
  await page.getByTestId('mode-height').click();
  await page.getByTestId('canvas-max-mm').fill('10');
  await page.getByTestId('canvas-max-mm').press('Enter');
  await expect(page.getByTestId('height-legend')).toContainText('0.0–10.0 mm');

  // 3. Resize pixel dimensions (200x200 -> 300x300) -> dialog confirmation + worker resample + clears history
  await page.getByTestId('canvas-width-px').fill('300');
  await page.getByTestId('canvas-width-px').press('Enter');
  await expect(page.getByTestId('canvas-height-px')).toHaveValue('300');
  await page.getByTestId('btn-apply-canvas-resize').click();

  await expect(page.getByTestId('resize-project-dialog')).toBeVisible();
  await expect(page.getByTestId('resize-confirm-submit')).toBeDisabled();
  await page.getByTestId('resize-confirm-checkbox').click();
  await expect(page.getByTestId('resize-confirm-submit')).toBeEnabled();
  await page.getByTestId('resize-confirm-submit').click();

  await expect(page.getByTestId('resize-project-dialog')).toBeHidden();
  await expect(page.getByTestId('btn-undo')).toBeDisabled();

  await expect
    .poll(async () => page.evaluate(() => window.__shadowpaintDebug?.getBuiltDimensions()))
    .toEqual({ widthPx: 300, heightPx: 300, widthCm: 40, heightCm: 40 });

  // Painted pixel remained red after resampling to 300x300
  await page.getByTestId('mode-color').click();
  const centerAfterPxResize = await page.evaluate(() => {
    const dbg = window.__shadowpaintDebug;
    if (!dbg) return { len: 0, r: 0 };
    const rgba = dbg.readFlatCanvasRgba(300, 300);
    return { len: rgba.length, r: rgba[(150 * 300 + 150) * 4] ?? 0 };
  });
  expect(centerAfterPxResize.len).toBe(300 * 300 * 4);
  expect(centerAfterPxResize.r).toBeGreaterThan(200);

  // 4. Mesh detail select updates grid/vertex readout
  await page.getByTestId('canvas-mesh-detail').click();
  await page.getByRole('option', { name: /512/ }).click();
  await expect(page.getByTestId('canvas-mesh-stats')).toContainText('512 × 512');

  expect(errors).toEqual([]);
});
