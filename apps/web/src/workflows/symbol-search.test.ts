import assert from 'node:assert/strict';
import test from 'node:test';
import { marketDataError, type Feed, type FeedSymbol } from '@pine/market-data';
import { SymbolSearchSession } from './symbol-search.ts';

const symbols: FeedSymbol[] = [
  { symbol: 'BTCUSDT', name: 'BTC / USDT', exchange: 'Binance', type: 'crypto' },
];

function harness() {
  const calls: {
    feed: Feed;
    query: string;
    signal: AbortSignal;
    resolve: (symbols: FeedSymbol[]) => void;
    reject: (error: unknown) => void;
  }[] = [];
  const session = new SymbolSearchSession({
    search: (feed, query, signal) =>
      new Promise((resolve, reject) => calls.push({ feed, query, signal, resolve, reject })),
  });
  return { session, calls };
}

test('search debounces edits for 180 ms, trims the query and publishes the latest results', async (t) => {
  t.mock.timers.enable({ apis: ['setTimeout'] });
  const { session, calls } = harness();
  const listener = t.mock.fn();
  const unsubscribe = session.subscribe(listener);
  session.search('binance', 'B');
  assert.deepEqual(session.getState(), { results: [], loading: true, failure: null });
  t.mock.timers.tick(179);
  assert.equal(calls.length, 0);
  session.search('binance', '  BTC  ');
  t.mock.timers.tick(179);
  assert.equal(calls.length, 0);
  t.mock.timers.tick(1);
  assert.equal(calls.length, 1);
  assert.equal(calls[0].query, 'BTC');
  calls[0].resolve(symbols);
  await Promise.resolve();
  assert.deepEqual(session.getState(), { results: symbols, loading: false, failure: null });
  assert.ok(listener.mock.callCount() > 0);
  unsubscribe();
  listener.mock.resetCalls();
  session.reset();
  assert.equal(listener.mock.callCount(), 0);
});

test('provider or query changes abort old requests and discard late successes and errors', async (t) => {
  t.mock.timers.enable({ apis: ['setTimeout'] });
  const { session, calls } = harness();
  session.search('binance', 'BTC');
  t.mock.timers.tick(180);
  session.search('binance-futures', 'BTC');
  assert.equal(calls[0].signal.aborted, true);
  t.mock.timers.tick(180);
  session.search('yahoo', 'AAPL');
  assert.equal(calls[1].signal.aborted, true);
  t.mock.timers.tick(180);
  assert.equal(calls[2].feed, 'yahoo');
  calls[0].resolve(symbols);
  calls[1].reject(marketDataError('feedProxyMissing'));
  await Promise.resolve();
  assert.deepEqual(session.getState(), { results: [], loading: true, failure: null });
  calls[2].resolve([]);
  await Promise.resolve();
  assert.deepEqual(session.getState(), { results: [], loading: false, failure: null });
});

test('blank, hidden or disabled queries cancel timers and requests without publishing late replies', async (t) => {
  t.mock.timers.enable({ apis: ['setTimeout'] });
  for (const stop of [
    (session: SymbolSearchSession) => session.search('binance', '  '),
    (session: SymbolSearchSession) => session.search('binance', 'BTC', false),
    (session: SymbolSearchSession) => session.cancel(),
    (session: SymbolSearchSession) => session.reset(),
  ]) {
    const { session, calls } = harness();
    session.search('binance', 'BTC');
    stop(session);
    t.mock.timers.tick(180);
    assert.equal(calls.length, 0);
    session.search('binance', 'BTC');
    t.mock.timers.tick(180);
    stop(session);
    assert.equal(calls[0].signal.aborted, true);
    calls[0].resolve(symbols);
    await Promise.resolve();
    assert.deepEqual(session.getState(), { results: [], loading: false, failure: null });
  }
});

test('errors keep their message data after blur; another query or a remount clears them', async (t) => {
  t.mock.timers.enable({ apis: ['setTimeout'] });
  const { session, calls } = harness();
  const error = marketDataError('feedProxyMissing');
  for (const clear of [() => session.search('yahoo', 'AAPL'), () => session.reset()]) {
    session.search('binance', 'BTC');
    t.mock.timers.tick(180);
    calls.at(-1)!.reject(error);
    await Promise.resolve();
    assert.deepEqual(session.getState(), { results: [], loading: false, failure: error.uiText });
    session.cancel();
    assert.deepEqual(session.getState().failure, error.uiText);
    clear();
    assert.equal(session.getState().failure, null);
  }
});

test('a synchronous transport error becomes search state instead of escaping the timer', async (t) => {
  t.mock.timers.enable({ apis: ['setTimeout'] });
  const error = marketDataError('feedInvalidResponse');
  const session = new SymbolSearchSession({
    search: () => {
      throw error;
    },
  });
  session.search('binance', 'BTC');
  t.mock.timers.tick(180);
  assert.deepEqual(session.getState(), { results: [], loading: false, failure: error.uiText });
});
