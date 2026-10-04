import assert from 'node:assert/strict';
import { test } from 'node:test';
import {
  describe,
  runWithEquity as runStrategy,
  type MarketBar,
  type RunInput,
} from '@pine/engine';
import {
  analyzeOptimizer,
  generateSearchSpace,
  planWalkForwardWindows,
  summarizeOptimizerAnalysis,
  tradeStatistics,
  trialIdForParameters,
  type TrialRecord,
} from '@pine/optimizer';
import { AnalysisRun, AnalysisWorkerClient } from './analysis-client.ts';
import { AnalysisRuns, handleAnalysisRequest } from './analysis-dispatcher.ts';
import type { AnalysisRequest, AnalysisRunView } from './analysis-protocol.ts';
import { WorkerCancelledError } from './client.ts';
import { workerMessage } from './messages.ts';
import type { OptimizationTrial } from './protocol.ts';
import { ControlledAnalysisWorker, LocalAnalysisWorker } from '../test/analysis.ts';

const source = `//@version=6
strategy("Analysis runs", initial_capital=10000)
quantity = input.int(1, "Quantity", minval=1, maxval=4)
period = input.int(2, "Period", minval=2, maxval=4)
if bar_index % period == 0
    strategy.entry("L", strategy.long, qty=quantity)
else
    strategy.close("L")`;
const bars: MarketBar[] = Array.from({ length: 40 }, (_, index) => {
  const close = 100 + 6 * Math.sin(index / 3) + index / 4;
  return {
    time: Date.UTC(2024, 0, 1) / 1000 + index * 86400,
    open: close - 1,
    high: close + 1,
    low: close - 2,
    close,
    volume: 10,
  };
});
const market: Omit<RunInput, 'bars'> = {
  syminfo: { type: 'crypto', timezone: 'Etc/UTC', mintick: 0.01, pointvalue: 1 },
  timeframe: 'D',
};
const space = generateSearchSpace(describe(source).inputs);

function trials(range: readonly MarketBar[]): OptimizationTrial[] {
  return space.activeAxes[0].values.flatMap((quantity) =>
    space.activeAxes[1].values.map((period) => {
      const inputs = { Quantity: quantity, Period: period };
      const result = runStrategy(source, { ...market, bars: range, inputs });
      return {
        trialId: trialIdForParameters({ inputs }),
        parameters: { inputs },
        metrics: result.metrics,
        tradeCount: result.trades.length,
        statistics: tradeStatistics(result),
        diagnostics: result.diagnostics,
        warnings: result.warnings,
      };
    }),
  );
}
const inside = trials(bars.slice(0, 28));
const outside = trials(bars.slice(28));
const view: AnalysisRunView = {
  resultSpace: space,
  mode: 'in-out',
  resultMode: 'in-out',
  objective: 'Net profit',
  direction: 'maximize',
  constraints: [{ metric: 'Total trades', operator: '>=', value: 1 }],
  constraintDraft: { metric: 'Profit factor', operator: '>=', value: 1.5 },
  rankBy: 'neighborhood',
};
const request = { metrics: ['Net profit', 'Total trades'], fullMaps: true };

function local() {
  const workers: LocalAnalysisWorker[] = [];
  const client = new AnalysisWorkerClient(() => {
    const worker = new LocalAnalysisWorker();
    workers.push(worker);
    return worker;
  });
  return { client, workers };
}

test('a run analysed as its trials arrive matches the one-shot jobs', async () => {
  const { client } = local();
  const run = new AnalysisRun(client);
  run.append(0, inside.slice(0, 5));
  // OOS trials may come before their set's IS trial; they wait for it.
  run.append(1, outside.slice(8));
  const first = await run.view(view, request);
  assert.equal(first.total, 5);
  run.append(0, inside.slice(5));
  run.append(1, outside.slice(0, 8));
  const summary = await run.view(view, request);
  const records = handleAnalysisRequest({
    requestId: 1,
    kind: 'records',
    input: { groups: [inside, outside], objective: 'Net profit' },
  });
  assert.equal(records.kind, 'records');
  const expected = summarizeOptimizerAnalysis(
    analyzeOptimizer({ ...view, trials: (records as { output: TrialRecord[] }).output }),
    request,
  );
  assert.deepEqual(summary, expected);
  assert.equal(summary.total, 12);
  assert.ok(summary.ranked.length > 0);
  assert.deepEqual(
    [...summary.ranked].map((position) => run.trials[position].trialId),
    [...expected.ranked].map((position) => inside[position].trialId),
  );
  run.close();
  client.dispose();
});

