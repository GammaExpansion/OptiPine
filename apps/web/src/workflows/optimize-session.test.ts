import assert from 'node:assert/strict';
import test from 'node:test';
import { runWithEquity, type MarketBar, type RunInput } from '@pine/engine';
import {
  optimizerMessage,
  scoreMetric,
  splitBars,
  type OptimizerAnalysisInput,
} from '@pine/optimizer';
import {
  OptimizationCompileError,
  WorkerCrashedError,
  workerMessage,
  type OptimizationTrial,
} from '@pine/workers';
import { BacktestSession, type DatasetInput } from './backtest.ts';
import { workflowMessage } from './messages.ts';
import { estimateDurationMs } from './optimize-setup.ts';
import { OptimizationSession, type OptimizationState } from './optimize-session.ts';
import { failuresCsv, medianCurve } from './optimize-views.ts';
import {
  engineHarness,
  engineTrials,
  FakeAnalysis,
  FakePool,
  localWorkers,
  ManualTimers,
  settle,
  strategySource,
  syntheticBars,
  type HeldRun,
} from './test-support.ts';

const dataset: DatasetInput = {
  bars: syntheticBars(300),
  syminfo: { mintick: 0.01, mincontract: 0.001, timezone: 'Etc/UTC', currency: 'USD' },
  timeframe: '60',
  realtimeTail: true,
  strategyClosePending: false,
};

/**
 * A session over a compiled Backtest page with fake Workers and a manual clock. The search is
 * Length 3–6 and Source close or hl2: 8 combinations; no filter, so every set is ranked.
 */
async function harness(source = strategySource, threads = 3) {
  const engine = engineHarness();
  const timers = new ManualTimers();
  timers.now = 1_000;
  const backtest = new BacktestSession(engine.client, { now: () => timers.now });
  backtest.setSource(source);
  await engine.answerAll();
  backtest.setDataset(dataset);
  const pool = new FakePool();
  const analysis = new FakeAnalysis();
  const session = new OptimizationSession(backtest, pool, analysis, {
    threads,
    now: () => timers.now,
    timers,
  });
  session.setRange('Length', { from: 3, to: 6 });
  session.setValueKept('Source', 'ohlc4', false);
  session.removeFilter(0);
  session.removeFilter(0);
  const states: OptimizationState[] = [];
  session.subscribe((state) => states.push(state));
  return { engine, timers, backtest, pool, analysis, session, states };
}
type Harness = Awaited<ReturnType<typeof harness>>;

const trialCache = new WeakMap<HeldRun, OptimizationTrial[]>();
function trialsOf(run: HeldRun): OptimizationTrial[] {
  let trials = trialCache.get(run);
  if (!trials) {
    trials = engineTrials(run.source, run.common, run.parameters);
    trialCache.set(run, trials);
  }
  return trials;
}

function emit(run: HeldRun, from: number, to: number): void {
  for (const trial of trialsOf(run).slice(from, to)) run.options.onTrial!(trial);
}

/**
 * Start a run and answer its parameter list; the pool then holds the first range. The run comes
 * back wrapped, since awaiting it would wait for the whole run.
 */
async function begin(h: Harness): Promise<{ running: Promise<void> }> {
  const running = h.session.start();
  await settle();
  assert.deepEqual(h.analysis.kinds, ['parameters']);
  h.analysis.answer();
  await settle();
  return { running };
}

/** Run every range to the end without snapshots and answer the final analysis. */
async function complete(h: Harness) {
  const { running } = await begin(h);
  while (h.pool.active) {
    const run = h.pool.active;
    emit(run, 0, run.parameters.length);
    run.resolve();
    await settle();
  }
  await h.analysis.answerAll();
  await running;
  return h.session.getState().results!;
}

const split = splitBars(dataset.bars, { mode: 'in-out', splitRatio: 0.7 });

