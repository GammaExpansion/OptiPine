import assert from 'node:assert/strict';
import { test } from 'node:test';
import { readFile } from 'node:fs/promises';
import { runWithEquity as runStrategy, type ParameterSet, type RunInput } from '@pine/engine';
import {
  OptimizationWorkerPool,
  OptimizationCompileError,
  type OptimizationProgress,
} from './optimizer-client.ts';
import {
  handleEngineWorkerRequest,
  handleOptimizationWorkerRequest,
  type EngineWorkerState,
} from './dispatcher.ts';
import { trialIdForParameters } from '@pine/optimizer';
import { parseBars } from '../test/fixtures.ts';
import { metricValue } from '@pine/optimizer';
import { restoreInput } from './run-input.ts';
import type {
  EngineWorkerRequest,
  EngineWorkerResponse,
  EngineWorkerTransport,
} from './protocol.ts';

class FakeWorker implements EngineWorkerTransport {
  readonly state: EngineWorkerState = {};
  readonly requests: EngineWorkerRequest[] = [];
  onmessage: EngineWorkerTransport['onmessage'] = null;
  onerror: EngineWorkerTransport['onerror'] = null;
  onmessageerror: EngineWorkerTransport['onmessageerror'] = null;
  terminated = false;
  postMessage(request: EngineWorkerRequest, transfer: Transferable[] = []): void {
    if (this.terminated) throw new Error('terminated');
    request = structuredClone(request, { transfer });
    this.requests.push(request);
    queueMicrotask(() => {
      if (this.terminated) return;
      const deliver = (response: EngineWorkerResponse) =>
        this.onmessage?.(new MessageEvent('message', { data: response }));
      if (request.kind === 'optimize')
        handleOptimizationWorkerRequest(request, undefined, deliver, this.state);
      else deliver(handleEngineWorkerRequest(request, undefined, this.state));
    });
  }
  terminate(): void {
    this.terminated = true;
  }
}

const source =
  '//@version=6\nstrategy("Optimizer")\nlength = input.int(2, "Length", minval=1, maxval=4)';
const common: RunInput = {
  bars: [{ time: 1704067200, open: 100, high: 102, low: 99, close: 101, volume: 10 }],
  syminfo: { type: 'crypto', timezone: 'Etc/UTC', mintick: 0.01, pointvalue: 1 },
  timeframe: '60',
};

test('optimization chunk emits metrics-only trials with deterministic ids', async () => {
  const params: ParameterSet[] = [
    { inputs: { Length: 1 } },
    { inputs: { Length: 2 } },
    { inputs: { Length: 1 } },
  ];
  const first = await new Promise<EngineWorkerResponse[]>((resolve) => {
    const responses: EngineWorkerResponse[] = [];
    handleOptimizationWorkerRequest(
      {
        kind: 'optimize',
        source,
        common,
        parameters: params,
        chunkIndex: 0,
        totalChunks: 1,
        requestId: 1,
        sourceRevision: 0,
      },
      undefined,
      (response) => responses.push(response),
    );
    resolve(responses);
  });
  const trials = first.filter((response) => response.kind === 'trial');
  assert.equal(trials.length, params.length);
  assert.equal(
    new Set(trials.map((response) => (response.kind === 'trial' ? response.trial.trialId : '')))
      .size,
    2,
  );
  assert.ok(
    trials.every(
      (response) =>
        response.kind === 'trial' && response.trial.metrics && response.trial.tradeCount >= 0,
    ),
  );
  assert.ok(!trials.some((response) => response.kind === 'trial' && 'plots' in response.trial));
  // Each trial travels once, inside `trial`: no flattened duplicate and no separate
  // per-trial progress message.
  assert.ok(trials.every((response) => !('trialId' in response) && !('metrics' in response)));
  assert.ok(first.every((response) => (response.kind as string) !== 'progress'));
  assert.deepEqual(
    runStrategy(source, common).metrics,
    trials[0]!.kind === 'trial' ? trials[0]!.trial.metrics : {},
  );
});

