import { expect, test } from '@playwright/test';

function averageRegionLuminance(
  rgba: Uint8Array,
  imgW: number,
  x0: number,
  y0: number,
  w: number,
  h: number,
): number {
  let sum = 0;
  let count = 0;
  for (let y = y0; y < y0 + h; y++) {
    for (let x = x0; x < x0 + w; x++) {
      const idx = (y * imgW + x) * 4;
      const r = rgba[idx] ?? 0;
      const g = rgba[idx + 1] ?? 0;
      const b = rgba[idx + 2] ?? 0;
      sum += 0.2126 * r + 0.7152 * g + 0.0722 * b;
      count++;
    }
  }
  return count > 0 ? sum / count : 0;
}

function averageRegionRgb(
  rgba: Uint8Array,
  imgW: number,
  x0: number,
  y0: number,
  w: number,
  h: number,
): { r: number; g: number; b: number } {
  let rSum = 0;
  let gSum = 0;
  let bSum = 0;
  let count = 0;
  for (let y = y0; y < y0 + h; y++) {
    for (let x = x0; x < x0 + w; x++) {
      const idx = (y * imgW + x) * 4;
      rSum += rgba[idx] ?? 0;
      gSum += rgba[idx + 1] ?? 0;
      bSum += rgba[idx + 2] ?? 0;
      count++;
    }
  }
  return count > 0 ? { r: rSum / count, g: gSum / count, b: bSum / count } : { r: 0, g: 0, b: 0 };
}

