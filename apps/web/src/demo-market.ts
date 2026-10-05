import { loadFeed, searchFeed, marketDataError, type FetchJson } from '@pine/market-data';
import { serializeError } from '@pine/messages';

/** Only the fixed public spot host is fetched; no credentials, proxy or alternate data source. */
function directJson(fetcher: typeof fetch): FetchJson {
  return async (url, signal) => {
    signal.throwIfAborted();
    if (url.origin !== 'https://data-api.binance.vision')
      throw marketDataError('feedInvalidRequest');
    let response: Response;
    try {
      response = await fetcher(url, {
        signal: AbortSignal.any([signal, AbortSignal.timeout(20_000)]),
        credentials: 'omit',
        redirect: 'error',
      });
    } catch {
      signal.throwIfAborted();
      throw marketDataError('feedNetworkError');
    }
    if (!response.ok) {
      await response.body?.cancel();
      if (response.status === 429 || response.status === 418)
        throw marketDataError('feedRateLimited');
      throw marketDataError(response.status === 451 ? 'feedRegionBlocked' : 'feedHttpError', {
        status: response.status,
      });
    }
    try {
      const result = await response.json();
      signal.throwIfAborted();
      return result;
    } catch {
      signal.throwIfAborted();
      throw marketDataError('feedInvalidResponse');
    }
  };
}

/** Adapt the client's private transport contract in memory; its /api URL is never fetched. */
export async function demoResponse(path: string, signal: AbortSignal, fetcher: typeof fetch) {
  signal.throwIfAborted();
  const url = new URL(path, 'https://optipine.invalid');
  const params = url.searchParams;
  try {
    if (params.get('feed') !== 'binance') throw marketDataError('feedInvalidRequest');
    const get = directJson(fetcher);
    if (url.pathname === '/api/market/search')
      return Response.json({
        symbols: await searchFeed('binance', params.get('q') ?? '', get, signal),
      });
    if (url.pathname !== '/api/market/bars') throw marketDataError('feedInvalidRequest');
    const dataset = await loadFeed(
      {
        feed: 'binance',
        symbol: params.get('symbol') ?? '',
        timeframe: params.get('timeframe') ?? '',
        from: Number(params.get('from')),
        to: Number(params.get('to')),
      },
      get,
      signal,
    );
    return Response.json(dataset);
  } catch (error) {
    signal.throwIfAborted();
    // Preserve provider message ids through FeedClient's existing error restoration path.
    return Response.json({ error: serializeError(error) }, { status: 502 });
  }
}
