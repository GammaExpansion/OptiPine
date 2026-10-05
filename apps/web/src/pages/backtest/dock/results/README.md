# Backtest results

`ReportTab.tsx`, `EquityTab.tsx` and `TradesTab.tsx` read the displayed run through Backtest store
selectors. `model.ts` caches the existing `strategyReport`, `equitySummary` and `tradeRows`
outputs by immutable result. A preview replaces the main result, including while it has no result.
Result selection uses the chart area's `shownResult`, including hiding obsolete output after a failed compile.
Figures always use the result's dataset and initial capital, even after current settings change.
The workflow keeps the previous complete result through cancellation and failure; the tabs follow
that contract and never show partial output.

`formatting.ts` only controls presentation: en-US grouping, the Unicode minus, fixed decimals,
units, zero signs and missing-value dashes. It returns catalog messages. Report labels use the
English and Chinese boards' short metric names in their respective languages, per WEB.md section 6. Only net profit and
open P&L get profit/loss colors in the report, as in B1. `ResultFrame` shows the B9 amber notice,
dims retained figures and calls the existing restore-inputs action. A single changed input shows
“Reset to {value}” using the result's input value; several changes use the generic restore action.
Retained figures also dim during a run (B8).

Trades uses TanStack Table 8 and TanStack Virtual 3. Thirty-pixel rows, eight overscan rows on each
side and a sticky header bound the mounted DOM. The grid owns keyboard focus: arrows select,
Home/End jump, Enter focuses the selected trade. Hover, leave, scroll, filtering and unmount update
the shared selection store. A new row collection clears the local selection and scroll position.
Side and P&L filters call `filterTrades`; export downloads the filtered list using `tradesCsv`,
stable English headers and sides, and a UTF-8 BOM for spreadsheet applications. Prices/P&L use two
decimals, quantities four, matching B2. CSV retains workflow precision.

## Visual review and integration

Reviewed B1, B2, B5 and B6 at 1440 × 900 in English and Chinese, with the app's local fonts on
both the reference and implementation. The browser tests save each screen and all eight reference
boards under `apps/web/test-results/`. Report/table labels fit their cells and the page has no
horizontal overflow. Smaller widths use stacked report groups and contained table scrolling.

Differences and remaining integration points:

- Synthetic engine results naturally differ from the boards' sample values and curves. The
  Report's six figures, three groups, signs, colors and spacing follow B1. Chinese metric labels
  follow the Chinese reference; the drawdown label adds “盘中” to distinguish it from Equity's “收盘”.
- The real price chart and right panel are integrated. B6 checks amber canvas marks on hover,
  clearing hover, focus and scrolling to the oldest trade outside the initial recent window. B9
  checks one dock notice, dimmed results, the header status and the input's changed dot together.
  Header market-data controls remain the data task's integration point.
- Report and Trades render their download icons through `DockActions`, before maximize/collapse
  in the dock bar. B2 has no second download icon in its filter row. Trades exports the current
  filtered list; Report exports the displayed run, including an outdated or preview result.
  The portal follows the active tab and disappears while the dock is collapsed. The Trades tab
  count is the integrated dock's count of closed trades.
- Equity composes its facts into `EquityCharts.afterToolbar`, matching B5's toolbar/facts/charts
  order. Flexible equity/drawdown panes fill the remaining height without vertical scrolling at
  1440 × 900. The full range is applied after measuring both panes, including initially hidden or
  zero-width mounts. Resize fits the full range until the user changes it; then it preserves that
  view through resize, units, language and tab switches. A new result fits again. Equity enables
  attribution when maximized; the integrated PriceChart supplies it otherwise. The shared dock
  still owns maximize/restore; the chart toolbar's corner control resets zoom.
- `workflows/report.ts` now exports `reportCsv(report, headers)`. `ReportCsvHeaders` supplies the
  four column headers (`metric`, `all`, `long`, `short`) and four section titles (`keyFigures`,
  `returns`, `trades`, `risk`). Canonical engine metric names stay English. Secondary key figures
  are separate metric rows, except side breakdowns in Long/Short. Percentages carry `%`, loss
  magnitudes print negative, absent/nonfinite cells stay empty, and CSV quoting/precision use the
  shared helpers. `reportExport` and `tradeExport` supply stable English schemas independently of
  the UI catalogs; both downloads include a UTF-8 BOM and retain English filenames.

## Loading and bundle review

`Dock.tsx` loads each tab lazily. Report, Equity and Trades load only once a displayed result exists;
`EmptyResults` keeps S1 and empty previews free of charts, TanStack and engine reporting imports.
Code and Issues load when selected. Their loading boundary leaves an empty area while importing.

Production builds before and after integration, in decimal kB of minified JavaScript:

| Measure                          |   Before |  After |
| -------------------------------- | -------: | -----: |
| Index chunk                      |   641.42 | 306.56 |
| Entry plus module preloads       |   855.31 | 564.64 |
| Full default S1 browser requests | 1,155.70 | 868.27 |

Entry/preload JavaScript stays close to the roughly 562 kB reference budget. S1 defaults to Pine code,
so the actual browser also loads the existing 300.40 kB CodeMirror editor. These measurements count
that separately and exclude CSS/fonts/Workers. After splitting, Report is 1.99 kB, Equity 12.19 kB
and Trades 75.93 kB, plus shared lazy chunks (including the 185.92 kB chart library). The production
browser regression checks both budgets and confirms empty result tabs do not fetch result chunks.

## Verification

From the repository root:

```sh
npm run build
npm run typecheck --workspaces
npm run test --workspace @pine/web
npm run format:check
npm run e2e --workspace @pine/web
```

The adjacent Vitest tests exercise formatting, missing values, zero trades, both languages,
preview selection, outdated inputs and restoration, filtering, stable English CSV, resource cleanup,
and row hover/click/keyboard actions. `e2e/results.spec.ts` installs deterministic synthetic bars
through the stores on the suite's dev server, fixes wall-clock time, runs the actual engine Worker,
and blocks market/external requests. It checks all tabs, Amount/Percent, maximize/restore, filtered
both dock CSV downloads, B6 chart hover/focus, integrated B9/B12 and 10,000 actual engine trades. The performance test scrolls across all
10,000 rows, records long tasks (50 ms or more), checks a bounded DOM and keyboard navigation to
both ends. Its `scroll-performance.json` is saved with the screenshots.

The Equity regression loads and automatically backtests Trend Breakout with `loadExample` on the
dev server. `/api/market` is intercepted by `e2e/market-fixtures.ts` with the app's recorded BTCUSDT hourly responses;
external requests remain blocked. The clock is fixed at 2026-10-03 14:37 UTC, giving 17,520 bars from
2024-10-03 14:00 through 2026-10-03 13:00 UTC. In both languages it checks 731 daily cells, 25 monthly
values (24 labels fit; the final three-day month is hidden),
toolbar/facts order, no scrolling, hidden/zero-width initialization, resizing, shared zoom,
unit/language/tab persistence, reset, and fitting a new run. Fresh `equity-example-en.png` and
`equity-example-zh.png` show that actual example run; its values differ from the B5 sample.
Node tests next to the report workflow cover CSV sections, secondary figures, supplied headers,
English metric names, escaping, percentage/loss formatting and missing values.
