import assert from 'node:assert/strict';
import test from 'node:test';
import { run } from '../index.ts';
import type { RunInput, SessionCalendar } from '../types.ts';

const start = Date.parse('2025-01-06T00:00:00Z') / 1000;
const at = (hour: number) => start + hour * 3600;

function tradeEachBar(version: 5 | 6, hours: number[], sessionCalendar?: SessionCalendar) {
  const input: RunInput = {
    bars: hours.map((hour) => ({
      time: at(hour),
      open: 100,
      high: 101,
      low: 99,
      close: 100,
      volume: 10,
    })),
    syminfo: { timezone: 'UTC', mintick: 0.01, mincontract: 1 },
    timeframe: '60',
    sessionCalendar,
  };
  const result = run(
    `//@version=${version}
strategy("Daily fill limit", default_qty_type=strategy.fixed, default_qty_value=1, margin_long=0, margin_short=0)
strategy.risk.max_intraday_filled_orders(2)
if strategy.position_size == 0
    strategy.entry("buy", strategy.long)
else
    strategy.close_all()
plot(strategy.position_size, "position")
plot(strategy.closedtrades, "closed")
`,
    input,
  );
  assert.deepEqual(result.diagnostics, []);
  return Object.fromEntries(result.plots.map((plot) => [plot.title, plot.values]));
}

for (const version of [5, 6] as const) {
  test(`v${version}: missing daily time releases the fill limit and the next session carries it`, () => {
    const calendar: SessionCalendar = {
      from: at(0),
      to: at(72),
      sessions: [
        { open: at(0), close: at(3), tradingDay: '2025-01-06' },
        { open: at(24), close: at(26), tradingDay: '2025-01-07' },
        { open: at(48), close: at(51), tradingDay: '2025-01-08' },
      ],
    };
    // Two fills exhaust the first session. The two outside-session bars allow a
    // new entry; its exit exhausts the next session, which must stay halted.
    // A subsequent valid-to-valid daily transition releases that halt.
    const plots = tradeEachBar(version, [0, 1, 2, 3, 4, 24, 25, 48, 49, 50], calendar);
    assert.deepEqual(plots.position, [0, 1, 0, 0, 1, 0, 0, 0, 1, 0]);
    assert.deepEqual(plots.closed, [0, 0, 1, 1, 1, 2, 2, 2, 2, 3]);
  });

  test(`v${version}: a supplied trading session keeps its fill limit across civil midnight`, () => {
    const calendar: SessionCalendar = {
      from: at(0),
      to: at(72),
      sessions: [
        { open: at(21), close: at(27), tradingDay: '2025-01-07' },
        { open: at(45), close: at(51), tradingDay: '2025-01-08' },
      ],
    };
    const plots = tradeEachBar(version, [21, 22, 23, 24, 25, 45, 46, 47], calendar);
    assert.deepEqual(plots.position, [0, 1, 0, 0, 0, 0, 1, 0]);
    assert.deepEqual(plots.closed, [0, 0, 1, 1, 1, 1, 1, 2]);
  });

  test(`v${version}: absent calendar coverage preserves civil daily limits`, () => {
    const outsideCoverage: SessionCalendar = { from: at(10), to: at(20), sessions: [] };
    for (const calendar of [undefined, outsideCoverage]) {
      const plots = tradeEachBar(version, [0, 1, 2, 3, 24, 25, 26], calendar);
      assert.deepEqual(plots.position, [0, 1, 0, 0, 0, 1, 0]);
      assert.deepEqual(plots.closed, [0, 0, 1, 1, 1, 1, 2]);
    }
  });
}
