import assert from 'node:assert/strict';
import test from 'node:test';
import { Broker } from './broker.ts';
import { RiskLimits } from './risk.ts';
import type { MarketBar, RunInput } from '../types.ts';

const start = Date.parse('2025-01-06T00:00:00Z') / 1000;
const bar = (hour: number, open = 100, high = open, low = open, close = open): MarketBar => ({
  time: start + hour * 3600,
  open,
  high,
  low,
  close,
  volume: 10,
});

function broker(initialCapital = 1000, extra: Partial<RunInput> = {}): Broker {
  const result = new Broker(
    {
      bars: [],
      syminfo: { timezone: 'UTC', mintick: 1, mincontract: 1, pointvalue: 1 },
      timeframe: '60',
      settings: { initial_capital: initialCapital, margin_long: 0, margin_short: 0 },
      ...extra,
    },
    6,
  );
  result.configure({});
  return result;
}

test('cash and percent drawdown use peak realized balance and halt at the threshold', () => {
  for (const [amount, type] of [
    [20, 'cash'],
    [2, 'percent_of_equity'],
  ] as const) {
    const risk = new RiskLimits(900);
    risk.setLoss('drawdown', amount, type);
    risk.beginDay(900);
    assert.equal(risk.observe(1000), undefined);
    assert.equal(risk.observe(981), undefined);
    assert.equal(risk.observe(980)?.permanent, true);
    risk.beginDay(1100);
    assert.equal(risk.halted, true);
  }
});

test('subtraction rounding cannot hide an exact cent threshold or admit a smaller loss', () => {
  for (const [amount, type] of [
    [0.01, 'cash'],
    [0.001, 'percent_of_equity'],
  ] as const) {
    const risk = new RiskLimits(1000);
    risk.setLoss('drawdown', amount, type);
    assert.equal(risk.observe(999.99000001), undefined);
    assert.equal(risk.observe(999.99)?.permanent, true);
  }
  const largeAccount = new RiskLimits(1e15);
  largeAccount.setLoss('drawdown', 0.01, 'cash');
  assert.equal(largeAccount.observe(1e15), undefined);
});

test('intraday loss resets its opening value and permits trading in the next supplied session', () => {
  const risk = new RiskLimits(1000);
  risk.setLoss('intraday', 10, 'percent_of_equity');
  risk.beginDay(1000);
  risk.observe(1100);
  assert.equal(risk.observe(901), undefined);
  assert.equal(risk.observe(900)?.permanent, false);
  assert.equal(risk.halted, true);
  risk.beginDay(980);
  assert.equal(risk.halted, false);
  assert.equal(risk.observe(883), undefined);
  assert.equal(risk.observe(882)?.permanent, false);
});

test('cash and percent intraday loss use the opening value and include floating losses', () => {
  for (const [amount, type, nextDayThreshold] of [
    [100, 'cash', 1100],
    [10, 'percent_of_equity', 1080],
  ] as const) {
    const risk = new RiskLimits(1000);
    risk.setLoss('intraday', amount, type);
    risk.beginDay(1000);
    assert.equal(risk.observe(1300, 1200), undefined);
    assert.equal(risk.observe(1000, 1200), undefined);
    assert.equal(risk.observe(901, 1200), undefined);
    assert.equal(risk.observe(900, 1200)?.permanent, false);
    risk.beginDay(1200);
    assert.equal(risk.observe(nextDayThreshold + 1, 1200), undefined);
    assert.equal(risk.observe(nextDayThreshold, 1200)?.permanent, false);
  }
});

test('equity at or below zero makes percent-based intraday halts permanent', () => {
  const risk = new RiskLimits(100);
  risk.setLoss('intraday', 100, 'percent_of_equity');
  risk.beginDay(100);
  assert.equal(risk.observe(0)?.permanent, true);
  risk.beginDay(100);
  assert.equal(risk.halted, true);
});