test('distinct valid parameter groups that collided in 32 bits retain separate trial identities', () => {
  const source = `//@version=6
strategy("Parameter identity", initial_capital=1000000)
fast = input.int(1, "Fast", minval=0, maxval=100000)
slow = input.int(1, "Slow", minval=0, maxval=100000)
third = input.int(1, "Third", minval=0, maxval=100000)
if bar_index == 0
    strategy.entry("L", strategy.long, qty=fast % 3 + 1)
if bar_index == 2
    strategy.close("L")
plot(slow + third)`;
  // Both canonical parameter sets produced bacef742 with the former 32-bit hash.
  const parameters: ParameterSet[] = [
    { inputs: { Fast: 32753, Slow: 66350, Third: 67296 } },
    { inputs: { Fast: 94666, Slow: 59284, Third: 86993 } },
  ];
  const input: RunInput = {
    ...common,
    bars: Array.from({ length: 4 }, (_, index) => ({
      time: common.bars[0]!.time + index * 3600,
      open: 100 + index,
      high: 102 + index,
      low: 99 + index,
      close: 101 + index,
      volume: 10,
    })),
  };
  const responses = handleOptimizationWorkerRequest({
    kind: 'optimize',
    source,
    common: input,
    parameters,
    chunkIndex: 0,
    totalChunks: 1,
    requestId: 1,
    sourceRevision: 0,
  });
  const trials = responses.flatMap((response) =>
    response.kind === 'trial' ? [response.trial] : [],
  );
  assert.equal(trials.length, 2);
  assert.equal(new Map(trials.map((trial) => [trial.trialId, trial])).size, 2);
  for (const trial of trials) {
    assert.match(trial.trialId, /^[a-f0-9]{32}$/);
    assert.deepEqual(trial.diagnostics, []);
    assert.equal(trial.tradeCount, 1);
    const reordered = {
      inputs: Object.fromEntries(Object.entries(trial.parameters.inputs!).reverse()),
    };
    assert.equal(trialIdForParameters(reordered), trial.trialId);
    assert.deepEqual(
      runStrategy(source, { ...input, inputs: trial.parameters.inputs }).metrics,
      trial.metrics,
    );
  }
  assert.notDeepEqual(trials[0]!.metrics, trials[1]!.metrics);
});

class ControlledWorker implements EngineWorkerTransport {
  readonly state: EngineWorkerState = {};
  onmessage: EngineWorkerTransport['onmessage'] = null;
  onerror: EngineWorkerTransport['onerror'] = null;
  onmessageerror: EngineWorkerTransport['onmessageerror'] = null;
  requests: EngineWorkerRequest[] = [];
  terminated = false;
  postMessage(request: EngineWorkerRequest, transfer: Transferable[] = []): void {
    this.requests.push(structuredClone(request, { transfer }));
  }
  terminate(): void {
    this.terminated = true;
  }
  complete(elapsedMs = 250): void {
    const request = this.requests.at(-1)!;
    assert.equal(request.kind, 'optimize');
    if (request.kind !== 'optimize') return;
    const handler = this.onmessage!;
    for (const response of handleOptimizationWorkerRequest(
      request,
      undefined,
      undefined,
      this.state,
    )) {
      if (response.kind === 'optimized') response.elapsedMs = elapsedMs;
      handler(new MessageEvent('message', { data: response }));
    }
  }
}

function controlledPool(): { pool: OptimizationWorkerPool; workers: ControlledWorker[] } {
  const workers: ControlledWorker[] = [];
  const pool = new OptimizationWorkerPool(() => {
    const worker = new ControlledWorker();
    workers.push(worker);
    return worker;
  });
  return { pool, workers };
}

async function waitForWorkers(workers: readonly ControlledWorker[], count: number) {
  const deadline = Date.now() + 2_000;
  while (workers.length < count && Date.now() < deadline)
    await new Promise<void>((resolve) => setTimeout(resolve, 0));
  assert.equal(workers.length, count);
}

