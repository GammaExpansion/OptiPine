import assert from 'node:assert/strict';
import test from 'node:test';
import { describe, runWithEquity, type RunInput } from '@pine/engine';
import {
  constraintValue,
  enumerateGrid,
  generateSearchSpace,
  leaderboard,
  scoreMetric,
  splitBars,
  viewTrials,
  type OptimizerAnalysis,
  type OptimizerAnalysisInput,
  type SearchSpace,
  type TrialRecord,
} from '@pine/optimizer';
import { handleAnalysisRequest, type OptimizationTrial } from '@pine/workers';
import {
  filterMetricIds,
  metricConstraint,
  reportMetrics,
  type FilterCondition,
} from './optimize-ranking.ts';
import {
  binDetail,
  binWidth,
  cellValues,
  curveView,
  distributionView,
  draftPreview,
  failedCombination,
  failuresCsv,
  filterDiagnosis,
  filterReader,
  leaderboardPageSize,
  leaderboardView,
  mapView,
  medianCurve,
  metricReader,
  rankResults,
  scatterView,
  selectionOf,
  sensitivityView,
  type ValidationResultMode,
} from './optimize-views.ts';
import { engineTrials, strategySource, syntheticBars } from './test-support.ts';

const common: RunInput = {
  bars: syntheticBars(400),
  syminfo: { mintick: 0.01, mincontract: 0.001, timezone: 'Etc/UTC', currency: 'USD' },
  timeframe: '60',
};
const descriptors = describe(strategySource).inputs;

function searchSpace(lengths: [number, number], sources: string[]): SearchSpace {
  return generateSearchSpace(descriptors, {
    ranges: { Length: { from: lengths[0], to: lengths[1], step: 1 }, Source: { values: sources } },
    active: { Multiplier: false, Source: sources.length > 1 },
    currentValues: { Source: sources[0] },
  });
}

/** Trials of a real sweep over IS and OOS, as the pool would stream them. */
function sweep(space: SearchSpace, mode: ValidationResultMode) {
  const sets = enumerateGrid(space).map((inputs) => ({ inputs }));
  if (mode === 'none') return { groups: [engineTrials(strategySource, common, sets)] };
  const split = splitBars(common.bars, { mode: 'in-out', splitRatio: 0.7 });
  return {
    groups: [
      engineTrials(strategySource, { ...common, bars: split.inSample }, sets),
      engineTrials(strategySource, { ...common, bars: split.outOfSample }, sets),
    ],
  };
}

function job<K extends 'records' | 'view'>(
  kind: K,
  input: K extends 'records'
    ? { groups: OptimizationTrial[][]; objective: string }
    : OptimizerAnalysisInput,
) {
  const response = handleAnalysisRequest({ requestId: 1, kind, input } as never);
  assert.notEqual(response.kind, 'failed');
  return structuredClone((response as { output: unknown }).output);
}

function analyze(
  space: SearchSpace,
  mode: ValidationResultMode,
  options: Partial<OptimizerAnalysisInput> = {},
) {
  const { groups } = sweep(space, mode);
  const records = job('records', { groups, objective: 'Net profit' }) as TrialRecord[];
  const analysis = job('view', {
    trials: records,
    resultSpace: space,
    mode,
    resultMode: mode,
    objective: 'Net profit',
    direction: 'maximize',
    constraints: [],
    ...options,
  }) as OptimizerAnalysis;
  return { groups, records, analysis };
}

const axesOf = (space: SearchSpace) =>
  space.activeAxes.map((axis) => ({ title: axis.title, values: axis.values }));

const small = searchSpace([3, 10], ['close', 'hl2']);
const inOut = analyze(small, 'in-out');

