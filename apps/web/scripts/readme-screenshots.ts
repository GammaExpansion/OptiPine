import assert from 'node:assert/strict';
import { mkdir, writeFile } from 'node:fs/promises';
import { fileURLToPath } from 'node:url';
import { parseArgs } from 'node:util';
import { chromium, expect, type Page } from '@playwright/test';
import { createServer } from 'vite';
import { fixedClock, installMarketFixtures } from '../e2e/market-fixtures.ts';

const webRoot = fileURLToPath(new URL('../', import.meta.url));
const output = new URL('../../../docs/screenshots/', import.meta.url);
const desktop = { width: 1440, height: 900 };
const phone = { width: 390, height: 844 };
const timeout = 120_000;

/** An explicit URL reuses a local server; otherwise own a dev server on an isolated port. */
export function captureOptions(args: string[], env: NodeJS.ProcessEnv = process.env) {
  const { values } = parseArgs({
    args,
    options: { url: { type: 'string' }, port: { type: 'string' } },
  });
  if (values.url !== undefined && values.port !== undefined)
    throw new Error('Use either --url or --port.');
  if (values.url !== undefined) {
    const url = new URL(values.url);
    if (
      !['http:', 'https:'].includes(url.protocol) ||
      !['127.0.0.1', 'localhost'].includes(url.hostname) ||
      url.username ||
      url.password
    )
      throw new Error('--url must use a local HTTP(S) server, as required by the market fixtures.');
    return { url: url.href, port: null };
  }
  // Match e2e/ports.ts: the dev server is two ports above E2E_BASE_PORT.
  const port =
    values.port !== undefined ? Number(values.port) : Number(env.E2E_BASE_PORT || 5174) + 2;
  if (!Number.isInteger(port) || port < 1024 || port > 65535)
    throw new Error('The capture port must be an integer from 1024 to 65535.');
  return { url: `http://127.0.0.1:${port}`, port };
}

/** Wait for local fonts and canvas paints without freezing the timers Workers need to finish. */
async function painted(page: Page) {
  await page.mouse.move(0, 0);
  await page.evaluate(async () => {
    await document.fonts.ready;
    await new Promise<void>((resolve) =>
      requestAnimationFrame(() => requestAnimationFrame(() => resolve())),
    );
  });
}

async function capture(page: Page, name: string) {
  await painted(page);
  await expect(page.locator('[aria-busy="true"]')).toHaveCount(0, { timeout });
  await expect(page.getByRole('progressbar')).toHaveCount(0);
  await expect(page.locator('[data-results][data-outdated]')).toHaveCount(0);
  assert(
    await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth),
    `${name} must fit the viewport`,
  );
  const bytes = await page.screenshot({ animations: 'disabled', scale: 'css' });
  assert(bytes.length < 400_000, `${name} exceeds the 400 KB image budget`);
  await writeFile(new URL(name, output), bytes);
  console.log(`${name}: ${(bytes.length / 1024).toFixed(1)} KiB`);
  return bytes.length;
}

/** Frame the newest trade through the Trades tab; language and phone changes remount the chart. */
async function showReport(page: Page, language: 'en' | 'zh' = 'en') {
  await page.getByRole('tab', { name: language === 'en' ? /^Trades/ : /^成交/ }).click();
  const trades = page.getByRole('grid');
  await expect(trades).toBeVisible();
  await trades.locator('[data-trade]').first().click();
  await page.getByTestId('price-chart').getByRole('group').press('Escape');
  const name = language === 'en' ? 'Report' : '报告';
  await page.getByRole('tab', { name, exact: true }).click();
  await expect(page.getByRole('region', { name, exact: true })).toBeVisible();
}

