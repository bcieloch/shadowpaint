import { expect, test } from '@playwright/test';

test.describe('Split View (2D | 3D Scissor)', () => {
  test('renders independent 2D & 3D panes, mirrors 2D cursor to 3D, resizes & persists splitRatio, and paints live', async ({
    page,
  }) => {
    const errors: string[] = [];
    page.on('pageerror', (err) => errors.push(err.message));
    page.on('console', (msg) => {
      if (msg.type() === 'error') errors.push(msg.text());
    });

    await page.setViewportSize({ width: 1280, height: 800 });
    await page.goto('/');

    // Create deterministic 50x50 cm (200x200 px) project
    await page.getByTestId('btn-new-project').click();
    await page.locator('#np-name').fill('Split View Test');
    await page.locator('#np-lock-aspect').uncheck();
    await page.locator('#np-width-cm').fill('50');
    await page.locator('#np-height-cm').fill('50');
    await page.locator('#np-res-mode').click();
    await page.getByRole('option', { name: 'Width in px' }).click();
    await page.locator('#np-width-px').fill('200');
    await page.getByTestId('new-project-submit').click();
    await expect(page.getByRole('dialog')).toBeHidden();
    await page.waitForTimeout(80);

    // Lower meshDetail to 256 for fast deterministic 3D render
    await page.getByTestId('right-tab-canvas').click();
    await page.getByTestId('canvas-mesh-detail').click();
    await page.getByRole('option', { name: /^256 / }).click();

    // Paint distinct green color and raised center height for split checks
    await page.evaluate(() => {
      const dbg = window.__shadowpaintDebug;
      if (!dbg) return;
      dbg.emitColorDirtyBlock(0, 0, 200, 200, [20, 180, 70, 255]);
      dbg.emitHeightDirtyBlock(60, 60, 80, 80, 0.8);
    });
    await page.waitForTimeout(80);

    // Activate Split View via F3 shortcut
    await page.keyboard.press('F3');
    const canvasArea = page.getByTestId('viewport-canvas-area');
    await expect(canvasArea).toHaveAttribute('data-layout', 'split');
    await expect(page.getByTestId('layout-split')).toHaveAttribute('aria-pressed', 'true');
    await expect(page.getByTestId('split-divider')).toBeVisible();
    await expect(page.getByTestId('badge-relief-multiplier')).toBeVisible();

    // Independent mode switching: left 2D pane set to Height, right 3D pane set to Back lighting
    await page.getByTestId('mode-height').click();
    await expect(page.getByTestId('mode-height')).toHaveAttribute('aria-checked', 'true');
    await page.getByTestId('view3d-mode-back').click();
    await expect(page.getByTestId('view3d-mode-back')).toHaveAttribute('aria-checked', 'true');
    await page.waitForTimeout(100);

    const areaBox = await canvasArea.boundingBox();
    expect(areaBox).not.toBeNull();
    if (!areaBox) throw new Error('Missing viewport-canvas-area box');

    const rightBackPixel = await page.evaluate(
      ({ x, y }) => window.__shadowpaintDebug?.sampleRenderedPixel(x, y) ?? [0, 0, 0, 0],
      { x: Math.round(areaBox.width * 0.75), y: Math.round(areaBox.height * 0.5) },
    );

    // Switch 2D pane back to Color and right 3D pane to Front light -> left is green 2D, right is bright front-lit 3D
    await page.getByTestId('mode-color').click();
    await page.getByTestId('view3d-mode-front').click();
    await page.getByTestId('btn-zoom-fit').click();
    await page.waitForTimeout(100);

    const leftPixel = await page.evaluate(
      ({ x, y }) => window.__shadowpaintDebug?.sampleRenderedPixel(x, y) ?? [0, 0, 0, 0],
      { x: Math.round(areaBox.width * 0.25), y: Math.round(areaBox.height * 0.5) },
    );
    // Left pane displays solid green Color map (#14b446)
    expect(leftPixel[1]).toBeGreaterThan(150);
    expect(leftPixel[0]).toBeLessThan(60);

    const rightFrontPixel = await page.evaluate(
      ({ x, y }) => window.__shadowpaintDebug?.sampleRenderedPixel(x, y) ?? [0, 0, 0, 0],
      { x: Math.round(areaBox.width * 0.75), y: Math.round(areaBox.height * 0.5) },
    );
    expect(rightFrontPixel[3]).toBe(255);
    expect(rightFrontPixel[1]).toBeGreaterThan(rightBackPixel[1] + 40);

    // Hover over 2D left pane center -> 3D cursor marker must appear at raised surface height (z > 0.3 cm)
    await page.mouse.move(areaBox.x + areaBox.width * 0.25, areaBox.y + areaBox.height * 0.5);
    await page.waitForTimeout(80);
    const cursorStats2D = await page.evaluate(() => window.__shadowpaintDebug?.getCursor3DStats());
    expect(cursorStats2D?.visible).toBe(true);
    expect(cursorStats2D?.worldPos?.z ?? 0).toBeGreaterThan(0.3);

    // Move mouse over right 3D pane -> 3D cursor marker hides, StatusBar updates via 3D raycast
    await page.mouse.move(areaBox.x + areaBox.width * 0.75, areaBox.y + areaBox.height * 0.5);
    await page.waitForTimeout(80);
    const cursorStats3D = await page.evaluate(() => window.__shadowpaintDebug?.getCursor3DStats());
    expect(cursorStats3D?.visible).toBe(false);
    await expect(page.getByTestId('readout-coords')).toContainText('px');

    // Drag split divider to ~0.35 and verify aria-valuenow + persistence across reload
    const divider = page.getByTestId('split-divider');
    const divBox = await divider.boundingBox();
    expect(divBox).not.toBeNull();
    if (!divBox) throw new Error('Missing split-divider box');

    const divCenterX = divBox.x + divBox.width / 2;
    const divCenterY = divBox.y + divBox.height / 2;
    const targetDivX = areaBox.x + areaBox.width * 0.35;
    await page.mouse.move(divCenterX, divCenterY);
    await page.mouse.down();
    await page.mouse.move(targetDivX, divCenterY, { steps: 6 });
    await page.mouse.up();
    await page.waitForTimeout(80);

    const updatedRatio = Number(await divider.getAttribute('aria-valuenow'));
    expect(updatedRatio).toBeGreaterThanOrEqual(30);
    expect(updatedRatio).toBeLessThanOrEqual(40);

    // Paint on 2D left pane in split mode (Brush on Color map) -> verify effective buffer updates
    await page.keyboard.press('1');
    await page.keyboard.press('b');
    await page.getByTestId('brush-color-hex').fill('#ff2200');
    await page.getByTestId('brush-color-hex').press('Enter');

    const newDivBox = await divider.boundingBox();
    const leftPaneWidth = newDivBox ? newDivBox.x + newDivBox.width / 2 - areaBox.x : areaBox.width * 0.35;
    await page.getByTestId('btn-zoom-fit').click();
    await page.waitForTimeout(60);

    const paintX = areaBox.x + leftPaneWidth * 0.5;
    const paintY = areaBox.y + areaBox.height * 0.5;
    await page.mouse.move(paintX - 8, paintY);
    await page.mouse.down();
    await page.mouse.move(paintX + 8, paintY, { steps: 4 });
    await page.mouse.up();
    await page.waitForTimeout(100);

    const paintedCenter = await page.evaluate(() => {
      const buf = window.__shadowpaintDebug?.getMapEffectiveRgba();
      if (!buf || buf.length < 200 * 200 * 4) return null;
      const idx = (100 * 200 + 100) * 4;
      return { r: buf[idx], g: buf[idx + 1], b: buf[idx + 2] };
    });
    expect(paintedCenter?.r ?? 0).toBeGreaterThan(200);

    // Verify PL locale switch updates Split button cleanly
    await page.getByTestId('lang-pl').click();
    await expect(page.getByTestId('layout-split')).toContainText('Podzielony');
    await page.getByTestId('lang-en').click();
    await expect(page.getByTestId('layout-split')).toContainText('Split');

    // Reload page and confirm splitRatio was persisted
    await page.reload();
    const discardBtn = page.getByTestId('restore-session-discard');
    try {
      await discardBtn.waitFor({ state: 'visible', timeout: 3000 });
      await discardBtn.click();
      await expect(page.getByTestId('restore-session-dialog')).toBeHidden();
    } catch {
      // No autosaved session prompt if reload beat the 2s debounce
    }
    await page.getByTestId('layout-split').click();
    await expect(page.getByTestId('viewport-canvas-area')).toHaveAttribute('data-layout', 'split');
    const persistedRatio = Number(await page.getByTestId('split-divider').getAttribute('aria-valuenow'));
    expect(persistedRatio).toBeGreaterThanOrEqual(30);
    expect(persistedRatio).toBeLessThanOrEqual(40);

    expect(errors).toEqual([]);
  });
});
