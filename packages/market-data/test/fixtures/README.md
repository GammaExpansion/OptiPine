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

## Forex OHLC follow-up (2026-10-04 11:16:43 UTC)

`yahoo-forex-ohlc.json` contains selected real chart rows for EURUSD=X, GBPUSD=X and USDJPY=X at
1d, 15m and 60m. Each sample records its original URL and the inspected row/error counts. Daily
requests used period1=0; 15m used the last 59 days, 60m the last 729 days. Kept every daily row
over the 0.05% correction limit, up to seven recent inconsistent rows, the final three priced rows
and the final row, deduplicated and in provider order. Every indicator array uses the same indices. Metadata keeps
only loader fields; trading periods keep sessions intersecting selected rows. Daily samples also
carry the matching recorded hourly session metadata for those dates. Prices are unchanged.

Full daily captures had 128 / 103 / 277 inconsistent rows (EUR / GBP / JPY). The largest
high/low expansions required were approximately 2.17% / 1.29% / 0.93%, so these are not all harmless
precision errors. Within the latest two years the maxima were 0.0235% / 0.0228% / 0.0441%.
The available 15m and 60m captures had no OHLC envelope errors across all three symbols.
The implemented correction ceiling is 0.05% of the smallest OHLC price, for Yahoo forex only.
The daily samples retain all 11 / 7 / 25 over-limit dates, most recently 2022-12-26 / 2020-06-07 /
2022-08-28, respectively. Tests verify the complete count and latest date before refusal, recovery
when starting the next day, mutations just below/above the ceiling and malformed fields. Intraday
mutations also verify that multiple bad bars on the same UTC date count as one affected day.
No failed rows are silently omitted from an accepted dataset.

Live loads through `createUpstreamFetch` on the same date returned 515 daily bars for 2Y and 258
for 1Y for each pair. Normalized counts were EUR 19/10, GBP 12/4 and JPY 35/15.

The follow-up live check on 2026-10-04 used `/api/market/bars` with the real upstream transport
and the web workflow's All and Custom ranges. EUR/USD 1D All reported 11 affected UTC dates,
latest 2022-12-26. Custom starting **2022-12-27** loaded **979 bars**, through 2026-10-01, with
28 bounded corrections and the older-session estimate note. The 2Y and 1Y loads still succeeded.
An unlimited history request is valid, but a dataset with these bad prices is not accepted;
the refusal now gives one cutoff that excludes every over-limit row observed in the request.

The same follow-up confirmed GBP/USD Custom from 2020-06-08 (1,644 bars) and USD/JPY Custom from
2022-08-29 (1,064 bars). Some USDJPY=X preset requests returned `meta.symbol: "JPY=X"` instead;
the existing strict symbol check rejects that separate provider inconsistency with
`feedInvalidResponse`. A 2Y retry returned the requested symbol and loaded 515 bars.
