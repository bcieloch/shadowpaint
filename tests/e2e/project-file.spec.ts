import { expect, test } from '@playwright/test';
import { unzipSync, zipSync } from 'fflate';

test.describe('Project .relief/.zip File Open, Save & Protection (Task 2.9)', () => {
  test('saves/downloads .relief, warns on unsaved Open/New/beforeunload, restores byte-for-byte via open & drop, rejects corrupted ZIP, and translates EN/PL', async ({
    page,
  }) => {
    const errors: string[] = [];
    page.on('pageerror', (err) => errors.push(err.message));
    page.on('console', (msg) => {
      if (msg.type() === 'error') errors.push(msg.text());
    });

    await page.setViewportSize({ width: 1280, height: 800 });
    await page.goto('/');

    // 1. Create a 20x20 cm (100x100 px) project
    await page.getByTestId('btn-new-project').click();
    await page.locator('#np-name').fill('Studio Relief Test');
    await page.locator('#np-lock-aspect').uncheck();
    await page.locator('#np-width-cm').fill('20');
    await page.locator('#np-height-cm').fill('20');
    await page.locator('#np-res-mode').click();
    await page.getByRole('option', { name: 'Width in px' }).click();
    await page.locator('#np-width-px').fill('100');
    await page.getByTestId('new-project-submit').click();
    await expect(page.getByRole('dialog')).toBeHidden();

    await expect(page.getByTestId('btn-save-menu')).toHaveAttribute('data-dirty', 'false');

    // 2. Draw a selection + paint color/height strokes + change material parameter
    await page.getByTestId('tool-selectRect').click();
    const canvasArea = page.getByTestId('viewport-canvas-area');
    const box = await canvasArea.boundingBox();
    expect(box).not.toBeNull();
    if (!box) return;

    await page.mouse.move(box.x + box.width * 0.35, box.y + box.height * 0.35);
    await page.mouse.down();
    await page.mouse.move(box.x + box.width * 0.65, box.y + box.height * 0.65);
    await page.mouse.up();

    await page.getByTestId('tool-brush').click();
    await page.mouse.move(box.x + box.width * 0.5, box.y + box.height * 0.5);
    await page.mouse.down();
    await page.mouse.move(box.x + box.width * 0.55, box.y + box.height * 0.52);
    await page.mouse.up();

    await page.getByTestId('right-tab-material').click();
    await page.getByTestId('material-mu-a').fill('3.1');
    await page.getByTestId('material-mu-a').press('Enter');

    await expect(page.getByTestId('btn-save-menu')).toHaveAttribute('data-dirty', 'true');
    await expect(page.getByTestId('unsaved-dot')).toBeVisible();

    const savedSnapshot = await page.evaluate(() => {
      const dbg = window.__shadowpaintDebug;
      if (!dbg) return null;
      return {
        rgba: Array.from(dbg.getMapEffectiveRgba()),
        dims: dbg.getBuiltDimensions(),
      };
    });
    expect(savedSnapshot).not.toBeNull();
    if (!savedSnapshot) return;

    // 3. Download .relief via Save menu and inspect archive bytes
    await page.getByTestId('btn-save-menu').click();
    const downloadPromise = page.waitForEvent('download');
    await page.getByTestId('menu-download-relief').click();
    const download = await downloadPromise;
    expect(download.suggestedFilename()).toBe('studio-relief-test.relief');

    const stream = await download.createReadStream();
    const chunks: Buffer[] = [];
    for await (const chunk of stream) {
      chunks.push(chunk as Buffer);
    }
    const reliefBytes = new Uint8Array(Buffer.concat(chunks));
    expect(reliefBytes[0]).toBe(0x50);
    expect(reliefBytes[1]).toBe(0x4b);

    // Dirty indicator clears after saving
    await expect(page.getByTestId('btn-save-menu')).toHaveAttribute('data-dirty', 'false');
    await expect(page.getByTestId('unsaved-dot')).toBeHidden();

    // 4. Modify project again -> verify dirty & beforeunload warning
    await page.getByTestId('material-mu-a').fill('1.1');
    await page.getByTestId('material-mu-a').press('Enter');
    await expect(page.getByTestId('btn-save-menu')).toHaveAttribute('data-dirty', 'true');

    const dialogTypePromise = new Promise<string>((resolve) => {
      page.once('dialog', (dialog) => {
        const kind = dialog.type();
        void dialog.dismiss().then(() => resolve(kind));
      });
    });
    await page.evaluate(() => {
      setTimeout(() => window.location.reload(), 0);
    });
    expect(await dialogTypePromise).toBe('beforeunload');
    await expect(page.getByTestId('material-mu-a')).toHaveValue('1.1');

    // 5. Try opening the saved .relief while dirty -> test Cancel then Confirm
    const fileInput = page.getByTestId('open-project-file-input');
    await fileInput.setInputFiles({
      name: 'studio-relief-test.relief',
      mimeType: 'application/zip',
      buffer: Buffer.from(reliefBytes),
    });

    const unsavedDialog = page.getByTestId('confirm-unsaved-open-dialog');
    await expect(unsavedDialog).toBeVisible();
    await page.getByTestId('confirm-unsaved-open-cancel').click();
    await expect(unsavedDialog).toBeHidden();
    await expect(page.getByTestId('material-mu-a')).toHaveValue('1.1');

    // Open again and confirm discarding unsaved changes
    await fileInput.setInputFiles({
      name: 'studio-relief-test.relief',
      mimeType: 'application/zip',
      buffer: Buffer.from(reliefBytes),
    });
    await expect(unsavedDialog).toBeVisible();
    await page.getByTestId('confirm-unsaved-open-proceed').click();
    await expect(unsavedDialog).toBeHidden();
    await expect(page.getByText(/Opened project "studio-relief-test\.relief"/)).toBeVisible();

    await expect(page.getByTestId('btn-save-menu')).toHaveAttribute('data-dirty', 'false');
    await expect(page.getByTestId('material-mu-a')).toHaveValue('3.1');

    const restoredSnapshot = await page.evaluate(() => {
      const dbg = window.__shadowpaintDebug;
      if (!dbg) return null;
      return {
        rgba: Array.from(dbg.getMapEffectiveRgba()),
        dims: dbg.getBuiltDimensions(),
      };
    });
    expect(restoredSnapshot).toEqual(savedSnapshot);

    // 6. Test Ctrl+S and Ctrl+Shift+S shortcuts
    await page.getByTestId('viewport-canvas-area').click();
    const ctrlSPromise = page.waitForEvent('download');
    await page.keyboard.press('Control+s');
    const ctrlSDownload = await ctrlSPromise;
    expect(ctrlSDownload.suggestedFilename()).toBe('studio-relief-test.relief');

    const ctrlShiftSPromise = page.waitForEvent('download');
    await page.keyboard.press('Control+Shift+s');
    const ctrlShiftSDownload = await ctrlShiftSPromise;
    expect(ctrlShiftSDownload.suggestedFilename()).toBe('studio-relief-test.relief');

    // 7. Modify again, then drag-and-drop .relief onto WindowDropOverlay
    await page.getByTestId('material-mu-a').fill('2.4');
    await page.getByTestId('material-mu-a').press('Enter');
    await expect(page.getByTestId('btn-save-menu')).toHaveAttribute('data-dirty', 'true');

    await page.evaluate((bytes) => {
      const dt = new DataTransfer();
      dt.items.add(new File([new Uint8Array(bytes)], 'dropped.relief', { type: 'application/zip' }));
      window.dispatchEvent(new DragEvent('dragenter', { bubbles: true, cancelable: true, dataTransfer: dt }));
    }, Array.from(reliefBytes));

    await expect(page.getByTestId('window-drop-relief')).toBeVisible();

    await page.evaluate((bytes) => {
      const dt = new DataTransfer();
      dt.items.add(new File([new Uint8Array(bytes)], 'dropped.relief', { type: 'application/zip' }));
      const target = document.querySelector('[data-testid="window-drop-relief"]');
      if (target) {
        target.dispatchEvent(new DragEvent('drop', { bubbles: true, cancelable: true, dataTransfer: dt }));
      }
    }, Array.from(reliefBytes));

    await expect(unsavedDialog).toBeVisible();
    await page.getByTestId('confirm-unsaved-open-proceed').click();
    await expect(page.getByTestId('material-mu-a')).toHaveValue('3.1');
    await expect(page.getByTestId('btn-save-menu')).toHaveAttribute('data-dirty', 'false');

    // 8. Test corrupted CRC .relief file -> error toast, project untouched
    const tamperedFiles = unzipSync(reliefBytes);
    const hw = tamperedFiles['maps/height.working.f32'];
    if (hw) {
      hw[0] = (hw[0] ?? 0) ^ 0xff;
    }
    const corruptedZip = zipSync(tamperedFiles);

    await fileInput.setInputFiles({
      name: 'broken.relief',
      mimeType: 'application/zip',
      buffer: Buffer.from(corruptedZip),
    });
    await expect(page.getByText('Project file is corrupted: broken.relief')).toBeVisible();

    const afterCorruptSnapshot = await page.evaluate(() => {
      const dbg = window.__shadowpaintDebug;
      if (!dbg) return null;
      return {
        rgba: Array.from(dbg.getMapEffectiveRgba()),
        dims: dbg.getBuiltDimensions(),
      };
    });
    expect(afterCorruptSnapshot).toEqual(savedSnapshot);

    // 9. Switch to Polish and verify localized TopBar, Save menu, and corrupted error toast
    await page.getByTestId('lang-pl').click();
    await expect(page.getByTestId('btn-open-project')).toContainText('Otwórz');
    await expect(page.getByTestId('btn-save-menu')).toContainText('Zapisz');

    await page.getByTestId('btn-save-menu').click();
    await expect(page.getByTestId('menu-save')).toContainText('Zapisz');
    await expect(page.getByTestId('menu-save-as')).toContainText('Zapisz jako');
    await expect(page.getByTestId('menu-download-relief')).toContainText('Pobierz .relief');
    await page.keyboard.press('Escape');

    await fileInput.setInputFiles({
      name: 'uszkodzony.relief',
      mimeType: 'application/zip',
      buffer: Buffer.from(new TextEncoder().encode('invalid-zip-payload')),
    });
    await expect(page.getByText('Plik projektu jest uszkodzony: uszkodzony.relief')).toBeVisible();

    expect(errors).toEqual([]);
  });
});
