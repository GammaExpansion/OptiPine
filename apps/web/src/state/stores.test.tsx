import { act, cleanup, renderHook, waitFor } from '@testing-library/react';
import { afterEach, beforeEach, expect, test, vi } from 'vitest';
import { exampleRequest } from '../workflows/market-data.ts';
import { strategySource } from '../workflows/test-support.ts';
import { getBacktestStore, loadExample, openScript, useBacktestStore } from './backtest.ts';
import { getMarketDataStore, useMarketDataStore } from './marketData.ts';
import {
  getOptimizationPresence,
  getOptimizationStore,
  useOptimizationStore,
} from './optimization.ts';
import { getServices, replaceServices } from './services.ts';
import { fakeServices, testDataset, testInput, testNow } from './test-support.ts';
import { uiStore } from './ui.ts';

let restore: () => void;
beforeEach(() => {
  restore = replaceServices(() => fakeServices());
  uiStore.setState({ openDialogs: [], page: 'backtest' });
});
afterEach(() => {
  cleanup();
  restore();
});

async function ready() {
  act(() => {
    openScript({ source: strategySource, fileName: 'test.pine', origin: { kind: 'file' } });
    getMarketDataStore().getState().actions.useCsv(testInput, 'prices.csv');
  });
  await waitFor(() => expect(getBacktestStore().getState().readiness.ok).toBe(true));
}

test('a Worker backtest updates selected run/result state and keeps script/data provenance', async () => {
  const { result } = renderHook(() => useBacktestStore((state) => state.run.status));
  const dataset = renderHook(() => useMarketDataStore((state) => state.origin));
  await ready();
  expect(getBacktestStore().getState()).toMatchObject({
    fileName: 'test.pine',
    origin: { kind: 'file' },
  });
  let run!: Promise<void>;
  act(() => {
    run = getBacktestStore().getState().actions.run();
  });
  expect(result.current).toBe('running');
  await act(async () => run);
  expect(result.current).toBe('done');
  expect(getBacktestStore().getState().result?.output.diagnostics).toEqual([]);
  expect(getBacktestStore().getState().result?.output.equity).toHaveLength(testInput.bars.length);
  expect(dataset.result.current).toEqual({ kind: 'csv', fileName: 'prices.csv' });
  act(() => getBacktestStore().getState().actions.setInput('Length', 7));
  expect(getBacktestStore().getState().outdated?.reasons).toEqual(['inputs']);
});

test('unrelated changes and an optimization run do not re-render a Backtest selector', async () => {
  await ready();
  const renderBacktest = vi.fn();
  const renderSource = vi.fn();
  renderHook(() => {
    renderBacktest();
    return useBacktestStore((state) => state.result);
  });
  renderHook(() => {
    renderSource();
    return useBacktestStore((state) => state.source);
  });
  await act(() => getServices().loadOptimization());
  const optimization = renderHook(() => useOptimizationStore((state) => state.run.status));
  const actions = getOptimizationStore().getState().actions;
  act(() => {
    getBacktestStore().getState().actions.setInput('Length', 7);
    actions.setSearched('Length', false);
    actions.setSearched('Multiplier', false);
    actions.setValidation({ mode: 'none' });
    actions.setPage(2);
  });
  await act(async () => actions.start());
  expect(optimization.result.current).toBe('done');
  expect(getOptimizationStore().getState().results?.combinations).toBeGreaterThan(0);
  expect(renderBacktest).toHaveBeenCalledTimes(1);
  expect(renderSource).toHaveBeenCalledTimes(1);
});

test('provider preview replaces CSV data and origin only on valid acceptance', async () => {
  await ready();
  const market = getMarketDataStore();
  const before = getBacktestStore().getState().dataset;
  const request = exampleRequest(testNow);
  await act(async () => market.getState().actions.fetch(request));
  expect(market.getState().fetch.status).toBe('preview');
  expect(market.getState().origin).toEqual({ kind: 'csv', fileName: 'prices.csv' });
  expect(getBacktestStore().getState().dataset).toBe(before);
  act(() => market.getState().actions.editSymbolInfo('mintick', -1));
  expect(market.getState().actions.accept()).toBeNull();
  expect(getBacktestStore().getState().dataset).toBe(before);
  act(() => {
    market.getState().actions.editSymbolInfo('mintick', 0.5);
    market.getState().actions.accept();
  });
  expect(market.getState().origin).toEqual({ kind: 'provider', request });
  expect(getBacktestStore().getState().dataset?.input.syminfo.mintick).toBe(0.5);
});

test('loadExample accepts its two-year provider request and runs the backtest', async () => {
  const run = vi.spyOn(getServices().engine, 'run');
  await act(async () => loadExample('trend-breakout'));
  await waitFor(() => expect(getBacktestStore().getState().readiness.ok).toBe(true));
  expect(getBacktestStore().getState()).toMatchObject({
    fileName: 'trend-breakout.pine',
    origin: { kind: 'example', id: 'trend-breakout' },
  });
  expect(getMarketDataStore().getState().origin).toEqual({
    kind: 'provider',
    request: exampleRequest(testNow),
  });
  expect(uiStore.getState().openDialogs).toEqual([]);
  expect(run).toHaveBeenCalledOnce();
  expect(getBacktestStore().getState().run.status).toBe('done');
  expect(getBacktestStore().getState().result?.output.equity).toHaveLength(testInput.bars.length);
});

