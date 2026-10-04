import { expect, test, type Page } from '@playwright/test';
import { installMarketFixtures, type MarketFixtureOptions } from './market-fixtures.ts';
import { readFile } from 'node:fs/promises';

const csv =
  'time,open,high,low,close,Volume,plot\n1790935200,100,103,99,102,5,\n1790938800,102,104,101,103,6,\n1790942400,103,105,102,104,7,\n';
const brokenCsv =
  'time,open,high,low,close,Volume\n1790935200,100,103,99,102,5\n1790935200,102,104,101,103,6\n1790942400,104,101,102,104,7\n';

let browserErrors: string[] = [];
test.beforeEach(({ page }) => {
  browserErrors = [];
  page.on('pageerror', (error) => browserErrors.push(error.message));
});
test.afterEach(() => expect(browserErrors).toEqual([]));

async function openMarket(page: Page) {
  await page.getByRole('button', { name: 'Select market data', exact: true }).first().click();
  return page.getByRole('dialog', { name: 'Select market data' });
}

async function expectHeaderFits(page: Page) {
  const layout = await page.getByRole('banner').evaluate((header) => {
    const children = Array.from(header.children)
      .map((element) => element.getBoundingClientRect())
      .filter((rect) => rect.width > 1 && rect.height > 1);
    return {
      width: header.clientWidth,
      scrollWidth: header.scrollWidth,
      right: children.at(-1)!.right,
      gaps: children.slice(1).map((rect, index) => rect.left - children[index].right),
    };
  });
  expect(layout.scrollWidth).toBe(layout.width);
  expect(layout.right).toBeLessThanOrEqual(1428);
  for (const gap of layout.gaps) expect(gap).toBeGreaterThanOrEqual(12);
}

for (const language of ['en', 'zh'] as const)
  test(`load the two-year example and press Run backtest in ${language}`, async ({
    page,
  }, testInfo) => {
    const requests = await installMarketFixtures(page);
    await page.goto('/');
    if (language === 'zh') await page.getByRole('radio', { name: '中', exact: true }).click();
    await page.evaluate(() => document.fonts.ready);
    const steps = page.getByRole('region', {
      name: language === 'en' ? 'Run backtest' : '开始回测',
      exact: true,
    });
    // The header action includes its shortcut; the first-launch action disappears once ready.
    const run = page.getByRole('banner').getByRole('button', {
      name: language === 'en' ? /^Run backtest/ : /^运行回测/,
    });
    await expect(steps).toBeVisible();
    await expect(run).toBeDisabled();
    await expectHeaderFits(page);
    await page.screenshot({ path: testInfo.outputPath(`S1-${language}-1440.png`) });
    await steps
      .getByRole('button', { name: language === 'en' ? /Load example/ : /载入示例/ })
      .click();
    await expect(run).toBeEnabled();
    await expect(steps).toHaveCount(0);
    await expect(page.getByRole('button', { name: '2024-10-03 – 2026-10-03' })).toBeVisible();
    await run.click();
    await expect(page.getByLabel(language === 'en' ? 'Last run' : '上次运行')).toHaveText(
      language === 'en' ? /^17,520 bars, \d+\.\d s$/ : /^17,520 根 K 线，用时 \d+\.\d 秒$/,
    );
    await expectHeaderFits(page);
    await page.screenshot({ path: testInfo.outputPath(`B1-${language}-1440.png`) });
    const bars = requests.find((request) => request.pathname.endsWith('/bars'))!;
    expect(Object.fromEntries(bars.searchParams)).toEqual({
      feed: 'binance',
      symbol: 'BTCUSDT',
      timeframe: '60',
      from: '1727964000',
      to: '1791036000',
    });
  });

