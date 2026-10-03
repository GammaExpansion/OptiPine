import { expect, test, type Page } from '@playwright/test';
import type { OptimizationStoreState } from '../src/state/optimization.ts';
import type { BacktestHooks } from './backtest-hooks.ts';

// Small synthetic grids isolate result edge cases; the integrated example test uses setup UI.
test.use({ baseURL: 'http://127.0.0.1:5176' });
type SummaryWindow = Window & {
  backtestHooks: BacktestHooks;
  summaryOptimization: () => OptimizationStoreState;
};
const source = `//@version=6
strategy("Summary test", initial_capital=100000)
length = input.int(3, "Length", minval=2, maxval=4)
quantity = input.int(2, "Quantity", minval=1, maxval=3)
if bar_index % (length * 2) == 0
    strategy.entry("L", strategy.long, qty=quantity * 0.1)
if bar_index % (length * 2) == length
    strategy.close("L")
plot(ta.sma(close, length), "Basis")
`;
const failing = `${source}if length == 3 and bar_index == 4
    runtime.error("Stopped on purpose")
`;

async function open(page: Page, language: 'en' | 'zh' = 'en', script = source, none = false) {
  const errors: string[] = [];
  page.on('pageerror', (error) => errors.push(error.message));
  page.on('console', (message) => {
    if (message.type() === 'error') errors.push(message.text());
  });
  await page.route('**/*', (route) => {
    const url = new URL(route.request().url());
    return url.hostname === '127.0.0.1' && !url.pathname.startsWith('/api/market')
      ? route.continue()
      : route.abort();
  });
  await page.clock.setFixedTime(new Date('2026-10-03T12:00:00Z'));
  await page.addInitScript(
    (language) =>
      localStorage.setItem('optipine.ui', JSON.stringify({ state: { language }, version: 1 })),
    language,
  );
  await page.goto('/e2e/harness.html');
  await page.waitForFunction(() => 'backtestHooks' in window);
  await page.evaluate(
    async ({ script, none }) => {
      const path = '/src/state/optimization.ts';
      const module = (await import(path)) as typeof import('../src/state/optimization.ts');
      const target = window as unknown as SummaryWindow;
      target.summaryOptimization = () => module.getOptimizationStore().getState();
      target.backtestHooks.openScript({
        source: script,
        fileName: 'summary.pine',
        origin: { kind: 'file' },
      });
      target.backtestHooks.useSyntheticData(360);
      const { actions } = target.summaryOptimization();
      actions.removeFilter(1);
      actions.removeFilter(0);
      if (none) actions.setValidation({ mode: 'none' });
    },
    { script, none },
  );
  await expect
    .poll(() =>
      page.evaluate(() => (window as unknown as SummaryWindow).summaryOptimization().readiness.ok),
    )
    .toBe(true);
  await page
    .getByRole('button', { name: language === 'en' ? 'Optimize' : '优化', exact: true })
    .click();
  await page
    .getByRole('button', { name: language === 'en' ? 'Start' : '开始优化', exact: true })
    .click();
  await expect
    .poll(
      () =>
        page.evaluate(
          () => (window as unknown as SummaryWindow).summaryOptimization().topEquity.status,
        ),
      { timeout: 30_000 },
    )
    .toBe('ready');
  await page.evaluate(() => document.fonts.ready);
  return errors;
}

async function noPageOverflow(page: Page) {
  expect(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth)).toBe(true);
  for (const element of await page.locator('section[aria-label] button:visible').all()) {
    const bounds = await element.boundingBox();
    if (bounds) expect(bounds.x + bounds.width).toBeLessThanOrEqual(1441);
  }
}

