import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import test from 'node:test';
import { loadFeed, searchFeed } from './providers.ts';

const fixture = async (name: string) =>
  JSON.parse(await readFile(new URL(`../test/fixtures/${name}.json`, import.meta.url), 'utf8'));
const now = Date.UTC(2026, 9, 4, 3);
const signal = () => new AbortController().signal;

for (const feed of ['binance', 'binance-futures'] as const) {
  test(`${feed} ranks main base-asset pairs before capping recorded search results`, async () => {
    const data = await fixture(`${feed}-search`);
    for (const query of ['BTC', 'eth', 'doge']) {
      const results = await searchFeed(feed, query, async () => data, signal());
      assert.equal(results[0].symbol, `${query.toUpperCase()}USDT`);
      assert.ok(results.length <= 12);
      assert.equal(new Set(results.map((result) => result.symbol)).size, results.length);
      const quotes = ['USDT', 'USDC', 'FDUSD', 'BTC', 'ETH', 'BNB'];
      const mainPairs = quotes
        .map((quote) => `${query.toUpperCase()}${quote}`)
        .filter((symbol) =>
          data.symbols.some((s: any) => s.symbol === symbol && s.status === 'TRADING'),
        );
      assert.deepEqual(
        results.slice(0, mainPairs.length).map((s) => s.symbol),
        mainPairs,
      );
    }
    const exact = await searchFeed(feed, ' ethusdc ', async () => data, signal());
    assert.equal(exact[0].symbol, 'ETHUSDC');
    const prefix = await searchFeed(feed, 'dog', async () => data, signal());
    assert.equal(prefix[0].symbol, 'DOGEUSDT');
    const reordered = await searchFeed(
      feed,
      'BTC',
      async () => ({ symbols: [...data.symbols].reverse() }),
      signal(),
    );
    assert.deepEqual(reordered, await searchFeed(feed, 'btc', async () => data, signal()));
    if (feed === 'binance') assert.equal(reordered.length, 12);
  });
}

for (const [name, timeframe] of [
  ['yahoo-forex-15m', '15'],
  ['yahoo-forex-hourly', '60'],
  ['yahoo-stock-15m', '15'],
  ['yahoo-index-15m', '15'],
] as const) {
  test(`${name} drops absent OHLC observations but still rejects malformed prices`, async () => {
    const recorded = await fixture(name);
    const chart = recorded.chart.result[0];
    const request = {
      feed: 'yahoo' as const,
      symbol: chart.meta.symbol,
      timeframe,
      from: chart.timestamp[0],
      to: now / 1000,
    };
    const load = (data: any) => loadFeed(request, async () => data, signal(), now);
    const result = await load(recorded);
    const count = name.includes('forex') ? 3 : 2;
    assert.equal(result.input.bars.length, count);
    assert.equal(result.input.bars[0].open, chart.indicators.quote[0].open[0]);
    for (const volume of [null, 0]) {
      const absent = structuredClone(recorded);
      const quote = absent.chart.result[0].indicators.quote[0];
      for (const field of ['open', 'high', 'low', 'close']) quote[field][1] = null;
      quote.volume[1] = volume;
      assert.equal((await load(absent)).input.bars.length, count - 1);
    }
    for (const [field, value] of [
      ['open', null],
      ['low', 'bad'],
      ['high', -1],
      ['volume', -1],
      ['volume', null],
    ] as const) {
      const malformed = structuredClone(recorded);
      malformed.chart.result[0].indicators.quote[0][field][0] = value;
      await assert.rejects(load(malformed), { code: 'feedInvalidResponse' });
    }
    const short = structuredClone(recorded);
    short.chart.result[0].indicators.quote[0].close.pop();
    await assert.rejects(load(short), { code: 'feedInvalidResponse' });
    const unordered = structuredClone(recorded);
    unordered.chart.result[0].timestamp[1] = chart.timestamp[0];
    await assert.rejects(load(unordered), { code: 'feedInvalidResponse' });
  });
}

test('recorded Yahoo daily forex drops the appended live quote and accepts null OHLC rows', async () => {
  const daily = await fixture('yahoo-forex-daily');
  const hourly = await fixture('yahoo-forex-hourly');
  const request = {
    feed: 'yahoo' as const,
    symbol: 'EURUSD=X',
    timeframe: '1D',
    from: daily.chart.result[0].timestamp[0],
    to: now / 1000,
  };
  const load = () =>
    loadFeed(
      request,
      async (url) => (url.searchParams.get('interval') === '1d' ? daily : hourly),
      signal(),
      now,
    );
  assert.equal((await load()).input.bars.length, 2);
  const quote = daily.chart.result[0].indicators.quote[0];
  for (const field of ['open', 'high', 'low', 'close']) quote[field][1] = null;
  assert.equal((await load()).input.bars.length, 1);
});

