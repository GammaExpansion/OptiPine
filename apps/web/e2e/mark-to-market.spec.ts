import { expect, test } from '@playwright/test';
import { writeFile } from 'node:fs/promises';
import { sweep } from '@pine/engine';
import { enumerateGrid, metricValue, trialIdForParameters } from '@pine/optimizer';
import type { OptimizationStoreState } from '../src/state/optimization.ts';
import { propertySettings } from '../src/workflows/properties.ts';
import { installMarketFixtures } from './market-fixtures.ts';
import { origins } from './ports.ts';

test.use({ baseURL: origins.dev });
type Hooks = Window & { optimization: () => OptimizationStoreState };

test('recorded BTC: IS profit ranks the highest Top 20 curve at the split', async ({
  page,
}, info) => {
  test.setTimeout(240_000);
  const errors: string[] = [];
  page.on('pageerror', (error) => errors.push(error.message));
  await installMarketFixtures(page);
  await page.addInitScript(() => {
    localStorage.setItem('optipine.ui', JSON.stringify({ state: { language: 'en' }, version: 1 }));
    Object.defineProperty(navigator, 'hardwareConcurrency', { get: () => 3 });
  });
  await page.goto('/');
  await page.getByRole('button', { name: /Load example/ }).click();
  await page.getByRole('button', { name: 'Optimize', exact: true }).click();
  await expect(page.getByRole('button', { name: /^By IS profit/ })).toBeVisible();
  await page.evaluate(async () => {
    const path = '/src/state/optimization.ts';
    const { getOptimizationStore } = await import(/* @vite-ignore */ path);
    (window as unknown as Hooks).optimization = () => getOptimizationStore().getState();
  });
  for (const [name, value] of Object.entries({
    'Length from': '100',
    'Length to': '200',
    'Length step': '20',
    'Multiplier from': '3.5',
    'Multiplier to': '4.25',
    'Multiplier step': '0.25',
  }))
    await page.getByRole('spinbutton', { name, exact: true }).fill(value);
  for (const title of ['Source', 'Use trailing stop', 'Trail %']) {
    const checkbox = page.getByRole('checkbox', { name: `Search ${title}`, exact: true });
    if ((await checkbox.getAttribute('aria-checked')) === 'true') await checkbox.click();
  }
  const filters = page.getByRole('group', { name: 'Filters', exact: true });
  while (await filters.getByRole('button', { name: /^Remove / }).count())
    await filters
      .getByRole('button', { name: /^Remove / })
      .first()
      .click();
  await page.getByRole('button', { name: '+ Condition', exact: true }).first().click();
  const condition = page.getByRole('dialog', { name: 'Add condition' });
  await condition.getByRole('combobox', { name: 'Metric', exact: true }).click();
  await page.getByRole('option', { name: 'Profit factor', exact: true }).click();
  await condition.getByRole('spinbutton', { name: 'Value', exact: true }).fill('1.2');
  await condition.getByRole('button', { name: 'Add', exact: true }).click();
  await page
    .getByRole('region', { name: 'Optimization run' })
    .getByRole('button', { name: 'Start', exact: true })
    .click();
  await expect
    .poll(
      () =>
        page.evaluate(() => {
          const state = (window as unknown as Hooks).optimization();
          return (
            state.run.status === 'done' &&
            state.topEquity.status === 'ready' &&
            !state.views?.pending
          );
        }),
      { timeout: 150_000 },
    )
    .toBe(true);
  const result = await page.evaluate(() => {
    const state = (window as unknown as Hooks).optimization();
    const { splitIndex, curves } = state.topEquity;
    return {
      snapshot: state.results!.computedWith,
      rows: state.views!.leaderboard.rows,
      curves: curves.map((curve) => ({
        rank: curve.rank,
        trialId: curve.trialId,
        error: curve.error,
        atSplit: curve.equity?.[splitIndex! - 1] ?? null,
      })),
    };
  });
  expect(result.curves.length).toBeGreaterThan(1);
  expect(result.curves.every((curve) => curve.error === null)).toBe(true);
  const initial = 100_000;
  for (const curve of result.curves)
    expect(curve.atSplit!).toBeLessThanOrEqual(result.curves[0].atSplit! + 0.000001);
  for (const row of result.rows) {
    const curve = result.curves.find((curve) => curve.trialId === row.trialId)!;
    expect(curve.atSplit! - initial).toBeCloseTo(row.inSample.netProfit!, 5);
  }
  await expect(page.getByRole('columnheader', { name: 'IS profit', exact: true })).toBeVisible();
  await expect(page.getByRole('img', { name: 'Top 20 equity' })).toBeVisible();
  await page.evaluate(() => document.fonts.ready);
  await page.screenshot({ path: info.outputPath('marked-to-market-btc.png'), fullPage: true });

  // Independent closed-only ranking for a reproducible before/after record on the same input.
  const { snapshot } = result;
  const baseline = sweep(
    snapshot.source,
    {
      ...snapshot.dataset.input,
      bars: snapshot.dataset.input.bars.slice(0, snapshot.inSampleBars!),
      settings: propertySettings(snapshot.properties),
      realtimeTail: false,
      strategyClosePending: false,
    },
    enumerateGrid(snapshot.search.space!).map((inputs) => ({ inputs })),
  );
  expect(baseline.compilation.success).toBe(true);
  const figures = baseline.runs
    .map(({ parameters, result }) => ({
      trialId: trialIdForParameters(parameters),
      inputs: parameters.inputs,
      closed: metricValue(result.metrics, 'Net profit')!,
      open: metricValue(result.metrics, 'Open PnL')!,
      factor: metricValue(result.metrics, 'Profit factor'),
    }))
    .filter((row) => row.factor !== null && row.factor >= 1.2);
  const before = [...figures].sort(
    (a, b) => b.closed - a.closed || a.trialId.localeCompare(b.trialId),
  );
  const after = [...figures].sort(
    (a, b) => b.closed + b.open - (a.closed + a.open) || a.trialId.localeCompare(b.trialId),
  );
  expect(result.curves.map((curve) => curve.trialId)).toEqual(
    after.slice(0, 20).map((row) => row.trialId),
  );
  await writeFile(
    info.outputPath('ranking-before-after.json'),
    JSON.stringify(
      {
        bars: snapshot.dataset.input.bars.length,
        start: snapshot.dataset.input.bars[0].time,
        end: snapshot.dataset.input.bars.at(-1)!.time,
        split: snapshot.dataset.input.bars[snapshot.inSampleBars!].time,
        before,
        after,
        curves: result.curves,
      },
      null,
      2,
    ),
  );
  await page.getByRole('button', { name: 'View backtest', exact: true }).click();
  await expect(page.locator('[data-preview-banner]')).toContainText('IS profit');
  await expect(page.locator('[data-preview-banner]')).toContainText('OOS profit');
  expect(errors).toEqual([]);
});
