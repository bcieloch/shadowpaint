import { expect, test } from '@playwright/test';

test.describe('PWA & Offline Support (Task 3.6)', () => {
  test('serves valid relative webmanifest + icons, registers active SW, and boots cleanly offline', async ({
    page,
    context,
  }) => {
    const errors: string[] = [];
    page.on('pageerror', (err) => errors.push(err.message));
    page.on('console', (msg) => {
      if (msg.type() === 'error') errors.push(msg.text());
    });

    await page.setViewportSize({ width: 1280, height: 800 });
    await page.goto('/');

    // Verify webmanifest & relative icon assets (GitHub Pages subpath-compatible)
    const manifestRes = await page.request.get('/manifest.webmanifest');
    expect(manifestRes.status()).toBe(200);
    const manifest = (await manifestRes.json()) as {
      name: string;
      start_url: string;
      scope: string;
      display: string;
      theme_color: string;
      icons: Array<{ src: string; sizes: string }>;
    };
    expect(manifest.name).toBe('ShadowPaint');
    expect(manifest.start_url).toBe('./');
    expect(manifest.scope).toBe('./');
    expect(manifest.display).toBe('standalone');
    expect(manifest.theme_color).toBe('#0b0b0d');
    expect(manifest.icons.length).toBeGreaterThanOrEqual(3);
    expect(manifest.icons.every((icon) => icon.src.startsWith('./icons/'))).toBe(true);

    for (const icon of manifest.icons) {
      const iconPath = icon.src.replace(/^\.\//, '/');
      const res = await page.request.get(iconPath);
      expect(res.status(), `Expected 200 for ${iconPath}`).toBe(200);
    }

    // Wait for Workbox Service Worker activation & page control
    const swReady = await page.evaluate(async () => {
      if (!('serviceWorker' in navigator)) return false;
      const reg = await navigator.serviceWorker.ready;
      return Boolean(reg.active);
    });
    expect(swReady).toBe(true);

    // Ensure controller is attached before switching offline
    await page.waitForFunction(() => navigator.serviceWorker.controller !== null, undefined, {
      timeout: 15_000,
    });

    try {
      await context.setOffline(true);

      // Full reload while completely offline — served from Workbox precache
      await page.reload({ waitUntil: 'domcontentloaded' });
      await expect(page.getByTestId('viewport-canvas-area')).toBeVisible({ timeout: 15_000 });
      await expect(page.getByTestId('topbar-project-name')).toBeVisible();

      // Verify interactive UI & i18n continue working offline
      await page.getByTestId('lang-pl').click();
      await expect(page.getByTestId('btn-new-project')).toContainText('Nowy projekt');
      await page.getByTestId('lang-en').click();
      await expect(page.getByTestId('btn-new-project')).toContainText('New Project');
    } finally {
      await context.setOffline(false);
    }

    expect(errors).toEqual([]);
  });
});
