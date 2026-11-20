import { expect, test } from '@playwright/test';
import {
  computeBackLightRadiance,
  linearRgbToSrgbBytes,
  srgbBytesToLinearRgb,
} from '@/core/optics/beerLambert';
import type { BackLightSettings, CanvasSettings, MaterialSettings } from '@/core/types';

function readPixelRgb(rgba: Uint8Array, imgW: number, x: number, y: number) {
  const idx = (y * imgW + x) * 4;
  return {
    r: rgba[idx] ?? 0,
    g: rgba[idx + 1] ?? 0,
    b: rgba[idx + 2] ?? 0,
  };
}

function pixelWorldPosCm(
  px: number,
  py: number,
  imgW: number,
  imgH: number,
  canvas: Pick<CanvasSettings, 'widthCm' | 'heightCm' | 'minThicknessMm' | 'maxThicknessMm'>,
  heightNorm: number,
) {
  const u = (px + 0.5) / imgW;
  const v = 1 - (py + 0.5) / imgH;
  const x = (u - 0.5) * canvas.widthCm;
  const y = (v - 0.5) * canvas.heightCm;
  const z =
    (canvas.minThicknessMm + heightNorm * (canvas.maxThicknessMm - canvas.minThicknessMm)) / 10;
  return { x, y, z };
}