test('the setup follows the Backtest page and blocks the run with reasons (O1, O6)', async () => {
  const engine = engineHarness();
  const backtest = new BacktestSession(engine.client);
  const empty = new OptimizationSession(backtest, new FakePool(), new FakeAnalysis(), {
    threads: 7,
  });
  assert.deepEqual(empty.getState().readiness.reasons, [
    workflowMessage('backtest.noScript'),
    workflowMessage('backtest.noData'),
  ]);
  empty.dispose();

  const h = await harness();
  let state = h.session.getState();
  assert.equal(state.readiness.ok, true);
  assert.deepEqual(
    state.search.rows.map((row) => [row.descriptor.title, row.status, row.values.length]),
    [
      ['Length', 'searched', 4],
      ['Multiplier', 'fixed', 1],
      ['Source', 'searched', 2],
    ],
  );
  assert.deepEqual(state.runBlock, {
    combinations: 8,
    backtests: 16,
    windows: null,
    estimatedMs: null,
    threads: 3,
    rerun: false,
  });
  assert.deepEqual(state.dataRange.inSample?.bars, 210);

  h.session.setRange('Length', { from: 6, to: 3 });
  h.session.setValueKept('Source', 'close', false);
  h.session.setValueKept('Source', 'hl2', false);
  h.backtest.setProperty('pyramiding', 1.5);
  state = h.session.getState();
  assert.equal(state.runBlock.combinations, null);
  assert.deepEqual(state.readiness.reasons, [
    workflowMessage('backtest.propertyInvalid', {
      property: workflowMessage('backtest.property.pyramiding'),
    }),
    workflowMessage('optimize.fixErrors', { count: 2 }),
  ]);
  h.session.setValidation({ outOfSamplePercent: 100 });
  assert.deepEqual(
    h.session.getState().readiness.reasons.at(-1),
    workflowMessage('optimize.fixErrors', { count: 3 }),
  );
  await h.session.start();
  assert.equal(h.analysis.requests.length, 0);
});

test('the estimate uses the measured cost of a backtest, then of the last optimization', async () => {
  const h = await harness();
  const backtest = h.backtest.run();
  h.timers.now += 600;
  await h.engine.answerAll();
  await backtest;
  assert.equal(h.session.getState().runBlock.estimatedMs, estimateDurationMs(600 / 300, 300, 8, 3));
  await complete(h);
  // The fake pool reports 100 ms on 2 Workers for each range: 400 Worker-ms for 8 × 300 bars.
  assert.equal(
    h.session.getState().runBlock.estimatedMs,
    estimateDurationMs(400 / 2400, 300, 8, 3),
  );
  h.session.setValidation({ mode: 'none' });
  assert.equal(h.session.getState().runBlock.backtests, 8);
});

