import { expect, test } from 'vitest';
import type { BacktestResult, BacktestState } from '../../../workflows/backtest.ts';
import { chartView, timeframeLabel, tradeContext } from './chart-view.ts';

const bars = [
  { time: 1, open: 1, high: 2, low: 0.5, close: 1.5, volume: 1 },
  { time: 2, open: 1.5, high: 2, low: 1, close: 1.8, volume: 1 },
];
const current = { bars: [bars[0]], timeframe: '60', syminfo: {} };
const computed = { bars, timeframe: '60', syminfo: { pointvalue: 2 } };
const result = (trades: unknown[], initialCapital: number | null = 100_000) =>
  ({
    computedWith: { dataset: { revision: 1, input: computed } },
    output: { trades, plots: [] },
    initialCapital,
  }) as unknown as BacktestResult;
const base = {
  source: 'strategy("x")',
  dataset: { revision: 2, input: current },
  compile: { status: 'compiled' },
  run: { status: 'done' },
  result: null,
  preview: null,
} as unknown as BacktestState;
const state = (change: Partial<Record<keyof BacktestState, unknown>>) =>
  ({ ...base, ...change }) as BacktestState;
const failedRun = (diagnostics: unknown[], bar: number | null, error: unknown = null) => ({
  status: 'failed',
  startedAt: 1,
  finishedAt: 2,
  failure: { diagnostics, bar, error },
});

test('first launch until there are both a script and data', () => {
  expect(chartView(state({ source: '  ' }))).toEqual({ kind: 'firstLaunch' });
  expect(chartView(state({ dataset: null }))).toEqual({ kind: 'firstLaunch' });
});

test('a result is drawn on its own bars; without one, or after a failed compile, the data alone', () => {
  const shown = result([{ entryBar: 0 }]);
  expect(chartView(state({ result: shown }))).toEqual({
    kind: 'chart',
    input: computed,
    result: shown,
    note: null,
  });
  expect(chartView(state({}))).toMatchObject({ input: current, result: null, note: null });
  expect(chartView(state({ result: shown, compile: { status: 'failed' } }))).toMatchObject({
    input: current,
    result: null,
  });
});

test('a failed run notes its first line and bar over the previous result (B11)', () => {
  const previous = result([{ entryBar: 0 }]);
  const run = failedRun([{ kind: 'runtime', line: 31, bar: 1202, message: 'x' }], 1202);
  expect(chartView(state({ run, result: previous }))).toMatchObject({
    result: previous,
    note: { kind: 'runFailed', line: 31, bar: 1202, error: null },
  });
  expect(chartView(state({ run: failedRun([], null, 'crashed') }))).toMatchObject({
    note: { kind: 'runFailed', line: null, bar: null, error: 'crashed' },
  });
});

test('a strategy result without trades notes it; an indicator has none to miss (B12)', () => {
  expect(chartView(state({ result: result([]) }))).toMatchObject({ note: { kind: 'noTrades' } });
  expect(chartView(state({ result: result([], null) }))).toMatchObject({ note: null });
});

test('the open preview supplies the run and result (B16)', () => {
  const previewed = result([]);
  const preview = { run: { status: 'done' }, result: previewed };
  expect(chartView(state({ preview, result: result([{}]) }))).toMatchObject({
    result: previewed,
    note: { kind: 'noTrades' },
  });
});

test('trades are measured at the last bar of the data they ran on', () => {
  expect(tradeContext(computed)).toEqual({ pointvalue: 2, lastBarIndex: 1, lastClose: 1.8 });
  expect(tradeContext(current).pointvalue).toBe(1);
});

test('Pine timeframes read as the legend shows them', () => {
  expect(
    ['1', '15', '60', '240', '90', 'D', '1D', 'W', '3M', '30S', ''].map(timeframeLabel),
  ).toEqual(['1m', '15m', '1h', '4h', '90m', '1D', '1D', '1W', '3M', '30s', '']);
});