test('cash intraday loss skips negative opening equity and resumes after recovery', () => {
  const risk = new RiskLimits(1000);
  risk.setLoss('intraday', 100, 'cash');
  risk.beginDay(-200);
  assert.equal(risk.observe(-400, -1200), undefined);
  assert.equal(risk.observe(300, -1200), undefined);
  assert.equal(risk.observe(-300, -1200), undefined);
  assert.equal(risk.halted, false);
  risk.beginDay(300);
  assert.equal(risk.observe(201, -1200), undefined);
  assert.equal(risk.observe(200, -1200)?.permanent, false);
});

test('losing-day rule counts completed days, resets on nonloss days, and stays halted', () => {
  const risk = new RiskLimits(1000);
  risk.setLosingDays(2);
  risk.beginDay(1000);
  assert.equal(risk.beginDay(990), undefined);
  assert.equal(risk.beginDay(990), undefined);
  assert.equal(risk.beginDay(980), undefined);
  assert.equal(risk.beginDay(970)?.permanent, true);
  risk.beginDay(1100);
  assert.equal(risk.halted, true);
});

test('multiple risk declarations preserve the strictest active limits', () => {
  const risk = new RiskLimits(1000);
  risk.setLoss('drawdown', 10, 'cash');
  risk.setLoss('drawdown', 100, 'cash');
  assert.equal(risk.observe(990)?.permanent, true);
});

test('a recovering or flat period breaks the loss streak even below initial equity', () => {
  for (const recovery of [980, 985]) {
    const risk = new RiskLimits(1000);
    risk.setLosingDays(2);
    risk.beginDay(1000);
    assert.equal(risk.beginDay(980), undefined);
    assert.equal(risk.beginDay(recovery), undefined);
    assert.equal(risk.beginDay(970), undefined);
    assert.deepEqual(risk.beginDay(960), {
      reason: 'Close Position (Max consecutive loss days)',
      permanent: true,
      execution: 'period-boundary',
    });
  }
});

test('weekly floating losses commit risk liquidation alongside scheduled full or partial closes', () => {
  const reason = 'Close Position (Max consecutive loss days)';
  for (const side of [1, -1] as const) {
    for (const closeQuantity of [0, 1, 2]) {
      const account = broker(1000, { timeframe: '1W' });
      account.call('risk.max_cons_loss_days', [2]);
      account.beginBar(0, bar(0));
      account.call('entry', ['held', side, 2]);
      account.call('order', ['remote', 1, 1, 5]);
      account.endBar();
      const firstClose = 100 - side * 10;
      const secondClose = 100 - side * 20;
      account.beginBar(
        1,
        bar(168, 100, Math.max(100, firstClose), Math.min(100, firstClose), firstClose),
      );
      account.endBar();
      account.beginBar(
        2,
        bar(
          336,
          firstClose,
          Math.max(firstClose, secondClose),
          Math.min(firstClose, secondClose),
          secondClose,
        ),
      );
      assert.equal(account.get('netprofit'), 0, 'both losing weeks are unrealized');
      assert.equal(account.get('position_size'), side * 2);
      if (closeQuantity)
        account.call('close', ['held'], { qty: closeQuantity, comment: 'scheduled close' });
      account.endBar();

      account.beginBar(3, bar(504, secondClose));
      account.endBar();
      assert.equal(account.get('position_size'), closeQuantity ? -side * closeQuantity : 0);
      assert.equal(account.get('netprofit'), -40);
      const trades = account.result().trades.filter((trade) => trade.exitBar !== null);
      assert.equal(
        trades.reduce((sum, trade) => sum + trade.quantity, 0),
        2,
      );
      assert.equal(trades[0]!.exitComment, closeQuantity ? 'scheduled close' : reason);
      assert.equal(trades.at(-1)!.exitComment, closeQuantity === 2 ? 'scheduled close' : reason);
      assert.ok(trades.every((trade) => trade.exitBar === 3 && trade.exitPrice === secondClose));

      account.call('entry', ['after halt', side, 10]);
      account.beginBar(4, bar(672, secondClose, secondClose, 1, secondClose));
      account.endBar();
      assert.equal(
        account.get('position_size'),
        closeQuantity ? -side * closeQuantity : 0,
        'pending and later entries cannot fill',
      );
    }
  }
});