test('metric readers give scoreMetric and constraintValue for every catalog metric', () => {
  const trials = inOut.analysis.trials;
  const sample = trials[0].inSampleMetrics;
  for (const metric of Object.values(reportMetrics)) {
    const read = metricReader(metric, sample);
    for (const trial of trials)
      assert.equal(read(trial.outOfSampleMetrics), scoreMetric(trial.outOfSampleMetrics!, metric));
  }
  for (const id of filterMetricIds) {
    const read = filterReader(id, sample);
    for (const trial of trials)
      assert.equal(read(trial), constraintValue(trial, reportMetrics[id]));
  }
  assert.equal(
    metricReader('Net profit', undefined)(trials[0].inSampleMetrics),
    trials[0].inSampleValue,
  );
});

test('the leaderboard pages ranked sets with IS and OOS figures (R1, R4)', () => {
  const results = rankResults(inOut.analysis, 'in-out', 'netProfit', 'maximize', axesOf(small));
  const view = leaderboardView(results, 0);
  assert.equal(view.passing, 16);
  assert.equal(view.total, 16);
  assert.equal(view.pageCount, 2);
  assert.equal(view.rows.length, leaderboardPageSize);
  assert.deepEqual(view.columns, [inOut.analysis.axes.x, inOut.analysis.axes.y]);
  const split = splitBars(common.bars, { mode: 'in-out', splitRatio: 0.7 });
  const first = view.rows[0];
  const inside = runWithEquity(strategySource, {
    ...common,
    bars: split.inSample,
    inputs: first.parameters,
  });
  const outside = runWithEquity(strategySource, {
    ...common,
    bars: split.outOfSample,
    inputs: first.parameters,
  });
  assert.equal(first.inSample.netProfit, scoreMetric(inside.metrics, 'Net profit'));
  assert.equal(first.outOfSample?.netProfit, scoreMetric(outside.metrics, 'Net profit'));
  assert.equal(first.inSample.trades, scoreMetric(inside.metrics, 'Total trades'));
  assert.equal(
    first.inSample.maxDrawdownPercent,
    inside.metrics['Performance/Max drawdown (intrabar)/All %'],
  );
  const nets = view.rows.map((row) => row.inSample.netProfit!);
  assert.deepEqual(
    nets,
    [...nets].sort((a, b) => b - a),
  );
  assert.equal(first.score, first.objective.inSample);
  const last = leaderboardView(results, 9);
  assert.equal(last.page, 1);
  assert.deepEqual(
    last.rows.map((row) => row.rank),
    [14, 15, 16],
  );
});

test('ranking by the neighbourhood mean reorders the same sets by it', () => {
  const results = rankResults(
    inOut.analysis,
    'in-out',
    'neighbourhoodMean',
    'maximize',
    axesOf(small),
  );
  const expected = leaderboard(
    inOut.analysis.ranked.map((trial) => ({
      ...trial,
      objectiveValue: inOut.analysis.neighbors[trial.trialId],
    })),
  ).map((trial) => trial.trialId);
  assert.deepEqual(
    results.ranked.map((trial) => trial.trialId),
    expected,
  );
  const row = leaderboardView(results, 0).rows[0];
  assert.equal(row.score, inOut.analysis.neighbors[row.trialId]);
  assert.equal(row.neighbourhoodMean, row.score);
});

test('the selection bar holds the picked row, or #1, with its origin', () => {
  const results = rankResults(inOut.analysis, 'in-out', 'netProfit', 'maximize', axesOf(small));
  const third = results.ranked[2].trialId;
  const picked = selectionOf(results, third, 4)!;
  assert.equal(picked.explicit, true);
  assert.equal(picked.row.rank, 3);
  assert.deepEqual(picked.origin, { kind: 'rank', optimizationId: 4, trialId: third, rank: 3 });
  assert.deepEqual(Object.keys(picked.row.parameters).sort(), ['Length', 'Multiplier', 'Source']);
  const fallback = selectionOf(results, 'gone', 4)!;
  assert.deepEqual([fallback.explicit, fallback.row.rank], [false, 1]);
});

