import { writeFile } from 'node:fs/promises';
import { gzipSync } from 'node:zlib';
import { exampleRequest } from '../../../src/workflows/market-data.ts';

/** Manual capture only; Playwright never invokes this script or reaches an upstream provider. */
const clock = Date.UTC(2026, 9, 3, 14, 37);
const example = exampleRequest(clock);
const requests = [
  ['search', 'search', { feed: 'binance', q: 'BTC' }],
  ['search-btcus', 'search', { feed: 'binance', q: 'BTCUS' }],
  ['btc-two-years', 'bars', example],
  [
    'yahoo-short',
    'bars',
    {
      feed: 'yahoo',
      symbol: 'AAPL',
      timeframe: '1D',
      from: example.to - 30 * 86400,
      to: example.to,
    },
  ],
] as const;
for (const [name, path, request] of requests) {
  const query = new URLSearchParams(
    Object.entries(request).map(([key, value]) => [key, String(value)]),
  );
  const url = `http://127.0.0.1:5180/api/market/${path}?${query}`;
  const response = await fetch(url);
  const body = await response.text();
  if (!response.ok) {
    console.log(name, response.status, body.slice(0, 300));
    continue;
  }
  const compressed = gzipSync(body, { level: 9 });
  await writeFile(new URL(`./${name}.json.gz`, import.meta.url), compressed);
  console.log(name, response.status, compressed.byteLength, JSON.parse(body).input?.bars.length);
}
