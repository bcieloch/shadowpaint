import { expect, test } from '@playwright/test';

test.describe('Ruler Measurement Tool', () => {
  test('activates via U, draws overlay measurement, snaps with Shift, drags endpoints, clears, and translates EN/PL', async ({
    page,
  }) => {
    const errors: string[] = [];
    page.on('pageerror', (err) => errors.push(err.message));
    page.on('console', (msg) => {
      if (msg.type() === 'error') errors.push(msg.text());
    });

    await page.setViewportSize({ width: 1280, height: 800 });
    await page.goto('/');

    // Activate ruler via U shortcut
    await page.keyboard.press('u');
    await expect(page.getByTestId('tool-ruler')).toHaveAttribute('aria-pressed', 'true');
    await expect(page.getByTestId('ruler-empty')).toBeVisible();

    const viewport = page.getByTestId('viewport-canvas-area');
    const box = await viewport.boundingBox();
    expect(box).not.toBeNull();
    if (!box) return;

    const x0 = box.x + Math.round(box.width * 0.35);
    const y0 = box.y + Math.round(box.height * 0.4);
    const x1 = box.x + Math.round(box.width * 0.65);
    const y1 = box.y + Math.round(box.height * 0.6);

    // Draw initial diagonal ruler line
    await page.mouse.move(x0, y0);
    await page.mouse.down();
    await page.mouse.move(x1, y1, { steps: 6 });
    await page.mouse.up();

    await expect(page.getByTestId('ruler-readout')).toBeVisible();
    const initialCmText = await page.getByTestId('ruler-length-cm').innerText();
    const initialCm = Number.parseFloat(initialCmText);
    expect(initialCm).toBeGreaterThan(5);

    // Verify cyan ruler graphics rendered on the 2D overlay canvas
    const cyanHits = await page.evaluate(() => {
      const c = document.querySelector('[data-testid="viewport-overlay-canvas"]');
      if (!(c instanceof HTMLCanvasElement)) return 0;
      const ctx = c.getContext('2d');
      if (!ctx) return 0;
      const img = ctx.getImageData(40, 40, c.width - 80, c.height - 80).data;
      let hits = 0;
      for (let i = 0; i < img.length; i += 4) {
        const r = img[i] ?? 0;
        const g = img[i + 1] ?? 0;
        const b = img[i + 2] ?? 0;
        const a = img[i + 3] ?? 0;
        if (a > 80 && b > 180 && g > 140 && b > r + 80) hits++;
      }
      return hits;
    });
    expect(cyanHits).toBeGreaterThan(20);

    // Drag endpoint p1 with Shift held slightly off horizontal to snap cleanly to 0.0°
    await page.mouse.move(x1, y1);
    await page.mouse.down();
    await page.keyboard.down('Shift');
    await page.mouse.move(x1 + 35, y0 + 5, { steps: 5 });
    await page.mouse.up();
    await page.keyboard.up('Shift');

    await expect(page.getByTestId('ruler-angle')).toHaveText(/^-?0\.0°$/);

    // Switch to Polish UI and verify ruler translations
    await page.getByTestId('lang-pl').click();
    await expect(page.getByText('Długość')).toBeVisible();
    await expect(page.getByTestId('btn-ruler-clear')).toContainText('Wyczyść pomiar');

    // Clear measurement via button
    await page.getByTestId('btn-ruler-clear').click();
    await expect(page.getByTestId('ruler-empty')).toBeVisible();

    expect(errors).toEqual([]);
  });
});
