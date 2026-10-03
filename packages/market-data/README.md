# @pine/market-data

Market data for `@pine/engine` runs: closed OHLCV bars and symbol metadata from Binance spot,
Binance USDⓈ-M perpetuals and Yahoo Finance, CSV files in the golden-fixture layout, and the run
profile and session-calendar files that go with them. Every result is a validated `RunInput`
fragment; nothing is estimated silently, and `profileEstimated` marks metadata a provider does not
publish.

## Entry points

**`@pine/market-data`** works in a browser and in Node.

| Export                                                            | Purpose                                                                                                                                                   |
| ----------------------------------------------------------------- | --------------------------------------------------------------------------------------------------------------------------------------------------------- |
| `FeedClient`                                                      | Calls a same-origin `/api/market` proxy, validates every bar, and caches the last datasets in memory and IndexedDB (`browserFeedCache`) for five minutes. |
| `FeedImportSession`                                               | Loads one selection at a time; a changed selection or closed dialog discards late replies.                                                                |
| `searchFeed`, `loadFeed`                                          | Provider calls behind the proxy, given a `FetchJson` that performs the request.                                                                           |
| `Feed`, `FeedRequest`, `validateFeedRequest`, `feedKey`           | Request contract and bounds: supported timeframes per provider, 100,000 bars at most, and Yahoo's intraday history limits.                                |
| `parseCsv`                                                        | `time` (Unix seconds), `open`, `high`, `low`, `close` and `volume` columns; other columns are ignored. Throws `CsvError` with the line.                   |
| `parseRunMetadata`, `parseSessionCalendar`, `createSymbolProfile` | Validate a profile JSON or calendar JSON, or build an editable symbol profile for a CSV.                                                                  |
| `marketDataMessageIds`, `isMarketDataError`                       | Errors are coded; see [@pine/messages](../messages/README.md).                                                                                            |

**`@pine/market-data/proxy`** is Node only.

- `createMarketMiddleware(fetchJson?)` serves `GET /api/market/search` and `/api/market/bars` as
  `(req, res, next)` middleware for `node:http`, Connect or Vite. It rejects cross-site requests and
  allows four concurrent requests and 90 a minute.
- `createUpstreamFetch(fetch?)` reaches only `data-api.binance.vision`, `fapi.binance.com` and
  `query1.finance.yahoo.com`. It spaces calls 250 ms apart, backs off after HTTP 429 or 418, limits
  responses to 24 MB, and keeps a small LRU cache.

Mount the middleware in a development server plugin and in the server that serves your built
app, so the browser reaches it on the same origin.

## Development

```sh
npm run build -w @pine/market-data
npm run test -w @pine/market-data
```

Tests run offline against recorded provider responses in `test/fixtures` and real engine runs.
