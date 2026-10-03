import test from 'node:test';
import assert from 'node:assert/strict';
import type { Trade } from '../types.ts';
import { run } from '../index.ts';
import { calculateMetrics, monthlyReturns, tradeReturn } from './metrics.ts';
import type { ReportContext } from './metrics.ts';
import { closedEquityStatistics } from './closed-equity.ts';

function trade(profit: number, changes: Partial<Trade> = {}): Trade {
  return {
    direction: 'long',
    entryId: 'entry',
    exitId: 'exit',
    entryComment: '',
    exitComment: '',
    quantity: 2,
    entryBar: 1,
    exitBar: 4,
    entryTime: 100,
    exitTime: 400,
    entryPrice: 50,
    exitPrice: 50 + profit / 2,
    entryCommission: 0,
    commission: 0,
    profit,
    maxRunup: Math.max(profit, 0),
    maxDrawdown: Math.max(-profit, 0),
    ...changes,
  };
}
function context(trades: Trade[], changes: Partial<ReportContext> = {}): ReportContext {
  return { trades, initialCapital: 1000, currency: 'EUR', pointvalue: 1, bars: [], ...changes };
}

test('tiny cycle cash stays nonzero while raw cycle percentages and executed profit retain precision', () => {
  for (const [direction, name] of [
    [1, 'run-up'],
    [-1, 'drawdown'],
  ] as const) {
    const trades = [0, 0.0002, 0.00023].map((profit) => trade(profit * direction));
    const before = structuredClone(trades);
    const raw = closedEquityStatistics(trades, 1);
    const statistics = direction === 1 ? raw.runup! : raw.drawdown!;
    const metrics = calculateMetrics(context(trades, { initialCapital: 1 }));
    for (const operation of ['Average', 'Max']) {
      assert.equal(metrics[`Performance/${operation} ${name} (close-to-close)/All EUR`], 0.0004);
      assert.equal(
        metrics[`Performance/${operation} ${name} (close-to-close)/All %`],
        statistics.maximum.percent,
      );
    }
    assert.equal(statistics.average.value, 0.00043);
    assert.equal(statistics.maximum.value, 0.00043);
    assert.equal(
      metrics['Performance/Net profit/All EUR'],
      trades.reduce((sum, trade) => sum + trade.profit, 0),
    );
    assert.deepEqual(trades, before);
  }
});

test('cycle cash is projected after averaging without rounding individual cycles first', () => {
  const trades = [0, -0.002, -0.0024, 0.0044, -0.002, -0.0034].map((profit) => trade(profit));
  const raw = closedEquityStatistics(trades, 1).drawdown!;
  const metrics = calculateMetrics(context(trades, { initialCapital: 1 }));
  assert.equal(metrics['Performance/Average drawdown (close-to-close)/All EUR'], 0.005);
  assert.equal(metrics['Performance/Max drawdown (close-to-close)/All EUR'], 0.01);
  assert.equal(metrics['Performance/Average drawdown (close-to-close)/All %'], raw.average.percent);
  assert.equal(metrics['Performance/Max drawdown (close-to-close)/All %'], raw.maximum.percent);
  assert.notEqual(raw.average.value, 0.005);
  assert.notEqual(raw.maximum.value, 0.01);
});

test('closed cycle reports expose account statistics and floor only the mean elapsed duration', () => {
  const trades = [0, -50, 1000, -100].map((profit, index) =>
    trade(profit, { exitTime: [0, 1.9, 2, 2.9][index] * 86400 }),
  );
  const metrics = calculateMetrics(context(trades, { initialCapital: 100 }));
  assert.equal(metrics['Performance/Average drawdown (close-to-close)/All EUR'], 75);
  assert.equal(
    metrics['Performance/Average drawdown (close-to-close)/All %'],
    (50 + (100 / 1050) * 100) / 2,
  );
  assert.equal(metrics['Performance/Average drawdown duration (close-to-close)/All EUR'], '1 day');
  assert.equal(metrics['Performance/Max drawdown (close-to-close)/All EUR'], 100);
  assert.equal(metrics['Performance/Max drawdown (close-to-close)/All %'], (100 / 1050) * 100);
  for (const name of ['Average run-up', 'Max run-up']) {
    assert.equal(metrics[`Performance/${name} (close-to-close)/All EUR`], null);
    assert.equal(metrics[`Performance/${name} (close-to-close)/All %`], null);
  }
  assert.equal(metrics['Performance/Average run-up duration (close-to-close)/All EUR'], null);
  assert.equal('Performance/Max drawdown (close-to-close)/Long EUR' in metrics, false);

  const rising = calculateMetrics(
    context([trade(0), trade(2), trade(3, { exitTime: 1234.9 * 86400 })]),
  );
  assert.equal(
    rising['Performance/Average run-up duration (close-to-close)/All EUR'],
    '1,234 days',
  );
  assert.equal(rising['Performance/Average run-up (close-to-close)/All EUR'], 5);
  assert.equal(rising['Performance/Max run-up (close-to-close)/All %'], 0.5);
});

