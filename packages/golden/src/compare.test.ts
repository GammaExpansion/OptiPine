import test from 'node:test';
import assert from 'node:assert/strict';
import {
  compareCompilation,
  compareMetrics,
  comparePlots,
  compareTrades,
  equalCell,
  preservedMatches,
  checkValues,
  tradeRows,
  EXACT,
} from './compare.ts';
import type { Trade } from '@pine/engine';

test('missing data is distinct from explicit na, including a missing final bar', () => {
  assert.equal(equalCell(null, undefined), false);
  assert.equal(equalCell(null, null), true);
  assert.equal(equalCell(null, Number.NaN), true);
  assert.equal(equalCell(1, true), true);
  const result = comparePlots([{ title: 'x', values: [1, null] }], [{ title: 'x', values: [1] }]);
  assert.equal(result.find((c) => c.id === 'plot/0/x')?.total, 2);
  assert.equal(result.find((c) => c.id === 'plot/0/x')?.matched, 1);
  assert.equal(result.find((c) => c.id === 'plot/0/x/shape')?.status, 'mismatch');
});

test('column order and extra columns are checked even when cell values match', () => {
  const checks = comparePlots(
    [
      { title: 'left', values: [1] },
      { title: 'right', values: [2] },
    ],
    [
      { title: 'right', values: [2] },
      { title: 'left', values: [1] },
      { title: 'extra', values: [3] },
    ],
  );
  assert.equal(checks.find((c) => c.id === 'plots/count')?.status, 'mismatch');
  assert.equal(checks.find((c) => c.id === 'plot/0/left/shape')?.status, 'mismatch');
  assert.equal(checks.find((c) => c.id === 'plots/count')?.total, 4);
  assert.equal(
    checks.some((c) => c.id.includes('<extra>')),
    false,
  );
});

test('unsupported compilation cannot reproduce an expected TradingView error', () => {
  const expect = { compile: 'error' as const, error: { line: 3 } };
  assert.equal(
    compareCompilation(expect, {
      success: false,
      diagnostics: [{ kind: 'unsupported', line: 3, message: 'not implemented' }],
    }).status,
    'unsupported',
  );
  assert.equal(
    compareCompilation(expect, {
      success: false,
      diagnostics: [{ kind: 'type', line: 3, message: 'wrong type' }],
    }).status,
    'match',
  );
  assert.equal(
    compareCompilation(expect, {
      success: false,
      diagnostics: [{ kind: 'type', line: 4, message: 'wrong type' }],
    }).status,
    'mismatch',
  );
});

test('a gain at a different cell does not preserve a matching assertion', () => {
  const before = checkValues('x', 'series', [1, 2], [1, 9]);
  const after = checkValues('x', 'series', [1, 2], [9, 2]);
  assert.equal(before.matched, after.matched);
  assert.equal(preservedMatches(before, after), false);
});

test('report metric omission is unsupported and exported rounding has a finite bound', () => {
  const key = 'Performance/Net profit/All USD';
  assert.equal(compareMetrics({ [key]: 12.34 }, {})[0].status, 'unsupported');
  assert.equal(compareMetrics({ [key]: 12.34 }, { [key]: 12.344 })[0].status, 'match');
  assert.equal(compareMetrics({ [key]: 12.34 }, { [key]: 12.346 })[0].status, 'mismatch');
  const ratio = 'Risk-adjusted performance/Sharpe ratio/All USD';
  assert.equal(compareMetrics({ [ratio]: 0.123 }, { [ratio]: 0.124 })[0].status, 'mismatch');
});

test('new native metric names cannot satisfy old names or replace an undefined observation with zero', () => {
  const oldKey = 'Performance/Expected payoff/Short USD';
  const newKey = 'Performance/Expectancy/Short USD';
  const actual = { [oldKey]: 0, [newKey]: null };
  const oldChecks = compareMetrics({ [oldKey]: 0 }, actual);
  assert.equal(oldChecks.length, 1);
  assert.equal(oldChecks[0].status, 'match');
  assert.equal(compareMetrics({ [newKey]: null }, actual)[0].status, 'match');
  assert.equal(compareMetrics({ [newKey]: null }, { [oldKey]: 0 })[0].status, 'unsupported');
  assert.equal(compareMetrics({ [newKey]: null }, { [newKey]: 0 })[0].status, 'mismatch');
});

