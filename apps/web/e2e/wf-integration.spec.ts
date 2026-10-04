import { expect, test, type Page, type TestInfo } from '@playwright/test';
import type { BacktestStoreState } from '../src/state/backtest.ts';
import type { OptimizationStoreState } from '../src/state/optimization.ts';
import type { UiState } from '../src/state/ui.ts';
import { installMarketFixtures } from './market-fixtures.ts';
import { origins } from './ports.ts';

test.use({ baseURL: origins.dev });

type Hooks = Window & {
  wf: () => OptimizationStoreState;
  backtest: () => BacktestStoreState;
  ui: () => UiState;
  analysisJobs: string[];
  beforeTolerance: OptimizationStoreState;
};

async function capture(page: Page, info: TestInfo, board: string) {
  for (const language of ['en', 'zh'] as const) {
    await page.evaluate(
      (language) => (window as unknown as Hooks).ui().setLanguage(language),
      language,
    );
    await page.evaluate(() => document.fonts.ready);
    await expect(page.locator('html')).toHaveAttribute('lang', language === 'en' ? 'en' : 'zh-CN');
    await expect(page.getByTestId('wf-equity')).toBeVisible();
    expect(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth)).toBe(
      true,
    );
    await page.screenshot({ path: info.outputPath(`${board}-${language}.png`) });
  }
  await page.evaluate(() => (window as unknown as Hooks).ui().setLanguage('en'));
}

async function settled(page: Page) {
  await expect
    .poll(
      () =>
        page.evaluate(() => {
          const state = (window as unknown as Hooks).wf();
          const view = state.walkForward;
          return (
            state.run.status === 'done' &&
            view &&
            !view.pending &&
            !view.mapPending &&
            !view.stability?.pending
          );
        }),
      { timeout: 240_000 },
    )
    .toBe(true);
}

