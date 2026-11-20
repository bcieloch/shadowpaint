import { expect, test } from '@playwright/test';

test.describe('Advanced Optics (Task 2.7)', () => {
  test('applies material presets as 1 history entry, renders T(d) curve, blurs lateral scattering via Poisson disk, and translates EN/PL', async ({
    page,
  }) => {
    const errors: string[] = [];
    page.on('pageerror', (err) => errors.push(err.message));
    page.on('console', (msg) => {
      if (msg.type() === 'error') errors.push(msg.text());
    });

    await page.setViewportSize({ width: 1280, height: 800 });
    await page.goto('/');

    // Create 50x50 cm (200x200 px) canvas -> 4 px/cm
    await page.getByTestId('btn-new-project').click();
    await page.locator('#np-name').fill('Advanced Optics Test');
    await page.locator('#np-lock-aspect').uncheck();
    await page.locator('#np-width-cm').fill('50');
    await page.locator('#np-height-cm').fill('50');
    await page.locator('#np-res-mode').click();
    await page.getByRole('option', { name: 'Width in px' }).click();
    await page.locator('#np-width-px').fill('200');
    await page.getByTestId('new-project-submit').click();
    await expect(page.getByRole('dialog')).toBeHidden();
    await page.waitForTimeout(80);

    // Lower meshDetail to 256 for fast SwiftShader vertex/fragment rendering
    await page.getByTestId('right-tab-canvas').click();
    await page.getByTestId('canvas-mesh-detail').click();
    await page.getByRole('option', { name: /^256 / }).click();
    await expect(page.locator('[data-slot="select-content"]')).toBeHidden();

    // Open Material tab
    await page.getByTestId('right-tab-material').click();
    await expect(page.getByTestId('material-preset')).toContainText('Custom');
    await expect(page.getByTestId('material-td-chart')).toBeVisible();
    const initialPathD = await page.getByTestId('material-td-white-path').getAttribute('d');
    expect(initialPathD).toBeTruthy();

    // Select 'Acrylic opaque' preset -> sets muA 2.5, muS 3.0, kTint 0.9, roughness 0.6, scatterRadius 1.2
    await page.getByTestId('material-preset').click();
    await page.getByRole('option', { name: 'Acrylic opaque' }).click();
    await expect(page.getByTestId('material-mu-a')).toHaveValue('2.5');
    await expect(page.getByTestId('material-mu-s')).toHaveValue('3');
    await expect(page.getByTestId('material-k-tint')).toHaveValue('0.9');
    await expect(page.getByTestId('material-roughness')).toHaveValue('0.6');
    await expect(page.getByTestId('material-scatter-radius')).toHaveValue('1.2');

    const opaquePathD = await page.getByTestId('material-td-white-path').getAttribute('d');
    expect(opaquePathD).not.toEqual(initialPathD);

    // Undo once (Ctrl+Z) -> reverts ALL preset properties in a single history step
    await page.keyboard.press('Control+z');
    await expect(page.getByTestId('material-preset')).toContainText('Custom');
    await expect(page.getByTestId('material-mu-a')).toHaveValue('0.9');
    await expect(page.getByTestId('material-mu-s')).toHaveValue('0.6');
    await expect(page.getByTestId('material-roughness')).toHaveValue('0.55');
    await expect(page.getByTestId('material-scatter-radius')).toHaveValue('0.8');

    // Redo once (Ctrl+Y) -> reapplies Acrylic opaque preset cleanly
    await page.keyboard.press('Control+y');
    await expect(page.getByTestId('material-mu-a')).toHaveValue('2.5');

    // Manual edit flips preset back to 'Custom'
    await page.getByTestId('material-scatter-radius').fill('0');
    await page.getByTestId('material-scatter-radius').press('Enter');
    await expect(page.getByTestId('material-preset')).toContainText('Custom');

    // Scroll to and hover over T(d) curve to inspect readout
    const tdSurface = page.getByTestId('material-td-hover-surface');
    await tdSurface.scrollIntoViewIfNeeded();
    await tdSurface.hover();
    await expect(page.getByTestId('material-td-readout')).toContainText('mm');

    // Verify Poisson-disk lateral scatter blur across a sharp height step in Back Light 2D view
    await page.evaluate(() => {
      const dbg = window.__shadowpaintDebug;
      if (!dbg) return;
      dbg.emitColorDirtyBlock(0, 0, 200, 200, [255, 255, 255, 255]);
      dbg.emitHeightDirtyBlock(0, 0, 200, 200, 0);
      dbg.emitOpacityDirtyBlock(0, 0, 200, 200, 1);
      // Thick strongly-scattering block in [80..120, 80..120]
      dbg.emitHeightDirtyBlock(80, 80, 40, 40, 0.8);
    });

    await page.getByTestId('mode-back').click();
    await page.getByTestId('right-tab-light').click();
    await page.getByTestId('light-ambient-room').fill('0');
    await page.getByTestId('back-type-panel').click();
    await page.getByTestId('back-color-rgb').click();
    await page.getByTestId('back-rgb-hex').fill('#ffffff');
    await page.getByTestId('back-rgb-hex').press('Enter');
    await page.getByTestId('back-global-transmission').fill('100');
    await page.getByTestId('back-global-transmission').press('Enter');
    await page.getByTestId('back-attenuation').fill('1');
    await page.getByTestId('back-attenuation').press('Enter');

    await page.getByTestId('right-tab-material').click();
    // Compare pixel (78, 100) right outside the thick block at scatterRadius=0 vs scatterRadius=8 mm (3.2 px radius)
    await page.getByTestId('material-scatter-radius').fill('0');
    await page.getByTestId('material-scatter-radius').press('Enter');
    await page.waitForTimeout(80);

    const noBlurPixel = await page.evaluate(() => {
      const rgba = window.__shadowpaintDebug?.readFlatCanvasRgba(200, 200, { toneMapping: 'none' });
      if (!rgba) return 0;
      const idx = (100 * 200 + 78) * 4;
      return rgba[idx] ?? 0;
    });

    await page.getByTestId('material-scatter-radius').fill('8');
    await page.getByTestId('material-scatter-radius').press('Enter');
    await page.waitForTimeout(80);

    const blurredPixel = await page.evaluate(() => {
      const rgba = window.__shadowpaintDebug?.readFlatCanvasRgba(200, 200, { toneMapping: 'none' });
      if (!rgba) return 0;
      const idx = (100 * 200 + 78) * 4;
      return rgba[idx] ?? 0;
    });

    // At d=0 outside block without scatter blur, T_scat=0; with Poisson scatter blur over thick neighbor, T_scat_blurred > 0
    expect(blurredPixel).toBeGreaterThan(noBlurPixel);

    // Verify Combined mode & readout back T %
    await page.getByTestId('mode-combined').click();
    const viewport = page.getByTestId('viewport-canvas-area');
    const vBox = await viewport.boundingBox();
    expect(vBox).not.toBeNull();
    if (!vBox) return;
    await page.mouse.move(vBox.x + vBox.width * 0.5, vBox.y + vBox.height * 0.5);
    await expect(page.getByTestId('readout-back-t')).toContainText('back T');

    // Verify Polish translations in Material tab
    await page.getByTestId('lang-pl').click();
    await expect(page.getByText('Krzywa transmisji T(d)')).toBeVisible();
    await page.getByTestId('material-preset').click();
    await expect(page.getByRole('option', { name: 'Akryl kryjący' })).toBeVisible();
    await page.getByRole('option', { name: 'Akryl kryjący' }).click();

    expect(errors).toEqual([]);
  });
});