test('added erroneous trades reduce row score without shortening a matching prefix', () => {
  const trade: Trade = {
    direction: 'long',
    entryId: 'buy',
    exitId: 'sell',
    entryComment: '',
    exitComment: '',
    quantity: 2,
    entryBar: 0,
    exitBar: 2,
    entryTime: 100,
    exitTime: 200,
    entryPrice: 10,
    exitPrice: 12,
    commission: 0,
    entryCommission: 0,
    profit: 4,
    maxRunup: 4,
    maxDrawdown: 0,
  };
  const expected = [
    {
      'Trade number': 1,
      Type: 'Exit long',
      'Date and time': 200,
      Signal: '',
      'Price USD': 12,
      'Size (qty)': 2,
      'Size (value)': 20,
      'Net PnL USD': 4,
      'Return %': 20,
      'Commission USD': 0,
      'Favorable excursion USD': 4,
      'Favorable excursion %': 20,
      'Adverse excursion USD': 0,
      'Adverse excursion %': 0,
      'Cumulative PnL USD': 4,
      'Cumulative PnL %': 4,
      'Duration (bars)': 2,
    },
    {
      'Trade number': 1,
      Type: 'Entry long',
      'Date and time': 100,
      Signal: 'buy',
      'Price USD': 10,
      'Size (qty)': 2,
      'Size (value)': 20,
      'Net PnL USD': 4,
      'Return %': 20,
      'Commission USD': 0,
      'Favorable excursion USD': 4,
      'Favorable excursion %': 20,
      'Adverse excursion USD': 0,
      'Adverse excursion %': 0,
      'Cumulative PnL USD': 4,
      'Cumulative PnL %': 4,
      'Duration (bars)': 2,
    },
  ];
  const settings = { currency: 'USD', pointvalue: 1, initialCapital: 100 };
  const before = compareTrades(expected, [trade], settings).find((c) => c.id === 'trades/rows')!;
  const after = compareTrades(expected, [trade, trade], settings).find(
    (c) => c.id === 'trades/rows',
  )!;
  assert.equal(before.status, 'match');
  assert.equal(after.matchingPrefix, before.matchingPrefix);
  assert.ok(after.matched / after.total < before.matched / before.total);
});

test('open report rows use snapshot duration and each open trade has independent cumulative PnL', () => {
  const closed: Trade = {
    direction: 'long',
    entryId: 'entry',
    exitId: 'exit',
    entryComment: '',
    exitComment: '',
    quantity: 2,
    entryBar: 0,
    exitBar: 2,
    entryTime: 100,
    exitTime: 200,
    entryPrice: 10,
    exitPrice: 12,
    commission: 0,
    entryCommission: 0,
    profit: 4,
    maxRunup: 4,
    maxDrawdown: 0,
  };
  const open = {
    ...closed,
    entryBar: 3,
    exitBar: null,
    exitId: null,
    exitTime: null,
    exitPrice: null,
    exitComment: null,
  };
  const rows = tradeRows([closed, { ...open, profit: 3 }, { ...open, profit: -2 }], 'EUR', 5, 9);
  assert.equal(rows[2].Signal, 'Open');
  assert.equal(rows[2]['Date and time'], 'Open');
  assert.equal(rows[2]['Price EUR'], '—');
  assert.equal(rows[2]['Duration (bars)'], 6);
  assert.equal(rows[2]['Cumulative PnL EUR'], 7);
  assert.equal(rows[4]['Cumulative PnL EUR'], 2);
  assert.equal(rows[2]['Size (value)'], 100);
});

