import assert from 'node:assert/strict';
import { test } from 'node:test';
import type { InputDescriptor } from '@pine/engine';
import { neighborhoodValues } from './analysis.ts';
import {
  analyzeOptimizer,
  rankOptimizerTrials,
  type OptimizerAnalysisInput,
} from './optimizer-analysis.ts';
import { summarizeOptimizerAnalysis } from './optimizer-summary.ts';
import { enumerateGrid, generateSearchSpace } from './search-space.ts';
import { consecutiveLossesMetric } from './trade-statistics.ts';
import { trialIdForParameters } from './trial-id.ts';
import { constraintValue, leaderboard, type TrialRecord } from './validation.ts';

const descriptor = (id: string, title: string, max: number): InputDescriptor => ({
  id,
  title,
  type: 'int',
  defaultValue: 1,
  min: 1,
  max,
  fixed: false,
  line: 1,
});
const space = generateSearchSpace([descriptor('a', 'A', 6), descriptor('b', 'B', 4)]);
const net = 'Performance/Net profit/All USD';
const trades = 'Trades analysis/Total trades/All USD';

/** A broad plateau around A 2, B 2–3, and one isolated peak at A 6, B 4 with poor neighbours. */
function inSampleNet(a: number, b: number): number {
  if (a === 6 && b === 4) return 900;
  if (a >= 5) return -400;
  return 600 - 120 * Math.abs(a - 2) - 60 * Math.abs(b - 2.5);
}

const trials: TrialRecord[] = space.activeAxes[0].values.flatMap((a) =>
  space.activeAxes[1].values.map((b) => {
    const [x, y] = [a as number, b as number];
    return {
      trialId: trialIdForParameters({ inputs: { A: x, B: y } }),
      parameters: { A: x, B: y },
      inSampleMetrics: { [net]: inSampleNet(x, y), [trades]: 10 * x + y },
      outOfSampleMetrics: x === 1 && y === 1 ? undefined : { [net]: 100 * y - 10 * x },
      inSampleStatistics: { maxConsecutiveLosses: y },
      objectiveValue: null,
      inSampleValue: null,
      outOfSampleValue: null,
      valid: !(x === 3 && y === 1),
      excluded: false,
    };
  }),
);
const state: OptimizerAnalysisInput = {
  trials,
  resultSpace: space,
  mode: 'in-out',
  objective: 'Net profit',
  direction: 'maximize',
  constraints: [],
};
const ids = (list: readonly TrialRecord[]) => list.map((trial) => trial.trialId);
const peak = trialIdForParameters({ inputs: { A: 6, B: 4 } });

test('ranking by the neighbourhood mean works for IS / OOS and moves the default slices', () => {
  const byIs = analyzeOptimizer(state);
  assert.equal(byIs.ranked[0].trialId, peak);
  assert.equal(byIs.heatmapSelection?.trialId, peak);

  const analysis = analyzeOptimizer({ ...state, rankBy: 'neighborhood' });
  const neighbors = neighborhoodValues(analysis.trials, space.activeAxes);
  const expected = leaderboard(
    analysis.trials.map((trial) => ({ ...trial, objectiveValue: neighbors.get(trial) ?? null })),
  );
  assert.deepEqual(ids(analysis.ranked), ids(expected));
  assert.notEqual(analysis.ranked[0].trialId, peak);
  assert.equal(analysis.heatmapSelection?.trialId, analysis.ranked[0].trialId);
  assert.deepEqual(
    analysis.ranked.map((trial) => analysis.neighbors[trial.trialId]),
    expected.map((trial) => trial.objectiveValue),
  );
  // The ranked sets keep their own objective values; only the order follows the neighbourhood.
  assert.equal(analysis.ranked[0].inSampleValue, analysis.ranked[0].objectiveValue);
  assert.deepEqual(ids(rankOptimizerTrials({ ...state, rankBy: 'neighborhood' })), ids(expected));
  assert.deepEqual(
    ids(
      analyzeOptimizer({ ...state, mode: 'none', resultMode: 'none', rankBy: 'neighborhood' })
        .ranked,
    ),
    ids(
      analyzeOptimizer({ ...state, mode: 'none', resultMode: 'none', rankBy: 'secondary' }).ranked,
    ),
  );
  const secondary = analyzeOptimizer({ ...state, rankBy: 'secondary' }).ranked;
  assert.deepEqual(
    secondary.map((trial) => trial.outOfSampleValue),
    secondary.map((trial) => trial.outOfSampleValue).sort((a, b) => b! - a!),
  );
});

