import assert from 'node:assert/strict';
import test from 'node:test';
import { runWithEquity } from '@pine/engine';
import { serializeError } from '@pine/messages';
import { workerMessage } from '@pine/workers';
import { BacktestSession, backtestIssues, type DatasetInput } from './backtest.ts';
import type { ParameterOrigin } from './inputs.ts';
import { workflowMessage } from './messages.ts';
import { engineHarness, settle, strategySource, syntheticBars } from './test-support.ts';

const dataset: DatasetInput = {
  bars: syntheticBars(300),
  syminfo: { mintick: 0.01, mincontract: 0.001, timezone: 'Etc/UTC', currency: 'USD' },
  timeframe: '60',
  realtimeTail: false,
  strategyClosePending: false,
};

/** A session with the test strategy compiled and data loaded, and a clock tests advance. */
async function readySession() {
  const harness = engineHarness();
  let clock = 1_000;
  const session = new BacktestSession(harness.client, { now: () => clock });
  session.setSource(strategySource);
  await harness.answerAll();
  session.setDataset(dataset);
  return {
    ...harness,
    session,
    tick: (ms: number) => {
      clock += ms;
    },
  };
}

async function completedRun() {
  const ready = await readySession();
  const running = ready.session.run();
  ready.tick(250);
  await ready.answerAll();
  await running;
  return ready;
}

test('editing the source recompiles and rebuilds inputs and properties', async () => {
  const harness = engineHarness();
  let clock = 0;
  const session = new BacktestSession(harness.client, { now: () => clock });
  const states: string[] = [];
  session.subscribe((state) => states.push(state.compile.status));
  session.setSource(strategySource);
  assert.equal(session.getState().compile.status, 'compiling');
  clock = 40;
  await harness.answerAll();
  const state = session.getState();
  assert.deepEqual(states, ['compiling', 'compiled']);
  assert.equal(state.compile.status === 'compiled' && state.compile.durationMs, 40);
  assert.deepEqual(
    state.inputs.map((item) => [item.descriptor.title, item.value, item.changed, item.error]),
    [
      ['Length', 5, false, null],
      ['Multiplier', 1, false, null],
      ['Source', 'close', false, null],
    ],
  );
  assert.deepEqual(
    state.properties
      .filter((field) =>
        ['initialCapital', 'orderSize', 'orderSizeUnit', 'commission'].includes(field.id),
      )
      .map((field) => [field.id, field.value, field.overridden]),
    [
      ['initialCapital', 10000, false],
      ['orderSize', 50, false],
      ['orderSizeUnit', 'percent_of_equity', false],
      ['commission', 0.1, false],
    ],
  );
  assert.equal(state.sourceRevision, harness.client.sourceRevision);
});

test('a late describe reply for an older source revision is discarded', async () => {
  const harness = engineHarness();
  const session = new BacktestSession(harness.client);
  session.setSource(strategySource);
  const edited = strategySource.replace('"Length", minval=2', '"Length", minval=3');
  session.setSource(edited);
  // The first Worker was replaced when the revision rose; its held request answers late.
  const [first, second] = harness.workers;
  first.answer();
  await settle();
  assert.equal(session.getState().compile.status, 'compiling');
  second.answer();
  await settle();
  const state = session.getState();
  assert.equal(state.compile.status, 'compiled');
  assert.equal(state.inputs[0].descriptor.min, 3);
});

test('a failed compile keeps the last inputs and marks unsupported features (B10)', async () => {
  const { session, answerAll } = await readySession();
  session.setInput('Length', 9);
  session.setSource(strategySource.replace('ta.sma(src, length)', 'ta.sma(src, lenght)'));
  await answerAll();
  let state = session.getState();
  assert.equal(state.compile.status, 'failed');
  assert.equal(
    state.compile.status === 'failed' && state.compile.diagnostics[0].kind,
    'undeclared',
  );
  assert.equal(state.inputs[0].value, 9);
  assert.deepEqual(state.readiness.reasons, [workflowMessage('backtest.compileFailed')]);
  assert.deepEqual(
    backtestIssues(state).map((issue) => [issue.category, issue.line]),
    [['compileError', 6]],
  );

  session.setSource(strategySource.replace('//@version=6', '//@version=4'));
  await answerAll();
  state = session.getState();
  assert.deepEqual(
    backtestIssues(state).map((issue) => issue.category),
    ['unsupported'],
  );
});

