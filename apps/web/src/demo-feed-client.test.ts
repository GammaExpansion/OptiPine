import { expect, test, vi } from 'vitest';
import type { FeedCache, FeedDataset, FeedRequest } from '@pine/market-data';
import { DemoFeedClient } from './demo-feed-client.ts';
import { demoResponse } from './demo-market.ts';

const request: FeedRequest = {
  feed: 'binance',
  symbol: 'btcusdt',
  timeframe: '60',
  from: 1_700_000_000,
  to: 1_700_010_800,
};
const exchange = {
  symbols: [
    {
      symbol: 'BTCUSDT',
      baseAsset: 'BTC',
      quoteAsset: 'USDT',
      status: 'TRADING',
      filters: [
        { filterType: 'PRICE_FILTER', tickSize: '0.01' },
        { filterType: 'LOT_SIZE', stepSize: '0.00001' },
      ],
    },
  ],
};
const rows = [
  [request.from * 1000, '100', '103', '99', '102', '5', (request.from + 3600) * 1000 - 1],
];

function setup() {
  let saved: FeedDataset | undefined;
  const cache: FeedCache = {
    get: vi.fn(async () => saved),
    put: vi.fn(async (_, value) => {
      saved = value;
    }),
  };
  const urls: URL[] = [];
  const fetcher = vi.fn<typeof fetch>(async (url, options) => {
    const parsed = new URL(String(url));
    urls.push(parsed);
    expect(parsed.origin).toBe('https://data-api.binance.vision');
    expect(options?.credentials).toBe('omit');
    expect(options?.redirect).toBe('error');
    return Response.json(parsed.pathname.endsWith('exchangeInfo') ? exchange : rows);
  });
  return {
    client: new DemoFeedClient((path, signal) => demoResponse(path, signal, fetcher), cache),
    cache,
    fetcher,
    urls,
    corrupt: (data: FeedDataset) => {
      saved = data;
    },
  };
}

test('spot search and load use the public provider, and repeat loads reuse the validated cache', async () => {
  const { client, urls, cache } = setup();
  const signal = new AbortController().signal;
  expect(await client.search('binance', 'BTC', signal)).toEqual([
    { symbol: 'BTCUSDT', name: 'BTC / USDT', exchange: 'Binance', type: 'crypto' },
  ]);
  const first = await client.load(request, signal);
  expect(first.cached).toBe(false);
  expect(first.dataset.input.bars).toEqual([
    { time: request.from, open: 100, high: 103, low: 99, close: 102, volume: 5 },
  ]);
  expect(first.dataset.input).toMatchObject({
    timeframe: '60',
    realtimeTail: false,
    strategyClosePending: false,
  });
  expect(cache.put).toHaveBeenCalledOnce();
  expect(urls.at(-1)?.searchParams.get('symbol')).toBe('BTCUSDT');
  expect((await client.load(request, signal)).cached).toBe(true);
  expect(urls).toHaveLength(3);
});

test('corrupt cached data is replaced, and malformed upstream OHLC never enters the cache', async () => {
  const { client, cache, fetcher, corrupt } = setup();
  const signal = new AbortController().signal;
  const { dataset } = await client.load(request, signal);
  dataset.input.bars[0].high = 1;
  corrupt(dataset);
  expect((await client.load(request, signal)).cached).toBe(false);
  corrupt(dataset);
  fetcher.mockImplementation(async (url) =>
    Response.json(
      String(url).includes('exchangeInfo')
        ? exchange
        : [[request.from * 1000, '100', '1', '99', '102', '5', request.from * 1000 + 3599999]],
    ),
  );
  await expect(client.load(request, signal)).rejects.toMatchObject({
    uiText: { id: 'feedInvalidResponse' },
  });
  expect(cache.put).toHaveBeenCalledTimes(2);
});

test('unsupported sources and invalid requests cannot use the cache or issue network requests', async () => {
  const { client, cache, fetcher } = setup();
  const signal = new AbortController().signal;
  for (const feed of ['yahoo', 'binance-futures'] as const) {
    await expect(client.search(feed, 'BTC', signal)).rejects.toMatchObject({
      code: 'feedInvalidRequest',
    });
    await expect(client.load({ ...request, feed }, signal)).rejects.toMatchObject({
      code: 'feedInvalidRequest',
    });
  }
  await expect(client.load({ ...request, to: 0 }, signal)).rejects.toMatchObject({
    code: 'feedInvalidRequest',
  });
  expect(fetcher).not.toHaveBeenCalled();
  expect(cache.get).not.toHaveBeenCalled();
  const result = await demoResponse('/api/market/bars?feed=yahoo', signal, fetcher);
  expect(result.ok).toBe(false);
  expect(fetcher).not.toHaveBeenCalled();
});

test.each([
  [451, 'feedRegionBlocked'],
  [429, 'feedRateLimited'],
  [418, 'feedRateLimited'],
  [500, 'feedHttpError'],
] as const)(
  'HTTP %s preserves the provider error and never substitutes data',
  async (status, code) => {
    const { client, cache, fetcher } = setup();
    fetcher.mockResolvedValue(new Response('', { status }));
    await expect(client.load(request, new AbortController().signal)).rejects.toMatchObject({
      uiText: { id: code },
    });
    expect(cache.put).not.toHaveBeenCalled();
  },
);

test('network and invalid JSON errors retain existing messages', async () => {
  const { client, fetcher } = setup();
  fetcher.mockRejectedValue(new TypeError('Failed to fetch'));
  await expect(client.search('binance', 'BTC', new AbortController().signal)).rejects.toMatchObject(
    { uiText: { id: 'feedNetworkError' } },
  );
  fetcher.mockResolvedValue(new Response('<html>'));
  await expect(client.search('binance', 'BTC', new AbortController().signal)).rejects.toMatchObject(
    { uiText: { id: 'feedInvalidResponse' } },
  );
});

test('cancellation before and during fetching never caches a response or continues pagination', async () => {
  const { client, fetcher, cache } = setup();
  const controller = new AbortController();
  controller.abort();
  await expect(client.load(request, controller.signal)).rejects.toMatchObject({
    name: 'AbortError',
  });
  expect(fetcher).not.toHaveBeenCalled();
  const pending = new AbortController();
  fetcher.mockImplementation(async () => {
    pending.abort();
    return Response.json(exchange);
  });
  await expect(client.load(request, pending.signal)).rejects.toMatchObject({ name: 'AbortError' });
  expect(fetcher).toHaveBeenCalledOnce();
  expect(cache.put).not.toHaveBeenCalled();
});