test.describe('Front Light & Directional Shadows', () => {
  test('casts relief shadows matching lamp direction, toggles shadows and gizmos, syncs Cartesian/Polar, and supports undo/redo', async ({
    page,
  }) => {
    const errors: string[] = [];
    page.on('pageerror', (err) => errors.push(err.message));
    page.on('console', (msg) => {
      if (msg.type() === 'error') errors.push(msg.text());
    });

    await page.setViewportSize({ width: 1280, height: 800 });
    await page.goto('/');

    // Create 50x50 cm (200x200 px, 4 px/cm) project for deterministic E2E render & readback
    await page.getByTestId('btn-new-project').click();
    await page.locator('#np-name').fill('Front Light Test');
    await page.locator('#np-lock-aspect').uncheck();
    await page.locator('#np-width-cm').fill('50');
    await page.locator('#np-height-cm').fill('50');
    await page.locator('#np-res-mode').click();
    await page.getByRole('option', { name: 'Width in px' }).click();
    await page.locator('#np-width-px').fill('200');
    await page.getByTestId('new-project-submit').click();
    await expect(page.getByRole('dialog')).toBeHidden();
    await page.waitForTimeout(80);

    // Lower meshDetail to 256 for fast software WebGL2 shadow rendering, and set Relief x10 (5 cm block height -> ~22 px shadow)
    await page.getByTestId('right-tab-canvas').click();
    await page.getByTestId('canvas-mesh-detail').click();
    await page.getByRole('option', { name: /^256 / }).click();
    await page.getByLabel('Relief multiplier').fill('10');

    // Create a raised block in the center of the height map (x: 85..115, y: 85..115)
    await page.evaluate(() => {
      window.__shadowpaintDebug?.emitHeightDirtyBlock(85, 85, 30, 30, 1.0);
    });
    await page.waitForTimeout(80);

    // Switch to 2D FRONT view via toolbar toggle (mode-front)
    await page.getByTestId('mode-front').click();
    await expect(page.getByTestId('mode-front')).toHaveAttribute('aria-checked', 'true');

    // Open Light tab in RightPanel
    await page.getByTestId('right-tab-light').click();
    await expect(page.getByTestId('coord-mode-cartesian')).toBeVisible();

    // Place lamp above top-left (x=-35 cm, heightAboveTop=35 cm, distance=55 cm)
    // Top-left lamp casts shadow ~22 px toward bottom-right -> patch (118..134, 118..134) is in shadow!
    const xInput = page.getByTestId('front-x-cm');
    const yAboveInput = page.getByTestId('front-height-above-cm');
    const distInput = page.getByTestId('front-distance-cm');

    await xInput.fill('-35');
    await xInput.press('Enter');
    await yAboveInput.fill('35');
    await yAboveInput.press('Enter');
    await distInput.fill('55');
    await distInput.press('Enter');
    await page.waitForTimeout(120);

    const frameTopLeftLamp = await page.evaluate(() =>
      Array.from(window.__shadowpaintDebug?.readFlatCanvasRgba(200, 200) ?? []),
    );
    const rgbaTopLeft = new Uint8Array(frameTopLeftLamp);

    const topLeftLit = averageRegionLuminance(rgbaTopLeft, 200, 66, 66, 16, 16);
    const bottomRightShadow = averageRegionLuminance(rgbaTopLeft, 200, 118, 118, 16, 16);
    expect(topLeftLit - bottomRightShadow).toBeGreaterThan(35);

    // Switch to Polar mode -> check incidence & azimuth reflect top-left position, then flip azimuth to bottom-right (+135 deg)
    await page.getByTestId('coord-mode-polar').click();
    const initialAzimuth = Number(await page.getByTestId('front-azimuth-deg').inputValue());
    expect(initialAzimuth).toBeLessThan(0);
    expect(initialAzimuth).toBeGreaterThan(-90);

    const azimuthInput = page.getByTestId('front-azimuth-deg');
    await azimuthInput.fill('135');
    await azimuthInput.press('Enter');
    await page.waitForTimeout(120);

    // Switch back to Cartesian and verify xCm & heightAboveTopCm updated symmetrically
    await page.getByTestId('coord-mode-cartesian').click();
    const syncedX = Number(await page.getByTestId('front-x-cm').inputValue());
    const syncedHeightAbove = Number(await page.getByTestId('front-height-above-cm').inputValue());
    expect(syncedX).toBeGreaterThan(30);
    expect(syncedHeightAbove).toBeLessThan(-50);

    const frameBottomRightLamp = await page.evaluate(() =>
      Array.from(window.__shadowpaintDebug?.readFlatCanvasRgba(200, 200) ?? []),
    );
    const rgbaBottomRight = new Uint8Array(frameBottomRightLamp);

    // With lamp at bottom-right, cast shadow flips to top-left patch (66..82, 66..82)!
    const topLeftShadow = averageRegionLuminance(rgbaBottomRight, 200, 66, 66, 16, 16);
    const bottomRightLit = averageRegionLuminance(rgbaBottomRight, 200, 118, 118, 16, 16);
    expect(bottomRightLit - topLeftShadow).toBeGreaterThan(35);

    // Toggle castShadows OFF -> cast shadow on (66..82, 66..82) disappears completely
    await page.getByTestId('front-cast-shadows').click();
    await page.waitForTimeout(120);
    const frameShadowsOff = await page.evaluate(() =>
      Array.from(window.__shadowpaintDebug?.readFlatCanvasRgba(200, 200) ?? []),
    );
    const topLeftNoShadow = averageRegionLuminance(
      new Uint8Array(frameShadowsOff),
      200,
      66,
      66,
      16,
      16,
    );
    expect(topLeftNoShadow - topLeftShadow).toBeGreaterThan(35);

    // Undo should restore castShadows = true
    await page.getByTestId('btn-undo').click();
    await page.waitForTimeout(120);
    const statsAfterUndo = await page.evaluate(() =>
      window.__shadowpaintDebug?.getFrontLightStats(),
    );
    expect(statsAfterUndo?.castShadow).toBe(true);

    // Switch color to RGB and set a warm red-orange tint -> rendered canvas reflects warm tint
    await page.getByTestId('front-color-rgb').click();
    const hexInput = page.getByTestId('front-rgb-hex');
    await hexInput.fill('#ff5522');
    await hexInput.press('Enter');
    await page.waitForTimeout(120);

    const frameWarm = await page.evaluate(() =>
      Array.from(window.__shadowpaintDebug?.readFlatCanvasRgba(200, 200) ?? []),
    );
    const warmRgb = averageRegionRgb(new Uint8Array(frameWarm), 200, 125, 125, 25, 25);
    expect(warmRgb.r - warmRgb.b).toBeGreaterThan(40);

    // Switch to 3D mode via TopBar button and verify lamp gizmo toggle & stats
    await page.getByTestId('layout-3d').click();
    await expect(page.getByTestId('btn-toggle-gizmos')).toBeVisible();
    await page.waitForTimeout(100);

    const gizmoOnStats = await page.evaluate(() => window.__shadowpaintDebug?.getFrontLightStats());
    expect(gizmoOnStats?.gizmoVisible).toBe(true);

    await page.getByTestId('btn-toggle-gizmos').click();
    await page.waitForTimeout(80);

    const gizmoOffStats = await page.evaluate(() =>
      window.__shadowpaintDebug?.getFrontLightStats(),
    );
    expect(gizmoOffStats?.gizmoVisible).toBe(false);

    // Also verify Shift+4 shortcut switches back to FRONT view after returning to 2D
    await page.keyboard.press('F1');
    await page.getByTestId('mode-color').click();
    await page.keyboard.press('Shift+Digit4');
    await expect(page.getByTestId('mode-front')).toHaveAttribute('aria-checked', 'true');

    expect(errors).toEqual([]);
  });
});