test('inputs keep their value when title and type survive a recompile', async () => {
  const { session, answerAll } = await readySession();
  session.setInput('Length', 12);
  session.setInput('Multiplier', 1.5);
  session.setInput('Source', 'hl2');
  session.setSource(
    strategySource
      .replace('input.float(1.0, "Multiplier", step=0.25)', 'input.int(2, "Multiplier")')
      .replace('src = input.source', 'extra = input.bool(true, "Extra")\nsrc = input.source'),
  );
  await answerAll();
  assert.deepEqual(
    session.getState().inputs.map((item) => [item.descriptor.title, item.value, item.changed]),
    [
      ['Length', 12, true],
      ['Multiplier', 2, false],
      ['Extra', true, false],
      ['Source', 'hl2', true],
    ],
  );
  session.resetInputs();
  assert.deepEqual(
    session.getState().inputs.map((item) => item.value),
    [5, 2, true, 'close'],
  );
});

test('the run action explains what is missing as message ids', async () => {
  const harness = engineHarness();
  const session = new BacktestSession(harness.client);
  assert.deepEqual(session.getState().readiness, {
    ok: false,
    reasons: [workflowMessage('backtest.noScript'), workflowMessage('backtest.noData')],
  });
  session.setSource(strategySource);
  assert.deepEqual(session.getState().readiness.reasons, [
    workflowMessage('backtest.compiling'),
    workflowMessage('backtest.noData'),
  ]);
  await harness.answerAll();
  session.setDataset(dataset);
  assert.equal(session.getState().readiness.ok, true);

  session.setInput('Length', 1);
  session.setProperty('pyramiding', 1.5);
  const state = session.getState();
  assert.deepEqual(
    state.inputs[0].error,
    workflowMessage('backtest.inputBelowMin', { title: 'Length', min: 2 }),
  );
  assert.deepEqual(state.readiness.reasons, [
    workflowMessage('backtest.inputInvalid', { title: 'Length' }),
    workflowMessage('backtest.propertyInvalid', {
      property: workflowMessage('backtest.property.pyramiding'),
    }),
  ]);
  await session.run();
  assert.equal(session.getState().run.status, 'idle');
});

test('a run produces the complete result with what it was computed with', async () => {
  const { session } = await completedRun();
  const state = session.getState();
  assert.deepEqual(state.run, { status: 'done', startedAt: 1_000, finishedAt: 1_250 });
  const result = state.result!;
  const expected = runWithEquity(strategySource, {
    ...dataset,
    inputs: { Length: 5, Multiplier: 1, Source: 'close' },
    settings: {},
  });
  assert.deepEqual(result.output, expected);
  assert.equal(result.output.equity!.length, dataset.bars.length);
  assert.deepEqual(
    result.output.plots.map((plot) => [plot.title, plot.overlay]),
    [
      ['Basis', true],
      ['RSI', false],
    ],
  );
  assert.ok(result.output.trades.length > 0);
  assert.equal(result.initialCapital, 10000);
  assert.equal(result.durationMs, 250);
  assert.deepEqual(
    { ...result.computedWith.inputs },
    { Length: 5, Multiplier: 1, Source: 'close' },
  );
  assert.equal(result.computedWith.source, strategySource);
  assert.equal(result.computedWith.dataset, state.dataset);
  assert.deepEqual(state.outdated, { reasons: [], inputs: [] });
});

