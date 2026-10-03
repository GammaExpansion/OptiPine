import assert from 'node:assert/strict';
import test from 'node:test';
import { Broker } from './broker.ts';
import type { MarketBar, RunInput } from '../types.ts';

function makeBroker(settings: Record<string, unknown> = {}): Broker {
  const input: RunInput = {
    bars: [],
    syminfo: { mintick: 0.01, mincontract: 1, timezone: 'UTC' },
    timeframe: '60',
    settings,
  };
  const broker = new Broker(input, 5);
  broker.configure({ initial_capital: 10000, default_qty_type: 'fixed', default_qty_value: 10 });
  return broker;
}
function bar(index: number, open = 100, high = 101, low = 99, close = 100): MarketBar {
  return { time: index * 3600, open, high, low, close, volume: 1000 };
}
function near(actual: unknown, expected: number): void {
  assert.ok(
    typeof actual === 'number' && Math.abs(actual - expected) < 1e-8,
    `${actual} != ${expected}`,
  );
}

test('market orders fill next bar and independent brokers have no shared state', () => {
  const broker = makeBroker();
  broker.beginBar(0, bar(0));
  broker.call('entry', ['purchase', 1]);
  broker.endBar();
  near(broker.get('position_size'), 0);
  broker.beginBar(1, bar(1, 103, 104, 102, 103));
  near(broker.get('position_size'), 10);
  near(broker.get('position_avg_price'), 103);
  const independent = makeBroker();
  near(independent.get('position_size'), 0);
  near(independent.get('equity'), 10000);
});

test('explicit settings override strategy declarations', () => {
  const broker = makeBroker({ initial_capital: 5000, default_qty_value: 3 });
  broker.beginBar(0, bar(0));
  broker.call('entry', ['buy', 1]);
  broker.endBar();
  broker.beginBar(1, bar(1));
  near(broker.get('position_size'), 3);
  near(broker.get('equity'), 5000);
});

test('a partial exit is consumed rather than regenerated for the same entry lot', () => {
  const broker = makeBroker();
  broker.beginBar(0, bar(0));
  broker.call('entry', ['buy', 1]);
  broker.call('exit', ['partial', 'buy'], { qty: 4, limit: 102 });
  broker.endBar();
  broker.beginBar(1, bar(1, 100, 103, 99, 102));
  broker.endBar();
  broker.beginBar(2, bar(2, 102, 105, 101, 104));
  broker.endBar();
  near(broker.get('position_size'), 6);
  const closed = broker.result().trades.filter((trade) => trade.exitTime !== null);
  assert.equal(closed.length, 1);
  near(closed[0].quantity, 4);
  near(closed[0].profit, 8);
});

test('exit reservation caps competing exits at the open quantity', () => {
  const broker = makeBroker();
  broker.beginBar(0, bar(0));
  broker.call('entry', ['buy', 1]);
  broker.call('exit', ['first', 'buy'], { qty: 8, limit: 102 });
  broker.call('exit', ['second', 'buy'], { qty: 8, limit: 104 });
  broker.endBar();
  broker.beginBar(1, bar(1, 100, 105, 99, 104));
  broker.endBar();
  assert.deepEqual(
    broker.result().trades.map((trade) => trade.quantity),
    [8, 2],
  );
  near(broker.get('position_size'), 0);
});

test('orders cancelled after submission do not fill', () => {
  const broker = makeBroker();
  broker.beginBar(0, bar(0));
  broker.call('entry', ['cancelled', 1]);
  broker.call('cancel', ['cancelled']);
  broker.endBar();
  broker.beginBar(1, bar(1));
  assert.equal(broker.result().trades.length, 0);
});

test('long-only entry risk closes an existing long when a short entry is requested', () => {
  const broker = makeBroker();
  broker.call('risk.allow_entry_in', ['strategy.direction.long']);
  broker.beginBar(0, bar(0));
  broker.call('entry', ['buy', 1]);
  broker.endBar();
  broker.beginBar(1, bar(1));
  broker.call('entry', ['reverse', -1]);
  broker.endBar();
  broker.beginBar(2, bar(2));
  near(broker.get('position_size'), 0);
  assert.equal(broker.result().trades.length, 1);
});

test('commission is charged once on each side of a completed transaction', () => {
  const broker = makeBroker({ commission_type: 'cash_per_contract', commission_value: 0.25 });
  broker.beginBar(0, bar(0));
  broker.call('entry', ['buy', 1]);
  broker.endBar();
  broker.beginBar(1, bar(1));
  broker.call('close_all', [], { comment: 'done' });
  broker.endBar();
  broker.beginBar(2, bar(2, 102, 103, 101, 102));
  const [trade] = broker.result().trades;
  near(trade.commission, 5);
  near(trade.profit, 15);
  near(broker.get('netprofit'), 15);
  near(broker.get('equity'), 10015);
});

test('a short trailing stop activates on the falling leg and fills only after reversal', () => {
  const broker = makeBroker();
  broker.beginBar(0, bar(0));
  broker.call('entry', ['short', -1]);
  broker.call('exit', ['trailing', 'short'], { trail_price: 98, trail_offset: 100 });
  broker.endBar();
  broker.beginBar(1, bar(1, 100, 101, 95, 95.5));
  broker.endBar();
  near(broker.get('position_size'), -10);
  broker.beginBar(2, bar(2, 95.5, 97, 95, 96));
  broker.endBar();
  const [trade] = broker.result().trades;
  near(trade.exitPrice, 96);
  near(trade.profit, 40);
});

