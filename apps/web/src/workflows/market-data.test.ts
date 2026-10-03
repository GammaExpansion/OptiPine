import assert from 'node:assert/strict';
import test from 'node:test';
import {
  FeedClient,
  marketDataError,
  marketDataMessage,
  type FeedDataset,
  type FeedRequest,
} from '@pine/market-data';
import { serializeError } from '@pine/messages';
import {
  MarketDataController,
  checkRequest,
  customRange,
  datasetDensity,
  exampleRequest,
  expectedBarCount,
  expectedFetchMs,
  feedDensity,
  fetchProgress,
  presetRange,
  rangeDates,
  rangeEnd,
  simulatedProgress,
} from './market-data.ts';
import { workflowMessage } from './messages.ts';
import { settle } from './test-support.ts';

const now = Date.UTC(2026, 9, 3, 14, 37, 12);
const seconds = (...parts: [number, number, number, number?]) =>
  Date.UTC(parts[0], parts[1] - 1, parts[2], parts[3] ?? 0) / 1000;

test('ranges end at the latest closed bar, rounded down to the hour at most', () => {
  assert.equal(rangeEnd('60', now), seconds(2026, 10, 3, 14));
  assert.equal(rangeEnd('1D', now), seconds(2026, 10, 3, 14));
  assert.equal(rangeEnd('15', now), seconds(2026, 10, 3, 14) + 30 * 60);
  assert.equal(rangeEnd('1', now), seconds(2026, 10, 3, 14) + 37 * 60);
});

test('presets select calendar spans and respect each provider limit (S3)', () => {
  const to = seconds(2026, 10, 3, 14);
  assert.deepEqual(presetRange('1M', 'binance', '60', now), {
    from: seconds(2026, 9, 3, 14),
    to,
    limited: false,
  });
  assert.equal(presetRange('1Y', 'binance', '60', now).from, seconds(2025, 10, 3, 14));
  assert.equal(presetRange('2Y', 'binance', '60', now).from, seconds(2024, 10, 3, 14));
  assert.deepEqual(presetRange('All', 'binance', '60', now), {
    from: seconds(2017, 7, 1),
    to,
    limited: false,
  });
  assert.equal(presetRange('All', 'binance-futures', '1D', now).from, seconds(2019, 9, 1));
  // A month back from March 31 is the end of February.
  assert.equal(
    presetRange('1M', 'binance', '60', Date.UTC(2026, 2, 31, 10)).from,
    seconds(2026, 2, 28, 10),
  );

  const minutes = presetRange('1Y', 'binance', '1', now);
  assert.equal(minutes.limited, true);
  assert.equal(expectedBarCount(minutes, '1'), 100_000);
  const request = (
    feed: FeedRequest['feed'],
    timeframe: string,
    range: { from: number; to: number },
  ) => ({ feed, symbol: 'BTCUSDT', timeframe, ...range }) satisfies FeedRequest;
  assert.equal(checkRequest(request('binance', '1', minutes), now), null);
  assert.equal(
    checkRequest(request('binance', '1', presetRange('All', 'binance', '1', now)), now),
    null,
  );

  const yahooHourly = presetRange('2Y', 'yahoo', '60', now);
  assert.equal(yahooHourly.limited, true);
  const yahooMinutes = presetRange('1Y', 'yahoo', '15', now);
  assert.equal(yahooMinutes.limited, true);
  assert.ok(yahooMinutes.to - yahooMinutes.from < 59 * 86_400);
  // Still inside Yahoo's history when validated an hour later.
  for (const [timeframe, range] of [
    ['60', yahooHourly],
    ['15', yahooMinutes],
    ['1D', presetRange('All', 'yahoo', '1D', now)],
  ] as const)
    assert.equal(checkRequest(request('yahoo', timeframe, range), now + 3_600_000), null);
  assert.equal(presetRange('1M', 'yahoo', '15', now).limited, false);
});

test('the example request is BTCUSDT 1h for the two years ending this hour (4.7)', () => {
  const request = exampleRequest(now);
  assert.deepEqual(request, {
    feed: 'binance',
    symbol: 'BTCUSDT',
    timeframe: '60',
    from: seconds(2024, 10, 3, 14),
    to: seconds(2026, 10, 3, 14),
  });
  assert.equal(expectedBarCount(request, '60'), 17_520);
  assert.deepEqual(exampleRequest(now + 20 * 60_000), request);
});

