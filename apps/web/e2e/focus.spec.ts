import { expect, test, type Locator, type Page } from '@playwright/test';
import { installDemoMarketFixtures, installMarketFixtures } from './market-fixtures.ts';
import { origins } from './ports.ts';

async function tabTo(page: Page, target: Locator) {
  await expect(target).toBeVisible();
  for (let index = 0; index < 80; index++) {
    if (await target.evaluate((element) => element === document.activeElement)) return;
    await page.keyboard.press('Tab');
  }
  throw new Error(`Keyboard could not reach ${target}`);
}

async function expectFramedFocus(input: Locator) {
  await expect(input).toBeFocused();
  expect(await input.evaluate((element) => element.matches(':focus-visible'))).toBe(true);
  await expect(input).toHaveCSS('outline-style', 'none');
  await expect(input.locator('..')).toHaveCSS('border-color', 'rgb(242, 163, 58)');
}

async function expectPrimaryOutline(control: Locator) {
  await expect(control).toBeFocused();
  await expect(control).toHaveCSS('outline-style', 'solid');
  await expect(control).toHaveCSS('outline-width', '2px');
  await expect(control).toHaveCSS('outline-color', 'rgb(242, 163, 58)');
}

async function expectContainerFocus(page: Page, container: Locator) {
  // Exercise Radix's fallback focus even when opening normally selects the first control.
  await container.focus();
  await expect(container).toBeFocused();
  expect(await container.evaluate((element) => element.matches(':focus-visible'))).toBe(true);
  await expect(container).toHaveCSS('outline-style', 'none');
  // A later shell stylesheet must not restore an outline on a focus-management container.
  await page.addStyleTag({
    content: ':focus-visible { outline: 2px solid var(--primary); outline-offset: -2px; }',
  });
  await expect(container).toHaveCSS('outline-style', 'none');
}

for (const demo of [false, true])
  test(`text fields have one focus ring in the ${demo ? 'Pages demo' : 'production'} build`, async ({
    page,
  }, info) => {
    await (demo ? installDemoMarketFixtures(page) : installMarketFixtures(page));
    await page.goto(demo ? `${origins.demo}/OptiPine/` : '/');
    await page.getByRole('button', { name: 'Select market data', exact: true }).first().click();
    const dialog = page.getByRole('dialog', { name: 'Select market data' });
    const symbol = dialog.getByRole('combobox', { name: 'Symbol', exact: true });
    await tabTo(page, symbol);
    await expect(dialog.getByRole('option').first()).toBeVisible();
    await page.keyboard.press('Escape');
    await page.screenshot({ path: info.outputPath('symbol-focus.png') });
    await expectFramedFocus(symbol);

    // A lazy stylesheet must also win when the shell's global rule is loaded after it.
    await page.addStyleTag({
      content: ':focus-visible { outline: 2px solid var(--primary); outline-offset: -2px; }',
    });
    await expectFramedFocus(symbol);
    await tabTo(page, dialog.getByRole('textbox', { name: 'From', exact: true }));
    await expectFramedFocus(dialog.getByRole('textbox', { name: 'From', exact: true }));
    const cancel = dialog.getByRole('button', { name: 'Cancel', exact: true });
    await tabTo(page, cancel);
    await expect(cancel).toHaveCSS('outline-style', 'solid');
    await expect(cancel).toHaveCSS('outline-width', '2px');
    await expect(cancel).toHaveCSS('outline-color', 'rgb(242, 163, 58)');
  });

test('keyboard-opened panels leave focus rings to their controls', async ({ page }, info) => {
  await installMarketFixtures(page);
  await page.goto('/');
  await page.getByRole('button', { name: /Load example/ }).click();
  const settings = page.getByRole('button', { name: 'All settings', exact: true });
  await tabTo(page, settings);
  await page.keyboard.press('Enter');
  const properties = page.getByRole('dialog', { name: 'Properties', exact: true });
  await expect(properties).toBeVisible();
  await expect(properties).toHaveCSS('outline-style', 'none');
  await expectContainerFocus(page, properties);
  await page.keyboard.press('Tab');
  await expectPrimaryOutline(properties.getByRole('button', { name: 'Back to inputs' }));
  await page.keyboard.press('Escape');
  await expect(settings).toBeFocused();
  await page.setViewportSize({ width: 900, height: 768 });
  await tabTo(page, page.locator('#right-drawer-toggle'));
  await page.keyboard.press('Enter');
  const drawer = page.getByRole('dialog', { name: 'Right panel', exact: true });
  await expect(drawer).toBeVisible();
  await expect(drawer).toHaveCSS('outline-style', 'none');
  await expectContainerFocus(page, drawer);
  await page.evaluate(() => document.fonts.ready);
  await page.screenshot({ path: info.outputPath('right-drawer-keyboard-900.png') });
  await page.keyboard.press('Tab');
  await expectPrimaryOutline(drawer.getByRole('button', { name: 'Decrease Length', exact: true }));
  await page.screenshot({ path: info.outputPath('right-drawer-control-focus-900.png') });
});