test('changes mark the result outdated, and the inputs it used can be restored (B9)', async () => {
  const { session, answerAll } = await completedRun();
  session.setInput('Length', 8);
  assert.deepEqual(session.getState().outdated, {
    reasons: ['inputs'],
    inputs: [{ title: 'Length', computed: 5, current: 8 }],
  });
  session.restoreResultInputs();
  assert.deepEqual(session.getState().outdated?.reasons, []);

  session.setProperty('initialCapital', 20000);
  assert.deepEqual(session.getState().outdated?.reasons, ['properties']);
  session.resetProperties();
  session.setDataset({ ...dataset, bars: dataset.bars.slice(1) });
  assert.deepEqual(session.getState().outdated?.reasons, ['data']);

  session.setSource(strategySource + '\n');
  await answerAll();
  assert.deepEqual(session.getState().outdated?.reasons, ['source', 'data']);
  session.setSource(strategySource);
  await answerAll();
  assert.deepEqual(session.getState().outdated?.reasons, ['data']);
});

test('property overrides reach the engine and are recorded', async () => {
  const ready = await readySession();
  const { session } = ready;
  session.setProperty('initialCapital', 10000);
  assert.deepEqual(session.getState().propertyOverrides, {});
  session.setProperty('initialCapital', 25000);
  session.setProperty('commission', 0);
  assert.deepEqual(
    session
      .getState()
      .properties.filter((field) => field.overridden)
      .map((field) => field.id),
    ['initialCapital', 'commission'],
  );
  const running = session.run();
  await ready.answerAll();
  await running;
  const result = session.getState().result!;
  assert.equal(result.initialCapital, 25000);
  assert.deepEqual(result.computedWith.properties, { initialCapital: 25000, commission: 0 });
  assert.equal(result.output.metrics['Performance/Commission paid/All USD'], 0);
});

test('a failed run keeps the previous result and reports line and diagnostics (B11)', async () => {
  const { session, answerAll } = await completedRun();
  const previous = session.getState().result;
  session.setSource(
    strategySource.replace(
      'plot(basis',
      'if bar_index == 120\n    runtime.error("boom")\nplot(basis',
    ),
  );
  await answerAll();
  const running = session.run();
  await answerAll();
  await running;
  const state = session.getState();
  assert.equal(state.run.status, 'failed');
  if (state.run.status !== 'failed') return;
  assert.equal(state.run.failure.diagnostics[0].kind, 'runtime');
  assert.equal(state.run.failure.diagnostics[0].line, 12);
  assert.equal(state.run.failure.bar, 120);
  assert.equal(state.result, previous);
  assert.deepEqual(state.outdated?.reasons, ['source']);
  assert.deepEqual(
    backtestIssues(state).map((issue) => [issue.category, issue.line, issue.text]),
    [['runtimeError', 12, 'boom']],
  );
});

test('an unsupported feature at run time is its own issue category', async () => {
  const ready = await readySession();
  ready.session.setSource(
    strategySource.replace(
      'plot(basis',
      'daily = request.security(syminfo.tickerid, "D", close)\nplot(basis',
    ),
  );
  await ready.answerAll();
  const running = ready.session.run();
  await ready.answerAll();
  await running;
  assert.deepEqual(
    backtestIssues(ready.session.getState()).map((issue) => issue.category),
    ['unsupported'],
  );
});

test('effects the run ignored are listed as issues with their line', async () => {
  const ready = await readySession();
  ready.session.setSource(strategySource + 'alert("crossed")\n');
  await ready.answerAll();
  const running = ready.session.run();
  await ready.answerAll();
  await running;
  assert.deepEqual(
    backtestIssues(ready.session.getState()).map((issue) => [
      issue.category,
      issue.line,
      issue.text,
    ]),
    [['ignoredEffect', 13, 'alert is ignored during execution.']],
  );
});

test('cancel stops the Worker and keeps the previous result (B8)', async () => {
  const ready = await completedRun();
  const { session } = ready;
  const previous = session.getState().result;
  session.setInput('Length', 7);
  const running = session.run();
  assert.equal(session.getState().run.status, 'running');
  assert.equal(session.getState().readiness.ok, false);
  const worker = ready.worker();
  ready.tick(100);
  session.cancel();
  await running;
  assert.equal(worker.terminated, true);
  assert.deepEqual(session.getState().run, {
    status: 'cancelled',
    startedAt: 1_250,
    finishedAt: 1_350,
    cause: 'user',
  });
  worker.answer();
  await settle();
  assert.equal(session.getState().result, previous);
  assert.deepEqual(session.getState().outdated?.reasons, ['inputs']);
});

