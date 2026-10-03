import type { RunInput } from '@pine/engine';
import {
  FeedImportSession,
  MAX_FEED_BARS,
  feedSeconds,
  parseRunMetadata,
  validateFeedRequest,
  type Feed,
  type FeedClient,
  type FeedDataset,
  type FeedRequest,
} from '@pine/market-data';
import { errorText, isMessage, type Message, type Text } from '@pine/messages';
import { workflowMessage } from './messages.ts';
import { createStore, type Observable, type Store } from './store.ts';

export type RangePreset = '1M' | '1Y' | '2Y' | 'All';

/** A fetch range in Unix seconds, `[from, to)`. */
export interface FetchRange {
  readonly from: number;
  readonly to: number;
}

export interface PresetRange extends FetchRange {
  /** A provider limit shortened the preset (100,000 bars, or Yahoo's history). */
  readonly limited: boolean;
}

const DAY = 86_400;

/** Where each provider's history begins; "All" asks for nothing earlier. */
const historyStart: Record<Feed, number> = {
  // Binance spot opened in July 2017, USDⓈ-M perpetuals in September 2019.
  binance: Date.UTC(2017, 6, 1) / 1000,
  'binance-futures': Date.UTC(2019, 8, 1) / 1000,
  yahoo: 0,
};

/** Yahoo's history in days per timeframe, as @pine/market-data's `validateFeedRequest` enforces. */
const yahooHistoryDays = (timeframe: string): number =>
  timeframe === '60' || timeframe === '1D' ? 729 : 59;

/**
 * The end of a range requested at `now` (milliseconds): the current time rounded down to the
 * timeframe, at most to the hour, so requests repeated within the hour share a feed cache key.
 * Providers return only closed bars, so the bar still open at `now` is never included.
 */
export function rangeEnd(timeframe: string, now: number): number {
  const step = Math.min(feedSeconds(timeframe), 3600);
  return Math.floor(now / 1000 / step) * step;
}

/** The earliest start a provider accepts for a range ending at `to`. */
function earliestStart(feed: Feed, timeframe: string, to: number, now: number): number {
  if (feed === 'yahoo') {
    // One day inside Yahoo's limit, so the request still validates a moment later.
    const start = now / 1000 - (yahooHistoryDays(timeframe) - 1) * DAY;
    return Math.ceil(start / 3600) * 3600;
  }
  return Math.max(historyStart[feed], to - MAX_FEED_BARS * feedSeconds(timeframe));
}

/** Calendar months and years back from `to`, in UTC; a missing day clamps to the month's end. */
function monthsBefore(to: number, months: number): number {
  const end = new Date(to * 1000);
  const year = end.getUTCFullYear();
  const month = end.getUTCMonth() - months;
  const lastDay = new Date(Date.UTC(year, month + 1, 0)).getUTCDate();
  return (
    Date.UTC(
      year,
      month,
      Math.min(end.getUTCDate(), lastDay),
      end.getUTCHours(),
      end.getUTCMinutes(),
      end.getUTCSeconds(),
    ) / 1000
  );
}

/** The range a preset button selects for this provider and timeframe at `now` (milliseconds). */
export function presetRange(
  preset: RangePreset,
  feed: Feed,
  timeframe: string,
  now: number,
): PresetRange {
  const to = rangeEnd(timeframe, now);
  const earliest = earliestStart(feed, timeframe, to, now);
  if (preset === 'All') return { from: earliest, to, limited: false };
  const wanted = monthsBefore(to, preset === '1M' ? 1 : preset === '1Y' ? 12 : 24);
  return { from: Math.max(wanted, earliest), to, limited: earliest > wanted };
}

export type CustomRange =
  | { readonly range: FetchRange; readonly error: null }
  | { readonly range: null; readonly error: Message };

const datePattern = /^(\d{4})-(\d{2})-(\d{2})$/;
function dayStart(date: string): number | null {
  const match = datePattern.exec(date);
  if (!match) return null;
  const time = Date.UTC(Number(match[1]), Number(match[2]) - 1, Number(match[3]));
  return new Date(time).toISOString().slice(0, 10) === date ? time / 1000 : null;
}

/**
 * A Custom range from two UTC dates, `YYYY-MM-DD`, both included. The end stops at the latest
 * closed bar. Provider limits are checked with the full request by `checkRequest`.
 */