test('search, fetch, edit preview and accept; repeat uses the cache', async ({
  page,
}, testInfo) => {
  const requests = await installMarketFixtures(page);
  await page.goto('/');
  const dialog = await openMarket(page);
  await dialog.getByRole('combobox', { name: 'Symbol', exact: true }).fill('BTCUS');
  await expect(dialog.getByRole('option', { name: /BTCUSDT BTC/ }).first()).toBeVisible();
  await dialog.getByRole('option', { name: /^BTCUSDT / }).click();
  await dialog.getByRole('button', { name: 'Fetch data' }).click();
  await expect(dialog.getByText('17,520', { exact: true })).toBeVisible();
  await dialog.getByLabel('Tick size', { exact: true }).fill('0');
  await expect(dialog.getByRole('button', { name: 'Use this data' })).toBeDisabled();
  await dialog.getByLabel('Tick size', { exact: true }).fill('0.1');
  await page.screenshot({ path: testInfo.outputPath('S5-en.png') });
  await dialog.getByRole('button', { name: 'Use this data' }).click();
  await expect(page.getByRole('button', { name: /BTCUSDT Binance/ })).toBeVisible();
  await page.getByRole('button', { name: /BTCUSDT Binance/ }).click();
  // Restore the exact preset request, including its hour boundary.
  await dialog.getByRole('button', { name: '2Y', exact: true }).click();
  await dialog.getByRole('button', { name: 'Fetch data' }).click();
  await expect(dialog.getByText('Cached, valid for 5 minutes')).toBeVisible();
  expect(requests.filter((request) => request.pathname.endsWith('/bars'))).toHaveLength(1);
});

test('CSV success, all parsing failures and calendar validation stay local', async ({
  page,
}, testInfo) => {
  const requests = await installMarketFixtures(page);
  await page.goto('/');
  const dialog = await openMarket(page);
  await dialog.getByRole('tab', { name: 'Upload CSV', exact: true }).click();
  await dialog
    .getByLabel('CSV file', { exact: true })
    .setInputFiles({ name: 'broken.csv', mimeType: 'text/csv', buffer: Buffer.from(brokenCsv) });
  await expect(dialog.getByText('Row 3', { exact: true })).toBeVisible();
  await expect(dialog.getByText('Row 4', { exact: true })).toBeVisible();
  await expect(dialog.getByRole('button', { name: 'Use this data' })).toBeDisabled();
  await page.screenshot({ path: testInfo.outputPath('S8-en.png') });
  await dialog
    .getByLabel('CSV file', { exact: true })
    .setInputFiles({ name: 'BTCUSDT.csv', mimeType: 'text/csv', buffer: Buffer.from(csv) });
  await dialog.getByLabel('Symbol', { exact: true }).fill('BTCUSDT');
  await expect(dialog.getByRole('button', { name: 'Use this data' })).toBeEnabled();
  await dialog
    .getByLabel('Trading calendar JSON (optional)', { exact: true })
    .setInputFiles({ name: 'bad.json', mimeType: 'application/json', buffer: Buffer.from('{') });
  await expect(dialog.getByRole('button', { name: 'Use this data' })).toBeDisabled();
  await dialog.getByRole('button', { name: 'Remove calendar' }).click();
  await dialog.getByLabel('Tick size', { exact: true }).fill('0.5');
  await page.screenshot({ path: testInfo.outputPath('S7-en.png') });
  await dialog.getByRole('button', { name: 'Use this data' }).click();
  await expect(page.getByRole('button', { name: /BTCUSDT CSV/ })).toBeVisible();
  await expect(page.getByRole('radio', { name: '4h', exact: true })).toBeDisabled();
  expect(requests).toHaveLength(0);
});

