import { afterEach, expect, test, vi } from 'vitest';
import { ManualWorker } from '../workflows/test-support.ts';
import { exampleRequest } from '../workflows/market-data.ts';
import {
  disposeServices,
  getServices,
  installServiceLifecycle,
  replaceServices,
} from './services.ts';
import { fakeServices, testInput, testNow } from './test-support.ts';

afterEach(disposeServices);

test('reading an empty session does not start a Worker; the first source edit creates one client', async () => {
  const worker = new ManualWorker();
  const engineWorker = vi.fn(() => worker);
  const services = fakeServices({ engineWorker });
  expect(services.backtest.getState().source).toBe('');
  expect(services.optimization).toBeNull();
  const { session } = await services.loadOptimization();
  expect(session.getState().run.status).toBe('idle');
  expect(engineWorker).not.toHaveBeenCalled();
  services.backtest.setSource('strategy("First")');
  services.backtest.setSource('strategy("First")');
  expect(services.engine).toBe(services.engine);
  expect(engineWorker).toHaveBeenCalledTimes(1);
  services.dispose();
  expect(worker.terminated).toBe(true);
});

test('services are lazy singletons and test replacement disposes the previous owner', () => {
  const first = fakeServices();
  const disposed = vi.spyOn(first, 'dispose');
  const factory = vi.fn(() => first);
  const restore = replaceServices(factory);
  expect(factory).not.toHaveBeenCalled();
  expect(getServices()).toBe(first);
  expect(getServices()).toBe(first);
  expect(factory).toHaveBeenCalledTimes(1);
  const replacement = fakeServices();
  const restoreReplacement = replaceServices(() => replacement);
  expect(disposed).toHaveBeenCalledTimes(1);
  expect(getServices()).toBe(replacement);
  restoreReplacement();
  restore();
});

test.each([1, 2, 8, 0, NaN])(
  'thread count leaves one CPU free with a minimum of one: %s',
  async (count) => {
    const services = fakeServices({ hardwareConcurrency: count });
    expect(services.threads).toBe(Number.isFinite(count) ? Math.max(1, count - 1) : 1);
    const { session } = await services.loadOptimization();
    expect(session.getState().runBlock.threads).toBe(services.threads);
    services.dispose();
  },
);

test('unload terminates pending Workers, aborts fetch and releases subscriptions exactly once', async () => {
  const workers: ManualWorker[] = [];
  let signal: AbortSignal | null | undefined;
  const services = fakeServices({
    engineWorker: () => {
      const worker = new ManualWorker();
      workers.push(worker);
      return worker;
    },
    fetcher: async (_url, init) => {
      signal = init?.signal;
      return new Promise<Response>((_resolve, reject) => {
        signal?.addEventListener('abort', () => reject(signal?.reason), { once: true });
      });
    },
  });
  const restore = replaceServices(() => services);
  const remove = installServiceLifecycle();
  expect(getServices()).toBe(services);
  const cleanup = vi.fn();
  services.onDispose(cleanup);
  const pending = services.engine.describe('strategy("Pending")');
  const { pool } = await services.loadOptimization();
  const reproduction = pool.reproduce('strategy("Pending")', testInput, {});
  const rejected = Promise.allSettled([pending, reproduction]);
  const fetching = services.marketData.fetch(exampleRequest(testNow));
  await vi.waitFor(() => expect(signal).toBeDefined());
  window.dispatchEvent(new PageTransitionEvent('pagehide', { persisted: true }));
  expect(cleanup).not.toHaveBeenCalled();
  window.dispatchEvent(new PageTransitionEvent('pagehide'));
  window.dispatchEvent(new PageTransitionEvent('pagehide'));
  await fetching;
  expect((await rejected).every((result) => result.status === 'rejected')).toBe(true);
  expect(workers.every((worker) => worker.terminated)).toBe(true);
  expect(signal?.aborted).toBe(true);
  expect(cleanup).toHaveBeenCalledTimes(1);
  expect(services.marketData.getState().fetch.status).toBe('idle');
  remove();
  restore();
});

test('services disposed while the optimization side loads hand out a disposed side', async () => {
  const services = fakeServices();
  const loading = services.loadOptimization();
  services.dispose();
  const { session } = await loading;
  expect(services.optimization).toBeNull();
  const listener = vi.fn();
  session.subscribe(listener);
  services.backtest.setInput('Length', 7);
  expect(listener).not.toHaveBeenCalled();
});

test('installing and removing the unload listener does not create services', () => {
  const factory = vi.fn(() => fakeServices());
  const restore = replaceServices(factory);
  const remove = installServiceLifecycle();
  remove();
  window.dispatchEvent(new PageTransitionEvent('pagehide'));
  expect(factory).not.toHaveBeenCalled();
  restore();
});
