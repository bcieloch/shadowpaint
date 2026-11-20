import { expect, test } from '@playwright/test';

test.describe('Performance, Memory & Worker Pool (Task 3.4)', () => {
  test('maintains zero WebGL memory growth across 10x 3000x4200 project cycles, computes 3000x4200 effective color < 120 ms in worker pool, paints smoothly at 200 px, and exposes diagnostics & PCSS toggle', async ({
    page,
  }) => {
    test.slow();

    const errors: string[] = [];
    page.on('pageerror', (err) => errors.push(err.message));
    page.on('console', (msg) => {
      if (msg.type() === 'error') {
        errors.push(msg.text());
      }
    });

    await page.setViewportSize({ width: 1360, height: 820 });
    await page.goto('/');
    await expect(page.getByTestId('btn-new-project')).toBeVisible();

    const create3000x4200Project = async (name: string) => {
      await page.getByTestId('btn-new-project').click();
      await page.locator('#np-name').fill(name);
      // Default 50x70 cm preset at 60 px/cm yields 3000x4200 px; set explicitly for determinism
      await page.locator('#np-px-cm').fill('60');
      const discardCheckbox = page.locator('#np-confirm-discard');
      if (await discardCheckbox.isVisible()) {
        await discardCheckbox.check();
      }
      await page.getByTestId('new-project-submit').click();
      await expect(page.getByRole('dialog')).toBeHidden();
    };

    const memoryHistory: Array<{ geometries: number; textures: number; programs: number }> = [];

    // 10x cycle: create 3000x4200 project, render 3D + 2D, close/replace via next New Project
    for (let cycle = 1; cycle <= 10; cycle++) {
      await create3000x4200Project(`Perf Cycle ${cycle}`);
      if (cycle === 1 || cycle === 10) {
        const dims = await page.evaluate(() => window.__shadowpaintDebug?.getBuiltDimensions());
        expect(dims?.widthPx).toBe(3000);
        expect(dims?.heightPx).toBe(4200);
      }

      // Exercise 3D render & shadow map allocation on first, middle, and final cycles (or all)
      await page.getByTestId('layout-3d').click();
      await expect(page.getByTestId('badge-relief-multiplier')).toBeVisible();
      await page.evaluate(
        () =>
          new Promise<void>((resolve) => {
            requestAnimationFrame(() => requestAnimationFrame(() => resolve()));
          }),
      );

      const mem = await page.evaluate(() => window.__shadowpaintDebug?.getMemoryInfo());
      expect(mem).toBeTruthy();
      if (mem) {
        memoryHistory.push(mem);
      }

      await page.getByTestId('layout-2d').click();
    }

    expect(memoryHistory).toHaveLength(10);
    const baselineMem = memoryHistory[0];
    const finalMem = memoryHistory[memoryHistory.length - 1];
    expect(baselineMem).toBeDefined();
    expect(finalMem).toBeDefined();
    if (baselineMem && finalMem) {
      expect(finalMem.geometries).toBe(baselineMem.geometries);
      expect(finalMem.textures).toBe(baselineMem.textures);
    }

    // Worker pool parallel computeEffectiveColor on active 3000x4200 canvas < 120 ms
    const bench = await page.evaluate(async () => {
      return await window.__shadowpaintDebug?.benchmarkComputeEffectiveColor({
        brightness: 0.14,
        contrast: 0.18,
        saturation: 0.12,
      });
    });
    expect(bench).toBeTruthy();
    if (bench) {
      expect(bench.width).toBe(3000);
      expect(bench.height).toBe(4200);
      expect(bench.activeWorkers).toBeGreaterThanOrEqual(1);
      expect(bench.durationMs).toBeLessThan(120);
    }

    // 200 px brush stroke on 3000x4200 canvas
    await page.keyboard.press('1');
    await page.keyboard.press('b');
    await page.getByTestId('mode-color').click();
    await page.getByTestId('brush-unit-px').click();
    await page.getByTestId('brush-size-input').fill('200');
    await page.getByTestId('brush-size-input').press('Enter');
    await page.getByTestId('brush-color-hex').fill('#1e64dc');
    await page.getByTestId('brush-color-hex').press('Enter');

    const canvasArea = page.getByTestId('viewport-canvas-area');
    const box = await canvasArea.boundingBox();
    expect(box).not.toBeNull();
    if (box) {
      const cx = box.x + box.width / 2;
      const cy = box.y + box.height / 2;
      await page.mouse.move(cx - 45, cy - 20);
      await page.mouse.down();
      await page.mouse.move(cx + 45, cy + 20, { steps: 10 });
      await page.mouse.up();
    }

    const paintedPixelCount = await page.evaluate(() => {
      const rgba = window.__shadowpaintDebug?.getMapEffectiveRgba();
      if (!rgba) return 0;
      let blueMatches = 0;
      // Strided sample for speed across 3000x4200
      for (let i = 0; i < rgba.length; i += 64) {
        const r = rgba[i] ?? 0;
        const g = rgba[i + 1] ?? 0;
        const b = rgba[i + 2] ?? 0;
        if (b > 180 && r < 90 && g > 70) {
          blueMatches++;
        }
      }
      return blueMatches;
    });
    expect(paintedPixelCount).toBeGreaterThan(20);

    // Verify Diagnostics popover UI, GPU info, WebGL memory counters, Worker stats & "Optimize for GPU"
    await page.getByTestId('btn-diagnostics').click();
    await expect(page.getByTestId('diagnostics-popover')).toBeVisible();
    await expect(page.getByTestId('diag-gpu')).toContainText('WebGL2');
    await expect(page.getByTestId('diag-workers')).toContainText('/');
    expect(Number(await page.getByTestId('diag-geometries').textContent())).toBe(
      finalMem?.geometries ?? 0,
    );
    expect(Number(await page.getByTestId('diag-textures').textContent())).toBe(
      finalMem?.textures ?? 0,
    );

    await page.getByTestId('btn-optimize-gpu').click();
    await page.keyboard.press('Escape');
    await expect(page.getByTestId('diagnostics-popover')).toBeHidden();

    // Toggle PCSS soft shadows shader in 3D Light panel
    await page.getByTestId('layout-3d').click();
    await page.getByTestId('right-tab-light').click();
    const pcssSwitch = page.getByTestId('front-pcss-enabled');
    await expect(pcssSwitch).toHaveAttribute('aria-checked', 'false');
    await pcssSwitch.click();
    await expect(pcssSwitch).toHaveAttribute('aria-checked', 'true');
    const pcssFrame = await page.evaluate(() =>
      Array.from(window.__shadowpaintDebug?.read3DViewportRgba(128, 128) ?? []),
    );
    expect(pcssFrame.length).toBe(128 * 128 * 4);
    await pcssSwitch.click();
    await expect(pcssSwitch).toHaveAttribute('aria-checked', 'false');

    expect(errors).toEqual([]);
  });
});
