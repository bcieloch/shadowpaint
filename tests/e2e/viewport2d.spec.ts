import { expect, test } from '@playwright/test';

test.describe('2D WebGL2 Viewport & Engine', () => {
  test('renders COLOR mode byte-exact, tests partial dirty upload, switches modes/legends, and keeps GPU textures constant across 5 new projects', async ({
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

    await expect(page.getByTestId('viewport-webgl-canvas')).toBeVisible();
    await expect(page.getByTestId('viewport-overlay-canvas')).toBeVisible();

    // Create a smaller square project (10x10 cm, 200x200 px) so full readback comparison is instant
    await page.getByTestId('btn-new-project').click();
    await page.locator('#np-name').fill('Pixel Test');
    await page.locator('#np-lock-aspect').uncheck();
    await page.locator('#np-width-cm').fill('10');
    await page.locator('#np-height-cm').fill('10');
    await page.locator('#np-res-mode').click();
    await page.getByRole('option', { name: 'Width in px' }).click();
    await page.locator('#np-width-px').fill('200');
    await page.getByTestId('new-project-submit').click();
    await expect(page.getByRole('dialog')).toBeHidden();
    await expect(page.getByTestId('topbar-project-name')).toHaveText('Pixel Test');

    // Wait a frame for Engine rebuild & render
    await page.waitForTimeout(100);

    // 1. Check COLOR mode pixel readback == effective buffer byte-for-byte
    const defaultMatch = await page.evaluate(() => {
      const dbg = window.__shadowpaintDebug;
      if (!dbg) return { ok: false, reason: 'missing debug handle' };
      const rendered = dbg.readFlatCanvasRgba(200, 200);
      const effective = dbg.getMapEffectiveRgba();
      if (rendered.length !== effective.length || rendered.length === 0) {
        return { ok: false, reason: `length mismatch ${rendered.length} vs ${effective.length}` };
      }
      let maxDiff = 0;
      for (let i = 0; i < effective.length; i++) {
        const diff = Math.abs((rendered[i] ?? 0) - (effective[i] ?? 0));
        if (diff > maxDiff) maxDiff = diff;
      }
      return {
        ok: maxDiff === 0,
        maxDiff,
        sampleRendered: Array.from(rendered.slice(0, 4)),
        sampleEffective: Array.from(effective.slice(0, 4)),
      };
    });
    expect(defaultMatch.ok, JSON.stringify(defaultMatch)).toBe(true);

    // 2. Test partial dirty upload: write a specific color to pixel (53, 77) and emit dirty
    await page.evaluate(() => {
      window.__shadowpaintDebug?.emitColorDirtyPixel(53, 77, [37, 142, 219, 255]);
    });
    await page.waitForTimeout(80);

    const dirtyPixelCheck = await page.evaluate(() => {
      const dbg = window.__shadowpaintDebug;
      if (!dbg) return null;
      const rendered = dbg.readFlatCanvasRgba(200, 200);
      const effective = dbg.getMapEffectiveRgba();
      const idx = (77 * 200 + 53) * 4;
      return {
        rendered: [rendered[idx], rendered[idx + 1], rendered[idx + 2], rendered[idx + 3]],
        effective: [effective[idx], effective[idx + 1], effective[idx + 2], effective[idx + 3]],
      };
    });
    expect(dirtyPixelCheck?.rendered).toEqual([37, 142, 219, 255]);
    expect(dirtyPixelCheck?.rendered).toEqual(dirtyPixelCheck?.effective);

    // 3. Switch to Height mode (Gray -> Heat -> Topo) and Opacity mode, verifying legends
    await page.getByTestId('mode-height').click();
    await expect(page.getByTestId('height-legend')).toBeVisible();
    await page.getByTestId('height-display-select').click();
    await page.getByRole('option', { name: /Heatmap/i }).click();
    await expect(page.getByTestId('height-legend')).toBeVisible();
    await page.getByTestId('height-display-select').click();
    await page.getByRole('option', { name: /Topographic/i }).click();
    await expect(page.getByTestId('contour-step-select')).toBeVisible();

    await page.getByTestId('mode-opacity').click();
    await expect(page.getByTestId('opacity-legend')).toBeVisible();
    await page.getByTestId('mode-color').click();

    // 4. Test 1:1 zoom, wheel zoom, and Fit
    await page.getByTestId('btn-zoom-100').click();
    await expect(page.getByTestId('viewport-zoom-pct')).toHaveText('100%');

    const canvasArea = page.getByTestId('viewport-canvas-area');
    const box = await canvasArea.boundingBox();
    expect(box).not.toBeNull();
    if (box) {
      await page.mouse.move(box.x + box.width / 2, box.y + box.height / 2);
      await page.mouse.wheel(0, -500);
      await expect(page.getByTestId('viewport-zoom-pct')).toHaveText('200%');
    }

    await page.getByTestId('btn-zoom-fit').click();
    const fittedText = await page.getByTestId('viewport-zoom-pct').textContent();
    expect(fittedText).not.toBe('100%');

    // 5. Create 5 new projects in a row and verify renderer.info.memory.textures remains constant
    const textureCounts: number[] = [];
    for (let i = 1; i <= 5; i++) {
      await page.getByTestId('btn-new-project').click();
      await expect(page.locator('#np-name')).toBeVisible();
      await page.locator('#np-name').fill(`Leak Check ${i}`);
      await page.locator('#np-lock-aspect').uncheck();
      await page.locator('#np-width-cm').fill('10');
      await page.locator('#np-height-cm').fill('10');
      await page.locator('#np-res-mode').click();
      await page.getByRole('option', { name: 'Width in px' }).click();
      await page.locator('#np-width-px').fill(String(120 + i * 16));
      await page.getByTestId('new-project-submit').click();
      await expect(page.getByRole('dialog')).toBeHidden();
      await expect(page.getByTestId('topbar-project-name')).toHaveText(`Leak Check ${i}`);
      await page.waitForTimeout(80);
      const mem = await page.evaluate(() => window.__shadowpaintDebug?.getMemoryInfo());
      expect(mem).toBeDefined();
      if (mem) {
        textureCounts.push(mem.textures);
      }
    }

    expect(textureCounts).toEqual([3, 3, 3, 3, 3]);
    expect(errors).toEqual([]);
  });
});
