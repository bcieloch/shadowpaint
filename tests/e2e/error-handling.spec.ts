import { expect, test } from '@playwright/test';

test.describe('Final QA — Error Handling & WebGL Context Recovery (Task 3.7)', () => {
  test('displays localized errors for unsupported/corrupted image imports and recovers from WebGL context loss in EN and PL', async ({
    page,
  }) => {
    const pageErrors: string[] = [];
    page.on('pageerror', (err) => pageErrors.push(err.message));

    await page.setViewportSize({ width: 1280, height: 800 });
    await page.goto('/');
    await expect(page.getByTestId('viewport-canvas-area')).toBeVisible();

    // 1. Open Import Wizard and test unsupported format error in EN
    await page.getByTestId('btn-import-wizard').click();
    const colorSlot = page.getByTestId('import-slot-color');
    await expect(colorSlot).toBeVisible();

    const fileInput = colorSlot.locator('input[type="file"]');
    await fileInput.setInputFiles({
      name: 'invalid.txt',
      mimeType: 'text/plain',
      buffer: Buffer.from('not an image file'),
    });

    await expect(
      page.getByText('Unsupported file format for "invalid.txt". Use PNG, JPG/JPEG, or TIFF.'),
    ).toBeVisible();

    // 2. Test corrupted PNG header error in EN
    await fileInput.setInputFiles({
      name: 'corrupted.png',
      mimeType: 'image/png',
      buffer: Buffer.from([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a, 0x00, 0x01, 0x02]),
    });

    await expect(
      page.getByText('Could not decode "corrupted.png". The file appears to be corrupted.'),
    ).toBeVisible();

    // Close Import Wizard
    await page.keyboard.press('Escape');

    // 3. Switch to Polish and verify localized unsupported format error
    await page.getByTestId('lang-pl').click();
    await page.getByTestId('btn-import-wizard').click();

    const plFileInput = page.getByTestId('import-slot-color').locator('input[type="file"]');
    await plFileInput.setInputFiles({
      name: 'dokument.txt',
      mimeType: 'text/plain',
      buffer: Buffer.from('zly format'),
    });

    await expect(
      page.getByText('Nieobsługiwany format pliku „dokument.txt”. Użyj PNG, JPG/JPEG lub TIFF.'),
    ).toBeVisible();

    await page.keyboard.press('Escape');

    // 4. Verify WebGL context lost and restored toasts in Polish
    await page.evaluate(() => {
      const canvas = document.querySelector('[data-testid="viewport-webgl-canvas"]');
      canvas?.dispatchEvent(new Event('webglcontextlost', { cancelable: true }));
    });
    await expect(
      page.getByText('Utracono kontekst graficzny WebGL2. Próba przywrócenia…'),
    ).toBeVisible();

    await page.evaluate(() => {
      const canvas = document.querySelector('[data-testid="viewport-webgl-canvas"]');
      canvas?.dispatchEvent(new Event('webglcontextrestored'));
    });
    await expect(page.getByText('Przywrócono kontekst graficzny WebGL2.')).toBeVisible();

    // 5. Switch back to English and verify canvas validation error for oversized resolution
    await page.getByTestId('lang-en').click();
    await page.getByTestId('btn-new-project').click();
    await page.locator('#np-width-cm').fill('1000');
    await page.locator('#np-px-cm').fill('100');

    await expect(page.getByTestId('new-project-errors')).toBeVisible();
    await expect(page.getByTestId('new-project-submit')).toBeDisabled();

    expect(pageErrors).toEqual([]);
  });
});
