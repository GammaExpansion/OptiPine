import { expect, test } from '@playwright/test';
import type { ScriptDescription } from '@pine/engine';
import type { TrialResult } from '@pine/optimizer';
import type { OptimizationResult } from '@pine/workers';
import { origins } from './ports.ts';

test('production app loads without errors or third-party requests and remembers language', async ({
  page,
}, testInfo) => {
  const errors: string[] = [];
  const external: string[] = [];
  page.on('pageerror', (error) => errors.push(error.message));
  page.on('console', (message) => {
    if (message.type() === 'error') errors.push(message.text());
  });
  const scripts: string[] = [];
  page.on('request', (request) => {
    if (!request.url().startsWith(`${origins.production}/`)) external.push(request.url());
    else if (request.url().endsWith('.js')) scripts.push(new URL(request.url()).pathname);
  });
  // The root's text when it first has any, before a catalog could still change.
  await page.addInitScript(() => {
    new MutationObserver((_, observer) => {
      const text = document.getElementById('root')?.textContent;
      if (!text) return;
      Object.assign(window, { firstText: text });
      observer.disconnect();
    }).observe(document, { childList: true, subtree: true });
  });
  const firstText = () => page.evaluate(() => (window as { firstText?: string }).firstText ?? '');
  const catalogs = () =>
    scripts.flatMap((file) => /^\/assets\/(en|zh)-/.exec(file)?.slice(1, 2) ?? []);
  await page.goto('/');
  await page.evaluate(() => document.fonts.ready);
  await expect(page.getByRole('heading', { name: 'Run backtest' })).toBeVisible();
  await expect(page.getByRole('button', { name: 'Optimize', exact: true })).toBeDisabled();
  await expect(
    page.getByRole('button', { name: /Run backtest.*Ctrl/ }),
  ).toHaveAccessibleDescription('Open a script and select market data first');
  expect(await page.locator('body').evaluate((body) => body.scrollWidth)).toBe(1440);
  await page.screenshot({ path: testInfo.outputPath('S1-en.png') });
  expect(await firstText()).toContain('Open script');
  // One catalog loads with the page; the other when the language first switches to it.
  expect(catalogs()).toEqual(['en']);
  await page.getByRole('radio', { name: '中', exact: true }).click();
  await expect(page.getByRole('button', { name: '打开脚本' })).toBeVisible();
  scripts.length = 0;
  await page.reload();
  await expect(page.locator('html')).toHaveAttribute('lang', 'zh-CN');
  expect(await firstText()).toContain('打开脚本');
  expect(await firstText()).not.toContain('Open script');
  expect(catalogs()).toEqual(['zh']);
  await page.getByRole('radio', { name: 'EN', exact: true }).click();
  await expect(page.getByRole('button', { name: 'Open script' })).toBeVisible();
  await page.getByRole('radio', { name: '中', exact: true }).click();
  await expect(page.getByRole('button', { name: '打开脚本' })).toBeVisible();
  expect(catalogs()).toEqual(['zh', 'en']);
  await page.evaluate(() => document.fonts.ready);
  await page.screenshot({ path: testInfo.outputPath('S1-zh.png') });
  expect(errors).toEqual([]);
  expect(external).toEqual([]);
});

test('built module Workers describe, run, analyze and optimize a tiny strategy', async ({
  page,
}) => {
  const workers: string[] = [];
  const errors: string[] = [];
  page.on('worker', (worker) => workers.push(worker.url()));
  page.on('pageerror', (error) => errors.push(error.message));
  await page.goto(`${origins.preview}/e2e/harness.html`);
  const result = await page.evaluate(
    () =>
      (
        window as unknown as {
          workerCheck: Promise<{
            description: ScriptDescription;
            result: TrialResult;
            parameters: { Quantity: number }[];
            optimization: OptimizationResult;
          }>;
        }
      ).workerCheck,
  );
  expect(result.description.success).toBe(true);
  expect(result.description.title).toBe('Worker smoke');
  expect(result.description.inputs[0].title).toBe('Quantity');
  expect(result.result.diagnostics).toEqual([]);
  expect(result.result.trades.length).toBeGreaterThan(0);
  expect(result.result.plots[0].values).toEqual([101, 102, 103, 104, 105, 106, 107, 108]);
  expect(result.result.equity).toHaveLength(8);
  expect(result.parameters).toEqual([{ Quantity: 1 }, { Quantity: 2 }]);
  expect(result.optimization.trials).toHaveLength(2);
  expect(result.optimization.errorCount).toBe(0);
  expect(workers).toHaveLength(3);
  expect(workers.every((url) => /\/assets\/.*\.js$/.test(url))).toBe(true);
  expect(errors).toEqual([]);
});