test('trials stream into a buffer; subscribers see a snapshot at most every 250 ms (3.2, O8)', async () => {
  const h = await harness();
  const { running } = await begin(h);
  const run = h.pool.active!;
  assert.equal(run.parameters.length, 8);
  assert.deepEqual(run.parameters[0], { inputs: { Multiplier: 1, Length: 3, Source: 'close' } });
  assert.deepEqual(run.common.bars, split.inSample);
  assert.equal(run.common.realtimeTail, false);
  assert.equal(run.options.workerCount, 3);
  assert.equal(run.options.sourceRevision, h.backtest.getState().sourceRevision);
  assert.deepEqual(h.session.getState().run.status === 'running' && h.session.getState().run, {
    status: 'running',
    startedAt: 1_000,
    progress: {
      phase: 'in',
      combinations: 8,
      completed: 0,
      total: 16,
      failed: 0,
      elapsedMs: 0,
      remainingMs: null,
      workers: 0,
    },
  });

  const published = h.states.length;
  emit(run, 0, 3);
  run.options.onProgress!({
    completed: 3,
    total: 8,
    workers: 3,
    calibratedMs: 5,
    elapsedMs: 30,
    remainingMs: 50,
    errorCount: 0,
  });
  assert.equal(h.states.length, published);
  assert.equal(h.timers.scheduled, 1);
  h.timers.advance(249);
  assert.equal(h.states.length, published);
  h.timers.advance(1);
  assert.equal(h.states.length, published + 1);
  let state = h.session.getState();
  assert.equal(state.run.status === 'running' && state.run.progress.completed, 3);
  // The OOS range is still ahead: (30 + 50) ms for 210 bars, so 80 × 90 / 210 more.
  assert.equal(state.run.status === 'running' && state.run.progress.remainingMs, 50 + 34);
  assert.deepEqual(h.analysis.kinds, ['records']);

  emit(run, 3, 6);
  h.timers.advance(250);
  assert.equal(h.states.length, published + 2);
  assert.deepEqual(h.analysis.kinds, ['records']);
  h.analysis.answer();
  await settle();
  h.analysis.answer();
  await settle();
  state = h.session.getState();
  assert.equal(state.views?.inProgress, true);
  assert.equal(state.views?.completed, 3);
  assert.equal(state.views?.leaderboard.total, 3);
  assert.equal(state.views?.pending, true);
  assert.equal(state.results, null);
  // The snapshot taken meanwhile is computed next, with all six trials.
  assert.deepEqual(h.analysis.kinds, ['records']);
  assert.equal(
    (h.analysis.requests[0].input as { groups: OptimizationTrial[][] }).groups[0].length,
    6,
  );
  await h.analysis.answerAll();
  assert.equal(h.session.getState().views?.completed, 6);
  assert.equal(h.session.getState().views?.pending, false);

  emit(run, 6, 8);
  run.resolve();
  await settle();
  const outside = h.pool.active!;
  assert.deepEqual(outside.common.bars, split.outOfSample);
  assert.equal(outside.common.realtimeTail, true);
  assert.deepEqual(outside.parameters, run.parameters);
  emit(outside, 0, 8);
  outside.resolve();
  await settle();
  state = h.session.getState();
  assert.equal(state.run.status === 'running' && state.run.progress.phase, 'analyzing');
  assert.equal(h.timers.scheduled, 0);
  await h.analysis.answerAll();
  await running;
  state = h.session.getState();
  assert.deepEqual(state.run, { status: 'done', startedAt: 1_000, finishedAt: 1_500 });
  assert.equal(state.views?.inProgress, false);
  assert.equal(state.views?.completed, 8);
  assert.equal(state.results?.mode, 'in-out');
  assert.equal(state.results?.combinations, 8);
  assert.equal(state.results?.computedWith.inSampleBars, 210);
  assert.equal(state.runBlock.rerun, true);
});

test('IS and OOS are joined by trial id into rows the engine agrees with', async () => {
  const h = await harness();
  await complete(h);
  const { views } = h.session.getState();
  assert.equal(views?.leaderboard.passing, 8);
  for (const row of views!.leaderboard.rows) {
    const inside = runWithEquity(strategySource, {
      ...dataset,
      bars: split.inSample,
      realtimeTail: false,
      inputs: row.parameters,
    });
    const outside = runWithEquity(strategySource, {
      ...dataset,
      bars: split.outOfSample,
      inputs: row.parameters,
    });
    assert.equal(row.inSample.netProfit, scoreMetric(inside.metrics, 'Net profit'));
    assert.equal(row.outOfSample?.netProfit, scoreMetric(outside.metrics, 'Net profit'));
  }
  const nets = views!.leaderboard.rows.map((row) => row.inSample.netProfit!);
  assert.deepEqual(
    nets,
    [...nets].sort((a, b) => b - a),
  );
  assert.equal(views?.scatter?.points.length, 8);
  assert.equal(views?.distribution.inSample.sets, 8);
  assert.equal(views?.unvalidated, false);
});

