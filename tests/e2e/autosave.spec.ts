import { expect, test } from '@playwright/test';

test.describe('IndexedDB Autosave & Recent Projects (Task 2.8)', () => {
  test('autosaves dirty maps and settings, restores byte-for-byte after reload, downloads .relief, deletes project, and translates EN/PL', async ({
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
    await page.locator('#np-name').fill('Autosave Session E2E');
    await page.locator('#np-lock-aspect').uncheck();
    await page.locator('#np-width-cm').fill('50');
    await page.locator('#np-height-cm').fill('50');
    await page.locator('#np-res-mode').click();
    await page.getByRole('option', { name: 'Width in px' }).click();
    await page.locator('#np-width-px').fill('200');
    await page.getByTestId('new-project-submit').click();
    await expect(page.getByRole('dialog')).toBeHidden();

    // Paint distinct block & change material parameter
    await page.evaluate(() => {
      const dbg = window.__shadowpaintDebug;
      if (!dbg) return;
      dbg.emitColorDirtyBlock(30, 40, 25, 25, [17, 136, 221, 255]);
      dbg.emitHeightDirtyBlock(30, 40, 25, 25, 0.72);
    });

    await page.getByTestId('right-tab-material').click();
    await page.getByTestId('material-mu-a').fill('2.75');
    await page.getByTestId('material-mu-a').press('Enter');

    // Wait for debounced IndexedDB autosave
    const indicator = page.getByTestId('autosave-indicator');
    await expect(indicator).toHaveAttribute('data-status', 'saved', { timeout: 10_000 });
    await expect(indicator).toContainText(/Saved/);

    // Verify localStorage does NOT contain any map buffers
    const localStorageKeys = await page.evaluate(() => Object.keys(window.localStorage));
    expect(localStorageKeys.every((k) => k === 'shadowpaint.locale')).toBe(true);

    const beforeSnapshot = await page.evaluate(() => {
      const dbg = window.__shadowpaintDebug;
      if (!dbg) return null;
      return {
        rgba: Array.from(dbg.getMapEffectiveRgba()),
        dims: dbg.getBuiltDimensions(),
      };
    });
    expect(beforeSnapshot).not.toBeNull();
    if (!beforeSnapshot) return;

    // Reload tab and verify RestoreSessionDialog appears
    await page.reload();
    await expect(page.getByTestId('restore-session-dialog')).toBeVisible();
    await expect(page.getByTestId('restore-session-prompt')).toContainText('Autosave Session E2E');

    // Restore session and verify byte-for-byte parity
    await page.getByTestId('restore-session-confirm').click();
    await expect(page.getByTestId('restore-session-dialog')).toBeHidden();
    await expect(page.getByTestId('topbar-project-name')).toHaveText('Autosave Session E2E');

    const afterSnapshot = await page.evaluate(() => {
      const dbg = window.__shadowpaintDebug;
      if (!dbg) return null;
      return {
        rgba: Array.from(dbg.getMapEffectiveRgba()),
        dims: dbg.getBuiltDimensions(),
      };
    });
    expect(afterSnapshot).not.toBeNull();
    if (!afterSnapshot) return;
    expect(afterSnapshot.dims).toEqual(beforeSnapshot.dims);
    expect(afterSnapshot.rgba).toEqual(beforeSnapshot.rgba);

    await page.getByTestId('right-tab-material').click();
    await expect(page.getByTestId('material-mu-a')).toHaveValue('2.75');

    // Open Recent Projects dialog, verify thumbnail, quota, .relief download, PL translation, and Delete
    await page.getByTestId('btn-recent-projects').click();
    const recentDialog = page.getByTestId('recent-projects-dialog');
    await expect(recentDialog).toBeVisible();
    await expect(page.getByTestId('recent-projects-quota')).toBeVisible();
    await expect(recentDialog.locator('img')).toBeVisible();

    const downloadPromise = page.waitForEvent('download');
    await recentDialog.locator('[data-testid^="recent-download-"]').first().click();
    const download = await downloadPromise;
    expect(download.suggestedFilename()).toBe('autosave-session-e2e.relief');
    const stream = await download.createReadStream();
    const chunks: Buffer[] = [];
    for await (const chunk of stream) {
      chunks.push(chunk as Buffer);
    }
    const archiveBytes = Buffer.concat(chunks);
    expect(archiveBytes[0]).toBe(0x50); // 'P'
    expect(archiveBytes[1]).toBe(0x4b); // 'K'

    await recentDialog.getByRole('button', { name: 'Close' }).first().click();
    await expect(recentDialog).toBeHidden();

    // Switch to Polish and verify localized Recent Projects + Autosave UI
    await page.getByTestId('lang-pl').click();
    await expect(indicator).toContainText(/Zapisano/);
    await page.getByTestId('btn-recent-projects').click();
    await expect(recentDialog).toContainText('Ostatnie projekty');

    await recentDialog.locator('[data-testid^="recent-delete-"]').first().click();
    await expect(page.getByTestId('recent-projects-empty')).toBeVisible();
    await recentDialog.getByRole('button', { name: 'Zamknij' }).click();

    expect(errors).toEqual([]);
  });
});
