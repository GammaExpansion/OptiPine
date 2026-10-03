import assert from 'node:assert/strict';
import { test } from 'node:test';
import { describe, runWithEquity as runStrategy } from '@pine/engine';
import type { RunInput } from '@pine/engine';
import { generateSearchSpace as buildSearchSpace } from '@pine/optimizer';
import type { OptimizerAnalysisInput } from '@pine/optimizer';
import { trialIdForParameters } from '@pine/optimizer';
import { AnalysisWorkerClient } from './analysis-client.ts';
import { WorkerCancelledError, WorkerCrashedError } from './client.ts';
import { handleAnalysisRequest } from './analysis-dispatcher.ts';
import { ControlledAnalysisWorker, createTestAnalysisClient } from '../test/analysis.ts';

function harness() {
  const workers: ControlledAnalysisWorker[] = [];
  const client = new AnalysisWorkerClient(() => {
    const worker = new ControlledAnalysisWorker();
    workers.push(worker);
    return worker;
  });
  return { client, workers };
}

const source = `//@version=6
strategy("Analysis transport", initial_capital=10000)
quantity=input.int(1,"Quantity",minval=1,maxval=3)
if bar_index % 2 == 0
    strategy.entry("L",strategy.long,qty=quantity)
else
    strategy.close("L")`;
const market: RunInput = {
  bars: Array.from({ length: 20 }, (_, index) => ({
    time: 1704067200 + index * 86400,
    open: 100 + index,
    high: 102 + index,
    low: 99 + index,
    close: 101 + index,
    volume: 10,
  })),
  syminfo: { type: 'crypto', timezone: 'Etc/UTC', mintick: 0.01, pointvalue: 1 },
  timeframe: 'D',
};
const space = buildSearchSpace(describe(source).inputs);
const parameterInput = { space, method: 'grid' as const, count: 3, seed: 42, limit: 100 };
const emptyView: OptimizerAnalysisInput = {
  trials: [],
  mode: 'none',
  objective: 'Net profit',
  direction: 'maximize',
  constraints: [],
};

test('analysis dispatcher handles real engine summaries across an explicit asynchronous clone boundary', async () => {
  const client = createTestAnalysisClient();
  const parameters = await client.request('parameters', parameterInput);
  assert.deepEqual(parameters, [{ Quantity: 1 }, { Quantity: 2 }, { Quantity: 3 }]);
  const summaries = parameters.map((inputs) => {
    const result = runStrategy(source, { ...market, inputs });
    assert.deepEqual(result.diagnostics, []);
    return {
      trialId: trialIdForParameters({ inputs }),
      parameters: inputs,
      inSampleMetrics: result.metrics,
      objectiveValue: null,
      inSampleValue: null,
      outOfSampleValue: null,
      valid: true,
      excluded: false,
    };
  });
  const pending = client.request('view', { ...emptyView, trials: summaries, space });
  summaries[0].parameters.Quantity = 99;
  const result = await pending;
  assert.deepEqual(
    result.ranked.map((trial) => trial.parameters.Quantity),
    [3, 2, 1],
  );
  assert.ok(result.ranked.every((trial) => trial.inSampleValue! > 0));
  assert.deepEqual(result.axes, { x: 'Quantity', y: undefined, z: undefined });
  assert.equal(result.maps[0].map.cells.length, 3);
  assert.equal(result.sensitivity.parameters[0].parameter, 'Quantity');
  assert.equal(result.sensitivity.parameters[0].etaSquared, 1);
  client.dispose();
});

test('analysis replies are correlated by request id when concurrent jobs finish out of order', async () => {
  const { client, workers } = harness();
  assert.equal(workers.length, 0, 'analysis workers start only when needed');
  const first = client.request('view', emptyView);
  const second = client.request('parameters', parameterInput);
  const worker = workers[0];
  assert.notEqual(worker.requests[0].requestId, worker.requests[1].requestId);
  worker.respond(handleAnalysisRequest(worker.requests[1]));
  worker.respond(handleAnalysisRequest(worker.requests[0]));
  assert.equal((await first).trials.length, 0);
  assert.deepEqual(await second, [{ Quantity: 1 }, { Quantity: 2 }, { Quantity: 3 }]);
  client.dispose();
});

test('analysis cancellation terminates all pending jobs and ignores old worker delivery after restart', async () => {
  const { client, workers } = harness();
  const rejected = Promise.all([
    assert.rejects(client.request('view', emptyView), WorkerCancelledError),
    assert.rejects(client.request('parameters', parameterInput), WorkerCancelledError),
  ]);
  const oldWorker = workers[0],
    lateDelivery = oldWorker.onmessage!;
  client.cancel();
  await rejected;
  assert.equal(oldWorker.terminated, true);
  assert.equal(workers.length, 1, 'cancellation does not create an unused worker');
  const current = client.request('parameters', parameterInput);
  const worker = workers[1],
    request = worker.requests[0];
  assert.ok(request.requestId > oldWorker.requests[1].requestId);
  lateDelivery(
    new MessageEvent('message', {
      data: {
        requestId: request.requestId,
        kind: 'failed',
        error: { name: 'Error', message: 'obsolete worker' },
      },
    }),
  );
  worker.respond(handleAnalysisRequest(request));
  assert.equal((await current).length, 3);
  client.dispose();
});

test('worker crashes and unreadable messages reject pending analysis and permit later recovery', async () => {
  for (const crash of [true, false]) {
    const { client, workers } = harness();
    const rejected = Promise.all([
      assert.rejects(client.request('view', emptyView), WorkerCrashedError),
      assert.rejects(client.request('parameters', parameterInput), WorkerCrashedError),
    ]);
    if (crash)
      workers[0].onerror?.({ message: 'out of memory', preventDefault() {} } as ErrorEvent);
    else workers[0].onmessageerror?.({} as MessageEvent);
    await rejected;
    assert.equal(workers[0].terminated, true);
    const recovered = client.request('view', emptyView);
    workers[1].respond(handleAnalysisRequest(workers[1].requests[0]));
    assert.equal((await recovered).ranked.length, 0);
    client.dispose();
  }
});

test('a computation failure remains serializable and does not destroy the analysis worker', async () => {
  const { client, workers } = harness();
  const rejected = assert.rejects(
    client.request('parameters', { ...parameterInput, limit: 1 }),
    /3/,
  );
  const response = handleAnalysisRequest(workers[0].requests[0]);
  assert.equal(response.kind, 'failed');
  workers[0].respond(response);
  await rejected;
  assert.equal(workers[0].terminated, false);
  const next = client.request('parameters', parameterInput);
  workers[0].respond(handleAnalysisRequest(workers[0].requests[1]));
  assert.equal((await next).length, 3);
  assert.equal(workers.length, 1);
  client.dispose();
});

test('disposing analysis rejects pending work and prevents further worker creation', async () => {
  const { client, workers } = harness();
  const rejected = assert.rejects(client.request('view', emptyView), WorkerCancelledError);
  client.dispose();
  client.dispose();
  client.cancel();
  await rejected;
  await assert.rejects(client.request('parameters', parameterInput), WorkerCancelledError);
  assert.equal(workers.length, 1);
  assert.equal(workers[0].terminated, true);
});