export function customRange(
  fromDate: string,
  toDate: string,
  timeframe: string,
  now: number,
): CustomRange {
  const from = dayStart(fromDate);
  const last = dayStart(toDate);
  if (from === null || last === null)
    return { range: null, error: workflowMessage('marketData.dateInvalid') };
  const to = Math.min(last + DAY, rangeEnd(timeframe, now));
  return to > from
    ? { range: { from, to }, error: null }
    : { range: null, error: workflowMessage('marketData.rangeEmpty') };
}

/** The first and last UTC dates a range covers, as the Custom fields show them. */
export function rangeDates(range: FetchRange): { from: string; to: string } {
  const date = (time: number) => new Date(time * 1000).toISOString().slice(0, 10);
  return { from: date(range.from), to: date(range.to - 1) };
}

/** The message of a coded package error; anything else is a fault and propagates. */
function messageOf(error: unknown): Message {
  const text = errorText(error);
  if (isMessage(text) && text.kind === 'message') return text;
  throw error;
}

/**
 * Why the provider would refuse this request (an empty range, too many bars, beyond Yahoo's
 * history), or null.
 */
export function checkRequest(request: FeedRequest, now: number): Message | null {
  if (request.from >= request.to) return workflowMessage('marketData.rangeEmpty');
  try {
    validateFeedRequest(request, now);
    return null;
  } catch (error) {
    return messageOf(error);
  }
}

/** The examples' data (WEB.md 4.7): Binance spot BTCUSDT 1h, the two years ending this hour. */
export function exampleRequest(now: number): FeedRequest {
  const { from, to } = presetRange('2Y', 'binance', '60', now);
  return { feed: 'binance', symbol: 'BTCUSDT', timeframe: '60', from, to };
}

/**
 * The bars a range is expected to hold: its timeframe slots, a partial one included, times the
 * share of slots that trade. S4's "about 20,500 bars" (20,496) and S10's estimate come from this.
 */
export function expectedBarCount(range: FetchRange, timeframe: string, density = 1): number {
  return Math.max(
    0,
    Math.round(Math.ceil((range.to - range.from) / feedSeconds(timeframe)) * density),
  );
}

/**
 * The share of timeframe slots that hold bars before anything is fetched. Binance trades around
 * the clock. For Yahoo this is an estimate: a forex week of 5 × 24 hours, otherwise a year of
 * 252 sessions of 6.5 hours (the US exchanges' regular session).
 */
export function feedDensity(feed: Feed, timeframe: string, symbolType?: string): number {
  if (feed !== 'yahoo') return 1;
  if (symbolType === 'CURRENCY') return 5 / 7;
  return timeframe === '1D' ? 252 / 365 : (252 * 6.5) / (365 * 24);
}

/** The share of slots the current dataset fills, for S10's estimate of a new range. */
export function datasetDensity(input: Pick<RunInput, 'bars' | 'timeframe'>): number {
  const { bars } = input;
  if (bars.length < 2) return 1;
  const slots = (bars.at(-1)!.time - bars[0].time) / feedSeconds(input.timeframe) + 1;
  return Math.min(1, bars.length / slots);
}

const LINEAR_SHARE = 0.8;
const SIMULATED_CEILING = 0.95;

/**
 * How long fetching `expectedBars` usually takes: the proxy spaces upstream calls 250 ms apart
 * and Binance returns 1,000 klines per call. It paces the simulated indicator only.
 */
export function expectedFetchMs(expectedBars: number): number {
  return 1000 + Math.ceil(Math.max(0, expectedBars) / 1000) * 300;
}

/**
 * The simulated fetch indicator (WEB.md 2.2), 0 to 1 by elapsed time: it advances evenly to 80%
 * at the expected duration, then slows toward 95% and never passes it. Only the data's arrival
 * completes it.
 */
export function simulatedProgress(elapsedMs: number, expectedBars: number): number {
  if (!(elapsedMs > 0)) return 0;
  const expected = expectedFetchMs(expectedBars);
  if (elapsedMs <= expected) return (LINEAR_SHARE * elapsedMs) / expected;
  return (
    LINEAR_SHARE +
    (SIMULATED_CEILING - LINEAR_SHARE) * (1 - Math.exp(-(elapsedMs - expected) / expected))
  );
}

/** The editable symbol info of a preview (S5). */
export interface SymbolInfoValues {
  readonly mintick: number;
  readonly pointvalue: number;
  readonly mincontract: number;
  readonly timezone: string;
}
export type SymbolInfoKey = keyof SymbolInfoValues;