test('closed cycle durations below a day are reported in whole hours', () => {
  for (const [hours, expected] of [
    [18.9, '18 hours'],
    [1.9, '1 hour'],
  ] as const) {
    const trades = [0, -10, -20].map((profit, index) =>
      trade(profit, { exitTime: (index / 2) * hours * 3600 }),
    );
    const metrics = calculateMetrics(context(trades));
    assert.equal(
      metrics['Performance/Average drawdown duration (close-to-close)/All EUR'],
      expected,
    );
  }
});

test('open entry fees are realized while floating price PnL stays separate', () => {
  const metrics = calculateMetrics(
    context([
      trade(20, { commission: 2, entryCommission: 1 }),
      trade(-5, { direction: 'short', commission: 1, entryCommission: 0.5 }),
      trade(0),
      trade(9, {
        exitBar: null,
        exitTime: null,
        exitPrice: null,
        commission: 0.7,
        entryCommission: 0.7,
      }),
    ]),
  );
  assert.equal(metrics['Performance/Net profit/All EUR'], 14.3);
  assert.equal(metrics['Performance/Net profit/Long EUR'], 19.3);
  assert.equal(metrics['Performance/Net profit/Short EUR'], -5);
  assert.equal(metrics['Performance/Gross loss/All EUR'], 5.7);
  assert.equal(metrics['Performance/Open PnL/All EUR'], 9.7);
  assert.equal(metrics['Performance/Commission paid/All EUR'], 3.7);
  assert.equal(metrics['Trades analysis/Total trades/All EUR'], 3);
  assert.equal(metrics['Trades analysis/Total open trades/All EUR'], 1);
  assert.equal(metrics['Trades analysis/Even trades/All EUR'], 1);
  assert.ok(
    Math.abs(Number(metrics['Performance/Return on initial capital/All %']) - 1.43) < 1e-12,
  );
  assert.equal(metrics['Trades analysis/Average bars in trades/All EUR'], 4);
  assert.equal(metrics['Performance/Open PnL/All %'], (9.7 / 1014.3) * 100);
  assert.equal(metrics['Trades analysis/Average PnL/All EUR'], 5);
  assert.equal(metrics['Performance/Expectancy/All EUR'], 14.3 / 3);
  assert.equal(metrics['Trades analysis/Average loss/All EUR'], 5.7);
});

test('entry fees follow remaining quantity through partial and final exits without double counting', () => {
  const source = `//@version=6
strategy("commission allocation", initial_capital=1000, currency=currency.EUR,
 commission_type=strategy.commission.cash_per_contract, commission_value=2, margin_long=0)
if bar_index == 0
    strategy.entry("entry", strategy.long, qty=4)
if bar_index == 1
    strategy.close("entry", qty=1)
if bar_index == 2
    strategy.close_all()
plot(strategy.netprofit)
plot(strategy.openprofit)`;
  const bars = [100, 100, 110, 120].map((price, index) => ({
    time: index * 3600,
    open: price,
    high: price,
    low: price,
    close: price,
    volume: 1,
  }));
  for (const [count, net, floating, fees] of [
    [2, -8, 0, 8],
    [3, 0, 30, 10],
    [4, 54, 0, 16],
  ]) {
    const result = run(source, {
      bars: bars.slice(0, count),
      timeframe: '60',
      syminfo: { timezone: 'UTC', mintick: 1, mincontract: 1, currency: 'EUR' },
    });
    assert.deepEqual(result.diagnostics, []);
    assert.equal(result.metrics['Performance/Net profit/All EUR'], net);
    assert.equal(result.metrics['Performance/Net profit/Long EUR'], net);
    assert.equal(result.metrics['Performance/Net profit/Short EUR'], 0);
    assert.equal(result.metrics['Performance/Open PnL/All EUR'], floating);
    assert.equal(result.metrics['Performance/Commission paid/All EUR'], fees);
    assert.equal(result.plots[0].values.at(-1), net);
    assert.equal(result.plots[1].values.at(-1), floating);
    if (count === 2) {
      assert.equal(result.metrics['Performance/Gross loss/All EUR'], 8);
      assert.equal(result.metrics['Trades analysis/Total trades/All EUR'], 0);
      assert.equal(result.metrics['Trades analysis/Average loss/All EUR'], null);
      assert.equal(result.metrics['Performance/Expectancy/All EUR'], null);
    }
  }
});