test('cancel stops every Worker at once and the previous results stay (3.1)', async () => {
  const h = await harness();
  const first = await complete(h);
  h.session.setRange('Length', { from: 3, to: 5 });
  const { running } = await begin(h);
  const run = h.pool.active!;
  emit(run, 0, 4);
  h.timers.advance(250);
  assert.deepEqual(h.analysis.kinds, ['records']);
  assert.equal(h.session.getState().views, null);
  h.timers.now += 100;
  h.session.cancel();
  await running;
  assert.equal(h.pool.cancels, 1);
  let state = h.session.getState();
  assert.deepEqual(state.run, { status: 'cancelled', startedAt: 1_000, finishedAt: 1_350 });
  assert.equal(state.results, first);
  assert.equal(state.views?.inProgress, false);
  assert.equal(state.views?.completed, 8);
  assert.deepEqual(state.outdated, { reasons: ['ranges'] });
  // The live run's analysis arrives late and is dropped.
  await h.analysis.answerAll();
  state = h.session.getState();
  assert.equal(state.views?.completed, 8);
  assert.equal(state.results, first);
  emit(run, 4, 6);
  assert.equal(h.timers.scheduled, 0);
});

test('a failed run reports its compile errors or Worker error and keeps the results', async () => {
  const h = await harness();
  const first = await complete(h);
  let { running } = await begin(h);
  const diagnostics = [{ kind: 'runtime' as const, line: 3, message: 'compile' }];
  h.pool.active!.reject(new OptimizationCompileError(diagnostics));
  await running;
  let state = h.session.getState();
  assert.equal(state.run.status === 'failed' && state.run.failure.diagnostics, diagnostics);
  assert.equal(state.results, first);
  assert.equal(state.views?.inProgress, false);

  ({ running } = await begin(h));
  h.pool.active!.reject(new WorkerCrashedError());
  await running;
  state = h.session.getState();
  assert.deepEqual(state.run.status === 'failed' && state.run.failure, {
    diagnostics: [],
    error: workerMessage('engineWorkerCrashed'),
  });
  assert.equal(state.results, first);
});

test('a newer view request replaces a waiting one; older settings never show (3.2)', async () => {
  const h = await harness();
  await complete(h);
  const before = h.session.getState().views!;
  h.session.setObjective('sharpeRatio');
  assert.deepEqual(h.analysis.kinds, ['view']);
  h.session.setDirection('minimize');
  h.session.addFilter({ metric: 'trades', operator: '>=', value: 1 });
  h.session.setSmooth(true);
  assert.deepEqual(h.analysis.kinds, ['view']);
  assert.equal(h.session.getState().views?.pending, true);
  h.analysis.answer();
  await settle();
  assert.equal(h.session.getState().views?.analysis, before.analysis);
  assert.deepEqual(h.analysis.kinds, ['view']);
  const input = h.analysis.requests[0].input as OptimizerAnalysisInput;
  assert.equal(input.objective, 'Sharpe ratio');
  assert.equal(input.direction, 'minimize');
  assert.deepEqual(input.constraints, [{ metric: 'Total trades', operator: '>=', value: 1 }]);
  assert.equal(input.neighborhood, true);
  await h.analysis.answerAll();
  const views = h.session.getState().views!;
  assert.equal(views.pending, false);
  assert.notEqual(views.analysis, before.analysis);
  const scores = views.leaderboard.rows.map((row) => row.score!);
  assert.deepEqual(
    scores,
    [...scores].sort((a, b) => a - b),
  );
  // Neither the page nor the IS / OOS surface needs an analysis.
  h.session.setSurface('out');
  h.session.setPage(1);
  await settle();
  assert.deepEqual(h.analysis.kinds, []);
  assert.equal(h.session.getState().views?.map?.surface, 'out');
});

