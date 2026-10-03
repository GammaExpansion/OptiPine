import assert from 'node:assert/strict';
import test from 'node:test';
import { Calendar } from './calendar.ts';
import { Clock } from './runtime/time.ts';
import { run } from './index.ts';
import type { SessionCalendar } from './types.ts';

const schedule: SessionCalendar = {
  from: 100,
  to: 500,
  sessions: [
    { open: 120, close: 180, tradingDay: '2025-01-07' },
    { open: 200, close: 220, tradingDay: '2025-01-08' },
    { open: 450, close: 550, tradingDay: '2025-01-10' },
  ],
};

test('calendar gaps and session endpoints differ from missing coverage', () => {
  const calendar = new Calendar(schedule);
  assert.equal(calendar.at(99), undefined);
  assert.equal(calendar.at(100), null);
  assert.deepEqual(calendar.at(120), schedule.sessions[0]);
  assert.deepEqual(calendar.at(179), schedule.sessions[0]);
  assert.equal(calendar.at(180), null);
  assert.equal(calendar.at(219)?.close, 220);
  assert.equal(calendar.at(220), null);
  assert.equal(calendar.at(400), null);
  assert.equal(calendar.at(499)?.close, 550);
  assert.equal(calendar.at(500), undefined);
  assert.equal(new Calendar().at(120), undefined);
  assert.equal(new Calendar({ ...schedule, sessions: [] }).at(120), null);
});

test('the exchange trading date is retained and input mutation cannot alter a run', () => {
  const session = { open: 120, close: 180, tradingDay: '2025-02-12' };
  const calendar = new Calendar({ from: 100, to: 200, sessions: [session] });
  session.open = 170;
  session.tradingDay = '2025-02-13';
  assert.equal(calendar.at(125)?.tradingDay, '2025-02-12');
});

test('overlaps, reversed coverage and invalid trading dates are rejected', () => {
  assert.throws(() => new Calendar({ ...schedule, from: 500 }), /coverage/);
  assert.throws(
    () =>
      new Calendar({
        ...schedule,
        sessions: [schedule.sessions[0], { open: 170, close: 190, tradingDay: '2025-01-07' }],
      }),
    /nonoverlapping/,
  );
  assert.throws(
    () =>
      new Calendar({
        ...schedule,
        sessions: [{ open: 170, close: 190, tradingDay: '2025-02-30' }],
      }),
    /trading date/,
  );
  const result = run('//@version=6\nindicator("synthetic")\nplot(close)', {
    bars: [],
    timeframe: '60',
    syminfo: { timezone: 'UTC' },
    sessionCalendar: { ...schedule, from: 500 },
  });
  assert.equal(result.diagnostics[0]?.kind, 'runtime');
  assert.match(result.diagnostics[0]?.message ?? '', /coverage/);
});

test('shortened sessions govern implicit time calls while chart and explicit sessions stay distinct', () => {
  const date = Date.UTC(2025, 1, 12) / 1000;
  const clock = new Clock({
    timeframe: '60',
    syminfo: { timezone: 'UTC', session_hours: '0900-1700' },
    bars: [date + 11 * 3600, date + 12 * 3600, date + 16 * 3600 + 1800].map((time) => ({
      time,
      open: 10,
      high: 11,
      low: 9,
      close: 10,
      volume: 10,
    })),
    sessionCalendar: {
      from: date,
      to: date + 86400,
      sessions: [
        { open: date + 9 * 3600, close: date + 11 * 3600 + 1800, tradingDay: '2025-02-12' },
      ],
    },
  });
  assert.equal(clock.get('time_close', 6), (date + 11 * 3600 + 1800) * 1000);
  assert.equal(clock.get('session.islastbar', 6), true);
  assert.equal(clock.call('time', ['D']), (date + 9 * 3600) * 1000);
  assert.equal(clock.call('time_close', ['D']), (date + 11 * 3600 + 1800) * 1000);
  clock.setIndex(1);
  assert.equal(clock.get('time_close', 6), (date + 13 * 3600) * 1000);
  assert.equal(clock.get('session.ismarket', 6), true);
  assert.equal(clock.get('session.islastbar', 6), false);
  assert.ok(Number.isNaN(clock.get('time_tradingday', 6)));
  assert.ok(Number.isNaN(clock.call('time', ['60'])));
  assert.ok(Number.isNaN(clock.call('time', ['D'])));
  assert.equal(clock.call('time', ['60', '0900-1700', 'UTC']), (date + 12 * 3600) * 1000);
  clock.setIndex(2);
  assert.equal(clock.get('time_close', 6), (date + 17 * 3600 + 1800) * 1000);
});

test('overnight trading dates come from the independent session assignment', () => {
  const date = Date.UTC(2025, 1, 12) / 1000;
  const clock = new Clock({
    timeframe: '60',
    syminfo: { timezone: 'UTC', session_hours: '1800-1700' },
    bars: [{ time: date + 20 * 3600, open: 10, high: 11, low: 9, close: 10, volume: 10 }],
    sessionCalendar: {
      from: date,
      to: date + 86400 * 2,
      sessions: [
        { open: date + 18 * 3600, close: date + 86400 + 17 * 3600, tradingDay: '2025-02-13' },
      ],
    },
  });
  assert.equal(clock.get('time_tradingday', 6), (date + 86400) * 1000);
  assert.equal(clock.call('time', ['D']), (date + 18 * 3600) * 1000);
});