/** Change only user controls: no harness, injected results or synthetic prices. */
async function configureGrid(page: Page) {
  for (const title of ['Source', 'Use trailing stop', 'Trail %']) {
    const checkbox = page.getByRole('checkbox', { name: `Search ${title}`, exact: true });
    await checkbox.uncheck();
  }
  for (const [title, from, to, step] of [
    ['Length', 130, 200, 10],
    ['Multiplier', 1.75, 2.75, 0.25],
  ] as const) {
    await page.getByRole('checkbox', { name: `Search ${title}`, exact: true }).check();
    for (const [field, value] of Object.entries({ from, to, step }))
      await page
        .getByRole('spinbutton', { name: `${title} ${field}`, exact: true })
        .fill(String(value));
  }
  await page.getByRole('radio', { name: 'Grid', exact: true }).click();
  await page.getByRole('radio', { name: 'IS / OOS', exact: true }).click();
  // Show every evaluated cell, including losses, instead of cherry-picking passing trials.
  const filters = page
    .getByRole('complementary')
    .getByRole('group', { name: 'Filters', exact: true });
  while (await filters.locator('button[aria-label]').count())
    await filters.locator('button[aria-label]').first().click();
}

/** Three rolling windows and nine sets per window keep W1 a real, short run. */
async function captureWalkForward(page: Page) {
  await page.getByRole('radio', { name: 'Walk-forward', exact: true }).click();
  for (const [name, value] of Object.entries({
    'In-sample months': 13,
    'Out-of-sample months': 4,
    'Step in months': 4,
    'Length from': 160,
    'Length to': 200,
    'Length step': 20,
    'Multiplier from': 2,
    'Multiplier to': 2.5,
    'Multiplier step': 0.25,
  }))
    await page.getByRole('spinbutton', { name, exact: true }).fill(String(value));
  await page.getByRole('radio', { name: 'Rolls forward', exact: true }).click();
  const run = page.getByRole('region', { name: 'Optimization run' });
  const start = run.getByRole('button', { name: /^(Start|Re-optimize)$/ });
  await expect(run).toContainText('27backtests');
  await expect(start).toBeEnabled({ timeout });
  await start.click();
  await expect(page.getByLabel('Last run')).toHaveText(/^3 windows in \d+:\d\d$/, { timeout });
  await expect(run).not.toContainText('Last run 0:00');
  await expect(start).toBeEnabled();
  const summary = page.getByRole('region', { name: 'Stitched OOS equity', exact: true });
  await summary.getByRole('radio', { name: 'Stitched', exact: true }).click();
  await expect(page.getByTestId('wf-equity')).toBeVisible();
  const windows = page.getByRole('region', { name: 'Walk-forward window results', exact: true });
  await expect(windows.locator('tbody tr[data-status="done"]')).toHaveCount(3, { timeout });
  await windows.getByRole('button', { name: 'Select W1', exact: true }).click();
  await expect(page.getByRole('region', { name: 'Selected window', exact: true })).toContainText(
    'W1',
  );
  const stability = page.getByRole('region', { name: 'Walk-forward stability', exact: true });
  await stability.getByRole('radio', { name: 'Stability', exact: true }).click();
  await expect(stability.getByRole('img')).toHaveCount(2, { timeout });
  await expect(
    page.getByRole('region', { name: 'Fixed parameters for every window' }),
  ).toBeVisible();
  console.log(`Walk-forward: ${await page.getByLabel('Last run').innerText()}`);
  return capture(page, 'walk-forward.png');
}