test('the scatter has one point per set and highlights the page (R2)', () => {
  const results = rankResults(inOut.analysis, 'in-out', 'netProfit', 'maximize', axesOf(small));
  const scatter = scatterView(results, 1)!;
  assert.equal(scatter.points.length, 16);
  assert.deepEqual(scatter.pageRanks, [14, 16]);
  const point = scatter.points.find((item) => item.rank === 1)!;
  assert.equal(point.trialId, results.ranked[0].trialId);
  assert.equal(
    scatterView(
      rankResults(analyze(small, 'none').analysis, 'none', 'netProfit', 'maximize', axesOf(small)),
      0,
    ),
    null,
  );
});

test('the distribution bins IS and OOS net profit on shared round bins (R2b)', () => {
  const results = rankResults(inOut.analysis, 'in-out', 'netProfit', 'maximize', axesOf(small));
  const view = distributionView(results);
  const nets = (group: OptimizationTrial[]) =>
    group.map((trial) => scoreMetric(trial.metrics, 'Net profit')!);
  const inside = nets(inOut.groups[0]);
  const outside = nets(inOut.groups[1]);
  assert.equal(view.inSample.sets, 16);
  assert.equal(
    view.inSample.counts.reduce((a, b) => a + b, 0),
    16,
  );
  assert.equal(
    view.outOfSample!.counts.reduce((a, b) => a + b, 0),
    16,
  );
  assert.equal(view.inSample.profitable, inside.filter((net) => net > 0).length);
  assert.equal(view.outOfSample!.profitable, outside.filter((net) => net > 0).length);
  const sorted = [...inside].sort((a, b) => a - b);
  assert.equal(view.inSample.median, (sorted[7] + sorted[8]) / 2);
  assert.ok(view.start <= Math.min(...inside, ...outside));
  assert.ok(view.start + view.bins * view.width > Math.max(...inside, ...outside));
  assert.ok(view.bins <= 40);
  for (const net of inside) {
    const bin = Math.floor((net - view.start) / view.width + 1e-9);
    assert.ok(view.inSample.counts[bin] > 0);
  }
  assert.equal(view.best, results.readers.netProfit(results.ranked[0].inSampleMetrics));
  assert.deepEqual(
    [binWidth(33_200), binWidth(1), binWidth(0), binWidth(95)],
    [1000, 0.025, 1, 2.5],
  );
});

test('when no set passes, each filter says how many pass alone and the best value (R9)', () => {
  const filters: FilterCondition[] = [
    { metric: 'trades', operator: '>=', value: 1 },
    { metric: 'profitFactor', operator: '>=', value: 1e9 },
    { metric: 'maxDrawdown', operator: '<=', value: -1 },
  ];
  const { analysis } = analyze(small, 'in-out', { constraints: filters.map(metricConstraint) });
  const results = rankResults(analysis, 'in-out', 'netProfit', 'maximize', axesOf(small));
  assert.equal(results.ranked.length, 0);
  const diagnosis = filterDiagnosis(results, filters);
  const alone = (filter: FilterCondition) =>
    viewTrials(analysis.trials, 'Net profit', [metricConstraint(filter)]).filter(
      (trial) => trial.valid && !trial.excluded,
    ).length;
  assert.deepEqual(
    diagnosis.map((item) => item.passing),
    filters.map(alone),
  );
  const factors = analysis.trials.map((trial) => constraintValue(trial, 'Profit factor')!);
  const drawdowns = analysis.trials.map((trial) =>
    constraintValue(trial, reportMetrics.maxDrawdown)!,
  );
  assert.deepEqual(
    diagnosis.map((item) => item.best),
    [null, Math.max(...factors), Math.min(...drawdowns)],
  );
  assert.deepEqual(
    filterDiagnosis(
      rankResults(inOut.analysis, 'in-out', 'netProfit', 'maximize', axesOf(small)),
      filters,
    ),
    [],
  );
});

