# Public provider response samples

Captured on 2026-09-21. These are real public provider responses, not mock prices.
Unit tests run offline and never request provider APIs.

- `binance-profile.json`: `https://data-api.binance.vision/api/v3/exchangeInfo?symbol=BTCUSDT`
- `binance-bars.json`: `/api/v3/klines`, BTCUSDT, 1h, 2025-11-26 00:00 UTC, limit 10.
- `yahoo-hourly.json`: `https://query1.finance.yahoo.com/v8/finance/chart/AAPL`, interval 60m, period1 1764115200, period2 1764460800, includeTradingPeriods true, includePrePost false.
- `yahoo-daily.json`: same request, interval 1d.

Yahoo returns extra session metadata and a latest quote outside the requested history. Tests retain these as received and verify filtering. The requested period includes Thanksgiving and the following early close. Fully null rows are absent observations; the exact session-close quote is not a separate regular-session candle.
