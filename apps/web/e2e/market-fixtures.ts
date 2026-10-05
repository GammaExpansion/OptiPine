import { readFile } from 'node:fs/promises';
import { gunzipSync } from 'node:zlib';
import type { FeedDataset, FeedSymbol } from '@pine/market-data';
import type { MarketBar } from '@pine/engine';
import type { Page, Route } from '@playwright/test';

export const fixedClock = new Date('2026-10-03T14:37:00Z');
async function recorded<T>(name: string): Promise<T> {
  const raw = await readFile(new URL(`./fixtures/market/${name}.json.gz`, import.meta.url));
  return JSON.parse(gunzipSync(raw).toString('utf8')) as T;
}
export interface MarketFixtureOptions {
  mode?: 'success' | 'refusal' | 'unavailable';
  beforeBars?: (route: Route) => Promise<void>;
}

/** Local assets may load; every market request is intercepted, and external requests are aborted. */
export async function installMarketFixtures(page: Page, options: MarketFixtureOptions = {}) {
  await page.clock.setFixedTime(fixedClock);
  const [search, specific, btc, yahoo] = await Promise.all([
    recorded<{ symbols: FeedSymbol[] }>('search'),
    recorded<{ symbols: FeedSymbol[] }>('search-btcus'),
    recorded<FeedDataset>('btc-two-years'),
    recorded<FeedDataset>('yahoo-short'),
  ]);
  const refusal = await readFile(
    new URL('./fixtures/market/refusal.json', import.meta.url),
    'utf8',
  );
  const requests: URL[] = [];
  await page.route('**/*', async (route) => {
    const url = new URL(route.request().url());
    if (!['127.0.0.1', 'localhost'].includes(url.hostname)) {
      await route.abort();
      return;
    }
    if (!url.pathname.startsWith('/api/market/')) {
      await route.continue();
      return;
    }
    requests.push(url);
    if (options.mode === 'unavailable') {
      await route.fulfill({ status: 404, contentType: 'text/html', body: '<html></html>' });
      return;
    }
    if (url.pathname.endsWith('/search')) {
      const query = url.searchParams.get('q')!.toUpperCase();
      const symbols =
        url.searchParams.get('feed') === 'yahoo'
          ? [{ symbol: 'AAPL', name: 'Apple Inc.', exchange: 'NASDAQ', type: 'EQUITY' }]
          : [...search.symbols, ...specific.symbols].filter(
              (item, i, all) => all.findIndex((other) => other.symbol === item.symbol) === i,
            );
      await route.fulfill({
        json: { symbols: symbols.filter((item) => item.symbol.includes(query)) },
      });
      return;
    }
    if (options.beforeBars) await options.beforeBars(route);
    if (options.mode === 'refusal') {
      await route.fulfill({ status: 451, contentType: 'application/json', body: refusal });
      return;
    }
    const from = Number(url.searchParams.get('from')),
      to = Number(url.searchParams.get('to'));
    const timeframe = url.searchParams.get('timeframe')!;
    const dataset = structuredClone(url.searchParams.get('feed') === 'yahoo' ? yahoo : btc);
    let bars = dataset.input.bars.filter((bar) => bar.time >= from && bar.time < to);
    // The timeframe-switch fixture is explicitly derived by aggregating the recorded hourly bars.
    if (timeframe === '240') {
      const groups = new Map<number, MarketBar[]>();
      for (const bar of bars) {
        const time = Math.floor(bar.time / 14400) * 14400;
        const group = groups.get(time) ?? [];
        group.push(bar);
        groups.set(time, group);
      }
      bars = [...groups]
        .filter(([time, group]) => time >= from && group.length === 4)
        .map(([time, group]) => ({
          time,
          open: group[0].open,
          high: Math.max(...group.map((bar) => bar.high)),
          low: Math.min(...group.map((bar) => bar.low)),
          close: group.at(-1)!.close,
          volume: group.reduce((sum, bar) => sum + bar.volume, 0),
        }));
    }
    dataset.input.bars = bars;
    dataset.input.timeframe = timeframe;
    dataset.fetchedAt = fixedClock.valueOf();
    await route.fulfill({ json: dataset });
  });
  return requests;
}

/** Serve the same recording from Binance's browser-accessible spot API for the Pages build. */
export async function installDemoMarketFixtures(page: Page) {
  await page.clock.setFixedTime(fixedClock);
  const [dataset, search, specific] = await Promise.all([
    recorded<FeedDataset>('btc-two-years'),
    recorded<{ symbols: FeedSymbol[] }>('search'),
    recorded<{ symbols: FeedSymbol[] }>('search-btcus'),
  ]);
  const symbols = [
    ...new Map(
      [...search.symbols, ...specific.symbols].map((symbol) => [symbol.symbol, symbol]),
    ).values(),
  ];
  const requests: URL[] = [];
  await page.route('**/*', async (route) => {
    const url = new URL(route.request().url());
    if (['127.0.0.1', 'localhost'].includes(url.hostname)) {
      await route.continue();
      return;
    }
    if (url.hostname !== 'data-api.binance.vision') {
      await route.abort();
      return;
    }
    requests.push(url);
    if (url.pathname.endsWith('/exchangeInfo')) {
      await route.fulfill({
        json: {
          symbols: symbols.map((symbol) => ({
            symbol: symbol.symbol,
            baseAsset: symbol.name.split(' / ')[0],
            quoteAsset: symbol.name.split(' / ')[1],
            status: 'TRADING',
            isSpotTradingAllowed: true,
            filters: [
              { filterType: 'PRICE_FILTER', tickSize: String(dataset.input.syminfo.mintick) },
              { filterType: 'LOT_SIZE', stepSize: String(dataset.input.syminfo.mincontract) },
            ],
          })),
        },
      });
      return;
    }
    if (!url.pathname.endsWith('/klines')) {
      await route.abort();
      return;
    }
    const from = Number(url.searchParams.get('startTime')) / 1000;
    const to = Number(url.searchParams.get('endTime')) / 1000;
    const rows = dataset.input.bars
      .filter((bar) => bar.time >= from && bar.time <= to)
      .slice(0, Number(url.searchParams.get('limit')))
      .map((bar) => [
        bar.time * 1000,
        String(bar.open),
        String(bar.high),
        String(bar.low),
        String(bar.close),
        String(bar.volume),
        bar.time * 1000 + 3_599_999,
      ]);
    await route.fulfill({ json: rows });
  });
  return requests;
}