test('Expectancy averages each closed trade including breakevens, with independent cash and returns', () => {
  const metrics = calculateMetrics(
    context([
      trade(20, { entryPrice: 49, entryCommission: 2 }),
      trade(-8, { entryPrice: 100 }),
      trade(0, { entryPrice: 25 }),
      trade(12, { direction: 'short', entryPrice: 25 }),
      trade(-6, { direction: 'short', entryPrice: 100 }),
      trade(0, { direction: 'short' }),
      trade(900, { exitBar: null, exitTime: null, exitPrice: null }),
      trade(-900, { direction: 'short', exitBar: null, exitTime: null, exitPrice: null }),
    ]),
  );
  for (const [scope, cash, percent] of [
    ['All', 3, 37 / 6],
    ['Long', 4, 16 / 3],
    ['Short', 2, 7],
  ] as const) {
    assert.equal(metrics[`Performance/Expectancy/${scope} EUR`], cash);
    assert.equal(metrics[`Trades analysis/Expectancy/${scope} EUR`], cash);
    assert.equal(metrics[`Trades analysis/Expectancy/${scope} %`], percent);
    assert.equal(metrics[`Performance/Expected payoff/${scope} EUR`], cash);
    assert.equal(metrics[`Trades analysis/Average PnL/${scope} EUR`], cash);
    assert.equal(metrics[`Trades analysis/Average PnL/${scope} %`], percent);
    assert.equal(`Performance/Expectancy/${scope} %` in metrics, false);
  }
});

test('Expectancy distinguishes a closed breakeven from no closed trades without changing Expected payoff', () => {
  const empty = calculateMetrics(context([]));
  const longOnly = calculateMetrics(
    context([
      trade(0),
      trade(50, { direction: 'short', exitBar: null, exitTime: null, exitPrice: null }),
    ]),
  );
  for (const scope of ['All', 'Long', 'Short']) {
    for (const [sheet, unit] of [
      ['Performance', 'EUR'],
      ['Trades analysis', 'EUR'],
      ['Trades analysis', '%'],
    ]) {
      assert.equal(empty[`${sheet}/Expectancy/${scope} ${unit}`], null);
      assert.equal(longOnly[`${sheet}/Expectancy/${scope} ${unit}`], scope === 'Short' ? null : 0);
    }
    assert.equal(empty[`Performance/Expected payoff/${scope} EUR`], 0);
    assert.equal(longOnly[`Performance/Expected payoff/${scope} EUR`], 0);
    assert.equal(empty[`Trades analysis/Average PnL/${scope} EUR`], null);
  }
});

test('return uses invested entry commission and percent extrema differ from cash extrema', () => {
  const first = trade(10, { entryCommission: 2 });
  assert.equal(tradeReturn(first, 1), (10 / 102) * 100);
  const metrics = calculateMetrics(context([first, trade(15, { entryPrice: 500 })]));
  assert.equal(metrics['Trades analysis/Largest profit/All EUR'], 15);
  assert.equal(metrics['Trades analysis/Largest profit %/All %'], (10 / 102) * 100);
  assert.equal(metrics['Trades analysis/Average profit/All %'], ((10 / 102) * 100 + 1.5) / 2);
});

