import assert from 'node:assert/strict';
import test from 'node:test';
import { Broker } from './broker.ts';
import type { MarketBar } from '../types.ts';

function scenario(
  side: 1 | -1,
  repeat: boolean,
  partial = false,
  cancel = false,
  amendedOffset = 5,
) {
  const broker = new Broker(
    {
      bars: [],
      timeframe: '60',
      syminfo: { mintick: 1, mincontract: 1 },
    },
    6,
  );
  broker.configure({ initial_capital: 10000, margin_long: 0, margin_short: 0 });
  const price = (value: number) => (side === 1 ? value : 200 - value);
  const bar = (
    index: number,
    open: number,
    high: number,
    low: number,
    close: number,
  ): MarketBar => ({
    time: index * 3600,
    open: price(open),
    high: price(side === 1 ? high : low),
    low: price(side === 1 ? low : high),
    close: price(close),
    volume: 1,
  });
  const exit = (offset = 5) =>
    broker.call('exit', ['trail', 'entry'], {
      trail_price: price(105),
      trail_offset: offset,
      ...(partial ? { qty: 4 } : {}),
    });
  broker.beginBar(0, bar(0, 100, 101, 99, 100));
  broker.call('entry', ['entry', side], { qty: 10 });
  exit();
  broker.endBar();
  broker.beginBar(1, bar(1, 100, 110, 99, 108));
  if (cancel) broker.call('cancel', ['trail']);
  if (repeat) exit(amendedOffset);
  broker.endBar();
  broker.beginBar(2, bar(2, 108, 109, Math.min(104, 108 - amendedOffset), 106));
  broker.endBar();
  return broker.result().trades;
}

for (const side of [1, -1] as const) {
  test(`${side}: repeating a trailing exit preserves its favorable extreme`, () => {
    const once = scenario(side, false);
    const repeated = scenario(side, true);
    assert.deepEqual(repeated, once);
    assert.equal(repeated[0].exitPrice, side === 1 ? 105 : 95);
  });
  test(`${side}: partial trailing amendments preserve the stop and remaining position`, () => {
    const trades = scenario(side, true, true);
    assert.equal(trades.length, 2);
    assert.equal(trades[0].quantity, 4);
    assert.equal(trades[0].exitPrice, side === 1 ? 105 : 95);
    assert.equal(trades[1].quantity, 6);
    assert.equal(trades[1].exitPrice, null);
  });
  test(`${side}: cancellation followed by resubmission creates a fresh trailing order`, () => {
    const trades = scenario(side, true, false, true);
    assert.equal(trades[0].exitPrice, side === 1 ? 104 : 96);
  });

  for (const offset of [3, 8]) {
    test(`${side}: changing the offset to ${offset} keeps the activated extreme`, () => {
      const trades = scenario(side, true, false, false, offset);
      assert.equal(trades.length, 1);
      assert.equal(trades[0].exitPrice, side === 1 ? 110 - offset : 90 + offset);
    });
  }

  test(`${side}: a new pyramided lot cannot inherit another lot's active trailing stop`, () => {
    const broker = new Broker(
      {
        bars: [],
        timeframe: '60',
        syminfo: { mintick: 1, mincontract: 1 },
      },
      6,
    );
    broker.configure({ initial_capital: 10000, margin_long: 0, margin_short: 0, pyramiding: 2 });
    const price = (value: number) => (side === 1 ? value : 200 - value);
    const bar = (index: number, open: number, high: number, low: number, close: number) => ({
      time: index * 3600,
      open: price(open),
      high: price(side === 1 ? high : low),
      low: price(side === 1 ? low : high),
      close: price(close),
      volume: 1,
    });
    const exit = () =>
      broker.call('exit', ['trail', 'entry'], { trail_points: 5, trail_offset: 5 });
    broker.beginBar(0, bar(0, 100, 101, 99, 100));
    broker.call('entry', ['entry', side], { qty: 1 });
    exit();
    broker.endBar();
    broker.beginBar(1, bar(1, 100, 110, 99, 108));
    broker.call('entry', ['entry', side], { qty: 1 });
    exit();
    broker.endBar();
    broker.beginBar(2, bar(2, 108, 109, 106, 108));
    exit();
    broker.endBar();
    broker.beginBar(3, bar(3, 108, 109, 104, 106));
    broker.endBar();
    const trades = broker.result().trades;
    assert.equal(trades.length, 2);
    assert.equal(trades[0].entryPrice, price(100));
    assert.equal(trades[0].exitPrice, price(105));
    assert.equal(trades[1].entryPrice, price(108));
    assert.equal(trades[1].exitPrice, null);
  });
}