test('an empty drawer takes keyboard focus without a container outline', async ({ page }) => {
  await page.setViewportSize({ width: 900, height: 768 });
  await page.goto('/');
  await tabTo(page, page.locator('#right-drawer-toggle'));
  await page.keyboard.press('Enter');
  const drawer = page.getByRole('dialog', { name: 'Right panel', exact: true });
  await expect(drawer).toBeFocused();
  await expectContainerFocus(page, drawer);
  await page.keyboard.press('Escape');
  await expectPrimaryOutline(page.locator('#right-drawer-toggle'));
});

test('sheet dialogs, popovers, menus and notifications keep their control focus indicators', async ({
  page,
}) => {
  await page.goto(`${origins.preview}/sheet.html`);
  const propertiesTrigger = page.getByRole('button', { name: 'Properties', exact: true });
  await propertiesTrigger.focus();
  await page.keyboard.press('Enter');
  const dialog = page.getByRole('dialog', { name: 'Properties', exact: true });
  await expect(dialog).toBeVisible();
  await expectContainerFocus(page, dialog);
  await page.keyboard.press('Tab');
  await expectPrimaryOutline(dialog.getByRole('button', { name: 'Close', exact: true }));
  await page.keyboard.press('Escape');
  await expect(propertiesTrigger).toBeFocused();

  const conditionTrigger = page.getByRole('button', { name: '+ Condition', exact: true }).last();
  await conditionTrigger.focus();
  await page.keyboard.press('Enter');
  const popover = page.getByRole('dialog', { name: 'Add condition', exact: true });
  await expect(popover).toBeVisible();
  await expectContainerFocus(page, popover);
  await page.keyboard.press('Tab');
  const metric = popover.getByRole('combobox', { name: 'Metric', exact: true });
  await expectPrimaryOutline(metric);
  await page.keyboard.press('Enter');
  const options = page.getByRole('listbox');
  await expect(options).toBeVisible();
  await expectContainerFocus(page, options);
  await page.keyboard.press('ArrowDown');
  await expectPrimaryOutline(options.getByRole('option').first());
  await page.keyboard.press('Escape');
  await expect(metric).toBeFocused();
  await page.keyboard.press('Escape');
  await expect(conditionTrigger).toBeFocused();

  const menuTrigger = page.getByRole('button', { name: 'Menu', exact: true });
  await menuTrigger.focus();
  await page.keyboard.press('Enter');
  const menu = page.getByRole('menu', { name: 'Menu', exact: true });
  await expect(menu).toBeVisible();
  // Roving focus immediately redirects the menu container to an item.
  await expect(menu).toHaveCSS('outline-style', 'none');
  await expectPrimaryOutline(menu.getByRole('menuitem').first());
  await page.keyboard.press('ArrowDown');
  await expectPrimaryOutline(menu.getByRole('menuitem').nth(1));
  await page.keyboard.press('Escape');
  await expect(menuTrigger).toBeFocused();

  await page.getByRole('button', { name: 'Show toast with action', exact: true }).focus();
  await page.keyboard.press('Enter');
  const notifications = page.getByRole('region', { name: 'Notifications', exact: true });
  const viewport = notifications.getByRole('list');
  await page.keyboard.press('F8');
  await expect(viewport).toBeFocused();
  await expectContainerFocus(page, viewport);
  await page.keyboard.press('Tab');
  // A toast is a keyboard stop with Escape to dismiss, unlike its focus-management viewport.
  await expectPrimaryOutline(viewport.getByRole('listitem'));
  await page.keyboard.press('Tab');
  await expectPrimaryOutline(notifications.getByRole('button', { name: 'Undo', exact: true }));
});

for (const demo of [false, true])
  test(`the editor frame owns focus before and after loading in the ${demo ? 'Pages demo' : 'production'} build`, async ({
    page,
  }) => {
    let release!: () => void;
    const pending = new Promise<void>((resolve) => (release = resolve));
    await page.route('**/PineEditor-*.js', async (route) => {
      await pending;
      await route.continue();
    });
    try {
      await page.goto(demo ? `${origins.demo}/OptiPine/` : '/');
      const editor = page.getByRole('textbox', { name: 'Pine code editor', exact: true });
      await tabTo(page, editor);
      await expect(editor).toHaveJSProperty('tagName', 'TEXTAREA');
      await expect(editor).toHaveCSS('outline-style', 'none');
      await expect(editor.locator('..')).toHaveCSS('outline-color', 'rgb(242, 163, 58)');
      await expect(editor.locator('..')).toHaveCSS('outline-style', 'solid');
      await page.addStyleTag({
        content: ':focus-visible { outline: 2px solid var(--primary); outline-offset: -2px; }',
      });
      await expect(editor).toHaveCSS('outline-style', 'none');
      release();
      await expect(page.locator('.cm-content')).toBeFocused();
      await expect(page.locator('.cm-content')).toHaveCSS('outline-style', 'none');
      await expect(page.locator('.cm-editor')).toHaveCSS('outline-color', 'rgb(242, 163, 58)');
      await page.keyboard.press('Shift+Tab');
      await expect(page.locator('.cm-scroller')).toBeFocused();
      await expect(page.locator('.cm-scroller')).toHaveCSS('outline-style', 'none');
      await expect(page.locator('.cm-editor')).toHaveCSS('outline-style', 'solid');
      await expect(page.locator('.cm-editor')).toHaveCSS('outline-color', 'rgb(242, 163, 58)');
    } finally {
      release();
      await page.unrouteAll({ behavior: 'wait' });
    }
  });
