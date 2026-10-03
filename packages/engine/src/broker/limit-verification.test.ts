import assert from 'node:assert/strict';
import test from 'node:test';
import { Broker } from './broker.ts';
import type { MarketBar } from '../types.ts';

const bar = (index: number, open: number, high = open, low = open, close = open): MarketBar => ({
  time: 1_700_000_000 + index * 3600,
  open,
  high,
  low,
  close,
  volume: 10,
});

function broker(verify: number, settings: Record<string, unknown> = {}): Broker {
  const account = new Broker(
    {
      bars: [],
      syminfo: { timezone: 'UTC', mintick: 1, mincontract: 1, pointvalue: 1 },
      timeframe: '60',
      settings: {
        backtest_fill_limits_assumption: verify,
        margin_long: 0,
        margin_short: 0,
        ...settings,
      },
    },
    6,
  );
  account.configure({});
  return account;
}

test('verified limit entries wait through touches and execute at the original price', () => {
  for (const side of [1, -1] as const) {
    const account = broker(2);
    account.beginBar(0, bar(0, 100));
    account.call('entry', ['E', side, 1, 100]);
    account.endBar();
    account.beginBar(1, bar(1, 100, 101, 99));
    account.endBar();
    assert.equal(account.get('position_size'), 0);
    account.beginBar(2, bar(2, 100, 102, 98));
    account.endBar();
    assert.equal(account.get('position_size'), side);
    assert.equal(account.get('position_avg_price'), 100);
    assert.equal(account.result().trades[0]!.entryBar, 2);
  }
});

test('verified limit orders retain price improvement when a gap crosses the threshold', () => {
  for (const side of [1, -1] as const) {
    const account = broker(2, { slippage: 5 });
    account.beginBar(0, bar(0, 100));
    account.call('order', ['E', side, 1, 100]);
    account.endBar();
    account.beginBar(1, bar(1, 100 - side * 10));
    account.endBar();
    assert.equal(account.get('position_size'), side);
    assert.equal(account.get('position_avg_price'), 100 - side * 10);
  }
});

test('simultaneous resting limits retain their price regardless of processing order', () => {
  for (const side of [1, -1] as const) {
    for (const ids of [
      ['A', 'B'],
      ['B', 'A'],
    ]) {
      const account = broker(2);
      account.beginBar(0, bar(0, 100));
      for (const id of ids) account.call('order', [id, side, 1, 100]);
      account.endBar();
      account.beginBar(1, bar(1, 100, 102, 98, 100));
      account.endBar();
      assert.equal(account.get('position_size'), 2 * side);
      assert.deepEqual(
        account.result().trades.map((trade) => trade.entryPrice),
        [100, 100],
      );
    }
  }
});

test('verified exit limits use the same threshold as entry limits', () => {
  for (const side of [1, -1] as const) {
    const account = broker(2);
    account.beginBar(0, bar(0, 100));
    account.call('entry', ['E', side, 1]);
    account.call('exit', [], { id: 'X', from_entry: 'E', limit: 100 + side * 10 });
    account.endBar();
    account.beginBar(1, bar(1, 100, 111, 89));
    account.endBar();
    assert.equal(account.get('position_size'), side);
    account.beginBar(2, bar(2, 100, 112, 88));
    account.endBar();
    assert.equal(account.get('position_size'), 0);
    assert.equal(account.result().trades[0]!.exitPrice, 100 + side * 10);
  }
});

test('an exit activated by an opening fill retains an already available better price', () => {
  for (const side of [1, -1] as const) {
    const account = broker(2);
    account.beginBar(0, bar(0, 100));
    account.call('entry', ['E', side, 1]);
    account.call('exit', [], { id: 'X', from_entry: 'E', limit: 100 + side * 5 });
    account.endBar();
    account.beginBar(1, bar(1, 100 + side * 10, 115, 85, 100));
    account.endBar();
    assert.equal(account.get('position_size'), 0);
    const trade = account.result().trades[0]!;
    assert.equal(trade.exitPrice, trade.entryPrice);
    assert.equal(Math.abs(trade.profit), 0);
  }
});

test('verified stop-limits need an activated stop before crossing the limit threshold', () => {
  const account = broker(2);
  account.beginBar(0, bar(0, 100));
  account.call('entry', [], { id: 'E', direction: 1, qty: 1, stop: 110, limit: 100 });
  account.endBar();
  account.beginBar(1, bar(1, 100, 105, 90));
  account.endBar();
  assert.equal(account.get('position_size'), 0);
  account.beginBar(2, bar(2, 109, 111, 100, 100));
  account.endBar();
  assert.equal(account.get('position_size'), 0);
  account.beginBar(3, bar(3, 100, 101, 98, 100));
  account.endBar();
  assert.equal(account.get('position_avg_price'), 100);
  assert.equal(account.result().trades[0]!.entryBar, 3);
});

test('fill callbacks see the market verification price while account uses the order price', () => {
  const account = broker(2, { calc_on_order_fills: true });
  account.beginBar(0, bar(0, 100));
  account.call('entry', ['E', 1, 1, 100]);
  account.endBar();
  const seen: number[] = [];
  account.beginBar(1, bar(1, 100, 101, 98, 100), (snapshot) => {
    seen.push(snapshot.close);
    assert.equal(account.get('position_avg_price'), 100);
    assert.equal(account.get('openprofit'), -2);
  });
  account.endBar();
  assert.deepEqual(seen, [98]);
});

test('negative and fractional verification settings fail configuration', () => {
  for (const verify of [-1, 1.5, NaN, Infinity])
    assert.throws(() => broker(verify), /nonnegative integer/);
});
