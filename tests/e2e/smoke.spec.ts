import { expect, test } from '@playwright/test';

test('studio shell renders without scrollbars, switches EN/PL, and creates a new project', async ({
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
  await expect(page).toHaveTitle(/ShadowPaint/);
  await expect(page.getByTestId('topbar-project-name')).toHaveText('Untitled');

  const noScroll = await page.evaluate(() => ({
    scrollW: document.documentElement.scrollWidth,
    innerW: window.innerWidth,
    scrollH: document.documentElement.scrollHeight,
    innerH: window.innerHeight,
  }));
  expect(noScroll.scrollW).toBeLessThanOrEqual(noScroll.innerW);
  expect(noScroll.scrollH).toBeLessThanOrEqual(noScroll.innerH);

  await page.getByTestId('lang-pl').click();
  await expect(page.getByTestId('topbar-project-name')).toHaveText('Bez tytułu');

  await page.getByTestId('lang-en').click();
  await expect(page.getByTestId('topbar-project-name')).toHaveText('Untitled');

  await page.getByTestId('btn-new-project').click();
  await page.locator('#np-name').fill('Aurora Relief');
  await page.locator('#np-px-cm').fill('10');
  await page.getByTestId('new-project-submit').click();
  await expect(page.getByTestId('topbar-project-name')).toHaveText('Aurora Relief');

  expect(errors).toEqual([]);
});