test('each trial reaches the Worker once; a restarted Worker is sent the run again', async () => {
  const { client, workers } = local();
  const run = new AnalysisRun(client);
  run.append(0, inside.slice(0, 4));
  await run.view(view);
  run.append(0, inside.slice(4, 6));
  await run.view(view);
  const sent = (worker: LocalAnalysisWorker) =>
    worker.requests.map((item) =>
      item.kind === 'runAppend' ? [item.kind, item.input.trials.length] : [item.kind],
    );
  assert.deepEqual(sent(workers[0]), [
    ['runOpen'],
    ['runAppend', 4],
    ['runView'],
    ['runAppend', 2],
    ['runView'],
  ]);
  client.cancel();
  run.append(0, inside.slice(6, 7));
  const summary = await run.view(view);
  assert.equal(summary.total, 7);
  // The new Worker answers the first attempt with an unknown run, then gets everything once.
  assert.deepEqual(sent(workers[1]), [
    ['runAppend', 1],
    ['runView'],
    ['runOpen'],
    ['runAppend', 7],
    ['runView'],
  ]);
  run.close();
  assert.equal(workers[1].requests.at(-1)?.kind, 'runClose');
  await assert.rejects(run.view(view), WorkerCancelledError);
  client.dispose();
});

test('the Worker holds a run until it is closed, and only while it has a store', () => {
  const runs = new AnalysisRuns();
  const ask = (input: AnalysisRequest) => handleAnalysisRequest(input, runs);
  assert.equal(ask({ requestId: 1, kind: 'runOpen', input: { run: 7 } }).kind, 'runOpen');
  const appended = ask({
    requestId: 2,
    kind: 'runAppend',
    input: { run: 7, range: 0, trials: inside.slice(0, 3) },
  });
  assert.deepEqual(appended, { requestId: 2, kind: 'runAppend', output: 3 });
  ask({ requestId: 3, kind: 'runClose', input: { run: 7 } });
  const unknown = ask({ requestId: 4, kind: 'runView', input: { run: 7, view, summary: {} } });
  assert.deepEqual(
    unknown.kind === 'failed' && unknown.error.uiText,
    workerMessage('analysisRunUnknown', { run: 7 }),
  );
  const storeless = handleAnalysisRequest({ requestId: 5, kind: 'runOpen', input: { run: 1 } });
  assert.equal(storeless.kind, 'failed');
});

test('views wait in order behind appends on a controlled Worker', async () => {
  const workers: ControlledAnalysisWorker[] = [];
  const client = new AnalysisWorkerClient(() => {
    const worker = new ControlledAnalysisWorker();
    workers.push(worker);
    return worker;
  });
  const runs = new AnalysisRuns();
  const run = new AnalysisRun(client);
  run.append(0, inside);
  const pending = run.view(view, { metrics: ['Net profit'] });
  run.append(1, outside);
  for (const item of workers[0].requests.splice(0))
    workers[0].respond(handleAnalysisRequest(item, runs));
  const summary = await pending;
  assert.ok(summary.columns.metrics['Net profit'].outOfSample.every(Number.isNaN));
  const later = run.view(view, { metrics: ['Net profit'] });
  assert.deepEqual(
    workers[0].requests.map((item) => item.kind),
    ['runAppend', 'runView'],
  );
  for (const item of workers[0].requests.splice(0))
    workers[0].respond(handleAnalysisRequest(item, runs));
  assert.ok(!(await later).columns.metrics['Net profit'].outOfSample.some(Number.isNaN));
  client.dispose();
});