test('empty-side statistics distinguish defined zero from undefined ratios and averages', () => {
  const metrics = calculateMetrics(context([trade(10)]));
  assert.equal(metrics['Performance/Expected payoff/Short EUR'], 0);
  assert.equal(metrics['Trades analysis/Total trades/Short EUR'], 0);
  assert.equal(metrics['Trades analysis/Percent profitable/Short %'], null);
  assert.equal(metrics['Trades analysis/Average PnL/Short EUR'], null);
  assert.equal(metrics['Trades analysis/Largest profit/Short EUR'], null);
  assert.equal(metrics['Risk-adjusted performance/Profit factor/Short EUR'], null);
  assert.equal(metrics['Risk-adjusted performance/Profit factor/Long EUR'], null);
  assert.equal('Performance/Max contracts held/All EUR' in metrics, false);
  assert.equal('Risk-adjusted performance/Margin calls/All EUR' in metrics, false);
});

test('average win/loss ratio is zero with only losers and undefined without losers', () => {
  for (const [profits, expected] of [
    [[], null],
    [[0], null],
    [[10, 20], null],
    [[-10, -20], 0],
    [[0, -10, -20], 0],
    [[10, 20, -5, -10], 2],
  ] as const) {
    const metrics = calculateMetrics(
      context([
        ...profits.map((profit) => trade(profit)),
        trade(100, { exitBar: null, exitTime: null, exitPrice: null }),
      ]),
    );
    for (const scope of ['All', 'Long'])
      assert.equal(metrics[`Trades analysis/Average profit / average loss/${scope} EUR`], expected);
    assert.equal(metrics['Trades analysis/Average profit / average loss/Short EUR'], null);
    if (!profits.some((profit) => profit > 0))
      assert.equal(metrics['Trades analysis/Average profit/All EUR'], null);
  }
});

test('outliers use one population of trade returns and then attribute each side', () => {
  const trades = Array.from({ length: 20 }, (_, index) => trade(index % 2 ? 1 : -1));
  trades.push(trade(40, { direction: 'short' }));
  const metrics = calculateMetrics(context(trades));
  assert.equal(metrics['Trades analysis/Outliers/All EUR'], 1);
  assert.equal(metrics['Trades analysis/Outliers/Short EUR'], 1);
  assert.equal(metrics['Trades analysis/Outliers/Long EUR'], 0);
  assert.equal(metrics['Trades analysis/Outliers P&L/All EUR'], 40);
  assert.equal(metrics['Trades analysis/Outliers P&L/All %'], 4);
});

test('observed position peaks and liquidation events are attributed without inferring missing logs', () => {
  const metrics = calculateMetrics(
    context([], {
      maxContractsHeld: { all: 12, long: 12, short: 5 },
      liquidations: [
        { direction: 'long', quantity: 3, price: 10 },
        { direction: 'short', quantity: 2, price: 10 },
        { direction: 'long', quantity: 4, price: 10 },
      ],
    }),
  );
  assert.equal(metrics['Performance/Max contracts held/All EUR'], 12);
  assert.equal(metrics['Performance/Largest liquidated volume/All EUR'], 40);
  assert.equal(metrics['Performance/Total liquidated volume/Long EUR'], 70);
  assert.equal(metrics['Risk-adjusted performance/Margin calls/All EUR'], 3);
  assert.equal(metrics['Risk-adjusted performance/Margin calls/Short EUR'], 1);
});

test('reported maximum contracts rounds nonnegative peaks to whole contracts with half ties up', () => {
  for (const [quantity, reported] of [
    [0, 0],
    [0.125, 0],
    [0.49, 0],
    [0.5, 1],
    [0.6, 1],
    [1, 1],
    [1.49, 1],
    [1.5, 2],
    [1.6, 2],
  ]) {
    const peaks = { all: quantity, long: quantity, short: quantity };
    const metrics = calculateMetrics(context([], { maxContractsHeld: peaks }));
    for (const scope of ['All', 'Long', 'Short'])
      assert.equal(metrics[`Performance/Max contracts held/${scope} EUR`], reported);
    assert.deepEqual(peaks, { all: quantity, long: quantity, short: quantity });
  }
});

