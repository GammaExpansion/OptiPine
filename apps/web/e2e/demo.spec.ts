import { expect, test, type Page, type Response as BrowserResponse } from '@playwright/test';
import { fixedClock, installDemoMarketFixtures } from './market-fixtures.ts';
import { readFile, readdir, writeFile } from 'node:fs/promises';
import { gzipSync } from 'node:zlib';
import { catalogs } from '../src/i18n/catalogs.ts';

const traffic = new WeakMap<Page, { forbidden: string[]; errors: string[] }>();
test.beforeEach(({ page }) => {
  const state = { forbidden: [] as string[], errors: [] as string[] };
  traffic.set(page, state);
  page.on('pageerror', (error) => state.errors.push(error.message));
  page.on('request', (request) => {
    const url = new URL(request.url());
    if (url.hostname === 'data-api.binance.vision') return;
    if (
      url.hostname !== '127.0.0.1' ||
      !url.pathname.startsWith('/OptiPine/') ||
      /\/api\//.test(url.pathname)
    )
      state.forbidden.push(url.href);
  });
  page.on('response', (response) => {
    if (new URL(response.url()).hostname === '127.0.0.1' && !response.ok())
      state.errors.push(`${response.status()} ${response.url()}`);
  });
});
test.afterEach(({ page }) => {
  expect(traffic.get(page)).toEqual({ forbidden: [], errors: [] });
});

const csv =
  'time,open,high,low,close,Volume\n1790935200,100,103,99,102,5\n1790938800,102,104,101,103,6\n';

async function openMarket(page: Page) {
  await page.getByRole('button', { name: 'Select market data', exact: true }).first().click();
  return page.getByRole('dialog', { name: 'Select market data' });
}

test('loads the demo example with one click, then optimizes', async ({ page }, info) => {
  const requests = await installDemoMarketFixtures(page);
  await page.clock.install({ time: fixedClock });
  const workers: string[] = [];
  page.on('worker', (worker) => workers.push(worker.url()));
  await page.goto('/OptiPine/');
  await expect(page.getByRole('heading', { name: 'Run backtest' })).toBeVisible();
  await page.getByRole('button', { name: /Load example/ }).click();
  await expect(page.getByRole('button', { name: /BTCUSDT Binance/ })).toBeVisible({
    timeout: 30_000,
  });
  await expect(page.getByLabel('Last run')).toHaveText(/17,520 bars/);
  await expect(page.getByRole('tab', { name: 'Report', exact: true })).toHaveAttribute(
    'aria-selected',
    'true',
  );
  await expect(page.getByRole('tab', { name: /^Trades [1-9]/ })).toBeVisible();
  await expect(page.getByRole('tabpanel').getByRole('table')).toHaveCount(3);
  await page.mouse.move(1435, 895);
  await page.evaluate(() => document.fonts.ready);
  await page.screenshot({ path: info.outputPath('example-one-click-demo.png') });
  await page.getByRole('button', { name: 'Optimize', exact: true }).click();
  await expect(page.getByRole('heading', { name: 'No optimization has run yet' })).toBeVisible();
  await page.getByRole('spinbutton', { name: 'Length from' }).fill('18');
  await page.getByRole('spinbutton', { name: 'Length to' }).fill('19');
  await page.getByRole('spinbutton', { name: 'Length step' }).fill('1');
  for (const title of ['Multiplier', 'Source', 'Use trailing stop', 'Trail %']) {
    const box = page.getByRole('checkbox', { name: `Search ${title}` });
    if ((await box.getAttribute('aria-checked')) === 'true') await box.click();
  }
  await page.getByRole('radio', { name: 'None', exact: true }).click();
  const block = page.getByRole('region', { name: 'Optimization run' });
  await block.getByRole('button', { name: 'Start' }).click();
  await expect(page.getByLabel('Last run')).toHaveText(/2 combos/, { timeout: 60_000 });
  expect(requests.filter((url) => url.pathname.endsWith('/klines'))).toHaveLength(18);
  expect(requests.some((url) => url.hostname === 'data-api.binance.vision')).toBe(true);
  expect(workers.length).toBeGreaterThanOrEqual(3);
  expect(workers.every((url) => new URL(url).pathname.startsWith('/OptiPine/assets/'))).toBe(true);
});

