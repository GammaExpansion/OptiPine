import assert from 'node:assert/strict';
import test from 'node:test';
import { runWithEquity, type RunInput } from '@pine/engine';
import { optimizerMessage, scoreMetric } from '@pine/optimizer';
import type { AnalysisJobs, OptimizationTrial } from '@pine/workers';
import { BacktestSession, type DatasetInput } from './backtest.ts';
import { workflowMessage } from './messages.ts';
import { OptimizationSession, type OptimizationState } from './optimize-session.ts';
import { windowRanges } from './walk-forward.ts';
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
  type HeldReproduction,
  type HeldRun,
} from './test-support.ts';

const day = 86_400;
const start = Date.UTC(2024, 0, 1) / 1000;
/** 180 daily bars from 2024-01-01 to 2024-06-28. */
const dataset: DatasetInput = {
  bars: syntheticBars(180).map((bar, index) => ({ ...bar, time: start + index * day })),
  syminfo: { mintick: 0.01, mincontract: 0.001, timezone: 'Etc/UTC', currency: 'USD' },
  timeframe: '1D',
  realtimeTail: true,
  strategyClosePending: false,
};
const index = (year: number, month: number) => (Date.UTC(year, month - 1, 1) / 1000 - start) / day;

/**
 * A session set for walk-forward with 2 IS months, 1 OOS month and a step of 1: four windows,
 * the last one partial, each searching Length 3–6 by Source close or hl2 with no filter.
 */