for (const offer of ['Yahoo', 'CSV', 'Retry'] as const)
  test(`refusal recovery: ${offer}`, async ({ page }, testInfo) => {
    const options: MarketFixtureOptions = { mode: 'refusal' };
    const requests = await installMarketFixtures(page, options);
    await page.goto('/');
    const dialog = await openMarket(page);
    await dialog.getByRole('button', { name: 'Fetch data' }).click();
    await expect(dialog.getByText(/HTTP 451/)).toBeVisible();
    await page.screenshot({ path: testInfo.outputPath('S9-en.png') });
    if (offer === 'Yahoo') {
      options.mode = 'success';
      await dialog.getByRole('button', { name: 'Use Yahoo Finance instead' }).click();
      await dialog.getByRole('button', { name: 'Fetch data' }).click();
      await expect(dialog.getByText(/Yahoo does not publish trading rules/)).toBeVisible();
      await expect(dialog.getByText(/21 trading days/)).toBeVisible();
      await page.screenshot({ path: testInfo.outputPath('S6-en.png') });
      await dialog.getByRole('button', { name: 'Use this data' }).click();
      await expect(page.getByRole('button', { name: /AAPL Yahoo Finance/ })).toBeVisible();
    } else if (offer === 'CSV') {
      await dialog.getByRole('button', { name: 'Upload CSV', exact: true }).click();
      await expect(dialog.getByRole('tab', { name: 'Upload CSV' })).toHaveAttribute(
        'aria-selected',
        'true',
      );
    } else {
      options.mode = 'success';
      await dialog.getByRole('button', { name: 'Retry' }).click();
      await expect(dialog.getByText('17,520', { exact: true })).toBeVisible();
      expect(requests.filter((request) => request.pathname.endsWith('/bars'))).toHaveLength(2);
    }
  });

test('service unavailable keeps example source and offers CSV on both providers', async ({
  page,
}) => {
  await installMarketFixtures(page, { mode: 'unavailable' });
  await page.goto('/');
  await page.getByRole('button', { name: /Load example/ }).click();
  const dialog = page.getByRole('dialog', { name: 'Select market data' });
  await expect(
    dialog.getByText('The data service is unavailable. Upload a CSV instead.'),
  ).toBeVisible();
  await dialog.getByRole('tab', { name: /Yahoo Finance/ }).click();
  await expect(dialog.getByRole('combobox', { name: 'Symbol' })).toBeDisabled();
  await dialog.getByRole('button', { name: 'Upload CSV', exact: true }).click();
  await dialog
    .getByLabel('CSV file', { exact: true })
    .setInputFiles({ name: 'bars.csv', mimeType: 'text/csv', buffer: Buffer.from(csv) });
  await dialog.getByLabel('Symbol', { exact: true }).fill('BTCUSDT');
  await dialog.getByRole('button', { name: 'Use this data' }).click();
  await expect(page.getByRole('button', { name: /trend-breakout.pine/ })).toBeVisible();
});

test('timeframe and date range refetch the same provider and await acceptance', async ({
  page,
}, testInfo) => {
  const requests = await installMarketFixtures(page);
  await page.goto('/');
  await page.getByRole('button', { name: /Load example/ }).click();
  await expect(page.getByRole('radio', { name: '4h', exact: true })).toBeEnabled();
  await page.getByRole('radio', { name: '4h', exact: true }).click();
  const dialog = page.getByRole('dialog', { name: 'Select market data' });
  await expect(dialog.getByRole('button', { name: 'Use this data' })).toBeEnabled();
  await dialog.getByRole('button', { name: 'Use this data' }).click();
  await expect(page.getByRole('radio', { name: '4h', exact: true })).toHaveAttribute(
    'aria-checked',
    'true',
  );
  expect(requests.at(-1)!.searchParams.get('timeframe')).toBe('240');
  await page.getByRole('button', { name: /2024-10-03/ }).click();
  const range = page.getByRole('dialog', { name: 'Change date range' });
  await range.getByRole('button', { name: '1M', exact: true }).click();
  await page.screenshot({ path: testInfo.outputPath('S10-en.png') });
  await range.getByRole('button', { name: 'Fetch again' }).click();
  await expect(dialog.getByRole('button', { name: 'Use this data' })).toBeEnabled();
  expect(requests.at(-1)!.searchParams.get('feed')).toBe('binance');
});

