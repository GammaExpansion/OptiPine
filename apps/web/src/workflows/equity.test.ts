import assert from 'node:assert/strict';
import test from 'node:test';
import { runWithEquity } from '@pine/engine';
import { equitySummary, localDates } from './equity.ts';
import { strategySource, syntheticBars } from './test-support.ts';

const DAY = 86_400;
const utc = (year: number, month: number, day: number, hour = 0, minute = 0) =>
  Date.UTC(year, month - 1, day, hour, minute) / 1000;
const daily = (count: number, start = utc(2024, 1, 1)) =>
  Array.from({ length: count }, (_, index) => start + index * DAY);

test('key figures, the max drawdown and its recovery from bar-close equity (B5)', () => {
  const equity = [1010, 1020, 1000, 990, 1015, 1020, 1030, 1025, 1040, 1035];
  const times = daily(10);
  const summary = equitySummary({ equity, times, initialCapital: 1000, timezone: 'Etc/UTC' })!;
  assert.equal(summary.endingEquity, 1035);
  assert.equal(summary.totalReturn, 3.5);
  assert.equal(summary.years, 9 / 365);
  assert.equal(summary.annualizedReturn, (1.035 ** (365 / 9) - 1) * 100);
  assert.deepEqual(summary.maxDrawdown, {
    amount: 30,
    percent: 3000 / 1020,
    peak: { time: times[1], equity: 1020 },
    trough: { time: times[3], equity: 990 },
    recovery: { time: times[5], equity: 1020 },
    durationDays: 4,
  });
  assert.equal(summary.returnOverMaxDrawdown, 35 / 30);
  assert.deepEqual(summary.drawdown, [0, 0, -20, -30, -5, 0, 0, -5, 0, -5]);
  assert.equal(summary.drawdownPercent[3], -3000 / 1020);
  assert.deepEqual(
    summary.days.map((day) => day.pnl),
    [10, 10, -20, -10, 25, 5, 10, -5, 15, -5],
  );
  assert.deepEqual(summary.days[0], { date: '2024-01-01', weekday: 1, pnl: 10, percent: 1 });
  assert.equal(summary.days[2].percent, -2000 / 1020);
  assert.equal(summary.winningDays, 6);
  assert.equal(summary.losingDays, 4);
  assert.equal(summary.bestDay?.date, '2024-01-05');
  assert.equal(summary.worstDay?.date, '2024-01-03');
  assert.deepEqual(summary.months, [{ period: '2024-01', pnl: 35, percent: 3.5 }]);
  assert.deepEqual(summary.yearly, [{ period: '2024', pnl: 35, percent: 3.5 }]);
});

test('a drawdown still open lasts to the last bar; a first-bar loss starts at the capital', () => {
  const times = daily(5);
  const open = equitySummary({
    equity: [1100, 1050, 1080, 1000, 1090],
    times,
    initialCapital: 1000,
    timezone: 'Etc/UTC',
  })!;
  assert.equal(open.maxDrawdown?.recovery, null);
  assert.equal(open.maxDrawdown?.amount, 100);
  assert.equal(open.maxDrawdown?.durationDays, 4);
  const firstBar = equitySummary({
    equity: [950, 980, 1001],
    times: daily(3),
    initialCapital: 1000,
    timezone: 'Etc/UTC',
  })!;
  assert.deepEqual(firstBar.maxDrawdown?.peak, { time: times[0], equity: 1000 });
  assert.deepEqual(firstBar.maxDrawdown?.recovery, { time: times[2], equity: 1001 });
  // A flat stretch at the high moves the peak forward instead of lengthening the drawdown.
  const flat = equitySummary({
    equity: [1000, 1000, 1000, 990],
    times: daily(4),
    initialCapital: 1000,
    timezone: 'Etc/UTC',
  })!;
  assert.equal(flat.maxDrawdown?.peak.time, times[2]);
  const rising = equitySummary({
    equity: [1001, 1002],
    times: daily(2),
    initialCapital: 1000,
    timezone: 'Etc/UTC',
  })!;
  assert.equal(rising.maxDrawdown, null);
  assert.equal(rising.returnOverMaxDrawdown, null);
  assert.equal(
    equitySummary({ equity: [], times: [], initialCapital: 1000, timezone: 'Etc/UTC' }),
    null,
  );
  assert.equal(
    equitySummary({ equity: [1], times: [], initialCapital: 1000, timezone: 'Etc/UTC' }),
    null,
  );
});

