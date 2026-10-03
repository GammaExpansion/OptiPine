import type { MarketBar, SessionCalendar } from '@pine/engine';
import { parseRunMetadata, parseSessionCalendar } from './csv.ts';
import {
  feedSeconds,
  feedTimeframes,
  MAX_FEED_BARS,
  validateFeedRequest,
  type Feed,
  type FeedDataset,
  type FeedRequest,
  type FeedSymbol,
} from './contracts.ts';
import { marketDataError } from './messages.ts';

// Upstream JSON is validated at the boundary; it never supplies a URL or executable code.
type Json = Record<string, any>;
export type FetchJson = (url: URL, signal: AbortSignal) => Promise<Json | any[]>;
function invalid(): never {
  throw marketDataError('feedInvalidResponse');
}
function url(base: string, query: Record<string, string | number> = {}): URL {
  const result = new URL(base);
  for (const [key, value] of Object.entries(query)) result.searchParams.set(key, String(value));
  return result;
}
function binanceBase(feed: Feed): string {
  return feed === 'binance-futures'
    ? 'https://fapi.binance.com/fapi/v1/'
    : 'https://data-api.binance.vision/api/v3/';
}
function record(value: unknown): Json {
  if (!value || typeof value !== 'object' || Array.isArray(value)) invalid();
  return value as Json;
}
function positive(value: unknown): number {
  if (
    (typeof value !== 'string' && typeof value !== 'number') ||
    value === '' ||
    !Number.isFinite(Number(value)) ||
    Number(value) <= 0
  )
    invalid();
  return Number(value);
}
function validBar(bar: MarketBar): MarketBar {
  if (
    !Number.isSafeInteger(bar.time) ||
    bar.time < 0 ||
    ![bar.open, bar.high, bar.low, bar.close, bar.volume].every(Number.isFinite) ||
    bar.low > Math.min(bar.open, bar.close, bar.high) ||
    bar.high < Math.max(bar.open, bar.close, bar.low) ||
    bar.volume < 0
  )
    invalid();
  return bar;
}
async function exchange(feed: Feed, get: FetchJson, signal: AbortSignal): Promise<Json[]> {
  const data = await get(url(binanceBase(feed) + 'exchangeInfo'), signal);
  if (!Array.isArray((data as Json).symbols)) invalid();
  return (data as Json).symbols.filter(
    (s: Json) =>
      s.status === 'TRADING' &&
      (feed === 'binance-futures'
        ? s.contractType === 'PERPETUAL'
        : s.isSpotTradingAllowed !== false),
  );
}
export async function searchFeed(
  feed: Feed,
  query: string,
  get: FetchJson,
  signal: AbortSignal,
): Promise<FeedSymbol[]> {
  if (!Object.hasOwn(feedTimeframes, feed) || !query.trim() || query.length > 80)
    throw marketDataError('feedInvalidRequest');
  if (feed !== 'yahoo') {
    const q = query.toUpperCase();
    return (await exchange(feed, get, signal))
      .filter((s) => String(s.symbol).includes(q) || String(s.baseAsset).includes(q))
      .sort(
        (a, b) =>
          Number(b.symbol === q) - Number(a.symbol === q) ||
          String(a.symbol).localeCompare(String(b.symbol)),
      )
      .slice(0, 12)
      .map((s) => ({
        symbol: s.symbol,
        name: `${s.baseAsset} / ${s.quoteAsset}`,
        exchange: 'Binance',
        type: feed === 'binance' ? 'crypto' : 'futures',
      }));
  }
  const data = (await get(
    url('https://query1.finance.yahoo.com/v1/finance/search', {
      q: query,
      quotesCount: 12,
      newsCount: 0,
    }),
    signal,
  )) as Json;
  if (!Array.isArray(data.quotes)) invalid();
  // Yahoo futures omit the contract multiplier: do not silently assume one.
  return data.quotes
    .filter(
      (s: Json) =>
        ['EQUITY', 'ETF', 'INDEX', 'CURRENCY'].includes(s.quoteType) &&
        typeof s.symbol === 'string',
    )
    .map((s: Json) => ({
      symbol: s.symbol,
      name: String(s.longname ?? s.shortname ?? s.symbol),
      exchange: String(s.exchDisp ?? s.exchange ?? ''),
      type: s.quoteType,
    }));
}
async function loadBinance(
  request: FeedRequest,
  get: FetchJson,
  signal: AbortSignal,
  now: number,
): Promise<FeedDataset> {
  const symbol = (await exchange(request.feed, get, signal)).find(
    (s) => s.symbol === request.symbol,
  );
  if (!symbol) throw marketDataError('feedSymbolMissing');
  if (!Array.isArray(symbol.filters)) invalid();
  const tick = positive(
    symbol.filters.find((f: Json) => f.filterType === 'PRICE_FILTER')?.tickSize,
  );
  const step = positive(symbol.filters.find((f: Json) => f.filterType === 'LOT_SIZE')?.stepSize);
  const bars: MarketBar[] = [];
  const end = Math.min(request.to * 1000, now);
  let cursor = request.from * 1000;
  while (cursor < end) {
    signal.throwIfAborted();
    const rows = await get(
      url(binanceBase(request.feed) + 'klines', {
        symbol: request.symbol,
        interval: feedTimeframes[request.feed][request.timeframe],
        startTime: cursor,
        endTime: end - 1,
        limit: 1000,
      }),
      signal,
    );
    if (!Array.isArray(rows)) invalid();
    if (!rows.length) break;
    let last = cursor - 1;
    for (const row of rows) {
      if (
        !Array.isArray(row) ||
        row.length < 7 ||
        !Number.isSafeInteger(row[0]) ||
        !Number.isSafeInteger(row[6]) ||
        row[0] < cursor ||
        row[0] <= last ||
        row[6] < row[0]
      )
        invalid();
      last = row[0];
      if (row[0] >= end) continue;
      // Only closed bars are admitted; never present a partial candle as final history.
      if (row[6] >= now) continue;
      if (
        row
          .slice(1, 6)
          .some((v) => v === null || v === '' || !['number', 'string'].includes(typeof v))
      )
        invalid();
      bars.push(
        validBar({
          time: row[0] / 1000,
          open: Number(row[1]),
          high: Number(row[2]),
          low: Number(row[3]),
          close: Number(row[4]),
          volume: Number(row[5]),
        }),
      );
    }
    if (bars.length > MAX_FEED_BARS)
      throw marketDataError('feedTooManyBars', { count: MAX_FEED_BARS });
    cursor = last + 1;
    if (rows.length < 1000) break;
  }
  const ticker = request.symbol + (request.feed === 'binance-futures' ? '.P' : '');
  return {
    input: {
      bars,
      timeframe: request.timeframe,
      realtimeTail: false,
      strategyClosePending: false,
      syminfo: {
        ticker,
        tickerid: `BINANCE:${ticker}`,
        prefix: 'BINANCE',
        type: 'crypto',
        timezone: 'Etc/UTC',
        currency: symbol.quoteAsset,
        basecurrency: symbol.baseAsset,
        mintick: tick,
        minmove: 1,
        pricescale: 1 / tick,
        mincontract: step,
        pointvalue: 1,
        session: 'regular',
        session_hours: '0000-0000:1234567',
      },
    },
    fetchedAt: now,
    profileEstimated: false,
  };
}
function day(time: number, timezone: string): string {
  const parts = new Intl.DateTimeFormat('en-CA', {
    timeZone: timezone,
    year: 'numeric',
    month: '2-digit',
    day: '2-digit',
  }).formatToParts(new Date(time * 1000));
  const get = (type: string) => parts.find((p) => p.type === type)!.value;
  return `${get('year')}-${get('month')}-${get('day')}`;
}
async function yahooChart(
  request: FeedRequest,
  interval: string,
  get: FetchJson,
  signal: AbortSignal,
): Promise<Json> {
  const data = (await get(
    url(`https://query1.finance.yahoo.com/v8/finance/chart/${encodeURIComponent(request.symbol)}`, {
      interval,
      period1: request.from,
      period2: request.to,
      includePrePost: 'false',
      includeTradingPeriods: 'true',
      events: 'history',
    }),
    signal,
  )) as Json;
  if (data.chart?.error)
    throw marketDataError('feedUpstreamDetail', {
      detail: String(data.chart.error.description ?? 'Yahoo Finance'),
    });
  return record(data.chart?.result?.[0]);
}
export async function loadYahoo(
  request: FeedRequest,
  get: FetchJson,
  signal: AbortSignal,
  now: number,
): Promise<FeedDataset> {
  const data = await yahooChart(request, feedTimeframes.yahoo[request.timeframe], get, signal);
  const meta = record(data.meta);
  if (!['EQUITY', 'ETF', 'INDEX', 'CURRENCY'].includes(meta.instrumentType))
    throw marketDataError('feedYahooInstrument');
  const calendarMeta =
    request.timeframe === '1D'
      ? record((await yahooChart(request, '60m', get, signal)).meta)
      : meta;
  const timezone = meta.exchangeTimezoneName;
  if (typeof timezone !== 'string' || String(meta.symbol).toUpperCase() !== request.symbol)
    invalid();
  const periods = Array.isArray(calendarMeta.tradingPeriods)
    ? calendarMeta.tradingPeriods
    : calendarMeta.tradingPeriods?.regular;
  if (!Array.isArray(periods)) throw marketDataError('feedCalendarMissing');
  const sessions: SessionCalendar['sessions'] = periods
    .flat(Infinity)
    .map((p: Json) => ({
      open: p.start,
      close: p.end,
      tradingDay: day(meta.instrumentType === 'CURRENCY' ? p.end - 1 : p.start, timezone),
    }))
    .filter((s) => s.open < request.to && s.close > request.from)
    .sort((a, b) => a.open - b.open);
  const calendar = parseSessionCalendar({ from: request.from, to: request.to, sessions });
  if (!Array.isArray(data.timestamp)) invalid();
  const quote = record(data.indicators?.quote?.[0]);
  if (
    !['open', 'high', 'low', 'close', 'volume'].every(
      (k) => Array.isArray(quote[k]) && quote[k].length === data.timestamp.length,
    )
  )
    invalid();
  const bars: MarketBar[] = [];
  let previous = -Infinity;
  for (let i = 0; i < data.timestamp.length; i++) {
    const time = data.timestamp[i];
    if (!Number.isSafeInteger(time) || time <= previous) invalid();
    previous = time;
    if (time < request.from || time >= request.to) continue;
    const values = ['open', 'high', 'low', 'close', 'volume'].map((k) => quote[k][i]);
    // Yahoo explicitly marks absent observations with null; do not synthesize zero prices.
    if (values.every((v) => v == null)) continue;
    if (values.some((v) => typeof v !== 'number' || !Number.isFinite(v))) invalid();
    const session = sessions.find((s) => time >= s.open && time < s.close);
    // Yahoo appends a quote at the exact close, outside the regular half-open session.
    // It is not an extra zero-duration candle (including on early-close days).
    if (!session && request.timeframe !== '1D' && sessions.some((s) => time === s.close)) continue;
    if (!session) throw marketDataError('feedCalendarMissing');
    const close =
      request.timeframe === '1D'
        ? session.close
        : Math.min(time + feedSeconds(request.timeframe), session.close);
    if (close * 1000 > now) continue;
    bars.push(
      validBar({
        time,
        open: values[0],
        high: values[1],
        low: values[2],
        close: values[3],
        volume: values[4],
      }),
    );
  }
  if (bars.length > MAX_FEED_BARS)
    throw marketDataError('feedTooManyBars', { count: MAX_FEED_BARS });
  const hint = meta.priceHint;
  if (!Number.isInteger(hint) || hint < 0 || hint > 10) invalid();
  const type =
    meta.instrumentType === 'CURRENCY'
      ? 'forex'
      : meta.instrumentType === 'INDEX'
        ? 'index'
        : 'stock';
  const profile = parseRunMetadata({
    timeframe: request.timeframe,
    syminfo: {
      ticker: request.symbol,
      tickerid: `YAHOO:${request.symbol}`,
      prefix: 'YAHOO',
      type,
      timezone,
      currency: meta.currency,
      mintick: 10 ** -hint,
      pricescale: 10 ** hint,
      minmove: 1,
      pointvalue: 1,
      mincontract: 1,
      session: 'regular',
    },
  });
  return {
    input: {
      ...profile,
      bars,
      sessionCalendar: calendar,
      realtimeTail: false,
      strategyClosePending: false,
    },
    fetchedAt: now,
    profileEstimated: true,
  };
}
export async function loadFeed(
  value: FeedRequest,
  get: FetchJson,
  signal: AbortSignal,
  now = Date.now(),
): Promise<FeedDataset> {
  const request = validateFeedRequest(value, now);
  const result =
    request.feed === 'yahoo'
      ? await loadYahoo(request, get, signal, now)
      : await loadBinance(request, get, signal, now);
  if (!result.input.bars.length) throw marketDataError('feedNoBars');
  return result;
}
