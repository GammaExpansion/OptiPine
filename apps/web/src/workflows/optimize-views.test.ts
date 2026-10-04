import assert from 'node:assert/strict';
import test from 'node:test';
import { describe, runWithEquity, type RunInput } from '@pine/engine';
import {
  analyzeOptimizer,
  constraintValue,
  enumerateGrid,
  generateSearchSpace,
  prepareHeatmap,
  scoreMetric,
  splitBars,
  summarizeOptimizerAnalysis,
  viewTrials,
  type OptimizerAnalysisInput,
  type OptimizerSummary,
  type SearchSpace,
  type TrialRecord,
} from '@pine/optimizer';
import { handleAnalysisRequest, type OptimizationTrial } from '@pine/workers';
import {
  metricConstraint,
  reportMetrics,
  type FilterCondition,
  type ObjectiveId,
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
  leaderboardPageSize,
  leaderboardView,
  leadingSets,
  mapView,
  medianCurve,
  rankResults,
  scatterView,
  selectionOf,
  sensitivityView,
  summaryRequest,
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
function sweep(space: SearchSpace, mode: ValidationResultMode): OptimizationTrial[][] {
  const sets = enumerateGrid(space).map((inputs) => ({ inputs }));
  if (mode === 'none') return [engineTrials(strategySource, common, sets)];
  const split = splitBars(common.bars, { mode: 'in-out', splitRatio: 0.7 });
  return [
    engineTrials(strategySource, { ...common, bars: split.inSample }, sets),
    engineTrials(strategySource, { ...common, bars: split.outOfSample }, sets),
  ];
}

const axesOf = (space: SearchSpace) =>
  space.activeAxes.map((axis) => ({ title: axis.title, values: axis.values }));

/**
 * The summary the analysis Worker answers for a run of these trials, after its trip across the
 * Worker boundary, and the views' results over it.
 */
function analyze(
  space: SearchSpace,
  mode: ValidationResultMode,
  options: Partial<OptimizerAnalysisInput> = {},
  { filters = [], fullMaps = true }: { filters?: FilterCondition[]; fullMaps?: boolean } = {},
) {
  const groups = sweep(space, mode);
  const response = handleAnalysisRequest({
    requestId: 1,
    kind: 'records',
    input: { groups, objective: 'Net profit' },
  });
  const records = (response as { output: TrialRecord[] }).output;
  const analysis = analyzeOptimizer({
    trials: records,
    resultSpace: space,
    mode,
    resultMode: mode,
    objective: 'Net profit',
    direction: 'maximize',
    constraints: filters.map(metricConstraint),
    ...options,
  });
  const summary: OptimizerSummary = structuredClone(
    summarizeOptimizerAnalysis(analysis, summaryRequest(filters, fullMaps)),
  );
  const results = (objective: ObjectiveId = 'netProfit') =>
    rankResults(summary, groups[0], mode, objective, 'maximize', axesOf(space));
  return { groups, analysis, summary, results };
}

const small = searchSpace([3, 10], ['close', 'hl2']);
const inOut = analyze(small, 'in-out');

test('R9 preserves sampled values, sensitivity and descriptive Top 20 without a selectable rank', () => {
  const filters: FilterCondition[] = [{ metric: 'trades', operator: '>=', value: 1_000_000 }];
  const filtered = analyze(small, 'in-out', {}, { filters });
  const results = filtered.results();
  assert.equal(leaderboardView(results, 0).passing, 0);
  assert.equal(selectionOf(results, null, 1), null);
  assert.equal(filterDiagnosis(results, filters)[0].passing, 0);
  assert.notEqual(filterDiagnosis(results, filters)[0].best, null);
  assert.deepEqual(sensitivityView(results), sensitivityView(inOut.results()));
  assert.deepEqual(leadingSets(results, 20), []);
  const view = mapView(results, 'in', {})!;
  assert.ok(view.map!.cells.every((cell) => cell.value !== null));
  assert.ok(view.map!.cells.every((cell) => !cell.trialId));
  const panel = prepareHeatmap(view.map!, { x: 2, y: 1 });
  const detail = binDetail(view, panel.cells[0], panel)!;
  assert.ok(detail);
  assert.deepEqual(detail.selectedCell.xValues, panel.cells[0].xValues);
  assert.deepEqual(detail.selectedCell.yValues, panel.cells[0].yValues);
  const values = cellValues(filtered.summary, panel.cells[0]);
  assert.equal(values.values.length, 8);
  assert.ok(values.values.every((value) => value.inSample !== null && value.outOfSample !== null));
});

test('a filtered single-input curve retains neighbourhood means but cannot select excluded sets', () => {
  const space = searchSpace([3, 6], ['close']);
  const baseline = curveView(analyze(space, 'in-out').results())!;
  const filtered = curveView(
    analyze(
      space,
      'in-out',
      {},
      { filters: [{ metric: 'trades', operator: '>=', value: 1_000_000 }] },
    ).results(),
  )!;
  assert.deepEqual(
    filtered.points.map((point) => point.neighbourhoodMean),
    baseline.points.map((point) => point.neighbourhoodMean),
  );
  assert.ok(filtered.points.every((point) => point.trialId === null));
});

test('the summary request covers the figures and every filter metric once', () => {
  assert.deepEqual(
    summaryRequest(
      [
        { metric: 'trades', operator: '>=', value: 30 },
        { metric: 'winRate', operator: '>=', value: 45 },
      ],
      false,
    ),
    {
      metrics: [
        reportMetrics.netProfit,
        reportMetrics.profitFactor,
        reportMetrics.maxDrawdown,
        reportMetrics.trades,
        reportMetrics.winRate,
      ],
      fullMaps: false,
    },
  );
});

test('the leaderboard pages ranked sets with IS and OOS figures (R1, R4)', () => {
  const results = inOut.results();
  const view = leaderboardView(results, 0);
  assert.equal(view.passing, 16);
  assert.equal(view.total, 16);
  assert.equal(view.pageCount, 2);
  assert.equal(view.rows.length, leaderboardPageSize);
  assert.deepEqual(view.columns, [inOut.summary.axes.x, inOut.summary.axes.y]);
  assert.deepEqual(
    view.rows.map((row) => row.trialId),
    inOut.analysis.ranked.slice(0, leaderboardPageSize).map((trial) => trial.trialId),
  );
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
  assert.equal(first.inSample.profitFactor, scoreMetric(inside.metrics, 'Profit factor'));
  assert.equal(
    first.inSample.maxDrawdownPercent,
    inside.metrics['Performance/Max drawdown (intrabar)/All %'],
  );
  assert.equal(first.score, first.objective.inSample);
  assert.equal(first.neighbourhoodMean, inOut.analysis.neighbors[first.trialId]);
  const last = leaderboardView(results, 9);
  assert.equal(last.page, 1);
  assert.deepEqual(
    last.rows.map((row) => row.rank),
    [14, 15, 16],
  );
  assert.deepEqual(
    leadingSets(results, 3).map((set) => set.trialId),
    view.rows.slice(0, 3).map((row) => row.trialId),
  );
});

test('ranked by the neighbourhood mean, rows follow the Worker and score by it', () => {
  const byNeighbourhood = analyze(small, 'in-out', { rankBy: 'neighborhood' });
  const view = leaderboardView(byNeighbourhood.results('neighbourhoodMean'), 0);
  assert.deepEqual(
    view.rows.map((row) => row.trialId),
    byNeighbourhood.analysis.ranked.slice(0, leaderboardPageSize).map((trial) => trial.trialId),
  );
  for (const row of view.rows) assert.equal(row.score, row.neighbourhoodMean);
  const scores = view.rows.map((row) => row.score!);
  assert.deepEqual(
    scores,
    [...scores].sort((a, b) => b - a),
  );
});

test('the selection bar holds the picked row, or #1, with its origin', () => {
  const results = inOut.results();
  const third = inOut.analysis.ranked[2].trialId;
  const picked = selectionOf(results, third, 4)!;
  assert.equal(picked.explicit, true);
  assert.equal(picked.row.rank, 3);
  assert.deepEqual(picked.origin, { kind: 'rank', optimizationId: 4, trialId: third, rank: 3 });
  assert.deepEqual(Object.keys(picked.row.parameters).sort(), ['Length', 'Multiplier', 'Source']);
  const fallback = selectionOf(results, 'gone', 4)!;
  assert.deepEqual([fallback.explicit, fallback.row.rank], [false, 1]);
});

test('the scatter has one point per set and highlights the page (R2)', () => {
  const results = inOut.results();
  const scatter = scatterView(results, 1)!;
  assert.equal(scatter.inSample.length, 16);
  assert.deepEqual(scatter.pageRanks, [14, 16]);
  const best = scatter.rank.indexOf(1);
  const top = inOut.groups[0].findIndex(
    (trial) => trial.trialId === inOut.analysis.ranked[0].trialId,
  );
  assert.equal(scatter.inSample[best], scoreMetric(inOut.groups[0][top].metrics, 'Net profit'));
  assert.equal(scatter.outOfSample[best], scoreMetric(inOut.groups[1][top].metrics, 'Net profit'));
  assert.equal(scatterView(analyze(small, 'none').results(), 0), null);
});

test('the distribution bins IS and OOS net profit on shared round bins (R2b)', () => {
  const view = distributionView(inOut.results());
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
  assert.equal(view.best, inOut.analysis.ranked[0].inSampleValue);
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
  const { analysis, results } = analyze(small, 'in-out', {}, { filters });
  assert.equal(results().summary.ranked.length, 0);
  const diagnosis = filterDiagnosis(results(), filters);
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
  assert.deepEqual(filterDiagnosis(inOut.results(), filters), []);
});

test('a draft condition previews the sets and page ranks it would drop (R10)', () => {
  const draft: FilterCondition = { metric: 'profitFactor', operator: '>=', value: 1.2 };
  const { analysis, results } = analyze(small, 'in-out', {
    constraintDraft: metricConstraint(draft),
  });
  const failing = analysis.ranked.flatMap((trial, index) =>
    (constraintValue(trial, 'Profit factor') ?? -Infinity) < 1.2 ? [index + 1] : [],
  );
  const preview = draftPreview(results(), draft, 0);
  assert.equal(preview.excluded, failing.length);
  assert.deepEqual(
    preview.pageRanks,
    failing.filter((rank) => rank <= leaderboardPageSize),
  );
});

test('the map exposes both surfaces, slices and cell values (R4, R6, R7)', () => {
  const wide = searchSpace([2, 31], ['close', 'hl2', 'ohlc4']);
  const { analysis, summary, results } = analyze(wide, 'in-out');
  const view = mapView(results(), 'in', {})!;
  assert.equal(view.x, 'Length');
  assert.equal(view.y, 'Source');
  assert.equal(view.binned, true);
  assert.equal(view.panel.display?.xBinSize, 2);
  assert.equal(mapView(results(), 'out', {})!.surface, 'out');
  const cell = view.panel.cells.find((item) => item.value !== null && item.xValues?.length === 2)!;
  const values = cellValues(summary, cell);
  assert.equal(values.values.length, 2);
  const outMap = analysis.maps.find((item) => item.surface === 'out')!.map;
  for (const value of values.values) {
    const full = view.map!.cells.find((item) => item.x === value.x && item.y === value.y)!;
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

  // While a run streams, summaries leave out the full maps: binned cells have no detail yet.
  const streaming = analyze(wide, 'in-out', {}, { fullMaps: false });
  const binnedView = mapView(streaming.results(), 'in', {})!;
  assert.equal(binnedView.map, null);
  assert.equal(binDetail(binnedView, cell), undefined);
  assert.equal(cellValues(streaming.summary, cell).mean.inSample, null);

  const layered = generateSearchSpace(descriptors, {
    ranges: {
      Length: { from: 3, to: 6, step: 1 },
      Multiplier: { from: 1, to: 1.5, step: 0.25 },
      Source: { values: ['close', 'hl2'] },
    },
  });
  const sliced = analyze(layered, 'none');
  const fixed = mapView(sliced.results(), 'out', {})!;
  assert.equal(fixed.surface, 'all');
  assert.equal(fixed.slices.length, 1);
  const [chip] = fixed.slices;
  const { x, y } = sliced.summary.axes;
  assert.deepEqual([chip.title, x, y].sort(), ['Length', 'Multiplier', 'Source']);
  assert.deepEqual(
    [chip.mode, chip.value],
    ['fixed', sliced.analysis.heatmapSelection?.parameters[chip.title]],
  );
  const chosen = mapView(sliced.results(), 'in', { [chip.title]: { mode: 'max' } })!.slices[0];
  assert.equal(chosen.mode, 'max');
  const pinned = mapView(sliced.results(), 'in', {
    [chip.title]: { mode: 'fixed', value: chip.values.at(-1) },
  })!.slices[0];
  assert.equal(pinned.value, chip.values.at(-1));
});

test('one searched input draws a curve with its range near the peak (R8)', () => {
  const single = searchSpace([3, 14], ['close']);
  const { analysis, results } = analyze(single, 'in-out', {}, { fullMaps: false });
  assert.equal(mapView(results(), 'in', {}), null);
  const curve = curveView(results())!;
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
  const view = sensitivityView(inOut.results());
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

test('the views of 20,000 sets read columns, not trials, and stay fast', () => {
  const total = 20_000;
  const column = (value: (position: number) => number) =>
    Float64Array.from({ length: total }, (_, index) => value(index));
  const trials = Array.from({ length: total }, (_, index) => ({
    trialId: String(index),
    parameters: { inputs: { Length: index % 200, Mult: Math.floor(index / 200) } },
    metrics: {},
    tradeCount: 0,
    diagnostics: [],
  }));
  const net = column((index) => index - 5_000);
  const summary: OptimizerSummary = {
    total,
    ranked: Int32Array.from({ length: total / 2 }, (_, index) => total - 1 - index),
    selection: total - 1,
    columns: {
      valid: Uint8Array.from({ length: total }, () => 1),
      inSampleValue: net,
      outOfSampleValue: column((index) => -index),
      neighborhood: column((index) => index / 2),
      metrics: Object.fromEntries(
        summaryRequest([{ metric: 'trades', operator: '>=', value: 30 }], false).metrics!.map(
          (metric) => [metric, { inSample: net, outOfSample: net }],
        ),
      ),
    },
    axes: {},
    defaultAxes: [],
    maps: [],
    sensitivity: { parameters: [], sharedScale: null },
    removedConstraintRanks: new Int32Array(),
  };
  const started = performance.now();
  const results = rankResults(summary, trials, 'in-out', 'netProfit', 'maximize', []);
  const page = leaderboardView(results, 3);
  const scatter = scatterView(results, 3)!;
  const distribution = distributionView(results);
  selectionOf(results, '19990', 1);
  const elapsed = performance.now() - started;
  assert.equal(page.rows[0].rank, 40);
  assert.equal(page.rows[0].trialId, String(total - 40));
  assert.equal(scatter.inSample.length, total);
  assert.equal(distribution.inSample.sets, total);
  assert.equal(distribution.inSample.profitable, total - 5_001);
  assert.ok(elapsed < 50, `views took ${elapsed.toFixed(1)} ms`);
});
