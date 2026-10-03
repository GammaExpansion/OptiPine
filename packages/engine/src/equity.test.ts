import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import test from 'node:test';
import { run, runWithEquity, sweep } from './index.ts';
import type { RunInput } from './types.ts';

const input: RunInput = {
  timeframe: '60',
  syminfo: { timezone: 'UTC', type: 'crypto', mintick: 0.01, mincontract: 1 },
  bars: [100, 110, 90].map((close, i) => ({
    time: 1_700_000_000 + i * 3600,
    open: close,
    high: close + 1,
    low: close - 1,
    close,
    volume: 100,
  })),
};
const source = `//@version=6
strategy("Close equity", initial_capital=1000, default_qty_value=1, process_orders_on_close=true, commission_type=strategy.commission.cash_per_order, commission_value=1)
if bar_index == 0 and strategy.position_size == 0
    strategy.entry("L", strategy.long)
if bar_index == 2 and strategy.position_size > 0
    strategy.close("L")
plot(strategy.equity, "Before close fills")`;

test('opt-in equity samples after close fills and commissions without altering run or sweep', () => {
  const enriched = runWithEquity(source, input);
  assert.deepEqual(enriched.diagnostics, []);
  assert.deepEqual(enriched.equity, [999, 1009, 988]);
  assert.equal(enriched.plots[0].values[0], 1000);
  const { equity: _, ...ordinary } = enriched;
  assert.deepEqual(ordinary, run(source, input));
  assert.deepEqual(ordinary, sweep(source, input, [{}]).runs[0].result);
  assert.equal('equity' in run(source, input), false);
  enriched.equity[0] = -1;
  assert.deepEqual(runWithEquity(source, input).equity, [999, 1009, 988]);
});

test('order-fill recalculations do not add duplicate equity samples', () => {
  const result = runWithEquity(source, { ...input, settings: { calc_on_order_fills: true } });
  assert.deepEqual(result.diagnostics, []);
  assert.deepEqual(result.equity, [999, 1009, 988]);
  assert.equal(result.trades.length, 1);
});

test('pending strategy close still marks the final market bar without a regular close calculation', () => {
  for (const scheduling of [{ strategyClosePending: true }, { realtimeTail: true }]) {
    const result = runWithEquity(source, {
      ...input,
      settings: { process_orders_on_close: false },
      ...scheduling,
    });
    assert.deepEqual(result.diagnostics, []);
    assert.deepEqual(result.equity, [1000, 999, 979]);
    assert.equal(result.trades[0].exitTime, null);
  }
  assert.deepEqual(
    runWithEquity(source, { ...input, realtimeTail: true, strategyClosePending: false }).equity,
    [999, 1009, 988],
  );
});

test('failed runs expose diagnostics with no partial equity; indicators expose no account equity', () => {
  const malformed = { ...input, bars: [undefined] } as unknown as RunInput;
  const malformedResult = runWithEquity(source, malformed);
  assert.deepEqual(malformedResult.equity, []);
  const { equity: _, ...ordinaryFailure } = malformedResult;
  assert.deepEqual(ordinaryFailure, run(source, malformed));
  for (const invalid of [
    '//@version=6\nstrategy("bad")\nunknown_name()',
    '//@version=6\nstrategy("bad")\na = array.new_int(0)\nif bar_index == 1\n    array.get(a, 0)',
  ]) {
    const result = runWithEquity(invalid, input);
    assert.ok(result.diagnostics.length);
    assert.deepEqual(result.equity, []);
  }
  const indicator = runWithEquity('//@version=6\nindicator("Prices")\nplot(close)', input);
  assert.deepEqual(indicator.diagnostics, []);
  assert.deepEqual(indicator.equity, []);
  assert.deepEqual(indicator.plots[0].values, [100, 110, 90]);
  assert.deepEqual(runWithEquity(source, { ...input, bars: [] }).equity, []);
});

for (const version of ['v5', 'v6'])
  for (const fixture of ['B_orders_strings__none', 'S_sizing_crypto']) {
    test(`${version}/${fixture}: real strategy equity and unchanged report without source injection`, async () => {
      const directory = new URL(
        `../../golden/fixtures/strategy/${version}/${fixture}/`,
        import.meta.url,
      );
      const [pine, csv, metadata] = await Promise.all(
        ['source.pine', 'data.csv', 'meta.json'].map((name) =>
          readFile(new URL(name, directory), 'utf8'),
        ),
      );
      const rows = csv
        .trim()
        .split(/\r?\n/)
        .map((line) => line.split(','));
      const header = rows.shift()!.map((value) => value.replace(/^\uFEFF/, '').toLowerCase());
      const field = (row: string[], name: string) => Number(row[header.indexOf(name)]);
      const meta = JSON.parse(metadata);
      const fixtureInput: RunInput = {
        syminfo: meta.syminfo,
        timeframe: meta.timeframe,
        inputs: meta.inputs,
        bars: rows.map((row) => ({
          time: field(row, 'time'),
          open: field(row, 'open'),
          high: field(row, 'high'),
          low: field(row, 'low'),
          close: field(row, 'close'),
          volume: field(row, 'volume'),
        })),
      };
      const actual = runWithEquity(pine, fixtureInput);
      assert.deepEqual(actual.diagnostics, []);
      assert.equal(actual.equity.length, fixtureInput.bars.length);
      assert.ok(actual.equity.every(Number.isFinite));
      const { equity: _, ...ordinary } = actual;
      assert.deepEqual(ordinary, run(pine, fixtureInput));
      const metric = (name: string) =>
        Number(
          Object.entries(actual.metrics).find(
            ([key]) => key.startsWith(`Performance/${name}/All`) && !key.endsWith('%'),
          )?.[1],
        );
      assert.ok(
        Math.abs(
          actual.equity.at(-1)! -
            metric('Initial capital') -
            metric('Net profit') -
            metric('Open PnL'),
        ) < 1e-7,
      );
      if (fixture.startsWith('B_orders')) {
        assert.equal(
          actual.plots.some((plot) => plot.title.toLowerCase() === 'equity'),
          false,
        );
        assert.ok(Math.abs(metric('Net profit') - 17) < 1e-8);
      }
    });
  }
