import test from 'node:test';
import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import { createServer } from 'node:http';
import { once } from 'node:events';
import { connect } from 'node:net';
import { run, runWithEquity as runStrategy } from '@pine/engine';
import { FeedClient, FeedImportSession, type FeedCache } from './client.ts';
import { validateFeedRequest, type FeedRequest, type FeedDataset } from './contracts.ts';
import { loadFeed, searchFeed, type FetchJson } from './providers.ts';
import { createMarketMiddleware, createUpstreamFetch } from './proxy.ts';

const fixture = async (name: string) =>
  JSON.parse(await readFile(new URL(`../test/fixtures/${name}.json`, import.meta.url), 'utf8'));
const profile = await fixture('binance-profile'),
  candles = await fixture('binance-bars');
const hourly = await fixture('yahoo-hourly'),
  daily = await fixture('yahoo-daily');
const from = Date.UTC(2025, 10, 26) / 1000,
  to = Date.UTC(2025, 10, 30) / 1000;
const now = Date.UTC(2026, 8, 21);
const signal = () => new AbortController().signal;
const request: FeedRequest = { feed: 'binance', symbol: 'BTCUSDT', timeframe: '60', from, to };
const upstream: FetchJson = async (url) =>
  structuredClone(
    url.pathname.endsWith('exchangeInfo')
      ? profile
      : url.pathname.endsWith('klines')
        ? candles
        : url.searchParams.get('interval') === '1d'
          ? daily
          : hourly,
  );
const noCache: FeedCache = { get: async () => undefined, put: async () => {} };
const response = (data: unknown) =>
  new Response(JSON.stringify(data), { headers: { 'Content-Type': 'application/json' } });

test('recorded Binance prices, exchange filters and real engine metrics survive the feed boundary', async () => {
  const result = await loadFeed(request, upstream, signal(), now);
  assert.equal(result.input.bars.length, 10);
  assert.equal(result.input.syminfo.mintick, 0.01);
  assert.equal(result.input.syminfo.mincontract, 0.00001);
  assert.deepEqual(result.input.bars[0], {
    time: candles[0][0] / 1000,
    open: Number(candles[0][1]),
    high: Number(candles[0][2]),
    low: Number(candles[0][3]),
    close: Number(candles[0][4]),
    volume: Number(candles[0][5]),
  });
  const source = await readFile(
    new URL('../../golden/fixtures/strategy/v6/S_sizing_crypto/source.pine', import.meta.url),
    'utf8',
  );
  const direct = run(source, result.input),
    report = runStrategy(source, result.input);
  assert.deepEqual(report.metrics, direct.metrics);
  assert.deepEqual(direct.diagnostics, []);
});

test('Binance paginates without duplicate bars and never admits the current open candle', async () => {
  const start = from * 1000;
  const rows = Array.from({ length: 1002 }, (_, i) => [
    start + i * 3600_000,
    '10',
    '12',
    '9',
    '11',
    '5',
    start + (i + 1) * 3600_000 - 1,
  ]);
  const starts: number[] = [];
  const get: FetchJson = async (url) => {
    if (url.pathname.endsWith('exchangeInfo')) return profile;
    const cursor = Number(url.searchParams.get('startTime'));
    starts.push(cursor);
    return rows.filter((row) => Number(row[0]) >= cursor).slice(0, 1000);
  };
  const result = await loadFeed(
    { ...request, to: from + 1003 * 3600 },
    get,
    signal(),
    start + 1001 * 3600_000 + 500,
  );
  assert.equal(result.input.bars.length, 1001);
  assert.deepEqual(starts, [start, start + 999 * 3600_000 + 1]);
  assert.equal(new Set(result.input.bars.map((b) => b.time)).size, 1001);
});

test('missing prices, invalid OHLC and broken ordering fail explicitly', async () => {
  for (const alter of [
    (rows: any[]) => {
      rows[0][1] = null;
    },
    (rows: any[]) => {
      rows[0][2] = '-1';
    },
    (rows: any[]) => {
      rows[1][0] = rows[0][0];
    },
  ]) {
    const rows = structuredClone(candles);
    alter(rows);
    await assert.rejects(
      loadFeed(
        request,
        async (url) => (url.pathname.endsWith('exchangeInfo') ? profile : rows),
        signal(),
        now,
      ),
    );
  }
});

