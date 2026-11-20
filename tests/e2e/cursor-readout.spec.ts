import { expect, test } from '@playwright/test';
import { createDefaultProject } from '@/core/constants';
import { computeBeerLambertTransmission, srgbBytesToLinearRgb } from '@/core/optics/beerLambert';

test.describe('Cursor Readout (2D & 3D)', () => {
  test('displays live calibrated coordinates, RGB hex, float & L8 height mm, opacity %, and Beer-Lambert back T % in both 2D and 3D layouts', async ({
    page,
  }) => {
    const errors: string[] = [];
    page.on('pageerror', (err) => errors.push(err.message));
    page.on('console', (msg) => {
      if (msg.type() === 'error') errors.push(msg.text());
    });

    await page.setViewportSize({ width: 1280, height: 800 });
    await page.goto('/');

    // Create 50x50 cm (200x200 px, 0..5 mm) project
    await page.getByTestId('btn-new-project').click();
    await page.locator('#np-name').fill('Cursor Readout Test');
    await page.locator('#np-lock-aspect').uncheck();
    await page.locator('#np-width-cm').fill('50');
    await page.locator('#np-height-cm').fill('50');
    await page.locator('#np-res-mode').click();
    await page.getByRole('option', { name: 'Width in px' }).click();
    await page.locator('#np-width-px').fill('200');
    await page.getByTestId('new-project-submit').click();
    await expect(page.getByRole('dialog')).toBeHidden();
    await page.waitForTimeout(80);

    // Lower meshDetail to 256 for fast 3D init
    await page.getByTestId('right-tab-canvas').click();
    await page.getByTestId('canvas-mesh-detail').click();
    await page.getByRole('option', { name: /^256 / }).click();

    // Paint deterministic block in center (60..140, 60..140): #A3B1C2, h=0.5 (2.500mm, L=128 -> 2.510mm), tau=0.642 (64.2%)
    await page.evaluate(() => {
      const dbg = window.__shadowpaintDebug;
      if (!dbg) return;
      dbg.emitColorDirtyBlock(60, 60, 80, 80, [0xa3, 0xb1, 0xc2, 255]);
      dbg.emitHeightDirtyBlock(60, 60, 80, 80, 0.5);
      dbg.emitOpacityDirtyBlock(60, 60, 80, 80, 0.642);
    });
    await page.waitForTimeout(80);

    // Compute expected back T % via Beer-Lambert luminance channel
    const def = createDefaultProject({
      canvas: {
        widthCm: 50,
        heightCm: 50,
        widthPx: 200,
        heightPx: 200,
        minThicknessMm: 0,
        maxThicknessMm: 5,
      },
    });
    const expectedT = computeBeerLambertTransmission({
      heightNorm: 0.5,
      opacityTau: 0.642,
      colorLinear: srgbBytesToLinearRgb(0xa3, 0xb1, 0xc2),
      canvas: def.canvas,
      material: def.material,
      globalTransmissionPct: def.lighting.back.globalTransmissionPct,
      attenuation: def.lighting.back.attenuation,
    });
    const expectedBackTPct = (
      (0.2126 * expectedT.total.r + 0.7152 * expectedT.total.g + 0.0722 * expectedT.total.b) *
      100
    ).toFixed(1);

    // 1. Hover center of 2D viewport
    const viewport = page.getByTestId('viewport-canvas-area');
    const box = await viewport.boundingBox();
    expect(box).not.toBeNull();
    if (!box) return;

    const cx = box.x + box.width / 2;
    const cy = box.y + box.height / 2;
    await page.mouse.move(cx, cy);

    await expect(page.getByTestId('statusbar-readout')).toBeVisible();
    await expect(page.getByTestId('readout-coords')).toContainText(
      /x \d+ px \/ \d+\.\d{2} cm · y \d+ px \/ \d+\.\d{2} cm/,
    );
    await expect(page.getByTestId('readout-rgb')).toHaveText('RGB #A3B1C2');
    await expect(page.getByTestId('readout-height')).toHaveText('H 2.500 mm (L=128 → 2.510 mm)');
    await expect(page.getByTestId('readout-opacity')).toHaveText('T 64.2 %');
    await expect(page.getByTestId('readout-back-t')).toHaveText(`back T ${expectedBackTPct} %`);

    // 2. Leaving canvas clears readout
    await page.mouse.move(10, 10);
    await expect(page.getByTestId('statusbar-readout')).toBeHidden();

    // 3. Switch to 3D layout -> hovering canvas center raycasts onto z=0 plane -> identical pixel values
    await page.getByTestId('layout-3d').click();
    await expect(page.getByTestId('badge-relief-multiplier')).toBeVisible();
    await page.waitForTimeout(80);

    await page.mouse.move(cx, cy);
    await expect(page.getByTestId('statusbar-readout')).toBeVisible();
    await expect(page.getByTestId('readout-rgb')).toHaveText('RGB #A3B1C2');
    await expect(page.getByTestId('readout-height')).toHaveText('H 2.500 mm (L=128 → 2.510 mm)');
    await expect(page.getByTestId('readout-opacity')).toHaveText('T 64.2 %');
    await expect(page.getByTestId('readout-back-t')).toHaveText(`back T ${expectedBackTPct} %`);

    // 4. Switch to PL -> translated label for back T % updates live
    await page.getByTestId('lang-pl').click();
    await page.mouse.move(cx + 2, cy + 2);
    await expect(page.getByTestId('readout-back-t')).toHaveText(`tył T ${expectedBackTPct} %`);

    expect(errors).toEqual([]);
  });
});
