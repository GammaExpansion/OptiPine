import assert from 'node:assert/strict';
import test from 'node:test';
import { Broker } from './broker.ts';
import type { MarketBar } from '../types.ts';

test('benchmark starts at the first reported trade when a later entry closes first', () => {
  const bars: MarketBar[] = [
    { time: 0, open: 100, high: 101, low: 99, close: 100, volume: 1 },
    { time: 3600, open: 100, high: 103, low: 97, close: 100, volume: 1 },
  ];
  const broker = new Broker(
    {
      bars,
      syminfo: { mintick: 0.01, mincontract: 1, timezone: 'UTC' },
      timeframe: '60',
      settings: { initial_capital: 1000, pyramiding: 2, close_entries_rule: 'ANY' },
    },
    5,
  );
  broker.configure({});
  broker.beginBar(0, bars[0]);
  broker.call('entry', ['first', 1], { qty: 1, limit: 99 });
  broker.call('entry', ['second', 1], { qty: 1, limit: 98 });
  broker.endBar();
  broker.beginBar(1, bars[1]);
  broker.call('close', ['second'], { immediately: true });
  broker.endBar();

  const result = broker.result();
  assert.equal(result.trades[0].entryId, 'second');
  assert.equal(result.trades[1].entryId, 'first');
  assert.equal(result.metrics['Performance/Buy and hold PnL/All USD'], 20);
});