async function harness(walkForward: { anchored?: boolean } = {}) {
  const engine = engineHarness();
  const timers = new ManualTimers();
  timers.now = 1_000;
  const backtest = new BacktestSession(engine.client, { now: () => timers.now });
  backtest.setSource(strategySource);
  await engine.answerAll();
  backtest.setDataset(dataset);
  const pool = new FakePool();
  const analysis = new FakeAnalysis();
  const session = new OptimizationSession(backtest, pool, analysis, {
    threads: 3,
    now: () => timers.now,
    timers,
  });
  // Selection assertions compare raw IS net profit, independently of map smoothing defaults.
  session.setSmooth(false);
  session.setRange('Length', { from: 3, to: 6 });
  session.setValueKept('Source', 'ohlc4', false);
  session.setSearched('Multiplier', false);
  session.removeFilter(0);
  session.removeFilter(0);
  session.setValidation({
    mode: 'walk-forward',
    walkForward: { inSampleMonths: 2, outOfSampleMonths: 1, stepMonths: 1, ...walkForward },
  });
  await analysis.answerAll();
  assert.equal(session.getState().readiness.ok, true);
  return { engine, timers, backtest, pool, analysis, session };
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

/** What the pool's reproduction computes: `runWithEquity` with the set written in. */
function reproduce(held: HeldReproduction) {
  return runWithEquity(strategySource, {
    ...held.common,
    inputs: { ...held.common.inputs, ...held.parameters.inputs },
  });
}

/** Answer analysis requests and reproductions until nothing waits. */
async function drive(h: Harness, answer = reproduce) {
  for (;;) {
    await settle();
    if (h.analysis.requests.length) {
      h.analysis.answer();
      continue;
    }
    const held = h.pool.reproductions.filter((item) => !item.settled);
    if (!held.length) return;
    for (const item of held) item.resolve(answer(item));
  }
}

/** Run the active window's sweep to its end and everything that follows it. */
async function finishWindow(h: Harness, answer = reproduce) {
  const run = h.pool.active!;
  for (const trial of trialsOf(run)) run.options.onTrial!(trial);
  run.resolve();
  await drive(h, answer);
}

async function begin(h: Harness) {
  const running = h.session.start();
  await settle();
  assert.deepEqual(h.analysis.kinds, ['parameters']);
  h.analysis.answer();
  await settle();
  return { running };
}

async function complete(h: Harness, answer = reproduce) {
  const { running } = await begin(h);
  while (h.pool.active) await finishWindow(h, answer);
  await drive(h, answer);
  await running;
  await drive(h, answer);
  return h.session.getState();
}

const walkForward = (h: Harness) => h.session.getState().walkForward!;

/** The best set by IS net profit, ties by trial id, as the selection ranks them. */
function bestOf(trials: readonly OptimizationTrial[]): OptimizationTrial {
  return [...trials].sort(
    (a, b) =>
      scoreMetric(b.metrics, 'Net profit')! - scoreMetric(a.metrics, 'Net profit')! ||
      a.trialId.localeCompare(b.trialId),
  )[0];
}

const rangeOf = (input: RunInput) => [
  (input.bars[0].time - start) / day,
  (input.bars.at(-1)!.time - start) / day + 1,
];

test('each window optimizes its IS range, chooses a set and runs it on the OOS range (4.6)', async () => {
  const h = await harness();
  const state = await complete(h);
  assert.equal(state.run.status, 'done');
  const view = state.walkForward!;
  assert.equal(view.inProgress, false);
  assert.deepEqual(
    view.windows.map((row) => [row.status, row.plan.partial]),
    [
      ['done', false],
      ['done', false],
      ['done', false],
      ['done', true],
    ],
  );
  // Rolling: each IS range starts a month after the last; the OOS month follows it.
  assert.deepEqual(
    h.pool.runs.map((run) => rangeOf(run.common)),
    [
      [0, index(2024, 3)],
      [index(2024, 2), index(2024, 4)],
      [index(2024, 3), index(2024, 5)],
      [index(2024, 4), index(2024, 6)],
    ],
  );
  assert.ok(h.pool.runs.every((run) => run.common.realtimeTail === false));
  assert.ok(h.pool.runs.every((run) => run.options.immutableParameters));
  assert.ok(h.pool.runs.every((run) => run.parameters === h.pool.runs[0].parameters));
  let profitable = 0;
  for (const [at, row] of view.windows.entries()) {
    const best = bestOf(trialsOf(h.pool.runs[at]));
    assert.equal(row.trialId, best.trialId);
    assert.deepEqual(row.parameters, best.parameters.inputs);
    const [inSample, outOfSample] = h.pool.reproductions.slice(at * 2, at * 2 + 2);
    assert.deepEqual(rangeOf(inSample.common), rangeOf(h.pool.runs[at].common));
    const oos = runWithEquity(strategySource, {
      ...outOfSample.common,
      inputs: { ...outOfSample.parameters.inputs },
    });
    const inside = reproduce(inSample);
    assert.equal(row.inSample?.netProfit, inside.equity.at(-1)! - 10_000);
    assert.equal(row.outOfSample?.netProfit, oos.equity.at(-1)! - 10_000);
    profitable += Number(scoreMetric(oos.metrics, 'Net profit')! > 0);
    assert.equal(row.outOfSample?.trades, scoreMetric(oos.metrics, 'Total trades'));
    assert.equal(row.outOfSampleEquity.length, row.plan.outOfSampleBars);
    assert.equal(row.inSampleEquity.length, row.plan.inSampleBars);
    // The IS equity of the chosen set ends where its OOS range opens.
    assert.equal(row.inSampleEquity.at(-1), row.outOfSampleEquity[0] - (oos.equity[0] - 10_000));
    assert.equal(row.error, null);
  }
  // Only the last OOS range reaches the end of the data, with its realtime tail.
  const lastOut = h.pool.reproductions.at(-1)!.common;
  assert.equal(lastOut.realtimeTail, true);
  assert.equal(h.pool.reproductions.at(-3)!.common.realtimeTail, false);

  // The windows' OOS equity runs on one account, window after window.
  const rows = view.windows;
  for (let at = 1; at < rows.length; at++) {
    const previous = rows[at - 1].outOfSampleEquity.at(-1)!;
    const first = runWithEquity(strategySource, {
      ...h.pool.reproductions[at * 2 + 1].common,
      inputs: { ...h.pool.reproductions[at * 2 + 1].parameters.inputs },
    }).equity[0];
    assert.ok(Math.abs(rows[at].outOfSampleEquity[0] - (previous + first - 10_000)) < 1e-6);
  }
  assert.equal(view.equity.times.length, view.equity.values.length);
  assert.equal(view.equity.times[0], dataset.bars[index(2024, 3)].time);
  assert.equal(view.equity.times.at(-1), dataset.bars.at(-1)!.time);
  const nets = rows.map((row) => row.outOfSample!.netProfit!);
  assert.equal(view.totals.windows, 4);
  assert.equal(view.totals.completed, 4);
  assert.equal(view.totals.traded, 4);
  assert.equal(view.totals.profitable, profitable);
  assert.ok(Math.abs(view.totals.outOfSampleNet! - nets.reduce((a, b) => a + b, 0)) < 1e-6);
  assert.notEqual(view.totals.wfe, null);

  // Stability per searched input, and one set for every window with its mean loss.
  assert.deepEqual(
    view.stability?.rows.map((row) => [row.title, row.values, row.bands.length]),
    [
      ['Length', [3, 4, 5, 6], 4],
      ['Source', ['close', 'hl2'], 4],
    ],
  );
  assert.equal(view.stability?.tolerance, 0.1);
  assert.deepEqual(
    view.stability?.rows[0].bands.map((band) => band.chosen),
    rows.map((row) => row.parameters!.Length),
  );
  const fixed = view.fixed!;
  assert.deepEqual(fixed.parameters, {
    Multiplier: 1,
    Length: view.stability!.rows[0].fixed,
    Source: view.stability!.rows[1].fixed,
  });
  assert.ok(fixed.meanLoss === null || fixed.meanLoss >= 0);
  assert.deepEqual(fixed.origin, { kind: 'fixed', optimizationId: state.results!.id });

  // The results remember what they were computed with; the default selection is the last window.
  assert.equal(state.results?.mode, 'walk-forward');
  assert.equal(state.results?.windows, 4);
  assert.equal(state.results?.combinations, 8);
  assert.equal(state.views, null);
  assert.equal(view.selection?.window.plan.index, 3);
  assert.equal(view.selection?.explicit, false);
  assert.deepEqual(state.outdated, { reasons: [] });
  assert.equal(state.topEquity.status, 'idle');
});

test('live: finished windows fill in, the rest wait, totals and stability come last (W4)', async () => {
  const h = await harness();
  const { running } = await begin(h);
  const run = h.pool.active!;
  assert.equal(run.parameters.length, 8);
  let state = h.session.getState();
  assert.equal(state.run.status === 'running' && state.run.progress.window?.index, 0);
  assert.deepEqual(
    state.walkForward?.windows.map((row) => row.status),
    ['running', 'waiting', 'waiting', 'waiting'],
  );
  // Trials only move the progress, at most every 250 ms (3.2).
  for (const trial of trialsOf(run).slice(0, 3)) run.options.onTrial!(trial);
  run.options.onProgress!({
    completed: 3,
    total: 8,
    workers: 2,
    calibratedMs: 5,
    elapsedMs: 30,
    remainingMs: 50,
    errorCount: 0,
  });
  assert.equal(h.timers.scheduled, 1);
  h.timers.advance(250);
  state = h.session.getState();
  assert.ok(state.run.status === 'running');
  const progress = state.run.progress;
  assert.deepEqual(
    [progress.completed, progress.total, progress.window],
    [3, 8, { index: 0, count: 4 }],
  );
  // The three windows ahead run as many bars of IS as this one: 80 ms each.
  assert.equal(progress.remainingMs, 50 + Math.round((80 * (61 + 60 + 61)) / 60));
  assert.equal(state.walkForward?.windows[0].completed, 3);
  assert.deepEqual(h.analysis.kinds, []);

  for (const trial of trialsOf(run).slice(3)) run.options.onTrial!(trial);
  run.resolve();
  await drive(h);
  state = h.session.getState();
  const view = state.walkForward!;
  assert.deepEqual(
    view.windows.map((row) => row.status),
    ['done', 'running', 'waiting', 'waiting'],
  );
  assert.equal(view.inProgress, true);
  assert.equal(view.totals.completed, 1);
  assert.equal(view.totals.outOfSampleNet, view.windows[0].outOfSample?.netProfit);
  assert.equal(view.totals.wfe, null);
  assert.equal(view.stability, null);
  assert.equal(view.fixed, null);
  assert.equal(view.equity.times.length, view.windows[0].plan.outOfSampleBars);
  assert.equal(state.results, null);
  while (h.pool.active) await finishWindow(h);
  await running;
  assert.equal(h.session.getState().walkForward?.inProgress, false);
  assert.notEqual(h.session.getState().walkForward?.stability, null);
});

test('cancel stops every Worker at once and leaves the previous results (3.1)', async () => {
  const h = await harness();
  h.session.setValidation({ mode: 'in-out' });
  const { running: first } = await begin(h);
  while (h.pool.active) {
    const run = h.pool.active;
    for (const trial of trialsOf(run)) run.options.onTrial!(trial);
    run.resolve();
    await settle();
  }
  await drive(h);
  await first;
  const results = h.session.getState().results!;
  await drive(h);
  h.session.setValidation({ mode: 'walk-forward' });
  await drive(h);
  assert.deepEqual(h.session.getState().outdated, { reasons: ['validation'] });
  const { running } = await begin(h);
  await finishWindow(h);
  assert.equal(h.session.getState().walkForward?.windows[0].status, 'done');
  h.session.cancel();
  await running;
  const state = h.session.getState();
  assert.equal(state.run.status, 'cancelled');
  assert.equal(h.pool.cancels, 1);
  assert.equal(state.results, results);
  assert.equal(state.walkForward, null);
  assert.equal(state.views?.inProgress, false);
});

test('a window where no set passes stays flat on the account it was given (W5)', async () => {
  const h = await harness();
  await complete(h);
  const net = (trial: OptimizationTrial) => scoreMetric(trial.metrics, 'Net profit')!;
  const bests = h.pool.runs.map((run) => Math.max(...trialsOf(run).map(net)));
  // Only sets that beat the weakest window's best pass: that window has none.
  const threshold = Math.min(...bests) + 1;
  const flat = bests.map((best) => best < threshold);
  assert.ok(flat.some(Boolean) && !flat.every(Boolean));
  const reruns = h.pool.reproductions.length;
  h.session.addFilter({ metric: 'netProfit', operator: '>=', value: threshold });
  await drive(h);
  const { windows: rows, totals } = walkForward(h);
  for (const [at, row] of rows.entries()) {
    if (!flat[at]) {
      assert.equal(row.status, 'done');
      continue;
    }
    assert.equal(row.status, 'flat');
    assert.deepEqual(row.error, workflowMessage('optimize.wf.flat'));
    assert.deepEqual([row.trialId, row.parameters, row.outOfSample], [null, null, null]);
    const level =
      rows
        .slice(0, at)
        .findLast((item) => item.status === 'done')
        ?.outOfSampleEquity.at(-1) ?? 10_000;
    assert.equal(row.outOfSampleEquity.length, row.plan.outOfSampleBars);
    assert.ok(row.outOfSampleEquity.every((value) => value === level));
  }
  // The sets that still pass were chosen before: nothing reruns.
  assert.equal(h.pool.reproductions.length, reruns);
  const flats = flat.filter(Boolean).length;
  assert.deepEqual([totals.traded, totals.flat, totals.completed], [4 - flats, flats, 4]);
  assert.equal(walkForward(h).stability?.rows[0].bands.length, 4 - flats);
});

test('anchored windows all start their IS range with the data (W6)', async () => {
  const h = await harness({ anchored: true });
  const state = h.session.getState();
  assert.equal(state.plan.status === 'planned' && state.plan.windows.length, 4);
  await complete(h);
  assert.deepEqual(
    h.pool.runs.map((run) => rangeOf(run.common)),
    [
      [0, index(2024, 3)],
      [0, index(2024, 4)],
      [0, index(2024, 5)],
      [0, index(2024, 6)],
    ],
  );
  assert.equal(walkForward(h).windows[3].plan.partial, true);
});

test('a chosen set whose IS rerun disagrees with the sweep fails its window', async () => {
  const h = await harness();
  let calls = 0;
  await complete(h, (held) => {
    const result = reproduce(held);
    // The second window's IS rerun reports another net profit.
    if (calls++ === 2) {
      const key = Object.keys(result.metrics).find((name) => name.includes('Net profit'))!;
      return { ...result, metrics: { ...result.metrics, [key]: 1 } };
    }
    return result;
  });
  const view = walkForward(h);
  assert.equal(view.windows[1].status, 'failed');
  assert.deepEqual(
    view.windows[1].error,
    workflowMessage('optimize.wf.inSampleMismatch', { window: 2 }),
  );
  assert.equal(view.windows[1].outOfSample, null);
  const start = view.windows[0].plan.outOfSampleBars;
  const values = view.equity.values.slice(start, start + view.windows[1].plan.outOfSampleBars);
  assert.ok(values.every((value) => value === null));
  assert.deepEqual([view.totals.traded, view.totals.failed], [3, 1]);
  assert.equal(view.stability?.rows[0].bands.length, 3);
});

test('a tolerance change recomputes only the stability', async () => {
  const h = await harness();
  await complete(h);
  const before = walkForward(h);
  h.session.setStabilityTolerance(2);
  assert.equal(h.session.getState().viewSettings.tolerance, 0.1);
  h.session.setStabilityTolerance(0.5);
  await settle();
  assert.deepEqual(h.analysis.kinds, ['stability']);
  const input = h.analysis.requests[0].input as AnalysisJobs['stability']['input'];
  assert.equal(input.config.tolerance, 0.5);
  assert.equal(input.executions.length, 4);
  let view = walkForward(h);
  assert.equal(view.stability?.pending, true);
  assert.equal(view.stability?.tolerance, 0.5);
  await drive(h);
  view = walkForward(h);
  assert.equal(view.stability?.pending, false);
  const near = (rows: typeof view.stability) =>
    rows!.rows.flatMap((row) => row.bands.map((band) => band.near.length));
  assert.ok(near(view.stability).every((count, at) => count >= near(before.stability)[at]));
  assert.deepEqual(view.fixed, before.fixed);
  assert.equal(h.pool.reproductions.length, 8);
});

test('a ranking change chooses every window again and reruns only the sets that changed', async () => {
  const h = await harness();
  await complete(h);
  const before = walkForward(h);
  const reruns = h.pool.reproductions.length;
  h.session.setDirection('minimize');
  // Walk-forward results draw no Top 20 curves, so none are awaited.
  assert.equal(h.session.getState().topEquity.status, 'idle');
  await settle();
  assert.deepEqual(h.analysis.kinds, ['choose']);
  assert.equal(walkForward(h).pending, true);
  assert.equal((h.analysis.requests[0].input as AnalysisJobs['choose']['input']).groups.length, 4);
  // A newer change aborts the reruns of this one.
  h.analysis.answer();
  await settle();
  const aborted = h.pool.reproductions.slice(reruns);
  assert.ok(aborted.length > 0);
  h.session.setDirection('maximize');
  await settle();
  assert.ok(aborted.every((held) => held.signal?.aborted));
  await drive(h);
  const view = walkForward(h);
  assert.equal(view.pending, false);
  // Back to the first ranking: every window keeps its set and its runs.
  assert.deepEqual(
    view.windows.map((row) => row.trialId),
    before.windows.map((row) => row.trialId),
  );
  assert.equal(h.pool.reproductions.filter((held) => !held.signal?.aborted).length, reruns);

  h.session.setDirection('minimize');
  await drive(h);
  const minimized = walkForward(h);
  for (const [at, row] of minimized.windows.entries()) {
    const sets = trialsOf(h.pool.runs[at]);
    const worst = [...sets].sort(
      (a, b) =>
        scoreMetric(a.metrics, 'Net profit')! - scoreMetric(b.metrics, 'Net profit')! ||
        a.trialId.localeCompare(b.trialId),
    )[0];
    assert.equal(row.trialId, worst.trialId);
  }
  assert.deepEqual(h.session.getState().outdated, { reasons: [] });
});

test('selecting a window gives its set to preview; the map shows it or the mean (W1, W3)', async () => {
  const h = await harness();
  const state = await complete(h);
  let view = walkForward(h);
  assert.equal(view.map?.window, 3);
  assert.equal(view.map?.surface, 'window');
  assert.deepEqual(
    view.map?.chosen.map((item) => item.window),
    [0, 1, 2, 3],
  );
  h.session.selectWindow(1);
  await settle();
  assert.deepEqual(h.analysis.kinds, ['view']);
  const input = h.analysis.requests[0].input as AnalysisJobs['view']['input'];
  assert.equal(input.wfSurface, 'window');
  assert.equal(input.trials.length, 8);
  assert.equal(input.selectedTrialId, view.windows[1].trialId);
  assert.equal(walkForward(h).mapPending, true);
  await drive(h);
  view = walkForward(h);
  assert.equal(view.map?.window, 1);
  assert.deepEqual(view.selection?.origin, {
    kind: 'window',
    optimizationId: state.results!.id,
    trialId: view.windows[1].trialId,
    window: 1,
    ranges: windowRanges(view.windows[1].plan),
  });
  assert.equal(view.selection?.explicit, true);
  h.session.setWindowMapSurface('mean');
  await settle();
  const mean = h.analysis.requests[0].input as AnalysisJobs['view']['input'];
  assert.equal(mean.meanTrialGroups?.length, 4);
  await drive(h);
  assert.equal(walkForward(h).map?.surface, 'mean');
  assert.ok(walkForward(h).map!.panel.cells.length > 0);

  // View backtest previews the window's set; Apply to inputs writes the fixed parameters (B16, B17).
  const preview = h.session.previewWindow();
  await h.engine.answerAll();
  await preview;
  const previewed = h.backtest.getState().preview!;
  // Each origin carries the run's search rows, so its values read as this run searched them.
  assert.deepEqual(previewed.origin, { ...view.selection!.origin, searchRows: view.searchRows });
  assert.equal(view.searchRows, state.results!.computedWith.search.rows);
  assert.deepEqual({ ...previewed.set }, { ...view.windows[1].parameters });
  const apply = h.session.applyFixedParameters();
  await h.engine.answerAll();
  await apply;
  const { applied, inputs } = h.backtest.getState();
  assert.deepEqual(applied?.origin, {
    kind: 'fixed',
    optimizationId: state.results!.id,
    searchRows: view.searchRows,
  });
  const fixed = view.fixed!.parameters;
  for (const field of inputs) assert.equal(field.value, fixed[field.descriptor.title]);
  // Neither moves the ranges the run took, so the results stay current.
  assert.deepEqual(h.session.getState().outdated, { reasons: [] });
});

test('walk-forward settings outdate the results; the plan follows them (R5, O3)', async () => {
  const h = await harness();
  await complete(h);
  const reasons = () => h.session.getState().outdated?.reasons;
  h.session.setValidation({ walkForward: { stepMonths: 2 } });
  assert.deepEqual(reasons(), ['validation']);
  h.session.setValidation({ walkForward: { stepMonths: 1 } });
  assert.deepEqual(reasons(), []);
  h.session.setValidation({ walkForward: { anchored: true } });
  assert.deepEqual(reasons(), ['validation']);
  // The results stay laid out as walk-forward while they are outdated.
  assert.notEqual(h.session.getState().walkForward, null);
});

test('data too short for one window blocks the run with its reason', async () => {
  const h = await harness();
  h.backtest.setDataset({ ...dataset, bars: dataset.bars.slice(0, 40) });
  await drive(h);
  const state: OptimizationState = h.session.getState();
  assert.equal(state.plan.status === 'planned' && state.plan.windows.length, 0);
  assert.deepEqual(state.readiness.reasons, [workflowMessage('optimize.wf.noWindows')]);
  h.session.setValidation({ walkForward: { stepMonths: 0 } });
  await drive(h);
  assert.deepEqual(h.session.getState().plan.status === 'failed' && h.session.getState().plan, {
    status: 'failed',
    error: optimizerMessage('monthCountRange', {
      name: optimizerMessage('stepMonthCount'),
    }),
  });
});

test('a real walk-forward run on the Worker pool reruns each chosen set as the sweep ran it', async () => {
  const engine = engineHarness();
  const backtest = new BacktestSession(engine.client);
  backtest.setSource(strategySource);
  await engine.answerAll();
  backtest.setDataset(dataset);
  const workers = localWorkers();
  const session = new OptimizationSession(backtest, workers.pool, workers.analysis, {
    threads: 2,
  });
  session.setSmooth(false);
  session.setRange('Length', { from: 3, to: 5 });
  session.setValueKept('Source', 'ohlc4', false);
  session.setSearched('Multiplier', false);
  session.setValidation({
    mode: 'walk-forward',
    walkForward: { inSampleMonths: 2, outOfSampleMonths: 1, stepMonths: 1 },
  });
  for (let wait = 0; !session.getState().readiness.ok && wait < 50; wait++) await settle();
  session.removeFilter(0);
  session.removeFilter(0);
  await session.start();
  const state = session.getState();
  assert.equal(state.run.status, 'done');
  const view = state.walkForward!;
  assert.deepEqual(
    view.windows.map((row) => row.status),
    ['done', 'done', 'done', 'done'],
  );
  for (const row of view.windows) {
    const { inSampleStartIndex: from, inSampleBars } = row.plan;
    const trials = engineTrials(
      strategySource,
      {
        ...dataset,
        bars: dataset.bars.slice(from, from + inSampleBars),
        realtimeTail: false,
        strategyClosePending: false,
      },
      [3, 4, 5].flatMap((Length) =>
        ['close', 'hl2'].map((Source) => ({ inputs: { Multiplier: 1, Length, Source } })),
      ),
    );
    assert.equal(row.trialId, bestOf(trials).trialId);
  }
  assert.notEqual(view.fixed, null);
  for (let wait = 0; session.getState().walkForward?.mapPending && wait < 100; wait++)
    await settle();
  assert.notEqual(session.getState().walkForward?.map, null);
  session.dispose();
  workers.analysis.dispose();
});
