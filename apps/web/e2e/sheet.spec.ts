import { readFileSync, existsSync, writeFileSync } from 'node:fs';
import { expect, test } from '@playwright/test';
import { origins } from './ports.ts';

test.use({
  baseURL: origins.preview,
  viewport: { width: 1440, height: 1120 },
  reducedMotion: 'reduce',
});

for (const language of ['en', 'zh'] as const) {
  for (const viewport of [
    { width: 1440, height: 1120 },
    { width: 1024, height: 768 },
    { width: 390, height: 844 },
  ]) {
    test(`sheet ${language} at ${viewport.width} has no horizontal page overflow`, async ({
      page,
    }, info) => {
      await page.setViewportSize(viewport);
      const errors: string[] = [];
      page.on('pageerror', (error) => errors.push(error.message));
      page.on('console', (message) => {
        if (message.type() === 'error') errors.push(message.text());
      });
      await page.goto('/sheet.html');
      await expect(page.getByTestId('g5-sheet')).toBeVisible();
      if (language === 'zh') await page.getByRole('radio', { name: '中', exact: true }).click();
      await page.evaluate(() => document.fonts.ready);
      await page.evaluate(() => window.scrollTo(0, 0));
      expect(await page.evaluate(() => document.body.scrollWidth)).toBe(viewport.width);
      await page.screenshot({
        path: info.outputPath(`sheet-${language}-${viewport.width}.png`),
        fullPage: true,
        animations: 'disabled',
      });
      expect(errors).toEqual([]);
    });
  }
}

test('G5 comparison at 1440 × 1120 with identical self-hosted fonts', async ({
  page,
  request,
}, info) => {
  await page.goto('/sheet.html');
  await expect(page.getByTestId('g5-sheet')).toBeVisible();
  await page.evaluate(() => document.fonts.ready);
  const implementationImage = info.outputPath('G5-implementation.png');
  await page.screenshot({ path: implementationImage, animations: 'disabled' });
  await info.attach('G5 implementation', { path: implementationImage, contentType: 'image/png' });
  const headings = [
    'Surfaces and text',
    'Inputs',
    'Run status at the right of the top bar',
    'Toasts: centred at the bottom and dismissed after a few seconds; a toast with an action stays until closed',
  ];
  const implementation = await Promise.all(
    headings.map(async (text) => ({
      text,
      box: await page
        .getByTestId('g5-sheet')
        .getByRole('heading', { name: text, exact: true })
        .boundingBox(),
    })),
  );
  // Reuse only the built font faces, not the app's base styles, so the mock keeps its own layout.
  const fontFaces = await page.evaluate(() =>
    Array.from(document.styleSheets).flatMap((sheet) =>
      Array.from(sheet.cssRules)
        .filter((rule) => rule.type === CSSRule.FONT_FACE_RULE)
        .map((rule) => rule.cssText),
    ),
  );
  expect(fontFaces.length).toBeGreaterThan(0);
  // The canvas support script is inert on a plain page. Local fonts eliminate remote font timing.
  const mock = readFileSync(
    new URL('../../../docs/web-mock-terminal/artboards/G5-en.dc.html', import.meta.url),
    'utf8',
  )
    .replace('<script src="./support.js"></script>', '')
    .replace(
      /<link rel="stylesheet" href="https:\/\/fonts.googleapis.com[^>]+>/,
      `<style>${fontFaces.join('\n')}</style>`,
    );
  await page.route('**/__g5-reference', (route) =>
    route.fulfill({ contentType: 'text/html', body: mock }),
  );
  await page.goto('/__g5-reference');
  await page.evaluate(() => document.fonts.ready);
  const referenceImage = info.outputPath('G5-reference.png');
  await page.screenshot({ path: referenceImage, animations: 'disabled' });
  await info.attach('G5 reference', { path: referenceImage, contentType: 'image/png' });
  const reference = await Promise.all(
    headings.map(async (text) => ({
      text,
      box: await page.getByText(text, { exact: true }).boundingBox(),
    })),
  );
  await info.attach('heading-positions.json', {
    body: JSON.stringify({ implementation, reference }, null, 2),
    contentType: 'application/json',
  });
  writeFileSync(
    info.outputPath('heading-positions.json'),
    JSON.stringify({ implementation, reference }, null, 2),
  );
  // Compare geometry within this browser run; attach pixels for review instead of an OS baseline.
  for (const [index, actual] of implementation.entries()) {
    const expected = reference[index];
    expect(actual.box).not.toBeNull();
    expect(expected.box).not.toBeNull();
    for (const coordinate of ['x', 'y', 'width', 'height'] as const) {
      expect(
        Math.abs(actual.box![coordinate] - expected.box![coordinate]),
        `${actual.text}: ${coordinate}`,
      ).toBeLessThanOrEqual(2);
    }
  }
  expect(existsSync(new URL('../.e2e-dist/sheet.html', import.meta.url))).toBe(true);
  expect(existsSync(new URL('../dist/sheet.html', import.meta.url))).toBe(false);
  expect((await request.get(`${origins.production}/sheet.html`)).status()).toBe(404);
});