test('limit thresholds round toward the requested price improvement before matching', () => {
  const broker = makeBroker();
  broker.beginBar(0, bar(0));
  broker.call('entry', ['limit', 1], { limit: 99.996 });
  broker.endBar();
  broker.beginBar(1, bar(1, 100, 101, 99.995, 100));
  near(broker.get('position_size'), 0);
  broker.endBar();
  broker.beginBar(2, bar(2, 100, 101, 99.98, 100));
  near(broker.get('position_avg_price'), 99.99);
});

test('percentage sizing is determined when an order is submitted and survives a price gap', () => {
  const broker = makeBroker({ default_qty_type: 'percent_of_equity', default_qty_value: 10 });
  broker.beginBar(0, bar(0));
  broker.call('entry', ['buy', 1]);
  broker.endBar();
  broker.beginBar(1, bar(1, 110, 112, 109, 111));
  near(broker.get('position_size'), 10);
  near(broker.get('position_avg_price'), 110);
  near(broker.call('default_entry_qty', [111]), 9);
});

test('a pending market close precedes a bracket crossed by the same opening gap', () => {
  const broker = makeBroker();
  broker.beginBar(0, bar(0));
  broker.call('entry', ['buy', 1]);
  broker.call('exit', ['target', 'buy'], { limit: 105 });
  broker.endBar();
  broker.beginBar(1, bar(1));
  broker.call('close_all', [], { comment: 'market close' });
  broker.endBar();
  broker.beginBar(2, bar(2, 110, 112, 109, 111));
  assert.equal(broker.result().trades[0].exitComment, 'market close');
  near(broker.get('position_size'), 0);
});

test('exits crossed by a gap fill nearest price level first', () => {
  const broker = makeBroker();
  broker.beginBar(0, bar(0));
  broker.call('entry', ['buy', 1]);
  broker.call('exit', ['lower', 'buy'], { qty: 8, limit: 102 });
  broker.call('exit', ['higher', 'buy'], { qty: 2, limit: 104 });
  broker.endBar();
  broker.beginBar(1, bar(1, 106, 107, 105, 106));
  assert.deepEqual(
    broker.result().trades.map((t) => [t.exitId, t.quantity]),
    [
      ['higher', 2],
      ['lower', 8],
    ],
  );
});

test('entry commission reduces excursions and remains allocated separately from exit costs', () => {
  const broker = makeBroker({ commission_type: 'cash_per_contract', commission_value: 0.25 });
  broker.beginBar(0, bar(0));
  broker.call('entry', ['buy', 1]);
  broker.endBar();
  broker.beginBar(1, bar(1, 100, 101, 99, 100));
  broker.call('close_all', []);
  broker.endBar();
  broker.beginBar(2, bar(2));
  const [trade] = broker.result().trades;
  near(trade.entryCommission, 2.5);
  near(trade.commission, 5);
  near(trade.maxRunup, 7.5);
  near(trade.maxDrawdown, 12.5);
});

test('overlapping close requests charge fees only for the quantity actually filled', () => {
  const broker = makeBroker({ commission_type: 'cash_per_contract', commission_value: 1 });
  broker.beginBar(0, bar(0));
  broker.call('entry', ['buy', 1]);
  broker.endBar();
  broker.beginBar(1, bar(1));
  broker.call('close', ['buy'], { qty: 8 });
  broker.call('close_all', [], { comment: 'remainder' });
  broker.endBar();
  broker.beginBar(2, bar(2));
  const trades = broker.result().trades;
  assert.deepEqual(
    trades.map((t) => t.quantity),
    [8, 2],
  );
  near(
    trades.reduce((sum, t) => sum + t.commission, 0),
    20,
  );
  near(broker.get('netprofit'), -20);
});

test('a flat trade closed at the same price before market movement has no excursion', () => {
  const broker = makeBroker({ commission_type: 'cash_per_contract', commission_value: 0.5 });
  broker.beginBar(0, bar(0));
  broker.call('entry', ['buy', 1]);
  broker.call('exit', ['target', 'buy'], { limit: 99 });
  broker.endBar();
  broker.beginBar(1, bar(1, 100, 100, 99, 99.5));
  const [trade] = broker.result().trades;
  near(trade.maxRunup, 0);
  near(trade.maxDrawdown, 0);
  near(trade.commission, 10);
});

test('slippage preserves identical tick prices and does not create spurious losing trades', () => {
  for (const price of [31.86, 28.1, 35.98, 189.95]) {
    for (const direction of [1, -1]) {
      const broker = makeBroker({ slippage: 3 });
      broker.beginBar(0, bar(0, price, price, price, price));
      broker.call('entry', ['position', direction]);
      broker.endBar();
      const entry = price - direction * 0.03;
      broker.beginBar(1, bar(1, entry, entry, entry, entry));
      broker.call('close_all', []);
      broker.endBar();
      const exit = price + direction * 0.03;
      broker.beginBar(2, bar(2, exit, exit, exit, exit));
      const [trade] = broker.result().trades;
      assert.equal(trade.entryPrice, trade.exitPrice);
      assert.ok(trade.profit === 0);
      assert.equal(broker.get('losstrades'), 0);
      assert.equal(broker.get('eventrades'), 1);
    }
  }
});
