import assert from 'node:assert/strict';
import { test } from 'node:test';
import { describe, runWithEquity as runStrategy } from '@pine/engine';
import type { RunInput, RunResult } from '@pine/engine';
import {
  EngineWorkerClient,
  WorkerCancelledError,
  WorkerCrashedError,
  WorkerStaleError,
} from './client.ts';
import { handleEngineWorkerRequest } from './dispatcher.ts';
import { availableWorkerCount } from './protocol.ts';
import type {
  EngineWorkerRequest,
  EngineWorkerResponse,
  EngineWorkerTransport,
} from './protocol.ts';

class FakeWorker implements EngineWorkerTransport {
  onmessage: EngineWorkerTransport['onmessage'] = null;
  onerror: EngineWorkerTransport['onerror'] = null;
  onmessageerror: EngineWorkerTransport['onmessageerror'] = null;
  readonly requests: EngineWorkerRequest[] = [];
  terminated = false;

  postMessage(request: EngineWorkerRequest): void {
    assert.equal(this.terminated, false);
    this.requests.push(structuredClone(request));
  }

  terminate(): void {
    this.terminated = true;
  }

  respond(response: EngineWorkerResponse): void {
    this.onmessage?.(
      new MessageEvent<EngineWorkerResponse>('message', { data: structuredClone(response) }),
    );
  }

  crash(message = 'worker crashed'): void {
    this.onerror?.({ message, preventDefault() {} } as ErrorEvent);
  }
}

function createHarness(): { client: EngineWorkerClient; workers: FakeWorker[] } {
  const workers: FakeWorker[] = [];
  const client = new EngineWorkerClient(() => {
    const worker = new FakeWorker();
    workers.push(worker);
    return worker;
  });
  return { client, workers };
}

const source =
  '//@version=6\nstrategy("Worker strategy")\nlength = input.int(2, "Length")\nplot(close)';
const input: RunInput = {
  bars: [{ time: 1704067200, open: 100, high: 102, low: 99, close: 101, volume: 10 }],
  syminfo: { type: 'crypto', timezone: 'Etc/UTC', mintick: 0.01, pointvalue: 1 },
  timeframe: '60',
};
const result: RunResult = { plots: [], trades: [], metrics: { netProfit: 123 }, diagnostics: [] };

test('module-worker dispatcher preserves public engine descriptions and complete run metrics', () => {
  const request = { kind: 'run' as const, source, input, requestId: 15, sourceRevision: 7 };
  const response = structuredClone(handleEngineWorkerRequest(request));
  assert.equal(response.requestId, 15);
  assert.equal(response.sourceRevision, 7);
  assert.equal(response.kind, 'ran');
  if (response.kind !== 'ran') assert.fail('Expected a run response');
  assert.deepEqual(response.result, runStrategy(source, input));
  const described = handleEngineWorkerRequest({
    kind: 'describe',
    source,
    requestId: 16,
    sourceRevision: 7,
  });
  assert.equal(described.kind, 'described');
  if (described.kind !== 'described') assert.fail('Expected a description response');
  assert.deepEqual(described.description, describe(source));
  assert.equal(described.description.inputs[0]?.title, 'Length');
  assert.equal(typeof globalThis.document, 'undefined');
  assert.equal(typeof globalThis.Worker, 'undefined');
});

test('a reproduction snapshot failure rejects without posting or leaking pending work', async () => {
  const { client, workers } = createHarness();
  await assert.rejects(client.reproduce(source, { ...input, inputs: { invalid: () => 1 } }, {}), {
    name: 'DataCloneError',
  });
  assert.equal(client.pendingCount, 0);
  assert.equal(workers[0].requests.length, 0);
  client.dispose();
});

test('concurrent requests are correlated by request id even when replies arrive out of order', async () => {
  const { client, workers } = createHarness();
  const descriptionPromise = client.describe(source, 1);
  const runPromise = client.run(source, input, 1);
  const worker = workers[0]!;
  const [descriptionRequest, runRequest] = worker.requests;
  assert.notEqual(descriptionRequest!.requestId, runRequest!.requestId);
  worker.respond(handleEngineWorkerRequest(runRequest!));
  worker.respond(handleEngineWorkerRequest(descriptionRequest!));
  assert.deepEqual(await runPromise, runStrategy(source, input));
  assert.deepEqual(await descriptionPromise, describe(source));
  assert.equal(client.pendingCount, 0);
  client.dispose();
});

