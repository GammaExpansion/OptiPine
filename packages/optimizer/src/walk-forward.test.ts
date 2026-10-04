import { raises } from '../test/fixtures.ts';
import { plainText } from '@pine/messages';
import test from 'node:test';
import assert from 'node:assert/strict';
import {
  runWalkForward,
  planWalkForwardBounds,
  planWalkForwardWindows,
  finalizeWalkForward,
  selectWalkForwardTrial,
  type WalkForwardConfig,
} from './walk-forward.ts';
import { runWithEquity as runStrategy, type MarketBar } from '@pine/engine';
import { metricValue } from './metrics.ts';
import { stabilityBands, neighborhoodTrials } from './analysis.ts';
import { leaderboard } from './validation.ts';

const first = Date.UTC(2024, 0, 1) / 1000;
const bars: MarketBar[] = Array.from({ length: 367 }, (_, i) => ({
  time: first + i * 86400,
  open: 100 + i / 10,
  high: 102 + i / 10,
  low: 99 + i / 10,
  close: 101 + i / 10,
  volume: 10,
}));
const source = `//@version=6
strategy("Calendar windows", initial_capital=10000, margin_long=0)
quantity=input.int(1,"Quantity")
if bar_index % 4 == 0
    strategy.entry("L",strategy.long,qty=quantity)
if bar_index % 4 == 2
    strategy.close("L")`;
const input = {
  syminfo: { type: 'crypto', timezone: 'Etc/UTC', mintick: 0.01, pointvalue: 1, mincontract: 1 },
  timeframe: '1D',
};
const evaluate = (parameters: Record<string, unknown>, bars: readonly MarketBar[]) =>
  runStrategy(source, { ...input, bars, inputs: parameters });
const config = { inSampleLength: 2, outOfSampleLength: 1, step: 1 };

test('UTC calendar month plans handle leap February and anchored windows', () => {
  const rolling = planWalkForwardWindows(bars, config);
  assert.equal(rolling.length, 11);
  assert.equal(rolling[0].inSampleStart, Date.UTC(2024, 0, 1) / 1000);
  assert.equal(rolling[0].inSampleBars.length, 60);
  assert.equal(rolling[0].outOfSampleStart, Date.UTC(2024, 2, 1) / 1000);
  assert.equal(rolling[0].outOfSampleBars.length, 31);
  assert.equal(rolling[1].inSampleStart, Date.UTC(2024, 1, 1) / 1000);
  assert.equal(rolling[1].inSampleBars.length, 60);
  assert.equal(rolling[0].outOfSampleStartIndex, 60);
  const anchored = planWalkForwardWindows(bars, { ...config, mode: 'anchored' });
  assert.equal(anchored[1].inSampleStart, rolling[0].inSampleStart);
  assert.equal(anchored[1].inSampleBars.length, 91);
  assert.equal(anchored[1].outOfSampleStart, rolling[1].outOfSampleStart);
});

test('bounds plan the same windows from bar times alone', () => {
  const times = bars.map((bar) => bar.time);
  for (const mode of ['rolling', 'anchored'] as const) {
    const windows = planWalkForwardWindows(bars, { ...config, mode });
    const bounds = planWalkForwardBounds(times, { ...config, mode });
    assert.deepEqual(
      bounds,
      windows.map(({ inSampleBars: _in, outOfSampleBars: _out, ...rest }) => rest),
    );
    for (const [index, window] of windows.entries()) {
      assert.deepEqual(
        window.inSampleBars,
        bars.slice(bounds[index].inSampleStartIndex, bounds[index].inSampleEndIndex),
      );
      assert.equal('inSampleBars' in bounds[index], false);
    }
  }
  assert.throws(
    () => planWalkForwardBounds([times[1], times[0]], config),
    raises('walkForwardTimesInvalid'),
  );
  assert.deepEqual(planWalkForwardBounds([], { ...config, inSampleLength: 2 }), []);
  assert.throws(() => planWalkForwardBounds([], { ...config, inSampleLength: 0 }));
});

