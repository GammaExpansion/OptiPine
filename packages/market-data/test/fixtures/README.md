# Public provider response samples

Captured on 2026-09-21. These are real public provider responses, not mock prices.
Unit tests run offline and never request provider APIs.

- `binance-profile.json`: `https://data-api.binance.vision/api/v3/exchangeInfo?symbol=BTCUSDT`
- `binance-bars.json`: `/api/v3/klines`, BTCUSDT, 1h, 2025-11-26 00:00 UTC, limit 10.
- `yahoo-hourly.json`: `https://query1.finance.yahoo.com/v8/finance/chart/AAPL`, interval 60m, period1 1764115200, period2 1764460800, includeTradingPeriods true, includePrePost false.
- `yahoo-daily.json`: same request, interval 1d.

Yahoo returns extra session metadata and a latest quote outside the requested history. Tests retain these as received and verify filtering. The requested period includes Thanksgiving and the following early close. Fully null rows are absent observations; the exact session-close quote is not a separate regular-session candle.

## Bug-bash recordings (2026-10-04 UTC)

These samples retain provider values. Search recordings keep only fields used by search and a
subset of symbols; chart recordings retain the metadata and select the same row indices in every
price/volume series. No prices or timestamps were invented. Mutation tests explicitly alter a
copy to cover malformed responses or absent rows not present in a particular recording.

- `binance-search.json`: production `https://data-api.binance.vision/api/v3/exchangeInfo`.
  Kept active BTC/ETH/DOGE base prefixes and the first 14 alphabetical substring matches for each
  query (58 distinct symbols). The original 12-result ordering excludes all three main USDT pairs.
- `binance-futures-search.json`: `https://testnet.binancefuture.com/fapi/v1/exchangeInfo`.
  Kept BTC/ETH/DOGE substring matches (35 symbols), including contract type and status. Production
  futures and its demo endpoint returned HTTP 451 from the recording region; this is a real USD-M
  testnet exchange-info response, not a fabricated production response.
- `yahoo-forex-15m.json`: `/v8/finance/chart/EURUSD%3DX?interval=15m&range=5d`.
  Kept the final three priced observations and the final empty observation (four null prices,
  volume zero). Its final empty timestamp is 1790981100.
- `yahoo-forex-hourly.json` and `yahoo-forex-daily.json`: same symbol, intervals `60m` and `1d`,
  period1 1790650159, period2 1791082159. Kept the last three priced rows and final row. Hourly
  ends with null OHLC and zero volume; daily appends a quote inside the last trading session.
- `yahoo-stock-15m.json` and `yahoo-index-15m.json`: symbols AAPL and `%5EGSPC`, interval `15m`,
  period1 1790822959, period2 1791082159. Kept the last three rows. Both end with a priced quote
  at the exact session close and volume zero. Neither currently exhibits the forex null-OHLC
  quirk; mutation coverage verifies the same null-row rule for both instrument types.
- `yahoo-daily-old.json`: AAPL, interval `1d`, period1 1443830400, period2 1444176000.
  Both daily rows are retained (2015-10-05 and 2015-10-06); no historical trading periods exist
  in its metadata. The matching `60m` request returned HTTP 422 (outside the last 730 days).
- `yahoo-history-limits.json`: AAPL chart probes, recorded at 2026-10-04 02:49:19 UTC. Each entry
  contains its interval, periods and response. Intraday refusals are complete: 1m says at most
  eight days per request; 2m/5m/15m/30m/90m say the last 60 days; 60m says the last 730 days.
  The app exposes 5m/15m/30m/60m only. The successful 1d/1wk/1mo requests start at Unix epoch zero
  and end in 2015; only their first two and final rows are retained. All three allow old history;
  weekly and monthly are not newly exposed by this bug fix. The 1m response establishes a request
  span limit only, not its total historical availability.

All Yahoo requests used `https://query1.finance.yahoo.com`, `includeTradingPeriods=true` and
`includePrePost=false`. Tests run offline. Older session close estimates use Yahoo's current
regular local closing time with historical timezone offsets; they do not establish historical
early-close times. The API's `calendarEstimated` flag and the web preview disclose this limit.
