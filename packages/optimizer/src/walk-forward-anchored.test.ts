import assert from 'node:assert/strict';
import { test } from 'node:test';
import {
  describe,
  run,
  runWithEquity as runStrategy,
  type RunInput,
  type RunResult,
} from '@pine/engine';
import { strategyFixture } from '../test/fixtures.ts';
import { enumerateGrid, generateSearchSpace } from './search-space.ts';
import { trialIdForParameters } from './trial-id.ts';
import { runWalkForward } from './walk-forward.ts';

const parameter = 'stop / limit distance %';
const values = [0.05, 0.1, 0.15, 0.2, 0.25, 0.3];
const metric = (metrics: RunResult['metrics'], key: string): number | null => {
  const value = metrics[key];
  return typeof value === 'number' && Number.isFinite(value) ? value : null;
};
const net = (metrics: RunResult['metrics']) => metric(metrics, 'Performance/Net profit/All USD');
const trades = (metrics: RunResult['metrics']) =>
  metric(metrics, 'Trades analysis/Total trades/All USD');
const cagr = (metrics: RunResult['metrics']) =>
  metric(metrics, 'Performance/Annualized return (CAGR)/All %');

/** Independent anchored calendar slices and engine outputs: the expected walk-forward. */
async function anchoredWindowReference() {
  const { source, bars: allBars, meta } = await strategyFixture();
  const cutoff = Date.UTC(2016, 0, 15) / 1000;
  const bars = allBars.filter((bar) => bar.time < cutoff);
  const common: RunInput = { bars, syminfo: meta.syminfo, timeframe: meta.timeframe };
  assert.equal(bars.length, 1822);
  let capital = 100000;
  let inCapital = 100000;
  let inSeconds = 0;
  const windows = [0, 2, 4, 6].map((offset, index) => {
    // Anchored windows keep January as the IS start; only the IS end advances.
    const start = Date.UTC(2015, 0, 1) / 1000;
    const split = Date.UTC(2015, offset + 6, 1) / 1000;
    const plannedEnd = Date.UTC(2015, offset + 8, 1) / 1000;
    const inside = bars.filter((bar) => bar.time >= start && bar.time < split);
    const outside = bars.filter((bar) => bar.time >= split && bar.time < plannedEnd);
    const trials = values
      .map((value) => {
        const inputs = { [parameter]: value };
        const result = run(source, { ...common, bars: inside, inputs });
        assert.deepEqual(result.diagnostics, []);
        const score = net(result.metrics);
        assert.notEqual(score, null);
        return {
          inputs,
          trialId: trialIdForParameters({ inputs }),
          score: score!,
          metrics: result.metrics,
        };
      })
      .sort((a, b) => b.score - a.score || a.trialId.localeCompare(b.trialId));
    const best = trials[0];
    const inResult = runStrategy(source, { ...common, bars: inside, inputs: best.inputs });
    const outResult = run(source, { ...common, bars: outside, inputs: best.inputs });
    const outsideAccount = runStrategy(source, { ...common, bars: outside, inputs: best.inputs });
    assert.deepEqual(inResult.diagnostics, []);
    assert.deepEqual(outResult.diagnostics, []);
    assert.deepEqual(outsideAccount.diagnostics, []);
    assert.deepEqual(inResult.metrics, best.metrics);
    assert.deepEqual(outsideAccount.metrics, outResult.metrics);
    assert.equal(inResult.equity.length, inside.length);
    assert.equal(outsideAccount.equity.length, outside.length);
    const initial = metric(outResult.metrics, 'Performance/Initial capital/All USD')!;
    const startCapital = capital;
    capital = outsideAccount.equity.at(-1)! - initial + startCapital;
    inCapital +=
      inResult.equity.at(-1)! - metric(inResult.metrics, 'Performance/Initial capital/All USD')!;
    inSeconds += inside.at(-1)!.time - inside[0].time;
    const inCagr = cagr(best.metrics),
      outCagr = cagr(outResult.metrics);
    const end = Math.min(plannedEnd, bars.at(-1)!.time + 3600);
    return {
      index,
      start,
      split,
      plannedEnd,
      end,
      partial: end < plannedEnd,
      inBars: inside.length,
      outBars: outside.length,
      lastBar: outside.at(-1)!.time,
      firstBar: outside[0].time,
      parameters: best.inputs,
      trialId: best.trialId,
      trials,
      inNet: best.score,
      outNet: net(outResult.metrics),
      inTrades: trades(best.metrics),
      outTrades: trades(outResult.metrics),
      inCagr,
      outCagr,
      wfe: inCagr !== null && inCagr > 0 && outCagr !== null ? outCagr / inCagr : null,
      inMetrics: best.metrics,
      outMetrics: outResult.metrics,
      startCapital,
      endCapital: capital,
      inEquity: inResult.equity.map((value) => value - inResult.equity.at(-1)! + startCapital),
      outEquity: outsideAccount.equity.map((value) => value - initial + startCapital),
    };
  });
  const sum = (key: 'inNet' | 'outNet' | 'inTrades' | 'outTrades' | 'inCagr' | 'outCagr') =>
    windows.some((window) => window[key] === null)
      ? null
      : windows.reduce((total, window) => total + window[key]!, 0);
  const inCagr = ((inCapital / 100000) ** ((365 * 86400) / inSeconds) - 1) * 100;
  const outSeconds = windows.at(-1)!.lastBar - windows[0].firstBar;
  const outCagr = ((capital / 100000) ** ((365 * 86400) / outSeconds) - 1) * 100;
  const totals = {
    inNet: sum('inNet'),
    outNet: sum('outNet'),
    inTrades: sum('inTrades'),
    outTrades: sum('outTrades'),
    winningWindows: windows.filter((window) => window.outNet !== null && window.outNet > 0).length,
    wfe: inCagr > 0 ? outCagr / inCagr : null,
    endCapital: capital,
  };
  // There is one searched parameter, so each fixed-value profile is a direct run score.
  const stabilityAt = (tolerance: number) => {
    const bands = windows.map((window) => {
      const profiles = values.map((value) => {
        const objective = window.trials.find((trial) => trial.inputs[parameter] === value)!.score;
        const shortfall = Math.max(0, window.inNet - objective) / Math.abs(window.inNet);
        return { value, objective, shortfall };
      });
      return {
        parameter,
        window: window.index,
        chosen: window.parameters[parameter],
        best: window.inNet,
        values: profiles
          .filter((profile) => profile.shortfall <= tolerance)
          .map((profile) => profile.value),
        scores: profiles,
      };
    });
    const intersection = values.filter((value) =>
      bands.every((band) => band.values.includes(value)),
    );
    const fixed = values
      .map((value) => ({
        value,
        shortfall: bands.reduce(
          (total, band) =>
            total + band.scores.find((score) => score.value === value)!.shortfall / bands.length,
          0,
        ),
      }))
      .sort((a, b) => a.shortfall - b.shortfall)[0];
    return [
      {
        parameter,
        bands,
        intersection,
        fixedValue: fixed.value,
        averageShortfall: fixed.shortfall,
      },
    ];
  };
  return {
    source,
    common,
    reference: { values, parameter, windows, totals, stability: stabilityAt(0.1) },
  };
}