test('calibration is a real first trial, then chunk sizes and ETA use measured cost', async () => {
  const { pool, workers } = controlledPool();
  const progress: OptimizationProgress[] = [];
  const parameters = Array.from({ length: 10 }, (_, i) => ({ inputs: { Length: i + 1 } }));
  const pending = pool.optimize(source, common, parameters, {
    workerCount: 2,
    onProgress: (value) => progress.push(value),
  });
  assert.equal(workers.length, 1);
  const first = workers[0].requests[0];
  assert.equal(first.kind === 'optimize' ? first.parameters.length : 0, 1);
  assert.equal(progress[0].calibratedMs, null);
  assert.equal(progress[0].remainingMs, null);
  workers[0].complete(250);
  assert.equal(workers.length, 2);
  assert.equal(
    workers[0].requests.at(-1)?.kind === 'optimize'
      ? (workers[0].requests.at(-1) as Extract<EngineWorkerRequest, { kind: 'optimize' }>)
          .parameters.length
      : 0,
    4,
  );
  assert.equal(
    workers[1].requests.at(-1)?.kind === 'optimize'
      ? (workers[1].requests.at(-1) as Extract<EngineWorkerRequest, { kind: 'optimize' }>)
          .parameters.length
      : 0,
    4,
  );
  workers[1].complete(1000);
  workers[0].complete(1000);
  workers[1].complete(250);
  const result = await pending;
  assert.deepEqual(
    result.trials.map((trial) => trial.parameters.inputs!.Length),
    parameters.map((p) => p.inputs.Length),
  );
  assert.equal(result.calibratedMs, 250);
  assert.equal(result.workers, 2);
  assert.equal(result.errorCount, 0);
  assert.equal(result.remainingMs, 0);
  assert.equal(progress.at(-1)?.completed, 10);
  assert.ok(progress.every((p) => p.elapsedMs >= 0));
  pool.dispose();
});

test('cancellation and stale crashes cannot affect a successor run or its committed result', async () => {
  const { pool, workers } = controlledPool();
  const previousRun = pool.optimize(source, common, [{ inputs: { Length: 1 } }]);
  workers[0].complete();
  const previous = await previousRun;
  const cancelled = pool.optimize(source, common, [{ inputs: { Length: 2 } }]);
  const oldWorker = workers[1];
  const oldHandler = oldWorker.onmessage!;
  const oldError = oldWorker.onerror!;
  const oldDecode = oldWorker.onmessageerror!;
  const oldRequest = oldWorker.requests[0] as Extract<EngineWorkerRequest, { kind: 'optimize' }>;
  const rejected = assert.rejects(cancelled, { name: 'WorkerCancelledError' });
  pool.cancel();
  await rejected;
  assert.equal(pool.lastResult, previous);
  const successor = pool.optimize(source, common, [{ inputs: { Length: 3 } }]);
  for (const response of handleOptimizationWorkerRequest(oldRequest))
    oldHandler(new MessageEvent('message', { data: response }));
  oldError({ message: 'late crash', preventDefault() {} } as ErrorEvent);
  oldDecode({} as MessageEvent);
  assert.equal(workers[2].terminated, false);
  assert.equal(pool.lastResult, previous);
  workers[2].complete();
  const result = await successor;
  assert.equal(result.trials.length, 1);
  assert.equal(result.trials[0].parameters.inputs!.Length, 3);
  assert.equal(pool.lastResult, result);
  pool.dispose();
});

test('fast remaining trials are distributed among every worker actually created', async () => {
  const { pool, workers } = controlledPool();
  const pending = pool.optimize(
    source,
    common,
    Array.from({ length: 10 }, (_, index) => ({ inputs: { Length: index + 1 } })),
    { workerCount: 3 },
  );
  workers[0].complete(1);
  assert.equal(workers.length, 3);
  for (const worker of workers) {
    const request = worker.requests.at(-1)!;
    assert.equal(request.kind === 'optimize' ? request.parameters.length : 0, 3);
  }
  workers[0].complete(3);
  workers[1].complete(3);
  workers[2].complete(3);
  assert.equal((await pending).workers, 3);
  pool.dispose();
});