test('whole-contract report values preserve fractional positions, trades, and profit', () => {
  const result = run(
    `//@version=6
strategy("fractional report boundary", initial_capital=1000)
if bar_index == 0
    strategy.entry("long", strategy.long, qty=0.625)
if bar_index == 1 or bar_index == 3
    strategy.close_all()
if bar_index == 2
    strategy.entry("short", strategy.short, qty=1.625)
plot(strategy.position_size)
plot(strategy.netprofit)`,
    {
      timeframe: '60',
      syminfo: { timezone: 'UTC', mintick: 0.01, mincontract: 0.125, currency: 'EUR' },
      bars: [100, 100, 104, 104, 100].map((price, index) => ({
        time: index * 3600,
        open: price,
        high: price,
        low: price,
        close: price,
        volume: 1,
      })),
    },
  );
  assert.deepEqual(result.diagnostics, []);
  assert.deepEqual(result.plots[0].values, [0, 0.625, 0, -1.625, 0]);
  assert.deepEqual(result.plots[1].values, [0, 0, 2.5, 2.5, 9]);
  assert.deepEqual(
    result.trades.map(({ quantity, profit }) => ({ quantity, profit })),
    [
      { quantity: 0.625, profit: 2.5 },
      { quantity: 1.625, profit: 6.5 },
    ],
  );
  assert.equal(result.metrics['Performance/Max contracts held/All EUR'], 2);
  assert.equal(result.metrics['Performance/Max contracts held/Long EUR'], 1);
  assert.equal(result.metrics['Performance/Max contracts held/Short EUR'], 2);
});

test('monthly risk ratios start at the first trade, carry idle months and include final open PnL', () => {
  const seconds = (date: string) => Date.parse(date) / 1000;
  const january = seconds('2024-01-01T00:00:00Z');
  const may = seconds('2024-05-31T23:00:00Z');
  const february = seconds('2024-02-02T00:00:00Z');
  const march = seconds('2024-03-02T00:00:00Z');
  const bar = (time: number) => ({ time, open: 10, high: 10, low: 10, close: 10, volume: 1 });
  const input = context(
    [
      trade(100, { entryTime: february, exitTime: march }),
      trade(22, { entryTime: may, exitTime: null, exitBar: null, exitPrice: null }),
    ],
    { bars: [bar(january), bar(may)], riskFreeRate: 0 },
  );
  assert.deepEqual(monthlyReturns(input), [0, 0.1, 0, 0.02]);
  const metrics = calculateMetrics(input);
  const mean = 0.12 / 4;
  const sd = Math.sqrt((2 * mean ** 2 + (0.1 - mean) ** 2 + (0.02 - mean) ** 2) / 4);
  assert.ok(
    Math.abs(Number(metrics['Risk-adjusted performance/Sharpe ratio/All EUR']) - mean / sd) < 1e-12,
  );
  assert.equal(metrics['Risk-adjusted performance/Sortino ratio/All EUR'], null);
});

test('short closed strategies use daily returns and exclude the idle tail after their last exit', () => {
  const seconds = (date: string) => Date.parse(date) / 1000;
  const bar = (date: string) => ({
    time: seconds(date),
    open: 1,
    high: 1,
    low: 1,
    close: 1,
    volume: 1,
  });
  const trades = [
    trade(830.24, {
      entryTime: seconds('2024-01-01T01:00:00Z'),
      exitTime: seconds('2024-01-01T23:00:00Z'),
    }),
    trade(159.71, {
      entryTime: seconds('2024-01-02T01:00:00Z'),
      exitTime: seconds('2024-01-02T11:00:00Z'),
    }),
  ];
  for (const end of ['2024-01-02T23:00:00Z', '2024-12-31T23:00:00Z']) {
    const metrics = calculateMetrics(
      context(trades, {
        initialCapital: 10000,
        bars: [bar('2021-01-01T00:00:00Z'), bar(end)],
      }),
    );
    // Independent native drawdown probe: the cash and percent modes have these same daily totals.
    assert.ok(
      Math.abs(Number(metrics['Risk-adjusted performance/Sharpe ratio/All EUR']) - 1.430358909) <
        1e-7,
    );
    assert.equal(metrics['Risk-adjusted performance/Sortino ratio/All EUR'], null);
  }
});