test('view settings never outdate results; ranges, validation, properties and data do (R5)', async () => {
  const h = await harness();
  const results = await complete(h);
  const reasons = () => h.session.getState().outdated?.reasons;
  h.session.setObjective('profitFactor');
  h.session.addFilter({ metric: 'winRate', operator: '>=', value: 45 });
  h.session.setDraftFilter({ metric: 'trades', operator: '<=', value: 6 });
  h.session.setAxis('x', 'Source');
  h.session.setSlice('Length', { mode: 'mean' });
  h.session.setSmooth(true);
  h.session.setSurface('out');
  h.session.select(h.session.getState().views!.leaderboard.rows[1].trialId);
  assert.deepEqual(reasons(), []);
  h.session.setRange('Length', { step: 2 });
  assert.deepEqual(reasons(), ['ranges']);
  h.session.setRange('Length', { step: 1 });
  assert.deepEqual(reasons(), []);
  h.session.setSampling({ method: 'random', count: 4 });
  assert.deepEqual(reasons(), ['ranges']);
  h.session.setSampling({ method: 'grid' });
  h.session.setValidation({ outOfSamplePercent: 20 });
  assert.deepEqual(reasons(), ['validation']);
  h.session.setValidation({ outOfSamplePercent: 30 });
  h.backtest.setInput('Multiplier', 1.5);
  assert.deepEqual(reasons(), ['ranges']);
  h.backtest.setInput('Multiplier', 1);
  h.backtest.setProperty('commission', 0);
  assert.deepEqual(reasons(), ['properties']);
  h.backtest.resetProperties();
  h.backtest.setDataset(dataset);
  assert.deepEqual(reasons(), ['data']);
  assert.equal(h.session.getState().results, results);
  assert.deepEqual(results.computedWith.validation.outOfSamplePercent, 30);
  assert.equal(results.computedWith.dataset.input, dataset);
});

test('Top 20 equity reruns the leading sets over the whole range; a newer ranking aborts it (R1)', async () => {
  const h = await harness();
  const results = await complete(h);
  let state = h.session.getState();
  assert.equal(state.topEquity.status, 'running');
  assert.equal(h.pool.reproductions.length, 3);
  const ranked = state.views!.leaderboard.rows.map((row) => row.trialId);
  const first = h.pool.reproductions[0];
  assert.deepEqual(first.common.bars, dataset.bars);
  assert.deepEqual(first.parameters, { inputs: state.views!.leaderboard.rows[0].parameters });

  // A filter that keeps fewer sets reorders the top: the running request is aborted.
  const filter = { metric: 'netProfit' as const, operator: '>=' as const, value: -1e12 };
  h.session.addFilter(filter);
  h.session.setObjective('profitFactor');
  await h.analysis.answerAll();
  const reordered = h.session.getState().views!.leaderboard.rows.map((row) => row.trialId);
  const changed = reordered.join() !== ranked.join();
  assert.equal(first.signal?.aborted, changed);

  const finish = async () => {
    while (h.pool.reproductions.some((held) => !held.settled)) {
      for (const held of h.pool.reproductions.filter((item) => !item.settled))
        held.resolve(
          runWithEquity(strategySource, { ...held.common, inputs: held.parameters.inputs }),
        );
      await settle();
    }
  };
  await finish();
  state = h.session.getState();
  assert.equal(state.topEquity.status, 'ready');
  assert.equal(state.topEquity.resultsId, results.id);
  assert.deepEqual(
    state.topEquity.curves.map((curve) => curve.trialId),
    reordered,
  );
  const equity = state.topEquity.curves.map((curve) => curve.equity!);
  const expected = runWithEquity(strategySource, {
    ...dataset,
    inputs: state.views!.leaderboard.rows[0].parameters,
  });
  assert.deepEqual(equity[0], expected.equity);
  assert.deepEqual(state.topEquity.median, medianCurve(equity));
  assert.equal(state.topEquity.splitIndex, 210);
  assert.equal(state.topEquity.times.length, 300);

  // Curves already computed for these results are reused for a new order.
  const count = h.pool.reproductions.length;
  h.session.setObjective('netProfit');
  await h.analysis.answerAll();
  await settle();
  assert.equal(h.pool.reproductions.length, count);
  assert.equal(h.session.getState().topEquity.status, 'ready');
});