test('a fill callback cannot cancel a committed period-boundary liquidation', () => {
  const account = broker(1000, { timeframe: '1W' });
  account.settings.calc_on_order_fills = true;
  account.call('risk.max_cons_loss_days', [1]);
  account.beginBar(0, bar(0));
  account.call('entry', ['held', 1, 2]);
  account.endBar();
  account.beginBar(1, bar(168, 100, 100, 90, 90));
  account.call('close_all', [], { comment: 'scheduled close' });
  account.endBar();
  let callbacks = 0;
  account.beginBar(2, bar(336, 90), () => {
    callbacks++;
    account.call('cancel_all', []);
    account.call('entry', ['callback entry', 1, 10]);
  });
  account.endBar();
  assert.equal(callbacks, 2);
  assert.equal(account.get('position_size'), -2);
  assert.equal(account.get('closedtrades'), 1);
  account.beginBar(3, bar(504, 90));
  account.endBar();
  assert.equal(account.get('position_size'), -2);
});

test('invalid risk limits produce runtime errors instead of silently disabling risk', () => {
  const risk = new RiskLimits(1000);
  for (const invalid of [-1, NaN, Infinity])
    assert.throws(() => risk.setLoss('drawdown', invalid, 'cash'), /Invalid/);
  assert.throws(() => risk.setLoss('intraday', 101, 'percent_of_equity'), /Invalid/);
  assert.throws(() => risk.setLoss('drawdown', 1, 'unknown'), /Invalid/);
  for (const invalid of [-1, 0, 1.5, NaN])
    assert.throws(() => risk.setLosingDays(invalid), /positive integer/);
});

test('drawdown ignores floating losses and halts after a realized loss cancels pending orders', () => {
  const account = broker();
  account.call('risk.max_drawdown', [10, 'cash']);
  account.beginBar(0, bar(0));
  account.call('entry', ['long', 1, 1]);
  account.call('order', ['pending', 1, 1, 50]);
  account.endBar();
  account.beginBar(1, bar(1, 100, 101, 89, 95));
  assert.equal(account.get('position_size'), 1);
  assert.equal(account.get('closedtrades'), 0);
  account.call('close_all', [], { immediately: true, comment: 'realize loss' });
  account.settings.slippage = 5;
  account.endBar();
  assert.equal(account.get('position_size'), 0);
  assert.equal(account.get('closedtrades'), 1);
  assert.equal(account.result().trades[0]!.exitComment, 'realize loss');
  assert.equal(account.get('netprofit'), -10);
  account.beginBar(2, bar(24, 60, 70, 40, 60));
  account.call('entry', ['after', -1, 1]);
  account.endBar();
  account.beginBar(3, bar(25));
  account.endBar();
  assert.equal(account.get('position_size'), 0);
  assert.equal(account.get('closedtrades'), 1);
});

test('floating gains and losses do not change drawdown balance anchors', () => {
  for (const [amount, type, threshold] of [
    [100, 'cash', 1000],
    [10, 'percent_of_equity', 990],
  ] as const) {
    const risk = new RiskLimits(1000);
    risk.setLoss('drawdown', amount, type);
    assert.equal(risk.observe(1300, 1000), undefined);
    assert.equal(risk.observe(700, 1000), undefined);
    assert.equal(risk.observe(1100, 1100), undefined);
    assert.equal(risk.observe(threshold + 1, threshold + 1), undefined);
    assert.equal(risk.observe(threshold, threshold)?.permanent, true);
  }
});