test('risk ratios carry intervening idle days and use a daily risk-free rate through three calendar months', () => {
  const seconds = (date: string) => Date.parse(date) / 1000;
  const first = seconds('2024-01-01T01:00:00Z');
  for (const [date, periodsPerYear, count] of [
    ['2024-03-01T01:00:00Z', 365, 61],
    ['2024-04-01T01:00:00Z', 12, 4],
  ] as const) {
    const last = seconds(date);
    const trades = [
      trade(100, { entryTime: first, exitTime: first }),
      trade(-55, { entryTime: last, exitTime: last }),
    ];
    const bars = [first, last].map((time) => ({
      time,
      open: 1,
      high: 1,
      low: 1,
      close: 1,
      volume: 1,
    }));
    const metrics = calculateMetrics(context(trades, { bars }));
    const expected = Array<number>(count).fill(0);
    expected[0] = 0.1;
    expected[count - 1] = -0.05;
    const mean = 0.05 / count;
    const rf = 0.02 / periodsPerYear;
    const sd = Math.sqrt(expected.reduce((sum, r) => sum + (r - mean) ** 2, 0) / count);
    const downside = Math.sqrt(
      expected.reduce((sum, r) => sum + Math.min(r - rf, 0) ** 2, 0) / count,
    );
    assert.ok(
      Math.abs(
        Number(metrics['Risk-adjusted performance/Sharpe ratio/All EUR']) - (mean - rf) / sd,
      ) < 1e-12,
    );
    assert.ok(
      Math.abs(
        Number(metrics['Risk-adjusted performance/Sortino ratio/All EUR']) - (mean - rf) / downside,
      ) < 1e-12,
    );
  }
});

test('buy-and-hold uses tradable entry quantity and CAGR measures the whole supplied period', () => {
  const bar = (time: number, close: number) => ({
    time,
    open: close,
    high: close,
    low: close,
    close,
    volume: 1,
  });
  const metrics = calculateMetrics(
    context([trade(100, { entryPrice: 31.23 })], {
      bars: [bar(0, 31.234), bar(365 * 86400, 41.23)],
      mintick: 0.01,
      mincontract: 1,
    }),
  );
  assert.ok(Math.abs(Number(metrics['Performance/Buy and hold PnL/All EUR']) - 320) < 1e-10);
  assert.ok(Math.abs(Number(metrics['Performance/Annualized return (CAGR)/All %']) - 10) < 1e-10);
  assert.ok(Math.abs(Number(metrics['Performance/Strategy outperformance/All EUR']) + 220) < 1e-10);
});

test('account metrics retain independent cash and percent excursions and intrabar margin peaks', () => {
  const metrics = calculateMetrics(
    context([trade(40), trade(-10, { direction: 'short' })], {
      intrabarDrawdown: { value: 50, percent: 7 },
      intrabarRunup: { value: 90, percent: 11 },
      marginUsed: [0, 20, 10],
      maxMarginUsed: 75,
    }),
  );
  assert.equal(metrics['Performance/Max drawdown (intrabar)/All EUR'], 50);
  assert.equal(metrics['Performance/Max drawdown (intrabar)/All %'], 7);
  assert.equal(metrics['Performance/Max drawdown as % of initial capital (intrabar)/All %'], 5);
  assert.equal(metrics['Performance/Max run-up (intrabar)/All EUR'], 90);
  assert.equal(metrics['Performance/Max run-up (intrabar)/All %'], 11);
  assert.equal(metrics['Performance/Max margin used/All EUR'], 75);
  assert.equal(metrics['Performance/Account size required/All EUR'], 125);
  assert.equal(metrics['Performance/Return of max drawdown/Long EUR'], 0.8);
  assert.equal(metrics['Performance/Return on account size required/Short %'], -8);

  const unknown = calculateMetrics(context([], { intrabarDrawdown: { value: 0, percent: 0 } }));
  assert.equal('Performance/Account size required/All EUR' in unknown, false);
});

test('buy-and-hold uses the observed first entry including slippage and marks the final position at market', () => {
  const bar = (time: number, close: number) => ({
    time,
    open: close,
    high: close,
    low: close,
    close,
    volume: 1,
  });
  const metrics = calculateMetrics(
    context([trade(0, { entryPrice: 31.28 })], {
      bars: [bar(0, 31.234), bar(86400, 41.23)],
      mintick: 0.01,
      mincontract: 1,
    }),
  );
  assert.ok(Math.abs(Number(metrics['Performance/Buy and hold PnL/All EUR']) - 308.45) < 1e-10);
  assert.ok(
    Math.abs(Number(metrics['Performance/Buy and hold % gain/All %']) - (41.23 / 31.28 - 1) * 100) <
      1e-10,
  );
});