test('failed combinations are not ranked and keep their error (R11)', async () => {
  const source = strategySource.replace(
    'plot(basis',
    'if length == 4 and bar_index == 20\n    runtime.error("four")\nplot(basis',
  );
  const h = await harness(source);
  h.session.setValidation({ mode: 'none' });
  const { running } = await begin(h);
  const run = h.pool.active!;
  assert.deepEqual(run.common.bars, dataset.bars);
  emit(run, 0, 8);
  h.timers.advance(250);
  const state = h.session.getState();
  assert.equal(state.run.status === 'running' && state.run.progress.failed, 2);
  run.resolve();
  await settle();
  await h.analysis.answerAll();
  await running;
  const { results, views } = h.session.getState();
  assert.deepEqual(
    results!.failures.map((failure) => [
      failure.parameters.Length,
      failure.parameters.Source,
      failure.range,
      failure.kind,
      failure.line,
      failure.message,
    ]),
    [
      [4, 'close', 'all', 'runtime', 12, 'four'],
      [4, 'hl2', 'all', 'runtime', 12, 'four'],
    ],
  );
  assert.equal(views?.failed, 2);
  assert.equal(views?.leaderboard.passing, 6);
  assert.equal(views?.leaderboard.total, 8);
  assert.equal(
    views!.leaderboard.rows.some((row) => row.parameters.Length === 4),
    false,
  );
  assert.match(
    failuresCsv(
      results!.failures,
      ['Length', 'Source'],
      { kind: 'Kind', line: 'Line', bar: 'Bar', message: 'Message' },
      { runtime: 'Runtime error' } as never,
    ),
    /^Length,Source,Kind,Line,Bar,Message\r\n4,close,Runtime error,12,,four\r\n/,
  );
});

test('a draft condition is previewed by the analysis; adding it applies it (R10)', async () => {
  const h = await harness();
  await complete(h);
  const draft = { metric: 'netProfit' as const, operator: '>=' as const, value: Infinity };
  h.session.setDraftFilter(draft);
  await settle();
  assert.equal(h.session.getState().views?.draftPreview, null);
  // An invalid value is not previewed: nothing to compute.
  assert.deepEqual(h.analysis.kinds, []);
  const valid = { ...draft, value: 0 };
  h.session.setDraftFilter(valid);
  await settle();
  const input = h.analysis.requests[0].input as OptimizerAnalysisInput;
  assert.deepEqual(input.constraintDraft, { metric: 'Net profit', operator: '>=', value: 0 });
  await h.analysis.answerAll();
  let views = h.session.getState().views!;
  const losing = views.leaderboard.rows.filter((row) => row.inSample.netProfit! < 0);
  assert.deepEqual(views.draftPreview, {
    filter: valid,
    excluded: losing.length,
    pageRanks: losing.map((row) => row.rank),
  });
  h.session.addFilter({ ...valid, value: Number.NaN });
  assert.equal(h.session.getState().viewSettings.filters.length, 0);
  h.session.addFilter(valid);
  assert.deepEqual(h.session.getState().viewSettings, {
    ...h.session.getState().viewSettings,
    filters: [valid],
    draft: null,
  });
  await h.analysis.answerAll();
  views = h.session.getState().views!;
  assert.equal(views.draftPreview, null);
  assert.equal(views.leaderboard.passing, 8 - losing.length);
  assert.deepEqual(h.session.getState().outdated?.reasons, []);
});

test('when no set passes, each filter reports how it does alone (R9)', async () => {
  const h = await harness();
  await complete(h);
  h.session.addFilter({ metric: 'trades', operator: '>=', value: 1 });
  h.session.addFilter({ metric: 'profitFactor', operator: '>=', value: 1e9 });
  await h.analysis.answerAll();
  const views = h.session.getState().views!;
  assert.equal(views.leaderboard.passing, 0);
  assert.equal(views.selection, null);
  assert.deepEqual(
    views.filterDiagnosis.map((item) => [item.filter.metric, item.passing, item.best === null]),
    [
      ['trades', 8, true],
      ['profitFactor', 0, false],
    ],
  );
  h.session.removeFilter(1);
  await h.analysis.answerAll();
  assert.deepEqual(h.session.getState().views!.filterDiagnosis, []);
});

test('an analysis failure is reported and the last views stay', async () => {
  const h = await harness();
  await complete(h);
  const before = h.session.getState().views!;
  h.session.setSmooth(true);
  h.analysis.requests[0].reject(new WorkerCrashedError(workerMessage('analysisWorkerCrashed')));
  await settle();
  const state = h.session.getState();
  assert.deepEqual(state.analysisError, workerMessage('analysisWorkerCrashed'));
  assert.equal(state.views?.analysis, before.analysis);
  h.session.setSmooth(false);
  await settle();
  assert.equal(h.session.getState().analysisError, null);
});