test('editing the source during a run discards the run', async () => {
  const ready = await readySession();
  const { session } = ready;
  const running = session.run();
  const runWorker = ready.worker();
  session.setSource(strategySource + '\n');
  await running;
  const { run } = session.getState();
  assert.equal(run.status === 'cancelled' && run.cause, 'source');
  runWorker.answer();
  await ready.answerAll();
  assert.equal(session.getState().result, null);
  assert.equal(session.getState().compile.status, 'compiled');
});

test('a Worker crash or failure fails the run with the Worker message', async () => {
  const ready = await completedRun();
  const { session } = ready;
  let running = session.run();
  await settle();
  ready.worker().crash();
  await running;
  let state = session.getState();
  assert.deepEqual(state.run.status === 'failed' && state.run.failure, {
    diagnostics: [],
    bar: null,
    error: workerMessage('engineWorkerCrashed'),
  });
  assert.deepEqual(
    backtestIssues(state).map((issue) => issue.category),
    ['workerError'],
  );
  assert.ok(state.result);

  running = session.run();
  await settle();
  const worker = ready.worker();
  const [request] = worker.requests.splice(0, 1);
  worker.reply({
    requestId: request.requestId,
    sourceRevision: request.sourceRevision,
    kind: 'failed',
    error: serializeError(new Error('out of memory')),
  });
  await running;
  state = session.getState();
  assert.equal(state.run.status === 'failed' && state.run.failure.error, 'out of memory');
});

test('a computed input is read-only with its reason and is not sent as an override', async () => {
  const ready = await readySession();
  ready.session.setSource(
    strategySource.replace(
      'src = input.source',
      'atr = input.int(math.max(2, 14), "ATR length")\nsrc = input.source',
    ),
  );
  await ready.answerAll();
  const field = ready.session
    .getState()
    .inputs.find((item) => item.descriptor.title === 'ATR length')!;
  assert.deepEqual(field.readOnly, workflowMessage('backtest.inputFixedComputedDefault'));
  assert.equal(field.value, undefined);
  ready.session.setInput('ATR length', 3);
  const running = ready.session.run();
  await settle();
  const request = ready.worker().requests[0];
  assert.equal(request.kind, 'run');
  assert.deepEqual(request.kind === 'run' && request.input.inputs, {
    Length: 5,
    Multiplier: 1,
    Source: 'close',
  });
  await ready.answerAll();
  await running;
  assert.equal(ready.session.getState().run.status, 'done');
});

test('clearing the script empties the panel and blocks the run', async () => {
  const { session } = await readySession();
  session.setSource('  ');
  const state = session.getState();
  assert.equal(state.compile.status, 'empty');
  assert.deepEqual(state.inputs, []);
  assert.deepEqual(state.properties, []);
  assert.deepEqual(state.readiness.reasons, [workflowMessage('backtest.noScript')]);
});

const origin: ParameterOrigin = { kind: 'rank', optimizationId: 1, trialId: 'trial-1', rank: 1 };
const set = { Length: 9, Multiplier: 1.25, Source: 'close' };

test('a preview runs a set without changing the current inputs or result (B16)', async () => {
  const ready = await completedRun();
  const { session } = ready;
  const current = session.getState().result;
  const previewing = session.preview(set, origin);
  let state = session.getState();
  assert.equal(state.preview?.run.status, 'running');
  assert.deepEqual(state.preview?.origin, origin);
  assert.deepEqual(state.preview?.changes, [
    { title: 'Length', current: 5, preview: 9 },
    { title: 'Multiplier', current: 1, preview: 1.25 },
  ]);
  ready.tick(300);
  await ready.answerAll();
  await previewing;
  state = session.getState();
  const expected = runWithEquity(strategySource, { ...dataset, inputs: set, settings: {} });
  assert.deepEqual(state.preview?.result?.output, expected);
  assert.deepEqual({ ...state.preview?.result?.computedWith.inputs }, set);
  assert.deepEqual(
    state.inputs.map((item) => item.value),
    [5, 1, 'close'],
  );
  assert.equal(state.result, current);
  assert.deepEqual(state.outdated?.reasons, []);

  session.backToOptimization();
  state = session.getState();
  assert.equal(state.preview, null);
  assert.equal(state.result, current);
});

