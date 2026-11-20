import { expect, test } from '@playwright/test';

test.describe('Selection & Protection Mask', () => {
  test('supports shape/wand/mask-brush tools, protect vs editInside painting, feather/invert/clear, and undo/redo', async ({
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
    await page.locator('#np-name').fill('Selection Test');
    await page.locator('#np-lock-aspect').uncheck();
    await page.locator('#np-width-cm').fill('10');
    await page.locator('#np-height-cm').fill('10');
    await page.locator('#np-res-mode').click();
    await page.getByRole('option', { name: 'Width in px' }).click();
    await page.locator('#np-width-px').fill('200');
    await page.getByTestId('new-project-submit').click();
    await expect(page.getByRole('dialog')).toBeHidden();

    // Switch viewport to 1:1 centered so image coordinates align predictably around viewport center
    await page.getByTestId('btn-zoom-100').click();
    await expect(page.getByTestId('viewport-zoom-pct')).toHaveText('100%');
    await page.getByTestId('mode-color').click();

    const canvasArea = page.getByTestId('viewport-canvas-area');
    const box = await canvasArea.boundingBox();
    expect(box).not.toBeNull();
    if (!box) return;

    const cx = box.x + box.width / 2;
    const cy = box.y + box.height / 2;
    // Image top-left at 100% zoom is centered: image x=100 -> cx, image y=100 -> cy
    // Image spans [cx - 100 .. cx + 100] x [cy - 100 .. cy + 100]

    // 1. Select left half [20..90, 40..160] using Rectangle Select (M)
    await page.getByTestId('tool-selectRect').click();
    await page.mouse.move(cx - 80, cy - 60);
    await page.mouse.down();
    await page.mouse.move(cx - 10, cy + 60, { steps: 6 });
    await page.mouse.up();

    const rectStats = await page.evaluate(() => window.__shadowpaintDebug?.getSelectionStats());
    expect(rectStats?.hasSelection).toBe(true);
    expect(rectStats?.selectedPixels).toBeGreaterThan(5000);
    expect(rectStats?.mode).toBe('protect');

    // Verify red mask overlay renders distinctly over selected vs unselected area in COLOR mode
    const overlayDiff = await page.evaluate(() => {
      const dbg = window.__shadowpaintDebug;
      if (!dbg) return null;
      const rgba = dbg.readFlatCanvasRgba(200, 200);
      const selIdx = (100 * 200 + 50) * 4;
      const unselIdx = (100 * 200 + 150) * 4;
      return {
        sel: [rgba[selIdx], rgba[selIdx + 1], rgba[selIdx + 2]],
        unsel: [rgba[unselIdx], rgba[unselIdx + 1], rgba[unselIdx + 2]],
      };
    });
    expect(overlayDiff).not.toBeNull();
    if (overlayDiff) {
      // Selected pixel should have lower green/blue due to translucent red mask tint
      expect(overlayDiff.sel[1] ?? 255).toBeLessThan(overlayDiff.unsel[1] ?? 0);
    }

    // 2. Add ellipse on bottom-right using Add combine mode
    await page.getByTestId('selection-combine-add').click();
    await page.getByTestId('tool-selectEllipse').click();
    await page.mouse.move(cx + 20, cy + 20);
    await page.mouse.down();
    await page.mouse.move(cx + 70, cy + 70, { steps: 6 });
    await page.mouse.up();

    const afterAddStats = await page.evaluate(() => window.__shadowpaintDebug?.getSelectionStats());
    expect(afterAddStats?.selectedPixels ?? 0).toBeGreaterThan(rectStats?.selectedPixels ?? 0);

    // 3. Undo ellipse back to rectangle, switch to Brush and test Protect mode
    await page.keyboard.press('Control+z');
    const afterUndoEllipse = await page.evaluate(() =>
      window.__shadowpaintDebug?.getSelectionStats(),
    );
    expect(afterUndoEllipse?.selectedPixels).toBe(rectStats?.selectedPixels);

    // Select Color map + Brush with bright blue #1155ff
    await page.getByTestId('map-layer-color').click();
    await page.getByTestId('tool-brush').click();
    await expect(page.getByTestId('selection-active-strip')).toBeVisible();
    await page.getByTestId('brush-color-hex').fill('#1155ff');
    await page.getByTestId('brush-color-hex').press('Enter');

    // Paint horizontal stroke across protected pixel (x=50, y=100) and unprotected pixel (x=150, y=100)
    await page.mouse.move(cx - 60, cy);
    await page.mouse.down();
    await page.mouse.move(cx + 60, cy, { steps: 10 });
    await page.mouse.up();

    const protectPaint = await page.evaluate(() => {
      const buf = window.__shadowpaintDebug?.getMapEffectiveRgba();
      if (!buf) return null;
      const prot = (100 * 200 + 50) * 4;
      const free = (100 * 200 + 150) * 4;
      return {
        prot: [buf[prot], buf[prot + 1], buf[prot + 2]],
        free: [buf[free], buf[free + 1], buf[free + 2]],
      };
    });
    // Protected pixel remains base paper color #F4F1EA [244,241,234], unprotected pixel became blue-ish
    expect(protectPaint?.prot).toEqual([244, 241, 234]);
    expect(protectPaint?.free[2] ?? 0).toBeGreaterThan(200);
    expect(protectPaint?.free[0] ?? 255).toBeLessThan(150);

    // 4. Switch to Edit Inside mode from the active selection strip -> paint stroke on x=50..150 again
    await page.getByTestId('selection-mode-editInside').click();
    await page.getByTestId('brush-color-hex').fill('#22aa33');
    await page.getByTestId('brush-color-hex').press('Enter');

    await page.mouse.move(cx - 60, cy);
    await page.mouse.down();
    await page.mouse.move(cx + 60, cy, { steps: 10 });
    await page.mouse.up();

    const editInsidePaint = await page.evaluate(() => {
      const buf = window.__shadowpaintDebug?.getMapEffectiveRgba();
      if (!buf) return null;
      const inside = (100 * 200 + 50) * 4;
      const outside = (100 * 200 + 150) * 4;
      return {
        inside: [buf[inside], buf[inside + 1], buf[inside + 2]],
        outside: [buf[outside], buf[outside + 1], buf[outside + 2]],
      };
    });
    // Inside mask became green-ish, outside kept previous blue color!
    expect(editInsidePaint?.inside[1] ?? 0).toBeGreaterThan(editInsidePaint?.inside[0] ?? 255);
    expect(editInsidePaint?.outside[2] ?? 0).toBeGreaterThan(200);
    expect(editInsidePaint?.outside[1] ?? 255).toBeLessThan(150);

    // 5. Mask Brush paint & feather & invert & clear + Magic Wand
    await page.getByTestId('tool-maskBrush').click();
    await page.mouse.move(cx + 50, cy - 50);
    await page.mouse.down();
    await page.mouse.move(cx + 50, cy - 50);
    await page.mouse.up();

    const afterMaskBrush = await page.evaluate(() =>
      window.__shadowpaintDebug?.getSelectionStats(),
    );
    expect(afterMaskBrush?.selectedPixels ?? 0).toBeGreaterThan(rectStats?.selectedPixels ?? 0);

    await page.getByTestId('selection-feather-input').fill('4');
    await page.getByTestId('selection-feather-apply').click();
    await page.waitForTimeout(100);

    await page.getByTestId('selection-action-invert').click();
    await page.getByTestId('selection-action-clear').click();
    const clearedStats = await page.evaluate(() => window.__shadowpaintDebug?.getSelectionStats());
    expect(clearedStats?.hasSelection).toBe(false);

    // Magic wand click on painted blue area at (cx + 50, cy)
    await page.getByTestId('tool-magicWand').click();
    await page.getByTestId('selection-combine-replace').click();
    await page.mouse.click(cx + 50, cy);
    await page.waitForTimeout(120);

    const wandStats = await page.evaluate(() => window.__shadowpaintDebug?.getSelectionStats());
    expect(wandStats?.hasSelection).toBe(true);
    expect(wandStats?.selectedPixels).toBeGreaterThan(100);

    // Ctrl+D clears selection; Ctrl+Z brings it back
    await page.keyboard.press('Control+d');
    const afterCtrlD = await page.evaluate(() => window.__shadowpaintDebug?.getSelectionStats());
    expect(afterCtrlD?.hasSelection).toBe(false);

    await page.keyboard.press('Control+z');
    const afterUndoCtrlD = await page.evaluate(() =>
      window.__shadowpaintDebug?.getSelectionStats(),
    );
    expect(afterUndoCtrlD?.hasSelection).toBe(true);

    // Verify PL translation works cleanly on selection options
    await page.getByTestId('lang-pl').click();
    await expect(page.getByTestId('selection-mode-protect')).toHaveText('Chroń maskę');
    await page.getByTestId('lang-en').click();
    await expect(page.getByTestId('selection-mode-protect')).toHaveText('Protect mask');

    expect(errors).toEqual([]);
  });
});