test('decode failures reject active work and allow a later run without losing previous results', async () => {
  const { pool, workers } = controlledPool();
  const first = pool.optimize(source, common, [{ inputs: { Length: 1 } }]);
  workers[0].complete();
  const previous = await first;
  const rejected = assert.rejects(pool.optimize(source, common, [{ inputs: { Length: 2 } }]), {
    name: 'WorkerCrashedError',
  });
  workers[1].onmessageerror?.({} as MessageEvent);
  await rejected;
  assert.equal(workers[1].terminated, true);
  assert.equal(pool.lastResult, previous);
  const next = pool.optimize(source, common, [{ inputs: { Length: 3 } }]);
  workers[2].complete();
  assert.equal((await next).trials.length, 1);
  pool.dispose();
});

test('pool cancellation also terminates pending reproduction and permits another run', async () => {
  const { pool, workers } = controlledPool();
  const rejected = assert.rejects(pool.reproduce(source, common, { inputs: { Length: 2 } }), {
    name: 'WorkerCancelledError',
  });
  await waitForWorkers(workers, 1);
  const late = workers[0].onmessage!;
  const oldRequest = workers[0].requests[0];
  pool.cancel();
  await rejected;
  assert.equal(workers[0].terminated, true);
  const next = pool.reproduce(source, common, { inputs: { Length: 3 } });
  await waitForWorkers(workers, 2);
  late(new MessageEvent('message', { data: handleEngineWorkerRequest(oldRequest) }));
  assert.equal(workers[1].terminated, false);
  workers[1].onmessage!(
    new MessageEvent('message', { data: handleEngineWorkerRequest(workers[1].requests[0]) }),
  );
  assert.deepEqual((await next).diagnostics, []);
  const disposed = assert.rejects(pool.reproduce(source, common, {}), {
    name: 'WorkerCancelledError',
  });
  pool.dispose();
  await disposed;
  assert.ok(workers.every((worker) => worker.terminated));
});

test('a reproduction abort terminates only that worker and leaves a sweep and another reproduction intact', async () => {
  const { pool, workers } = controlledPool();
  const optimization = pool.optimize(source, common, [{ inputs: { Length: 1 } }]);
  const abort = new AbortController();
  const rejected = assert.rejects(
    pool.reproduce(source, common, { inputs: { Length: 2 } }, 0, abort.signal),
    {
      name: 'WorkerCancelledError',
    },
  );
  const next = pool.reproduce(source, common, { inputs: { Length: 3 } });
  await waitForWorkers(workers, 3);
  const late = workers[1].onmessage!;
  const oldRequest = workers[1].requests[0];
  abort.abort();
  await rejected;
  assert.equal(workers[1].terminated, true);
  assert.equal(workers[0].terminated, false);
  assert.equal(workers[2].terminated, false);
  late(new MessageEvent('message', { data: handleEngineWorkerRequest(oldRequest) }));
  workers[2].onmessage!(
    new MessageEvent('message', { data: handleEngineWorkerRequest(workers[2].requests[0]) }),
  );
  assert.deepEqual(
    (await next).metrics,
    runStrategy(source, { ...common, inputs: { Length: 3 } }).metrics,
  );
  workers[0].complete();
  assert.equal((await optimization).trials.length, 1);
  const workerCount = workers.length;
  await assert.rejects(pool.reproduce(source, common, {}, 0, abort.signal), {
    name: 'WorkerCancelledError',
  });
  assert.equal(
    workers.length,
    workerCount,
    'an already aborted selection must not create a worker',
  );
  pool.dispose();
});

test('compile failures are rejected with line diagnostics instead of successful empty results', async () => {
  const pool = new OptimizationWorkerPool(() => new FakeWorker());
  const previous = await pool.optimize(source, common, [{}]);
  await assert.rejects(
    pool.optimize('//@version=4\nstrategy("unsupported")', common, [{}]),
    (error: unknown) =>
      error instanceof OptimizationCompileError &&
      error.diagnostics[0].kind === 'unsupported' &&
      error.diagnostics[0].line === 1,
  );
  assert.equal(pool.lastResult, previous);
  pool.dispose();
});