test('setting the preview as current adopts its result and keeps defaults visible (B17)', async () => {
  const ready = await completedRun();
  const { session } = ready;
  const before = session.getState();
  const previewing = session.preview(set, origin);
  await ready.answerAll();
  await previewing;
  const previewed = session.getState().preview!.result;
  const requests = ready.workers.reduce((count, worker) => count + worker.requests.length, 0);
  await session.setPreviewAsCurrent();
  let state = session.getState();
  assert.equal(
    ready.workers.reduce((count, worker) => count + worker.requests.length, 0),
    requests,
  );
  assert.equal(state.preview, null);
  assert.equal(state.result, previewed);
  assert.deepEqual(state.applied, { origin });
  assert.deepEqual(state.outdated?.reasons, []);
  const length = state.inputs[0];
  assert.deepEqual(
    [length.value, length.changed, length.descriptor.defaultValue, length.origin],
    [9, true, 5, origin],
  );

  session.undoApply();
  state = session.getState();
  assert.equal(state.applied, null);
  assert.equal(state.result, before.result);
  assert.deepEqual(
    state.inputs.map((item) => [item.value, item.origin]),
    [
      [5, null],
      [1, null],
      ['close', null],
    ],
  );
});

test('applying a set from the selection bar re-runs the backtest; an edit ends undo', async () => {
  const ready = await completedRun();
  const { session } = ready;
  const applying = session.applyParameters(set, origin);
  assert.equal(session.getState().run.status, 'running');
  await ready.answerAll();
  await applying;
  let state = session.getState();
  assert.equal(state.run.status, 'done');
  assert.deepEqual({ ...state.result?.computedWith.inputs }, set);
  assert.deepEqual(state.applied, { origin });
  session.setInput('Length', 11);
  state = session.getState();
  assert.equal(state.applied, null);
  assert.equal(state.inputs[0].origin, null);
  assert.deepEqual(state.inputs[1].origin, origin);
  session.undoApply();
  assert.equal(session.getState().inputs[0].value, 11);
});

test('a failed combination opened as a preview shows its diagnostics in Issues (R11)', async () => {
  const ready = await completedRun();
  const { session } = ready;
  session.setSource(
    strategySource.replace('plot(basis', 'if length == 9\n    runtime.error("nine")\nplot(basis'),
  );
  await ready.answerAll();
  const failed: ParameterOrigin = { kind: 'failed', optimizationId: 1, trialId: 'trial-9' };
  const previewing = session.preview(set, failed);
  await ready.answerAll();
  await previewing;
  const state = session.getState();
  assert.equal(state.preview?.run.status, 'failed');
  assert.equal(state.run.status, 'done');
  assert.deepEqual(
    backtestIssues(state).map((issue) => [issue.category, issue.line, issue.text]),
    [['runtimeError', 12, 'nine']],
  );
  session.backToOptimization();
  assert.deepEqual(backtestIssues(session.getState()), []);
});

test('cancel stops a running preview; a new preview replaces the open one', async () => {
  const ready = await completedRun();
  const { session } = ready;
  const first = session.preview(set, origin);
  const worker = ready.worker();
  const second = session.preview({ Length: 7 }, { ...origin, rank: 2, trialId: 'trial-2' });
  await first;
  assert.equal(worker.terminated, true);
  assert.equal(session.getState().preview?.set.Length, 7);
  session.cancel();
  await second;
  assert.equal(session.getState().preview?.run.status, 'cancelled');
  assert.equal(session.getState().run.status, 'done');
});
