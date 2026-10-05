# Market responses

Captured through the local `/api/market` proxy on 2026-10-03. The browser clock is fixed at
`2026-10-03T14:37:00Z`; the example range is `[2024-10-03T14:00:00Z, 2026-10-03T14:00:00Z)`.
Prices, volumes, symbol profiles and Yahoo sessions are real provider responses, compressed as
UTF-8 JSON with gzip. The five response files total **447,596 bytes (437.1 KiB)**.

| File                    | Request / provenance                                                                              |   Bytes |
| ----------------------- | ------------------------------------------------------------------------------------------------- | ------: |
| `search.json.gz`        | Binance spot search, `q=BTC`                                                                      |     198 |
| `search-btcus.json.gz`  | Binance spot search, `q=BTCUS`                                                                    |     127 |
| `btc-two-years.json.gz` | BTCUSDT, 60, 17,520 bars in the example range                                                     | 445,780 |
| `yahoo-short.json.gz`   | AAPL, 1D, 2026-09-03 14:00 through 2026-10-03 14:00 UTC; 20 bars, 21 calendar sessions            |   1,319 |
| `refusal.json`          | Synthetic serialized `feedRegionBlocked` / HTTP 451 refusal; Binance was available during capture |     172 |

`../../market-fixtures.ts` serves these responses without network access. Narrower ranges filter
recorded bars; the 4h switch aggregates complete groups of four recorded hourly bars. Search filters
the two recorded Binance lists. Yahoo search is a synthetic AAPL result. `fetchedAt` is normalized
to the test clock. The unavailable-service case is a synthetic HTML 404.

Recapture manually with the Vite server on port 5180:

```sh
npm run dev --workspace @pine/web -- --port 5180
node apps/web/e2e/fixtures/market/record.ts
```

The recorder is never called by Playwright. All data tests intercept `/api/market/**` and abort
external requests, including search, so tests cannot fall through to a live provider.

The demo project intercepts `data-api.binance.vision` instead. Its adapter reconstructs the
`exchangeInfo` symbol fields from the recorded search names and the BTCUSDT tick/lot profile, and
re-encodes the recorded hourly bars as `klines`, including close timestamps and 1,000-row pagination.
Those reconstructed response envelopes are test-only; the shipped demo contains no recordings.
