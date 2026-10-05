import { expect, test, type Page } from '@playwright/test';
import { readFileSync } from 'node:fs';
import type { BacktestHooks } from './backtest-hooks.ts';
import { origins } from './ports.ts';

test.use({ baseURL: origins.preview });

const trend = readFileSync(new URL('../examples/trend-breakout.pine', import.meta.url), 'utf8');
const broken = trend.replace('basis = ta.sma(src, length)', 'basis = ta.sma(src, lenght)');
/** The mock's B10: the misspelt length on two lines, and a request the engine cannot run. */
const b10 = broken
  .replace('dev   = mult * ta.stdev(src, length)', 'dev   = mult * ta.stdev(src, lenght)')
  .replace(
    'lower = basis - dev\n',
    'lower = basis - dev\ndaily = request.security(syminfo.tickerid, "D", close)\n',
  );
const failing = trend.replace(
  'if longSignal',
  'if bar_index == 1202\n    runtime.error("trail_points must be greater than 0")\nif longSignal',
);
// With 20 bars, 4.9 standard deviations cannot be crossed by a member of that same window.
const quiet = trend
  .replace(/input\.int\(\d+, "Length"/, 'input.int(20, "Length"')
  .replace(/input\.float\([\d.]+, "Multiplier"/, 'input.float(4.9, "Multiplier"');

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
  await expect(page.getByRole('tab', { name: /^Trades \d+$/ })).toBeVisible();
  const length = page.getByRole('spinbutton', { name: 'Length' });
  await length.fill('28');
  await expect(facts(page).getByText('Results outdated', { exact: true })).toBeAttached();
  await expect(page.getByText('Default 180')).toBeVisible();
  await page.screenshot({ path: info.outputPath('B9-en.png') });
  await run(page).click();
  await expect(facts(page)).toHaveText(/^20,488 bars/);
  expect((await state(page)).outdated).toEqual([]);
  await expect(page.getByText('Default 180')).toBeVisible();
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
  await expect(page.getByText('Compile failed', { exact: true })).toBeVisible();
  await editor.locator('.cm-squiggle').dblclick();
  await page.keyboard.type('length');
  await expect(run(page)).toBeEnabled();
  await expect(page.getByText('v6 compiled')).toBeVisible();
  await expect(editor.locator('.cm-line-er')).toHaveCount(0);
  await expect(page.getByRole('tab', { name: /^Issues/ })).toHaveText('Issues0');
  expect(errors).toEqual([]);
});

test('a failed compile shows every error at once, and the unsupported request (B10)', async ({
  page,
}, info) => {
  const errors = await open(page, b10);
  await expect(facts(page)).toHaveText('2 compile errors');
  await page.getByRole('tab', { name: /^Issues/ }).click();
  const rows = page.getByRole('list', { name: 'Issues' }).getByRole('button');
  await expect(rows).toHaveCount(3);
  await expect(rows.nth(0)).toContainText('Compile error');
  await expect(rows.nth(0)).toContainText('Line 15, column 21');
  await expect(rows.nth(1)).toContainText('Compile error');
  await expect(rows.nth(1)).toContainText('Line 16, column 30');
  await expect(rows.nth(2)).toContainText('Unsupported');
  await expect(rows.nth(2)).toContainText('request.security() is not supported.');
  await expect(page.getByText(/^Fix the errors to run\. “Unsupported” means/)).toBeVisible();
  const excerpt = page.getByRole('textbox', { name: 'Code around line 15' });
  await expect(excerpt.locator('.cm-squiggle')).toHaveText([
    'lenght',
    'lenght',
    'request.security',
  ]);
  await page.screenshot({ path: info.outputPath('B10-all-en.png') });
  await page.getByRole('tab', { name: 'Pine code' }).click();
  const editor = page.getByRole('textbox', { name: 'Pine code editor' });
  await expect(editor.locator('.cm-line-er')).toHaveCount(2);
  await expect(editor.locator('.cm-squiggle')).toHaveText(['lenght', 'lenght', 'request.security']);
  await expect(editor.locator('.cm-line-fx')).toContainText('request.security');
  expect(errors).toEqual([]);
});

test('a runtime error shows B11, and Go to line opens the dock and selects the line', async ({
  page,
}, info) => {
  const errors = await open(page, failing);
  await run(page).click();
  await expect(page.getByRole('heading', { name: 'Run failed, no results' })).toBeVisible();
  await expect(
    page.getByText('Line 24 failed at bar 1,203. An incomplete run shows no partial results.'),
  ).toBeVisible();
  await expect(facts(page)).toHaveText('Run failed');
  await page.screenshot({ path: info.outputPath('B11-en.png') });
  await page.getByRole('button', { name: 'Collapse panel', exact: true }).click();
  await expect(page.locator('#dock')).toHaveCSS('height', '36px');
  await page.getByRole('button', { name: 'Go to line 24' }).click();
  await expect(page.locator('#chart')).toHaveCSS('height', '430px');
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
  await expect(facts(page).getByText('Results outdated', { exact: true })).toBeAttached();
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
