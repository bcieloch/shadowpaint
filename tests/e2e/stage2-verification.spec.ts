import { expect, test, type Page } from '@playwright/test';

async function assertNoRawTranslationKeys(page: Page) {
  const rawKeys = await page.evaluate(() => {
    const walker = document.createTreeWalker(document.body, NodeFilter.SHOW_TEXT);
    const bad: string[] = [];
    const keyRe = /^[a-z][a-zA-Z0-9]*(\.[a-zA-Z0-9_-]+)+$/;
    const fileExtRe = /\.(png|jpe?g|tiff?|pdf|json|zip|relief|csv)$/i;
    let node = walker.nextNode();
    while (node) {
      const txt = node.textContent?.trim() ?? '';
      if (txt && keyRe.test(txt) && !fileExtRe.test(txt)) {
        bad.push(txt);
      }
      node = walker.nextNode();
    }
    return bad;
  });
  expect(rawKeys).toEqual([]);
}

test.describe('Stage 2 end-to-end verification (Task 2.10)', () => {
  test('exercises selection mask, fill, gradient, smooth/blur, grid/rulers, ruler, cross-section, optics, autosave reload, .relief save/open, and EN/PL i18n', async ({
    page,
  }) => {
    const errors: string[] = [];
    page.on('pageerror', (err) => errors.push(err.message));
    page.on('console', (msg) => {
      if (msg.type() === 'error') errors.push(msg.text());
    });

    await page.setViewportSize({ width: 1280, height: 800 });
    await page.goto('/');

    // 1. Create a 40x40 cm, 160x160 px (4 px/cm) project
    await page.getByTestId('btn-new-project').click();
    await page.locator('#np-name').fill('Stage 2 Studio');
    await page.locator('#np-lock-aspect').uncheck();
    await page.locator('#np-width-cm').fill('40');
    await page.locator('#np-height-cm').fill('40');
    await page.locator('#np-res-mode').click();
    await page.getByRole('option', { name: 'Width in px' }).click();
    await page.locator('#np-width-px').fill('160');
    await page.getByTestId('new-project-submit').click();
    await expect(page.getByRole('dialog')).toBeHidden();
    await expect(page.getByTestId('topbar-project-name')).toHaveText('Stage 2 Studio');

    await page.getByTestId('btn-zoom-100').click();
    await expect(page.getByTestId('viewport-zoom-pct')).toHaveText('100%');
    const canvasArea = page.getByTestId('viewport-canvas-area');
    const box = await canvasArea.boundingBox();
    expect(box).not.toBeNull();
    if (!box) return;

    const cx = box.x + box.width / 2;
    const cy = box.y + box.height / 2;
    const centerPxIdx = (80 * 160 + 80) * 4;
    const cornerPxIdx = (10 * 160 + 10) * 4;

    // 2. Selection Mask (2.1): Protect mode blocks brush inside selection; Fill Selection (2.3) fills selection
    await page.keyboard.press('2');
    await page.getByTestId('mode-height').click();
    await page.keyboard.press('m');
    await expect(page.getByTestId('tool-selectRect')).toHaveAttribute('aria-pressed', 'true');

    // Select centered rectangle [cx-40..cx+40, cy-40..cy+40] -> 80x80 px in 160x160 canvas
    await page.mouse.move(cx - 40, cy - 40);
    await page.mouse.down();
    await page.mouse.move(cx + 40, cy + 40, { steps: 4 });
    await page.mouse.up();

    // Hide mask tint temporarily for clean height pixel checks
    await page.getByTestId('selection-show-overlay').click();
    await page.getByTestId('selection-mode-protect').click();

    // Attempt brush stroke across protected center -> center pixel must remain 0
    await page.keyboard.press('b');
    await expect(page.getByTestId('selection-active-strip')).toBeVisible();
    await page.mouse.move(cx - 20, cy);
    await page.mouse.down();
    await page.mouse.move(cx + 20, cy, { steps: 4 });
    await page.mouse.up();

    const heightAfterProtectedBrush = await page.evaluate(() =>
      Array.from(window.__shadowpaintDebug?.readFlatCanvasRgba(160, 160) ?? []),
    );
    expect(heightAfterProtectedBrush[centerPxIdx]).toBe(0);

    // Switch to Fill tool and run Fill Selection -> center fills cleanly while outside corner remains 0
    await page.keyboard.press('f');
    await expect(page.getByTestId('fill-height-input')).toBeVisible();
    await page.getByTestId('fill-height-input').fill('4.0');
    await page.getByTestId('btn-fill-selection').click();

    await expect
      .poll(async () =>
        page.evaluate(() => {
          const rgba = window.__shadowpaintDebug?.readFlatCanvasRgba(160, 160);
          return rgba ? (rgba[(80 * 160 + 80) * 4] ?? 0) : 0;
        }),
      )
      .toBeGreaterThan(180);

    const heightAfterSelectionFill = await page.evaluate(() =>
      Array.from(window.__shadowpaintDebug?.readFlatCanvasRgba(160, 160) ?? []),
    );
    expect(heightAfterSelectionFill[cornerPxIdx]).toBe(0);

    // Also fill opacity selection to 50% so cross-section transmission profile has real relief variation
    await page.keyboard.press('3');
    await page.getByTestId('fill-opacity-input').fill('50');
    await page.getByTestId('btn-fill-selection').click();
    await page.waitForTimeout(80);

    // Re-enable mask overlay for later inspection
    await page.locator('#selection-strip-overlay').click();

    // 3. Linear Gradient (2.3) on Color map constrained inside active selection
    await page.keyboard.press('1');
    await page.getByTestId('mode-color').click();
    await page.keyboard.press('g');
    await expect(page.getByTestId('tool-gradient')).toHaveAttribute('aria-pressed', 'true');
    await expect(page.getByTestId('gradient-only-selection')).toBeChecked();

    await page.getByTestId('gradient-start-color-hex').fill('#ff3300');
    await page.getByTestId('gradient-start-color-hex').press('Enter');
    await page.getByTestId('gradient-end-color-hex').fill('#0055ff');
    await page.getByTestId('gradient-end-color-hex').press('Enter');

    await page.mouse.move(cx - 40, cy);
    await page.mouse.down();
    await page.mouse.move(cx + 40, cy, { steps: 5 });
    await page.mouse.up();

    await expect
      .poll(async () =>
        page.evaluate(() => {
          const rgba = window.__shadowpaintDebug?.getMapEffectiveRgba();
          return rgba ? (rgba[(80 * 160 + 50) * 4] ?? 0) : 0;
        }),
      )
      .toBeLessThan(240);

    const colorAfterGrad = await page.evaluate(() =>
      Array.from(window.__shadowpaintDebug?.getMapEffectiveRgba() ?? []),
    );
    const leftInsideIdx = (80 * 160 + 50) * 4;
    const rightInsideIdx = (80 * 160 + 110) * 4;
    expect(colorAfterGrad[leftInsideIdx] ?? 0).toBeGreaterThan(colorAfterGrad[rightInsideIdx] ?? 0);
    // Corner outside selection retains default canvas base color (#f4f1ea -> 244,241,234)
    expect(colorAfterGrad[cornerPxIdx]).toBe(244);

    // Clear selection, then run Smooth (S) and Blur (R) strokes on Height edges (2.2)
    await page.keyboard.press('Control+d');
    await page.keyboard.press('2');
    await page.getByTestId('mode-height').click();

    await page.keyboard.press('s');
    await expect(page.getByTestId('tool-smooth')).toHaveAttribute('aria-pressed', 'true');
    await page.mouse.move(cx - 40, cy - 20);
    await page.mouse.down();
    await page.mouse.move(cx - 40, cy + 20, { steps: 5 });
    await page.mouse.up();

    await page.keyboard.press('r');
    await expect(page.getByTestId('tool-blur')).toHaveAttribute('aria-pressed', 'true');
    await page.mouse.move(cx + 40, cy - 20);
    await page.mouse.down();
    await page.mouse.move(cx + 40, cy + 20, { steps: 5 });
    await page.mouse.up();

    // 4. Grid & Rulers (2.4) + Ruler measurement tool (2.5)
    await page.keyboard.press('Control+Quote');
    await expect(page.getByTestId('btn-toggle-grid-2d')).toHaveAttribute('aria-pressed', 'true');
    await expect(page.getByTestId('btn-toggle-rulers')).toHaveAttribute('aria-pressed', 'true');
    await page.keyboard.press('Control+KeyR');
    await expect(page.getByTestId('btn-toggle-rulers')).toHaveAttribute('aria-pressed', 'false');
    await page.keyboard.press('Control+KeyR');
    await expect(page.getByTestId('btn-toggle-rulers')).toHaveAttribute('aria-pressed', 'true');

    await page.keyboard.press('u');
    await expect(page.getByTestId('tool-ruler')).toHaveAttribute('aria-pressed', 'true');
    await page.mouse.move(cx - 40, cy - 55);
    await page.mouse.down();
    await page.mouse.move(cx + 40, cy - 55, { steps: 4 });
    await page.mouse.up();

    await expect(page.getByTestId('ruler-readout')).toBeVisible();
    await expect(page.getByTestId('ruler-length-cm')).toContainText('cm');
    await page.getByTestId('btn-ruler-clear').click();
    await expect(page.getByTestId('ruler-empty')).toBeVisible();

    // 5. Cross-Section (2.6) across the relief block -> open Section panel + True scale + hover
    await page.keyboard.press('x');
    await expect(page.getByTestId('tool-crossSection')).toHaveAttribute('aria-pressed', 'true');
    await page.mouse.move(cx - 70, cy);
    await page.mouse.down();
    await page.mouse.move(cx + 70, cy, { steps: 6 });
    await page.mouse.up();

    await page.getByTestId('btn-open-section-panel').click();
    await expect(page.getByTestId('cross-section-panel')).toBeVisible();
    await expect(page.getByTestId('section-height-path')).toBeVisible();
    await expect(page.getByTestId('section-transmission-path')).toBeVisible();

    const fitPathD = await page.getByTestId('section-height-path').getAttribute('d');
    await page.getByTestId('section-scale-true').click();
    const truePathD = await page.getByTestId('section-height-path').getAttribute('d');
    expect(truePathD).not.toEqual(fitPathD);
    await page.getByTestId('section-scale-fit').click();

    const hoverSurface = page.getByTestId('section-hover-surface');
    const hsBox = await hoverSurface.boundingBox();
    expect(hsBox).not.toBeNull();
    if (!hsBox) return;
    await page.mouse.move(hsBox.x + hsBox.width * 0.5, hsBox.y + hsBox.height * 0.5);
    await expect(page.getByTestId('section-hover-readout')).toContainText('mm');
    await expect(page.getByTestId('section-hover-readout')).toContainText('T ');

    // 6. Advanced Optics (2.7): material preset + T(d) curve + Combined mode + cursor back T %
    await page.getByTestId('right-tab-material').click();
    await page.getByTestId('material-preset').click();
    await page.getByRole('option', { name: 'Acrylic opaque' }).click();
    await expect(page.getByTestId('material-td-chart')).toBeVisible();
    await expect(page.getByTestId('material-td-white-path')).toBeVisible();

    await page.getByTestId('mode-combined').click();
    await page.mouse.move(cx, cy);
    await expect(page.getByTestId('statusbar-readout')).toContainText('back T');

    // 7. IndexedDB Autosave (2.8) + Reload + RestoreSessionDialog + byte-for-byte check
    const indicator = page.getByTestId('autosave-indicator');
    await expect(indicator).toHaveAttribute('data-status', 'saved', { timeout: 12_000 });

    const preReloadSnapshot = await page.evaluate(() => {
      const dbg = window.__shadowpaintDebug;
      if (!dbg) return null;
      return {
        rgba: Array.from(dbg.getMapEffectiveRgba()),
        dims: dbg.getBuiltDimensions(),
      };
    });
    expect(preReloadSnapshot).not.toBeNull();
    if (!preReloadSnapshot) return;

    page.once('dialog', (dialog) => {
      void dialog.accept();
    });
    await page.reload();

    await expect(page.getByTestId('restore-session-dialog')).toBeVisible();
    await page.getByTestId('restore-session-confirm').click();
    await expect(page.getByTestId('restore-session-dialog')).toBeHidden();
    await expect(page.getByTestId('topbar-project-name')).toHaveText('Stage 2 Studio');

    const postReloadSnapshot = await page.evaluate(() => {
      const dbg = window.__shadowpaintDebug;
      if (!dbg) return null;
      return {
        rgba: Array.from(dbg.getMapEffectiveRgba()),
        dims: dbg.getBuiltDimensions(),
      };
    });
    expect(postReloadSnapshot).toEqual(preReloadSnapshot);

    // 8. Save .relief (2.9) -> modify project -> open .relief -> confirm discard -> verify restoration
    await page.getByTestId('btn-save-menu').click();
    const downloadPromise = page.waitForEvent('download');
    await page.getByTestId('menu-download-relief').click();
    const reliefDownload = await downloadPromise;
    expect(reliefDownload.suggestedFilename()).toBe('stage-2-studio.relief');

    const stream = await reliefDownload.createReadStream();
    const chunks: Buffer[] = [];
    for await (const chunk of stream) {
      chunks.push(chunk as Buffer);
    }
    const reliefBytes = new Uint8Array(Buffer.concat(chunks));
    expect(reliefBytes[0]).toBe(0x50);
    expect(reliefBytes[1]).toBe(0x4b);
    await expect(page.getByTestId('btn-save-menu')).toHaveAttribute('data-dirty', 'false');

    // Modify material parameter to make project dirty
    await page.getByTestId('right-tab-material').click();
    const beforeMuA = await page.getByTestId('material-mu-a').inputValue();
    await page.getByTestId('material-mu-a').fill('4.8');
    await page.getByTestId('material-mu-a').press('Enter');
    await expect(page.getByTestId('btn-save-menu')).toHaveAttribute('data-dirty', 'true');

    // Open saved .relief -> unsaved dialog -> confirm -> exact restoration
    const fileInput = page.getByTestId('open-project-file-input');
    await fileInput.setInputFiles({
      name: 'stage-2-studio.relief',
      mimeType: 'application/zip',
      buffer: Buffer.from(reliefBytes),
    });
    await expect(page.getByTestId('confirm-unsaved-open-dialog')).toBeVisible();
    await page.getByTestId('confirm-unsaved-open-proceed').click();
    await expect(page.getByTestId('confirm-unsaved-open-dialog')).toBeHidden();
    await expect(page.getByTestId('btn-save-menu')).toHaveAttribute('data-dirty', 'false');
    await expect(page.getByTestId('material-mu-a')).toHaveValue(beforeMuA);

    const postOpenSnapshot = await page.evaluate(() => {
      const dbg = window.__shadowpaintDebug;
      if (!dbg) return null;
      return {
        rgba: Array.from(dbg.getMapEffectiveRgba()),
        dims: dbg.getBuiltDimensions(),
      };
    });
    expect(postOpenSnapshot).toEqual(preReloadSnapshot);

    // 9. Full EN <-> PL translation sweep across all Stage 2 panels, dialogs & error toasts
    await page.getByTestId('lang-pl').click();
    await expect(page.getByTestId('btn-open-project')).toContainText('Otwórz');
    await expect(page.getByTestId('btn-save-menu')).toContainText('Zapisz');
    await expect(page.getByTestId('right-tab-map')).toHaveText('Mapa');
    await expect(page.getByTestId('right-tab-canvas')).toHaveText('Płótno');
    await expect(page.getByTestId('right-tab-light')).toHaveText('Światło');
    await expect(page.getByTestId('right-tab-material')).toHaveText('Materiał');
    await expect(page.getByTestId('right-tab-section')).toHaveText('Przekrój');
    await expect(page.getByTestId('right-tab-export')).toHaveText('Eksport');

    for (const tabId of [
      'right-tab-map',
      'right-tab-canvas',
      'right-tab-light',
      'right-tab-material',
      'right-tab-section',
      'right-tab-export',
    ]) {
      await page.getByTestId(tabId).click();
      await assertNoRawTranslationKeys(page);
    }

    await page.getByTestId('btn-recent-projects').click();
    await expect(page.getByTestId('recent-projects-dialog')).toContainText('Ostatnie projekty');
    await assertNoRawTranslationKeys(page);
    await page
      .getByTestId('recent-projects-dialog')
      .getByRole('button', { name: 'Zamknij' })
      .click();

    await fileInput.setInputFiles({
      name: 'broken-stage2.relief',
      mimeType: 'application/zip',
      buffer: Buffer.from(new TextEncoder().encode('corrupted-zip-data')),
    });
    await expect(
      page.getByText('Plik projektu jest uszkodzony: broken-stage2.relief'),
    ).toBeVisible();

    await page.getByTestId('lang-en').click();
    for (const tabId of [
      'right-tab-map',
      'right-tab-canvas',
      'right-tab-light',
      'right-tab-material',
      'right-tab-section',
      'right-tab-export',
    ]) {
      await page.getByTestId(tabId).click();
      await assertNoRawTranslationKeys(page);
    }

    expect(errors).toEqual([]);
  });
});