test('invalid month ranges and overlapping OOS windows fail explicitly', () => {
  for (const invalid of [
    { ...config, inSampleLength: 0 },
    { ...config, inSampleLength: 1.5 },
    { ...config, step: NaN },
    { ...config, outOfSampleLength: 2 },
    { ...config, tolerance: 1.1 },
  ])
    assert.throws(() => planWalkForwardWindows(bars, invalid));
  assert.throws(
    () => planWalkForwardWindows([bars[1], bars[0]], config),
    raises('walkForwardTimesInvalid'),
  );
  assert.deepEqual(planWalkForwardWindows(bars.slice(0, 60), config), []);
});

test('estimated coverage crossing an OOS start does not create an unobserved window', () => {
  const beforeOos = bars.slice(0, 60).map((bar) => ({ ...bar, time: bar.time + 43200 }));
  assert.equal(beforeOos.at(-1)!.time, Date.UTC(2024, 1, 29, 12) / 1000);
  for (const mode of ['rolling', 'anchored'] as const) {
    assert.deepEqual(planWalkForwardWindows(beforeOos, { ...config, mode }), []);
    let evaluations = 0;
    const result = runWalkForward(
      [{ Quantity: 1 }],
      beforeOos,
      (parameters, windowBars) => {
        evaluations++;
        return evaluate(parameters, windowBars);
      },
      { ...config, mode },
    );
    assert.equal(evaluations, 0);
    assert.deepEqual(result.windows, []);
  }
});

test('a final bar exactly at OOS start runs as a one-bar partial window with unknown CAGR', () => {
  const throughOosStart = bars.slice(0, 61);
  const result = runWalkForward([{ Quantity: 1 }], throughOosStart, evaluate, config);
  assert.equal(result.windows.length, 1);
  const window = result.windows[0];
  assert.equal(window.error, undefined);
  assert.equal(window.partial, true);
  assert.equal(window.outOfSampleStart, throughOosStart.at(-1)!.time);
  assert.equal(window.outOfSampleEnd, Date.UTC(2024, 2, 2) / 1000);
  assert.equal(window.plannedOutOfSampleEnd, Date.UTC(2024, 3, 1) / 1000);
  assert.equal(window.outOfSampleStartIndex, 60);
  assert.equal(window.outOfSampleEndIndex, 61);
  assert.deepEqual(window.outOfSampleBars, [throughOosStart.at(-1)!]);
  const expected = evaluate(window.chosenParameters!, [throughOosStart.at(-1)!]);
  assert.deepEqual(window.outOfSampleResult?.metrics, expected.metrics);
  assert.equal(window.equity.length, 1);
  assert.equal(window.outOfSampleAnnualized, null);
  assert.equal(window.wfe, null);
  assert.equal(result.totals.wfe, null);
  assert.equal(result.totals.outOfSampleNet, window.outOfSampleNet);
  assert.equal(result.totals.outOfSampleTrades, window.outOfSampleTrades);
});

test('data ending in a step gap retains the complete prior OOS without an empty tail', () => {
  const throughGap = bars.filter((bar) => bar.time < Date.UTC(2024, 3, 15) / 1000);
  for (const mode of ['rolling', 'anchored'] as const) {
    const windows = planWalkForwardWindows(throughGap, { ...config, step: 2, mode });
    assert.equal(windows.length, 1);
    assert.equal(windows[0].partial, false);
    assert.equal(windows[0].outOfSampleEnd, Date.UTC(2024, 3, 1) / 1000);
    assert.equal(windows[0].plannedOutOfSampleEnd, windows[0].outOfSampleEnd);
    assert.equal(windows[0].outOfSampleBars.length, 31);
    assert.equal(windows[0].outOfSampleBars.at(-1)!.time, Date.UTC(2024, 2, 31) / 1000);
  }
});