test('old daily history loads without an out-of-window hourly request and marks estimated sessions', async () => {
  const recorded = await fixture('yahoo-daily-old');
  const urls: URL[] = [];
  const request = {
    feed: 'yahoo' as const,
    symbol: 'AAPL',
    timeframe: '1D',
    from: 1443830400,
    to: 1444176000,
  };
  const result = await loadFeed(
    request,
    async (url) => {
      urls.push(url);
      assert.equal(url.searchParams.get('interval'), '1d');
      return recorded;
    },
    signal(),
    now,
  );
  assert.equal(urls.length, 1);
  assert.equal(result.calendarEstimated, true);
  assert.equal(result.input.bars.length, 2);
  assert.deepEqual(
    result.input.bars.map((bar) => bar.close),
    recorded.chart.result[0].indicators.quote[0].close,
  );
  const sessions = result.input.sessionCalendar!.sessions;
  assert.deepEqual(
    sessions.map((session) => session.tradingDay),
    ['2015-10-05', '2015-10-06'],
  );
  assert.ok(sessions.every((session) => session.close - session.open === 6.5 * 3600));

  const invalid = structuredClone(recorded);
  delete invalid.chart.result[0].meta.currentTradingPeriod;
  await assert.rejects(
    loadFeed(request, async () => invalid, signal(), now),
    { code: 'feedCalendarMissing' },
  );
});

test('daily All mixes marked old sessions with exact recent holidays and early closes', async () => {
  const old = (await fixture('yahoo-daily-old')).chart.result[0];
  const daily = await fixture('yahoo-daily');
  const hourly = await fixture('yahoo-hourly');
  const chart = daily.chart.result[0];
  chart.timestamp.unshift(...old.timestamp);
  for (const field of ['open', 'high', 'low', 'close', 'volume']) {
    chart.indicators.quote[0][field].unshift(...old.indicators.quote[0][field]);
  }
  const result = await loadFeed(
    {
      feed: 'yahoo',
      symbol: 'AAPL',
      timeframe: '1D',
      from: 0,
      to: Date.UTC(2025, 10, 30) / 1000,
    },
    async (url) => {
      if (url.searchParams.get('interval') === '1d') return daily;
      assert.equal(url.searchParams.get('interval'), '60m');
      assert.ok(Number(url.searchParams.get('period1')) > now / 1000 - 730 * 86400);
      return hourly;
    },
    signal(),
    now,
  );
  assert.equal(result.input.bars.length, 4);
  assert.equal(result.calendarEstimated, true);
  assert.deepEqual(
    result.input.sessionCalendar!.sessions.map((session) => session.tradingDay),
    ['2015-10-05', '2015-10-06', '2025-11-25', '2025-11-26', '2025-11-28'],
  );
  assert.equal(
    result.input.sessionCalendar!.sessions.at(-1)!.close -
      result.input.sessionCalendar!.sessions.at(-1)!.open,
    3.5 * 3600,
  );
});

test('old daily close estimates use historical timezone offsets, not the current UTC offset', async () => {
  const evidence = await fixture('yahoo-history-limits');
  const probe = evidence.probes.find((item: any) => item.interval === '1d');
  const result = await loadFeed(
    {
      feed: 'yahoo',
      symbol: 'AAPL',
      timeframe: '1D',
      from: probe.period1,
      to: probe.period2,
    },
    async () => probe.response,
    signal(),
    now,
  );
  assert.deepEqual(
    result.input.sessionCalendar!.sessions.map((session) =>
      new Date(session.close * 1000).toISOString(),
    ),
    ['1980-12-12T21:00:00.000Z', '1980-12-15T21:00:00.000Z', '2015-10-06T20:00:00.000Z'],
  );
});

test('recent daily bars are still excluded until their exact early session close', async () => {
  const daily = await fixture('yahoo-daily');
  const hourly = await fixture('yahoo-hourly');
  const request = {
    feed: 'yahoo' as const,
    symbol: 'AAPL',
    timeframe: '1D',
    from: Date.UTC(2025, 10, 26) / 1000,
    to: Date.UTC(2025, 10, 30) / 1000,
  };
  const get = async (url: URL) => (url.searchParams.get('interval') === '1d' ? daily : hourly);
  const close = Date.UTC(2025, 10, 28, 18);
  assert.equal((await loadFeed(request, get, signal(), close - 1)).input.bars.length, 1);
  const result = await loadFeed(request, get, signal(), close);
  assert.equal(result.input.bars.length, 2);
  assert.equal(result.calendarEstimated, undefined);
});