test('return of drawdown includes account open PnL in each side while account-size return uses closed PnL', () => {
  const metrics = calculateMetrics(
    context(
      [
        trade(40),
        trade(-10, { direction: 'short' }),
        trade(5, { exitTime: null, exitBar: null, exitPrice: null }),
      ],
      {
        intrabarDrawdown: { value: 50, percent: 5 },
        marginUsed: [0],
        maxMarginUsed: 0,
      },
    ),
  );
  assert.equal(metrics['Performance/Return of max drawdown/All EUR'], 0.7);
  assert.equal(metrics['Performance/Return of max drawdown/Long EUR'], 0.9);
  assert.equal(metrics['Performance/Return of max drawdown/Short EUR'], -0.1);
  assert.equal(metrics['Performance/Return on account size required/All %'], 60);
  assert.equal(metrics['Performance/Return on account size required/Long %'], 80);
  assert.equal(metrics['Performance/Return on account size required/Short %'], -20);
});

test('margin efficiency adds all account open profit to each side of closed profit', () => {
  const bars = Array.from({ length: 5 }, (_, index) => ({
    time: index * 3600,
    open: 10,
    high: 10,
    low: 10,
    close: 10,
    volume: 1,
  }));
  const trades = [
    trade(40, { entryBar: 2 }),
    trade(-10, { direction: 'short', entryBar: 3 }),
    trade(5, { direction: 'short', entryBar: 1, exitBar: null, exitTime: null, exitPrice: null }),
  ];
  const metrics = calculateMetrics(context(trades, { bars, marginUsed: [0, 10, 20, 30, 900] }));
  assert.equal(metrics['Performance/Average margin used/All EUR'], 20);
  assert.equal(metrics['Performance/Margin efficiency/All EUR'], 1.75);
  assert.equal(metrics['Performance/Margin efficiency/Long EUR'], 2.25);
  assert.equal(metrics['Performance/Margin efficiency/Short EUR'], -0.25);

  const zero = calculateMetrics(context(trades, { bars, marginUsed: [0, 0, 0, 0, 0] }));
  assert.equal(zero['Performance/Average margin used/All EUR'], 0);
  for (const scope of ['All', 'Long', 'Short'])
    assert.equal(zero[`Performance/Margin efficiency/${scope} EUR`], 0);

  const partial = calculateMetrics(context(trades, { bars, marginUsed: [0, 10] }));
  assert.equal('Performance/Average margin used/All EUR' in partial, false);
  assert.equal('Performance/Margin efficiency/All EUR' in partial, false);

  const empty = calculateMetrics(context([], { bars, marginUsed: [0, 0, 0, 0, 0] }));
  assert.equal(empty['Performance/Average margin used/All EUR'], 0);
  for (const scope of ['All', 'Long', 'Short'])
    assert.equal(empty[`Performance/Margin efficiency/${scope} EUR`], 0);
});

test('open-only strategies average from the entry bar and exclude one final snapshot', () => {
  const source = `//@version=6
strategy("delayed open margin", initial_capital=1000, margin_long=50, margin_short=50)
if bar_index == 1
    strategy.entry("holding", strategy.long, qty=2)
plot(strategy.position_size)`;
  const input = {
    timeframe: '60',
    syminfo: { timezone: 'UTC', mintick: 0.01, mincontract: 1, currency: 'EUR' },
    bars: [5, 5, 8, 12, 20].map((price, index) => ({
      time: index * 3600,
      open: price,
      high: price,
      low: price,
      close: price,
      volume: 1,
    })),
  };
  for (const realtimeTail of [false, true]) {
    const result = run(source, { ...input, realtimeTail });
    assert.deepEqual(result.diagnostics, []);
    assert.equal(result.trades.length, 1);
    assert.equal(result.trades[0].entryBar, 2);
    assert.equal(result.trades[0].exitBar, null);
    assert.equal(result.metrics['Performance/Average margin used/All EUR'], 10);
    for (const scope of ['All', 'Long', 'Short'])
      assert.equal(result.metrics[`Performance/Margin efficiency/${scope} EUR`], 2.4);
  }
});
