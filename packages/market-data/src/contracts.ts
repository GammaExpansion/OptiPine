import type { RunInput } from '@pine/engine';
import { marketDataError } from './messages.ts';

export type Feed = 'binance' | 'binance-futures' | 'yahoo';
export interface FeedSymbol {
  symbol: string;
  name: string;
  exchange: string;
  type: string;
}
export interface FeedRequest {
  feed: Feed;
  symbol: string;
  timeframe: string;
  from: number;
  to: number;
}
export interface FeedDataset {
  input: Pick<
    RunInput,
    'bars' | 'syminfo' | 'timeframe' | 'sessionCalendar' | 'realtimeTail' | 'strategyClosePending'
  >;
  fetchedAt: number;
  profileEstimated: boolean;
  /** Older Yahoo daily sessions use current regular-session hours, not historical close times. */
  calendarEstimated?: boolean;
}
export const feedTimeframes: Record<Feed, Record<string, string>> = {
  binance: {
    '1': '1m',
    '5': '5m',
    '15': '15m',
    '30': '30m',
    '60': '1h',
    '240': '4h',
    '1D': '1d',
    '1W': '1w',
  },
  'binance-futures': {
    '1': '1m',
    '5': '5m',
    '15': '15m',
    '30': '30m',
    '60': '1h',
    '240': '4h',
    '1D': '1d',
    '1W': '1w',
  },
  yahoo: { '5': '5m', '15': '15m', '30': '30m', '60': '60m', '1D': '1d' },
};
export const MAX_FEED_BARS = 100_000;
/** Yahoo's rolling lookback for supported intervals; daily prices have no history cutoff. */
export const yahooHistoryDays: Readonly<Record<string, number | null>> = {
  '5': 60,
  '15': 60,
  '30': 60,
  '60': 730,
  '1D': null,
};
export function feedSeconds(timeframe: string): number {
  return timeframe === '1D' ? 86400 : timeframe === '1W' ? 604800 : Number(timeframe) * 60;
}
export function validateFeedRequest(value: FeedRequest, now = Date.now()): FeedRequest {
  if (
    !Object.hasOwn(feedTimeframes, value.feed) ||
    !Object.hasOwn(feedTimeframes[value.feed], value.timeframe) ||
    !/^[A-Za-z0-9^=._-]{1,40}$/.test(value.symbol) ||
    !Number.isSafeInteger(value.from) ||
    !Number.isSafeInteger(value.to) ||
    value.from < 0 ||
    value.from >= value.to ||
    value.from > now / 1000
  )
    throw marketDataError('feedInvalidRequest');
  if (
    value.feed !== 'yahoo' &&
    Math.ceil((Math.min(value.to, now / 1000) - value.from) / feedSeconds(value.timeframe)) >
      MAX_FEED_BARS
  )
    throw marketDataError('feedTooManyBars', { count: MAX_FEED_BARS });
  if (value.feed === 'yahoo') {
    const days = yahooHistoryDays[value.timeframe];
    if (days != null && value.from < now / 1000 - days * 86400)
      throw marketDataError('feedYahooRange', { days });
  }
  return { ...value, symbol: value.symbol.toUpperCase() };
}
export function feedKey(request: FeedRequest): string {
  return [
    request.feed,
    request.symbol.toUpperCase(),
    request.timeframe,
    request.from,
    request.to,
  ].join(':');
}
