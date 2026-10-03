import assert from 'node:assert/strict';
import test from 'node:test';
import { Calendar } from '@pine/engine/calendar';
import { importCalendarChart } from './calendar-import.ts';

const columns = [
  'session_open',
  'session_close',
  'session_trading_day',
  'calendar_week_open',
  'calendar_week_close',
  'calendar_month_open',
  'calendar_month_close',
];
const ms = (date: string): number => Date.parse(date);
function csv(rows: number[][]): string {
  return [
    ['unrelated_plot', ...columns, 'close'].join(','),
    ...rows.map((row) => ['ignored', ...row, 999].join(',')),
  ].join('\n');
}

test('independent calendar fields retain partial periods and exchange DST boundaries', () => {
  const week = [ms('2025-03-03T14:30:00Z'), ms('2025-03-07T21:00:00Z')];
  const nextWeek = [ms('2025-03-10T13:30:00Z'), ms('2025-03-14T20:00:00Z')];
  const month = [ms('2025-03-03T14:30:00Z'), ms('2025-03-31T20:00:00Z')];
  const text = csv([
    [ms('2025-03-07T14:30:00Z'), ms('2025-03-07T21:00:00Z'), ms('2025-03-07'), ...week, ...month],
    [
      ms('2025-03-10T13:30:00Z'),
      ms('2025-03-10T20:00:00Z'),
      ms('2025-03-10'),
      ...nextWeek,
      ...month,
    ],
  ]);
  const result = importCalendarChart(text, 'America/New_York');
  assert.equal(result.from, ms('2025-03-07T14:30:00Z') / 1000);
  assert.equal(result.to, ms('2025-03-11T04:00:00Z') / 1000);
  assert.deepEqual(result.periods?.['1W'][0], {
    from: ms('2025-03-03T05:00:00Z') / 1000,
    to: ms('2025-03-10T04:00:00Z') / 1000,
    open: week[0] / 1000,
    close: week[1] / 1000,
  });
  assert.equal(result.periods?.['1M'][0].from, ms('2025-03-01T05:00:00Z') / 1000);
  assert.equal(result.periods?.['1M'][0].to, ms('2025-04-01T04:00:00Z') / 1000);
  const calendar = new Calendar(result);
  assert.equal(calendar.at(ms('2025-03-08T12:00:00Z') / 1000), null);
  assert.equal(calendar.periodAt('W', ms('2025-03-08T12:00:00Z') / 1000)?.open, week[0] / 1000);
  assert.equal(calendar.at(result.to), undefined);
});

test('calendar import rejects missing fields and inconsistent observations', () => {
  assert.throws(() => importCalendarChart('time,close\n1,2', 'UTC'), /session_open/);
  const row = [
    ms('2025-02-12T09:00:00Z'),
    ms('2025-02-12T17:00:00Z'),
    ms('2025-02-12'),
    ms('2025-02-10T09:00:00Z'),
    ms('2025-02-14T17:00:00Z'),
    ms('2025-02-03T09:00:00Z'),
    ms('2025-02-28T17:00:00Z'),
  ];
  const second = [...row];
  second[0] += 86400000;
  second[1] += 86400000;
  second[2] += 86400000;
  second[3] += 3600000;
  assert.throws(() => importCalendarChart(csv([row, second]), 'UTC'), /disagrees/);
});