test('an unavailable example feed keeps the source and opens market data for CSV', async () => {
  const reset = replaceServices(() =>
    fakeServices({ fetcher: async () => new Response('<html>', { status: 404 }) }),
  );
  try {
    const run = vi.spyOn(getServices().engine, 'run');
    await loadExample('rsi-reversal');
    expect(getBacktestStore().getState().source).toContain('RSI');
    expect(getBacktestStore().getState().dataset).toBeNull();
    expect(getMarketDataStore().getState().service).toBe('unavailable');
    expect(uiStore.getState().openDialogs).toEqual(['marketData']);
    expect(run).not.toHaveBeenCalled();
  } finally {
    reset();
  }
});

test('a pending example cannot accept data after another script is opened', async () => {
  let respond!: (response: Response) => void;
  const reset = replaceServices(() =>
    fakeServices({
      fetcher: async () =>
        new Promise<Response>((resolve) => {
          respond = resolve;
        }),
    }),
  );
  try {
    const run = vi.spyOn(getServices().engine, 'run');
    const loading = loadExample('ma-cross');
    await waitFor(() => expect(respond).toBeDefined());
    openScript({ source: strategySource, fileName: null, origin: { kind: 'pasted' } });
    respond(Response.json(testDataset));
    await loading;
    expect(getBacktestStore().getState().origin).toEqual({ kind: 'pasted', edited: false });
    expect(getBacktestStore().getState().dataset).toBeNull();
    expect(run).not.toHaveBeenCalled();
  } finally {
    reset();
  }
});

test('the optimization side loads on first need; the shell reads its presence meanwhile', async () => {
  await ready();
  const presence = getOptimizationPresence();
  expect(getServices().optimization).toBeNull();
  expect(() => getOptimizationStore()).toThrow();
  expect(presence.getState()).toEqual({ loaded: false, hasResults: false });
  const loading = getServices().loadOptimization();
  expect(getServices().loadOptimization()).toBe(loading);
  await act(() => loading);
  expect(presence.getState()).toEqual({ loaded: true, hasResults: false });
  const { actions } = getOptimizationStore().getState();
  act(() => {
    actions.setSearched('Length', false);
    actions.setSearched('Multiplier', false);
  });
  await act(() => actions.start());
  expect(presence.getState()).toEqual({ loaded: true, hasResults: true });
});

test('an opened script starts from its own search ranges, while an edit keeps them (#22)', async () => {
  await ready();
  await act(() => getServices().loadOptimization());
  const optimization = () => getOptimizationStore().getState();
  const length = () =>
    optimization().search.rows.find((row) => row.descriptor.title === 'Length')?.draft?.values;
  const edited = { kind: 'range', from: 2, to: 4, step: 1 };
  act(() => optimization().actions.setRange('Length', { from: 2, to: 4, step: 1 }));
  expect(length()).toEqual(edited);
  act(() => getBacktestStore().getState().actions.setSource(`${strategySource}\n`));
  await waitFor(() => expect(getBacktestStore().getState().compile.status).toBe('compiled'));
  expect(length()).toEqual(edited);
  // Another script with a Length of its own: from half to twice its default of 10.
  const other = strategySource.replace(
    'input.int(5, "Length", minval=2, maxval=50)',
    'input.int(10, "Length", minval=2, maxval=30)',
  );
  act(() => openScript({ source: other, fileName: 'other.pine', origin: { kind: 'file' } }));
  await waitFor(() => expect(length()).toEqual({ kind: 'range', from: 5, to: 20, step: 1 }));
});

test('disposal detaches store bridges from their sessions', async () => {
  await getServices().loadOptimization();
  const backtest = getBacktestStore();
  const optimization = getOptimizationStore();
  const market = getMarketDataStore();
  const listener = vi.fn();
  backtest.subscribe(listener);
  optimization.subscribe(listener);
  market.subscribe(listener);
  getServices().dispose();
  getServices().backtest.setInput('Length', 7);
  getServices().optimization!.session.setPage(3);
  getServices().marketData.cancel();
  expect(listener).not.toHaveBeenCalled();
});

test('the first result of an opened script shows the Report, then the user picks the tab (#6)', async () => {
  const run = async () => {
    let running!: Promise<void>;
    act(() => {
      running = getBacktestStore().getState().actions.run();
    });
    await act(async () => running);
  };
  uiStore.getState().setDockTab('code');
  await ready();
  await run();
  expect(uiStore.getState().dockTab).toBe('report');
  // Later runs of the same script, an edit included, leave the user's tab.
  act(() => uiStore.getState().setDockTab('code'));
  await run();
  act(() => getBacktestStore().getState().actions.setSource(`${strategySource}\n// edited`));
  await waitFor(() => expect(getBacktestStore().getState().readiness.ok).toBe(true));
  await run();
  expect(uiStore.getState().dockTab).toBe('code');
  // Another script's first result leaves a result tab the user chose.
  act(() => {
    uiStore.getState().setDockTab('trades');
    openScript({ source: strategySource, fileName: 'other.pine', origin: { kind: 'file' } });
  });
  await waitFor(() => expect(getBacktestStore().getState().readiness.ok).toBe(true));
  await run();
  expect(uiStore.getState().dockTab).toBe('trades');
  act(() => {
    uiStore.getState().setDockTab('code');
    openScript({
      source: `${strategySource}\n// third`,
      fileName: 'third.pine',
      origin: { kind: 'file' },
    });
  });
  await waitFor(() => expect(getBacktestStore().getState().readiness.ok).toBe(true));
  await run();
  expect(uiStore.getState().dockTab).toBe('report');
});
