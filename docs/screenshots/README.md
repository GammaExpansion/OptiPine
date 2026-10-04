# README screenshots

These PNGs show the real browser app running Trend Breakout over the recorded BTCUSDT 1h market
response in [the e2e fixtures](../../apps/web/e2e/fixtures/market/README.md). They are examples of
the interface, not recommended strategy settings.

From the repository root, after `npm ci && npm run build`:

```sh
npx playwright install chromium
npm run screenshots -w @pine/web
```

The [capture script](../../apps/web/scripts/readme-screenshots.ts) starts and closes its own Vite
dev server on `127.0.0.1:5176`. Set `E2E_BASE_PORT` to use that base plus two, matching the e2e dev
port, or pass a port explicitly. To reuse a dev, preview or production server, pass its local URL:

```sh
npm run screenshots -w @pine/web -- --port 6276
npm run screenshots -w @pine/web -- --url http://127.0.0.1:5173
```

The URL must use `localhost` or `127.0.0.1`. An occupied port fails instead of silently capturing
another worktree. Each run creates a fresh Chromium context, starts an advancing clock at
`2026-10-03T14:37:00Z`, uses UTC and English, blocks service workers, and reuses the e2e route
interceptor: local assets load, market requests use recorded responses, and external requests are
aborted. No live market connection is needed after dependencies and Chromium are installed.

The script clicks **Load example**, runs the default backtest, visits Trades, Report and Equity,
switches to Chinese, and resizes to the phone layout. The chart frames the newest trade using the
Trades tab. The backtest uses Length 180 and Multiplier
2.25. It then runs a 40-set grid: Length 130–200 in steps of 10 and Multiplier 1.75–2.75 in steps
of 0.25. The other inputs keep their defaults;
validation uses 70% IS / 30% OOS, ranking uses IS net profit, and filters are cleared so all results
remain visible. It waits for the Top 20 curves and selects leaderboard row #1.

| Image              | View                                                   | Dimensions |
| ------------------ | ------------------------------------------------------ | ---------- |
| `backtest.png`     | English chart, plots, trade markers and Report (B1)    | 1440 × 900 |
| `equity.png`       | Equity, drawdown, daily P&L and monthly returns (B5)   | 1440 × 900 |
| `optimize.png`     | Summary, leaderboard, map, sensitivity, selection (R1) | 1440 × 900 |
| `walk-forward.png` | Stitched OOS equity, window results and stability (W1) | 1440 × 900 |
| `phone.png`        | English Backtest at the phone viewport (G3)            | 390 × 844  |
| `backtest-zh.png`  | Chinese Backtest                                       | 1440 × 900 |

PNG at 1× keeps small text readable without an extra image dependency. Captures include the exact
viewport, with no browser chrome or added phone frame. The script enforces less than 400 KB per
image and 2.5 MB overall, waits for fonts and visible result panels, and fails on browser errors.
The clock advances in real time, preserving the fixture's date range while displaying actual
backtest and optimization durations. The script checks the header range and rejects zero-duration
captures. The pool is capped at three Workers for consistent capture settings. Durations depend on
the machine; rendering may vary slightly between Chromium or operating system versions.

The same command also runs **Walk-forward** with three rolling windows: 13 IS months, 4 OOS months
and a 4-month step; the final OOS window ends with the recorded data. Each window searches nine
sets: Length 160–200 in steps of 20 and Multiplier
2.00–2.50 in steps of 0.25. Filters remain cleared. The capture waits for all three windows,
stitched equity, fixed parameters and both stability rows, then selects W1. This keeps the run
short without replacing computed results or changing the recorded data.

Verification:

```sh
node --test apps/web/scripts/readme-screenshots.test.ts
npm run typecheck -w @pine/web
npm run screenshots -w @pine/web -- --port 6276
npm run format:check
```

The capture itself checks real backtest completion, the optimization count, summary curves, map,
sensitivity and selection before writing the images. It also rejects loading and outdated states,
horizontal page overflow and a loss-making default hero. Open all six images after regeneration to
review the layout and text. The option tests also run with `npm run test -w @pine/web`.