test('source edits reject old work and discard late responses without touching the new request', async () => {
  const { client, workers } = createHarness();
  const obsolete = client.run(source, input, 1);
  const rejected = assert.rejects(obsolete, WorkerStaleError);
  const staleRequest = workers[0]!.requests[0]!;
  const lateDelivery = workers[0]!.onmessage!;
  client.setSourceRevision(2);
  await rejected;
  assert.equal(workers[0]!.terminated, true);
  const current = client.run(source, input, 2);
  lateDelivery(
    new MessageEvent<EngineWorkerResponse>('message', {
      data: {
        requestId: staleRequest.requestId,
        sourceRevision: staleRequest.sourceRevision,
        kind: 'ran',
        result,
      },
    }),
  );
  const worker = workers[1]!;
  const request = worker.requests[0]!;
  worker.respond({ requestId: request.requestId, sourceRevision: 1, kind: 'ran', result });
  assert.equal(client.pendingCount, 1, 'wrong-revision responses must not resolve current work');
  worker.respond({ requestId: request.requestId, sourceRevision: 2, kind: 'ran', result });
  assert.deepEqual(await current, result);
  await assert.rejects(client.run(source, input, 1), WorkerStaleError);
  assert.equal(worker.requests.length, 1, 'old requests never reach the worker');
  client.dispose();
});

test('cancel terminates all pending work, ignores late delivery, and recreates a usable worker', async () => {
  const { client, workers } = createHarness();
  const pendingRun = client.run(source, input, 0);
  const pendingDescribe = client.describe(source, 0);
  const rejected = Promise.all([
    assert.rejects(pendingRun, WorkerCancelledError),
    assert.rejects(pendingDescribe, WorkerCancelledError),
  ]);
  const originalWorker = workers[0]!;
  const oldRequest = originalWorker.requests[0]!;
  const lateDelivery = originalWorker.onmessage!;
  client.cancel();
  await rejected;
  assert.equal(originalWorker.terminated, true);
  assert.equal(workers.length, 2);
  assert.equal(client.pendingCount, 0);
  const nextRun = client.run(source, input);
  lateDelivery(
    new MessageEvent<EngineWorkerResponse>('message', {
      data: {
        requestId: oldRequest.requestId,
        sourceRevision: oldRequest.sourceRevision,
        kind: 'ran',
        result,
      },
    }),
  );
  assert.equal(client.pendingCount, 1);
  const nextRequest = workers[1]!.requests[0]!;
  assert.ok(nextRequest.requestId > oldRequest.requestId);
  workers[1]!.respond({ ...nextRequest, kind: 'ran', result });
  assert.deepEqual(await nextRun, result);
  client.dispose();
});

test('worker crash rejects every pending request and recovers for a later request', async () => {
  const { client, workers } = createHarness();
  const rejected = Promise.all([
    assert.rejects(client.run(source, input), {
      name: 'WorkerCrashedError',
      message: 'out of memory',
    }),
    assert.rejects(client.describe(source), WorkerCrashedError),
  ]);
  workers[0]!.crash('out of memory');
  await rejected;
  assert.equal(client.pendingCount, 0);
  assert.equal(workers[0]!.terminated, true);
  const recovered = client.run(source, input);
  workers[1]!.respond(handleEngineWorkerRequest(workers[1]!.requests[0]!));
  assert.deepEqual(await recovered, runStrategy(source, input));
  client.dispose();
});

test('message decoding failures reject pending requests instead of hanging forever', async () => {
  const { client, workers } = createHarness();
  const rejected = assert.rejects(client.run(source, input), WorkerCrashedError);
  workers[0]!.onmessageerror?.({} as MessageEvent);
  await rejected;
  assert.equal(client.pendingCount, 0);
  assert.equal(workers[0]!.terminated, true);
  client.dispose();
});

test('engine exceptions return a correlated serializable failure', async () => {
  const { client, workers } = createHarness();
  const rejected = assert.rejects(client.describe(source), {
    name: 'RangeError',
    message: 'limit reached',
  });
  const response = handleEngineWorkerRequest(workers[0]!.requests[0]!, {
    describe() {
      throw new RangeError('limit reached');
    },
    runStrategy,
  });
  assert.equal(response.kind, 'failed');
  workers[0]!.respond(response);
  await rejected;
  assert.equal(workers.length, 1, 'an engine exception is not a worker crash');
  client.dispose();
});

test('dispose rejects work and prevents new work without creating another worker', async () => {
  const { client, workers } = createHarness();
  const rejected = assert.rejects(client.describe(source), WorkerCancelledError);
  client.dispose();
  client.dispose();
  client.cancel();
  await rejected;
  await assert.rejects(client.run(source, input), WorkerCancelledError);
  assert.equal(workers.length, 1);
  assert.equal(workers[0]!.terminated, true);
});

test('future pool capacity keeps one CPU for rendering and always permits one worker', () => {
  assert.equal(availableWorkerCount(8), 7);
  assert.equal(availableWorkerCount(2), 1);
  assert.equal(availableWorkerCount(1), 1);
  assert.equal(availableWorkerCount(0), 1);
  assert.equal(availableWorkerCount(Number.NaN), 1);
});