test('real engine windows reoptimize, aggregate equity changes and trades, and annualize equity for WFE', () => {
  const result = runWalkForward([{ Quantity: 1 }, { Quantity: 2 }], bars, evaluate, config);
  assert.equal(result.windows.length, 11);
  for (const window of result.windows) {
    const expectedIn = evaluate(window.chosenParameters!, window.inSampleBars);
    const expectedOut = evaluate(window.chosenParameters!, window.outOfSampleBars);
    assert.deepEqual(window.inSampleResult?.metrics, expectedIn.metrics);
    assert.deepEqual(window.outOfSampleResult?.metrics, expectedOut.metrics);
    const initial = metricValue(expectedIn.metrics, 'Initial capital')!;
    assert.equal(window.inSampleNet, expectedIn.equity.at(-1)! - initial);
    assert.equal(window.outOfSampleNet, expectedOut.equity.at(-1)! - initial);
    const annualized = (equity: number, bars: readonly MarketBar[]) =>
      bars.length < 2
        ? null
        : ((equity / initial) ** ((365 * 86400) / (bars.at(-1)!.time - bars[0].time)) - 1) * 100;
    const outAnnualized = annualized(expectedOut.equity.at(-1)!, window.outOfSampleBars);
    const inAnnualized = annualized(expectedIn.equity.at(-1)!, window.inSampleBars);
    assert.equal(
      window.wfe,
      outAnnualized !== null && inAnnualized !== null && inAnnualized > 0
        ? outAnnualized / inAnnualized
        : null,
    );
  }
  const sum = (
    key:
      | 'inSampleNet'
      | 'outOfSampleNet'
      | 'inSampleTrades'
      | 'outOfSampleTrades'
      | 'inSampleAnnualized'
      | 'outOfSampleAnnualized',
  ) => result.windows.reduce((total, window) => total + window[key]!, 0);
  assert.equal(result.totals.inSampleNet, sum('inSampleNet'));
  assert.equal(result.totals.outOfSampleNet, sum('outOfSampleNet'));
  assert.equal(result.totals.outOfSampleTrades, sum('outOfSampleTrades'));
  assert.notEqual(
    result.totals.wfe,
    null,
    'the one-bar tail has no CAGR, but the complete stitched account can be annualized',
  );
  assert.notEqual(
    result.totals.wfe,
    result.windows.reduce((total, w) => total + w.wfe!, 0),
  );
  assert.equal(result.totals.metrics['Performance/Annualized return (CAGR)/All %'], null);
  assert.equal(
    result.totals.metrics['Trades analysis/Total trades/All USD'],
    sum('outOfSampleTrades'),
  );
});

test('equity cash offsets stitch actual bars and shadows end at the OOS starting capital', () => {
  const result = runWalkForward([{ Quantity: 1 }], bars, evaluate, config);
  for (let index = 0; index < result.windows.length; index++) {
    const window = result.windows[index];
    const raw = window.outOfSampleResult!.equity!;
    const initial = metricValue(window.outOfSampleResult!.metrics, 'Initial capital')!;
    assert.equal(window.startCapital, index ? result.windows[index - 1].endCapital : initial);
    assert.equal(window.inSampleEquity.at(-1), window.startCapital);
    assert.equal(window.equity[0], raw[0] - initial + window.startCapital!);
    assert.equal(window.equity.at(-1), raw.at(-1)! - initial + window.startCapital!);
  }
  assert.equal(
    result.totals.equity.length,
    result.windows.reduce((total, window) => total + window.outOfSampleBars.length, 0),
  );
  const gaps = runWalkForward([{ Quantity: 1 }], bars, evaluate, { ...config, step: 2 });
  assert.equal(gaps.windows[1].gapBefore, true);
  assert.equal(
    gaps.totals.equity.filter((value) => value === null).length,
    gaps.windows.length - 1,
  );
  assert.equal(
    gaps.totals.equityTimes.filter((value) => value === null).length,
    gaps.windows.length - 1,
  );
});

