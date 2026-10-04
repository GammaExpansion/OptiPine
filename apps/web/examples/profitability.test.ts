import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import test from 'node:test';
import { gunzipSync } from 'node:zlib';
import { describe, run, sweep, type RunResult } from '@pine/engine';
import { loadFeed, type FeedDataset } from '@pine/market-data';
import { createUpstreamFetch } from '@pine/market-data/proxy';
import { presetRange } from '../src/workflows/market-data.ts';
import { examples, type ExampleId } from './index.ts';

const recorded = JSON.parse(
  gunzipSync(
    readFileSync(new URL('../e2e/fixtures/market/btc-two-years.json.gz', import.meta.url)),
  ).toString('utf8'),
) as FeedDataset;
assert.equal(recorded.input.bars.length, 17_520);

function headline(result: RunResult) {
  assert.deepEqual(result.diagnostics, []);
  assert.deepEqual(result.warnings, []);
  const metric = (key: string) => {
    const value = result.metrics[key];
    assert.equal(typeof value, 'number', key);
    assert.ok(typeof value === 'number' && Number.isFinite(value), key);
    return value;
  };
  return {
    net: metric('Performance/Net profit/All USDT'),
    pf: metric('Risk-adjusted performance/Profit factor/All USDT'),
    trades: metric('Trades analysis/Total trades/All USDT'),
    winRate: metric('Trades analysis/Percent profitable/All %'),
    maxDrawdown: metric('Performance/Max drawdown (intrabar)/All USDT'),
    maxDrawdownPercent: metric('Performance/Max drawdown (intrabar)/All %'),
  };
}

function assertProfitable(result: ReturnType<typeof headline>) {
  assert.ok(result.net > 0, `net profit ${result.net} must be positive after fees`);
  assert.ok(result.pf > 1, `profit factor ${result.pf} must exceed one`);
}

function wideScore(result: RunResult) {
  assert.deepEqual(result.diagnostics, []);
  assert.deepEqual(result.warnings, []);
  const net = result.metrics['Performance/Net profit/All USDT'];
  const pf = result.metrics['Risk-adjusted performance/Profit factor/All USDT'];
  assert.equal(typeof net, 'number');
  assert.ok(typeof net === 'number' && Number.isFinite(net));
  return { net, pf: typeof pf === 'number' && Number.isFinite(pf) ? pf : null };
}

/** Stress grids deliberately extend past UI bounds for lengths; defaults keep the original bounds. */
function wideAxes(id: ExampleId): Record<string, readonly (number | string | boolean)[]> {
  if (id === 'trend-breakout')
    return {
      Length: [140, 160, 180, 200, 220],
      Multiplier: [1.75, 2.25, 2.75],
      'Use trailing stop': [false, true],
      'Trail %': [2.5, 3, 3.5],
      Source: ['open', 'high', 'low', 'close', 'hl2', 'hlc3', 'ohlc4', 'hlcc4'],
    };
  if (id === 'rsi-reversal')
    return {
      'RSI length': [11, 14, 17],
      Oversold: [24, 30, 36],
      'Exit at midline': [true, false],
      'Trend EMA length': [160, 200, 240],
      'Stop %': [8, 10, 12],
      Source: ['close'],
    };
  return {
    'Fast length': [65, 80, 95],
    'Slow length': [200, 250, 300],
    'Average type': ['EMA', 'SMA'],
    'Require rising slow MA': [true, false],
    'Stop %': [2.5, 3, 3.5],
  };
}

function enumerateAxes(axes: Record<string, readonly unknown[]>) {
  return Object.entries(axes).reduce<Record<string, unknown>[]>(
    (sets, [title, values]) =>
      sets.flatMap((set) => values.map((value) => ({ ...set, [title]: value }))),
    [{}],
  );
}

