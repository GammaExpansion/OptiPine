import assert from 'node:assert/strict';
import test from 'node:test';
import { runWithEquity, sweep, type RunInput } from '@pine/engine';
import { metricValue } from './metrics.ts';
import { rangeProfit } from './range-profit.ts';
import { leaderboard, optimizeParameters, scoreMetric, viewTrials } from './validation.ts';
import { finalizeWalkForward } from './walk-forward.ts';

const source = `//@version=6
strategy("Boundary profit", initial_capital=1000, process_orders_on_close=true, margin_long=0, margin_short=0,
 commission_type=strategy.commission.cash_per_order, commission_value=1)
loss = input.bool(true, "Open loss")
if bar_index == 0
    strategy.entry("closed", strategy.long, qty=loss ? 10 : 1)
if bar_index == 1
    strategy.close("closed")
if bar_index == 2
    strategy.entry("open", loss ? strategy.long : strategy.short, qty=10)`;
const input: RunInput = {
  bars: [100, 110, 110, 90, 100, 110, 110, 90].map((close, index) => ({
    time: 1_700_000_000 + index * 3600,
    open: close,
    high: close,
    low: close,
    close,
    volume: 1,
  })),
  syminfo: { currency: 'USD' },
  timeframe: '60',
  realtimeTail: false,
  strategyClosePending: false,
};
const sets = [{ 'Open loss': true }, { 'Open loss': false }];

test('range profit includes the open mark and paid entry fees, with no fictional exit fee', () => {
  for (const inputs of sets) {
    const common = { ...input, bars: input.bars.slice(0, 4), inputs };
    const result = runWithEquity(source, common);
    assert.deepEqual(result.diagnostics, []);
    const before = structuredClone(result.metrics);
    const closed = metricValue(result.metrics, 'Net profit')!;
    const open = metricValue(result.metrics, 'Open PnL')!;
    assert.equal(closed, inputs['Open loss'] ? 97 : 7);
    assert.equal(open, inputs['Open loss'] ? -200 : 200);
    const amount = inputs['Open loss'] ? -103 : 207;
    assert.equal(rangeProfit(result.metrics), amount);
    assert.equal(amount, result.equity.at(-1)! - 1000);
    assert.equal(rangeProfit(result.metrics, true), (amount / 1000) * 100);
    assert.equal(scoreMetric(result.metrics, 'Performance/Net profit/All USD'), amount);
    assert.equal(scoreMetric(result.metrics, 'Performance/Net profit/All EUR'), null);
    assert.equal(
      scoreMetric(result.metrics, 'Performance/Net profit/All %'),
      (amount / 1000) * 100,
    );
    assert.equal(scoreMetric(result.metrics, 'Net profit', 'All', true), (amount / 1000) * 100);
    // Sweeps retain only report metrics and need no per-trial equity collection.
    const trial = sweep(source, common, [{}]).runs[0].result;
    assert.equal(rangeProfit(trial.metrics), amount);
    assert.ok(!('equity' in trial));
    assert.deepEqual(result.metrics, before);
    for (const name of ['Profit factor', 'Sharpe ratio', 'Total trades', 'Max drawdown (intrabar)'])
      assert.equal(scoreMetric(result.metrics, name), metricValue(result.metrics, name));
  }
});

test('IS/OOS ranking, percentages and filters put an open gain above the larger closed profit', () => {
  const summary = optimizeParameters(
    sets,
    input.bars,
    (inputs, bars) => runWithEquity(source, { ...input, bars, inputs }),
    { validation: { mode: 'in-out', splitRatio: 0.5 }, objective: { name: 'Net profit' } },
  );
  const [loss, gain] = summary.trials;
  assert.ok(
    metricValue(loss.inSampleMetrics!, 'Net profit')! >
      metricValue(gain.inSampleMetrics!, 'Net profit')!,
  );
  assert.deepEqual(
    summary.trials.map((trial) => [trial.inSampleValue, trial.outOfSampleValue]),
    [
      [-103, -103],
      [207, 207],
    ],
  );
  assert.deepEqual(
    leaderboard(summary.trials).map((trial) => trial.parameters),
    [sets[1], sets[0]],
  );
  for (const [objective, threshold] of [
    ['Net profit', 100],
    ['Performance/Net profit/All %', 10],
  ] as const) {
    const ranked = leaderboard(
      viewTrials(summary.trials, objective, [
        { metric: objective, operator: '>=', value: threshold },
      ]),
    );
    assert.deepEqual(
      ranked.map((trial) => trial.parameters),
      [sets[1]],
    );
  }
  // Top 20 reproduces the full range. Its #1 must be highest at the last IS bar (split - 1).
  const curves = leaderboard(summary.trials).map(
    (trial) => runWithEquity(source, { ...input, inputs: trial.parameters }).equity,
  );
  assert.equal(curves[0][3], 1207);
  assert.ok(curves[0][3] > curves[1][3]);

  const walk = finalizeWalkForward(
    [
      {
        index: 0,
        inSampleStart: input.bars[0].time,
        inSampleEnd: input.bars[4].time,
        outOfSampleStart: input.bars[4].time,
        outOfSampleEnd: input.bars.at(-1)!.time + 3600,
        inSampleStartIndex: 0,
        inSampleEndIndex: 4,
        outOfSampleStartIndex: 4,
        outOfSampleEndIndex: 8,
        gapBefore: false,
        inSampleBars: input.bars.slice(0, 4),
        outOfSampleBars: input.bars.slice(4),
        trials: summary.trials,
        bestTrial: gain,
        inSampleResult: gain.inSample,
        outOfSampleResult: gain.outOfSample,
      },
    ],
    { inSampleLength: 1, outOfSampleLength: 1, step: 1 },
  );
  assert.equal(walk.windows[0].inSampleNet, gain.inSampleValue);
  assert.equal(walk.windows[0].outOfSampleNet, gain.outOfSampleValue);
});

test('missing, invalid and compact metrics retain null semantics without double marking', () => {
  assert.equal(rangeProfit({}), null);
  assert.equal(rangeProfit({ 'Net profit': 5 }), 5);
  assert.equal(scoreMetric({ 'Net profit': 207 }, 'Net profit'), 207);
  assert.equal(
    scoreMetric({ 'Performance/Net profit/All %': 20.7 }, 'Performance/Net profit/All %'),
    20.7,
  );
  for (const invalid of [null, NaN, Infinity])
    assert.equal(rangeProfit({ 'Net profit': 5, 'Open PnL': invalid }), null);
  assert.equal(rangeProfit({ 'Net profit': 5, 'Open PnL': 2 }, true), null);
  assert.equal(rangeProfit({ 'Net profit': 5, 'Open PnL': 2, 'Initial capital': 0 }, true), null);
});
