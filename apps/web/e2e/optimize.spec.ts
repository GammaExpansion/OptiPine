import { expect, test, type Page } from '@playwright/test';
import { readFileSync } from 'node:fs';
import type { BacktestHooks } from './backtest-hooks.ts';
import type { OptimizeHooks } from './optimize-hooks.ts';
import { origins } from './ports.ts';

test.use({ baseURL: origins.preview });

const trend = readFileSync(new URL('../examples/trend-breakout.pine', import.meta.url), 'utf8');

type HookWindow = Window & { backtestHooks: BacktestHooks; optimizeHooks: OptimizeHooks };

/** The harness with Trend Breakout and `bars` synthetic hourly bars ending 2025-05-04. */
async function open(page: Page, language: 'en' | 'zh' = 'en', bars = 4_000) {
  const errors: string[] = [];
  page.on('pageerror', (error) => errors.push(error.message));
  page.on('console', (message) => {
    if (message.type() === 'error') errors.push(message.text());
  });
  await page.addInitScript((language) => {
    localStorage.setItem('optipine.ui', JSON.stringify({ state: { language }, version: 1 }));
    // Leave time to observe live progress and cancel, even on machines with many cores.
    Object.defineProperty(navigator, 'hardwareConcurrency', { get: () => 3 });
  }, language);
  await page.goto('/e2e/harness.html');
  await page.waitForFunction(() => 'backtestHooks' in window);
  await page.evaluate(
    ([source, bars]) => {
      const { backtestHooks } = window as unknown as HookWindow;
      backtestHooks.openScript({
        source,
        fileName: 'trend_breakout.pine',
        origin: { kind: 'file' },
      });
      backtestHooks.useSyntheticData(bars);
    },
    [trend, bars] as const,
  );
  await page.evaluate(() => document.fonts.ready);
  return errors;
}

const state = (page: Page) =>
  page.evaluate(() => (window as unknown as HookWindow).optimizeHooks.state());
const facts = (page: Page) => page.getByLabel('Last run');
const block = (page: Page) => page.getByRole('region', { name: /^(Optimization run|优化运行)$/ });

/** Search each integer Length in the range, regardless of the example's suggested search step. */
async function searchLength(page: Page, from: number, to: number) {
  await page.getByRole('spinbutton', { name: 'Length from' }).fill(String(from));
  await page.getByRole('spinbutton', { name: 'Length to' }).fill(String(to));
  await page.getByRole('spinbutton', { name: 'Length step' }).fill('1');
  for (const title of ['Multiplier', 'Source', 'Use trailing stop', 'Trail %']) {
    const box = page.getByRole('checkbox', { name: `Search ${title}` });
    if ((await box.getAttribute('aria-checked')) === 'true') await box.click();
  }
}

test('a small grid runs through the Worker pool, goes outdated, and a cancelled run keeps it', async ({
  page,
}, info) => {
  const errors = await open(page);
  await page.getByRole('button', { name: 'Optimize', exact: true }).click();
  await page.getByRole('radio', { name: 'IS / OOS', exact: true }).click();
  await expect(page.getByRole('heading', { name: 'No optimization has run yet' })).toBeVisible();
  await expect(facts(page)).toHaveText('No optimization has run yet');
  await searchLength(page, 18, 22);
  await expect(block(page)).toContainText('5combos');
  await page.screenshot({ path: info.outputPath('O1-en.png') });

  await block(page).getByRole('button', { name: 'Start' }).click();
  await expect(
    block(page).getByRole('progressbar', { name: 'Optimization progress' }),
  ).toBeVisible();
  await expect(facts(page)).toHaveText(/^Optimizing \d \/ 5$/);
  await expect(facts(page)).toHaveText(/^5 combos, \d+:\d\d$/, {
    useInnerText: true,
    timeout: 60_000,
  });
  await expect(block(page).getByRole('button', { name: 'Re-optimize' })).toBeEnabled();
  await expect(block(page)).toContainText(/Last run \d+:\d\d, \d+ threads?/);
  await expect(page.locator('[data-results]')).toBeVisible();
  const first = await state(page);
  expect(first).toMatchObject({ run: 'done', combinations: 5, outdated: [] });

  // R5: a changed range keeps the results, marked outdated.
  await page.getByRole('spinbutton', { name: 'Length to' }).fill('23');
  await expect(facts(page)).toHaveText('Results outdated');
  await expect(block(page)).toContainText('Re-optimize to update');
  await expect(page.locator('[data-results]')).toHaveAttribute('data-outdated');
  await page.screenshot({ path: info.outputPath('R5-en.png') });

  // A larger grid, cancelled while it runs, leaves the last complete results in place.
  await searchLength(page, 5, 200);
  await block(page).getByRole('button', { name: 'Re-optimize' }).click();
  const progress = block(page).getByRole('progressbar', { name: 'Optimization progress' });
  await expect(facts(page)).toHaveText(/^Optimizing [1-9]\d* \/ 196$/, { timeout: 60_000 });
  await expect(progress).not.toHaveAttribute('aria-valuenow', '0');
  await page.screenshot({ path: info.outputPath('O8-en.png') });
  await block(page).getByRole('button', { name: 'Cancel' }).click();
  await expect(facts(page)).toHaveText('Results outdated');
  expect(await state(page)).toMatchObject({
    run: 'cancelled',
    resultsId: first.resultsId,
    combinations: 5,
  });
  await expect(page.locator('[data-results]')).toBeVisible();
  await searchLength(page, 18, 22);
  await expect(facts(page)).toHaveText('Optimization cancelled; last results kept');
  await expect(block(page)).toContainText(/Last run \d+:\d\d/);
  expect(errors).toEqual([]);
});

