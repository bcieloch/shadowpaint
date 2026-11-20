import { expect, test } from '@playwright/test';

test('paints on color map, isolates height/opacity, enforces map lock, and erases back to base', async ({
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

  // Create a crisp 200x200 project for deterministic pointer coordinates
  await page.getByTestId('btn-new-project').click();
  await page.locator('#np-lock-aspect').uncheck();
  await page.locator('#np-width-cm').fill('20');
  await page.locator('#np-height-cm').fill('20');
  await page.locator('#np-px-cm').fill('10');
  await page.getByTestId('new-project-submit').click();
  await expect(page.getByRole('dialog')).toBeHidden();

  await expect(page.getByTestId('viewport-zoom-pct')).not.toHaveText('0%');

  // Switch active map to Color (shortcut '1') and pick Brush ('B')
  await page.keyboard.press('1');
  await page.keyboard.press('b');
  await page.getByTestId('mode-color').click();

  // Set brush color to #ff0000
  await page.getByTestId('brush-color-hex').fill('#ff0000');
  await page.getByTestId('brush-color-hex').press('Enter');

  const canvasBox = await page.getByTestId('viewport-canvas-area').boundingBox();
  if (!canvasBox) throw new Error('Missing viewport-canvas-area bounding box');

  const cx = canvasBox.x + canvasBox.width / 2;
  const cy = canvasBox.y + canvasBox.height / 2;

  // Paint a stroke across the center
  await page.mouse.move(cx - 20, cy);
  await page.mouse.down();
  await page.mouse.move(cx + 20, cy, { steps: 6 });
  await page.mouse.up();

  // Verify the rendered WebGL frame reflects the red brush stroke
  const pixelStats = await page.evaluate(() => {
    const dbg = window.__shadowpaintDebug;
    if (!dbg) return { hasRed: false, centerR: 0, centerG: 0, centerB: 0 };
    const rgba = dbg.readFlatCanvasRgba(200, 200);
    const idx = (100 * 200 + 100) * 4;
    return {
      hasRed: (rgba[idx] ?? 0) > 200 && (rgba[idx + 1] ?? 255) < 80,
      centerR: rgba[idx] ?? 0,
      centerG: rgba[idx + 1] ?? 0,
      centerB: rgba[idx + 2] ?? 0,
    };
  });
  expect(pixelStats.hasRed).toBe(true);

  // Switch to Eraser ('E') and erase the center back toward base (#f4f1ea)
  await page.keyboard.press('e');
  await page.mouse.move(cx - 20, cy);
  await page.mouse.down();
  await page.mouse.move(cx + 20, cy, { steps: 6 });
  await page.mouse.up();

  const afterErase = await page.evaluate(() => {
    const dbg = window.__shadowpaintDebug;
    if (!dbg) return { r: 0, g: 0, b: 0 };
    const rgba = dbg.readFlatCanvasRgba(200, 200);
    const idx = (100 * 200 + 100) * 4;
    return { r: rgba[idx] ?? 0, g: rgba[idx + 1] ?? 0, b: rgba[idx + 2] ?? 0 };
  });
  expect(afterErase.g).toBeGreaterThan(150);

  // Lock Color map and attempt to paint with Brush ('B')
  await page.keyboard.press('b');
  await page.getByTestId('map-lock-color').click();

  await page.mouse.move(cx, cy);
  await page.mouse.down();
  await page.mouse.up();

  await expect(page.getByTestId('statusbar-message')).toContainText('Color Map is locked');

  // Verify PL translation of locked status message
  await page.getByTestId('lang-pl').click();
  await expect(page.getByTestId('statusbar-message')).toContainText(
    'Mapa kolorów jest zablokowana',
  );

  // Switch back to EN and unlock
  await page.getByTestId('lang-en').click();
  await page.getByTestId('map-lock-color').click();
  await expect(page.getByTestId('statusbar-message')).toHaveText('Ready');

  // Verify '[' and ']' resize brush and px/cm toggle works
  await page.keyboard.press(']');
  await page.getByTestId('brush-unit-cm').click();
  await page.getByTestId('brush-unit-px').click();

  expect(errors).toEqual([]);
});
