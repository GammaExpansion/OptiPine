import type { Feed, FeedRequest } from '@pine/market-data';
import {
  checkRequest,
  customRange,
  presetRange,
  rangeDates,
  type RangePreset,
} from '../../workflows/market-data.ts';
import type { Message } from '@pine/messages';

export interface Selection {
  feed: Feed;
  symbol: string;
  timeframe: string;
  preset: RangePreset | 'Custom';
  fromDate: string;
  toDate: string;
}
export const selectionKey = 'optipine.marketSelection';
export function selectionFrom(request: FeedRequest): Selection {
  const dates = rangeDates(request);
  return {
    feed: request.feed,
    symbol: request.symbol,
    timeframe: request.timeframe,
    preset: 'Custom',
    fromDate: dates.from,
    toDate: dates.to,
  };
}
export function selectionRequest(
  selection: Selection,
  now: number,
): { request: FeedRequest | null; error: Message | null; limited: boolean } {
  const range =
    selection.preset === 'Custom'
      ? customRange(selection.fromDate, selection.toDate, selection.timeframe, now)
      : {
          range: presetRange(selection.preset, selection.feed, selection.timeframe, now),
          error: null,
        };
  if (!range.range) return { request: null, error: range.error, limited: false };
  const request = {
    feed: selection.feed,
    symbol: selection.symbol,
    timeframe: selection.timeframe,
    from: range.range.from,
    to: range.range.to,
  };
  return {
    request,
    error: checkRequest(request, now),
    limited: 'limited' in range.range && range.range.limited === true,
  };
}
/** Restored selections are untrusted; provider validation still runs before fetching. */
export function restoreSelection(raw: string | null, now: number): Selection {
  const initial = selectionFrom({
    feed: 'binance',
    symbol: 'BTCUSDT',
    timeframe: '60',
    ...presetRange('2Y', 'binance', '60', now),
  });
  initial.preset = '2Y';
  try {
    const saved: unknown = JSON.parse(raw ?? 'null');
    if (!saved || typeof saved !== 'object') return initial;
    const value = saved as Record<string, unknown>;
    if (
      !['binance', 'binance-futures', 'yahoo'].includes(String(value.feed)) ||
      !['1M', '1Y', '2Y', 'All', 'Custom'].includes(String(value.preset)) ||
      !['symbol', 'timeframe', 'fromDate', 'toDate'].every((key) => typeof value[key] === 'string')
    )
      return initial;
    const candidate = value as unknown as Selection;
    return selectionRequest(candidate, now).error ? initial : candidate;
  } catch {
    return initial;
  }
}