test('keeps CSV local and disables server-only providers with the demo note', async ({ page }) => {
  await installDemoMarketFixtures(page);
  await page.goto('/OptiPine/');
  const dialog = await openMarket(page);
  await expect(dialog.getByText(/Yahoo Finance and USDⓈ-M perpetual data require/)).toBeVisible();
  await expect(dialog.getByRole('tab', { name: 'Yahoo Finance' })).toBeDisabled();
  await expect(dialog.getByRole('radio', { name: 'USDⓈ-M perpetual' })).toBeDisabled();
  await dialog.getByRole('tab', { name: 'Upload CSV' }).click();
  await dialog.getByLabel('CSV file').setInputFiles({
    name: 'local.csv',
    mimeType: 'text/csv',
    buffer: Buffer.from(csv),
  });
  await expect(dialog.getByText('Preview · 1h')).toBeVisible();
  await dialog.getByLabel('Symbol', { exact: true }).fill('LOCAL');
  await dialog.getByRole('button', { name: 'Use this data' }).click();
  await expect(page.getByRole('button', { name: /LOCAL CSV/ })).toBeVisible();
});

test('resolves license assets below the Pages base', async ({ page, request }) => {
  await installDemoMarketFixtures(page);
  await page.goto('/OptiPine/');
  await page.getByRole('button', { name: 'About & licenses' }).click();
  const href = await page
    .getByRole('dialog')
    .getByRole('link', { name: 'Read the MIT License' })
    .getAttribute('href');
  expect(href).toBe('/OptiPine/licenses/OptiPine.txt');
  const response = await request.get(new URL(href!, page.url()).toString());
  expect(response.ok()).toBe(true);
  expect(await response.text()).toContain('MIT License');
});

for (const language of ['en', 'zh'] as const) {
  test(`cold first launch and all licenses stay under the base (${language})`, async ({
    page,
    request,
  }, info) => {
    await installDemoMarketFixtures(page);
    await page.addInitScript((language) => {
      localStorage.setItem('optipine.ui', JSON.stringify({ state: { language }, version: 1 }));
    }, language);
    const files: Promise<{ file: string; bytes: number; gzip: number }>[] = [];
    const record = (response: BrowserResponse) => {
      files.push(
        response.body().then((body) => ({
          file: new URL(response.url()).pathname,
          bytes: body.length,
          gzip: gzipSync(body).length,
        })),
      );
    };
    page.on('response', record);
    await page.goto('/OptiPine/');
    await expect(
      page.getByRole('heading', { name: catalogs[language]['backtest.start'] }),
    ).toBeVisible();
    await page.evaluate(() => document.fonts.ready);
    await page.waitForLoadState('networkidle');
    page.off('response', record);
    const loaded = await Promise.all(files);
    const scripts = loaded.filter(({ file }) => file.endsWith('.js'));
    expect(
      scripts.some(({ file }) =>
        /demo-market|engine\.worker|MarketDataDialog|OptimizePage/.test(file),
      ),
    ).toBe(false);
    const html = await readFile(new URL('../demo-dist/index.html', import.meta.url), 'utf8');
    const entry = new Set(
      [...html.matchAll(/(?:src|href)="([^"\s]+\.js)"/g)].map((match) => match[1]),
    );
    const sum = (items: typeof loaded) => items.reduce((n, item) => n + item.bytes, 0);
    const numbers = {
      files: loaded,
      entryBytes: sum(scripts.filter(({ file }) => entry.has(file))),
      code: sum(scripts.filter(({ file }) => !new RegExp(`/${language}-`).test(file))),
      catalogBytes: sum(scripts.filter(({ file }) => new RegExp(`/${language}-`).test(file))),
      totalBytes: sum(loaded),
      gzipBytes: loaded.reduce((n, item) => n + item.gzip, 0),
    };
    await writeFile(info.outputPath('s1-demo-bundle.json'), JSON.stringify(numbers, null, 2));
    await page.screenshot({ path: info.outputPath(`S1-demo-${language}.png`) });
    await page.getByRole('button', { name: catalogs[language]['shell.licenses'] }).click();
    const dialog = page.getByRole('dialog');
    await expect(dialog.getByText(catalogs[language]['licenses.demoNotice'])).toBeVisible();
    const links = await dialog
      .locator('a[href^="/OptiPine/licenses/"]')
      .evaluateAll((links) => links.map((link) => link.getAttribute('href')!));
    expect(links).toHaveLength(6);
    for (const link of links) {
      const response = await request.get(link);
      expect(response.ok()).toBe(true);
      expect(await response.text()).not.toContain('<html');
    }
  });

  test(`server-only controls explain self-hosting (${language})`, async ({ page }, info) => {
    await installDemoMarketFixtures(page);
    await page.goto('/OptiPine/');
    if (language === 'zh') await page.getByRole('radio', { name: '中', exact: true }).click();
    const copy = catalogs[language];
    await page.getByRole('button', { name: copy['shell.selectData'], exact: true }).first().click();
    const dialog = page.getByRole('dialog');
    await expect(dialog.getByRole('tab', { name: /Yahoo Finance/ })).toBeDisabled();
    await expect(dialog.getByRole('radio', { name: copy['data.perpetual'] })).toBeDisabled();
    await expect(dialog.getByText(copy['data.demoServerOnly'])).toBeVisible();
    await expect(dialog.getByRole('link', { name: copy['data.demoServerLink'] })).toHaveAttribute(
      'href',
      'https://github.com/GammaExpansion/OptiPine#running-the-app',
    );
    await expect(dialog.getByText(copy['data.demoBrowserNote'])).toBeVisible();
    await page.screenshot({ path: info.outputPath(`S3-demo-${language}.png`) });
  });
}

