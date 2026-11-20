import { expect, test } from '@playwright/test';

test.describe('Responsive Panels, Dexie uiLayout & Accessibility (Task 3.3)', () => {
  test('persists panel widths, splitRatio, rightTab, and panelsHidden in Dexie meta.uiLayout without writing layout to localStorage', async ({
    page,
  }) => {
    test.slow();
    const errors: string[] = [];
    page.on('pageerror', (err) => errors.push(err.message));
    page.on('console', (msg) => {
      if (msg.type() === 'error') errors.push(msg.text());
    });

    await page.setViewportSize({ width: 1360, height: 800 });
    await page.goto('/');

    // Wait for initial left & right docked panels
    const leftHandle = page.locator('[data-slot="resizable-handle"]').first();
    await expect(leftHandle).toBeVisible();
    await expect(page.getByText('Workspace & Tools')).toBeVisible();

    const initialLeftBox = await page.locator('#left-panel').boundingBox();
    expect(initialLeftBox).not.toBeNull();
    if (!initialLeftBox) return;

    // Drag left resizable handle +64 px wider
    const handleBox = await leftHandle.boundingBox();
    expect(handleBox).not.toBeNull();
    if (!handleBox) return;
    const hx = handleBox.x + handleBox.width / 2;
    const hy = handleBox.y + handleBox.height / 2;
    await page.mouse.move(hx, hy);
    await page.mouse.down();
    await page.mouse.move(hx + 64, hy, { steps: 6 });
    await page.mouse.up();

    const resizedLeftBox = await page.locator('#left-panel').boundingBox();
    expect(resizedLeftBox).not.toBeNull();
    if (!resizedLeftBox) return;
    expect(resizedLeftBox.width).toBeGreaterThan(initialLeftBox.width + 40);

    // Switch right tab and split layout ratio
    await page.getByTestId('right-tab-canvas').click();
    await expect(page.getByTestId('canvas-width-cm')).toBeVisible();

    await page.getByTestId('layout-split').click();
    const splitDivider = page.getByTestId('split-divider');
    await expect(splitDivider).toBeVisible();
    const divBox = await splitDivider.boundingBox();
    expect(divBox).not.toBeNull();
    if (!divBox) return;
    await page.mouse.move(divBox.x + divBox.width / 2, divBox.y + divBox.height / 2);
    await page.mouse.down();
    await page.mouse.move(divBox.x + 80, divBox.y + divBox.height / 2, { steps: 5 });
    await page.mouse.up();
    const expectedSplitValNow = await splitDivider.getAttribute('aria-valuenow');

    // Wait past debounce (100ms) for IndexedDB meta.uiLayout persistence
    await page.waitForTimeout(300);

    // Ensure localStorage only ever stores locale (never layout or buffers)
    const localStorageKeys = await page.evaluate(() => Object.keys(window.localStorage));
    expect(localStorageKeys.every((k) => k === 'shadowpaint.locale')).toBe(true);

    // Reload page and confirm panel width & right tab are restored from Dexie meta.uiLayout
    await page.reload();
    await expect(page.getByTestId('canvas-width-cm')).toBeVisible();
    const reloadedLeftBox = await page.locator('#left-panel').boundingBox();
    expect(reloadedLeftBox).not.toBeNull();
    if (!reloadedLeftBox) return;
    expect(Math.abs(reloadedLeftBox.width - resizedLeftBox.width)).toBeLessThanOrEqual(4);

    // Switch to split and confirm splitRatio was also restored from Dexie
    await page.getByTestId('layout-split').click();
    await expect(page.getByTestId('split-divider')).toHaveAttribute(
      'aria-valuenow',
      expectedSplitValNow ?? '',
    );

    // Collapse side panels via TopBar toggle button, persist across reload, then restore with Tab
    await page.getByTestId('btn-toggle-panels').click();
    await expect.poll(async () => (await page.locator('#left-panel').boundingBox())?.width ?? -1).toBe(0);
    await page.waitForTimeout(300);

    await page.reload();
    await expect.poll(async () => (await page.locator('#left-panel').boundingBox())?.width ?? -1).toBe(0);
    await page.keyboard.press('Tab');
    await expect
      .poll(async () => (await page.locator('#left-panel').boundingBox())?.width ?? 0)
      .toBeGreaterThan(200);
    const restoredWidthBox = await page.locator('#left-panel').boundingBox();
    expect(restoredWidthBox).not.toBeNull();
    if (!restoredWidthBox) return;
    expect(Math.abs(restoredWidthBox.width - resizedLeftBox.width)).toBeLessThanOrEqual(4);

    expect(errors).toEqual([]);
  });

  test('adapts across compact (1024-1279) and drawer (<1024) breakpoints without horizontal overflow and satisfies accessible control naming', async ({
    page,
  }) => {
    const errors: string[] = [];
    page.on('pageerror', (err) => errors.push(err.message));
    page.on('console', (msg) => {
      if (msg.type() === 'error') errors.push(msg.text());
    });

    // 1. Desktop accessibility check
    await page.setViewportSize({ width: 1280, height: 800 });
    await page.goto('/');
    await expect(page.locator('[data-breakpoint="desktop"]')).toBeVisible();

    const desktopIssues = await page.evaluate(() => {
      const problems: string[] = [];
      if (document.documentElement.scrollWidth > window.innerWidth) {
        problems.push(
          `Desktop horizontal overflow: ${document.documentElement.scrollWidth} > ${window.innerWidth}`,
        );
      }
      const controls = document.querySelectorAll('button, a[href], [role="slider"]');
      for (const el of controls) {
        const rect = el.getBoundingClientRect();
        if (rect.width === 0 || rect.height === 0) continue;
        const ariaLabel = el.getAttribute('aria-label')?.trim() ?? '';
        const ariaLabelledBy = el.getAttribute('aria-labelledby')?.trim() ?? '';
        const text = (el.textContent ?? '').trim();
        const title = el.getAttribute('title')?.trim() ?? '';
        const hasForLabel = Boolean(
          el.id && document.querySelector(`label[for="${CSS.escape(el.id)}"]`)?.textContent?.trim(),
        );
        if (!ariaLabel && !ariaLabelledBy && !text && !title && !hasForLabel) {
          problems.push(`Control missing accessible label: ${el.outerHTML.slice(0, 120)}`);
        }
      }
      return problems;
    });
    expect(desktopIssues).toEqual([]);

    // 2. Compact breakpoint (1024..1279 px)
    await page.setViewportSize({ width: 1100, height: 760 });
    await expect(page.locator('[data-breakpoint="compact"]')).toBeVisible();
    await expect(page.locator('#left-panel')).toBeVisible();
    await expect(page.locator('#right-panel')).toBeVisible();

    const compactOverflow = await page.evaluate(
      () => document.documentElement.scrollWidth > window.innerWidth,
    );
    expect(compactOverflow).toBe(false);

    // 3. Drawer breakpoint (< 1024 px)
    await page.setViewportSize({ width: 900, height: 700 });
    await expect(page.locator('[data-breakpoint="drawer"]')).toBeVisible();
    await expect(page.locator('#left-panel')).toHaveCount(0);
    await expect(page.locator('#right-panel')).toHaveCount(0);

    const drawerOverflow = await page.evaluate(
      () => document.documentElement.scrollWidth > window.innerWidth,
    );
    expect(drawerOverflow).toBe(false);

    // Open Left Sheet drawer and select Eraser tool
    await page.getByTestId('btn-toggle-left-drawer').click();
    await expect(page.getByTestId('left-drawer-sheet')).toBeVisible();
    await page.getByTestId('tool-eraser').click();
    await expect(page.getByTestId('tool-eraser')).toHaveAttribute('aria-pressed', 'true');
    await page.keyboard.press('Escape');
    await expect(page.getByTestId('left-drawer-sheet')).toBeHidden();

    // Open Right Sheet drawer, switch tab, switch EN <-> PL and check localization
    await page.getByTestId('btn-toggle-right-drawer').click();
    await expect(page.getByTestId('right-drawer-sheet')).toBeVisible();
    await page.getByTestId('right-tab-material').click();
    await expect(page.getByTestId('material-mu-a')).toBeVisible();
    await page.keyboard.press('Escape');
    await expect(page.getByTestId('right-drawer-sheet')).toBeHidden();

    await page.getByTestId('lang-pl').click();
    await expect(page.getByTestId('btn-toggle-left-drawer')).toHaveAttribute(
      'aria-label',
      'Pokaż szufladę narzędzi i warstw',
    );
    await expect(page.getByTestId('btn-toggle-right-drawer')).toHaveAttribute(
      'aria-label',
      'Pokaż szufladę inspektora',
    );

    expect(errors).toEqual([]);
  });
});