for (const language of ['en', 'zh'] as const) {
  test(`nine real Worker combinations, charts, filters, preview and apply (${language})`, async ({
    page,
  }, info) => {
    const errors = await open(page, language);
    const en = language === 'en';
    await expect(page.getByText(en ? '9 / 9 pass' : '9 / 9 符合')).toBeVisible();
    await expect(
      page.getByRole('img', { name: en ? 'Top 20 equity' : '前 20 组权益', exact: true }),
    ).toBeVisible();
    await noPageOverflow(page);
    await page.screenshot({ path: info.outputPath(`R1-${language}.png`) });
    await page.getByRole('radio', { name: en ? 'IS vs OOS' : '样本内 vs 样本外' }).click();
    const scatter = page.getByRole('img', { name: en ? 'IS vs OOS' : '样本内 vs 样本外' });
    await scatter.focus();
    await page.keyboard.press('ArrowRight');
    await page.keyboard.press('ArrowRight');
    await page.keyboard.press('Enter');
    await expect
      .poll(() =>
        page.evaluate(
          () =>
            (window as unknown as SummaryWindow).summaryOptimization().views?.selection?.row.rank,
        ),
      )
      .toBe(2);
    await page.screenshot({ path: info.outputPath(`R2-${language}.png`) });
    await page.getByRole('radio', { name: en ? 'Distribution' : '分布', exact: true }).click();
    await expect(
      page.getByRole('img', { name: en ? 'Distribution' : '分布' }).locator('rect'),
    ).not.toHaveCount(0);
    await page.screenshot({ path: info.outputPath(`R2b-${language}.png`) });

    const add = page
      .getByRole('button', { name: en ? '+ Condition' : '+ 条件', exact: true })
      .first();
    await add.click();
    let popover = page.getByRole('dialog', { name: en ? 'Add condition' : '添加条件' });
    await popover.getByRole('combobox', { name: en ? 'Metric' : '指标' }).click();
    await page.getByRole('option', { name: en ? 'Net profit' : '净利润', exact: true }).click();
    await popover
      .getByRole('spinbutton', { name: en ? 'Value' : '值', exact: true })
      .fill('-100000');
    await expect(popover).toContainText(en ? 'Would exclude 0 more sets.' : '将额外排除 0 组。');
    await page.screenshot({ path: info.outputPath(`R10-${language}.png`) });
    await popover.getByRole('button', { name: en ? 'Add' : '添加', exact: true }).click();
    await page
      .getByTestId('optimize-leaderboard')
      .getByRole('button', { name: en ? /Remove Net profit/ : /移除 净利润/ })
      .click();
    await expect(page.getByText(en ? '9 / 9 pass' : '9 / 9 符合')).toBeVisible();
    await add.click();
    popover = page.getByRole('dialog', { name: en ? 'Add condition' : '添加条件' });
    await popover
      .getByRole('spinbutton', { name: en ? 'Value' : '值', exact: true })
      .fill('999999');
    await expect(popover).toContainText(en ? 'Would exclude 9 more sets.' : '将额外排除 9 组。');
    await popover.getByRole('button', { name: en ? 'Add' : '添加', exact: true }).click();
    await expect(
      page.getByRole('heading', { name: en ? 'No combination passes' : '无符合条件的组合' }),
    ).toBeVisible();
    await page.screenshot({ path: info.outputPath(`R9-${language}.png`) });
    await page.getByRole('button', { name: en ? 'Remove' : '移除', exact: true }).click();
    await expect(page.getByText(en ? '9 / 9 pass' : '9 / 9 符合')).toBeVisible();

    const original = await page.evaluate(() =>
      (window as unknown as SummaryWindow).backtestHooks
        .backtest()
        .inputs.map((field) => field.value),
    );
    await page.getByRole('button', { name: en ? 'View backtest' : '查看这组参数的回测' }).click();
    await expect(
      page.getByText(en ? 'Current inputs are unchanged.' : '原参数未被修改。'),
    ).toBeVisible();
    await expect(page.getByTestId('price-chart')).toBeVisible();
    expect(
      await page.evaluate(() =>
        (window as unknown as SummaryWindow).backtestHooks
          .backtest()
          .inputs.map((field) => field.value),
      ),
    ).toEqual(original);
    await noPageOverflow(page);
    await page.screenshot({ path: info.outputPath(`B16-${language}.png`) });
    await page.getByRole('button', { name: en ? 'Back to optimization' : '返回优化' }).click();
    await page
      .getByRole('button', { name: en ? 'Apply to inputs' : '应用到参数', exact: true })
      .click();
    await expect(
      page.getByRole('button', { name: en ? 'Undo' : '撤销', exact: true }),
    ).toBeVisible();
    await page.screenshot({ path: info.outputPath(`B17-${language}.png`) });
    await page.getByRole('button', { name: en ? 'Undo' : '撤销', exact: true }).click();
    expect(
      await page.evaluate(() =>
        (window as unknown as SummaryWindow).backtestHooks
          .backtest()
          .inputs.map((field) => field.value),
      ),
    ).toEqual(original);
    expect(errors).toEqual([]);
  });

  test(`unvalidated full-range results (${language})`, async ({ page }, info) => {
    const errors = await open(page, language, source, true);
    await expect(
      page.getByText(language === 'en' ? 'Unvalidated' : '未验证').first(),
    ).toBeVisible();
    await expect(
      page.getByRole('radio', { name: language === 'en' ? 'IS vs OOS' : '样本内 vs 样本外' }),
    ).toBeDisabled();
    await noPageOverflow(page);
    await page.screenshot({ path: info.outputPath(`R3-${language}.png`) });
    expect(errors).toEqual([]);
  });

  test(`failed combinations export and preview diagnostics (${language})`, async ({
    page,
  }, info) => {
    const errors = await open(page, language, failing);
    const en = language === 'en';
    await page
      .getByRole('banner')
      .getByRole('button', { name: en ? '3 failed' : '3 组报错' })
      .click();
    const dialog = page.getByRole('dialog', { name: en ? '3 failed' : '3 组报错' });
    await expect(dialog.getByText('Stopped on purpose')).toHaveCount(3);
    await expect(dialog).toContainText(en ? 'bar 5' : '第 5 根 K 线');
    await page.screenshot({ path: info.outputPath(`R11-${language}.png`) });
    const download = page.waitForEvent('download');
    await dialog.getByRole('button', { name: en ? 'Export list' : '导出列表' }).click();
    expect((await download).suggestedFilename()).toBe('failed-combinations.csv');
    await dialog
      .getByRole('button', { name: en ? 'Backtest' : '以此参数回测', exact: true })
      .first()
      .click();
    await expect(page.getByRole('tab', { name: en ? /^Issues/ : /^问题/ })).toHaveAttribute(
      'aria-selected',
      'true',
    );
    await expect(page.getByRole('list', { name: en ? 'Issues' : '问题' })).toContainText(
      'Stopped on purpose',
    );
    expect(errors).toEqual([]);
  });
}