test('spot search uses the recording and accepted data keeps the browser cache', async ({
  page,
}) => {
  const requests = await installDemoMarketFixtures(page);
  await page.goto('/OptiPine/');
  const dialog = await openMarket(page);
  await dialog.getByRole('combobox', { name: 'Symbol', exact: true }).fill('BTCUS');
  await dialog.getByRole('option', { name: /^BTCUSDT / }).click();
  await dialog.getByRole('button', { name: 'Fetch data' }).click();
  await expect(dialog.getByText('17,520', { exact: true })).toBeVisible();
  await dialog.getByRole('button', { name: 'Use this data' }).click();
  const count = requests.length;
  await page.getByRole('button', { name: /BTCUSDT Binance/ }).click();
  await dialog.getByRole('button', { name: 'Fetch data' }).click();
  await expect(dialog.getByText('Cached, valid for 5 minutes')).toBeVisible();
  expect(requests).toHaveLength(count);
});

test('failed example and search show the existing error and CSV hint without alternate data', async ({
  page,
}) => {
  await installDemoMarketFixtures(page);
  await page.route('https://data-api.binance.vision/**', (route) => route.abort('failed'));
  await page.goto('/OptiPine/');
  await page.getByRole('button', { name: /Load example/ }).click();
  const dialog = page.getByRole('dialog');
  await expect(dialog.getByRole('alert')).toContainText(
    'Could not reach the market data provider.',
  );
  await expect(dialog.getByRole('alert')).toContainText(
    'If Binance is unavailable, upload a CSV to continue.',
  );
  await expect(dialog.getByRole('button', { name: 'Use Yahoo Finance instead' })).toHaveCount(0);
  await dialog.getByRole('combobox', { name: 'Symbol', exact: true }).fill('BTCUS');
  await expect(dialog.getByRole('listbox')).toContainText(
    'If Binance is unavailable, upload a CSV to continue.',
  );
  await dialog.getByRole('tab', { name: 'Upload CSV', exact: true }).click();
  await expect(dialog.getByLabel('CSV file')).toBeAttached();
});

test('normal production artifacts exclude the direct provider code', async () => {
  const root = new URL('../dist/assets/', import.meta.url);
  const files = (await readdir(root)).filter((file) => file.endsWith('.js'));
  expect(files.filter((file) => file.includes('demo-market'))).toEqual([]);
  for (const file of files)
    expect(await readFile(new URL(file, root), 'utf8')).not.toContain('data-api.binance.vision');
});