test('validation None ranks the full range and marks results unvalidated (R3)', async () => {
  const h = await harness();
  h.session.setValidation({ mode: 'none' });
  assert.equal(h.session.getState().unvalidated, true);
  h.session.setObjective('neighbourhoodMean');
  await complete(h);
  const views = h.session.getState().views!;
  assert.equal(views.unvalidated, true);
  assert.equal(views.scatter, null);
  assert.equal(views.distribution.outOfSample, null);
  const rows = views.leaderboard.rows;
  assert.equal(rows[0].outOfSample, null);
  assert.equal(rows[0].score, rows[0].neighbourhoodMean);
  const scores = rows.map((row) => row.score!);
  assert.deepEqual(
    scores,
    [...scores].sort((a, b) => b - a),
  );
});

test('the selection gives the set to preview or apply on the Backtest page (3.3, B16)', async () => {
  const h = await harness();
  const results = await complete(h);
  const second = h.session.getState().views!.leaderboard.rows[1];
  h.session.select(second.trialId);
  const input = h.analysis.requests[0].input as OptimizerAnalysisInput;
  assert.equal(input.selectedTrialId, second.trialId);
  await h.analysis.answerAll();
  const selection = h.session.getState().views!.selection!;
  assert.equal(selection.explicit, true);
  assert.deepEqual(selection.origin, {
    kind: 'rank',
    optimizationId: results.id,
    trialId: second.trialId,
    rank: 2,
  });
  const preview = h.backtest.preview(selection.row.parameters, selection.origin);
  await h.engine.answerAll();
  await preview;
  const previewed = h.backtest.getState().preview!;
  assert.deepEqual({ ...previewed.result?.computedWith.inputs }, { ...second.parameters });
});

test('axes follow the user, swapping when an input takes another axis (R4, R12)', async () => {
  const h = await harness();
  await complete(h);
  assert.deepEqual(h.session.getState().views!.analysis.axes, {
    x: 'Length',
    y: 'Source',
    z: undefined,
  });
  h.session.setAxis('x', 'Source');
  assert.deepEqual(h.session.getState().viewSettings.axes, { x: 'Source', y: 'Length' });
  const input = h.analysis.requests[0].input as OptimizerAnalysisInput;
  assert.deepEqual(
    [input.axes, input.preserveAxisOrientation],
    [{ x: 'Source', y: 'Length' }, true],
  );
  await h.analysis.answerAll();
  const map = h.session.getState().views!.map!;
  assert.deepEqual([map.x, map.y], ['Source', 'Length']);
  assert.deepEqual(
    h.session
      .getState()
      .views!.sensitivity.rows.map((row) => [row.parameter, row.role])
      .sort(),
    [
      ['Length', 'y'],
      ['Source', 'x'],
    ],
  );
});