test('four anchored golden windows expand IS from the first month and match independent engine selections, OOS, totals and stability', async () => {
  const { source, common, reference } = await anchoredWindowReference();
  const space = generateSearchSpace(describe(source).inputs, {
    ranges: { [reference.parameter]: { values: reference.values } },
  });
  const result = runWalkForward(
    enumerateGrid(space),
    common.bars,
    (inputs, bars) => runStrategy(source, { ...common, bars, inputs }),
    {
      mode: 'anchored',
      inSampleLength: 6,
      outOfSampleLength: 2,
      step: 2,
      axes: space.activeAxes,
      tolerance: 0.1,
    },
  );
  assert.equal(result.windows.length, 4);
  assert.equal(result.cancelled, false);
  for (const [index, window] of result.windows.entries()) {
    const expected = reference.windows[index];
    assert.equal(window.error, undefined);
    assert.equal(window.inSampleStart, expected.start);
    assert.equal(window.inSampleEnd, expected.split);
    assert.equal(window.outOfSampleEnd, expected.end);
    assert.equal(window.partial, expected.partial);
    assert.equal(window.inSampleBars.length, expected.inBars);
    assert.equal(window.outOfSampleBars.length, expected.outBars);
    if (index)
      assert.ok(window.inSampleBars.length > result.windows[index - 1].inSampleBars.length);
    assert.deepEqual(window.chosenParameters, expected.parameters);
    assert.equal(window.bestTrial!.trialId, expected.trialId);
    assert.deepEqual(window.inSampleResult!.metrics, expected.inMetrics);
    assert.deepEqual(window.outOfSampleResult!.metrics, expected.outMetrics);
    assert.deepEqual(window.inSampleEquity, expected.inEquity);
    assert.deepEqual(window.outOfSampleEquity, expected.outEquity);
    assert.equal(window.wfe, expected.wfe);
    for (const trial of window.trials) {
      assert.deepEqual(
        trial.inSampleMetrics,
        expected.trials.find((other) => other.trialId === trial.trialId)!.metrics,
      );
    }
  }
  assert.equal(result.totals.inSampleNet, reference.totals.inNet);
  assert.equal(result.totals.outOfSampleNet, reference.totals.outNet);
  assert.equal(result.totals.inSampleTrades, reference.totals.inTrades);
  assert.equal(result.totals.outOfSampleTrades, reference.totals.outTrades);
  assert.equal(result.totals.winningWindows, reference.totals.winningWindows);
  assert.equal(result.totals.wfe, reference.totals.wfe);
  assert.equal(result.totals.equity.at(-1), reference.totals.endCapital);
  assert.deepEqual(result.stability[0].bands, reference.stability[0].bands);
  assert.deepEqual(result.stability[0].intersection, reference.stability[0].intersection);
  assert.equal(result.stability[0].fixedValue, reference.stability[0].fixedValue);
  assert.equal(result.stability[0].averageShortfall, reference.stability[0].averageShortfall);
});
