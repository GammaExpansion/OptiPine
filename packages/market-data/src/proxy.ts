import type { IncomingMessage, ServerResponse } from 'node:http';
import { setTimeout as delay } from 'node:timers/promises';
import { feedTimeframes, type Feed, type FeedRequest } from './contracts.ts';
import { loadFeed, searchFeed, type FetchJson } from './providers.ts';
import { serializeError } from '@pine/messages';
import { isMarketDataError, marketDataError } from './messages.ts';

/** Fixed upstream origins only. No caller-supplied hosts, paths, cookies or credentials. */
export function createUpstreamFetch(fetcher: typeof fetch = fetch): FetchJson {
  const cache = new Map<string, { expires: number; text: string }>();
  let bytes = 0,
    nextStart = 0,
    blockedUntil = 0;
  return async (url, signal) => {
    if (
      ![
        'https://data-api.binance.vision',
        'https://fapi.binance.com',
        'https://query1.finance.yahoo.com',
      ].includes(url.origin)
    )
      throw marketDataError('feedInvalidRequest');
    signal.throwIfAborted();
    const key = url.href,
      saved = cache.get(key);
    if (saved && saved.expires > Date.now()) return JSON.parse(saved.text);
    if (Date.now() < blockedUntil) throw marketDataError('feedRateLimited');
    const start = Math.max(Date.now(), nextStart);
    nextStart = start + 250;
    await delay(Math.max(0, start - Date.now()), undefined, { signal });
    signal.throwIfAborted();
    if (Date.now() < blockedUntil) throw marketDataError('feedRateLimited');
    let response: Response;
    try {
      response = await fetcher(url, {
        signal: AbortSignal.any([signal, AbortSignal.timeout(20_000)]),
        redirect: 'error',
        headers: { Accept: 'application/json', 'User-Agent': 'Pine-Web/0.1 market-data' },
      });
    } catch (error) {
      signal.throwIfAborted();
      throw marketDataError('feedNetworkError');
    }
    if (response.status === 429 || response.status === 418) {
      const retry = Number(response.headers.get('retry-after'));
      blockedUntil =
        Date.now() + Math.min(300, Math.max(30, Number.isFinite(retry) ? retry : 30)) * 1000;
      await response.body?.cancel();
      throw marketDataError('feedRateLimited');
    }
    if (!response.ok) {
      await response.body?.cancel();
      throw marketDataError(response.status === 451 ? 'feedRegionBlocked' : 'feedHttpError', {
        status: response.status,
      });
    }
    // Bound upstream memory even when content-length is absent or inaccurate.
    const reader = response.body?.getReader();
    if (!reader) throw marketDataError('feedInvalidResponse');
    const chunks: Uint8Array[] = [];
    let length = 0;
    while (true) {
      const item = await reader.read();
      if (item.done) break;
      length += item.value.byteLength;
      if (length > 24 * 1024 * 1024) {
        await reader.cancel();
        throw marketDataError('feedInvalidResponse');
      }
      chunks.push(item.value);
    }
    const text = Buffer.concat(chunks).toString('utf8');
    let result;
    try {
      result = JSON.parse(text);
    } catch {
      throw marketDataError('feedInvalidResponse');
    }
    if (saved) {
      cache.delete(key);
      bytes -= saved.text.length * 2;
    }
    while (cache.size && (bytes + text.length * 2 > 48 * 1024 * 1024 || cache.size >= 128)) {
      const oldest = cache.keys().next().value!;
      bytes -= cache.get(oldest)!.text.length * 2;
      cache.delete(oldest);
    }
    cache.set(key, {
      expires: Date.now() + (url.pathname.endsWith('exchangeInfo') ? 3600_000 : 60_000),
      text,
    });
    bytes += text.length * 2;
    return result;
  };
}

export function createMarketMiddleware(get: FetchJson = createUpstreamFetch()) {
  let active = 0;
  const requests: number[] = [];
  return (req: IncomingMessage, res: ServerResponse, next: () => void) => {
    // A request target the HTTP parser accepts but the URL parser rejects must not escape
    // the request callback: an uncaught error here exits the whole server process.
    let url: URL;
    try {
      url = new URL(req.url ?? '/', 'http://localhost');
    } catch {
      res.writeHead(400).end();
      return;
    }
    if (!url.pathname.startsWith('/api/market/')) {
      next();
      return;
    }
    const reply = (status: number, data: unknown) => {
      if (res.destroyed) return;
      res.writeHead(status, {
        'Content-Type': 'application/json; charset=utf-8',
        'Cache-Control': 'no-store',
        'X-Content-Type-Options': 'nosniff',
      });
      res.end(JSON.stringify(data));
    };
    if (req.method !== 'GET') {
      reply(405, {});
      return;
    }
    if (
      req.headers['sec-fetch-site'] === 'cross-site' ||
      (req.headers.origin &&
        req.headers.origin !== `http://${req.headers.host}` &&
        req.headers.origin !== `https://${req.headers.host}`)
    ) {
      reply(403, {});
      return;
    }
    while (requests.length && requests[0] < Date.now() - 60_000) requests.shift();
    if (active >= 4 || requests.length >= 90) {
      reply(429, { error: serializeError(marketDataError('feedRateLimited')) });
      return;
    }
    requests.push(Date.now());
    active++;
    const controller = new AbortController();
    const abort = () => controller.abort();
    res.on('close', abort);
    const timeout = setTimeout(abort, 180_000);
    void (async () => {
      try {
        const feed = url.searchParams.get('feed') as Feed;
        if (!Object.hasOwn(feedTimeframes, feed)) throw marketDataError('feedInvalidRequest');
        if (url.pathname === '/api/market/search') {
          reply(200, {
            symbols: await searchFeed(
              feed,
              url.searchParams.get('q') ?? '',
              get,
              controller.signal,
            ),
          });
        } else if (url.pathname === '/api/market/bars') {
          const request: FeedRequest = {
            feed,
            symbol: url.searchParams.get('symbol') ?? '',
            timeframe: url.searchParams.get('timeframe') ?? '',
            from: Number(url.searchParams.get('from') ?? NaN),
            to: Number(url.searchParams.get('to') ?? NaN),
          };
          reply(200, await loadFeed(request, get, controller.signal));
        } else reply(404, {});
      } catch (error) {
        // Provider and validation failures are coded market-data errors. Anything else is
        // an unexpected upstream shape or a bug: keep the detail in the server log and answer
        // with the generic invalid-response message instead of echoing internals.
        const known = isMarketDataError(error);
        if (!known && !(error instanceof Error && error.name === 'AbortError'))
          console.error('market data request failed:', error);
        reply(400, {
          error: serializeError(known ? error : marketDataError('feedInvalidResponse')),
        });
      } finally {
        clearTimeout(timeout);
        res.off('close', abort);
        active--;
      }
    })();
  };
}
