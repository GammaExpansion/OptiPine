import assert from 'node:assert/strict';
import test from 'node:test';
import { run } from '../index.ts';
import { reportedTradeProfit } from './trade-profit.ts';

for (const side of ['long', 'short']) {
  test(`${side}: percent open-trade commission follows the mark without charging account equity`, () => {
    const source = `//@version=6
strategy("percent display", initial_capital=1000, currency=currency.NONE,
 commission_type=strategy.commission.percent, commission_value=0.2, margin_long=0, margin_short=0)
if bar_index == 0
    strategy.entry("entry", strategy.${side}, qty=4)
if bar_index == 1
    strategy.close("entry", qty=1)
plot(strategy.opentrades.profit(0))
plot(strategy.opentrades.commission(0))
plot(strategy.equity)`;
    const output = run(source, {
      timeframe: '60',
      syminfo: { currency: 'USD', mintick: 1, mincontract: 1 },
      bars: [100, 100, 110].map((p, i) => ({
        time: i * 3600,
        open: p,
        high: p,
        low: p,
        close: p,
        volume: 1,
      })),
    });
    assert.deepEqual(output.diagnostics, []);
    const open = output.trades.at(-1)!;
    const sign = side === 'long' ? 1 : -1;
    const approx = (actual: number, expected: number) =>
      assert.ok(Math.abs(actual - expected) < 1e-9, `${actual} != ${expected}`);
    approx(open.entryCommission, 0.6);
    approx(open.displayCommission!, 0.66);
    approx(reportedTradeProfit(open), sign * 30 - 1.26);
    approx(Number(output.plots[0].values.at(-1)), sign * 30 - 1.26);
    approx(Number(output.plots[1].values.at(-1)), 0.6);
    approx(Number(output.plots[2].values.at(-1)), 1000 + sign * 40 - 1.02);
    approx(output.metrics['Performance/Commission paid/All USD'] as number, 1.02);
  });
}

test('native open-trade projection stays separate from paid fees and account equity through a partial close', () => {
  const source = `//@version=6
strategy("open fees", initial_capital=1000, currency=currency.NONE,
 commission_type=strategy.commission.cash_per_contract, commission_value=2, margin_long=0)
if bar_index == 0
    strategy.entry("entry", strategy.long, qty=4)
if bar_index == 1
    strategy.close("entry", qty=1)
if bar_index == 2
    strategy.close_all()
plot(strategy.opentrades.profit(0))
plot(strategy.opentrades.commission(0))
plot(strategy.equity)
plot(strategy.netprofit)
plot(strategy.openprofit)`;
  const input = {
    timeframe: '60',
    syminfo: { currency: 'USD', mintick: 1, mincontract: 1 },
    bars: [100, 100, 110, 120].map((p, i) => ({
      time: i * 3600,
      open: p,
      high: p,
      low: p,
      close: p,
      volume: 1,
    })),
  };
  const partial = run(source, { ...input, bars: input.bars.slice(0, 3) });
  assert.deepEqual(partial.diagnostics, []);
  assert.deepEqual(
    partial.plots.map((p) => p.values),
    [
      [0, -16, 18],
      [0, 8, 6],
      [1000, 992, 1030],
      [0, -8, 0],
      [0, 0, 30],
    ],
  );
  assert.deepEqual(
    partial.trades.map((t) => ({
      profit: t.profit,
      reported: reportedTradeProfit(t),
      realized: t.realizedProfit,
    })),
    [
      { profit: 6, reported: 6, realized: 0 },
      { profit: 24, reported: 18, realized: 0 },
    ],
  );
  assert.equal(partial.metrics['Performance/Net profit/All USD'], 0);
  assert.equal(partial.metrics['Performance/Open PnL/All USD'], 30);
  assert.equal(partial.metrics['Performance/Commission paid/All USD'], 10);
  const closed = run(source, input);
  assert.deepEqual(closed.diagnostics, []);
  assert.deepEqual(
    closed.plots.map((p) => p.values.at(-1)),
    [0, 0, 1054, 54, 0],
  );
  assert.equal(closed.trades[1].realizedProfit, 54);
  assert.equal(closed.trades[1].profit, 48);
  assert.equal(closed.metrics['Performance/Commission paid/All USD'], 16);
});
