import { expect, test, type Page } from '@playwright/test';
import type { IChartApi } from 'lightweight-charts';
import { installMarketFixtures } from './market-fixtures.ts';
import { origins } from './ports.ts';

type Charts = Window & { viewCharts: { price: IChartApi; equity: IChartApi } };
test.use({ baseURL: origins.dev });

/** Instrument only the dev responses; production code has no chart globals or test entry. */
async function observeCharts(page: Page) {
  for (const [file, statement, replacement] of [
    [
      'PriceChart',
      'const chart = createChart(element, options);',
      'const chart = createChart(element, options); (window.viewCharts ??= {}).price = chart;',
    ],
    [
      'EquityCharts',
      'charts.current = [equity, drawdown];',
      'charts.current = [equity, drawdown]; (window.viewCharts ??= {}).equity = equity;',
    ],
  ]) {
    await page.route(`**/src/charts/${file}.tsx*`, async (route) => {
      const response = await route.fetch();
      const body = await response.text();
      expect(body).toContain(statement);
      await route.fulfill({ response, body: body.replace(statement, replacement) });
    });
  }
}

async function run(page: Page) {
  await expect
    .poll(() =>
      page.evaluate(async () => {
        const path = '/src/state/backtest.ts';
        const { getBacktestStore } = await import(/* @vite-ignore */ path);
        return getBacktestStore().getState().readiness.ok;
      }),
    )
    .toBe(true);
  await page.evaluate(async () => {
    const path = '/src/state/backtest.ts';
    const { getBacktestStore } = await import(/* @vite-ignore */ path);
    await getBacktestStore().getState().actions.run();
    if (getBacktestStore().getState().run.status !== 'done') throw new Error('Backtest failed');
  });
}

async function ranges(page: Page) {
  return page.evaluate(() => {
    const { price, equity } = (window as unknown as Charts).viewCharts;
    return {
      price: price.timeScale().getVisibleLogicalRange()!,
      equity: equity.timeScale().getVisibleLogicalRange()!,
      autoScale: price.priceScale('right').options().autoScale,
      value: price.priceScale('right').getVisibleRange(),
      panes: price.panes().map((pane) => pane.getHeight()),
    };
  });
}

