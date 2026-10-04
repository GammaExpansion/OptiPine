import assert from 'node:assert/strict';
import test from 'node:test';
import { run } from '../index.ts';
import type { RunInput } from '../types.ts';
import { Broker } from './broker.ts';

// Pine User Manual, Strategies: "It is not possible to exit a position with a market order using
// the command strategy.exit." An na price places no leg, so a call whose every price is na places
// no order. A TradingView export with such a call would confirm the timing below.

const input: RunInput = {
  timeframe: '60',
  syminfo: { timezone: 'Etc/UTC', mintick: 0.01, mincontract: 1 },
  bars: Array.from({ length: 12 }, (_, index) => ({
    time: 1_704_067_200 + index * 3600,
    open: 100 + index,
    high: 101 + index,
    low: 99 + index,
    close: 100.5 + index,
    volume: 1,
  })),
};

for (const version of [5, 6]) {
  test(`v${version}: an exit priced from position_avg_price waits while flat, not filling at market`, () => {
    // The common unguarded pattern: while flat both prices are na.
    const result = run(
      `//@version=${version}
strategy("na exit")
if bar_index == 2
    strategy.entry("L", strategy.long)
strategy.exit("X", "L", stop = strategy.position_avg_price * 0.9, limit = strategy.position_avg_price * 1.5)`,
      input,
    );
    assert.deepEqual(result.diagnostics, []);
    assert.equal(result.trades.length, 1);
    assert.deepEqual(
      [result.trades[0].entryBar, result.trades[0].entryPrice, result.trades[0].exitBar],
      [3, 103, null],
    );
  });
}

test('the exit takes its prices from the next call and fills at them', () => {
  const broker = new Broker(
    { bars: [], timeframe: '60', syminfo: { mintick: 0.01, mincontract: 1 } },
    6,
  );
  broker.configure({ initial_capital: 10000, margin_long: 0, margin_short: 0 });
  const bar = (index: number, open: number, high: number, low: number, close: number) => ({
    time: index * 3600,
    open,
    high,
    low,
    close,
    volume: 1,
  });
  broker.beginBar(0, bar(0, 100, 101, 99, 100));
  broker.call('entry', ['L', 1], { qty: 1 });
  broker.call('exit', ['X', 'L'], {
    stop: NaN,
    limit: NaN,
    profit: NaN,
    loss: NaN,
    trail_points: NaN,
    trail_offset: NaN,
  });
  broker.endBar();
  broker.beginBar(1, bar(1, 100, 104, 96, 103));
  // Filled at the open with no exit price: the trade stays open through the bar.
  broker.call('exit', ['X', 'L'], { stop: 97, limit: 110 });
  broker.endBar();
  assert.equal(broker.result().trades[0].exitBar, null);
  broker.beginBar(2, bar(2, 103, 104, 95, 96));
  broker.endBar();
  const [trade] = broker.result().trades;
  assert.deepEqual([trade.entryBar, trade.exitBar, trade.exitPrice], [1, 2, 97]);
});