test('the plan job answers window bounds and indices without bars', () => {
  const config = { inSampleLength: 2, outOfSampleLength: 1, step: 1 };
  const daily = Array.from({ length: 200 }, (_, index) => ({
    ...bars[0],
    time: Date.UTC(2024, 0, 1) / 1000 + index * 86400,
  }));
  const response = handleAnalysisRequest({
    requestId: 1,
    kind: 'plan',
    input: { times: daily.map((bar) => bar.time), config },
  });
  assert.equal(response.kind, 'plan');
  const windows = planWalkForwardWindows(daily, config);
  assert.deepEqual(
    response.kind === 'plan' && response.output,
    windows.map(({ inSampleBars: _in, outOfSampleBars: _out, ...bounds }) => bounds),
  );
});

const many = Array.from({ length: 245 }, (_, index) => ({
  ...inside[index % inside.length],
  trialId: String(index),
}));

test('large flushes yield in bounded batches, preserve both ranges and capture each view boundary', async () => {
  const { client, workers } = local();
  const run = new AnalysisRun(client);
  run.append(0, many);
  run.append(1, many.slice(0, 143));
  const first = run.view(view);
  let hostRan = false;
  setTimeout(() => {
    hostRan = true;
  }, 0);
  run.append(0, [{ ...inside[0], trialId: 'later' }]);
  const second = run.view(view);
  assert.equal((await first).total, 245);
  assert.equal(hostRan, true);
  assert.equal((await second).total, 246);
  const appends = workers[0].requests.filter((item) => item.kind === 'runAppend');
  assert.deepEqual(
    appends.map((item) => [item.input.range, item.input.trials.length]),
    [
      [0, 100],
      [0, 100],
      [0, 45],
      [1, 55],
      [1, 88],
      [0, 1],
    ],
  );
  assert.deepEqual(
    appends.filter((item) => item.input.range === 0).flatMap((item) => item.input.trials),
    run.trials,
  );
  client.dispose();
});

test('a failed partial flush retries only unacknowledged trials', async () => {
  let append = 0;
  class FailingWorker extends LocalAnalysisWorker {
    override postMessage(message: AnalysisRequest): void {
      if (message.kind === 'runAppend' && ++append === 2) throw new Error('clone failed');
      super.postMessage(message);
    }
  }
  const worker = new FailingWorker();
  const client = new AnalysisWorkerClient(() => worker);
  const run = new AnalysisRun(client);
  run.append(0, many);
  await assert.rejects(run.view(view), /clone failed/);
  assert.equal((await run.view(view)).total, many.length);
  assert.deepEqual(
    worker.requests.flatMap((item) => (item.kind === 'runAppend' ? item.input.trials : [])),
    many,
  );
  client.dispose();
});

test('cancel between batches stops posting; the next view replays every trial to the new Worker', async () => {
  const { client, workers } = local();
  const run = new AnalysisRun(client);
  run.append(0, many);
  const cancelled = assert.rejects(run.view(view), WorkerCancelledError);
  setTimeout(() => client.cancel(), 0);
  await cancelled;
  assert.equal(workers[0].requests.filter((item) => item.kind === 'runAppend').length, 1);
  assert.equal((await run.view(view)).total, many.length);
  const replay = workers[1].requests.filter((item) => item.kind === 'runAppend');
  // The first suffix request discovers the missing run; after runOpen every trial is replayed.
  const reopened = workers[1].requests.findIndex((item) => item.kind === 'runOpen');
  assert.ok(replay.length > 3);
  assert.deepEqual(
    workers[1].requests
      .slice(reopened)
      .flatMap((item) => (item.kind === 'runAppend' ? item.input.trials : [])),
    many,
  );
  client.dispose();
});

test('close between batches prevents remaining appends, queued views and reopening', async () => {
  const { client, workers } = local();
  const run = new AnalysisRun(client);
  run.append(0, many);
  const first = assert.rejects(run.view(view), WorkerCancelledError);
  const queued = assert.rejects(run.view(view), WorkerCancelledError);
  setTimeout(() => run.close(), 0);
  await Promise.all([first, queued]);
  assert.deepEqual(
    workers[0].requests.map((item) => item.kind),
    ['runOpen', 'runAppend', 'runClose'],
  );
  assert.equal(run.count(0), 0);
  client.dispose();
});