test('default map axes stay independent of results and impact across validation surfaces', () => {
  const space = generateSearchSpace([
    descriptor('a', 'A', 2),
    descriptor('b', 'B', 3),
    descriptor('c', 'C', 4),
  ]);
  const trials: TrialRecord[] = enumerateGrid(space).map((parameters) => ({
    trialId: trialIdForParameters({ inputs: parameters }),
    parameters,
    inSampleMetrics: { [net]: Number(parameters.A) * 1000 },
    outOfSampleMetrics: { [net]: Number(parameters.B) * 100 },
    objectiveValue: null,
    inSampleValue: null,
    outOfSampleValue: null,
    valid: true,
    excluded: false,
  }));
  for (const mode of ['none', 'in-out', 'walk-forward'] as const) {
    for (const wfSurface of ['window', 'mean'] as const) {
      for (const records of [[], trials.slice(0, 3), trials, trials.toReversed()]) {
        const analysis = analyzeOptimizer({
          ...state,
          resultSpace: space,
          trials: records,
          mode,
          wfSurface,
          meanTrialGroups: [records],
        });
        assert.deepEqual(analysis.defaultAxes, ['C', 'B']);
        assert.deepEqual(analysis.axes, { x: 'C', y: 'B', z: undefined });
        for (const { map } of analysis.maps) assert.deepEqual([map.xKey, map.yKey], ['C', 'B']);
        if (records.length === trials.length) {
          assert.equal(analysis.sensitivity.parameters[0].parameter, 'A');
          assert.equal(analysis.sensitivity.parameters[0].etaSquared, 1);
        }
      }
    }
  }
  for (const preserveAxisOrientation of [false, true]) {
    const chosen = analyzeOptimizer({
      ...state,
      resultSpace: space,
      trials,
      axes: { x: 'A', y: 'B', z: 'C' },
      preserveAxisOrientation,
    });
    assert.deepEqual(chosen.axes, {
      x: preserveAxisOrientation ? 'A' : 'B',
      y: preserveAxisOrientation ? 'B' : 'A',
      z: 'C',
    });
    assert.deepEqual(chosen.defaultAxes, ['C', 'B']);
    assert.equal(chosen.maps[0].map.zKey, 'C');
  }
  const single = generateSearchSpace([descriptor('a', 'A', 2)]);
  const curve = analyzeOptimizer({ ...state, space: single, resultSpace: undefined, trials });
  assert.deepEqual(curve.axes, { x: 'A', y: undefined, z: undefined });
  assert.equal(curve.maps[0].map.yKey, undefined);
});

