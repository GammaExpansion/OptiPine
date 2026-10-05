import { expect, test } from '@playwright/test';
import type { OptimizationStoreState } from '../src/state/optimization.ts';
import { fixedClock, installMarketFixtures } from './market-fixtures.ts';
import { waitForTopEquity, workerWaitTimeout } from './optimize-waits.ts';
import { origins } from './ports.ts';

test.use({ baseURL: origins.dev, viewport: { width: 1440, height: 900 } });

type Hooks = Window & { optimization: () => OptimizationStoreState };

test('fresh Optimize runs the full recorded range with smoothing and the default filters', async ({
  page,
}, info) => {
  test.setTimeout(120_000);
  const errors: string[] = [];
  page.on('pageerror', (error) => errors.push(error.message));
  await installMarketFixtures(page);
  // Keep the fixture's dates while letting the displayed run duration advance naturally.
  await page.clock.install({ time: fixedClock });
  await page.addInitScript(() => {
    localStorage.setItem('optipine.ui', JSON.stringify({ state: { language: 'en' }, version: 1 }));
    Object.defineProperty(navigator, 'hardwareConcurrency', { get: () => 3 });
  });
  await page.goto('/');
  await page.getByRole('button', { name: /Load example/ }).click();
  await page.getByRole('button', { name: 'Optimize', exact: true }).click();
  const right = page.getByTestId('optimize-right');
  await expect(right.getByRole('radio', { name: 'None', exact: true })).toBeChecked();
  await expect(right.getByRole('slider', { name: 'OOS share' })).toHaveCount(0);
  await expect(right).toContainText('Trades ≥ 5');
  await expect(right).toContainText('Max DD ≤ 35%');
  await page.evaluate(async () => {
    const path = '/src/state/optimization.ts';
    const { getOptimizationStore } = await import(/* @vite-ignore */ path);
    (window as unknown as Hooks).optimization = () => getOptimizationStore().getState();
  });
  expect(
    await page.evaluate(() => (window as unknown as Hooks).optimization().viewSettings.smooth),
  ).toBe(true);
  // Nine real combinations, with no changes to validation, smoothing or filters.
  for (const [title, from, to, step] of [
    ['Length', 160, 200, 20],
    ['Multiplier', 2, 2.5, 0.25],
  ] as const) {
    await right.getByRole('spinbutton', { name: `${title} from`, exact: true }).fill(String(from));
    await right.getByRole('spinbutton', { name: `${title} to`, exact: true }).fill(String(to));
    await right.getByRole('spinbutton', { name: `${title} step`, exact: true }).fill(String(step));
  }
  for (const title of ['Source', 'Use trailing stop', 'Trail %'])
    await right.getByRole('checkbox', { name: `Search ${title}`, exact: true }).setChecked(false);
  await right.getByRole('button', { name: 'Start', exact: true }).click();
  await expect
    .poll(() => page.evaluate(() => (window as unknown as Hooks).optimization().run.status), {
      timeout: workerWaitTimeout,
    })
    .toBe('done');
  await waitForTopEquity(page, info);
  const state = await page.evaluate(() => {
    const state = (window as unknown as Hooks).optimization();
    return {
      mode: state.views?.mode,
      combinations: state.results?.combinations,
      backtests: state.runBlock.backtests,
      range: state.dataRange,
      filters: state.viewSettings.filters,
      cells: state.views?.map?.panel.cells.filter((cell) => cell.value !== null).length,
    };
  });
  expect(state).toMatchObject({
    mode: 'none',
    combinations: 9,
    backtests: 9,
    cells: 9,
    range: { all: { bars: 17_520 }, inSample: null, outOfSample: null },
    filters: [
      { metric: 'trades', operator: '>=', value: 5 },
      { metric: 'maxDrawdown', operator: '<=', value: 35 },
    ],
  });
  await expect(
    page.getByRole('switch', { name: 'Smooth: mean of ±1 step neighbours' }),
  ).toBeChecked();
  await expect(page.getByText('Profit · smoothed', { exact: true })).toBeVisible();
  await expect(page.getByTestId('optimize-summary').getByText('Unvalidated')).toBeVisible();
  await expect(page.getByRole('radio', { name: 'IS vs OOS', exact: true })).toBeDisabled();
  const map = page.getByTestId('parameter-map');
  await map.focus();
  await map.press('Home');
  const tooltip = page.getByRole('tooltip');
  await expect(tooltip).toContainText('Neighbourhood mean (±1 step)');
  await expect(tooltip.getByRole('columnheader', { name: 'Full range' })).toBeVisible();
  await map.press('Escape');
  await map.blur();
  await page.mouse.move(10, 50);
  await expect(tooltip).toBeHidden();
  await page.evaluate(() => document.fonts.ready);
  await page.screenshot({ path: info.outputPath('optimize-defaults.png') });
  await page.getByRole('radio', { name: '中', exact: true }).click();
  await expect(right.getByRole('radio', { name: '不验证', exact: true })).toBeChecked();
  await expect(right).toContainText('交易数 ≥ 5');
  await expect(right).toContainText('最大回撤 ≤ 35%');
  await expect(page.getByText('盈亏 · 平滑', { exact: true })).toBeVisible();
  expect(errors).toEqual([]);
});
