import assert from 'node:assert/strict';
import test from 'node:test';
import { run } from '../index.ts';
import type { MarketBar, RunInput } from '../types.ts';

const day = 86400;
const hour = 3600;
const date = Date.UTC(2025, 1, 12) / 1000;
const bars = (times: readonly number[]): MarketBar[] =>
  times.map((time, index) => ({
    time,
    open: (index + 1) * 10,
    high: (index + 1) * 10 + 3,
    low: (index + 1) * 10,
    close: (index + 1) * 10,
    volume: index + 1,
  }));

const transitionInput: RunInput = {
  timeframe: '60',
  syminfo: { timezone: 'UTC', session_hours: '0900-1700' },
  bars: bars(
    [
      9 * hour,
      10 * hour,
      11 * hour,
      12 * hour,
      day + 9 * hour,
      day + 10 * hour,
      2 * day + 9 * hour,
    ].map((offset) => date + offset),
  ),
  sessionCalendar: {
    from: date,
    to: date + 3 * day,
    sessions: [
      { open: date + 9 * hour, close: date + 11 * hour, tradingDay: '2025-02-12' },
      { open: date + day + 9 * hour, close: date + day + 17 * hour, tradingDay: '2025-02-13' },
      {
        open: date + 2 * day + 9 * hour,
        close: date + 2 * day + 17 * hour,
        tradingDay: '2025-02-14',
      },
    ],
  },
};

test('automatic VWAP follows daily timestamp transitions while explicit anchors remain independent', () => {
  for (const version of [5, 6]) {
    const result = run(
      `//@version=${version}
indicator("weighted session transitions")
plot(ta.vwap(close))
plot(ta.vwap)
plot(ta.vwap(close, session.isfirstbar))
plot(ta.vwap(close, barstate.isfirst or timeframe.change("D")))
plot(ta.vwap(close, false))
plot(session.isfirstbar ? 1 : 0)
plot(timeframe.change("D") ? 1 : 0)`,
      transitionInput,
    );
    assert.deepEqual(result.diagnostics, []);
    assert.deepEqual(
      result.plots.map((plot) => plot.values),
      [
        [10, 50 / 3, 70 / 3, 40, 50, 610 / 11, 70],
        [11, 53 / 3, 73 / 3, 41, 51, 621 / 11, 71],
        [10, 50 / 3, 70 / 3, 30, 50, 610 / 11, 70],
        [10, 50 / 3, 70 / 3, 30, 550 / 15, 910 / 21, 70],
        Array(7).fill(null),
        [1, 0, 0, 0, 1, 0, 1],
        [0, 0, 0, 0, 0, 0, 1],
      ],
    );
  }
});

test('explicit three-result VWAP waits for its anchor and carries across automatic reset points', () => {
  const result = run(
    `//@version=6
indicator("explicit VWAP")
[mid, upper, lower] = ta.vwap(close, bar_index == 1, 1)
plot(mid)
plot(upper)
plot(lower)`,
    transitionInput,
  );
  assert.deepEqual(result.diagnostics, []);
  assert.deepEqual(result.plots[0].values, [null, 20, 26, 290 / 9, 540 / 14, 900 / 20, 1390 / 27]);
  assert.equal(result.plots[1].values[1], 20);
  assert.equal(result.plots[2].values[1], 20);
  assert.equal(result.plots[1].values[2], 26 + Math.sqrt(24));
  assert.equal(result.plots[2].values[2], 26 - Math.sqrt(24));
});

test('automatic VWAP initializes mid-session or inside a known gap and falls back outside calendar coverage', () => {
  for (const start of [1, 2]) {
    const result = run('//@version=6\nindicator("initial observation")\nplot(ta.vwap(close))', {
      ...transitionInput,
      bars: transitionInput.bars.slice(start),
    });
    assert.deepEqual(result.diagnostics, []);
    assert.equal(result.plots[0].values[0], transitionInput.bars[start].close);
    if (start === 2) assert.equal(result.plots[0].values[1], 40);
  }
  for (const sessionCalendar of [undefined, { from: date - day, to: date, sessions: [] }]) {
    const result = run('//@version=6\nindicator("calendar fallback")\nplot(ta.vwap(close))', {
      ...transitionInput,
      sessionCalendar,
    });
    assert.deepEqual(result.diagnostics, []);
    assert.deepEqual(result.plots[0].values, [10, 50 / 3, 70 / 3, 30, 50, 610 / 11, 70]);
  }
});

test('automatic VWAP retains one observed overnight session across civil midnight', () => {
  const result = run('//@version=6\nindicator("overnight session")\nplot(ta.vwap(close))', {
    timeframe: '60',
    syminfo: { timezone: 'UTC', session_hours: '1800-1700' },
    bars: bars([date + 23 * hour, date + day, date + day + 18 * hour]),
    sessionCalendar: {
      from: date,
      to: date + 3 * day,
      sessions: [
        { open: date + 18 * hour, close: date + day + 17 * hour, tradingDay: '2025-02-13' },
        {
          open: date + day + 18 * hour,
          close: date + 2 * day + 17 * hour,
          tradingDay: '2025-02-14',
        },
      ],
    },
  });
  assert.deepEqual(result.diagnostics, []);
  assert.deepEqual(result.plots[0].values, [10, 50 / 3, 30]);
});