test('real Yahoo Thanksgiving sessions retain the holiday and early close without synthesized bars', async () => {
  const data = await loadFeed(
    { ...request, feed: 'yahoo', symbol: 'AAPL' },
    upstream,
    signal(),
    now,
  );
  assert.deepEqual(
    data.input.sessionCalendar!.sessions.map((s) => s.tradingDay),
    ['2025-11-26', '2025-11-28'],
  );
  const sessions = data.input.sessionCalendar!.sessions;
  assert.equal(sessions[0].close - sessions[0].open, 6.5 * 3600);
  assert.equal(sessions[1].close - sessions[1].open, 3.5 * 3600);
  assert.ok(
    data.input.bars.every((b) => sessions.some((s) => b.time >= s.open && b.time < s.close)),
  );
  assert.equal(data.input.bars.length, 10);
  assert.equal(data.input.syminfo.timezone, 'America/New_York');
  assert.equal(data.profileEstimated, true);
});

test('Yahoo daily bars fetch a separate real calendar and retain their unmodified OHLC', async () => {
  const intervals: string[] = [];
  const data = await loadFeed(
    { ...request, feed: 'yahoo', symbol: 'AAPL', timeframe: '1D' },
    async (url, s) => {
      intervals.push(url.searchParams.get('interval')!);
      return upstream(url, s);
    },
    signal(),
    now,
  );
  assert.deepEqual(intervals, ['1d', '60m']);
  assert.equal(data.input.bars.length, 2);
  assert.equal(data.input.bars[1].close, daily.chart.result[0].indicators.quote[0].close[1]);
  assert.equal(data.input.realtimeTail, false);
});

test('Yahoo missing calendars, partial quote fields and unknown multipliers do not silently load', async () => {
  for (const mutate of [
    (data: any) => {
      delete data.chart.result[0].meta.tradingPeriods;
    },
    (data: any) => {
      data.chart.result[0].indicators.quote[0].low[0] = null;
    },
    (data: any) => {
      data.chart.result[0].meta.instrumentType = 'FUTURE';
    },
  ]) {
    const data = structuredClone(hourly);
    mutate(data);
    await assert.rejects(
      loadFeed({ ...request, feed: 'yahoo', symbol: 'AAPL' }, async () => data, signal(), now),
    );
  }
});

test('provider bounds reject unsupported ranges and unsafe symbols before fetching', () => {
  assert.throws(() => validateFeedRequest({ ...request, symbol: '../../secrets' }, now));
  assert.throws(() => validateFeedRequest({ ...request, timeframe: '1', from: 0 }, now));
  assert.throws(() => validateFeedRequest({ ...request, feed: 'yahoo', timeframe: '5' }, now));
  assert.throws(() => validateFeedRequest({ ...request, from: NaN }, now));
  assert.equal(validateFeedRequest({ ...request, symbol: 'btcusdt' }, now).symbol, 'BTCUSDT');
});

test('search results use actual provider symbols and exclude Yahoo futures without contract metadata', async () => {
  const symbols = await searchFeed('binance', 'btc', upstream, signal());
  assert.equal(symbols[0].symbol, 'BTCUSDT');
  const yahoo = await searchFeed(
    'yahoo',
    'AAPL',
    async () => ({
      quotes: [
        { symbol: 'AAPL', quoteType: 'EQUITY', shortname: 'Apple' },
        { symbol: 'ES=F', quoteType: 'FUTURE' },
      ],
    }),
    signal(),
  );
  assert.deepEqual(
    yahoo.map((s) => s.symbol),
    ['AAPL'],
  );
});

test('proxy cache avoids repeated upstream calls and rate-limit cooldown prevents immediate retries', async () => {
  let calls = 0;
  const get = createUpstreamFetch(async () => {
    calls++;
    return response(profile);
  });
  const url = new URL('https://data-api.binance.vision/api/v3/exchangeInfo');
  await get(url, signal());
  await get(url, signal());
  assert.equal(calls, 1);
  const limited = createUpstreamFetch(async () => {
    calls++;
    return new Response('', { status: 429 });
  });
  await assert.rejects(limited(url, signal()));
  await assert.rejects(limited(url, signal()));
  assert.equal(calls, 2);
  await assert.rejects(get(new URL('http://127.0.0.1/secrets'), signal()));
});

test('HTTP middleware returns actual datasets and rejects cross-origin, bad parameters and non-GET requests', async () => {
  const middleware = createMarketMiddleware(upstream);
  const server = createServer((req, res) => middleware(req, res, () => res.writeHead(404).end()));
  server.listen(0, '127.0.0.1');
  await once(server, 'listening');
  try {
    const address = server.address() as { port: number };
    const base = `http://127.0.0.1:${address.port}/api/market`;
    const result = await fetch(
      `${base}/bars?${new URLSearchParams({ ...request, from: String(from), to: String(to) })}`,
    );
    assert.equal(result.status, 200);
    assert.equal((await result.json()).input.bars.length, 10);
    assert.equal(
      (
        await fetch(`${base}/search?feed=binance&q=BTC`, {
          headers: { Origin: 'https://example.com' },
        })
      ).status,
      403,
    );
    assert.equal((await fetch(`${base}/search?feed=bad&q=BTC`)).status, 400);
    assert.equal((await fetch(`${base}/search`, { method: 'POST' })).status, 405);
  } finally {
    server.closeAllConnections();
    await new Promise<void>((resolve) => server.close(() => resolve()));
  }
});

