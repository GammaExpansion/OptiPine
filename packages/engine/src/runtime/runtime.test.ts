import assert from 'node:assert/strict';
import test from 'node:test';
import { run } from '../index.ts';
import type { RunInput } from '../types.ts';
import { decimal } from './format.ts';
import { arrayBuiltin } from './collections.ts';
import { Clock } from './time.ts';
import { state, technical, type TAContext } from './ta.ts';

const input: RunInput = {
  timeframe: '60',
  syminfo: { timezone: 'UTC', mintick: 0.01 },
  bars: [11, 17, 13, 19, 23].map((close, i) => ({
    time: 1_700_000_000 + i * 3600,
    open: 10,
    high: close + 1,
    low: 9,
    close,
    volume: 100,
  })),
};

function outputs(source: string, version = 6) {
  const result = run(`//@version=${version}\nindicator("synthetic")\n${source}`, input);
  assert.deepEqual(result.diagnostics, []);
  return result.plots.map((p) => p.values);
}

test('independent runs isolate persistent collections and builtin state', () => {
  const source =
    'var a = array.new_float(0)\narray.push(a, close)\nplot(array.sum(a))\nplot(ta.ema(close, 2))';
  const first = outputs(source);
  outputs('plot(ta.ema(close * 10, 3))');
  assert.deepEqual(outputs(source), first);
  assert.deepEqual(first[0], [11, 28, 41, 60, 83]);
});

test('nested expression history and function history remain independent', () => {
  const result = outputs(
    'f(x) =>\n    d = x - x[1]\n    d[1]\nplot(f(close))\nplot((close[1] + open)[1])',
  );
  assert.deepEqual(result, [
    [null, null, 6, -4, 6],
    [null, null, 21, 27, 23],
  ]);
});

test('time and historical time use milliseconds', () => {
  const result = outputs('plot(time)\nplot(time[1])\nplot(time - time[1])');
  assert.equal(result[0][0], input.bars[0].time * 1000);
  assert.deepEqual(result[1], [null, ...input.bars.slice(0, -1).map((b) => b.time * 1000)]);
  assert.deepEqual(result[2], [null, 3_600_000, 3_600_000, 3_600_000, 3_600_000]);
});

test('extra market-bar properties cannot override builtins or supply unsupported globals', () => {
  const extendedBars = input.bars.map((bar) => ({
    ...bar,
    'math.pi': 7,
    time_close: 99,
    'barstate.isconfirmed': false,
    timenow: 1234,
  }));
  const extendedInput: RunInput = { ...input, bars: extendedBars };
  const source = `//@version=6
indicator("market input boundary")
plot(math.pi)
plot(time_close)
plot(barstate.isconfirmed ? 1 : 0)
plot(close[1])
plot(time[1])`;
  const clean = run(source, input);
  assert.deepEqual(clean.diagnostics, []);
  assert.deepEqual(run(source, extendedInput), clean);
  assert.deepEqual(clean.plots[0].values, Array(input.bars.length).fill(Math.PI));
  assert.deepEqual(clean.plots[3].values, [
    null,
    ...input.bars.slice(0, -1).map((bar) => bar.close),
  ]);

  const unsupported = run(
    '//@version=6\nindicator("unsupported global")\nplot(timenow)',
    extendedInput,
  );
  assert.deepEqual(unsupported.plots, []);
  assert.equal(unsupported.diagnostics[0]?.kind, 'unsupported');
  assert.equal(unsupported.diagnostics[0]?.message, 'Unknown identifier timenow');
});

test('formatting rounds exact binary decimals using half-even ties', () => {
  assert.equal(decimal(2.355, '#.##'), '2.35');
  assert.equal(decimal(1.005, '0.00'), '1.00');
  assert.equal(decimal(2.5, '#'), '2');
  assert.equal(decimal(-3.5, '#'), '-4');
  assert.equal(decimal(12345.125, '#,###.00'), '12,345.12');
});

test('version-specific default number strings preserve observed precision', () => {
  assert.deepEqual(outputs('plot(str.length(str.tostring(0.1 + 0.2)))', 5)[0], Array(5).fill(19));
  assert.deepEqual(outputs('plot(str.length(str.tostring(0.1 + 0.2)))', 6)[0], Array(5).fill(3));
  for (const version of [5, 6]) {
    assert.deepEqual(
      outputs('plot(str.tostring(-0.0) == "0" ? 1 : 0)', version)[0],
      Array(5).fill(1),
    );
  }
});

