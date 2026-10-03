import { expect, test, type Page } from '@playwright/test';
import { readFileSync } from 'node:fs';
import type { BacktestHooks } from './backtest-hooks.ts';

test.use({ baseURL: 'http://127.0.0.1:5175' });

const trend = readFileSync(new URL('../examples/trend-breakout.pine', import.meta.url), 'utf8');
const broken = trend.replace('basis = ta.sma(src, length)', 'basis = ta.sma(src, lenght)');
const failing = trend.replace(
  'if longSignal',
  'if bar_index == 1202\n    runtime.error("trail_points must be greater than 0")\nif longSignal',
);
const quiet = trend.replace('mult     = input.float(2.0,', 'mult     = input.float(4.9,');

type HookWindow = Window & { backtestHooks: BacktestHooks };

/** The harness with a script and 20,488 synthetic hourly bars, installed through the stores. */
async function open(page: Page, source: string, language: 'en' | 'zh' = 'en') {
  const errors: string[] = [];
  page.on('pageerror', (error) => errors.push(error.message));
  page.on('console', (message) => {
    if (message.type() === 'error') errors.push(message.text());
  });
  await page.addInitScript((language) => {
    localStorage.setItem('optipine.ui', JSON.stringify({ state: { language }, version: 1 }));
  }, language);
  await page.goto('/e2e/harness.html');
  await page.waitForFunction(() => 'backtestHooks' in window);
  await page.evaluate((source) => {
    const { backtestHooks } = window as unknown as HookWindow;
    backtestHooks.openScript({
      source,
      fileName: 'trend_breakout.pine',
      origin: { kind: 'file' },
    });
    backtestHooks.useSyntheticData(20_488);
  }, source);
  await page.evaluate(() => document.fonts.ready);
  return errors;
}

const state = (page: Page) =>
  page.evaluate(() => {
    const backtest = (window as unknown as HookWindow).backtestHooks.backtest();
    return {
      run: backtest.run.status,
      outdated: backtest.outdated?.reasons ?? null,
      netProfit: (window as unknown as HookWindow).backtestHooks.netProfit(),
    };
  });
const run = (page: Page) => page.getByRole('button', { name: /Run backtest|运行回测/ });
const facts = (page: Page) => page.getByLabel('Last run');

test('an edited input marks the result outdated until the next run (B9)', async ({
  page,
}, info) => {
  const errors = await open(page, trend);
  await run(page).click();
  await expect(facts(page)).toHaveText(/^20,488 bars, \d+\.\d s$/);
  await expect(page.getByTestId('price-chart')).toBeVisible();
  const length = page.getByRole('spinbutton', { name: 'Length' });
  await length.fill('28');
  await expect(facts(page)).toHaveText('Results outdated');
  await expect(page.getByText('Default 20')).toBeVisible();
  await expect(page.getByRole('status').filter({ hasText: 'Current results use' })).toHaveText(
    /Current results use Length 20\..*They update after the next run\..*Reset to 20/,
  );
  await page.screenshot({ path: info.outputPath('B9-en.png') });
  await run(page).click();
  await expect(facts(page)).toHaveText(/^20,488 bars/);
  expect((await state(page)).outdated).toEqual([]);
  await expect(page.getByText('Current results use')).toHaveCount(0);
  expect(errors).toEqual([]);
});

test('a compile error shows in the code and in Issues, and editing fixes it (B10)', async ({
  page,
}, info) => {
  const errors = await open(page, broken);
  await expect(facts(page)).toHaveText('1 compile error');
  await expect(run(page)).toBeDisabled();
  await page.getByRole('tab', { name: /^Issues/ }).click();
  const row = page.getByRole('list', { name: 'Issues' }).getByRole('button');
  await expect(row).toContainText('Compile error');
  await expect(row).toContainText('Line 15, column 21');
  await expect(page.getByText('Fix the errors to run.')).toBeVisible();
  await page.screenshot({ path: info.outputPath('B10-en.png') });
  await row.click();
  await expect(page.getByRole('tab', { name: 'Pine code' })).toHaveAttribute(
    'aria-selected',
    'true',
  );
  const editor = page.getByRole('textbox', { name: 'Pine code editor' });
  await expect(editor.locator('.cm-line-er')).toContainText('lenght');
  await editor.locator('.cm-squiggle').dblclick();
  await page.keyboard.type('length');
  await expect(run(page)).toBeEnabled();
  await expect(editor.locator('.cm-line-er')).toHaveCount(0);
  await expect(page.getByRole('tab', { name: /^Issues/ })).toHaveText('Issues0');
  expect(errors).toEqual([]);
});

test('a runtime error shows B11, and Go to line selects the line', async ({ page }, info) => {
  const errors = await open(page, failing);
  await run(page).click();
  await expect(page.getByRole('heading', { name: 'Run failed, no results' })).toBeVisible();
  await expect(
    page.getByText('Line 24 failed at bar 1,203. An incomplete run shows no partial results.'),
  ).toBeVisible();
  await expect(facts(page)).toHaveText('Run failed');
  await page.screenshot({ path: info.outputPath('B11-en.png') });
  await page.getByRole('button', { name: 'Go to line 24' }).click();
  const editor = page.getByRole('textbox', { name: 'Pine code editor' });
  await expect(editor).toBeFocused();
  await expect(editor.locator('.cm-activeLine')).toHaveText(
    '    runtime.error("trail_points must be greater than 0")',
  );
  await expect(editor.locator('.cm-activeLine')).toBeInViewport();
  expect(errors).toEqual([]);
});

test('a script without trades keeps the chart and points to the code (B12)', async ({
  page,
}, info) => {
  const errors = await open(page, quiet, 'zh');
  await run(page).click();
  await expect(page.getByRole('heading', { name: '所选区间内无成交' })).toBeVisible();
  await expect(page.getByTestId('price-chart')).toBeVisible();
  await page.screenshot({ path: info.outputPath('B12-zh.png') });
  await page.getByRole('button', { name: '查看 Pine 代码' }).click();
  await expect(page.getByRole('tab', { name: 'Pine 代码' })).toHaveAttribute(
    'aria-selected',
    'true',
  );
  expect(errors).toEqual([]);
});

test('the properties dialog overrides a property and changes the result (B13)', async ({
  page,
}, info) => {
  const errors = await open(page, trend);
  await run(page).click();
  await expect(facts(page)).toHaveText(/^20,488 bars/);
  const before = (await state(page)).netProfit;
  await page.getByRole('button', { name: 'All settings' }).click();
  const dialog = page.getByRole('dialog', { name: 'Properties' });
  await expect(dialog).toBeVisible();
  await dialog.getByRole('spinbutton', { name: 'Commission' }).fill('0.5');
  await expect(dialog.getByText('Overridden; the script value is 0.1.')).toBeVisible();
  await expect(dialog.getByText('1 overridden')).toBeVisible();
  await expect(facts(page)).toHaveText('Results outdated');
  await page.screenshot({ path: info.outputPath('B13-en.png') });
  await run(page).click();
  await expect(facts(page)).toHaveText(/^20,488 bars/);
  const after = (await state(page)).netProfit;
  expect(typeof before).toBe('number');
  expect(after).toBeLessThan(before as number);
  await dialog.getByRole('button', { name: 'Back to inputs' }).click();
  await expect(dialog).toHaveCount(0);
  await expect(page.getByText('script 0.1%')).toBeVisible();
  expect(errors).toEqual([]);
});
