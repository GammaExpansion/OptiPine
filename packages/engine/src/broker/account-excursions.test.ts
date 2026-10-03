import assert from 'node:assert/strict';
import test from 'node:test';
import { AccountExcursions } from './account-excursions.ts';
import { Broker } from './broker.ts';

function near(actual: unknown, expected: number): void {
  assert.ok(
    typeof actual === 'number' && Math.abs(actual - expected) < 1e-8,
    `${actual} != ${expected}`,
  );
}

test('unrealized peaks do not become realized-balance references', () => {
  const account = new AccountExcursions(1000);
  account.observe(1000, 1200);
  account.observe(1000, 950);
  near(account.drawdown.value, 50);
  near(account.drawdown.percent, 5);
  near(account.runup.value, 200);
  near(account.runup.percent, (200 / 1200) * 100);
  account.observe(1100, 1100);
  account.observe(1100, 1000);
  near(account.drawdown.value, 100);
  near(account.drawdown.percent, (100 / 1100) * 100);
});

test('cash extrema and percentage extrema are observed independently', () => {
  const account = new AccountExcursions(1000);
  account.observe(1000, 500);
  account.observe(10000, 10000);
  account.observe(10000, 9000);
  near(account.drawdown.value, 1000);
  near(account.drawdown.percent, 50);
  const recovery = new AccountExcursions(1000);
  recovery.observe(1000, 1100);
  recovery.observe(50, 50);
  recovery.observe(50, 100);
  near(recovery.runup.value, 100);
  near(recovery.runup.percent, 50);
});

test('negative equity and a negative excursion cannot create a positive run-up percentage', () => {
  const account = new AccountExcursions(1000);
  account.observe(1000, 1200);
  const peak = { ...account.runup };
  account.observe(800, 800);
  for (const equity of [0, -100, -1000]) {
    account.observe(800, equity);
    assert.deepEqual(account.runup, peak);
  }
  const withoutGains = new AccountExcursions(1000);
  withoutGains.observe(1000, -100);
  assert.deepEqual(withoutGains.runup, { value: 0, percent: 0 });
});

test('intrabar account observations survive a complete round trip before bar close', () => {
  const first = { time: 0, open: 100, high: 100, low: 100, close: 100, volume: 10 };
  const second = { time: 3600, open: 100, high: 130, low: 90, close: 110, volume: 10 };
  const broker = new Broker(
    {
      bars: [first, second],
      timeframe: '60',
      syminfo: { mintick: 0.01, mincontract: 1, timezone: 'UTC' },
    },
    6,
  );
  broker.configure({ initial_capital: 1000, margin_long: 50, default_qty_value: 2 });
  broker.beginBar(0, first);
  broker.call('entry', ['entry', 1]);
  broker.call('exit', ['exit', 'entry'], { limit: 120 });
  broker.endBar();
  broker.beginBar(1, second);
  broker.endBar();
  const { trades, metrics } = broker.result();
  assert.equal(trades.length, 1);
  near(trades[0].profit, 40);
  near(metrics['Performance/Max drawdown (intrabar)/All USD'], 20);
  near(metrics['Performance/Max run-up (intrabar)/All USD'], 40);
  near(metrics['Performance/Max run-up (intrabar)/All %'], (40 / 1040) * 100);
  near(metrics['Performance/Max margin used/All USD'], 120);
});

test('entry and exit fees reach account observations without another price move', () => {
  const bar = { time: 0, open: 100, high: 100, low: 100, close: 100, volume: 10 };
  const broker = new Broker(
    {
      bars: [bar],
      timeframe: '60',
      syminfo: { mintick: 0.01, mincontract: 1, timezone: 'UTC' },
    },
    5,
  );
  broker.configure({
    initial_capital: 1000,
    process_orders_on_close: true,
    commission_type: 'cash_per_order',
    commission_value: 5,
  });
  broker.beginBar(0, bar);
  broker.call('entry', ['entry', 1]);
  broker.endBar();
  broker.call('close_all', [], { immediately: true });
  broker.endBar();
  near(broker.result().metrics['Performance/Max drawdown (intrabar)/All USD'], 10);
});