test('a draft condition previews the sets and page ranks it would drop (R10)', () => {
  const draft: FilterCondition = { metric: 'profitFactor', operator: '>=', value: 1.2 };
  const { analysis } = analyze(small, 'in-out', { constraintDraft: metricConstraint(draft) });
  const results = rankResults(analysis, 'in-out', 'netProfit', 'maximize', axesOf(small));
  const failing = results.ranked.flatMap((trial, index) =>
    (constraintValue(trial, 'Profit factor') ?? -Infinity) < 1.2 ? [index + 1] : [],
  );
  const preview = draftPreview(results, draft, 0);
  assert.equal(preview.excluded, failing.length);
  assert.deepEqual(
    preview.pageRanks,
    failing.filter((rank) => rank <= leaderboardPageSize),
  );
});

test('the map exposes both surfaces, slices and cell values (R4, R6, R7)', () => {
  const wide = searchSpace([2, 31], ['close', 'hl2', 'ohlc4']);
  const { analysis } = analyze(wide, 'in-out');
  const results = rankResults(analysis, 'in-out', 'netProfit', 'maximize', axesOf(wide));
  const view = mapView(results, 'in', {})!;
  assert.equal(view.x, 'Length');
  assert.equal(view.y, 'Source');
  assert.equal(view.binned, true);
  assert.equal(view.panel.display?.xBinSize, 2);
  assert.equal(mapView(results, 'out', {})!.surface, 'out');
  const cell = view.panel.cells.find((item) => item.value !== null && item.xValues?.length === 2)!;
  const values = cellValues(analysis, cell);
  assert.equal(values.values.length, 2);
  const outMap = analysis.maps.find((item) => item.surface === 'out')!.map;
  for (const value of values.values) {
    const full = view.map.cells.find((item) => item.x === value.x && item.y === value.y)!;
    assert.equal(value.inSample, full.value);
    assert.equal(
      value.outOfSample,
      outMap.cells.find((item) => item.x === value.x && item.y === value.y)!.value,
    );
  }
  assert.equal(values.mean.inSample, (values.values[0].inSample! + values.values[1].inSample!) / 2);
  const detail = binDetail(view, cell)!;
  assert.deepEqual(detail.selectedCell, cell);
  assert.equal(detail.mergedCells.length, 2);

  const layered = generateSearchSpace(descriptors, {
    ranges: {
      Length: { from: 3, to: 6, step: 1 },
      Multiplier: { from: 1, to: 1.5, step: 0.25 },
      Source: { values: ['close', 'hl2'] },
    },
  });
  const sliced = analyze(layered, 'none');
  const slicedResults = rankResults(
    sliced.analysis,
    'none',
    'netProfit',
    'maximize',
    axesOf(layered),
  );
  const fixed = mapView(slicedResults, 'out', {})!;
  assert.equal(fixed.surface, 'all');
  assert.equal(fixed.slices.length, 1);
  const [chip] = fixed.slices;
  const { x, y } = sliced.analysis.axes;
  assert.deepEqual([chip.title, x, y].sort(), ['Length', 'Multiplier', 'Source']);
  assert.deepEqual(
    [chip.mode, chip.value],
    ['fixed', sliced.analysis.heatmapSelection?.parameters[chip.title]],
  );
  const chosen = mapView(slicedResults, 'in', { [chip.title]: { mode: 'max' } })!.slices[0];
  assert.equal(chosen.mode, 'max');
  const pinned = mapView(slicedResults, 'in', {
    [chip.title]: { mode: 'fixed', value: chip.values.at(-1) },
  })!.slices[0];
  assert.equal(pinned.value, chip.values.at(-1));
});

