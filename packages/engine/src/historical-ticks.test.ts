import assert from 'node:assert/strict';
import { test } from 'node:test';
import { run, runWithEquity } from './index.ts';
import type { RunInput } from './types.ts';

const input: RunInput = {
  bars: [0, 1, 2].map((i) => ({
    time: 1704067200 + i * 3600,
    open: 100,
    high: 104,
    low: 99,
    close: 102,
    volume: 100,
  })),
  syminfo: { mintick: 1, pointvalue: 1, mincontract: 1, timezone: 'Etc/UTC' },
  timeframe: '60',
};
const source = `//@version=6
strategy("Four points", initial_capital=10000, calc_on_every_tick=true)
var int closes = 0
closes += 1
if strategy.position_size == 0
    strategy.entry("L", strategy.long)
else
    strategy.close("L")
plot(closes, "Committed bar calculations")
plot(strategy.equity, "Account")`;

test('historical tick scheduling is opt-in and uses the broker price path with next-tick orders', () => {
  const normal = run(source, input);
  assert.deepEqual(run(source, { ...input, historicalTicks: false }), normal);
  const result = runWithEquity(source, { ...input, historicalTicks: true });
  assert.deepEqual(result.diagnostics, []);
  assert.equal(result.trades[0].entryBar, 0);
  assert.equal(result.trades[0].entryPrice, 99);
  assert.equal(result.trades[0].exitBar, 0);
  assert.equal(result.trades[0].exitPrice, 104);
  assert.equal(result.trades[1].entryPrice, 102);
  assert.equal(result.trades[1].exitPrice, 100);
  assert.notDeepEqual(result.metrics, normal.metrics);
  assert.deepEqual(
    result.plots[0].values,
    [1, 2, 3],
    'ordinary var and TA state commit once per bar',
  );
  assert.equal(
    result.equity.length,
    input.bars.length,
    'equity still has one final observation per bar',
  );
  assert.deepEqual(run(source, { ...input, historicalTicks: true }).metrics, result.metrics);
  assert.deepEqual(
    runWithEquity(source, { ...input, historicalTicks: true }),
    result,
    'independent replay is stable',
  );
});

test('historical scheduling excludes a pending final bar and handles the opposite price path', () => {
  const highFirst = { ...input, bars: input.bars.map((bar) => ({ ...bar, high: 101, low: 96 })) };
  const result = run(source, { ...highFirst, historicalTicks: true });
  assert.deepEqual(result.diagnostics, []);
  assert.equal(result.trades[0].entryPrice, 101);
  assert.equal(result.trades[0].exitPrice, 96);
  const noOrders = `//@version=6\nstrategy("Marks")\nplot(strategy.equity)`;
  const pending = run(noOrders, { ...input, historicalTicks: true, strategyClosePending: true });
  assert.deepEqual(pending.diagnostics, []);
  assert.equal(
    pending.plots[0].values.at(-1),
    null,
    'pending bar keeps normal calc_on_every_tick rules',
  );
});