test('recorded re-runs retain chart views, units and trade scroll; new data starts fresh', async ({
  page,
}, info) => {
  test.setTimeout(120_000);
  const errors: string[] = [];
  page.on('pageerror', (error) => errors.push(error.message));
  await installMarketFixtures(page);
  await observeCharts(page);
  await page.goto('/');
  await page.getByRole('button', { name: /Load example/ }).click();
  await expect
    .poll(
      () =>
        page.evaluate(async () => {
          const path = '/src/state/backtest.ts';
          return (await import(/* @vite-ignore */ path)).getBacktestStore().getState().run.status;
        }),
      { timeout: 30_000 },
    )
    .toBe('done');
  // A source edit adds a lower plot pane, without opening a different script.
  await page.evaluate(async () => {
    const path = '/src/state/backtest.ts';
    const state = (await import(/* @vite-ignore */ path)).getBacktestStore().getState();
    state.actions.setSource(state.source.replace('overlay = true', 'overlay = false'));
  });
  await run(page);
  await page.getByRole('tab', { name: 'Equity', exact: true }).click();
  const equity = page.getByTestId('equity-charts');
  await expect(equity.locator('canvas').first()).toBeVisible();
  await equity.getByRole('button', { name: 'Percent', exact: true }).click();
  await page.evaluate(() => {
    const { price } = (window as unknown as Charts).viewCharts;
    price.timeScale().setVisibleLogicalRange({ from: 1800, to: 1880 });
    price.priceScale('right').setVisibleRange({ from: 75000, to: 115000 });
    price.panes()[1].setHeight(100);
  });
  const eqPane = equity.getByRole('group', { name: /^Equity chart/ });
  // Keyboard commands queue a chart render. Wait for each requested range so the baseline
  // cannot capture an earlier keypress while the screenshot already shows the next one.
  for (const key of [...Array<string>(5).fill('+'), ...Array<string>(4).fill('ArrowLeft')]) {
    const prior = (await ranges(page)).equity;
    const width = prior.to - prior.from;
    const shift = width * 0.1;
    await eqPane.press(key);
    await expect
      .poll(async () => (await ranges(page)).equity.from)
      .toBeCloseTo(prior.from + (key === '+' ? shift : -shift), 5);
    await expect.poll(async () => (await ranges(page)).equity.to).toBeCloseTo(prior.to - shift, 5);
  }
  await page.evaluate(() => document.fonts.ready);
  const before = await ranges(page);
  expect(before.autoScale).toBe(false);
  expect(before.panes).toHaveLength(2);
  await page.screenshot({ path: info.outputPath('rerun-before.png') });

  // Sample every frame through the real Worker run, including its running state and result commit.
  const frames = await page.evaluate(async () => {
    const path = '/src/state/backtest.ts';
    const store = (await import(/* @vite-ignore */ path)).getBacktestStore();
    store.getState().actions.setInput('Length', 190);
    const samples: {
      price: { from: number; to: number };
      equity: { from: number; to: number };
      running: boolean;
    }[] = [];
    let done = false;
    const work = store
      .getState()
      .actions.run()
      .then(() => {
        done = true;
      });
    do {
      const charts = (window as unknown as Charts).viewCharts;
      samples.push({
        price: charts.price.timeScale().getVisibleLogicalRange()!,
        equity: charts.equity.timeScale().getVisibleLogicalRange()!,
        running: store.getState().run.status === 'running',
      });
      await new Promise(requestAnimationFrame);
    } while (!done);
    await work;
    await new Promise(requestAnimationFrame);
    return samples;
  });
  expect(frames.some((frame) => frame.running)).toBe(true);
  await info.attach('view-frames', {
    body: JSON.stringify({ before, frames, after: await ranges(page) }, null, 2),
    contentType: 'application/json',
  });
  for (const frame of [...frames, await ranges(page)]) {
    for (const chart of ['price', 'equity'] as const) {
      expect(
        Math.abs(frame[chart].from - before[chart].from),
        JSON.stringify({ chart, before: before[chart], frame: frame[chart] }),
      ).toBeLessThan(1);
      expect(Math.abs(frame[chart].to - before[chart].to)).toBeLessThan(1);
    }
  }
  const after = await ranges(page);
  expect(after.autoScale).toBe(false);
  expect(after.value!.from).toBeCloseTo(before.value!.from, 4);
  expect(after.value!.to).toBeCloseTo(before.value!.to, 4);
  expect(after.panes).toEqual(before.panes);
  await expect(equity.getByRole('button', { name: 'Percent', exact: true })).toHaveAttribute(
    'aria-pressed',
    'true',
  );
  await expect(page.getByRole('tab', { name: 'Equity', exact: true })).toHaveAttribute(
    'aria-selected',
    'true',
  );
  await page.screenshot({ path: info.outputPath('rerun-after.png') });

  // Removing and reintroducing the plot pane preserves the main view and saved pane proportion.
  for (const overlay of [true, false]) {
    await page.evaluate(async (overlay) => {
      const path = '/src/state/backtest.ts';
      const state = (await import(/* @vite-ignore */ path)).getBacktestStore().getState();
      state.actions.setSource(
        state.source.replace(/overlay = (true|false)/, `overlay = ${overlay}`),
      );
    }, overlay);
    await run(page);
    expect((await ranges(page)).price).toEqual(before.price);
  }
  expect((await ranges(page)).panes).toEqual(before.panes);

  await page.getByRole('tab', { name: /^Trades/ }).click();
  const grid = page.getByRole('grid');
  await grid.evaluate((element) => {
    element.scrollTop = 180;
  });
  await expect.poll(() => grid.evaluate((element) => element.scrollTop)).toBe(180);
  // The first mounted row belongs to virtual overscan above the viewport.
  await grid.locator('[data-trade]').nth(8).click();
  await expect.poll(() => grid.evaluate((element) => element.scrollTop)).toBe(180);
  const focusedRange = await page.evaluate(() =>
    (window as unknown as Charts).viewCharts.price.timeScale().getVisibleLogicalRange(),
  );
  await expect(page.getByTestId('trade-detail')).toBeVisible();
  await run(page);
  await expect.poll(() => grid.evaluate((element) => element.scrollTop)).toBe(180);
  await expect(page.getByTestId('trade-detail')).toHaveCount(0);
  expect(
    await page.evaluate(() =>
      (window as unknown as Charts).viewCharts.price.timeScale().getVisibleLogicalRange(),
    ),
  ).toEqual(focusedRange);
  await page.evaluate(
    (range) =>
      (window as unknown as Charts).viewCharts.price.timeScale().setVisibleLogicalRange(range),
    before.price,
  );
  await page.getByRole('tab', { name: 'Equity', exact: true }).click();
  await expect(equity.getByRole('button', { name: 'Percent', exact: true })).toHaveAttribute(
    'aria-pressed',
    'true',
  );
  expect((await ranges(page)).equity).toEqual(before.equity);

  // B16 owns its first view; closing it restores the main chart, including after tab unmounts.
  await page.evaluate(async () => {
    const servicesPath = '/src/state/services.ts';
    await (await import(/* @vite-ignore */ servicesPath)).getServices().loadOptimization();
    const path = '/src/state/backtest.ts';
    const state = (await import(/* @vite-ignore */ path)).getBacktestStore().getState();
    const bars = state.dataset.input.bars;
    await state.actions.preview(
      { Length: 200 },
      {
        kind: 'window',
        optimizationId: 1,
        trialId: 'preview',
        window: 0,
        ranges: {
          inSample: { start: bars[4000].time, end: bars[6000].time },
          outOfSample: { start: bars[6000].time, end: bars[7000].time },
        },
      },
    );
  });
  await expect.poll(async () => (await ranges(page)).price.from).toBeGreaterThan(3000);
  await page.evaluate(async () => {
    const path = '/src/state/backtest.ts';
    (await import(/* @vite-ignore */ path))
      .getBacktestStore()
      .getState()
      .actions.backToOptimization();
  });
  await expect.poll(async () => (await ranges(page)).price).toEqual(before.price);
  await expect.poll(async () => (await ranges(page)).equity).toEqual(before.equity);

  await page.getByTestId('price-chart').getByRole('group').press('Home');
  await expect.poll(async () => (await ranges(page)).price.from).toBeCloseTo(17520 - 150, 0);
  expect((await ranges(page)).autoScale).toBe(true);
  await equity.getByRole('button', { name: 'Reset zoom', exact: true }).click();
  await expect.poll(async () => (await ranges(page)).equity.from).toBeCloseTo(0, 0);
  // Zoom again so the new-data check cannot pass merely because Reset zoom already ran.
  await eqPane.press('+');
  await page.evaluate(() =>
    (window as unknown as Charts).viewCharts.price
      .timeScale()
      .setVisibleLogicalRange({ from: 1800, to: 1880 }),
  );

  // Accept a different timeframe through the market UI and run on its recorded aggregate bars.
  await page.getByRole('radio', { name: '4h', exact: true }).click();
  await page.getByRole('button', { name: 'Use this data', exact: true }).click();
  await run(page);
  const count = await page.evaluate(async () => {
    const path = '/src/state/backtest.ts';
    return (await import(/* @vite-ignore */ path)).getBacktestStore().getState().dataset.input.bars
      .length;
  });
  await expect.poll(async () => (await ranges(page)).price.from).toBeCloseTo(count - 150, 0);
  await expect.poll(async () => (await ranges(page)).equity.from).toBeCloseTo(0, 0);
  expect((await ranges(page)).autoScale).toBe(true);
  await expect(equity.getByRole('button', { name: 'Amount', exact: true })).toHaveAttribute(
    'aria-pressed',
    'true',
  );
  await page.getByRole('tab', { name: /^Trades/ }).click();
  await expect.poll(() => grid.evaluate((element) => element.scrollTop)).toBe(0);
  expect(errors).toEqual([]);
});
