import {
  FeedClient,
  browserFeedCache,
  marketDataError,
  type Feed,
  type FeedCache,
  type FeedRequest,
} from '@pine/market-data';

/** Reuse FeedClient's cache and validation, replacing only its HTTP transport with local calls. */
export class DemoFeedClient extends FeedClient {
  constructor(
    respond: (path: string, signal: AbortSignal) => Promise<Response>,
    cache: FeedCache = browserFeedCache,
  ) {
    super((url, options) => respond(String(url), options!.signal!), cache);
  }

  override async search(feed: Feed, query: string, signal: AbortSignal) {
    signal.throwIfAborted();
    if (feed !== 'binance') throw marketDataError('feedInvalidRequest');
    return super.search(feed, query, signal);
  }

  override async load(request: FeedRequest, signal: AbortSignal) {
    signal.throwIfAborted();
    // Reject server-only sources even when a previous self-hosted session cached them.
    if (request.feed !== 'binance') throw marketDataError('feedInvalidRequest');
    return super.load(request, signal);
  }
}