test('browser cache reuses an identical request and refetches a changed date range', async () => {
  const data = await loadFeed(request, upstream, signal(), now);
  const cache = new Map<string, FeedDataset>();
  let calls = 0;
  const client = new FeedClient(
    async () => {
      calls++;
      return response(data);
    },
    {
      get: async (key) => cache.get(key),
      put: async (key, value) => {
        cache.set(key, value);
      },
    },
  );
  assert.equal((await client.load(request, signal())).cached, false);
  assert.equal((await client.load(request, signal())).cached, true);
  assert.equal(calls, 1);
  await client.load({ ...request, to: to + 86400 }, signal());
  assert.equal(calls, 2);
});

test('cancel and changed selection discard late feed replies and clear inherited calendars on load', async () => {
  const data = await loadFeed(request, upstream, signal(), now);
  let release!: (value: Response) => void;
  const session = new FeedImportSession();
  const client = new FeedClient(
    () =>
      new Promise<Response>((resolve) => {
        release = resolve;
      }),
    noCache,
  );
  const pending = session.load(request, client);
  await new Promise((resolve) => setImmediate(resolve));
  session.invalidate();
  release(response(data));
  assert.equal(await pending, false);
  assert.equal(session.result, undefined);
  assert.equal(session.pending, false);
  await session.load(request, new FeedClient(async () => response(data), noCache));
  const input = session.buildInput({
    bars: [],
    syminfo: { tickerid: 'OLD' },
    timeframe: '1D',
    inputs: { Fast: 5 },
    settings: { initial_capital: 2000 },
    sessionCalendar: { from, to, sessions: [] },
    realtimeTail: true,
  });
  assert.equal(input.sessionCalendar, undefined);
  assert.equal(input.realtimeTail, false);
  assert.deepEqual(input.inputs, { Fast: 5 });
  assert.equal(input.syminfo.tickerid, 'BINANCE:BTCUSDT');
});

test('HTTP middleware answers a malformed request target with 400 and keeps serving', async () => {
  const middleware = createMarketMiddleware(upstream);
  const server = createServer((req, res) => middleware(req, res, () => res.writeHead(404).end()));
  server.listen(0, '127.0.0.1');
  await once(server, 'listening');
  try {
    const address = server.address() as { port: number };
    // The HTTP parser accepts this target; the WHATWG URL parser throws on it.
    const socket = connect(address.port, '127.0.0.1');
    await once(socket, 'connect');
    let raw = '';
    socket.setEncoding('utf8');
    socket.on('data', (chunk) => {
      raw += chunk;
    });
    socket.write('GET //[/ HTTP/1.1\r\nHost: x\r\nConnection: close\r\n\r\n');
    await once(socket, 'close');
    assert.match(raw, /^HTTP\/1\.1 400 /);
    const result = await fetch(
      `http://127.0.0.1:${address.port}/api/market/search?feed=binance&q=BTC`,
    );
    assert.equal(result.status, 200);
  } finally {
    server.closeAllConnections();
    await new Promise<void>((resolve) => server.close(() => resolve()));
  }
});

test('unexpected upstream shapes answer with the generic feed message, not internals', async () => {
  const middleware = createMarketMiddleware((async () => null) as unknown as FetchJson);
  const server = createServer((req, res) => middleware(req, res, () => res.writeHead(404).end()));
  server.listen(0, '127.0.0.1');
  await once(server, 'listening');
  const logged: unknown[] = [];
  const original = console.error;
  console.error = (...args: unknown[]) => {
    logged.push(args);
  };
  try {
    const address = server.address() as { port: number };
    const result = await fetch(
      `http://127.0.0.1:${address.port}/api/market/search?feed=binance&q=BTC`,
    );
    assert.equal(result.status, 400);
    const body = await result.json();
    assert.equal(body.error.uiText?.id, 'feedInvalidResponse');
    assert.doesNotMatch(body.error.message, /Cannot read|null/);
    assert.equal(logged.length, 1);
  } finally {
    console.error = original;
    server.closeAllConnections();
    await new Promise<void>((resolve) => server.close(() => resolve()));
  }
});
