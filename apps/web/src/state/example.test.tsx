import { describe } from '@pine/engine';
import { afterEach, beforeEach, expect, test, vi } from 'vitest';
import { ManualWorker, strategySource } from '../workflows/test-support.ts';
import { exampleRequest } from '../workflows/market-data.ts';
import { getBacktestStore, loadExample, openScript } from './backtest.ts';
import { getMarketDataStore } from './marketData.ts';
import { getServices, replaceServices } from './services.ts';
import { fakeServices, testDataset, testInput, testNow } from './test-support.ts';
import { uiStore } from './ui.ts';

let restore: () => void;
let workers: ManualWorker[];
const worker = () => workers.at(-1)!;
beforeEach(() => {
  workers = [];
  restore = replaceServices(() =>
    fakeServices({
      engineWorker: () => {
        const next = new ManualWorker();
        workers.push(next);
        return next;
      },
    }),
  );
  uiStore.setState({ openDialogs: [], page: 'backtest' });
});
afterEach(() => restore());

async function previewReady() {
  await vi.waitFor(() => expect(getMarketDataStore().getState().fetch.status).toBe('preview'));
}

test('data arriving before compilation starts exactly one run once compilation succeeds', async () => {
  const loading = loadExample('trend-breakout');
  await previewReady();
  expect(worker().requests.map(({ kind }) => kind)).toEqual(['describe']);
  worker().answer();
  await vi.waitFor(() => expect(getBacktestStore().getState().run.status).toBe('running'));
  expect(worker().requests.map(({ kind }) => kind)).toEqual(['run']);
  // The same action as the Run button cannot enqueue a second run.
  await getBacktestStore().getState().actions.run();
  expect(worker().requests).toHaveLength(1);
  worker().answer();
  await loading;
  expect(getBacktestStore().getState().run.status).toBe('done');
});

test('a failed compile accepts valid data but never starts a run', async () => {
  const loading = loadExample('trend-breakout');
  await previewReady();
  const request = worker().requests.shift()!;
  worker().reply({
    ...request,
    kind: 'described',
    description: describe('//@version=6\nstrategy("Broken")\nplot(missing)'),
  });
  await loading;
  expect(getBacktestStore().getState().compile.status).toBe('failed');
  expect(getBacktestStore().getState().dataset).not.toBeNull();
  expect(worker().requests).toEqual([]);
  expect(getBacktestStore().getState().run.status).toBe('idle');
});

for (const replacement of ['script', 'edit', 'market', 'csv', 'dispose'] as const)
  test(`a ${replacement} superseding the compile wait prevents an automatic run`, async () => {
    const run = vi.spyOn(getServices().engine, 'run');
    const loading = loadExample('trend-breakout');
    await previewReady();
    if (replacement === 'script')
      openScript({ source: strategySource, fileName: null, origin: { kind: 'pasted' } });
    else if (replacement === 'edit')
      getBacktestStore().getState().actions.setSource(strategySource);
    else if (replacement === 'market')
      await getMarketDataStore()
        .getState()
        .actions.fetch({ ...exampleRequest(testNow), symbol: 'ETHUSDT' });
    else if (replacement === 'csv')
      getMarketDataStore().getState().actions.useCsv(testInput, 'local.csv');
    else getServices().dispose();
    await loading;
    expect(run).not.toHaveBeenCalled();
  });

test('a market selection made during the fetch cannot be accepted or run by the example', async () => {
  restore();
  let respond!: (response: Response) => void;
  restore = replaceServices(() =>
    fakeServices({
      fetcher: () =>
        new Promise<Response>((resolve) => {
          respond = resolve;
        }),
    }),
  );
  const run = vi.spyOn(getServices().engine, 'run');
  const loading = loadExample('trend-breakout');
  await vi.waitFor(() => expect(respond).toBeDefined());
  getMarketDataStore().getState().actions.useCsv(testInput, 'local.csv');
  respond(Response.json(testDataset));
  await loading;
  expect(getMarketDataStore().getState().origin).toEqual({ kind: 'csv', fileName: 'local.csv' });
  expect(run).not.toHaveBeenCalled();
});