test('custom ranges take whole UTC days and estimate the bar count (S4, S10)', () => {
  const s4 = customRange('2023-01-02', '2025-05-04', '60', now);
  assert.deepEqual(s4, {
    range: { from: seconds(2023, 1, 2), to: seconds(2025, 5, 5) },
    error: null,
  });
  assert.equal(expectedBarCount(s4.range!, '60'), 20_496);
  const s10 = customRange('2024-01-01', '2025-05-04', '60', now);
  assert.equal(expectedBarCount(s10.range!, '60'), 11_760);
  assert.deepEqual(rangeDates(s10.range!), { from: '2024-01-01', to: '2025-05-04' });
  assert.deepEqual(customRange('2026-10-01', '2026-10-09', '60', now).range, {
    from: seconds(2026, 10, 1),
    to: seconds(2026, 10, 3, 14),
  });
  assert.deepEqual(
    customRange('2023-02-30', '2024-01-01', '60', now).error,
    workflowMessage('marketData.dateInvalid'),
  );
  assert.deepEqual(
    customRange('2024-01-02', '2024-01-01', '60', now).error,
    workflowMessage('marketData.rangeEmpty'),
  );
});

test('requests outside the provider limits are explained before fetching', () => {
  const base = { feed: 'binance', symbol: 'BTCUSDT', timeframe: '1' } as const;
  assert.deepEqual(
    checkRequest({ ...base, from: seconds(2024, 1, 1), to: seconds(2025, 1, 1) }, now),
    marketDataMessage('feedTooManyBars', { count: 100_000 }),
  );
  assert.deepEqual(
    checkRequest(
      {
        ...base,
        feed: 'yahoo',
        timeframe: '15',
        from: seconds(2026, 1, 1),
        to: seconds(2026, 10, 1),
      },
      now,
    ),
    marketDataMessage('feedYahooRange', { days: 59 }),
  );
  assert.deepEqual(
    checkRequest({ ...base, from: seconds(2026, 1, 1), to: seconds(2026, 1, 1) }, now),
    workflowMessage('marketData.rangeEmpty'),
  );
});

test('bar estimates account for trading hours', () => {
  assert.equal(feedDensity('binance', '60'), 1);
  assert.equal(feedDensity('yahoo', '60', 'CURRENCY'), 5 / 7);
  const year = { from: seconds(2025, 1, 1), to: seconds(2026, 1, 1) };
  assert.equal(expectedBarCount(year, '1D', feedDensity('yahoo', '1D', 'EQUITY')), 252);
  assert.equal(expectedBarCount(year, '60', feedDensity('yahoo', '60', 'EQUITY')), 1638);
  const bars = [0, 1, 2, 5, 6, 7, 8, 9].map((hour) => ({
    time: seconds(2025, 1, 1, hour),
    open: 1,
    high: 1,
    low: 1,
    close: 1,
    volume: 0,
  }));
  assert.equal(datasetDensity({ bars, timeframe: '60' }), 0.8);
});

test('the simulated indicator advances, slows before the end and never completes (2.2)', () => {
  const bars = 20_500;
  const expected = expectedFetchMs(bars);
  assert.equal(expected, 1000 + 21 * 300);
  assert.equal(simulatedProgress(0, bars), 0);
  assert.equal(simulatedProgress(expected / 2, bars), 0.4);
  assert.equal(simulatedProgress(expected, bars), 0.8);
  const before = simulatedProgress(expected, bars) - simulatedProgress(expected - 100, bars);
  const after = simulatedProgress(expected + 100, bars) - simulatedProgress(expected, bars);
  assert.ok(after > 0 && after < before / 4);
  let previous = 0;
  for (let elapsed = 0; elapsed <= 30 * expected; elapsed += expected / 10) {
    const value = simulatedProgress(elapsed, bars);
    assert.ok(value >= previous && value <= 0.95);
    previous = value;
  }
  assert.ok(simulatedProgress(1e12, bars) < 1);
  const fetching = {
    status: 'fetching',
    request: exampleRequest(now),
    expectedBars: bars,
    startedAt: 0,
  } as const;
  assert.equal(fetchProgress(fetching, expected), 0.8);
  assert.equal(fetchProgress({ status: 'idle' }, expected), 0);
});