test('open report projection and cumulative rows retain actual realized account history', () => {
  const base: Trade = {
    direction: 'long',
    entryId: 'entry',
    exitId: 'exit',
    entryComment: '',
    exitComment: '',
    quantity: 1,
    entryBar: 1,
    exitBar: 2,
    entryTime: 100,
    exitTime: 200,
    entryPrice: 100,
    exitPrice: 110,
    commission: 4,
    entryCommission: 2,
    profit: 6,
    realizedProfit: 0,
    maxRunup: 10,
    maxDrawdown: 0,
  };
  const open: Trade = {
    ...base,
    quantity: 3,
    exitBar: null,
    exitTime: null,
    exitId: null,
    exitPrice: null,
    commission: 6,
    entryCommission: 6,
    profit: 24,
    realizedProfit: 0,
  };
  const rows = tradeRows([base, open], 'USD', 1, 2);
  assert.equal(rows[0]['Net PnL USD'], 6);
  assert.equal(rows[0]['Cumulative PnL USD'], 0);
  assert.equal(rows[2]['Net PnL USD'], 18);
  assert.equal(rows[2]['Cumulative PnL USD'], 18);
  assert.equal(rows[2]['Commission USD'], 6);
  assert.equal(rows[2]['Return %'], (18 / 306) * 100);
  assert.equal(open.profit, 24);
});

test('CSV and report precision do not excuse meaningful accounting or counter errors', () => {
  assert.equal(equalCell(100000.01, 100000.0101), false);
  assert.equal(equalCell(100000.01, 100000.01000001), true);
  const counter = 'Trades analysis/Total winners/All USD';
  assert.equal(compareMetrics({ [counter]: 1 }, { [counter]: 1.00000001 })[0].status, 'mismatch');
  const tiny = 'Performance/Expected payoff/Short USD';
  assert.equal(compareMetrics({ [tiny]: -0.004 }, { [tiny]: 0 })[0].status, 'mismatch');
  assert.equal(compareMetrics({ [tiny]: -0.004 }, { [tiny]: -0.0044 })[0].status, 'match');
  assert.equal(equalCell(1, 1.00000001, EXACT), false);
});

test('measurement identity depends on expected cells and precision, never actual mismatches', () => {
  const good = checkValues('x', 'series', [1, 2], [1, 2]);
  const bad = checkValues('x', 'series', [1, 2], [1, 9, 7]);
  const changed = checkValues('x', 'series', [1, 3], [1, 3]);
  const precision = checkValues('x', 'series', [1, 2], [1, 2], EXACT);
  assert.equal(good.measurementFingerprint, bad.measurementFingerprint);
  assert.notEqual(good.measurementFingerprint, changed.measurementFingerprint);
  assert.notEqual(good.measurementFingerprint, precision.measurementFingerprint);
});

test('trade report timestamps compare the recorded wall time across a DST fold', () => {
  const first = Date.parse('2024-11-03T08:00:00Z') / 1000;
  const second = Date.parse('2024-11-03T09:00:00Z') / 1000;
  const trade: Trade = {
    direction: 'long',
    entryId: 'entry',
    exitId: 'exit',
    entryComment: '',
    exitComment: '',
    quantity: 1,
    entryBar: 0,
    exitBar: 1,
    entryTime: first,
    exitTime: second,
    entryPrice: 1,
    exitPrice: 1,
    entryCommission: 0,
    commission: 0,
    profit: 0,
    maxRunup: 0,
    maxDrawdown: 0,
  };
  const expected = tradeRows([trade]);
  expected[0]['Date and time'] = first;
  const settings = {
    currency: 'USD',
    pointvalue: 1,
    initialCapital: 100,
    chartTimezone: 'America/Los_Angeles',
  };
  const time = (trades: Trade[]) =>
    compareTrades(expected, trades, settings).find((check) => check.id === 'trade/Date and time')!;
  assert.equal(time([trade]).status, 'match');
  assert.equal(time([{ ...trade, exitTime: second + 60 }]).status, 'mismatch');
  const utc = compareTrades(expected, [trade], { ...settings, chartTimezone: 'UTC' });
  assert.equal(utc.find((check) => check.id === 'trade/Date and time')!.status, 'mismatch');
});
