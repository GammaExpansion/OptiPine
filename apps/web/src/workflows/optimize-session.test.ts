import assert from 'node:assert/strict';
import test from 'node:test';
import { runWithEquity, type MarketBar, type RunInput } from '@pine/engine';
import { optimizerMessage, scoreMetric, splitBars } from '@pine/optimizer';
import {
  OptimizationCompileError,
  WorkerCrashedError,
  workerMessage,
  type AnalysisRunView,
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
  session.setSearched('Multiplier', false);
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

/** Answer the held Top 20 reproductions, including the next batch of leading sets. */
async function finishEquity(h: Harness): Promise<void> {
  while (h.pool.reproductions.some((held) => !held.settled)) {
    for (const held of h.pool.reproductions.filter((item) => !item.settled))
      held.resolve(
        runWithEquity(strategySource, { ...held.common, inputs: held.parameters.inputs }),
      );
    await settle();
  }
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

test('default ranges follow the current values until a run takes them (O1, B17)', async () => {
  const engine = engineHarness();
  const backtest = new BacktestSession(engine.client);
  backtest.setSource(strategySource);
  await engine.answerAll();
  backtest.setDataset(dataset);
  const pool = new FakePool();
  const session = new OptimizationSession(backtest, pool, new FakeAnalysis(), { threads: 2 });
  const multiplier = () =>
    session.getState().search.rows.find((row) => row.descriptor.title === 'Multiplier')!.draft;
  assert.deepEqual(multiplier()?.values, { kind: 'range', from: 0.5, to: 2, step: 0.25 });
  backtest.setInput('Multiplier', 2);
  assert.deepEqual(multiplier()?.values, { kind: 'range', from: 1, to: 4, step: 0.25 });
  void session.start();
  session.cancel();
  // Applying a set from the results writes the inputs; the ranges the run took stay.
  const key = session.getState().search.key;
  backtest.setInput('Multiplier', 1.5);
  assert.deepEqual(multiplier()?.values, { kind: 'range', from: 1, to: 4, step: 0.25 });
  assert.equal(session.getState().search.key, key);
  session.dispose();
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
  assert.equal(run.options.immutableParameters, true);
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
      window: null,
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
  // The run opens in the analysis Worker with the trials so far, then a view of them.
  assert.deepEqual(h.analysis.kinds, ['runOpen', 'runAppend', 'runView']);
  const [, firstAppend, firstView] = h.analysis.requests;
  assert.equal((firstAppend.input as { trials: OptimizationTrial[] }).trials.length, 3);
  assert.deepEqual((firstView.input as { summary: unknown }).summary, {
    metrics: [
      'Net profit',
      'Profit factor',
      'Performance/Max drawdown (intrabar)/All %',
      'Total trades',
    ],
    fullMaps: false,
  });

  emit(run, 3, 6);
  h.timers.advance(250);
  assert.equal(h.states.length, published + 2);
  assert.deepEqual(h.analysis.kinds, ['runOpen', 'runAppend', 'runView']);
  for (let answered = 0; answered < 3; answered++) h.analysis.answer();
  await settle();
  state = h.session.getState();
  assert.equal(state.views?.inProgress, true);
  assert.equal(state.views?.completed, 3);
  assert.equal(state.views?.leaderboard.total, 3);
  assert.equal(state.views?.pending, true);
  assert.equal(state.results, null);
  // A queued snapshot waits until 250 ms after the previous reply, even when analysis was slow.
  assert.deepEqual(h.analysis.kinds, []);
  const distribution = state.views?.distribution;
  h.timers.advance(249);
  assert.deepEqual(h.analysis.kinds, []);
  h.timers.advance(1);
  assert.equal(h.session.getState().views?.distribution, distribution);
  // Only the three new trials travel; progress did not rebuild the unchanged analysis views.
  assert.deepEqual(h.analysis.kinds, ['runAppend', 'runView']);
  assert.equal((h.analysis.requests[0].input as { trials: OptimizationTrial[] }).trials.length, 3);
  await h.analysis.answerAll();
  assert.equal(h.session.getState().views?.completed, 6);
  assert.equal(h.session.getState().views?.pending, false);

  emit(run, 6, 8);
  run.resolve();
  await settle();
  const outside = h.pool.active!;
  assert.deepEqual(outside.common.bars, split.outOfSample);
  assert.equal(outside.options.immutableParameters, true);
  assert.equal(outside.parameters, run.parameters, 'both ranges borrow the same private sets');
  assert.equal(outside.common.realtimeTail, true);
  const phase = h.session.getState().run;
  assert.deepEqual(phase.status === 'running' && [phase.progress.phase, phase.progress.completed], [
    'out',
    8,
  ]);
  emit(outside, 0, 3);
  h.timers.advance(250);
  await h.analysis.answerAll();
  state = h.session.getState();
  // Every set has its IS result; three have their OOS result so far.
  assert.equal(state.views?.completed, 8);
  assert.equal(
    state.views?.leaderboard.rows.filter((row) => row.outOfSample?.netProfit !== null).length,
    3,
  );
  emit(outside, 3, 8);
  outside.resolve();
  await settle();
  state = h.session.getState();
  assert.equal(state.run.status === 'running' && state.run.progress.phase, 'analyzing');
  assert.equal(h.timers.scheduled, 0);
  await h.analysis.answerAll();
  await running;
  state = h.session.getState();
  assert.deepEqual(state.run, { status: 'done', startedAt: 1_000, finishedAt: 2_000 });
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
  assert.equal(views?.scatter?.inSample.length, 8);
  assert.equal(views?.distribution.inSample.sets, 8);
  assert.equal(views?.unvalidated, false);
});

test('the OOS boundary discards the pending IS snapshot timer', async () => {
  const h = await harness();
  const { running } = await begin(h);
  const inside = h.pool.active!;
  emit(inside, 0, 8);
  h.timers.advance(200);
  inside.resolve();
  await settle();
  const outside = h.pool.active!;
  assert.notEqual(outside, inside);
  emit(outside, 0, 1);
  const published = h.states.length;
  h.timers.advance(50);
  assert.equal(h.states.length, published);
  h.timers.advance(199);
  assert.equal(h.states.length, published);
  h.timers.advance(1);
  assert.ok(h.states.length > published);
  h.session.cancel();
  await running;
});

test('cancel stops every Worker at once and the previous results stay (3.1)', async () => {
  const h = await harness();
  const first = await complete(h);
  h.session.setRange('Length', { from: 3, to: 5 });
  const { running } = await begin(h);
  const run = h.pool.active!;
  emit(run, 0, 4);
  h.timers.advance(250);
  assert.deepEqual(h.analysis.kinds, ['runOpen', 'runAppend', 'runView']);
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
  // The cancelled run is released in the Worker; its late analysis is dropped.
  assert.deepEqual(h.analysis.kinds, ['runOpen', 'runAppend', 'runView', 'runClose']);
  await h.analysis.answerAll();
  state = h.session.getState();
  assert.equal(state.views?.completed, 8);
  assert.equal(state.results, first);
  emit(run, 4, 6);
  assert.equal(h.timers.scheduled, 0);
  // The results' run is still held: a new view of them sends no trial.
  h.session.setSmooth(true);
  await settle();
  assert.deepEqual(h.analysis.kinds, ['runView']);
  await h.analysis.answerAll();
  assert.equal(h.session.getState().views?.completed, 8);
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
  assert.deepEqual(h.analysis.kinds, ['runView']);
  h.session.setDirection('minimize');
  h.session.addFilter({ metric: 'trades', operator: '>=', value: 1 });
  h.session.setSmooth(true);
  assert.deepEqual(h.analysis.kinds, ['runView']);
  assert.equal(h.session.getState().views?.pending, true);
  h.analysis.answer();
  await settle();
  assert.equal(h.session.getState().views?.summary, before.summary);
  assert.deepEqual(h.analysis.kinds, ['runView']);
  const input = (h.analysis.requests[0].input as { view: AnalysisRunView }).view;
  assert.equal(input.objective, 'Sharpe ratio');
  assert.equal(input.direction, 'minimize');
  assert.deepEqual(input.constraints, [{ metric: 'Total trades', operator: '>=', value: 1 }]);
  assert.equal(input.neighborhood, true);
  await h.analysis.answerAll();
  const views = h.session.getState().views!;
  assert.equal(views.pending, false);
  assert.notEqual(views.summary, before.summary);
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
  const first = h.pool.reproductions[0];
  assert.deepEqual(first.common.bars, dataset.bars);
  assert.deepEqual(first.parameters, { inputs: state.views!.leaderboard.rows[0].parameters });

  // A changed ranking aborts reproduction before its replacement analysis is ready.
  const filter = { metric: 'netProfit' as const, operator: '>=' as const, value: -1e12 };
  h.session.addFilter(filter);
  h.session.setObjective('profitFactor');
  assert.equal(first.signal?.aborted, true);
  await settle();
  assert.equal(h.session.getState().topEquity.status, 'running');
  await h.analysis.answerAll();
  const reordered = h.session.getState().views!.leaderboard.rows.map((row) => row.trialId);

  await finishEquity(h);
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

test('diagnostics identify the current analysis and Top 20 requests', async () => {
  const h = await harness();
  await complete(h);
  let diagnostics = h.session.getDiagnostics();
  const state = h.session.getState();
  assert.equal(diagnostics.topEquity.status, 'running');
  assert.equal(diagnostics.topEquity.requestActive, true);
  assert.equal(typeof diagnostics.topEquity.key, 'string');
  assert.equal(typeof diagnostics.viewKey, 'string');
  assert.equal(typeof diagnostics.analysisKey, 'string');
  assert.equal(diagnostics.leaderboardFirstTrialId, state.views!.leaderboard.rows[0].trialId);
  assert.equal(diagnostics.run.status, 'done');
  assert.equal(diagnostics.lastAnalysisRequestAt, 1_000);
  assert.equal(diagnostics.lastReproductionRequestAt, 1_000);
  const requestKey = diagnostics.topEquity.key;

  await finishEquity(h);
  diagnostics = h.session.getDiagnostics();
  assert.equal(diagnostics.topEquity.status, 'ready');
  assert.equal(diagnostics.topEquity.requestActive, false);
  assert.equal(diagnostics.topEquity.key, requestKey);
});

test('Top 20 ready always belongs to the current objective, direction and filters', async () => {
  const h = await harness();
  await complete(h);
  await finishEquity(h);
  const reproductions = h.pool.reproductions.length;
  const changes = [
    () => h.session.setObjective('profitFactor'),
    () => h.session.setDirection('minimize'),
    () => h.session.addFilter({ metric: 'netProfit', operator: '>=', value: -1e12 }),
    () => h.session.removeFilter(0),
    () => h.session.addFilter({ metric: 'netProfit', operator: '>=', value: 1e12 }),
    () => h.session.removeFilter(0),
  ];
  for (const change of changes) {
    assert.equal(h.session.getState().topEquity.status, 'ready');
    const published = h.states.length;
    change();
    assert.equal(h.session.getState().topEquity.status, 'running');
    assert.deepEqual(h.session.getState().topEquity.curves, []);
    await settle();
    assert.ok(h.states.slice(published).every((state) => state.topEquity.status === 'running'));
    await h.analysis.answerAll();
    const state = h.session.getState();
    assert.equal(state.topEquity.status, 'ready');
    assert.deepEqual(
      state.topEquity.curves.map((curve) => curve.trialId),
      state.views!.leaderboard.rows.map((row) => row.trialId),
    );
  }
  assert.equal(h.pool.reproductions.length, reproductions);
});

test('Top 20 resumes a cached ranking when a pending ranking change is undone', async () => {
  const h = await harness();
  await complete(h);
  await finishEquity(h);
  const before = h.session.getState().topEquity;
  const reproductions = h.pool.reproductions.length;
  h.session.setObjective('profitFactor');
  h.session.setObjective('netProfit');
  assert.equal(h.session.getState().topEquity.status, 'running');
  assert.deepEqual(h.analysis.kinds, ['runView']);
  await h.analysis.answerAll();
  assert.deepEqual(h.session.getState().topEquity, before);
  assert.equal(h.pool.reproductions.length, reproductions);
});

test('Top 20 stays ready for map, selection, draft and unchanged ranking settings', async () => {
  const h = await harness();
  await complete(h);
  await finishEquity(h);
  const before = h.session.getState().topEquity;
  const changes = [
    () => h.session.setObjective('netProfit'),
    () => h.session.setDirection('maximize'),
    () => h.session.removeFilter(99),
    () => h.session.setDraftFilter({ metric: 'netProfit', operator: '>=', value: 0 }),
    () => h.session.setAxis('x', 'Source'),
    () => h.session.setSlice('Length', { mode: 'mean' }),
    () => h.session.setSmooth(true),
    () => h.session.setSurface('out'),
    () => h.session.select(before.curves[1].trialId),
    () => h.session.setPage(1),
  ];
  for (const change of changes) {
    change();
    assert.equal(h.session.getState().topEquity, before);
    await h.analysis.answerAll();
    assert.equal(h.session.getState().topEquity, before);
  }
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
      failure.bar,
      failure.message,
    ]),
    [
      [4, 'close', 'all', 'runtime', 12, 20, 'four'],
      [4, 'hl2', 'all', 'runtime', 12, 20, 'four'],
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
    /^Length,Source,Kind,Line,Bar,Message\r\n4,close,Runtime error,12,20,four\r\n/,
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
  const input = (h.analysis.requests[0].input as { view: AnalysisRunView }).view;
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
  assert.equal(state.views?.summary, before.summary);
  h.session.setSmooth(false);
  await settle();
  assert.equal(h.session.getState().analysisError, null);
});

test('the neighbourhood objective is ranked by the analysis Worker for IS / OOS too', async () => {
  const h = await harness();
  await complete(h);
  h.session.setObjective('neighbourhoodMean');
  await settle();
  const input = (h.analysis.requests[0].input as { view: AnalysisRunView }).view;
  assert.deepEqual([input.objective, input.rankBy], ['Net profit', 'neighborhood']);
  await h.analysis.answerAll();
  const views = h.session.getState().views!;
  const scores = views.leaderboard.rows.map((row) => row.score!);
  assert.deepEqual(
    scores,
    [...scores].sort((a, b) => b - a),
  );
  assert.deepEqual(
    views.leaderboard.rows.map((row) => row.score),
    views.leaderboard.rows.map((row) => row.neighbourhoodMean),
  );
  // The map's fixed slices and the selection bar follow the neighbourhood's best set.
  const best = views.leaderboard.rows[0];
  assert.equal(views.selection?.row.trialId, best.trialId);
  assert.equal(h.session.getState().run.status, 'done');
  h.session.setObjective('netProfit');
  await settle();
  assert.equal((h.analysis.requests[0].input as { view: AnalysisRunView }).view.rankBy, undefined);
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
  const input = (h.analysis.requests[0].input as { view: AnalysisRunView }).view;
  assert.equal(input.selectedTrialId, second.trialId);
  await h.analysis.answerAll();
  const selection = h.session.getState().views!.selection!;
  assert.equal(selection.explicit, true);
  assert.deepEqual(selection.origin, {
    kind: 'rank',
    optimizationId: results.id,
    trialId: second.trialId,
    rank: 2,
    profits: { inSample: second.inSample.netProfit, outOfSample: second.outOfSample!.netProfit },
  });
  const preview = h.backtest.preview(selection.row.parameters, selection.origin);
  await h.engine.answerAll();
  await preview;
  const previewed = h.backtest.getState().preview!;
  assert.deepEqual({ ...previewed.result?.computedWith.inputs }, { ...second.parameters });
});

test('selecting a set reveals its page, including reselecting it after browsing away', async () => {
  const h = await harness();
  h.session.setRange('Length', { from: 3, to: 20 });
  const results = await complete(h);
  h.session.setPage(1);
  const row = h.session.getState().views!.leaderboard.rows[0];
  assert.equal(row.rank, 14);
  for (let attempt = 0; attempt < 2; attempt++) {
    h.session.setPage(0);
    h.session.select(row.trialId);
    assert.equal(h.session.getState().views!.leaderboard.page, 1);
    assert.equal(h.session.getState().views!.selection!.row.trialId, row.trialId);
    await h.analysis.answerAll();
  }
  assert.equal(h.session.getState().results, results);
});

test('axes follow the user, swapping when an input takes another axis (R4, R12)', async () => {
  const h = await harness();
  await complete(h);
  assert.deepEqual(h.session.getState().views!.summary.axes, {
    x: 'Length',
    y: 'Source',
    z: undefined,
  });
  h.session.setAxis('x', 'Source');
  assert.deepEqual(h.session.getState().viewSettings.axes, { x: 'Source', y: 'Length' });
  const input = (h.analysis.requests[0].input as { view: AnalysisRunView }).view;
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

test('the map colours around the objective break-even, best cells at the profit end (R4)', async () => {
  const h = await harness();
  await complete(h);
  const view = () => (h.analysis.requests[0].input as { view: AnalysisRunView }).view;
  const panel = () => h.session.getState().views!.map!.panel;
  assert.deepEqual(panel().scale, { direction: 'maximize', breakEven: 0 });
  h.session.setObjective('profitFactor');
  assert.equal(view().breakEven, 1);
  await h.analysis.answerAll();
  assert.equal(panel().display?.breakEven, 1);
  // A drawdown has no break-even, and the smallest one is the best.
  h.session.setObjective('maxDrawdown');
  assert.deepEqual([view().direction, view().breakEven], ['minimize', undefined]);
  await h.analysis.answerAll();
  const values = panel().cells.flatMap((cell) => (cell.value === null ? [] : [cell.value]));
  const top = panel().cells.find((cell) => cell.rankBin === 8);
  assert.equal(top?.value, Math.min(...values));
  assert.equal(panel().display?.best, Math.min(...values));
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
  assert.deepEqual(h.session.getState().readiness.reasons, [
    workflowMessage('optimize.wf.planning'),
  ]);
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
  assert.deepEqual(state.readiness.reasons, []);

  h.session.setValidation({ walkForward: { stepMonths: 1 } });
  await h.analysis.answerAll();
  state = h.session.getState();
  assert.deepEqual(
    state.plan.status === 'failed' && state.plan.error,
    optimizerMessage('stepOverlappingWindows'),
  );
  assert.deepEqual(state.readiness.reasons, [workflowMessage('optimize.fixErrors', { count: 1 })]);
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
  session.setSearched('Multiplier', false);
  session.removeFilter(0);
  session.removeFilter(0);
  session.addFilter({ metric: 'netProfit', operator: '>=', value: 11_000 });
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
  const splitAt = top.splitIndex! - 1;
  for (const [index, curve] of top.curves.entries()) {
    assert.ok(Math.abs(curve.equity![splitAt] - 10_000 - rows[index].inSample.netProfit!) < 1e-6);
    assert.ok(curve.equity![splitAt] <= top.curves[0].equity![splitAt]);
  }

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
 * Trial ids as the run should rank them: sets with an IS profit of at least 11,000, by IS
 * profit, ties by trial id.
 */
function expectedRanking(sets: readonly Record<string, unknown>[], input: RunInput): string[] {
  const trials = engineTrials(
    strategySource,
    input,
    sets.map((inputs) => ({ inputs })),
  );
  return trials
    .filter((trial) => scoreMetric(trial.metrics, 'Net profit')! >= 11_000)
    .sort(
      (a, b) =>
        scoreMetric(b.metrics, 'Net profit')! - scoreMetric(a.metrics, 'Net profit')! ||
        a.trialId.localeCompare(b.trialId),
    )
    .map((trial) => trial.trialId);
}

test('another opened script drops the results and stops a run; an edit keeps them (R5)', async () => {
  const h = await harness();
  await complete(h);
  await finishEquity(h);
  h.session.select(h.session.getState().views!.leaderboard.rows[1].trialId);
  // An edit of the same script keeps the results, outdated.
  h.backtest.setSource(`${strategySource}\n// edited`);
  await h.engine.answerAll();
  assert.deepEqual(h.session.getState().outdated, { reasons: ['source'] });

  const other = strategySource.replace('"Test strategy"', '"Other strategy"');
  h.backtest.setSource(other, true);
  await h.engine.answerAll();
  // The results' run is released in the Worker, and a late view of it is dropped.
  assert.deepEqual(h.analysis.kinds.slice(-1), ['runClose']);
  await h.analysis.answerAll();
  let state = h.session.getState();
  assert.equal(state.results, null);
  assert.equal(state.outdated, null);
  assert.equal(state.views, null);
  assert.equal(state.walkForward, null);
  assert.equal(state.topEquity.status, 'idle');
  assert.deepEqual(state.run, { status: 'idle' });
  assert.equal(state.viewSettings.selectedTrialId, null);
  assert.equal(state.runBlock.rerun, false);

  // A run in progress belongs to the script it started with: it stops, and nothing replaces it.
  const { running } = await begin(h);
  emit(h.pool.active!, 0, 2);
  h.backtest.setSource(strategySource, true);
  await running;
  await h.engine.answerAll();
  await h.analysis.answerAll();
  assert.equal(h.pool.cancels, 1);
  state = h.session.getState();
  assert.deepEqual(state.run, { status: 'idle' });
  assert.equal(state.results, null);
  assert.equal(state.views, null);
});