function dataset(request: FeedRequest, options: { calendar?: boolean } = {}): FeedDataset {
  const bars = [];
  for (let time = request.from; time < request.to; time += 3600)
    bars.push({ time, open: 100, high: 101, low: 99, close: 100.5, volume: 10 });
  return {
    input: {
      bars,
      timeframe: request.timeframe,
      syminfo: {
        ticker: request.symbol,
        mintick: 0.01,
        pointvalue: 1,
        mincontract: 0.00001,
        timezone: 'Etc/UTC',
      },
      realtimeTail: false,
      strategyClosePending: false,
      ...(options.calendar
        ? {
            sessionCalendar: {
              from: request.from,
              to: request.to,
              sessions: [
                { open: request.from, close: request.from + 7 * 3600, tradingDay: '2026-09-28' },
                {
                  open: request.from + 86_400,
                  close: request.from + 86_400 + 7 * 3600,
                  tradingDay: '2026-09-29',
                },
              ],
            },
          }
        : {}),
    },
    fetchedAt: now,
    profileEstimated: options.calendar === true,
  };
}

const json = (data: unknown, status = 200) =>
  new Response(JSON.stringify(data), { status, headers: { 'Content-Type': 'application/json' } });

/** A FeedClient over a fake proxy; `respond` answers each bars request. */
function client(
  respond: (request: FeedRequest, signal: AbortSignal) => Response | Promise<Response>,
) {
  const cache = new Map<string, FeedDataset>();
  const calls: FeedRequest[] = [];
  const fetcher = async (url: string | URL | Request, init?: RequestInit) => {
    const params = new URL(String(url), 'http://localhost').searchParams;
    const request: FeedRequest = {
      feed: params.get('feed') as FeedRequest['feed'],
      symbol: params.get('symbol')!,
      timeframe: params.get('timeframe')!,
      from: Number(params.get('from')),
      to: Number(params.get('to')),
    };
    calls.push(request);
    return respond(request, init!.signal!);
  };
  return {
    calls,
    feed: new FeedClient(fetcher as typeof fetch, {
      get: async (key) => cache.get(key),
      put: async (key, value) => {
        cache.set(key, value);
      },
    }),
  };
}

const request: FeedRequest = {
  feed: 'binance',
  symbol: 'BTCUSDT',
  timeframe: '60',
  from: seconds(2026, 9, 28),
  to: seconds(2026, 10, 3),
};

test('a fetch shows its expected count, then a preview; a repeat is cached (S4, S5)', async () => {
  const { feed, calls } = client((value) => json(dataset(value)));
  let clock = 5_000;
  const controller = new MarketDataController(feed, { now: () => clock });
  const fetching = controller.fetch(request);
  assert.deepEqual(controller.getState(), {
    service: 'unknown',
    fetch: { status: 'fetching', request, expectedBars: 120, startedAt: 5_000 },
  });
  await fetching;
  const state = controller.getState();
  assert.equal(state.service, 'available');
  assert.equal(state.fetch.status, 'preview');
  if (state.fetch.status !== 'preview') return;
  const { preview } = state.fetch;
  assert.equal(preview.barCount, 120);
  assert.equal(preview.cached, false);
  assert.equal(preview.firstBarTime, request.from);
  assert.equal(preview.lastBarTime, request.to - 3600);
  assert.deepEqual(preview.session, { kind: 'continuous' });
  assert.equal(preview.unadjusted, false);
  assert.equal(preview.profileEstimated, false);
  assert.deepEqual(preview.symbolInfo, {
    mintick: 0.01,
    pointvalue: 1,
    mincontract: 0.00001,
    timezone: 'Etc/UTC',
  });
  assert.equal(fetchProgress(state.fetch, clock), 1);

  clock += 60_000;
  await controller.fetch(request);
  const again = controller.getState().fetch;
  assert.equal(again.status === 'preview' && again.preview.cached, true);
  assert.equal(calls.length, 1);
});

test('a preview from Yahoo shows its sessions and estimated, unadjusted data (S6)', async () => {
  const yahoo = { ...request, feed: 'yahoo' as const, symbol: 'AAPL' };
  const { feed } = client((value) => json(dataset(value, { calendar: true })));
  const controller = new MarketDataController(feed);
  await controller.fetch(yahoo, feedDensity('yahoo', '60', 'EQUITY'));
  const state = controller.getState().fetch;
  assert.equal(state.status, 'preview');
  if (state.status !== 'preview') return;
  assert.deepEqual(state.preview.session, { kind: 'calendar', tradingDays: 2 });
  assert.equal(state.preview.unadjusted, true);
  assert.equal(state.preview.profileEstimated, true);
});