test('panes resize, reset, collapse, maximize and remember sizes independently per page', async ({
  page,
}, testInfo) => {
  await page.goto(`${origins.preview}/e2e/harness.html`);
  const right = page.getByRole('complementary');
  const width = () => right.evaluate((element) => element.getBoundingClientRect().width);
  await expect.poll(width).toBe(336);
  const separator = page.getByRole('separator', { name: 'Resize right panel' });
  await separator.focus();
  await page.keyboard.press('ArrowLeft');
  await expect.poll(width).toBeGreaterThan(336);
  const resized = await width();
  await page.reload();
  await expect.poll(width).toBeCloseTo(resized, 0);
  await page.getByRole('button', { name: 'Optimize', exact: true }).click();
  await expect(page.getByRole('heading', { name: 'No optimization has run yet' })).toBeVisible();
  await expect.poll(width).toBe(336);
  await page.evaluate(() => document.fonts.ready);
  await page.screenshot({ path: testInfo.outputPath('O1-en.png') });
  await page.getByRole('radio', { name: '中', exact: true }).click();
  await page.evaluate(() => document.fonts.ready);
  await page.screenshot({ path: testInfo.outputPath('O1-zh.png') });
  await page.getByRole('radio', { name: 'EN', exact: true }).click();
  await page.getByRole('button', { name: 'Backtest', exact: true }).click();
  await expect.poll(width).toBeCloseTo(resized, 0);
  const bounds = await separator.boundingBox();
  if (!bounds) throw new Error('Missing separator');
  await page.mouse.dblclick(bounds.x, bounds.y + 200);
  await expect.poll(width).toBe(336);
  await page.mouse.move(1104, 300);
  await page.mouse.down();
  await page.mouse.move(1050, 300, { steps: 8 });
  await expect(page.getByText('Right panel 390 px')).toBeVisible();
  await page.mouse.up();
  await right.hover();
  await page.getByRole('button', { name: 'Collapse right panel' }).click();
  await expect.poll(width).toBe(32);
  await page.getByRole('button', { name: 'Expand right panel' }).click();
  await expect.poll(width).toBe(336);
  await page.getByRole('button', { name: 'Maximize panel', exact: true }).click();
  await expect(page.locator('#chart')).toHaveCSS('height', '0px');
  await page.getByRole('button', { name: 'Restore panel', exact: true }).click();
  await expect(page.locator('#chart')).toHaveCSS('height', '430px');
  await page.getByRole('button', { name: 'Collapse panel', exact: true }).click();
  await expect(page.locator('#dock')).toHaveCSS('height', '36px');
  await page.reload();
  await expect(page.locator('#dock')).toHaveCSS('height', '36px');
  await page.getByRole('button', { name: 'Expand panel', exact: true }).click();
  await expect(page.locator('#chart')).toHaveCSS('height', '430px');

  const chartHandle = page.getByRole('separator', { name: 'Resize chart and dock' });
  const chartBounds = await chartHandle.boundingBox();
  if (!chartBounds) throw new Error('Missing chart separator');
  await page.mouse.move(500, chartBounds.y);
  await page.mouse.down();
  await page.mouse.move(500, chartBounds.y + 50, { steps: 8 });
  await expect(page.getByText('Chart 480 px')).toBeVisible();
  await page.mouse.up();
  await page.reload();
  await expect(page.locator('#chart')).toHaveCSS('height', '480px');
  await page.mouse.dblclick(500, 528);
  await expect(page.locator('#chart')).toHaveCSS('height', '430px');
  await chartHandle.focus();
  await page.keyboard.press('Home');
  const chartHeight = await page
    .locator('#chart')
    .evaluate((element) => element.getBoundingClientRect().height);
  expect(chartHeight === 0 || chartHeight >= 240).toBe(true);
});

test('dev, preview and production preserve the market API prefix', async ({ request }) => {
  expect((await request.get(`${origins.production}/e2e/harness.html`)).status()).toBe(404);
  for (const origin of [origins.production, origins.preview, origins.dev]) {
    const response = await request.get(`${origin}/api/market/bars?feed=invalid`);
    expect(response.status()).toBe(400);
    expect(await response.json()).toMatchObject({
      error: { uiText: { id: 'feedInvalidRequest' } },
    });
  }
});