export async function readmeScreenshots(options: ReturnType<typeof captureOptions>) {
  const server = options.port
    ? await createServer({
        root: webRoot,
        logLevel: 'warn',
        server: { host: '127.0.0.1', port: options.port, strictPort: true },
      })
    : null;
  try {
    await server?.listen();
    const browser = await chromium.launch();
    try {
      const context = await browser.newContext({
        viewport: desktop,
        deviceScaleFactor: 1,
        locale: 'en-US',
        timezoneId: 'UTC',
        colorScheme: 'dark',
        reducedMotion: 'reduce',
        serviceWorkers: 'block',
      });
      const page = await context.newPage();
      page.setDefaultTimeout(30_000);
      const errors: string[] = [];
      page.on('pageerror', (error) => errors.push(error.message));
      page.on('console', (message) => {
        if (message.type() === 'error') errors.push(message.text());
      });
      // Keep the Worker pool size consistent across capture machines.
      await page.addInitScript(() =>
        Object.defineProperty(navigator, 'hardwareConcurrency', { get: () => 4 }),
      );
      const requests = await installMarketFixtures(page);
      // Replace the e2e helper's frozen Date before loading the app: keep the fixture's hour,
      // but let elapsed time advance naturally so the UI reports actual run durations.
      await page.clock.install({ time: fixedClock });
      await page.goto(options.url);
      await page
        .getByRole('button', { name: 'Load example: Trend Breakout, BTCUSDT 1 hour' })
        .click();
      const run = page.getByRole('banner').getByRole('button', { name: /^Run backtest/ });
      await expect(run).toBeEnabled();
      const fixtureRange = page.getByRole('button', {
        name: '2024-10-03 – 2026-10-03',
        exact: true,
      });
      await expect(fixtureRange).toBeVisible();
      await run.click();
      await expect(page.getByLabel('Last run')).toHaveText(/^17,520 bars, \d+\.\d s$/, { timeout });
      await expect(page.getByLabel('Last run')).not.toHaveText('17,520 bars, 0.0 s');
      console.log(`Backtest: ${await page.getByLabel('Last run').innerText()}`);
      assert(requests.some((request) => request.pathname.endsWith('/bars')));
      await expect(page.getByTestId('price-chart')).toBeVisible();
      await mkdir(output, { recursive: true });

      await showReport(page);
      const netProfit = page
        .getByRole('region', { name: 'Report', exact: true })
        .locator('strong')
        .first();
      await expect(netProfit).toHaveAttribute('data-tone', 'profit');
      console.log(`Default backtest net profit: ${await netProfit.innerText()}`);
      let total = await capture(page, 'backtest.png');
      await page.getByRole('tab', { name: 'Equity', exact: true }).click();
      await expect(page.getByTestId('equity-charts')).toBeVisible();
      await expect(page.getByTestId('pnl-calendar')).toBeVisible();
      total += await capture(page, 'equity.png');
      await page.getByRole('tab', { name: 'Report', exact: true }).click();
      await page.getByRole('radio', { name: '中', exact: true }).click();
      await expect(page.getByRole('tab', { name: '报告', exact: true })).toBeVisible();
      await showReport(page, 'zh');
      total += await capture(page, 'backtest-zh.png');
      await page.getByRole('radio', { name: 'EN', exact: true }).click();
      await page.setViewportSize(phone);
      await expect(page.getByRole('button', { name: 'Run', exact: true })).toBeVisible();
      await showReport(page);
      total += await capture(page, 'phone.png');
      await page.setViewportSize(desktop);

      await page.getByRole('button', { name: 'Optimize', exact: true }).click();
      await configureGrid(page);
      const optimization = page.getByRole('region', { name: 'Optimization run' });
      await expect(optimization).toContainText('40combos');
      await optimization.getByRole('button', { name: 'Start', exact: true }).click();
      await expect(page.getByLabel('Last run')).toHaveText(/^40 combos, \d+:\d\d$/, { timeout });
      await expect(page.getByLabel('Last run')).not.toHaveText('40 combos, 0:00');
      await expect(optimization).not.toContainText('Last run 0:00');
      await expect(fixtureRange).toBeVisible();
      console.log(`Optimization: ${await page.getByLabel('Last run').innerText()}`);
      await expect(page.getByRole('img', { name: 'Top 20 equity', exact: true })).toBeVisible({
        timeout,
      });
      await expect(page.getByTestId('parameter-map')).toBeVisible();
      await expect(page.locator('[data-sensitivity-row]')).toHaveCount(2);
      await page.getByRole('button', { name: 'Select set #1', exact: true }).click();
      await expect(page.getByRole('region', { name: 'Selected parameter set' })).toContainText(
        '#1',
      );
      total += await capture(page, 'optimize.png');
      total += await captureWalkForward(page);
      assert(total < 2_500_000, 'Screenshots exceed the 2.5 MB total budget');
      assert.deepEqual(errors, [], 'The real UI must finish without browser errors');
      console.log(`Total: ${(total / 1024).toFixed(1)} KiB`);
    } finally {
      await browser.close();
    }
  } finally {
    await server?.close();
  }
}

if (import.meta.main) await readmeScreenshots(captureOptions(process.argv.slice(2)));
