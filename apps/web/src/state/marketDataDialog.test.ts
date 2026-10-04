import { afterEach, expect, test, vi } from 'vitest';
import { exampleRequest } from '../workflows/market-data.ts';
import {
  restoreSelection,
  selectionFrom,
  selectionKey,
  selectionRequest,
} from '../workflows/market-selection.ts';
import { createMarketDataDialogStore, getMarketDataDialogStore } from './marketDataDialog.ts';
import { getMarketDataStore } from './marketData.ts';
import { fakeServices, testInput, testNow } from './test-support.ts';

const sessions: ReturnType<typeof fakeServices>[] = [];
function setup(raw: string | null = null) {
  const services = fakeServices();
  sessions.push(services);
  const storage = {
    getItem: vi.fn(() => raw),
    setItem: vi.fn((_key: string, value: string) => {
      raw = value;
    }),
  };
  const store = createMarketDataDialogStore(services, storage);
  const market = getMarketDataStore(services);
  return { services, storage, store, market, actions: store.getState().actions };
}
afterEach(() => {
  for (const services of sessions.splice(0)) services.dispose();
  vi.useRealTimers();
});

const remembered = { ...restoreSelection(null, testNow), symbol: 'ETHUSDT', timeframe: '240' };

test('opening restores the existing plain-JSON selection without fetching or writing storage', () => {
  const { actions, storage, services } = setup(JSON.stringify(remembered));
  expect(storage.getItem).not.toHaveBeenCalled();
  expect(actions.initialSelection()).toEqual({ now: testNow, selection: remembered });
  expect(storage.getItem).toHaveBeenCalledWith('optipine.marketSelection');
  expect(storage.setItem).not.toHaveBeenCalled();
  expect(services.marketData.getState().fetch.status).toBe('idle');
  expect(services.backtest.getState().dataset).toBeNull();
});

test('incoming requests take precedence over the accepted provider and remembered selection', async () => {
  const { actions, storage, market } = setup(JSON.stringify(remembered));
  const accepted = exampleRequest(testNow);
  await market.getState().actions.fetch(accepted);
  market.getState().actions.accept();
  expect(actions.initialSelection().selection).toEqual(selectionFrom(accepted, testNow));
  const incoming = { ...accepted, symbol: 'SOLUSDT' };
  const fetching = market.getState().actions.fetch(incoming);
  expect(actions.initialSelection().selection).toEqual(selectionFrom(incoming, testNow));
  await fetching;
  expect(actions.initialSelection().selection).toEqual(selectionFrom(incoming, testNow));
  market.getState().actions.cancel();
  expect(actions.initialSelection().selection).toEqual(selectionFrom(accepted, testNow));
  market.getState().actions.useCsv(testInput, 'prices.csv');
  expect(actions.initialSelection().selection).toEqual(remembered);
  expect(storage.setItem).not.toHaveBeenCalled();
});

test('only successful dialog acceptance persists all six selection fields in the original format', async () => {
  const { actions, storage, services, market } = setup();
  const selected = {
    ...restoreSelection(null, testNow),
    preset: 'Custom' as const,
    fromDate: '2025-01-01',
    toDate: '2026-10-03',
  };
  const request = selectionRequest(selected, testNow).request!;
  expect(actions.accept(selected)).toBeNull();
  await market.getState().actions.fetch(request);
  expect(market.getState().fetch.status).toBe('preview');
  market.getState().actions.cancel();
  expect(actions.accept(selected)).toBeNull();
  await market.getState().actions.fetch(request);
  market.getState().actions.editSymbolInfo('mintick', -1);
  expect(actions.accept(selected)).toBeNull();
  expect(storage.setItem).not.toHaveBeenCalled();
  market.getState().actions.editSymbolInfo('mintick', 0.5);
  expect(actions.accept(selected)).not.toBeNull();
  expect(storage.setItem).toHaveBeenCalledExactlyOnceWith(selectionKey, JSON.stringify(selected));
  expect(services.backtest.getState().dataset?.input.syminfo.mintick).toBe(0.5);
  const reopened = setup(storage.getItem());
  expect(reopened.actions.initialSelection().selection).toEqual(selected);
});

test('invalid saved data and denied storage reads use the same default selection', () => {
  const expected = restoreSelection(null, testNow);
  for (const raw of ['{', '{}', JSON.stringify({ ...remembered, timeframe: 'invalid' })]) {
    const { actions } = setup(raw);
    expect(actions.initialSelection().selection).toEqual(expected);
  }
  const { actions, storage } = setup();
  storage.getItem.mockImplementation(() => {
    throw new Error('Storage denied');
  });
  expect(actions.initialSelection().selection).toEqual(expected);
});

test('a denied storage write does not undo acceptance or its dataset provenance', async () => {
  const { actions, storage, market, services } = setup();
  storage.setItem.mockImplementation(() => {
    throw new Error('Quota exceeded');
  });
  const request = exampleRequest(testNow);
  await market.getState().actions.fetch(request);
  expect(actions.accept(selectionFrom(request, testNow))?.request).toEqual(request);
  expect(market.getState().origin).toEqual({ kind: 'provider', request });
  expect(services.backtest.getState().dataset).not.toBeNull();
});

test('dialog stores share their service owner and bridge search state to selectors', async () => {
  vi.useFakeTimers();
  const fetcher = vi.fn<typeof fetch>(async () => Response.json({ symbols: [] }));
  const services = fakeServices({ fetcher });
  sessions.push(services);
  const store = getMarketDataDialogStore(services);
  expect(getMarketDataDialogStore(services)).toBe(store);
  expect(fetcher).not.toHaveBeenCalled();
  store.getState().actions.search('yahoo', ' AAPL ');
  expect(store.getState().loading).toBe(true);
  await vi.advanceTimersByTimeAsync(180);
  expect(fetcher.mock.calls[0]?.[0]).toContain('feed=yahoo&q=AAPL');
  expect(store.getState()).toMatchObject({ loading: false, results: [], failure: null });
});

test.each([false, true])(
  'service disposal cancels search before or after dispatch (%s)',
  async (dispatched) => {
    vi.useFakeTimers();
    let signal: AbortSignal | null | undefined;
    let resolve!: (response: Response) => void;
    const fetcher = vi.fn((_url: unknown, init?: RequestInit) => {
      signal = init?.signal;
      return new Promise<Response>((done) => {
        resolve = done;
      });
    });
    const services = fakeServices({ fetcher });
    sessions.push(services);
    const store = getMarketDataDialogStore(services);
    const listener = vi.fn();
    store.getState().actions.search('binance', 'BTC');
    if (dispatched) await vi.advanceTimersByTimeAsync(180);
    store.subscribe(listener);
    services.dispose();
    if (dispatched) {
      expect(signal?.aborted).toBe(true);
      resolve(Response.json({ symbols: [] }));
    }
    await vi.advanceTimersByTimeAsync(180);
    expect(fetcher).toHaveBeenCalledTimes(dispatched ? 1 : 0);
    expect(listener).not.toHaveBeenCalled();
  },
);