test('real walk-forward: live, rolling, flat, anchored, stability, preview and apply', async ({
  page,
}, info) => {
  test.setTimeout(600_000);
  const errors: string[] = [];
  page.on('pageerror', (error) => errors.push(error.message));
  page.on('console', (message) => {
    if (message.type() === 'error') errors.push(message.text());
  });
  const requests = await installMarketFixtures(page);
  await page.addInitScript(() =>
    localStorage.setItem('optipine.ui', JSON.stringify({ state: { language: 'en' }, version: 1 })),
  );
  await page.goto('/');
  await page.evaluate(async () => {
    const load = (path: string) => import(/* @vite-ignore */ path);
    const { loadExample, getBacktestStore } = await load('/src/state/backtest.ts');
    const { uiStore } = await load('/src/state/ui.ts');
    const hooks = window as unknown as Hooks;
    hooks.backtest = () => getBacktestStore().getState();
    hooks.ui = () => uiStore.getState();
    await loadExample('trend-breakout');
  });
  await page.waitForFunction(
    () => (window as unknown as Hooks).backtest().compile.status === 'compiled',
  );
  expect(requests.some((url) => url.pathname.endsWith('/bars'))).toBe(true);
  await page.getByRole('button', { name: 'Optimize', exact: true }).click();
  await expect(page.getByRole('radio', { name: 'Walk-forward' })).toBeVisible();
  await page.evaluate(async () => {
    const path = '/src/state/optimization.ts';
    const { getOptimizationStore } = await import(/* @vite-ignore */ path);
    (window as unknown as Hooks).wf = () => getOptimizationStore().getState();
  });
  await page.getByRole('radio', { name: 'Walk-forward' }).click();
  for (const [name, value] of Object.entries({
    'Length from': '18',
    'Length to': '38',
    'Length step': '1',
    'Multiplier from': '1',
    'Multiplier to': '3',
    'Multiplier step': '0.25',
  }))
    await page.getByRole('spinbutton', { name, exact: true }).fill(value);
  for (const title of ['Source', 'Use trailing stop', 'Trail %']) {
    const box = page.getByRole('checkbox', { name: `Search ${title}`, exact: true });
    if ((await box.getAttribute('aria-checked')) === 'true') await box.click();
  }
  // Remove the default ranking filters for the baseline, using the workflow's own actions.
  await page.evaluate(() => {
    const hooks = window as unknown as Hooks;
    while (hooks.wf().viewSettings.filters.length) hooks.wf().actions.removeFilter(0);
  });
  const run = page.getByRole('region', { name: 'Optimization run', exact: true });
  await expect(run).toContainText('189');
  await run.getByRole('button', { name: 'Start', exact: true }).click();
  await expect
    .poll(
      () =>
        page.evaluate(() => {
          const view = (window as unknown as Hooks).wf().walkForward;
          return (
            !!view?.inProgress &&
            view.totals.completed > 0 &&
            view.windows.some((window) => window.status === 'waiting')
          );
        }),
      { timeout: 180_000 },
    )
    .toBe(true);
  await capture(page, info, 'W4');
  await settled(page);
  const initial = await page.evaluate(() => {
    const state = (window as unknown as Hooks).wf();
    return {
      id: state.results?.id,
      windows: state.walkForward!.windows.length,
      statuses: state.walkForward!.windows.map((window) => window.status),
      error: state.walkForward!.error,
    };
  });
  expect(initial.error).toBeNull();
  expect(initial.statuses.every((status) => status === 'done')).toBe(true);
  await capture(page, info, 'W1');
  const summary = page.getByRole('region', { name: 'Stitched OOS equity', exact: true });
  await summary.getByRole('radio', { name: 'Per window', exact: true }).click();
  await capture(page, info, 'W2');
  await summary.getByRole('radio', { name: 'Stitched', exact: true }).click();

  // Instrument the real analysis client: a tolerance edit must send only a stability job.
  await page.evaluate(async () => {
    const path = '/src/state/services.ts';
    const { getServices } = await import(/* @vite-ignore */ path);
    const analysis = getServices().optimization.analysis;
    const request = analysis.request.bind(analysis);
    const hooks = window as unknown as Hooks;
    hooks.beforeTolerance = hooks.wf();
    hooks.analysisJobs = [];
    analysis.request = (job: string, input: unknown) => {
      hooks.analysisJobs.push(job);
      return request(job, input);
    };
  });
  const stability = page.getByRole('region', { name: 'Walk-forward stability', exact: true });
  await stability.getByRole('combobox', { name: 'Tolerance', exact: true }).click();
  await page.getByRole('option', { name: '5%', exact: true }).click();
  await settled(page);
  expect(
    await page.evaluate(() => {
      const hooks = window as unknown as Hooks;
      const before = hooks.beforeTolerance,
        after = hooks.wf();
      return {
        jobs: hooks.analysisJobs,
        results: before.results === after.results,
        windows:
          JSON.stringify(before.walkForward!.windows) ===
          JSON.stringify(after.walkForward!.windows),
        equity:
          JSON.stringify(before.walkForward!.equity) === JSON.stringify(after.walkForward!.equity),
        tolerance: after.walkForward!.stability!.tolerance,
      };
    }),
  ).toEqual({ jobs: ['stability'], results: true, windows: true, equity: true, tolerance: 0.05 });
  await stability.getByRole('radio', { name: 'Window map', exact: true }).click();
  await stability.getByRole('combobox', { name: 'Window', exact: true }).click();
  await page.getByRole('option', { name: 'W1', exact: true }).click();
  await settled(page);
  await capture(page, info, 'W3-window');
  const windowSurface = await page
    .getByTestId('parameter-map')
    .evaluate((canvas) => (canvas as HTMLCanvasElement).toDataURL());
  await stability.getByRole('radio', { name: `${initial.windows}-win mean`, exact: true }).click();
  await settled(page);
  expect(
    await page
      .getByTestId('parameter-map')
      .evaluate((canvas) => (canvas as HTMLCanvasElement).toDataURL()),
  ).not.toBe(windowSurface);
  await capture(page, info, 'W3-mean');

  const beforePreview = await page.evaluate(() => {
    const hooks = window as unknown as Hooks;
    const view = hooks.wf().walkForward!;
    return { inputs: hooks.backtest().inputs, selection: view.selection, rows: view.searchRows };
  });
  await page.getByRole('button', { name: 'View backtest', exact: true }).click();
  await expect
    .poll(() => page.evaluate(() => (window as unknown as Hooks).backtest().preview?.run.status), {
      timeout: 60_000,
    })
    .toBe('done');
  expect(
    await page.evaluate(() => {
      const hooks = window as unknown as Hooks;
      return {
        page: hooks.ui().page,
        inputs: hooks.backtest().inputs,
        set: hooks.backtest().preview?.set,
        origin: hooks.backtest().preview?.origin,
      };
    }),
  ).toEqual({
    page: 'backtest',
    inputs: beforePreview.inputs,
    set: beforePreview.selection!.window.parameters,
    // The origin keeps the run's search rows, so the banner reads the values as it searched them.
    origin: { ...beforePreview.selection!.origin, searchRows: beforePreview.rows },
  });
  await expect(
    page.getByText(
      `Previewing the parameters of optimization result W${beforePreview.selection!.window.plan.index + 1}`,
    ),
  ).toBeVisible();
  await page.screenshot({ path: info.outputPath('B16-preview-en.png') });
  await page.getByRole('button', { name: 'Optimize', exact: true }).click();
  const fixed = await page.evaluate(() => (window as unknown as Hooks).wf().walkForward!.fixed);
  const rows = await page.evaluate(() => (window as unknown as Hooks).wf().walkForward!.searchRows);
  expect(fixed).not.toBeNull();
  await page.getByRole('button', { name: 'Apply to inputs', exact: true }).click();
  await expect
    .poll(() => page.evaluate(() => (window as unknown as Hooks).backtest().run.status), {
      timeout: 60_000,
    })
    .toBe('done');
  expect(
    await page.evaluate(() => {
      const hooks = window as unknown as Hooks;
      return {
        page: hooks.ui().page,
        inputs: Object.fromEntries(
          hooks.backtest().inputs.map((field) => [field.descriptor.title, field.value]),
        ),
        origin: hooks.backtest().applied?.origin,
        preview: hooks.backtest().preview,
      };
    }),
  ).toEqual({
    page: 'backtest',
    inputs: fixed!.parameters,
    origin: { ...fixed!.origin, searchRows: rows },
    preview: null,
  });
  await expect(
    page.getByText('Applied the parameters of fixed set and re-ran the backtest'),
  ).toBeVisible();
  await page.screenshot({ path: info.outputPath('B17-applied-en.png') });
  await page.getByRole('button', { name: 'Optimize', exact: true }).click();

  // R10's shared popover is a stub; exercise W5 through the real filter action.
  await page.evaluate(() =>
    (window as unknown as Hooks)
      .wf()
      .actions.addFilter({ metric: 'netProfit', operator: '>=', value: 20_000 }),
  );
  await settled(page);
  expect(
    await page.evaluate(() => (window as unknown as Hooks).wf().walkForward!.totals.flat),
  ).toBeGreaterThan(0);
  await capture(page, info, 'W5');
  await page.evaluate(() => (window as unknown as Hooks).wf().actions.removeFilter(0));
  await settled(page);
  await page.getByRole('radio', { name: 'Anchored', exact: true }).click();
  await run.getByRole('button', { name: 'Re-optimize', exact: true }).click();
  await settled(page);
  await expect(summary).toContainText('IS (anchored)');
  expect(
    await page.evaluate(() => {
      const view = (window as unknown as Hooks).wf().walkForward!;
      return {
        starts: new Set(view.windows.map((window) => window.plan.inSampleStart)).size,
        error: view.error,
      };
    }),
  ).toEqual({ starts: 1, error: null });
  await capture(page, info, 'W6');
  expect(errors).toEqual([]);
});