test('a summary keeps per-set columns and positions instead of the trials', () => {
  const analysis = analyzeOptimizer({
    ...state,
    rankBy: 'neighborhood',
    constraintDraft: { metric: 'Total trades', operator: '>=', value: 40 },
  });
  const summary = summarizeOptimizerAnalysis(analysis, {
    metrics: ['Net profit', 'Total trades', consecutiveLossesMetric],
  });
  assert.equal(summary.total, trials.length);
  assert.deepEqual(
    [...summary.ranked].map((position) => trials[position].trialId),
    ids(analysis.ranked),
  );
  assert.equal(trials[summary.selection].trialId, analysis.heatmapSelection?.trialId);
  const at = (a: number, b: number) =>
    trials.findIndex((trial) => trial.parameters.A === a && trial.parameters.B === b);
  const { columns } = summary;
  assert.equal(columns.valid[at(3, 1)], 0);
  assert.equal(columns.valid[at(2, 2)], 1);
  assert.equal(columns.inSampleValue[at(2, 2)], inSampleNet(2, 2));
  assert.ok(Number.isNaN(columns.outOfSampleValue[at(1, 1)]));
  assert.equal(columns.neighborhood[at(2, 2)], analysis.neighbors[trials[at(2, 2)].trialId]);
  assert.equal(columns.metrics['Net profit'].outOfSample[at(4, 3)], 260);
  assert.equal(columns.metrics['Total trades'].inSample[at(4, 3)], 43);
  assert.equal(columns.metrics[consecutiveLossesMetric].inSample[at(4, 3)], 3);
  assert.ok(Number.isNaN(columns.metrics[consecutiveLossesMetric].outOfSample[at(4, 3)]));
  assert.deepEqual([...summary.removedConstraintRanks], analysis.removedConstraintRanks);
  assert.ok(summary.removedConstraintRanks.length > 0);
  assert.deepEqual(
    summary.maps.map((item) => [item.surface, 'map' in item]),
    [
      ['in', false],
      ['out', false],
    ],
  );
  assert.deepEqual(summarizeOptimizerAnalysis(analysis, { fullMaps: true }).maps, analysis.maps);
  assert.deepEqual(summary.sensitivity, analysis.sensitivity);
  assert.deepEqual(structuredClone(summary), summary);
});

test('filters constrain ranking and selection without removing the searched surface or sensitivity', () => {
  for (const neighborhood of [false, true]) {
    const baseline = analyzeOptimizer({ ...state, neighborhood });
    for (const value of [40, 1000]) {
      const constraint = { metric: 'Total trades', operator: '>=' as const, value };
      const analysis = analyzeOptimizer({ ...state, neighborhood, constraints: [constraint] });
      assert.deepEqual(analysis.sensitivity, baseline.sensitivity);
      assert.deepEqual(analysis.neighbors, baseline.neighbors);
      assert.deepEqual(analysis.defaultAxes, baseline.defaultAxes);
      for (const [index, surface] of analysis.maps.entries()) {
        assert.deepEqual(
          surface.map.cells.map((cell) => cell.value),
          baseline.maps[index].map.cells.map((cell) => cell.value),
        );
        const sampled = surface.map.cells.filter((cell) => cell.count > 0);
        assert.ok(sampled.some((cell) => cell.excludedCount === cell.count));
        for (const cell of sampled.filter((cell) => cell.excludedCount === cell.count)) {
          assert.equal(cell.trialId, undefined);
          assert.deepEqual(cell.failedConstraints, [constraint]);
          assert.notEqual(cell.value, null);
        }
      }
      const summary = structuredClone(summarizeOptimizerAnalysis(analysis, { fullMaps: true }));
      assert.deepEqual(summary.maps, analysis.maps);
      assert.deepEqual(summary.sensitivity, baseline.sensitivity);
      if (value === 1000) {
        assert.equal(analysis.ranked.length, 0);
        assert.equal(summary.selection, -1);
      } else
        assert.ok(
          analysis.ranked.every((trial) => constraintValue(trial, 'Total trades')! >= value),
        );
    }
  }
});

test('walk-forward window and mean maps retain sets from windows with no passing combination', () => {
  const constraints = [{ metric: 'Total trades', operator: '>=' as const, value: 1000 }];
  for (const wfSurface of ['window', 'mean'] as const) {
    const input = {
      ...state,
      mode: 'walk-forward' as const,
      wfSurface,
      meanTrialGroups: [trials, trials],
    };
    const baseline = analyzeOptimizer(input);
    const filtered = analyzeOptimizer({ ...input, constraints });
    assert.equal(filtered.ranked.length, 0);
    assert.deepEqual(
      filtered.maps[0].map.cells.map((cell) => cell.value),
      baseline.maps[0].map.cells.map((cell) => cell.value),
    );
    for (const cell of filtered.maps[0].map.cells.filter((cell) => cell.count)) {
      assert.equal(cell.excludedCount, cell.count);
      assert.deepEqual(cell.failedConstraints, constraints);
    }
  }
});