test('trading days follow the symbol time zone, across DST and half-hour offsets', () => {
  // New York: 04:00 UTC is midnight in summer (EDT), 05:00 UTC in winter (EST).
  const newYork = [
    utc(2024, 3, 9, 4),
    utc(2024, 3, 9, 5),
    utc(2024, 3, 10, 6),
    utc(2024, 3, 10, 7),
    utc(2024, 3, 11, 3),
    utc(2024, 3, 11, 4),
    utc(2024, 11, 3, 3),
    utc(2024, 11, 3, 4),
    utc(2024, 11, 4, 4),
    utc(2024, 11, 4, 5),
  ];
  assert.deepEqual(localDates(newYork, 'America/New_York'), [
    '2024-03-08',
    '2024-03-09',
    '2024-03-10',
    '2024-03-10',
    '2024-03-10',
    '2024-03-11',
    '2024-11-02',
    '2024-11-03',
    '2024-11-03',
    '2024-11-04',
  ]);
  const kolkata = [utc(2024, 6, 1, 18), utc(2024, 6, 1, 18, 30)];
  assert.deepEqual(localDates(kolkata, 'Asia/Kolkata'), ['2024-06-01', '2024-06-02']);
  // Havana changes its clocks at midnight: on 10 March 2024 the day starts at 01:00.
  const havana = Array.from({ length: 8 }, (_, index) => utc(2024, 3, 10, 2 + index));
  assert.deepEqual(localDates(havana, 'America/Havana'), [
    '2024-03-09',
    '2024-03-09',
    '2024-03-09',
    '2024-03-10',
    '2024-03-10',
    '2024-03-10',
    '2024-03-10',
    '2024-03-10',
  ]);
});

test('daily and monthly P&L use the time zone, with gaps left empty', () => {
  // Bars of a New York session: the 20:00 UTC bar on Friday belongs to Friday, and the next
  // bar is on Monday. In UTC the late bars would fall on the next day.
  const times = [
    utc(2024, 1, 26, 15),
    utc(2024, 1, 27, 0, 30),
    utc(2024, 1, 29, 15),
    utc(2024, 3, 1, 15),
  ];
  const summary = equitySummary({
    equity: [1010, 1030, 1020, 1050],
    times,
    initialCapital: 1000,
    timezone: 'America/New_York',
  })!;
  assert.deepEqual(
    summary.days.slice(0, 4).map((day) => [day.date, day.weekday, day.pnl]),
    [
      ['2024-01-26', 5, 30],
      ['2024-01-27', 6, null],
      ['2024-01-28', 7, null],
      ['2024-01-29', 1, -10],
    ],
  );
  assert.equal(summary.days.length, 36);
  assert.equal(summary.days.at(-1)?.date, '2024-03-01');
  assert.deepEqual(summary.months, [
    { period: '2024-01', pnl: 20, percent: 2 },
    { period: '2024-02', pnl: null, percent: null },
    { period: '2024-03', pnl: 30, percent: 3000 / 1020 },
  ]);
  const inUtc = equitySummary({
    equity: [1010, 1030, 1020, 1050],
    times,
    initialCapital: 1000,
    timezone: 'Etc/UTC',
  })!;
  assert.deepEqual(
    inUtc.days.slice(0, 2).map((day) => [day.date, day.pnl]),
    [
      ['2024-01-26', 10],
      ['2024-01-27', 20],
    ],
  );
});

test('the summary of a real run adds up to its ending equity', () => {
  const bars = syntheticBars(300);
  const result = runWithEquity(strategySource, {
    bars,
    syminfo: { mintick: 0.01, mincontract: 0.001, timezone: 'Asia/Tokyo' },
    timeframe: '60',
  });
  const summary = equitySummary({
    equity: result.equity,
    times: bars.map((bar) => bar.time),
    initialCapital: 10000,
    timezone: 'Asia/Tokyo',
  })!;
  assert.equal(summary.endingEquity, result.equity.at(-1));
  assert.equal(summary.drawdown.length, bars.length);
  assert.equal(summary.days[0].date, '2024-01-01');
  // Tokyo is nine hours ahead: the last bar, 11:00 UTC on 13 January, is 20:00 there.
  assert.equal(summary.days.at(-1)?.date, '2024-01-13');
  const total = (values: (number | null)[]) =>
    values.reduce<number>((sum, value) => sum + (value ?? 0), 0);
  const net = summary.endingEquity - 10000;
  assert.ok(Math.abs(total(summary.days.map((day) => day.pnl)) - net) < 1e-6);
  assert.ok(Math.abs(total(summary.months.map((month) => month.pnl)) - net) < 1e-6);
  assert.ok(summary.maxDrawdown && summary.maxDrawdown.amount > 0);
  assert.ok(Math.min(...summary.drawdown) === -summary.maxDrawdown.amount);
});
