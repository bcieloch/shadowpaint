import { expect, test } from '@playwright/test';

function countNonBackgroundPixels(rgba: Uint8Array): number {
  let count = 0;
  for (let i = 0; i < rgba.length; i += 4) {
    const r = rgba[i] ?? 0;
    const g = rgba[i + 1] ?? 0;
    const b = rgba[i + 2] ?? 0;
    if (Math.abs(r - 18) > 4 || Math.abs(g - 18) > 4 || Math.abs(b - 20) > 4) {
      count++;
    }
  }
  return count;
}

function countChangedPixels(a: Uint8Array, b: Uint8Array, channelThreshold = 4): number {
  let changed = 0;
  const n = Math.min(a.length, b.length);
  for (let i = 0; i < n; i += 4) {
    const dr = Math.abs((a[i] ?? 0) - (b[i] ?? 0));
    const dg = Math.abs((a[i + 1] ?? 0) - (b[i + 1] ?? 0));
    const db = Math.abs((a[i + 2] ?? 0) - (b[i + 2] ?? 0));
    if (Math.max(dr, dg, db) > channelThreshold) {
      changed++;
    }
  }
  return changed;
}

test.describe('3D Relief Geometry & View', () => {
  test('switches 2D/3D, renders 50x70 canvas with stretcher frame and relief badge, updates live on height paint, and cleans GPU resources across project cycles', async ({
    page,
  }) => {
    const errors: string[] = [];
    page.on('pageerror', (err) => errors.push(err.message));
    page.on('console', (msg) => {
      if (msg.type() === 'error') errors.push(msg.text());
    });

    await page.setViewportSize({ width: 1280, height: 800 });
    await page.goto('/');

    // Create a smaller 50x70 cm project (250x350 px, 5:7 aspect) for fast readback
    await page.getByTestId('btn-new-project').click();
    await page.locator('#np-name').fill('Relief 3D');
    await page.locator('#np-lock-aspect').uncheck();
    await page.locator('#np-width-cm').fill('50');
    await page.locator('#np-height-cm').fill('70');
    await page.locator('#np-res-mode').click();
    await page.getByRole('option', { name: 'Width in px' }).click();
    await page.locator('#np-width-px').fill('250');
    await page.getByTestId('new-project-submit').click();
    await expect(page.getByRole('dialog')).toBeHidden();
    await page.waitForTimeout(80);

    // Lower meshDetail to 256 so software WebGL2 in CI renders instantly after verifying default 1024
    await page.getByTestId('right-tab-canvas').click();
    await expect(page.getByTestId('canvas-mesh-stats')).toContainText('1024 segments');
    await page.getByTestId('canvas-mesh-detail').click();
    await page.getByRole('option', { name: /^256 / }).click();
    await expect(page.getByTestId('canvas-mesh-stats')).toContainText('256 segments');

    // Switch to 3D via TopBar button
    await page.getByTestId('layout-3d').click();
    await expect(page.getByTestId('badge-relief-multiplier')).toHaveText('Relief ×1');
    await expect(page.getByTestId('btn-reset-view-3d')).toBeVisible();
    await expect(page.getByTestId('btn-toggle-frame')).toBeVisible();
    await expect(page.getByTestId('viewport-overlay-canvas')).toBeHidden();

    const initialStats = await page.evaluate(() => window.__shadowpaintDebug?.get3DStats());
    expect(initialStats).not.toBeNull();
    expect(initialStats?.boundingBoxSizeCm.x).toBeCloseTo(50, 4);
    expect(initialStats?.boundingBoxSizeCm.y).toBeCloseTo(70, 4);
    expect(initialStats?.displacement.maxDisplacementCm).toBeCloseTo(0.5, 4);
    expect(initialStats?.frameVisible).toBe(true);

    const beforePaintFrame = await page.evaluate(() =>
      Array.from(window.__shadowpaintDebug?.read3DViewportRgba(160, 160) ?? []),
    );
    expect(countNonBackgroundPixels(new Uint8Array(beforePaintFrame))).toBeGreaterThan(2000);

    // Switch back to 2D via F1, paint height in center, and switch back to 3D via F2
    await page.keyboard.press('F1');
    await expect(page.getByTestId('mode-color')).toBeVisible();

    const canvasArea = page.getByTestId('viewport-canvas-area');
    const box = await canvasArea.boundingBox();
    expect(box).not.toBeNull();
    if (box) {
      const cx = box.x + box.width / 2;
      const cy = box.y + box.height / 2;
      await page.mouse.move(cx - 50, cy - 30);
      await page.mouse.down();
      await page.mouse.move(cx + 50, cy + 30, { steps: 6 });
      await page.mouse.up();
    }

    await page.keyboard.press('F2');
    await expect(page.getByTestId('badge-relief-multiplier')).toBeVisible();
    await page.waitForTimeout(80);

    // Adjust reliefMultiplier in Canvas tab -> badge, displacement, and 3D render update
    await page.getByLabel('Relief multiplier', { exact: true }).fill('9');
    await expect(page.getByTestId('badge-relief-multiplier')).toHaveText('Relief ×9');

    const scaledStats = await page.evaluate(() => window.__shadowpaintDebug?.get3DStats());
    expect(scaledStats?.displacement.maxDisplacementCm).toBeCloseTo((5 / 10) * 9, 4);

    const afterReliefFrame = await page.evaluate(() =>
      Array.from(window.__shadowpaintDebug?.read3DViewportRgba(160, 160) ?? []),
    );
    expect(
      countChangedPixels(new Uint8Array(beforePaintFrame), new Uint8Array(afterReliefFrame)),
    ).toBeGreaterThan(50);

    // Live height mutation while already in 3D updates 3D rendering immediately
    await page.evaluate(() => {
      window.__shadowpaintDebug?.emitHeightDirtyBlock(40, 40, 170, 220, 1.0);
    });
    await page.waitForTimeout(80);

    const afterLiveHeightFrame = await page.evaluate(() =>
      Array.from(window.__shadowpaintDebug?.read3DViewportRgba(160, 160) ?? []),
    );
    expect(
      countChangedPixels(new Uint8Array(afterReliefFrame), new Uint8Array(afterLiveHeightFrame)),
    ).toBeGreaterThan(50);

    // Orbit 3D camera so side stretcher frame is clearly visible, then toggle frame off
    if (box) {
      const cx = box.x + box.width / 2;
      const cy = box.y + box.height / 2;
      await page.mouse.move(cx, cy);
      await page.mouse.down();
      await page.mouse.move(cx - 180, cy - 20, { steps: 8 });
      await page.mouse.up();
      await page.waitForTimeout(100);
    }

    const orbitedFrameOn = await page.evaluate(() =>
      Array.from(window.__shadowpaintDebug?.read3DViewportRgba(160, 160) ?? []),
    );
    expect(
      countChangedPixels(new Uint8Array(afterLiveHeightFrame), new Uint8Array(orbitedFrameOn)),
    ).toBeGreaterThan(200);

    await page.getByTestId('btn-toggle-frame').click();
    const frameOffStats = await page.evaluate(() => window.__shadowpaintDebug?.get3DStats());
    expect(frameOffStats?.frameVisible).toBe(false);

    const afterFrameOff = await page.evaluate(() =>
      Array.from(window.__shadowpaintDebug?.read3DViewportRgba(160, 160) ?? []),
    );
    expect(
      countChangedPixels(new Uint8Array(orbitedFrameOn), new Uint8Array(afterFrameOff)),
    ).toBeGreaterThan(50);

    // Reset view via button
    await page.getByTestId('btn-reset-view-3d').click();
    await page.waitForTimeout(80);

    // Verify creating a new project disposes 3D shadow map & geometries without leaking across cycles
    const memIn3D = await page.evaluate(() => window.__shadowpaintDebug?.getMemoryInfo());

    const createCleanProject = async (name: string, widthPx: string) => {
      await page.keyboard.press('F1');
      await page.getByTestId('btn-new-project').click();
      await page.locator('#np-name').fill(name);
      await page.locator('#np-res-mode').click();
      await page.getByRole('option', { name: 'Width in px' }).click();
      await page.locator('#np-width-px').fill(widthPx);
      const discardCheckbox = page.locator('#np-confirm-discard');
      if (await discardCheckbox.isVisible()) {
        await discardCheckbox.check();
      }
      await page.getByTestId('new-project-submit').click();
      await expect(page.getByRole('dialog')).toBeHidden();
      await page.waitForTimeout(80);
    };

    await createCleanProject('Clean Check 1', '120');
    const memAfter1 = await page.evaluate(() => window.__shadowpaintDebug?.getMemoryInfo());
    expect(memAfter1?.geometries).toBe(1);
    expect(memAfter1?.textures).toBeLessThan(memIn3D?.textures ?? 99);

    // Render 3D again (on 256 LOD) and dispose again -> zero growth
    await page.getByTestId('right-tab-canvas').click();
    await page.getByTestId('canvas-mesh-detail').click();
    await page.getByRole('option', { name: /^256 / }).click();
    await page.keyboard.press('F2');
    await page.waitForTimeout(80);

    await createCleanProject('Clean Check 2', '140');
    const memAfter2 = await page.evaluate(() => window.__shadowpaintDebug?.getMemoryInfo());
    expect(memAfter2?.geometries).toBe(1);
    expect(memAfter2?.textures).toBe(memAfter1?.textures);
    expect(errors).toEqual([]);
  });
});
