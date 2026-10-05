import { getBacktestStore, loadExample } from '../src/state/backtest.ts';
import { getMarketDataStore } from '../src/state/marketData.ts';
import { getOptimizationStore } from '../src/state/optimization.ts';
import { getServices } from '../src/state/services.ts';
import { uiStore } from '../src/state/ui.ts';

export const headerCases = [
  ['backtest', 'empty'],
  ['optimize', 'empty'],
  ['backtest', 'loaded'],
  ['optimize', 'loaded'],
  ['backtest', 'done'],
  ['optimize', 'done'],
  ['optimize', 'random'],
  ['optimize', 'windows'],
  ['backtest', 'running'],
  ['optimize', 'running'],
  ['optimize', 'walk-forward'],
  ['backtest', 'preview'],
  ['optimize', 'preview'],
  ['backtest', 'compile-error'],
  ['backtest', 'error'],
  ['optimize', 'error'],
  ['backtest', 'cancelled'],
  ['optimize', 'cancelled'],
  ['backtest', 'outdated'],
  ['optimize', 'outdated'],
] as const;

/**
 * Recorded market data and real results supply the app; fixed status snapshots let layout tests
 * inspect slow/failed runs at every width without racing a Worker or depending on machine speed.
 * This module is imported only by browser tests through the dev server.
 */
export async function installHeaderFixture() {
  await getServices().loadOptimization();
  const backtest = getBacktestStore();
  const optimization = getOptimizationStore();
  const market = getMarketDataStore();
  const emptyBacktest = backtest.getState();
  const emptyOptimization = optimization.getState();
  await loadExample('trend-breakout');
  const actions = optimization.getState().actions;
  for (const row of optimization.getState().search.rows)
    actions.setSearched(row.descriptor.title, false);
  actions.setValidation({ mode: 'in-out' });
  while (optimization.getState().viewSettings.filters.length) actions.removeFilter(0);
  await actions.start();
  await new Promise<void>((resolve) => {
    const check = () => {
      const state = optimization.getState();
      if (state.views?.pending || state.topEquity.status === 'running') return;
      unsubscribe();
      resolve();
    };
    const unsubscribe = optimization.subscribe(check);
    check();
  });
  const doneBacktest = backtest.getState();
  const doneOptimization = optimization.getState();
  if (!doneBacktest.result || !doneOptimization.results) throw new Error('Fixture run failed');
  const origin = market.getState().origin;
  const now = Date.now();
  const done = { status: 'done', startedAt: now - 609_000, finishedAt: now } as const;
  const result = { ...doneBacktest.result, durationMs: 400 };
  const results = { ...doneOptimization.results, combinations: 2_214, durationMs: 609_000 };
  // Freeze the bridges after the real runs: chart/page-capacity effects must not overwrite a
  // fixed header status midway through measuring it. Fixture writes retain the original setters.
  const publishBacktest = backtest.setState;
  const publishOptimization = optimization.setState;
  backtest.setState = () => {};
  optimization.setState = () => {};

  return (page: 'backtest' | 'optimize', state: (typeof headerCases)[number][1]) => {
    publishBacktest({ ...doneBacktest, result, preview: null, outdated: null, run: done });
    publishOptimization({ ...doneOptimization, results, outdated: null, run: done });
    market.setState({ origin });
    if (state === 'empty') {
      publishBacktest(emptyBacktest);
      publishOptimization(emptyOptimization);
      market.setState({ origin: null });
    } else if (state === 'loaded') {
      publishBacktest({ result: null, run: { status: 'idle' } });
      publishOptimization({ results: null, views: null, run: { status: 'idle' } });
    } else if (state === 'running' || state === 'walk-forward') {
      if (page === 'backtest')
        publishBacktest({ run: { status: 'running', startedAt: now - 12_300 } });
      else
        publishOptimization({
          run: {
            status: 'running',
            startedAt: now - 609_000,
            progress: {
              phase: 'in',
              combinations: 1_968,
              completed: 40,
              total: 3_936,
              elapsedMs: 609_000,
              remainingMs: 609_000,
              workers: 2,
              failed: 0,
              window: state === 'walk-forward' ? { index: 11, count: 24 } : null,
            },
          },
        });
    } else if (state === 'preview') {
      publishBacktest({
        preview: {
          set: result.computedWith.inputs,
          origin: { kind: 'rank', optimizationId: results.id, trialId: '0', rank: 1 },
          inputs: doneBacktest.inputs,
          changes: [],
          run: done,
          result,
          readiness: doneBacktest.readiness,
        },
      });
    } else if (state === 'compile-error') {
      publishBacktest({
        compile: {
          status: 'failed',
          error: null,
          diagnostics: [{ kind: 'undeclared', message: 'Unknown identifier', line: 4 }],
        },
        readiness: {
          ok: false,
          reasons: [{ kind: 'message', id: 'backtest.compileFailed', values: {} }],
        },
      });
    } else if (state === 'error') {
      if (page === 'backtest')
        publishBacktest({
          run: { ...done, status: 'failed', failure: { diagnostics: [], bar: null, error: null } },
        });
      else
        publishOptimization({
          run: { ...done, status: 'failed', failure: { diagnostics: [], error: null } },
        });
    } else if (state === 'cancelled') {
      publishBacktest({ run: { ...done, status: 'cancelled', cause: 'user' } });
      publishOptimization({ run: { ...done, status: 'cancelled' } });
    } else if (state === 'outdated') {
      publishBacktest({ outdated: { reasons: ['inputs'], inputs: [], properties: [] } });
      publishOptimization({ outdated: { reasons: ['ranges'] } });
    } else if (state === 'windows') publishOptimization({ results: { ...results, windows: 24 } });
    else if (state === 'random')
      publishOptimization({
        results: {
          ...results,
          computedWith: {
            ...results.computedWith,
            search: {
              ...results.computedWith.search,
              sampling: { ...results.computedWith.search.sampling!, method: 'random' },
            },
          },
        },
      });
    uiStore.setState({ page, dockTab: 'report', openDialogs: [] });
  };
}