test('a refusal names the error and offers another provider, CSV or a retry (S9)', async () => {
  let refuse = true;
  const { feed, calls } = client((value) =>
    refuse
      ? json({ error: serializeError(marketDataError('feedRegionBlocked', { status: 451 })) }, 451)
      : json(dataset(value)),
  );
  const controller = new MarketDataController(feed);
  await controller.fetch(request);
  assert.deepEqual(controller.getState().fetch, {
    status: 'refused',
    request,
    error: marketDataMessage('feedRegionBlocked', { status: 451 }),
    code: 'feedRegionBlocked',
    alternative: 'yahoo',
    canRetry: true,
  });
  refuse = false;
  await controller.retry();
  assert.equal(controller.getState().fetch.status, 'preview');
  assert.equal(calls.length, 2);

  const missing = client(() =>
    json({ error: serializeError(marketDataError('feedSymbolMissing')) }, 400),
  );
  const yahoo = new MarketDataController(missing.feed);
  await yahoo.fetch({ ...request, feed: 'yahoo', symbol: 'NOPE' });
  const refused = yahoo.getState().fetch;
  assert.equal(refused.status === 'refused' && refused.alternative, null);
  assert.equal(refused.status === 'refused' && refused.canRetry, false);
});

test('without the data service the provider tabs are marked unavailable (4.7)', async () => {
  const { feed } = client(
    () => new Response('<html></html>', { headers: { 'Content-Type': 'text/html' } }),
  );
  const controller = new MarketDataController(feed);
  await controller.fetch(request);
  assert.deepEqual(controller.getState(), {
    service: 'unavailable',
    fetch: { status: 'unavailable', request },
  });
});

test('cancel and a newer fetch discard the earlier reply', async () => {
  const replies: (() => void)[] = [];
  const { feed } = client(
    (value, signal) =>
      new Promise<Response>((resolve, reject) => {
        signal.addEventListener('abort', () => reject(signal.reason));
        replies.push(() => resolve(json(dataset(value))));
      }),
  );
  const controller = new MarketDataController(feed);
  const cancelled = controller.fetch(request);
  await settle();
  controller.cancel();
  await cancelled;
  assert.deepEqual(controller.getState().fetch, { status: 'idle' });

  const first = controller.fetch(request);
  await settle();
  const newer = { ...request, from: seconds(2026, 9, 30) };
  const second = controller.fetch(newer);
  await settle();
  replies.at(-1)!();
  await Promise.all([first, second]);
  const state = controller.getState().fetch;
  assert.equal(state.status === 'preview' && state.request, newer);
  assert.equal(state.status === 'preview' && state.preview.barCount, 72);
});

test('symbol info edits are checked, and the data is used only on accept', async () => {
  const { feed } = client((value) => json(dataset(value)));
  const controller = new MarketDataController(feed);
  assert.equal(controller.accept(), null);
  await controller.fetch(request);
  controller.editSymbolInfo('mintick', 0);
  controller.editSymbolInfo('timezone', 'Mars/Olympus');
  let state = controller.getState().fetch;
  assert.deepEqual(state.status === 'preview' && state.preview.symbolInfoErrors, {
    mintick: marketDataMessage('profilePositive', { key: 'mintick' }),
    timezone: marketDataMessage('profileTimezoneInvalid'),
  });
  assert.equal(controller.accept(), null);
  controller.editSymbolInfo('mintick', 0.5);
  controller.editSymbolInfo('timezone', 'America/New_York');
  state = controller.getState().fetch;
  assert.deepEqual(state.status === 'preview' && state.preview.symbolInfoErrors, {});
  const accepted = controller.accept()!;
  assert.equal(accepted.request, request);
  assert.equal(accepted.input.bars.length, 120);
  assert.equal(accepted.input.syminfo.mintick, 0.5);
  assert.equal(accepted.input.syminfo.pricescale, 2);
  assert.equal(accepted.input.syminfo.timezone, 'America/New_York');
  assert.equal(accepted.input.syminfo.ticker, 'BTCUSDT');
  assert.deepEqual(controller.getState().fetch, { status: 'idle' });
});
