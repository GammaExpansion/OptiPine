import assert from 'node:assert/strict';
import test from 'node:test';
import { run } from '../index.ts';

const input = {
  timeframe: '60',
  syminfo: { timezone: 'UTC', mintick: 1, mincontract: 1 },
  bars: Array.from({ length: 10 }, (_, index) => ({
    time: index * 3600,
    open: 100 + index,
    high: 102 + index,
    low: 99 + index,
    close: 101 + index,
    volume: 1,
  })),
};

test('conditional UDF history samples globals and bar_index, but native prices retain bar history', () => {
  // TradingView history-scopes r1 independently exported this distinction.
  const result = run(
    `//@version=6
indicator("history scopes")
plain = bar_index * 10.0
var float mutable = na
mutable := plain
aliasClose = close
sample() =>
    localValue = bar_index * 10.0
    [plain[1], mutable[1], aliasClose[1], close[1], bar_index[1], localValue[1]]
[p, m, a, c, b, l] = if bar_index % 3 == 0
    sample()
else
    [float(na), float(na), float(na), float(na), int(na), float(na)]
float branch = na
if bar_index % 3 == 0
    branch := mutable[1]
plot(p)
plot(m)
plot(a)
plot(c)
plot(b)
plot(l)
plot(branch)
plot(mutable[1])`,
    input,
  );
  assert.deepEqual(result.diagnostics, []);
  assert.deepEqual(
    result.plots.map((p) => [0, 3, 6, 9].map((i) => p.values[i])),
    [
      [null, 0, 30, 60],
      [null, 0, 30, 60],
      [null, 101, 104, 107],
      [null, 103, 106, 109],
      [null, 0, 3, 6],
      [null, 0, 30, 60],
      [null, 20, 50, 80],
      [null, 20, 50, 80],
    ],
  );
});

test('each UDF call site owns captured history and local shadowing keeps its own binding', () => {
  const result = run(
    `//@version=6
indicator("independent calls")
x = bar_index * 10
sample() => x[1]
shadow() =>
    x = bar_index * 100
    x[1]
a = bar_index % 2 == 0 ? sample() : na
b = bar_index % 3 == 0 ? sample() : na
c = bar_index % 3 == 0 ? shadow() : na
plot(a)
plot(b)
plot(c)`,
    input,
  );
  assert.deepEqual(result.diagnostics, []);
  assert.deepEqual(result.plots[0].values, [null, null, 0, null, 20, null, 40, null, 60, null]);
  assert.deepEqual(result.plots[1].values, [null, null, null, 0, null, null, 30, null, null, 60]);
  assert.deepEqual(result.plots[2].values, [null, null, null, 0, null, null, 300, null, null, 600]);
});

test('fill recalculation rolls captured function histories back before re-execution', () => {
  const result = run(
    `//@version=6
strategy("history rollback", calc_on_order_fills=true, margin_long=0)
x = bar_index * 10
sample() => [x[1], bar_index[1]]
[p, i] = sample()
if bar_index == 0
    strategy.entry("entry", strategy.long)
plot(p)
plot(i)`,
    input,
  );
  assert.deepEqual(result.diagnostics, []);
  assert.equal(result.trades.length, 1);
  assert.deepEqual(result.plots[0].values, [null, 0, 10, 20, 30, 40, 50, 60, 70, 80]);
  assert.deepEqual(result.plots[1].values, [null, 0, 1, 2, 3, 4, 5, 6, 7, 8]);
});