test('negation treats missing booleans as false in v5', () => {
  assert.deepEqual(outputs('bool a = na\nplot(not a ? 1 : 0)', 5)[0], Array(5).fill(1));
});

test('extreme offsets prefer the oldest equal observation and rising requires consecutive gains', () => {
  assert.deepEqual(outputs('plot(ta.highestbars(open, 3))')[0], [null, null, -2, -2, -2]);
  assert.deepEqual(outputs('plot(ta.rising(close, 2) ? 1 : 0)')[0], [0, 0, 0, 0, 1]);
});

test('collection percentile rank compares the selected value with other elements', () => {
  assert.ok(Number.isNaN(Number(arrayBuiltin('percentrank', [[7], 0]))));
  assert.ok(Math.abs(Number(arrayBuiltin('percentrank', [[7, 1, 9, 7], 0])) - 200 / 3) < 1e-12);
  assert.equal(arrayBuiltin('binary_search_leftmost', [[4, 8], 2]), 0);
  assert.equal(arrayBuiltin('binary_search_rightmost', [[4, 8], 10]), 1);
});

test('Bollinger width is a percentage of the middle band', () => {
  const s = state();
  const ctx: TAContext = { bar: input.bars[0], vwapAnchor: true };
  technical('bbw', [8, 3, 2], s, ctx);
  technical('bbw', [10, 3, 2], s, ctx);
  assert.ok(Math.abs(Number(technical('bbw', [12, 3, 2], s, ctx)) - 40 * Math.sqrt(8 / 3)) < 1e-12);
});

test('explicit session timezone and start determine intraday alignment', () => {
  const clock = new Clock({
    ...input,
    bars: [{ ...input.bars[0], time: Date.UTC(2025, 4, 8, 10) / 1000 }],
  });
  assert.equal(clock.call('time', ['60', '0930-1600', 'UTC']), Date.UTC(2025, 4, 8, 9, 30));
  assert.ok(Number.isNaN(Number(clock.call('time', ['60', '1100-1200', 'UTC']))));
});

test('fill recalculations roll back ordinary state while preserving broker effects and varip', () => {
  const source = `//@version=6
strategy("rollback", calc_on_order_fills = true)
var int ordinary = 0
varip int intrabar = 0
var values = array.new_int(0)
varip retained = array.new_int(0)
ordinary += 1
intrabar += 1
array.push(values, ordinary)
array.push(retained, intrabar)
if bar_index == 0
    strategy.entry("buy", strategy.long)
if strategy.position_size > 0
    strategy.close_all()
plot(ordinary)
plot(intrabar)
plot(array.size(values))
plot(array.size(retained))
plot(ta.cum(close))`;
  const result = run(source, input);
  assert.deepEqual(result.diagnostics, []);
  assert.deepEqual(result.plots[0].values, [1, 2, 3, 4, 5]);
  assert.deepEqual(result.plots[1].values, [1, 4, 5, 6, 7]);
  assert.deepEqual(result.plots[2].values, [1, 2, 3, 4, 5]);
  assert.deepEqual(result.plots[3].values, [1, 4, 5, 6, 7]);
  assert.deepEqual(result.plots[4].values, [11, 28, 41, 60, 83]);
  assert.equal(result.trades.length, 1);
  assert.equal(result.trades[0].entryBar, 1);
  assert.equal(result.trades[0].exitBar, 1);
  assert.deepEqual(run(source, input), result);
});

test('a close-only strategy leaves an unconfirmed final bar unevaluated', () => {
  const result = run('//@version=6\nstrategy("close only")\nplot(bar_index)', {
    ...input,
    realtimeTail: true,
  });
  assert.deepEqual(result.diagnostics, []);
  assert.deepEqual(result.plots[0].values, [0, 1, 2, 3, null]);
});

