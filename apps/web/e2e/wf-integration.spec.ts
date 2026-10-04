import { expect, test, type Page, type TestInfo } from '@playwright/test';
import type { FeedDataset } from '@pine/market-data';
import { syntheticBars } from '../src/charts-dev/synthetic.ts';
import type { BacktestStoreState } from '../src/state/backtest.ts';
import type { OptimizationStoreState } from '../src/state/optimization.ts';
import type { UiState } from '../src/state/ui.ts';
import { workerWaitTimeout } from './optimize-waits.ts';
import { origins } from './ports.ts';

test.use({ baseURL: origins.dev });
const emulatedHardwareConcurrency = Number(process.env.E2E_HARDWARE_CONCURRENCY ?? 3);
const cpuThrottleRate = Number(process.env.E2E_CPU_THROTTLE ?? 0);
/**
 * Sized for a 2-vCPU CI runner, as the other real-Worker specs are: 2,900 hourly bars walk forward
 * one IS month and one OOS month a step, four windows rolling or anchored, the last partial, each
 * searching 24 sets (Length 10–20 by 2, Multiplier 1.5–3 by 0.5).
 */
const barCount = 2_900;
const windowCount = 4;
const combinations = 24;

type Hooks = Window & {
  wf: () => OptimizationStoreState;
  backtest: () => BacktestStoreState;
  ui: () => UiState;
  analysisJobs: string[];
  beforeTolerance: OptimizationStoreState;
  releaseWindows: () => void;
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
      { timeout: workerWaitTimeout },
    )
    .toBe(true);
}

test('real walk-forward: live, rolling, flat, anchored, stability, preview and apply', async ({
  page,
}, info) => {
  // Measured at 12–27 s here, and at 21–32 s on 2 threads with 4× CPU throttling
  // (E2E_CPU_THROTTLE=4), up to 1.5 minutes while the machine was otherwise at full load; the
  // limit leaves twice that.
  test.setTimeout(180_000);
  const errors: string[] = [];
  page.on('pageerror', (error) => errors.push(error.message));
  page.on('console', (message) => {
    if (message.type() === 'error') errors.push(message.text());
  });
  const dataset: FeedDataset = {
    input: {
      bars: syntheticBars(barCount),
      timeframe: '60',
      syminfo: {
        ticker: 'BTCUSDT',
        type: 'crypto',
        mintick: 0.01,
        mincontract: 0.001,
        pointvalue: 1,
        currency: 'USD',
        timezone: 'Etc/UTC',
      },
    },
    fetchedAt: Date.UTC(2025, 4, 5),
    profileEstimated: false,
  };
  await page.clock.setFixedTime(new Date('2025-05-05T00:00:00Z'));
  await page.route('**/*', async (route) => {
    const url = new URL(route.request().url());
    if (url.hostname !== '127.0.0.1') {
      errors.push(`Unexpected network: ${url.hostname}`);
      await route.abort();
    } else if (url.pathname === '/api/market/bars') await route.fulfill({ json: dataset });
    else if (url.pathname.startsWith('/api/market')) {
      errors.push(`Unexpected market request: ${url.pathname}`);
      await route.abort();
    } else await route.continue();
  });
  if (cpuThrottleRate > 0) {
    const cdp = await page.context().newCDPSession(page);
    await cdp.send('Emulation.setCPUThrottlingRate', { rate: cpuThrottleRate });
  }
  await page.addInitScript((hardwareConcurrency) => {
    localStorage.setItem('optipine.ui', JSON.stringify({ state: { language: 'en' }, version: 1 }));
    Object.defineProperty(navigator, 'hardwareConcurrency', { get: () => hardwareConcurrency });
  }, emulatedHardwareConcurrency);
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
  expect(
    await page.evaluate(() => (window as unknown as Hooks).backtest().dataset?.input.bars.length),
  ).toBe(barCount);
  await page.getByRole('button', { name: 'Optimize', exact: true }).click();
  await expect(page.getByRole('radio', { name: 'Walk-forward' })).toBeVisible();
  await page.evaluate(async () => {
    const path = '/src/state/optimization.ts';
    const { getOptimizationStore } = await import(/* @vite-ignore */ path);
    (window as unknown as Hooks).wf = () => getOptimizationStore().getState();
  });
  await page.getByRole('radio', { name: 'Walk-forward' }).click();
  for (const [name, value] of Object.entries({
    'In-sample months': '1',
    'Out-of-sample months': '1',
    'Step in months': '1',
    'Length from': '10',
    'Length to': '20',
    'Length step': '2',
    'Multiplier from': '1.5',
    'Multiplier to': '3',
    'Multiplier step': '0.5',
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
  expect(
    await page.evaluate(() => {
      const { plan, search } = (window as unknown as Hooks).wf();
      return {
        windows: plan.status === 'planned' ? plan.windows.length : null,
        combinations: search.sampling?.combinations,
      };
    }),
  ).toEqual({ windows: windowCount, combinations });
  const run = page.getByRole('region', { name: 'Optimization run', exact: true });

  // Windows this small finish in moments, so the second one waits on the real pool until the
  // test has seen the first done and the rest waiting (W4).
  await page.evaluate(async () => {
    const path = '/src/state/services.ts';
    const { getServices } = await import(/* @vite-ignore */ path);
    const pool = getServices().optimization.pool;
    const optimize = pool.optimize.bind(pool);
    const hooks = window as unknown as Hooks;
    const held = new Promise<void>((resolve) => (hooks.releaseWindows = resolve));
    let calls = 0;
    pool.optimize = async (...args: unknown[]) => {
      if (calls++ === 1) await held;
      return optimize(...args);
    };
  });
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
      { timeout: workerWaitTimeout },
    )
    .toBe(true);
  await capture(page, info, 'W4');
  await page.evaluate(() => (window as unknown as Hooks).releaseWindows());
  await settled(page);
  const initial = await page.evaluate(() => {
    const state = (window as unknown as Hooks).wf();
    return {
      windows: state.walkForward!.windows.length,
      statuses: state.walkForward!.windows.map((window) => window.status),
      inSampleNet: state.walkForward!.windows.map((window) => window.inSample?.netProfit ?? null),
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
      timeout: workerWaitTimeout,
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
      timeout: workerWaitTimeout,
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

  // R10's shared popover is a stub; exercise W5 through the real filter action. Just above the
  // weakest window's best IS net profit, that window has no set left and the others keep theirs.
  const threshold = Math.min(...initial.inSampleNet.map((net) => net ?? Infinity)) + 1;
  await page.evaluate(
    (value) =>
      (window as unknown as Hooks)
        .wf()
        .actions.addFilter({ metric: 'netProfit', operator: '>=', value }),
    threshold,
  );
  await settled(page);
  expect(
    await page.evaluate(() => {
      const { totals } = (window as unknown as Hooks).wf().walkForward!;
      return { flat: totals.flat > 0, traded: totals.traded > 0 };
    }),
  ).toEqual({ flat: true, traded: true });
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
        windows: view.windows.length,
        starts: new Set(view.windows.map((window) => window.plan.inSampleStart)).size,
        error: view.error,
      };
    }),
  ).toEqual({ windows: windowCount, starts: 1, error: null });
  await capture(page, info, 'W6');
  expect(errors).toEqual([]);
});
