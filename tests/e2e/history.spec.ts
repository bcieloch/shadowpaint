import { expect, test } from '@playwright/test';

test('supports global undo/redo, per-map undo, and adjustment undo with keyboard shortcuts', async ({
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

  // Create deterministic 200x200 project
  await page.getByTestId('btn-new-project').click();
  await page.locator('#np-lock-aspect').uncheck();
  await page.locator('#np-width-cm').fill('20');
  await page.locator('#np-height-cm').fill('20');
  await page.locator('#np-px-cm').fill('10');
  await page.getByTestId('new-project-submit').click();
  await expect(page.getByRole('dialog')).toBeHidden();

  // Undo & Redo buttons start disabled
  await expect(page.getByTestId('btn-undo')).toBeDisabled();
  await expect(page.getByTestId('btn-redo')).toBeDisabled();
  await expect(page.getByTestId('map-undo-color')).toBeDisabled();
  await expect(page.getByTestId('map-undo-height')).toBeDisabled();

  const canvasBox = await page.getByTestId('viewport-canvas-area').boundingBox();
  if (!canvasBox) throw new Error('Missing viewport-canvas-area bounding box');
  const cx = canvasBox.x + canvasBox.width / 2;
  const cy = canvasBox.y + canvasBox.height / 2;

  // 1. Paint red stroke on Color map
  await page.keyboard.press('1');
  await page.keyboard.press('b');
  await page.getByTestId('mode-color').click();
  await page.getByTestId('brush-color-hex').fill('#ff0000');
  await page.getByTestId('brush-color-hex').press('Enter');

  await page.mouse.move(cx - 15, cy);
  await page.mouse.down();
  await page.mouse.move(cx + 15, cy, { steps: 4 });
  await page.mouse.up();

  await expect(page.getByTestId('btn-undo')).toBeEnabled();
  await expect(page.getByTestId('map-undo-color')).toBeEnabled();
  await expect(page.getByTestId('map-undo-height')).toBeDisabled();

  // 2. Paint height stroke on Height map
  await page.keyboard.press('2');
  await page.getByTestId('mode-height').click();
  await page.mouse.move(cx, cy - 15);
  await page.mouse.down();
  await page.mouse.move(cx, cy + 15, { steps: 4 });
  await page.mouse.up();

  await expect(page.getByTestId('map-undo-height')).toBeEnabled();

  const heightPainted = await page.evaluate(() => {
    const dbg = window.__shadowpaintDebug;
    if (!dbg) return 0;
    const rgba = dbg.readFlatCanvasRgba(200, 200);
    return rgba[(100 * 200 + 100) * 4] ?? 0;
  });
  expect(heightPainted).toBeGreaterThan(80);

  // 3. Per-map Undo on Color map without touching Height map!
  await page.getByTestId('map-undo-color').click();
  await expect(page.getByTestId('map-undo-color')).toBeDisabled();
  await expect(page.getByTestId('map-undo-height')).toBeEnabled();

  // Height pixel must still be painted
  const heightStillPainted = await page.evaluate(() => {
    const dbg = window.__shadowpaintDebug;
    if (!dbg) return 0;
    const rgba = dbg.readFlatCanvasRgba(200, 200);
    return rgba[(100 * 200 + 100) * 4] ?? 0;
  });
  expect(heightStillPainted).toBe(heightPainted);

  // Switch to Color view and confirm Color returned to base (#f4f1ea -> green ~241)
  await page.getByTestId('mode-color').click();
  const colorAfterPerMapUndo = await page.evaluate(() => {
    const dbg = window.__shadowpaintDebug;
    if (!dbg) return { r: 0, g: 0 };
    const rgba = dbg.readFlatCanvasRgba(200, 200);
    const i = (100 * 200 + 100) * 4;
    return { r: rgba[i] ?? 0, g: rgba[i + 1] ?? 0 };
  });
  expect(colorAfterPerMapUndo.g).toBeGreaterThan(200);

  // 4. Redo via TopBar button restores Color red stroke
  await page.getByTestId('btn-redo').click();
  const colorAfterRedo = await page.evaluate(() => {
    const dbg = window.__shadowpaintDebug;
    if (!dbg) return { r: 0, g: 0 };
    const rgba = dbg.readFlatCanvasRgba(200, 200);
    const i = (100 * 200 + 100) * 4;
    return { r: rgba[i] ?? 0, g: rgba[i + 1] ?? 0 };
  });
  expect(colorAfterRedo.r).toBeGreaterThan(200);
  expect(colorAfterRedo.g).toBeLessThan(80);

  // 5. Global Ctrl+Z undoes last action (Height stroke, seq=2) then Ctrl+Shift+Z redoes it
  await page.keyboard.press('Control+z');
  await page.getByTestId('mode-height').click();
  const heightAfterGlobalUndo = await page.evaluate(() => {
    const dbg = window.__shadowpaintDebug;
    if (!dbg) return 255;
    const rgba = dbg.readFlatCanvasRgba(200, 200);
    return rgba[(100 * 200 + 100) * 4] ?? 255;
  });
  expect(heightAfterGlobalUndo).toBe(0);

  await page.keyboard.press('Control+Shift+z');
  const heightAfterCtrlShiftZ = await page.evaluate(() => {
    const dbg = window.__shadowpaintDebug;
    if (!dbg) return 0;
    const rgba = dbg.readFlatCanvasRgba(200, 200);
    return rgba[(100 * 200 + 100) * 4] ?? 0;
  });
  expect(heightAfterCtrlShiftZ).toBe(heightPainted);

  // 6. Settings adjustment (Invert Height) undo/redo
  await page.locator('#height-invert').click();
  await expect(page.locator('#height-invert')).toBeChecked();
  await page.keyboard.press('Control+z');
  await expect(page.locator('#height-invert')).not.toBeChecked();

  expect(errors).toEqual([]);
});