for (const example of examples) {
  const source = readFileSync(new URL(example.fileName, import.meta.url), 'utf8');

  test(`${example.title} defaults profit on recorded BTC and both independent years`, (t) => {
    const full = headline(run(source, recorded.input));
    assertProfitable(full);
    assert.ok(full.trades >= 20 && full.trades <= 400, `${full.trades} closed trades`);
    // Each year starts flat with fresh capital and indicator warmup; positions never cross the split.
    const halves = [recorded.input.bars.slice(0, 8760), recorded.input.bars.slice(8760)].map(
      (bars) => headline(run(source, { ...recorded.input, bars })),
    );
    for (const half of halves) assertProfitable(half);
    t.diagnostic(JSON.stringify({ full, halves }));
  });

  test(`${example.title} defaults sit in a profitable numeric neighbourhood`, (t) => {
    const description = describe(source);
    assert.equal(description.success, true);
    let inputs: Record<string, unknown>[] = [{}];
    for (const descriptor of description.inputs) {
      const value = descriptor.defaultValue;
      // Use the declared step (one for integers), holding categorical inputs at their defaults.
      const values =
        typeof value === 'number'
          ? [-1, 0, 1].map((offset) => value + offset * (descriptor.step ?? 1))
          : [value];
      if (typeof value === 'number') {
        assert.ok(Number(values[0]) >= descriptor.min!);
        assert.ok(Number(values[2]) <= descriptor.max!);
      }
      inputs = inputs.flatMap((set) =>
        values.map((value) => ({ ...set, [descriptor.title]: value })),
      );
    }
    const results: ReturnType<typeof headline>[] = [];
    for (let offset = 0; offset < inputs.length; offset += 8) {
      const output = sweep(
        source,
        recorded.input,
        inputs.slice(offset, offset + 8).map((inputs) => ({ inputs })),
      );
      assert.equal(output.compilation.success, true);
      results.push(...output.runs.map(({ result }) => headline(result)));
    }
    assert.equal(results.length, example.id === 'rsi-reversal' ? 81 : 27);
    const profitable = results.filter(({ net, pf }) => net > 0 && pf > 1).length;
    const meanNet = results.reduce((sum, result) => sum + result.net, 0) / results.length;
    assert.ok(profitable > results.length / 2, `${profitable}/${results.length} profitable`);
    assert.ok(meanNet > 0, `neighbourhood mean ${meanNet}`);
    // The centre is included, as in the app's neighbourhood mean. Trail % is inactive when off.
    t.diagnostic(JSON.stringify({ profitable, count: results.length, meanNet }));
  });

  // The full audit is opt-in: ordinary regression runs already cover defaults, splits and steps.
  test(
    `${example.title} defaults sit on a wider profitable plateau`,
    { skip: process.env.EXAMPLES_WIDE !== '1' },
    (t) => {
      const sets = enumerateAxes(wideAxes(example.id));
      const results: ReturnType<typeof wideScore>[] = [];
      // Retain only metrics between batches, not thousands of plot series and trade lists.
      for (let offset = 0; offset < sets.length; offset += 8) {
        const output = sweep(
          source,
          recorded.input,
          sets.slice(offset, offset + 8).map((inputs) => ({ inputs })),
        );
        assert.equal(output.compilation.success, true);
        results.push(...output.runs.map(({ result }) => wideScore(result)));
      }
      assert.equal(results.length, sets.length);
      // A run without losses has null PF; positive net still makes it a profitable grid point.
      const profitable = results.filter(({ net }) => net > 0).length;
      const finiteProfitFactor = results.filter(
        ({ net, pf }) => net > 0 && pf !== null && pf > 1,
      ).length;
      const meanNet = results.reduce((sum, result) => sum + result.net, 0) / results.length;
      assert.ok(profitable > results.length / 2, `${profitable}/${results.length} profitable`);
      assert.ok(meanNet > 0, `wide plateau mean ${meanNet}`);
      t.diagnostic(
        JSON.stringify({ profitable, finiteProfitFactor, count: results.length, meanNet }),
      );
    },
  );
}

test('RSI Reversal source options and both exit modes remain mostly profitable at the centre', (t) => {
  const source = readFileSync(new URL('rsi-reversal.pine', import.meta.url), 'utf8');
  const options = describe(source).inputs.find(({ title }) => title === 'Source')!.options!;
  const sets = enumerateAxes({ Source: options, 'Exit at midline': [true, false] });
  const output = sweep(
    source,
    recorded.input,
    sets.map((inputs) => ({ inputs })),
  );
  assert.equal(output.compilation.success, true);
  const results = output.runs.map(({ result }) => wideScore(result));
  const profitable = results.filter(({ net }) => net > 0).length;
  const meanNet = results.reduce((sum, { net }) => sum + net, 0) / results.length;
  assert.equal(results.length, 16);
  assert.ok(profitable > results.length / 2);
  assert.ok(meanNet > 0);
  t.diagnostic(JSON.stringify({ profitable, count: results.length, meanNet }));
});

test(
  'example defaults also profit on the latest two years from Binance',
  { skip: process.env.EXAMPLES_LIVE !== '1', timeout: 120_000 },
  async (t) => {
    const now = Date.now();
    const { from, to } = presetRange('2Y', 'binance', '60', now);
    const request = { ...examples[0].dataRequest, from, to };
    const dataset = await loadFeed(
      request,
      createUpstreamFetch(),
      AbortSignal.timeout(90_000),
      now,
    );
    t.diagnostic(JSON.stringify({ request, bars: dataset.input.bars.length }));
    for (const example of examples) {
      const source = readFileSync(new URL(example.fileName, import.meta.url), 'utf8');
      const result = headline(run(source, dataset.input));
      assertProfitable(result);
      t.diagnostic(JSON.stringify({ example: example.id, ...result }));
    }
  },
);