test('reproductions reuse one snapshot per Worker without leaking overrides or retaining it after cancel', async () => {
  const workers: FakeWorker[] = [];
  const pool = new OptimizationWorkerPool(() => {
    const worker = new FakeWorker();
    workers.push(worker);
    return worker;
  });
  const input = structuredClone(common);
  const first = pool.reproduce(source, input, { inputs: { Length: 1 } });
  input.bars[0].close = 100;
  assert.deepEqual(
    (await first).metrics,
    runStrategy(source, { ...common, inputs: { Length: 1 } }).metrics,
  );
  for (const length of [2, 3, 4])
    assert.deepEqual(
      (await pool.reproduce(source, input, { inputs: { Length: length } })).metrics,
      runStrategy(source, { ...common, inputs: { Length: length } }).metrics,
    );
  assert.equal(workers.length, 1);
  const requests = workers[0].requests.filter((request) => request.kind === 'reproduce');
  assert.equal(requests.filter((request) => request.common).length, 1);
  assert.deepEqual(
    requests.map((request) => request.parameters.inputs?.Length),
    [1, 2, 3, 4],
  );
  const changed = { ...common, settings: { initial_capital: 23456 } };
  assert.deepEqual(
    (await pool.reproduce(source, changed, {})).metrics,
    runStrategy(source, changed).metrics,
  );
  assert.ok(
    workers[0].requests.at(-1)?.kind === 'reproduce' && 'common' in workers[0].requests.at(-1)!,
  );
  await pool.reproduce(source, common, {}, 5);
  await pool.reproduce(source, common, {}, 1);
  assert.equal(workers.length, 2, 'an older saved source gets a fresh revision scope');
  pool.cancel();
  assert.ok(workers.every((worker) => worker.terminated));
  await pool.reproduce(source, common, {});
  assert.equal(workers.length, 3);
  pool.dispose();
});

test('cancellation before a queued reproduction starts creates no Worker', async () => {
  const { pool, workers } = controlledPool();
  const first = assert.rejects(pool.reproduce(source, common, {}), {
    name: 'WorkerCancelledError',
  });
  const second = assert.rejects(pool.reproduce(source, common, {}), {
    name: 'WorkerCancelledError',
  });
  pool.cancel();
  await Promise.all([first, second]);
  assert.equal(workers.length, 0);
  pool.dispose();
});

test('a reproduction replays its snapshot once if a custom dispatcher loses its state', async () => {
  const worker = new FakeWorker();
  const pool = new OptimizationWorkerPool(() => worker);
  await pool.reproduce(source, common, { inputs: { Length: 1 } });
  delete worker.state.reproduction;
  const next = await pool.reproduce(source, common, { inputs: { Length: 2 } });
  assert.deepEqual(next.metrics, runStrategy(source, { ...common, inputs: { Length: 2 } }).metrics);
  const requests = worker.requests.filter((request) => request.kind === 'reproduce');
  assert.deepEqual(
    requests.map((request) => !!request.common),
    [true, false, true],
  );
  pool.dispose();
});

test('runtime diagnostics stay on their trial and contribute to error facts', async () => {
  const pool = new OptimizationWorkerPool(() => new FakeWorker());
  const strategy =
    '//@version=6\nstrategy("Errors")\nfail=input.bool(false,"Fail")\nif fail\n    runtime.error("trial failed")';
  const result = await pool.optimize(
    strategy,
    common,
    [{ inputs: { Fail: false } }, { inputs: { Fail: true } }],
    { workerCount: 4 },
  );
  assert.equal(result.trials[0].diagnostics.length, 0);
  assert.deepEqual(result.trials[1].diagnostics, [
    { kind: 'runtime', line: 5, bar: 0, message: 'trial failed' },
  ]);
  assert.equal(result.errorCount, 1);
  assert.equal(result.workers, 1, 'one remaining trial reuses the calibration worker');
  pool.dispose();
});