export interface DataPreview {
  readonly dataset: FeedDataset;
  readonly cached: boolean;
  readonly barCount: number;
  /** Open times of the first and last bars, Unix seconds. */
  readonly firstBarTime: number;
  readonly lastBarTime: number;
  /** `continuous` is 24 × 7; `calendar` follows the exchange's sessions. */
  readonly session:
    { readonly kind: 'continuous' } | { readonly kind: 'calendar'; readonly tradingDays: number };
  /** Yahoo publishes prices as traded, not adjusted for splits or dividends (S6). */
  readonly unadjusted: boolean;
  /** No published trading rules: the tick size is estimated, the rest defaults to 1. */
  readonly profileEstimated: boolean;
  readonly providedSymbolInfo: SymbolInfoValues;
  /** As edited; a field with an entry in `symbolInfoErrors` blocks "Use this data". */
  readonly symbolInfo: SymbolInfoValues;
  readonly symbolInfoErrors: Readonly<Partial<Record<SymbolInfoKey, Message>>>;
}

export type FetchState =
  | { readonly status: 'idle' }
  | {
      readonly status: 'fetching';
      readonly request: FeedRequest;
      readonly expectedBars: number;
      readonly startedAt: number;
    }
  | { readonly status: 'preview'; readonly request: FeedRequest; readonly preview: DataPreview }
  | {
      /** The provider refused (S9); `request.feed` names it. */
      readonly status: 'refused';
      readonly request: FeedRequest;
      readonly error: Text;
      /** The error's message id, such as `feedRegionBlocked`. */
      readonly code: string | null;
      /** The other provider to offer, when one could serve the same market. */
      readonly alternative: Feed | null;
      readonly canRetry: boolean;
    }
  | { readonly status: 'unavailable'; readonly request: FeedRequest };

export interface MarketDataState {
  readonly fetch: FetchState;
  /** `unavailable` once the data service is found missing (4.7): provider tabs say so. */
  readonly service: 'unknown' | 'available' | 'unavailable';
}

/** The indicator's position for a state at `now` (milliseconds). */
export function fetchProgress(state: FetchState, now: number): number {
  if (state.status === 'fetching')
    return simulatedProgress(now - state.startedAt, state.expectedBars);
  return state.status === 'preview' ? 1 : 0;
}

/** Errors in the request itself: another provider or a retry would not help. */
const requestErrors = new Set(['feedInvalidRequest', 'feedTooManyBars', 'feedYahooRange']);
/** Errors a retry of the same request would only repeat. */
const permanentErrors = new Set([...requestErrors, 'feedSymbolMissing', 'feedYahooInstrument']);

function symbolInfoOf(dataset: FeedDataset): SymbolInfoValues {
  const { syminfo } = dataset.input;
  return {
    mintick: typeof syminfo.mintick === 'number' ? syminfo.mintick : 0.01,
    pointvalue: typeof syminfo.pointvalue === 'number' ? syminfo.pointvalue : 1,
    mincontract: typeof syminfo.mincontract === 'number' ? syminfo.mincontract : 1,
    timezone: typeof syminfo.timezone === 'string' ? syminfo.timezone : 'Etc/UTC',
  };
}

function previewOf(request: FeedRequest, dataset: FeedDataset, cached: boolean): DataPreview {
  const { bars, sessionCalendar } = dataset.input;
  const info = symbolInfoOf(dataset);
  return {
    dataset,
    cached,
    barCount: bars.length,
    firstBarTime: bars[0].time,
    lastBarTime: bars.at(-1)!.time,
    session: sessionCalendar
      ? {
          kind: 'calendar',
          tradingDays: new Set(sessionCalendar.sessions.map((session) => session.tradingDay)).size,
        }
      : { kind: 'continuous' },
    unadjusted: request.feed === 'yahoo',
    profileEstimated: dataset.profileEstimated,
    providedSymbolInfo: info,
    symbolInfo: info,
    symbolInfoErrors: {},
  };
}

/** The data "Use this data" hands to the Backtest session. */
export interface AcceptedData {
  readonly input: FeedDataset['input'];
  readonly request: FeedRequest;
  readonly fetchedAt: number;
}

export interface MarketDataControllerOptions {
  now?: () => number;
}