test('missing equity or failing engine results never substitute arbitrary plots', () => {
  const result = runWalkForward([{ Quantity: 1 }], bars, evaluate, config);
  const original = result.windows[0];
  const withoutEquity = {
    ...original.outOfSampleResult!,
    equity: undefined,
    plots: [{ title: 'Price', values: [999, 1000] }],
  };
  const missing = finalizeWalkForward([{ ...original, outOfSampleResult: withoutEquity }], config);
  assert.deepEqual(missing.windows[0].equity, []);
  const missingChain = finalizeWalkForward(
    [{ ...original, outOfSampleResult: withoutEquity }, result.windows[1]],
    config,
  );
  assert.deepEqual(missingChain.windows[1].equity, []);
  assert.equal(missingChain.windows[1].startCapital, null);
  const diagnostic = { kind: 'unsupported' as const, line: 7, message: 'unsupported execution' };
  const failed = finalizeWalkForward(
    [{ ...original, outOfSampleResult: { ...withoutEquity, diagnostics: [diagnostic] } }],
    config,
  );
  assert.equal(failed.totals.outOfSampleNet, null);
  assert.equal(failed.windows[0].wfe, null);
  assert.match(plainText(failed.windows[0].error!), /L7 · unsupported/);
  assert.throws(
    () => finalizeWalkForward([original, { ...original, index: 1 }], config),
    raises('outSampleWindowsOverlap'),
  );
});

test('finalization reads full metric-key objectives and preserves explicit scope and percent', () => {
  const result = runWalkForward([{ Quantity: 1 }], bars, evaluate, config);
  const window = result.windows[0];
  const key = 'Performance/Annualized return (CAGR)/All %';
  const keyed = finalizeWalkForward([window], { ...config, objective: { name: key } });
  assert.equal(keyed.windows[0].inSampleObjectiveValue, window.inSampleResult!.metrics[key]);
  assert.equal(keyed.windows[0].outOfSampleObjectiveValue, window.outOfSampleResult!.metrics[key]);
  const scoped = finalizeWalkForward([window], {
    ...config,
    objective: { name: 'Net profit', scope: 'Long', percent: true },
  });
  assert.equal(
    scoped.windows[0].inSampleObjectiveValue,
    window.inSampleResult!.metrics['Performance/Net profit/Long %'],
  );
});

test('tolerance, direction and neighbourhood are applied to real window trial surfaces', () => {
  const configurations: WalkForwardConfig[] = [
    { ...config, tolerance: 0.5 },
    { ...config, tolerance: 0, objective: { name: 'Net profit', direction: 'minimize' as const } },
    {
      ...config,
      tolerance: 0.2,
      neighborhood: true,
      axes: [{ title: 'Quantity', values: [1, 2, 3] }],
    },
  ];
  for (const c of configurations) {
    const result = runWalkForward(
      [{ Quantity: 1 }, { Quantity: 2 }, { Quantity: 3 }],
      bars,
      evaluate,
      c,
    );
    assert.deepEqual(
      result.stability,
      stabilityBands(
        result.windows,
        ['Quantity'],
        c.tolerance,
        c.objective?.direction ?? 'maximize',
        { axes: c.axes, neighborhood: c.neighborhood },
      ),
    );
    for (const window of result.windows) {
      const trials = c.neighborhood ? neighborhoodTrials(window.trials, c.axes) : window.trials;
      const expected = leaderboard(trials, { direction: c.objective?.direction })[0];
      assert.equal(window.bestTrial?.trialId, expected.trialId);
      assert.equal(selectWalkForwardTrial(window.trials, c)?.trialId, expected.trialId);
    }
  }
});

test('cancellation keeps only completed windows', () => {
  let stopped = false;
  const cancelled = runWalkForward([{ Quantity: 1 }, { Quantity: 2 }], bars, evaluate, config, {
    cancelled: () => stopped,
    onProgress: (completed) => {
      if (completed >= 1) stopped = true;
    },
  });
  assert.equal(cancelled.cancelled, true);
  assert.equal(cancelled.windows.length, 1);
});