test('a refused example opens recovery without running on previously accepted data', async () => {
  restore();
  restore = replaceServices(() =>
    fakeServices({
      fetcher: async () =>
        Response.json(
          {
            error: {
              name: 'CodedError',
              code: 'feedRegionBlocked',
              uiText: { kind: 'message', id: 'feedRegionBlocked', values: { status: 451 } },
            },
          },
          { status: 451 },
        ),
    }),
  );
  const run = vi.spyOn(getServices().engine, 'run');
  getMarketDataStore().getState().actions.useCsv(testInput, 'local.csv');
  await loadExample('trend-breakout');
  expect(getMarketDataStore().getState().fetch.status).toBe('refused');
  expect(uiStore.getState().openDialogs).toEqual(['marketData']);
  expect(run).not.toHaveBeenCalled();
});

test('reloading the same example during its backtest does not start another run', async () => {
  const first = loadExample('trend-breakout');
  await previewReady();
  worker().answer();
  await vi.waitFor(() => expect(getBacktestStore().getState().run.status).toBe('running'));
  const run = vi.spyOn(getServices().engine, 'run');
  await loadExample('trend-breakout');
  expect(run).not.toHaveBeenCalled();
  expect(worker().requests.map(({ kind }) => kind)).toEqual(['run']);
  worker().answer();
  await first;
});

test('opening a different example cancels the previous backtest before starting its own', async () => {
  const first = loadExample('trend-breakout');
  await previewReady();
  worker().answer();
  await vi.waitFor(() => expect(getBacktestStore().getState().run.status).toBe('running'));
  const oldWorker = worker();
  const next = loadExample('ma-cross');
  await first;
  expect(oldWorker.terminated).toBe(true);
  await previewReady();
  worker().answer();
  await vi.waitFor(() => expect(getBacktestStore().getState().run.status).toBe('running'));
  worker().answer();
  await next;
  expect(getBacktestStore().getState().origin).toMatchObject({ id: 'ma-cross' });
  expect(getBacktestStore().getState().run.status).toBe('done');
});

for (const sameScript of [true, false])
  test(`loading ${sameScript ? 'the same' : 'another'} example during optimization follows script replacement rules`, async () => {
    const first = loadExample('trend-breakout');
    await previewReady();
    worker().answer();
    await vi.waitFor(() => expect(getBacktestStore().getState().run.status).toBe('running'));
    worker().answer();
    await first;
    const { session: optimization } = await getServices().loadOptimization();
    for (const row of optimization.getState().search.rows)
      optimization.setSearched(row.descriptor.title, false);
    const optimizing = optimization.start();
    await vi.waitFor(() =>
      expect(workers.some((w) => w.requests.some(({ kind }) => kind === 'optimize'))).toBe(true),
    );
    const poolWorker = worker();
    const run = vi.spyOn(getServices().engine, 'run');
    const loading = loadExample(sameScript ? 'trend-breakout' : 'ma-cross');
    if (sameScript) {
      await loading;
      expect(run).not.toHaveBeenCalled();
      expect(optimization.getState().run.status).toBe('running');
      optimization.cancel();
    } else {
      expect(poolWorker.terminated).toBe(true);
      await previewReady();
      const engineWorker = workers.find(
        (w) => !w.terminated && w.requests.some(({ kind }) => kind === 'describe'),
      )!;
      engineWorker.answer();
      await vi.waitFor(() => expect(getBacktestStore().getState().run.status).toBe('running'));
      engineWorker.answer();
      await loading;
      expect(run).toHaveBeenCalledOnce();
      expect(optimization.getState().run.status).toBe('idle');
    }
    await optimizing;
  });