test('cancel fetch discards the pending response', async ({ page }, testInfo) => {
  let release!: () => void;
  const gate = new Promise<void>((resolve) => {
    release = resolve;
  });
  await installMarketFixtures(page, { beforeBars: () => gate });
  await page.goto('/');
  const dialog = await openMarket(page);
  await dialog.getByRole('button', { name: 'Fetch data' }).click();
  await expect(dialog.getByRole('progressbar')).toHaveAccessibleName('Fetching about 17,520 bars');
  await page.screenshot({ path: testInfo.outputPath('S4-en.png') });
  await dialog.getByRole('button', { name: 'Cancel fetch' }).click();
  release();
  await expect(dialog.getByRole('button', { name: 'Fetch data' })).toBeEnabled();
  await expect(dialog.getByRole('button', { name: 'Use this data' })).toHaveCount(0);
});

test('native file picker, Ctrl+O, paste confirmation and download', async ({ page }, testInfo) => {
  await installMarketFixtures(page);
  await page.goto('/');
  const file = {
    name: 'local.pine',
    mimeType: 'text/plain',
    buffer: Buffer.from('//@version=6\nstrategy("Local")\nplot(close)'),
  };
  const picker = page.waitForEvent('filechooser');
  await page.getByRole('button', { name: 'Open file', exact: true }).click();
  await (await picker).setFiles(file);
  const script = page.getByRole('button', { name: /local.pine/ });
  await expect(script).toBeVisible();
  await script.click();
  await expect(page.getByText(/Pine v6, 0 inputs, 1 plots, compiled in/)).toBeVisible();
  await page.screenshot({ path: testInfo.outputPath('S2-en.png') });
  const downloadPromise = page.waitForEvent('download');
  await page.getByRole('menuitem', { name: 'Download .pine' }).click();
  const download = await downloadPromise;
  expect(download.suggestedFilename()).toBe('local.pine');
  expect(await readFile((await download.path())!, 'utf8')).toBe(file.buffer.toString('utf8'));
  const filePicker = page.waitForEvent('filechooser');
  await page.keyboard.press('Control+o');
  await (await filePicker).setFiles({ ...file, name: 'next.pine' });
  await expect(page.getByRole('button', { name: /next.pine/ })).toBeVisible();
  // An unedited script is replaced at once; an edited one asks first.
  const paste = async (source: string) => {
    await page.getByRole('button', { name: 'Paste code', exact: true }).click();
    await page.getByRole('textbox', { name: 'Pine source' }).fill(source);
    await page.getByRole('button', { name: 'Use this code' }).click();
  };
  await paste('//@version=6\nstrategy("Pasted")');
  await expect(page.getByRole('dialog')).toHaveCount(0);
  await expect(page.getByRole('button', { name: /script.pine/ })).toBeVisible();
  await page.getByRole('textbox', { name: 'Pine code editor' }).click();
  await page.keyboard.press('Control+End');
  await page.keyboard.type('\nplot(open)');
  await paste('//@version=6\nstrategy("Again")');
  await expect(page.getByRole('dialog', { name: 'Replace the current script?' })).toBeVisible();
  await page.getByRole('button', { name: 'Replace script' }).click();
  await expect(page.getByRole('dialog')).toHaveCount(0);
});

for (const language of ['en', 'zh'] as const)
  test(`data dialogs fit desktop and smaller viewports in ${language}`, async ({
    page,
  }, testInfo) => {
    await installMarketFixtures(page);
    await page.goto('/');
    if (language === 'zh') await page.getByRole('radio', { name: '中', exact: true }).click();
    await page
      .getByRole('button', {
        name: language === 'en' ? 'Select market data' : '选择行情',
        exact: true,
      })
      .first()
      .click();
    const dialog = page.getByRole('dialog');
    for (const [width, height] of [
      [1440, 900],
      [1024, 768],
      [390, 844],
    ]) {
      await page.setViewportSize({ width, height });
      await page.evaluate(() => document.fonts.ready);
      const bounds = await dialog.boundingBox();
      expect(bounds!.x).toBeGreaterThanOrEqual(0);
      expect(bounds!.x + bounds!.width).toBeLessThanOrEqual(width);
      expect(await dialog.evaluate((element) => element.scrollWidth <= element.clientWidth)).toBe(
        true,
      );
      await page.screenshot({ path: testInfo.outputPath(`S3-${language}-${width}.png`) });
    }
  });
