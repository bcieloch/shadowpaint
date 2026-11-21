import { expect, test } from '@playwright/test';

test('keyboard shortcuts reference dialog, actions, editable guard, and EN/PL i18n', async ({
  page,
}) => {
  await page.goto('/');
  await expect(page.getByTestId('viewport-webgl-canvas')).toBeVisible();

  // '?' opens Keyboard Shortcuts dialog, 'Escape' closes it
  await page.keyboard.press('?');
  const shortcutsDialog = page.getByTestId('shortcuts-dialog');
  await expect(shortcutsDialog).toBeVisible();
  for (const groupId of ['tools', 'brush', 'mapsAndSelection', 'history', 'files', 'view']) {
    await expect(page.getByTestId(`shortcuts-group-${groupId}`)).toBeVisible();
  }
  await expect(shortcutsDialog).toHaveAttribute('data-state', 'open');
  await page.waitForTimeout(50);
  await page.keyboard.press('Escape');
  await expect(shortcutsDialog).not.toBeVisible();

  // TopBar button opens dialog and supports EN <-> PL switching
  await page.getByTestId('btn-shortcuts').click();
  await expect(shortcutsDialog).toContainText('Keyboard Shortcuts');
  await page.getByTestId('shortcuts-close').click();
  await expect(shortcutsDialog).not.toBeVisible();

  await page.getByTestId('lang-pl').click();
  await page.getByTestId('btn-shortcuts').click();
  await expect(shortcutsDialog).toContainText('Skróty klawiszowe');
  await expect(shortcutsDialog).not.toContainText('shortcuts.');
  await page.getByTestId('shortcuts-close').click();
  await page.getByTestId('lang-en').click();

  // Ctrl+Alt+N opens New Project dialog
  await page.keyboard.press('Control+Alt+KeyN');
  await expect(page.getByTestId('new-project-submit')).toBeVisible();
  await expect(page.getByRole('dialog')).toHaveAttribute('data-state', 'open');
  await page.waitForTimeout(50);
  await page.keyboard.press('Escape');
  await expect(page.getByTestId('new-project-submit')).not.toBeVisible();

  // Ctrl+I opens Import Wizard dialog
  await page.keyboard.press('Control+KeyI');
  await expect(page.getByTestId('import-apply-btn')).toBeVisible();
  await expect(page.getByRole('dialog')).toHaveAttribute('data-state', 'open');
  await page.waitForTimeout(50);
  await page.keyboard.press('Escape');
  await expect(page.getByTestId('import-apply-btn')).not.toBeVisible();

  // Brush size, hardness (Shift+[/]), flow (0, 4-9, Alt+1-3), active map (1-3)
  await page.keyboard.press('b');
  await expect(page.getByTestId('tool-brush')).toHaveAttribute('aria-pressed', 'true');

  const sizeInput = page.getByTestId('brush-size-input');
  const hardnessInput = page.getByLabel('Hardness', { exact: true });
  const flowInput = page.getByLabel('Flow', { exact: true });

  const initialSize = Number(await sizeInput.inputValue());
  await page.keyboard.press('BracketRight');
  expect(Number(await sizeInput.inputValue())).toBeGreaterThan(initialSize);
  await page.keyboard.press('BracketLeft');

  await expect(hardnessInput).toHaveValue('75');
  await page.keyboard.press('Shift+BracketRight');
  await expect(hardnessInput).toHaveValue('80');
  await page.keyboard.press('Shift+BracketLeft');
  await expect(hardnessInput).toHaveValue('75');

  await page.keyboard.press('5');
  await expect(flowInput).toHaveValue('50');
  await page.keyboard.press('0');
  await expect(flowInput).toHaveValue('100');
  await page.keyboard.press('Alt+Digit2');
  await expect(flowInput).toHaveValue('20');

  await page.keyboard.press('1');
  await expect(page.getByTestId('map-layer-color')).toHaveAttribute('aria-pressed', 'true');
  await page.keyboard.press('3');
  await expect(page.getByTestId('map-layer-opacity')).toHaveAttribute('aria-pressed', 'true');
  await page.keyboard.press('2');
  await expect(page.getByTestId('map-layer-height')).toHaveAttribute('aria-pressed', 'true');

  // Tool switching including Shift+M
  await page.keyboard.press('Shift+KeyM');
  await expect(page.getByTestId('tool-selectEllipse')).toHaveAttribute('aria-pressed', 'true');
  await page.keyboard.press('e');
  await expect(page.getByTestId('tool-eraser')).toHaveAttribute('aria-pressed', 'true');

  // 2D zoom +/- shortcuts
  const zoomBefore = parseInt(
    (await page.getByTestId('viewport-zoom-pct').textContent()) ?? '0',
    10,
  );
  await page.keyboard.press('Equal');
  const zoomIn = parseInt((await page.getByTestId('viewport-zoom-pct').textContent()) ?? '0', 10);
  expect(zoomIn).toBeGreaterThan(zoomBefore);
  await page.keyboard.press('Minus');
  const zoomOut = parseInt((await page.getByTestId('viewport-zoom-pct').textContent()) ?? '0', 10);
  expect(zoomOut).toBeLessThan(zoomIn);

  // Shortcuts are ignored while typing inside an input
  await sizeInput.click();
  await page.keyboard.type('b?');
  await expect(page.getByTestId('tool-eraser')).toHaveAttribute('aria-pressed', 'true');
  await expect(shortcutsDialog).not.toBeVisible();
  await sizeInput.evaluate((el) => (el as HTMLElement).blur());

  // Tab hides and restores side panels
  const leftPanel = page.locator('#left-panel');
  const rightPanel = page.locator('#right-panel');
  const widthBefore = (await leftPanel.boundingBox())?.width ?? 0;
  expect(widthBefore).toBeGreaterThan(180);

  await page.keyboard.press('Tab');
  await expect.poll(async () => (await leftPanel.boundingBox())?.width ?? -1).toBe(0);
  await expect.poll(async () => (await rightPanel.boundingBox())?.width ?? -1).toBe(0);

  await page.keyboard.press('Tab');
  await expect.poll(async () => (await leftPanel.boundingBox())?.width ?? 0).toBeGreaterThan(180);
  await expect.poll(async () => (await rightPanel.boundingBox())?.width ?? 0).toBeGreaterThan(200);
});