test('timeframe change requires both observed timestamps across a nontrading gap', () => {
  const date = Date.UTC(2025, 1, 12) / 1000;
  const clock = new Clock({
    timeframe: '60',
    syminfo: { timezone: 'UTC', session_hours: '0900-1700' },
    bars: [
      date + 10 * 3600,
      date + 12 * 3600,
      date + 86400 + 9 * 3600,
      date + 86400 * 2 + 9 * 3600,
    ].map((time) => ({ time, open: 10, high: 11, low: 9, close: 10, volume: 10 })),
    sessionCalendar: {
      from: date,
      to: date + 86400 * 3,
      sessions: [
        { open: date + 9 * 3600, close: date + 11 * 3600, tradingDay: '2025-02-12' },
        {
          open: date + 86400 + 9 * 3600,
          close: date + 86400 + 17 * 3600,
          tradingDay: '2025-02-13',
        },
        {
          open: date + 86400 * 2 + 9 * 3600,
          close: date + 86400 * 2 + 17 * 3600,
          tradingDay: '2025-02-14',
        },
      ],
    },
  });
  assert.equal(clock.call('timeframe.change', ['D']), false);
  clock.setIndex(1);
  assert.equal(clock.call('timeframe.change', ['D']), false);
  clock.setIndex(2);
  assert.equal(clock.call('timeframe.change', ['D']), false);
  clock.setIndex(3);
  assert.equal(clock.call('timeframe.change', ['D']), true);
});

test('higher-timeframe coverage retains independent provider anchors across closed sessions', () => {
  const monday = Date.UTC(2025, 1, 10) / 1000;
  const week = 7 * 86400;
  const session = {
    open: monday + 86400 + 9 * 3600,
    close: monday + 86400 + 17 * 3600,
    tradingDay: '2025-02-11',
  };
  const firstWeek = {
    from: monday,
    to: monday + week,
    open: session.open,
    close: monday + 4 * 86400 + 17 * 3600,
  };
  const secondWeek = {
    from: monday + week,
    to: monday + week * 2,
    open: monday + week + 9 * 3600,
    close: monday + week + 4 * 86400 + 17 * 3600,
  };
  const input = {
    timeframe: '60',
    syminfo: { timezone: 'UTC', session_hours: '0900-1700' },
    bars: [monday + 86400 + 18 * 3600, monday + week + 10 * 3600].map((time) => ({
      time,
      open: 10,
      high: 11,
      low: 9,
      close: 10,
      volume: 10,
    })),
    sessionCalendar: {
      from: monday,
      to: monday + 3 * week,
      sessions: [session],
      periods: { '1W': [firstWeek, secondWeek] },
    },
  };
  const calendar = new Calendar(input.sessionCalendar);
  assert.equal(calendar.at(input.bars[0].time), null);
  assert.deepEqual(calendar.periodAt('W', input.bars[0].time), firstWeek);
  assert.deepEqual(calendar.periodAt('1W', input.bars[0].time), firstWeek);
  assert.equal(calendar.periodAt('1W', monday + week * 2), null);
  assert.equal(calendar.periodAt('1W', monday + week * 3), undefined);
  assert.equal(calendar.periodAt('1M', input.bars[0].time), undefined);
  const clock = new Clock(input);
  assert.equal(
    new Clock({ ...input, timeframe: 'W' }).get('time_close', 6),
    firstWeek.close * 1000,
  );
  assert.ok(Number.isNaN(clock.call('time', ['D'])));
  assert.equal(clock.call('time', ['W']), firstWeek.open * 1000);
  assert.equal(clock.call('time_close', ['W']), firstWeek.close * 1000);
  clock.setIndex(1);
  assert.equal(clock.call('timeframe.change', ['W']), true);
  assert.throws(
    () => new Calendar({ ...input.sessionCalendar, periods: { W: [firstWeek] } }),
    /canonical timeframe/,
  );
  assert.throws(
    () => new Calendar({ ...input.sessionCalendar, periods: { '1W': [firstWeek, firstWeek] } }),
    /nonoverlapping/,
  );
});

test('observed higher-timeframe intervals retain their full bounds beyond daily coverage', () => {
  const monday = Date.UTC(2025, 1, 10) / 1000;
  const day = 86400;
  const week = {
    from: monday,
    to: monday + 7 * day,
    open: monday + day + 9 * 3600,
    close: monday + 4 * day + 17 * 3600,
  };
  const schedule = {
    from: week.open,
    to: monday + 2 * day,
    sessions: [{ open: week.open, close: monday + day + 17 * 3600, tradingDay: '2025-02-11' }],
    periods: { '1W': [week] },
  };
  const calendar = new Calendar(schedule);
  const thursday = monday + 3 * day + 10 * 3600;
  const thursdayOpen = monday + 3 * day + 9 * 3600;
  assert.equal(calendar.at(thursday), undefined);
  assert.deepEqual(calendar.periodAt('W', monday), week);
  assert.deepEqual(calendar.periodAt('W', thursday), week);
  assert.equal(calendar.periodAt('W', monday - 1), undefined);
  assert.equal(calendar.periodAt('W', week.to), undefined);
  const clock = new Clock({
    timeframe: 'D',
    syminfo: { timezone: 'UTC', session_hours: '0900-1700' },
    bars: [{ time: thursday, open: 10, high: 11, low: 9, close: 10, volume: 10 }],
    sessionCalendar: schedule,
  });
  assert.equal(clock.call('time', ['W']), week.open * 1000);
  assert.equal(clock.call('time_close', ['W']), week.close * 1000);
  assert.equal(clock.call('time', ['D']), thursdayOpen * 1000);
});