test('flat parameter groups fail explicitly and canonical ids preserve nested parameter identity', () => {
  const request = {
    kind: 'optimize' as const,
    source,
    common,
    parameters: [{ Length: 1 }] as unknown as ParameterSet[],
    chunkIndex: 0,
    totalChunks: 1,
    requestId: 1,
    sourceRevision: 0,
  };
  const responses = handleOptimizationWorkerRequest(request);
  assert.equal(responses[0].kind, 'failed');
  assert.equal(
    trialIdForParameters({ inputs: { B: true, A: 1 }, settings: { slippage: 0 } }),
    trialIdForParameters({ settings: { slippage: 0 }, inputs: { A: 1, B: true } }),
  );
  assert.notEqual(
    trialIdForParameters({ inputs: { A: 1 } }),
    trialIdForParameters({ inputs: { A: '1' } }),
  );
  assert.notEqual(
    trialIdForParameters({ inputs: { A: 1 } }),
    trialIdForParameters({ settings: { A: 1 } }),
  );
});

test('submitted source and nested input snapshots do not follow later caller mutations', async () => {
  const { pool, workers } = controlledPool();
  const input = structuredClone(common);
  const parameters = [
    { inputs: { Length: 1, Extra: { value: 1 } } },
    { inputs: { Length: 2, Extra: { value: 2 } } },
  ];
  const run = pool.optimize(source, input, parameters, { workerCount: 1 });
  input.bars[0]!.close = 999;
  input.syminfo.pointvalue = 100;
  parameters[1]!.inputs.Length = 99;
  parameters[1]!.inputs.Extra.value = 99;
  workers[0].complete(1000);
  const second = workers[0].requests[1] as Extract<EngineWorkerRequest, { kind: 'optimize' }>;
  assert.equal(second.common, undefined);
  assert.equal(workers[0].state.optimization!.common.bars[0].close, common.bars[0].close);
  assert.equal(workers[0].state.optimization!.common.syminfo.pointvalue, common.syminfo.pointvalue);
  assert.equal(second.parameters[0].inputs!.Length, 2);
  assert.deepEqual(second.parameters[0].inputs!.Extra, { value: 2 });
  workers[0].complete(1000);
  assert.equal((await run).trials[1].parameters.inputs!.Length, 2);
  pool.dispose();
});

test('immutable parameter lists are borrowed and bars transfer only once per sweep Worker', async () => {
  const workers: FakeWorker[] = [];
  const pool = new OptimizationWorkerPool(() => {
    const worker = new FakeWorker();
    workers.push(worker);
    return worker;
  });
  // A proxy list cannot be structured-cloned; its plain chunk slices can cross the boundary.
  const parameters = new Proxy(
    Object.freeze(
      Array.from({ length: 12 }, (_, index) =>
        Object.freeze({
          inputs: Object.freeze({ Length: (index % 4) + 1 }),
          settings: Object.freeze({ initial_capital: 10_000 + index }),
        }),
      ),
    ),
    {},
  );
  const result = await pool.optimize(source, common, parameters, {
    immutableParameters: true,
    workerCount: 3,
    chunkSize: 1,
  });
  assert.equal(result.trials.length, parameters.length);
  assert.equal(workers.length, 3);
  for (const worker of workers) {
    const requests = worker.requests.filter((request) => request.kind === 'optimize');
    assert.ok(requests.length > 1);
    assert.equal(requests.filter((request) => request.common).length, 1);
    assert.ok(requests[0].common!.bars instanceof Float64Array);
    assert.deepEqual(restoreInput(requests[0].common!), common);
    assert.ok(worker.terminated);
  }
  for (const [index, trial] of result.trials.entries()) {
    assert.deepEqual(trial.parameters, parameters[index]);
    assert.deepEqual(
      trial.metrics,
      runStrategy(source, {
        ...common,
        inputs: parameters[index].inputs,
        settings: parameters[index].settings,
      }).metrics,
    );
  }
  pool.dispose();
});