test('fill settings without an implementation report unsupported instead of standard fills', () => {
  const strategy = (args: string) => `//@version=6
strategy("fill settings"${args})
if bar_index == 1
    strategy.entry("buy", strategy.long, limit = 12)
plot(bar_index)`;
  const refused = (source: string, settings?: Record<string, unknown>) => {
    const result = run(source, settings ? { ...input, settings } : input);
    assert.equal(result.diagnostics[0]?.kind, 'unsupported');
    assert.deepEqual(result.trades, []);
    return result.diagnostics[0].message;
  };
  assert.match(refused(strategy(', use_bar_magnifier = true')), /Bar magnifier/);
  assert.match(refused(strategy(''), { use_bar_magnifier: true }), /Bar magnifier/);

  const standard = run(
    strategy(', use_bar_magnifier = false, backtest_fill_limits_assumption = 0'),
    input,
  );
  assert.deepEqual(standard.diagnostics, []);
  assert.deepEqual(standard, run(strategy(''), input));
  assert.deepEqual(
    run(strategy(', use_bar_magnifier = true'), {
      ...input,
      settings: { use_bar_magnifier: false },
    }),
    standard,
  );
});

test('a pending strategy close preserves final-bar fills and valuation without a close calculation', () => {
  const source = `//@version=6
strategy("pending close", margin_long=0, margin_short=0)
if bar_index == 3
    strategy.entry("buy", strategy.long)
plot(bar_index)
plot(last_bar_index)`;
  const pending = run(source, { ...input, strategyClosePending: true });
  assert.deepEqual(pending.diagnostics, []);
  assert.deepEqual(pending.plots[0].values, [0, 1, 2, 3, null]);
  assert.deepEqual(pending.plots[1].values, [4, 4, 4, 4, null]);
  assert.equal(pending.trades.length, 1);
  assert.equal(pending.trades[0].entryBar, 4);
  assert.equal(pending.trades[0].profit, 13);
  const complete = run(source, { ...input, strategyClosePending: false });
  assert.deepEqual(complete.plots[0].values, [0, 1, 2, 3, 4]);
  assert.deepEqual(pending.trades, complete.trades);
  assert.deepEqual(pending.metrics, complete.metrics);
});

test('a strategy-close schedule does not select indicator bar states', () => {
  const source = '//@version=6\nindicator("states")\nplot(barstate.ishistory ? 1 : 0)';
  assert.deepEqual(run(source, { ...input, strategyClosePending: true }), run(source, input));
  assert.equal(
    new Clock({ ...input, strategyClosePending: true }).get('barstate.isrealtime', 6),
    false,
  );
});

test('pending strategy closes report unimplemented bar states and extra calculation modes', () => {
  const uninitialized = run(
    '//@version=6\nstrategy("single bar", initial_capital=123, calc_on_every_tick=true)\nplot(close)',
    {
      ...input,
      bars: input.bars.slice(0, 1),
      strategyClosePending: true,
    },
  );
  assert.equal(uninitialized.diagnostics[0]?.kind, 'unsupported');
  assert.match(uninitialized.diagnostics[0].message, /initialization bar/);
  for (const state of [
    'isconfirmed',
    'ishistory',
    'isrealtime',
    'isnew',
    'islastconfirmedhistory',
  ]) {
    const result = run(
      `//@version=6\nstrategy("pending states")\nplot(barstate.${state} ? 1 : 0)`,
      {
        ...input,
        strategyClosePending: true,
      },
    );
    assert.equal(result.diagnostics[0]?.kind, 'unsupported', state);
    assert.match(result.diagnostics[0].message, /Bar states/);
  }
  for (const setting of ['calc_on_every_tick', 'calc_on_order_fills', 'process_orders_on_close']) {
    const result = run(
      `//@version=6\nstrategy("extra calculations", ${setting}=true)\nplot(close)`,
      {
        ...input,
        strategyClosePending: true,
      },
    );
    assert.equal(result.diagnostics[0]?.kind, 'unsupported', setting);
    assert.match(result.diagnostics[0].message, /extra recalculation/);
  }
});

test('the first strategy declaration enables callbacks for process-on-close orders', () => {
  const result = run(
    `//@version=6
strategy("initial callback", calc_on_order_fills = true, process_orders_on_close = true)
varip int calls = 0
calls += 1
if bar_index == 0 and strategy.position_size == 0
    strategy.entry("first", strategy.long)
plot(calls)`,
    input,
  );
  assert.deepEqual(result.diagnostics, []);
  assert.equal(result.plots[0].values[0], 2);
});