test('one searched input draws a curve with its range near the peak (R8)', () => {
  const single = searchSpace([3, 14], ['close']);
  const { analysis } = analyze(single, 'in-out');
  const results = rankResults(analysis, 'in-out', 'netProfit', 'maximize', axesOf(single));
  assert.equal(mapView(results, 'in', {}), null);
  const curve = curveView(results)!;
  assert.equal(curve.input, 'Length');
  assert.equal(curve.points.length, 12);
  const values = curve.points.map((point) => point.inSample!);
  const peak = values.indexOf(Math.max(...values));
  assert.equal(curve.peak, curve.points[peak].x);
  const from = curve.points.findIndex((point) => point.x === curve.nearPeak!.from);
  const to = curve.points.findIndex((point) => point.x === curve.nearPeak!.to);
  for (let index = from; index <= to; index++)
    assert.ok(values[index] >= values[peak] - 0.1 * Math.abs(values[peak]));
  for (const edge of [from - 1, to + 1])
    if (edge >= 0 && edge < values.length)
      assert.ok(values[edge] < values[peak] - 0.1 * Math.abs(values[peak]));
  const point = curve.points[peak];
  assert.equal(point.neighbourhoodMean, analysis.neighbors[point.trialId!]);
  assert.notEqual(point.outOfSample, null);
});

test('sensitivity marks the map axes on its rows (R12)', () => {
  const results = rankResults(inOut.analysis, 'in-out', 'netProfit', 'maximize', axesOf(small));
  const view = sensitivityView(results);
  assert.deepEqual(
    view.rows.map((row) => [row.parameter, row.role]),
    inOut.analysis.sensitivity.parameters.map((row) => [
      row.parameter,
      row.parameter === inOut.analysis.axes.x ? 'x' : 'y',
    ]),
  );
});

test('failed combinations keep inputs and error, and export as CSV (R11)', () => {
  const source = strategySource.replace(
    'plot(basis',
    'if length == 4 and bar_index == 50\n    runtime.error("bad, \\"four\\"")\nplot(basis',
  );
  const trials = engineTrials(
    source,
    common,
    [3, 4].map((Length) => ({ inputs: { Length, Source: 'close' } })),
  );
  assert.equal(failedCombination(trials[0], 'all'), null);
  const failure = failedCombination(trials[1], 'in')!;
  assert.deepEqual(failure, {
    trialId: trials[1].trialId,
    parameters: { Length: 4, Source: 'close' },
    range: 'in',
    kind: 'runtime',
    line: 12,
    bar: 50,
    message: 'bad, "four"',
  });
  assert.equal(
    failuresCsv(
      [failure],
      ['Length', 'Multiplier', 'Source'],
      { kind: 'Error', line: 'Line', bar: 'Bar', message: 'Message' },
      {
        syntax: '',
        undeclared: '',
        type: '',
        semantic: '',
        unsupported: '',
        limit: '',
        runtime: 'Runtime error',
        internal: '',
      },
    ),
    'Length,Multiplier,Source,Error,Line,Bar,Message\r\n4,,close,Runtime error,12,50,"bad, ""four"""\r\n',
  );
});

test('the median curve takes each bar from the curves that reach it', () => {
  assert.deepEqual(
    medianCurve([
      [1, 5, 9],
      [3, 1],
      [2, 2, 4, 7],
    ]),
    [2, 2, 6.5, 7],
  );
});

test('the distribution takes a sample larger than an argument list', () => {
  const trials = Array.from({ length: 300_000 }, (_, index) => ({
    trialId: String(index),
    parameters: {},
    valid: true,
    excluded: false,
    objectiveValue: null,
    inSampleValue: null,
    outOfSampleValue: null,
    inSampleMetrics: { 'Performance/Net profit/All USD': index - 100_000 },
  }));
  const analysis = { trials, ranked: [], neighbors: {} } as unknown as OptimizerAnalysis;
  const view = distributionView(rankResults(analysis, 'none', 'netProfit', 'maximize', []));
  assert.equal(view.inSample.sets, 300_000);
  assert.equal(view.inSample.profitable, 199_999);
  assert.equal(view.start, -100_000);
  assert.equal(view.width, 10_000);
});