/**
 * The provider tabs' fetch flow (S3–S5, S9, S10) over `FeedImportSession`, which aborts the
 * previous request and discards late replies. A fetched dataset replaces the current one only
 * through `accept`.
 */
export class MarketDataController implements Observable<MarketDataState> {
  readonly #client: FeedClient;
  readonly #session = new FeedImportSession();
  readonly #now: () => number;
  readonly #store: Store<MarketDataState>;
  #last: { request: FeedRequest; density: number } | null = null;

  constructor(client: FeedClient, options: MarketDataControllerOptions = {}) {
    this.#client = client;
    this.#now = options.now ?? Date.now;
    this.#store = createStore<MarketDataState>({ fetch: { status: 'idle' }, service: 'unknown' });
  }

  getState(): MarketDataState {
    return this.#store.getState();
  }

  subscribe(listener: (state: MarketDataState) => void): () => void {
    return this.#store.subscribe(listener);
  }

  #update(change: Partial<MarketDataState>): void {
    this.#store.setState({ ...this.getState(), ...change });
  }

  /** Fetch `request`; `density` estimates the expected count (`feedDensity`, `datasetDensity`). */
  async fetch(request: FeedRequest, density = 1): Promise<void> {
    this.#last = { request, density };
    this.#update({
      fetch: {
        status: 'fetching',
        request,
        expectedBars: expectedBarCount(request, request.timeframe, density),
        startedAt: this.#now(),
      },
    });
    let current: boolean;
    try {
      current = await this.#session.load(request, this.#client);
    } catch (error) {
      // The session rethrows only for the request still current.
      this.#refuse(request, error);
      return;
    }
    const result = this.#session.result;
    if (!current || !result) return;
    this.#update({
      service: 'available',
      fetch: {
        status: 'preview',
        request,
        preview: previewOf(request, result.dataset, result.cached),
      },
    });
  }

  #refuse(request: FeedRequest, error: unknown): void {
    const text = errorText(error);
    const code = isMessage(text) && text.kind === 'message' ? text.id : null;
    if (code === 'feedProxyMissing') {
      this.#update({ service: 'unavailable', fetch: { status: 'unavailable', request } });
      return;
    }
    this.#update({
      fetch: {
        status: 'refused',
        request,
        error: text,
        code,
        alternative: request.feed !== 'yahoo' && !requestErrors.has(code ?? '') ? 'yahoo' : null,
        canRetry: !permanentErrors.has(code ?? ''),
      },
    });
  }

  /** Repeat the last fetch (S9's Retry). */
  async retry(): Promise<void> {
    if (this.#last) await this.fetch(this.#last.request, this.#last.density);
  }

  /** Stop a fetch or drop its preview, as Cancel fetch and closing the dialog do. */
  cancel(): void {
    this.#session.invalidate();
    this.#update({ fetch: { status: 'idle' } });
  }

  /** Edit the preview's symbol info; the value is checked as a run profile would be. */
  editSymbolInfo<K extends SymbolInfoKey>(key: K, value: SymbolInfoValues[K]): void {
    const state = this.getState().fetch;
    if (state.status !== 'preview') return;
    const { preview } = state;
    const errors = { ...preview.symbolInfoErrors };
    try {
      parseRunMetadata({ timeframe: state.request.timeframe, syminfo: { [key]: value } });
      delete errors[key];
    } catch (error) {
      errors[key] = messageOf(error);
    }
    this.#update({
      fetch: {
        ...state,
        preview: {
          ...preview,
          symbolInfo: { ...preview.symbolInfo, [key]: value },
          symbolInfoErrors: errors,
        },
      },
    });
  }

  /** "Use this data": the previewed dataset with the edited symbol info, or null if not ready. */
  accept(): AcceptedData | null {
    const state = this.getState().fetch;
    if (state.status !== 'preview' || Object.keys(state.preview.symbolInfoErrors).length)
      return null;
    const { dataset, symbolInfo, providedSymbolInfo } = state.preview;
    const syminfo: FeedDataset['input']['syminfo'] = { ...dataset.input.syminfo, ...symbolInfo };
    if (symbolInfo.mintick !== providedSymbolInfo.mintick)
      syminfo.pricescale = 1 / symbolInfo.mintick;
    this.#session.invalidate();
    this.#update({ fetch: { status: 'idle' } });
    return {
      input: { ...dataset.input, syminfo },
      request: state.request,
      fetchedAt: dataset.fetchedAt,
    };
  }
}