test.describe('Back Light (Beer-Lambert) & Material Optics', () => {
  test('matches CPU Beer-Lambert parity in point & panel modes, updates live from Light/Material tabs with undo/redo, and toggles 2D/3D modes & gizmos', async ({
    page,
  }) => {
    const errors: string[] = [];
    page.on('pageerror', (err) => errors.push(err.message));
    page.on('console', (msg) => {
      if (msg.type() === 'error') errors.push(msg.text());
    });

    await page.setViewportSize({ width: 1280, height: 800 });
    await page.goto('/');

    // Create 50x50 cm (200x200 px) project
    await page.getByTestId('btn-new-project').click();
    await page.locator('#np-name').fill('Back Light Test');
    await page.locator('#np-lock-aspect').uncheck();
    await page.locator('#np-width-cm').fill('50');
    await page.locator('#np-height-cm').fill('50');
    await page.locator('#np-res-mode').click();
    await page.getByRole('option', { name: 'Width in px' }).click();
    await page.locator('#np-width-px').fill('200');
    await page.getByTestId('new-project-submit').click();
    await expect(page.getByRole('dialog')).toBeHidden();
    await page.waitForTimeout(80);

    // Lower meshDetail to 256 for fast deterministic WebGL2 rendering
    await page.getByTestId('right-tab-canvas').click();
    await page.getByTestId('canvas-mesh-detail').click();
    await page.getByRole('option', { name: /^256 / }).click();

    // Paint clean test blocks (all pixels initialized with default #f4f1ea, h=0, opacity=1; overwrite with white or tinted regions)
    await page.evaluate(() => {
      const dbg = window.__shadowpaintDebug;
      if (!dbg) return;
      // Entire canvas white, opacity=1, height=0 as baseline
      dbg.emitColorDirtyBlock(0, 0, 200, 200, [255, 255, 255, 255]);
      dbg.emitHeightDirtyBlock(0, 0, 200, 200, 0);
      dbg.emitOpacityDirtyBlock(0, 0, 200, 200, 1);

      // Top-right (130..180, 20..70): thick white (h=0.5)
      dbg.emitHeightDirtyBlock(130, 20, 50, 50, 0.5);

      // Bottom-left (20..70, 130..180): thick warm red-tinted (#cc3322, h=0.5)
      dbg.emitColorDirtyBlock(20, 130, 50, 50, [0xcc, 0x33, 0x22, 255]);
      dbg.emitHeightDirtyBlock(20, 130, 50, 50, 0.5);

      // Bottom-right (130..180, 130..180): zero opacity (tau_p=0)
      dbg.emitOpacityDirtyBlock(130, 130, 50, 50, 0);
    });
    await page.waitForTimeout(80);

    // Switch to 2D BACK view via mode-back button
    await page.getByTestId('mode-back').click();
    await expect(page.getByTestId('mode-back')).toHaveAttribute('aria-checked', 'true');

    // Configure deterministic white back light and zero ambientRoom on Light tab
    await page.getByTestId('right-tab-light').click();
    await page.getByTestId('light-ambient-room').fill('0');
    await page.getByTestId('back-color-rgb').click();
    const backHex = page.getByTestId('back-rgb-hex');
    await backHex.fill('#ffffff');
    await backHex.press('Enter');
    await page.getByTestId('back-intensity').fill('1');
    await page.waitForTimeout(120);

    const canvasCfg: CanvasSettings = {
      widthCm: 50,
      heightCm: 50,
      widthPx: 200,
      heightPx: 200,
      minThicknessMm: 0,
      maxThicknessMm: 5,
    };
    const materialCfg: MaterialSettings = {
      preset: 'custom',
      roughness: 0.55,
      muA: 0.9,
      muS: 0.6,
      kTint: 0.85,
      canvasTransmittance: 0.65,
      scatterRadiusMm: 0.8,
      canvasBackColor: '#d9d2c3',
    };
    const pointBackCfg: BackLightSettings = {
      type: 'point',
      xCm: 25,
      yCm: 25,
      distanceBehindCm: 20,
      intensity: 1,
      color: { mode: 'rgb', kelvin: 5000, rgb: '#ffffff' },
      globalTransmissionPct: 100,
      attenuation: 1,
    };

    // 1. CPU-vs-GPU parity in 'point' mode (no toneMapping)
    const rawPoint = await page.evaluate(() =>
      Array.from(
        window.__shadowpaintDebug?.readFlatCanvasRgba(200, 200, { toneMapping: 'none' }) ?? [],
      ),
    );
    const pointRgba = new Uint8Array(rawPoint);

    const sampleCases = [
      {
        name: 'center-thin-white',
        px: 100,
        py: 100,
        color: [255, 255, 255] as const,
        h: 0,
        tauP: 1,
      },
      {
        name: 'offaxis-thin-white',
        px: 45,
        py: 45,
        color: [255, 255, 255] as const,
        h: 0,
        tauP: 1,
      },
      {
        name: 'thick-white',
        px: 155,
        py: 45,
        color: [255, 255, 255] as const,
        h: 0.5,
        tauP: 1,
      },
      {
        name: 'thick-tinted',
        px: 45,
        py: 155,
        color: [0xcc, 0x33, 0x22] as const,
        h: 0.5,
        tauP: 1,
      },
      {
        name: 'zero-opacity',
        px: 155,
        py: 155,
        color: [255, 255, 255] as const,
        h: 0,
        tauP: 0,
      },
    ];

    for (const sc of sampleCases) {
      const gpu = readPixelRgb(pointRgba, 200, sc.px, sc.py);
      const expectedLinear = computeBackLightRadiance({
        heightNorm: sc.h,
        opacityTau: sc.tauP,
        colorLinear: srgbBytesToLinearRgb(sc.color[0], sc.color[1], sc.color[2]),
        canvas: canvasCfg,
        material: materialCfg,
        globalTransmissionPct: pointBackCfg.globalTransmissionPct,
        attenuation: pointBackCfg.attenuation,
        worldPosCm: pixelWorldPosCm(sc.px, sc.py, 200, 200, canvasCfg, sc.h),
        back: pointBackCfg,
        backScale: 1,
        canvasSizeCm: canvasCfg,
      });
      const cpu = linearRgbToSrgbBytes(expectedLinear);
      expect(Math.abs(gpu.r - cpu.r), `${sc.name} R mismatch`).toBeLessThanOrEqual(2);
      expect(Math.abs(gpu.g - cpu.g), `${sc.name} G mismatch`).toBeLessThanOrEqual(2);
      expect(Math.abs(gpu.b - cpu.b), `${sc.name} B mismatch`).toBeLessThanOrEqual(2);
    }

    const centerThinPoint = readPixelRgb(pointRgba, 200, 100, 100);
    const offAxisThinPoint = readPixelRgb(pointRgba, 200, 45, 45);
    const thickWhitePoint = readPixelRgb(pointRgba, 200, 155, 45);
    const thickTintedPoint = readPixelRgb(pointRgba, 200, 45, 155);
    const zeroOpacityPoint = readPixelRgb(pointRgba, 200, 155, 155);

    // Inverse-square + cosine falloff in point mode
    expect(centerThinPoint.r - offAxisThinPoint.r).toBeGreaterThan(20);
    // Beer-Lambert attenuation with thickness
    expect(offAxisThinPoint.r - thickWhitePoint.r).toBeGreaterThan(40);
    // Tinted pigment absorption transmits red much more strongly than blue
    expect(thickTintedPoint.r - thickTintedPoint.b).toBeGreaterThan(20);
    // Zero opacity blocks transmission completely
    expect(zeroOpacityPoint).toEqual({ r: 0, g: 0, b: 0 });

    // 2. Switch to 'panel' mode -> uniform irradiance & CPU-vs-GPU parity
    await page.getByTestId('back-type-panel').click();
    await page.waitForTimeout(100);

    const rawPanel = await page.evaluate(() =>
      Array.from(
        window.__shadowpaintDebug?.readFlatCanvasRgba(200, 200, { toneMapping: 'none' }) ?? [],
      ),
    );
    const panelRgba = new Uint8Array(rawPanel);
    const centerThinPanel = readPixelRgb(panelRgba, 200, 100, 100);
    const offAxisThinPanel = readPixelRgb(panelRgba, 200, 45, 45);
    expect(Math.abs(centerThinPanel.r - offAxisThinPanel.r)).toBeLessThanOrEqual(1);

    const panelBackCfg: BackLightSettings = { ...pointBackCfg, type: 'panel' };
    const expectedPanelThin = linearRgbToSrgbBytes(
      computeBackLightRadiance({
        heightNorm: 0,
        opacityTau: 1,
        colorLinear: srgbBytesToLinearRgb(255, 255, 255),
        canvas: canvasCfg,
        material: materialCfg,
        globalTransmissionPct: panelBackCfg.globalTransmissionPct,
        attenuation: panelBackCfg.attenuation,
        worldPosCm: { x: 0, y: 0, z: 0 },
        back: panelBackCfg,
        backScale: 1,
        canvasSizeCm: canvasCfg,
      }),
    );
    expect(Math.abs(centerThinPanel.r - expectedPanelThin.r)).toBeLessThanOrEqual(2);

    // 3. Light tab sliders: attenuation, globalTransmission, lighting mode & balance
    await page.getByTestId('back-global-transmission').fill('50');
    await page.getByTestId('back-attenuation').fill('2');
    await page.waitForTimeout(80);
    const statsModified = await page.evaluate(() => window.__shadowpaintDebug?.getBackLightStats());
    expect(statsModified?.globalTransmissionPct).toBeCloseTo(50, 2);
    expect(statsModified?.attenuation).toBeCloseTo(2, 2);

    // Restore attenuation via undo
    await page.getByTestId('btn-undo').click();
    await page.waitForTimeout(80);
    const statsUndoAtt = await page.evaluate(() => window.__shadowpaintDebug?.getBackLightStats());
    expect(statsUndoAtt?.attenuation).toBeCloseTo(1, 2);

    // Combined mode + balance slider in Light tab and 2D toolbar
    await page.getByTestId('lighting-mode-combined').click();
    await expect(page.getByTestId('light-balance')).toBeVisible();
    await page.getByTestId('light-balance').fill('0.2');
    await page.waitForTimeout(80);
    await page.getByTestId('mode-combined').click();
    await expect(page.getByTestId('mode-combined')).toHaveAttribute('aria-checked', 'true');
    const combinedStats = await page.evaluate(() => window.__shadowpaintDebug?.getBackLightStats());
    expect(combinedStats?.backScale).toBeCloseTo(0.4, 2);

    // Switch back to mode-back for Material tab check
    await page.getByTestId('mode-back').click();

    // 4. Material tab controls + undo/redo
    await page.getByTestId('right-tab-material').click();
    await page.getByTestId('material-mu-a').fill('2.5');
    await page.getByTestId('material-mu-s').fill('1.2');
    await page.getByTestId('material-k-tint').fill('0.4');
    await page.getByTestId('material-canvas-transmittance').fill('0');
    await page.waitForTimeout(100);

    const frameNoCanvasTransmission = await page.evaluate(() =>
      Array.from(
        window.__shadowpaintDebug?.readFlatCanvasRgba(200, 200, { toneMapping: 'none' }) ?? [],
      ),
    );
    expect(readPixelRgb(new Uint8Array(frameNoCanvasTransmission), 200, 100, 100)).toEqual({
      r: 0,
      g: 0,
      b: 0,
    });

    // Undo restores canvasTransmittance -> backlight returns
    await page.getByTestId('btn-undo').click();
    await page.waitForTimeout(100);
    const frameRestored = await page.evaluate(() =>
      Array.from(
        window.__shadowpaintDebug?.readFlatCanvasRgba(200, 200, { toneMapping: 'none' }) ?? [],
      ),
    );
    expect(readPixelRgb(new Uint8Array(frameRestored), 200, 100, 100).r).toBeGreaterThan(50);

    // 5. 2D Shift+5 / Shift+6 shortcuts & 3D mode + BackLight gizmo visibility
    await page.getByTestId('mode-color').click();
    await page.keyboard.press('Shift+Digit5');
    await expect(page.getByTestId('mode-back')).toHaveAttribute('aria-checked', 'true');
    await page.keyboard.press('Shift+Digit6');
    await expect(page.getByTestId('mode-combined')).toHaveAttribute('aria-checked', 'true');

    await page.getByTestId('layout-3d').click();
    await expect(page.getByTestId('view3d-mode-combined')).toHaveAttribute('aria-checked', 'true');
    const gizmoCombined = await page.evaluate(() => window.__shadowpaintDebug?.getBackLightStats());
    // Type was switched to panel earlier -> panel wireframe gizmo should be visible when showLampGizmos=true
    expect(gizmoCombined?.gizmoVisible).toBe(true);

    // Toggle gizmos off via button
    await page.getByTestId('btn-toggle-gizmos').click();
    await page.waitForTimeout(80);
    const gizmoOff = await page.evaluate(() => window.__shadowpaintDebug?.getBackLightStats());
    expect(gizmoOff?.gizmoVisible).toBe(false);

    // Turn gizmos back on, then switch to 3D Front-only -> BackLight gizmo must hide because backScale == 0
    await page.getByTestId('btn-toggle-gizmos').click();
    await page.getByTestId('view3d-mode-front').click();
    await page.waitForTimeout(80);
    const gizmoFrontOnly = await page.evaluate(() =>
      window.__shadowpaintDebug?.getBackLightStats(),
    );
    expect(gizmoFrontOnly?.gizmoVisible).toBe(false);
    expect(gizmoFrontOnly?.backScale).toBe(0);

    // Switch to 3D Back -> BackLight gizmo visible again
    await page.getByTestId('view3d-mode-back').click();
    await page.waitForTimeout(80);
    const gizmoBackOnly = await page.evaluate(() => window.__shadowpaintDebug?.getBackLightStats());
    expect(gizmoBackOnly?.gizmoVisible).toBe(true);
    expect(gizmoBackOnly?.backScale).toBe(1);

    expect(errors).toEqual([]);
  });
});
