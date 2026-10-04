import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import { test } from 'node:test';
import { runWithEquity as runStrategy, type MarketBar } from '@pine/engine';
import { parseBars } from '../test/fixtures.ts';
import { runWalkForward, planWalkForwardWindows, finalizeWalkForward } from './walk-forward.ts';
import { metricValue } from './metrics.ts';

test('real B_orders fixture completes 6+2 month windows stepped by two months', async () => {
  const directory = new URL(
    '../../golden/fixtures/strategy/v6/B_orders_strings__none/',
    import.meta.url,
  );
  const [source, csv, metadataText] = await Promise.all(
    ['source.pine', 'data.csv', 'meta.json'].map((name) =>
      readFile(new URL(name, directory), 'utf8'),
    ),
  );
  const metadata = JSON.parse(metadataText);
  const bars = parseBars(csv);
  const parameters = [0.05, 0.3, 0.5].map((value) => ({ 'stop / limit distance %': value }));
  const evaluate = (inputs: Record<string, unknown>, windowBars: readonly MarketBar[]) =>
    runStrategy(source, {
      bars: windowBars,
      syminfo: metadata.syminfo,
      timeframe: metadata.timeframe,
      inputs,
    });
  const config = { inSampleLength: 6, outOfSampleLength: 2, step: 2 };
  const plans = planWalkForwardWindows(bars, config);
  assert.equal(plans.length, 68);
  assert.equal(plans.at(-1)!.partial, true);
  assert.equal(plans.at(-1)!.outOfSampleBars.length, 21);
  assert.equal(plans.at(-1)!.outOfSampleBars.at(-1), bars.at(-1));
  assert.equal(new Date(plans[0].inSampleStart * 1000).toISOString(), '2015-01-01T00:00:00.000Z');
  assert.equal(
    new Date(plans[0].outOfSampleStart * 1000).toISOString(),
    '2015-07-01T00:00:00.000Z',
  );
  assert.equal(new Date(plans[0].outOfSampleEnd * 1000).toISOString(), '2015-09-01T00:00:00.000Z');
  const result = runWalkForward(parameters, bars, evaluate, config);
  assert.equal(result.cancelled, false);
  assert.equal(result.windows.length, plans.length);
  for (const window of result.windows) {
    assert.equal(window.trials.length, 3);
    assert.equal(
      window.bestTrial!.objectiveValue,
      Math.max(...window.trials.map((trial) => trial.objectiveValue!)),
    );
    assert.deepEqual(window.outOfSampleResult?.diagnostics, []);
    assert.equal(
      window.outOfSampleNet,
      window.outOfSampleResult!.equity!.at(-1)! -
        metricValue(window.outOfSampleResult!.metrics, 'Initial capital')!,
    );
    assert.equal(window.equity.length, window.outOfSampleBars.length);
    assert.equal(window.inSampleEquity.at(-1), window.startCapital);
  }
  const sums = result.windows.reduce(
    (s, w) => ({
      in: s.in + w.inSampleNet!,
      out: s.out + w.outOfSampleNet!,
      trades: s.trades + w.outOfSampleTrades!,
    }),
    { in: 0, out: 0, trades: 0 },
  );
  assert.equal(result.totals.inSampleNet, sums.in);
  assert.equal(result.totals.outOfSampleNet, sums.out);
  assert.equal(result.totals.outOfSampleTrades, sums.trades);
  assert.equal(result.totals.equity.includes(null), false);
  const rebuilt = finalizeWalkForward(result.windows, config);
  assert.deepEqual(rebuilt.totals, result.totals);
  const firstOut = evaluate(result.windows[0].chosenParameters!, plans[0].outOfSampleBars);
  assert.deepEqual(firstOut.metrics, result.windows[0].outOfSampleResult!.metrics);
  assert.deepEqual(result.windows[0].outOfSampleResult!.equity, firstOut.equity);
  const last = result.windows.at(-1)!;
  const finalOut = evaluate(last.chosenParameters!, plans.at(-1)!.outOfSampleBars);
  assert.deepEqual(last.outOfSampleResult!.metrics, finalOut.metrics);
  assert.deepEqual(last.outOfSampleResult!.equity, finalOut.equity);
});

test('a single 200,003-bar OOS window retains every real engine equity observation during finalization', async () => {
  const directory = new URL(
    '../../golden/fixtures/strategy/v6/B_orders_strings__none/',
    import.meta.url,
  );
  const [source, csv, metadataText] = await Promise.all(
    ['source.pine', 'data.csv', 'meta.json'].map((name) =>
      readFile(new URL(name, directory), 'utf8'),
    ),
  );
  const metadata = JSON.parse(metadataText);
  const original = parseBars(csv);
  const outStart = Date.UTC(2015, 6, 1) / 1000;
  const inside = original.filter((bar) => bar.time < outStart);
  // A stress derivative repeats actual fixture OHLCV on a strictly increasing hourly clock.
  // Both account histories and their metrics below are computed by the unmodified fixture strategy.
  const outside = Array.from({ length: 200003 }, (_, index) => ({
    ...original[index % original.length],
    time: outStart + index * 3600,
  }));
  const config = { inSampleLength: 6, outOfSampleLength: 300, step: 300 };
  const plans = planWalkForwardWindows(inside.concat(outside), config);
  assert.equal(plans.length, 1);
  assert.equal(plans[0].outOfSampleBars.length, outside.length);
  const evaluate = (bars: readonly MarketBar[]) =>
    runStrategy(source, {
      bars,
      syminfo: metadata.syminfo,
      timeframe: metadata.timeframe,
    });
  const inSampleResult = evaluate(plans[0].inSampleBars);
  const outOfSampleResult = evaluate(plans[0].outOfSampleBars);
  assert.deepEqual(inSampleResult.diagnostics, []);
  assert.deepEqual(outOfSampleResult.diagnostics, []);
  assert.equal(outOfSampleResult.equity.length, outside.length);
  const result = finalizeWalkForward(
    [{ ...plans[0], trials: [], inSampleResult, outOfSampleResult }],
    config,
  );
  assert.deepEqual(result.totals.equity, outOfSampleResult.equity);
  assert.deepEqual(
    result.totals.equityTimes,
    outside.map((bar) => bar.time),
  );
  assert.equal(result.windows[0].endCapital, outOfSampleResult.equity.at(-1));
  assert.equal(
    result.windows[0].inSampleEquity.at(-1),
    metricValue(outOfSampleResult.metrics, 'Initial capital'),
  );
  assert.equal(
    result.totals.inSampleNet,
    inSampleResult.equity.at(-1)! - metricValue(inSampleResult.metrics, 'Initial capital')!,
  );
  assert.equal(
    result.totals.outOfSampleNet,
    outOfSampleResult.equity.at(-1)! - metricValue(outOfSampleResult.metrics, 'Initial capital')!,
  );
  assert.equal(
    result.totals.outOfSampleTrades,
    metricValue(outOfSampleResult.metrics, 'Total trades'),
  );
});