test('a sweep replays lost common input once without skipping or duplicating a chunk', async () => {
  const { pool, workers } = controlledPool();
  const pending = pool.optimize(
    source,
    common,
    [{ inputs: { Length: 1 } }, { inputs: { Length: 2 } }],
    {
      workerCount: 1,
      chunkSize: 1,
    },
  );
  const worker = workers[0];
  worker.complete();
  delete worker.state.optimization;
  const lost = worker.requests.at(-1)!;
  assert.equal(lost.kind, 'optimize');
  if (lost.kind !== 'optimize') assert.fail('Expected a sweep');
  const lateFailure = handleOptimizationWorkerRequest(lost)[0];
  worker.complete();
  assert.deepEqual(
    worker.requests.map((request) => request.kind === 'optimize' && !!request.common),
    [true, false, true],
  );
  worker.onmessage!(new MessageEvent('message', { data: lateFailure }));
  assert.equal(worker.terminated, false, 'a late failure from before replay is ignored');
  worker.complete();
  assert.deepEqual(
    (await pending).trials.map((trial) => trial.parameters.inputs!.Length),
    [1, 2],
  );
  pool.dispose();
});

test('a cached sweep input is scoped to its source and revision', () => {
  const state: EngineWorkerState = {};
  const request = {
    kind: 'optimize' as const,
    source,
    common,
    parameters: [{}],
    chunkIndex: 0,
    totalChunks: 1,
    requestId: 1,
    sourceRevision: 0,
  };
  handleOptimizationWorkerRequest(request, undefined, undefined, state);
  const saved = state.optimization!.common;
  const same = handleOptimizationWorkerRequest(
    { ...request, common: undefined },
    undefined,
    undefined,
    state,
  );
  assert.equal(same.at(-1)!.kind, 'optimized');
  assert.equal(state.optimization!.common, saved);
  for (const change of [{ source: `${source}\nplot(close)` }, { sourceRevision: 1 }]) {
    const replies = handleOptimizationWorkerRequest(
      { ...request, ...change, common: undefined },
      undefined,
      undefined,
      state,
    );
    assert.equal(replies[0].kind, 'failed');
  }
});

test('wrong revisions and repeated delivered trials cannot corrupt run counts', async () => {
  const { pool, workers } = controlledPool();
  const run = pool.optimize(source, common, [{ inputs: { Length: 1 } }], { sourceRevision: 3 });
  const request = workers[0].requests[0] as Extract<EngineWorkerRequest, { kind: 'optimize' }>;
  const responses = handleOptimizationWorkerRequest(request);
  const deliver = workers[0].onmessage!;
  const trial = responses.find((response) => response.kind === 'trial')!;
  deliver(new MessageEvent('message', { data: { ...trial, sourceRevision: 2 } }));
  deliver(new MessageEvent('message', { data: trial }));
  deliver(new MessageEvent('message', { data: trial }));
  deliver(new MessageEvent('message', { data: responses.at(-1)! }));
  const result = await run;
  assert.equal(result.trials.length, 1);
  assert.equal(result.errorCount, 0);
  pool.dispose();
});

test('worker creation and postMessage failures terminate allocated workers and permit recovery', async () => {
  const workers: ControlledWorker[] = [];
  let failCreation = false;
  const pool = new OptimizationWorkerPool(() => {
    if (failCreation) throw new Error('Worker allocation failed');
    const worker = new ControlledWorker();
    workers.push(worker);
    return worker;
  });
  const previousRun = pool.optimize(source, common, [{}]);
  workers[0].complete();
  const previous = await previousRun;
  const rejected = assert.rejects(
    pool.optimize(source, common, [{}, {}, {}], { workerCount: 2 }),
    /allocation failed/,
  );
  failCreation = true;
  workers[1].complete();
  await rejected;
  assert.equal(workers[1].terminated, true);
  assert.equal(pool.lastResult, previous);
  failCreation = false;
  const recovered = pool.optimize(source, common, [{}]);
  workers[2].complete();
  assert.equal((await recovered).trials.length, 1);
  pool.dispose();
  const broken = new ControlledWorker();
  broken.postMessage = () => {
    throw new Error('Cannot clone input');
  };
  const failedPool = new OptimizationWorkerPool(() => broken);
  await assert.rejects(failedPool.optimize(source, common, [{}]), /Cannot clone/);
  assert.equal(broken.terminated, true);
  failedPool.dispose();
});