test('browser keyboard flows cover grouped select, symbol search, dialogs, popover and queue', async ({
  page,
}, info) => {
  const errors: string[] = [];
  page.on('pageerror', (error) => errors.push(error.message));
  page.on('console', (message) => {
    if (message.type() === 'error') errors.push(message.text());
  });
  await page.goto('/sheet.html');
  await expect(page.getByTestId('g5-sheet')).toBeVisible();
  await page.getByRole('combobox', { name: 'Metric', exact: true }).focus();
  await page.keyboard.press('Enter');
  await expect(page.getByRole('group', { name: 'Robustness' })).toBeVisible();
  await page.screenshot({ path: info.outputPath('O7-grouped-select.png') });
  await page.keyboard.press('End');
  await expect(page.getByRole('option', { name: 'Neighbourhood mean (±1 step)' })).toBeFocused();
  await page.keyboard.press('Enter');
  await expect(page.getByRole('combobox', { name: 'Metric' })).toHaveText(
    'Neighbourhood mean (±1 step)',
  );
  await page.getByRole('button', { name: 'Select market data', exact: true }).click();
  const dialog = page.getByRole('dialog', { name: 'Select market data' });
  const symbol = dialog.getByRole('combobox', { name: 'Symbol', exact: true });
  await symbol.fill('BTC');
  await page.keyboard.press('ArrowDown');
  await expect(symbol).toBeFocused();
  await page.screenshot({ path: info.outputPath('S3-symbol-search.png') });
  await page.keyboard.press('Enter');
  await expect(symbol).toHaveValue('BTCUSDT');
  await expect(page.getByRole('listbox')).not.toBeVisible();
  await expect(dialog.getByRole('button', { name: 'Fetch data', exact: true })).toBeEnabled();
  // Radix removes the nested focus scope after closing; wait for that rendered frame.
  await page.evaluate(() => new Promise<void>((resolve) => requestAnimationFrame(() => resolve())));
  await dialog.getByRole('button', { name: 'Close', exact: true }).focus();
  await expect(dialog.getByRole('button', { name: 'Close', exact: true })).toBeFocused();
  await page.keyboard.press('Shift+Tab');
  await expect(dialog.getByRole('button', { name: 'Fetch data', exact: true })).toBeFocused();
  await page.keyboard.press('Tab');
  await expect(dialog.getByRole('button', { name: 'Close', exact: true })).toBeFocused();
  await page.keyboard.press('Escape');
  await expect(dialog).not.toBeVisible();
  await page.getByRole('button', { name: 'Properties', exact: true }).click();
  await page.screenshot({ path: info.outputPath('B13-properties.png') });
  await page.keyboard.press('Escape');
  await page.getByRole('button', { name: '+ Condition', exact: true }).last().click();
  await page.getByRole('button', { name: 'PF ≥ 1.2', exact: true }).click();
  await expect(page.getByRole('dialog').getByRole('spinbutton')).toHaveValue('1.2');
  await page.screenshot({ path: info.outputPath('R10-condition.png') });
  await page.keyboard.press('Escape');
  await page.getByRole('button', { name: '2 failed, view', exact: true }).last().click();
  await expect(page.getByRole('dialog').getByRole('table')).toBeVisible();
  await page.screenshot({ path: info.outputPath('R11-table-dialog.png') });
  await page.keyboard.press('Escape');
  await page.getByRole('button', { name: 'Show toast with action', exact: true }).click();
  const region = page.getByRole('region', { name: 'Notifications', exact: true });
  await expect(region.getByRole('button', { name: 'Undo' })).toBeVisible();
  await region.getByRole('button', { name: 'Undo' }).click();
  await expect(region).toHaveText(/Parameters copied/);
  await region.getByRole('button', { name: 'Close' }).click();
  expect(errors).toEqual([]);
});