test('interactive tutorial & feature guide (F4) and customizable keyboard shortcuts with persistence', async ({
  page,
}) => {
  await page.goto('/');
  await expect(page.getByTestId('viewport-webgl-canvas')).toBeVisible();

  // Open Interactive Tutorial & Feature Guide with F4
  await page.keyboard.press('F4');
  const tutorialDialog = page.getByTestId('tutorial-dialog');
  await expect(tutorialDialog).toBeVisible();
  await expect(tutorialDialog).toContainText('Interactive Tutorial & Complete Feature Guide');
  await expect(page.getByTestId('tutorial-active-step')).toContainText('1.');

  // Navigate tutorial steps and test "Try it" action on Step 4 (Split view + Light tab)
  await page.getByTestId('tutorial-next-step').click();
  await expect(page.getByTestId('tutorial-active-step')).toContainText('2.');
  await page.getByTestId('tutorial-pill-lightingAndOptics').click();
  await expect(page.getByTestId('tutorial-active-step')).toContainText('4.');

  // Switch to All Features Reference tab and verify all 6 feature sections and vertical scrolling
  await page.getByTestId('guide-tab-features').click();
  for (const sectionId of [
    'mapsAndImport',
    'paintingAndMasking',
    'lightingAndOptics',
    'measurementAndSection',
    'workspaceAndShortcuts',
    'persistenceAndExport',
  ]) {
    await expect(page.getByTestId(`feature-section-${sectionId}`)).toBeVisible();
  }
  await expect(page.getByTestId('feature-shortcut-toolBrush')).toContainText('B');

  const tutorialScrollMetrics = await tutorialDialog
    .locator('[data-slot="scroll-area-viewport"]')
    .evaluate((el) => {
      el.scrollTop = 120;
      return {
        clientHeight: el.clientHeight,
        scrollHeight: el.scrollHeight,
        scrollTop: el.scrollTop,
      };
    });
  expect(tutorialScrollMetrics.scrollHeight).toBeGreaterThan(tutorialScrollMetrics.clientHeight);
  expect(tutorialScrollMetrics.scrollTop).toBeGreaterThan(0);

  // Switch back to Tutorial tab and click "Switch to Split 2D | 3D & Light Tab"
  await page.getByTestId('guide-tab-tutorial').click();
  await page.getByTestId('tutorial-try-lightingAndOptics').click();
  await expect(tutorialDialog).not.toBeVisible();
  await expect(page.getByTestId('layout-split')).toHaveAttribute('aria-pressed', 'true');

  // Reopen guide via TopBar button in Polish and verify translation
  await page.getByTestId('lang-pl').click();
  await page.getByTestId('btn-guide').click();
  await expect(tutorialDialog).toContainText('Interaktywny samouczek i przewodnik po funkcjach');
  await expect(tutorialDialog).not.toContainText('guide.');

  // Jump from Guide directly to Customize Keyboard Shortcuts
  await page.getByTestId('guide-open-shortcuts').click();
  await expect(tutorialDialog).not.toBeVisible();
  const shortcutsDialog = page.getByTestId('shortcuts-dialog');
  await expect(shortcutsDialog).toBeVisible();

  // Verify vertical scrolling inside Keyboard Shortcuts dialog
  const shortcutsScrollMetrics = await shortcutsDialog
    .locator('[data-slot="scroll-area-viewport"]')
    .evaluate((el) => {
      el.scrollTop = 100;
      return {
        clientHeight: el.clientHeight,
        scrollHeight: el.scrollHeight,
        scrollTop: el.scrollTop,
      };
    });
  expect(shortcutsScrollMetrics.scrollHeight).toBeGreaterThan(shortcutsScrollMetrics.clientHeight);
  expect(shortcutsScrollMetrics.scrollTop).toBeGreaterThan(0);

  // Switch back to EN for shortcut customization test
  await page.getByTestId('shortcuts-close').click();
  await page.getByTestId('lang-en').click();
  await page.getByTestId('btn-shortcuts').click();
  await expect(shortcutsDialog).toBeVisible();

  // Conflict detection: try binding Brush ('B') to 'E' (already assigned to Eraser)
  await page.getByTestId('shortcut-bind-toolBrush').click();
  await expect(page.getByTestId('shortcut-bind-toolBrush')).toContainText('Press keys…');
  await page.keyboard.press('e');
  await expect(page.getByTestId('shortcut-conflict-alert')).toBeVisible();
  await expect(page.getByTestId('shortcut-conflict-alert')).toContainText('Eraser tool');

  // Bind Brush to 'K' (unused key)
  await page.getByTestId('shortcut-bind-toolBrush').click();
  await page.keyboard.press('k');
  await expect(page.getByTestId('shortcut-bind-toolBrush')).toContainText('K');
  await expect(page.getByTestId('shortcut-reset-toolBrush')).toBeVisible();
  await page.getByTestId('shortcuts-close').click();

  // Select Eraser with 'E', then activate Brush using the new custom shortcut 'K'
  await page.keyboard.press('e');
  await expect(page.getByTestId('tool-eraser')).toHaveAttribute('aria-pressed', 'true');
  await page.keyboard.press('k');
  await expect(page.getByTestId('tool-brush')).toHaveAttribute('aria-pressed', 'true');

  // Verify Tutorial & Feature Guide dynamically displays the custom 'K' binding
  await page.getByTestId('btn-guide').click();
  await page.getByTestId('guide-tab-features').click();
  await expect(page.getByTestId('feature-shortcut-toolBrush')).toContainText('K');
  await page.getByTestId('tutorial-close').click();

  // Reload page to verify custom shortcut persists in IndexedDB (meta.customShortcuts)
  await page.reload();
  await expect(page.getByTestId('viewport-webgl-canvas')).toBeVisible();
  const restoreCloseBtn = page.getByTestId('restore-start-new');
  if (await restoreCloseBtn.isVisible({ timeout: 500 }).catch(() => false)) {
    await restoreCloseBtn.click();
  }

  await page.keyboard.press('e');
  await expect(page.getByTestId('tool-eraser')).toHaveAttribute('aria-pressed', 'true');
  await page.keyboard.press('k');
  await expect(page.getByTestId('tool-brush')).toHaveAttribute('aria-pressed', 'true');

  // Reset all custom shortcuts to defaults
  await page.getByTestId('btn-shortcuts').click();
  await page.getByTestId('shortcuts-reset-all').click();
  await expect(page.getByTestId('shortcut-bind-toolBrush')).toContainText('B');
  await page.getByTestId('shortcuts-close').click();
});