test('real B_orders sweep changes metrics for three parameter values and reproduction is exact', async () => {
  const directory = new URL(
    '../../golden/fixtures/strategy/v6/B_orders_strings__none/',
    import.meta.url,
  );
  const [strategy, csvText, metadataText] = await Promise.all(
    ['source.pine', 'data.csv', 'meta.json'].map((name) =>
      readFile(new URL(name, directory), 'utf8'),
    ),
  );
  const metadata = JSON.parse(metadataText);
  const input: RunInput = {
    bars: parseBars(csvText),
    syminfo: metadata.syminfo,
    timeframe: metadata.timeframe,
  };
  const parameters = [0.05, 0.3, 0.5].map((value) => ({
    inputs: { 'stop / limit distance %': value },
  }));
  const pool = new OptimizationWorkerPool(() => new FakeWorker());
  const result = await pool.optimize(strategy, input, parameters, { workerCount: 2 });
  assert.equal(new Set(result.trials.map((t) => t.trialId)).size, 3);
  const values = result.trials.map((t) => metricValue(t.metrics, 'Net profit'));
  assert.equal(new Set(values).size, 3);
  for (let i = 0; i < parameters.length; i++) {
    const expected = runStrategy(strategy, { ...input, inputs: parameters[i].inputs });
    assert.deepEqual(result.trials[i].metrics, expected.metrics);
    assert.equal(result.trials[i].tradeCount, 1708);
    assert.deepEqual(result.trials[i].diagnostics, []);
  }
  assert.ok(Math.abs(values[0]! - -0.31) < 1e-9);
  assert.ok(Math.abs(values[1]! - 17) < 1e-9);
  assert.ok(Math.abs(values[2]! - 9.82) < 1e-9);
  const best = result.trials[1];
  assert.deepEqual((await pool.reproduce(strategy, input, best.parameters)).metrics, best.metrics);
  pool.dispose();
});

test('pool chunks work across workers and reports aggregate progress', async () => {
  const workers: FakeWorker[] = [];
  const progress: number[] = [];
  const pool = new OptimizationWorkerPool(() => {
    const worker = new FakeWorker();
    workers.push(worker);
    return worker;
  });
  const result = await pool.optimize(
    source,
    common,
    [{ inputs: { Length: 1 } }, { inputs: { Length: 2 } }, { inputs: { Length: 3 } }],
    { workerCount: 2, chunkSize: 1, onProgress: (event) => progress.push(event.completed) },
  );
  assert.equal(result.trials.length, 3);
  assert.equal(workers.length, 2);
  assert.equal(progress.at(-1), 3);
  pool.dispose();
});

test('cancel rejects active optimization and keeps the previous result', async () => {
  const workers: FakeWorker[] = [];
  const pool = new OptimizationWorkerPool(() => {
    const worker = new FakeWorker();
    workers.push(worker);
    return worker;
  });
  const previous = await pool.optimize(source, common, [{ inputs: { Length: 1 } }]);
  const pending = pool.optimize(
    source,
    common,
    Array.from({ length: 50 }, (_, index) => ({ inputs: { Length: (index % 4) + 1 } })),
    { chunkSize: 1 },
  );
  pool.cancel();
  await assert.rejects(pending, { name: 'WorkerCancelledError' });
  assert.deepEqual(pool.lastResult, previous);
  assert.ok(workers.every((worker) => worker.terminated));
  pool.dispose();
});