test('commission losses are checked on execution even when price never changes', () => {
  const account = broker();
  account.settings.commission_type = 'cash_per_order';
  account.settings.commission_value = 10;
  account.call('risk.max_drawdown', [10, 'cash']);
  account.beginBar(0, bar(0));
  account.call('entry', ['long', 1, 1]);
  account.endBar();
  account.beginBar(1, bar(1));
  account.endBar();
  assert.equal(account.get('position_size'), 0);
  assert.equal(account.get('closedtrades'), 1);
  assert.equal(account.get('netprofit'), -20);
});

test('intraday loss closes a realized loser and allows new orders after the next day', () => {
  const account = broker();
  account.call('risk.max_intraday_loss', [], { value: 10, type: 'cash' });
  account.beginBar(0, bar(0));
  account.call('entry', ['long', 1, 1]);
  account.endBar();
  account.beginBar(1, bar(1, 100, 101, 89, 95));
  account.call('close_all', [], { immediately: true, comment: 'realize loss' });
  account.endBar();
  account.beginBar(2, bar(2, 95));
  account.endBar();
  assert.equal(account.get('position_size'), 0);
  account.beginBar(3, bar(24, 95));
  account.call('entry', ['next day', 1, 1]);
  account.endBar();
  account.beginBar(4, bar(25, 95));
  account.endBar();
  assert.equal(account.get('position_size'), 1);
});

test('intraday risk follows the supplied overnight session across civil midnight', () => {
  const account = broker(1000, {
    sessionCalendar: {
      from: start,
      to: start + 72 * 3600,
      sessions: [
        { open: start + 21 * 3600, close: start + 27 * 3600, tradingDay: '2025-01-07' },
        { open: start + 45 * 3600, close: start + 51 * 3600, tradingDay: '2025-01-08' },
      ],
    },
  });
  account.call('risk.max_intraday_loss', [10, 'cash']);
  account.beginBar(0, bar(21));
  account.call('entry', ['E', 1, 1]);
  account.endBar();
  account.beginBar(1, bar(22, 100, 101, 79, 85));
  account.call('close_all', [], { immediately: true, comment: 'realize overnight loss' });
  account.endBar();
  account.beginBar(2, bar(24, 95));
  account.call('entry', ['midnight', 1, 1]);
  account.endBar();
  account.beginBar(3, bar(25, 95));
  account.endBar();
  assert.equal(account.get('position_size'), 0);
  account.beginBar(4, bar(45, 95));
  account.call('entry', ['next session', 1, 1]);
  account.endBar();
  account.beginBar(5, bar(46, 95));
  account.endBar();
  assert.equal(account.get('position_size'), 1);
});

test('risk observations and halts are isolated between independent brokers', () => {
  const halted = broker();
  halted.call('risk.max_drawdown', [0, 'cash']);
  halted.beginBar(0, bar(0));
  halted.call('entry', ['E', 1, 1]);
  halted.endBar();
  halted.beginBar(1, bar(1));
  halted.endBar();
  assert.equal(halted.get('position_size'), 0);
  const fresh = broker();
  fresh.beginBar(0, bar(0));
  fresh.call('entry', ['E', 1, 1]);
  fresh.endBar();
  fresh.beginBar(1, bar(1));
  fresh.endBar();
  assert.equal(fresh.get('position_size'), 1);
});

test('zero risk thresholds cancel first-bar orders before process-on-close fills', () => {
  for (const name of ['max_drawdown', 'max_intraday_loss']) {
    const account = broker();
    account.settings.process_orders_on_close = true;
    account.beginBar(0, bar(0));
    account.call(`risk.${name}`, [0, 'cash']);
    account.call('entry', ['E', 1, 1]);
    account.endBar();
    assert.equal(account.get('position_size'), 0);
    assert.equal(account.get('closedtrades'), 0);
  }
});