test('walk-forward runs window by window and lays out W1 (W4, W1)', async ({ page }, info) => {
  // Twenty months of bars: three windows of 12 IS and 3 OOS months, the last one partial.
  const errors = await open(page, 'en', 14_600);
  await page.getByRole('button', { name: 'Optimize', exact: true }).click();
  await page.getByRole('radio', { name: 'Walk-forward' }).click();
  await expect(page.getByRole('heading', { name: 'Window plan' })).toBeVisible();
  await searchLength(page, 18, 22);
  await expect(block(page)).toContainText('15backtests');
  await block(page).getByRole('button', { name: 'Start' }).click();
  await expect(facts(page)).toHaveText(/^Window [1-3] \/ 3$/);
  await expect(block(page)).toContainText(/Window [1-3] \/ 3/);
  await page.screenshot({ path: info.outputPath('W4-en.png') });
  await expect(facts(page)).toHaveText(/^3 windows in \d+:\d\d$/, {
    useInnerText: true,
    timeout: 120_000,
  });
  const done = await state(page);
  expect(done).toMatchObject({ run: 'done', combinations: 5, outdated: [] });
  expect(done.windows).toHaveLength(3);
  expect(done.windows!.every((status) => ['done', 'flat'].includes(status))).toBe(true);
  await expect(page.locator('#optimize-wfSummary')).toBeVisible();
  await expect(
    page.getByRole('separator', { name: 'Resize stitched equity and windows' }),
  ).toHaveCount(1);
  await expect(block(page)).toContainText(/Last run \d+:\d\d, \d+ threads?/);
  await expect(page.getByRole('radio', { name: 'Per window', exact: true })).toHaveAttribute(
    'aria-checked',
    'true',
  );
  await page.getByRole('radio', { name: 'Stitched', exact: true }).click();
  await page.screenshot({ path: info.outputPath('W1-en.png') });
  expect(errors).toEqual([]);
});

test('the setup reads in Chinese, with walk-forward planned and ready to run (O3)', async ({
  page,
}, info) => {
  // Twenty months of bars, enough for windows of 12 IS and 3 OOS months.
  const errors = await open(page, 'zh', 14_600);
  await page.getByRole('button', { name: '优化', exact: true }).click();
  await page.getByRole('radio', { name: '滚动窗口' }).click();
  await expect(page.getByRole('heading', { name: '窗口计划' })).toBeVisible();
  await expect(page.getByRole('img', { name: '各窗口的样本内与样本外区间' })).toBeVisible();
  await expect(block(page).getByRole('button', { name: '开始优化' })).toBeEnabled();
  expect(await page.locator('body').evaluate((body) => body.scrollWidth)).toBe(1440);
  await page.screenshot({ path: info.outputPath('O3-zh.png') });
  expect(errors).toEqual([]);
});