test('walk-forward settings are planned and checked by the analysis job (O3)', async () => {
  const daily: MarketBar[] = syntheticBars(730).map((bar, index) => ({
    ...bar,
    time: Date.UTC(2024, 0, 1) / 1000 + index * 86400,
  }));
  const h = await harness();
  h.backtest.setDataset({ ...dataset, bars: daily });
  h.session.setValidation({ mode: 'walk-forward' });
  await settle();
  assert.equal(h.session.getState().plan.status, 'planning');
  assert.deepEqual(h.analysis.kinds, ['plan']);
  await h.analysis.answerAll();
  let state = h.session.getState();
  assert.equal(state.plan.status, 'planned');
  const windows = state.plan.status === 'planned' ? state.plan.windows : [];
  assert.equal(windows.length, 4);
  assert.deepEqual(
    [windows[0].inSampleStart, windows[0].outOfSampleStart, windows[0].inSampleBars],
    [Date.UTC(2024, 0, 1) / 1000, Date.UTC(2025, 0, 1) / 1000, 366],
  );
  assert.equal(windows[3].partial, true);
  assert.equal(state.runBlock.backtests, 4 * 8);
  assert.deepEqual(state.readiness.reasons, [workflowMessage('optimize.walkForwardUnavailable')]);

  h.session.setValidation({ walkForward: { stepMonths: 1 } });
  await h.analysis.answerAll();
  state = h.session.getState();
  assert.deepEqual(
    state.plan.status === 'failed' && state.plan.error,
    optimizerMessage('stepOverlappingWindows'),
  );
  assert.deepEqual(state.readiness.reasons, [
    workflowMessage('optimize.fixErrors', { count: 1 }),
    workflowMessage('optimize.walkForwardUnavailable'),
  ]);
  h.session.setValidation({ walkForward: { stepMonths: 3 } });
  await settle();
  assert.deepEqual(h.analysis.kinds, ['plan']);
  await h.analysis.answerAll();
  assert.equal(h.session.getState().plan.status, 'planned');
  h.session.setValidation({ mode: 'in-out' });
  h.session.setValidation({ mode: 'walk-forward' });
  await settle();
  assert.deepEqual(h.analysis.kinds, []);
});

test('a real run on the Worker pool ranks what the engine computes, and cancel ends it', async () => {
  const engine = engineHarness();
  const backtest = new BacktestSession(engine.client);
  backtest.setSource(strategySource);
  await engine.answerAll();
  backtest.setDataset(dataset);
  const workers = localWorkers();
  const session = new OptimizationSession(backtest, workers.pool, workers.analysis, {
    threads: 2,
  });
  session.setRange('Length', { from: 3, to: 6 });
  session.setValueKept('Source', 'ohlc4', false);
  session.removeFilter(0);
  session.removeFilter(0);
  session.addFilter({ metric: 'netProfit', operator: '>=', value: 10_000 });
  await session.start();
  const state = session.getState();
  assert.equal(state.run.status, 'done');
  const rows = state.views!.leaderboard.rows;
  assert.equal(state.views!.leaderboard.total, 8);
  const inSample: RunInput = { ...dataset, bars: split.inSample, realtimeTail: false };
  const sets = [3, 4, 5, 6].flatMap((Length) =>
    ['close', 'hl2'].map((Source) => ({ Multiplier: 1, Length, Source })),
  );
  const passing = expectedRanking(sets, inSample);
  assert.deepEqual(
    rows.map((row) => row.trialId),
    passing,
  );
  for (let wait = 0; session.getState().topEquity.status !== 'ready' && wait < 200; wait++)
    await settle();
  const top = session.getState().topEquity;
  assert.ok(rows.length > 0 && rows.length < 8);
  assert.equal(top.curves.length, rows.length);
  assert.deepEqual(
    top.curves[0].equity,
    runWithEquity(strategySource, { ...dataset, inputs: rows[0].parameters }).equity,
  );

  session.setRange('Length', { from: 3, to: 12 });
  const running = session.start();
  for (let wait = 0; !workers.engineWorkers.length && wait < 50; wait++) await settle();
  session.cancel();
  await running;
  assert.equal(session.getState().run.status, 'cancelled');
  assert.ok(workers.engineWorkers.every((worker) => worker.terminated));
  assert.equal(session.getState().views?.leaderboard.total, 8);
  session.dispose();
  workers.analysis.dispose();
});

/**
 * Trial ids as the run should rank them: sets with an IS net profit of at least 10,000, by IS net
 * profit, ties by trial id.
 */
function expectedRanking(sets: readonly Record<string, unknown>[], input: RunInput): string[] {
  const trials = engineTrials(
    strategySource,
    input,
    sets.map((inputs) => ({ inputs })),
  );
  return trials
    .filter((trial) => scoreMetric(trial.metrics, 'Net profit')! >= 10_000)
    .sort(
      (a, b) =>
        scoreMetric(b.metrics, 'Net profit')! - scoreMetric(a.metrics, 'Net profit')! ||
        a.trialId.localeCompare(b.trialId),
    )
    .map((trial) => trial.trialId);
}
