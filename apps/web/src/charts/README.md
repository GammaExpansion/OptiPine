# Backtest charts

`PriceChart.tsx` takes immutable `bars`, engine `plots`, workflow `trades: TradeRow[]`, `symbol`,
`timezone`, optional `mintick` and `hoveredTrade`. Give its parent a height (minimum 240 px).
An `I18nProvider` and the shared style tokens are required. Keep result arrays stable between renders:
one `setData` call per series loads a result, while pointer movement, trade hover and focus update the
chart directly. React never reconciles candles, plot points, calendar cells or monthly labels.

```tsx
const chart = useRef<PriceChartHandle>(null);
// A Trades row click:
chart.current?.focusTrade(row);
// Clear the focus or restore the initial 150-bar window:
chart.current?.focusTrade(null);
chart.current?.resetView();
```

`EquityCharts.tsx` takes `input: EquityInput` and its non-null `summary: EquitySummary` from
`equitySummary(input)`. It renders the legend/units toolbar and charts, without the page's facts row.
Both lightweight-charts instances share logical ranges and crosshairs. The SVG calendar and monthly
returns project onto the same bar axis, including interpolated nontrading days. Changing units retains
the visible range. `CalendarStrip` and `MonthlyReturns` can also be imported separately; their handles
accept a `CalendarViewport` with the parent chart's width and calendar-day projection.

## Rendering decisions

- Declared engine colours (including alpha, per-bar colours and invisible `na`) take precedence.
  Without a declared colour, plot order selects `#2bb3a3`, `#8fb8de`, `#b59bd5`, `#d9c38c`, `#6cb6dd`, `#f2a33a`,
  then repeats. Boolean plots consume a palette slot too. All non-overlay plots share one lower pane;
  `force_overlay` is already resolved by the engine's `overlay` flag.
- `style.kind` distinguishes numeric plots, shapes and characters even with all-null values.
  Shapes use their declared triangle, arrow, circle, square, diamond, cross, xcross, flag or label;
  characters/text are rendered verbatim as script data. Relative markers anchor above the high or
  below the low, `absolute` uses the numeric value (including zero), and `top`/`bottom` use pane edges.
  Separate-pane relative markers use an independent hidden price scale; absolute markers share the
  plot scale. Size maps to fixed pixel glyphs. Only visible markers are drawn by a canvas primitive.
  Relative signals near a trade marker move outward by 24 px to clear its label; autoscaling reserves
  the glyph margin so a signal at the highest or lowest bar is not clipped.
  Missing shape/location metadata retains the circle/above-bar fallback; missing characters draw no
  invented glyph. Shape/character plots are omitted from the legend. Legacy boolean values become
  circles only where strictly true. A legacy all-null plot is an
  empty numeric series until a result reveals its value type. Numeric nonfinite/null values reserve
  whitespace and hide the outgoing line segment so Lightweight Charts does not bridge gaps.
- Lines use the declared width and steplines use stepped interpolation. Area/areabr use AreaSeries;
  histogram and columns use HistogramSeries (both use the library's bar-spacing-based column width).
  Circles use LineSeries point markers without connecting lines, while crosses use numeric glyphs.
  Line/area variants retain the existing no-gap-bridging rule. Per-bar colours also update the legend.
- Candle bodies are hollow green and solid red, as in B1. Long/short entries use green/red arrows;
  exits use circles. Dashed trade spans show percentage P&L. A focused or hovered trade has outlined
  endpoints and an amber span; details stay at the upper right to remain readable near either edge.
- Calendar weeks start Monday. Missing days remain neutral. Intensity scales to the largest absolute
  daily value in the selected unit. Monthly/yearly returns come unchanged from the workflow. Very
  narrow monthly labels are hidden to prevent overlap; each rendered label retains a native tooltip.
- Real UTC instants stay on the chart axis. Only displayed labels use the symbol's IANA timezone,
  avoiding duplicate timestamps during a daylight-saving fold. All financial numbers use en-US.
  Price ticks use only the decimals needed by their grid; last-price, crosshair, OHLC and trade prices
  retain mintick precision. Equity ticks use grouping; drawdown ticks use compact thousands at 1,000
  and above, retaining enough precision to distinguish adjacent ticks.
- Adjacent price/indicator scales show ticks only when the entire label fits inside its pane.
  The lower pane uses 10% top/bottom margins and otherwise autoscales to its data, without special
  cases or fixed bounds for RSI.
- Lightweight Charts is Apache-2.0. Show exactly one built-in TradingView attribution logo per
  screen, with no separate attribution rows. `PriceChart` always shows it. When mounting equity
  alongside price, pass `showAttribution={false}` to `EquityCharts`. If price is not mounted, omit
  that prop (it defaults to `true`) or set it to `true`, so equity supplies the link. Drawdown never
  shows a logo. The official notice is: “TradingView Lightweight Charts™ —
  Copyright (с) 2025 TradingView, Inc. https://www.tradingview.com/”.

## Dev page and verification

From the root, run `npm run dev --workspace @pine/web` and open `/charts.html`. It is a separate Vite
HTML page, included in the e2e build but absent from the production build inputs and output. The page uses the real engine Worker
on 20,496 deterministic hourly bars, with a 100,000-bar option, trade hover/focus and both languages.
Use `/charts.html?view=equity` to verify the equity-only attribution fallback.

`examples.ts` loads the shared Pine sources by the filenames declared in `apps/web/examples/index.ts`.
Trend Breakout exercises overlay lines and long/short trades. RSI Reversal is long-only, with RSI,
Oversold and Exit level in the lower pane and Buy/Sell `force_overlay` markers on the price chart.

```sh
npm run build
npm run typecheck --workspaces
npm run test --workspace @pine/web
npm run format:check
npm run e2e --workspace @pine/web
```

The chart checks run from `e2e/charts.spec.ts` in the main Playwright suite against the bundled e2e
build on port 5175. The suite uses the existing server setup, writes screenshots under
`apps/web/test-results/`, and checks real canvas pixels, calendar density, crosshair/range sync,
keyboard interaction, B6 focus, B7 panes, both languages and 100,000-bar focus latency. Unit tests
cover mapping, gaps, palette order, markers, dates, calendar/month buckets, SVG interaction, overlay
culling, price formatting and the real shared examples on deterministic synthetic bars.

## Visual review at 1440 × 900

Compared with `Main-en`, `B5-en`, `B6-en` and `B7-en`:

- The dev workbench keeps the 48 px header, 430 px price region and 336 px sidebar. It substitutes
  dev controls for page inputs/properties, shows Equity beneath price, and omits the page-owned facts,
  report and trades table. B5's chart stack is therefore 50 px higher, without its facts row.
- Synthetic curves, fills, OHLC and performance naturally differ. Trend Breakout's bands are Pine
  grey and its two-pixel basis is Pine teal. RSI Reversal's Buy/Sell signals are lime/red triangles,
  below/above their bars. Its RSI line follows the script's teal rather than B7's blue. Explicit trade
  exit circles remain additional to the mock. Pine glyphs are drawn locally, not TradingView sprites.
- Lightweight Charts chooses its own tick spacing. Its shared time axis sits below the indicator
  pane; B7 draws price dates above the pane. Pane heights preserve the approximate 3:1 price/indicator
  ratio, with space for the legend. RSI-specific background bands are not fabricated from plot names.
- B6 details are anchored at the upper right instead of next to the pointer. The selected span is
  amber with outlined endpoints. A single TradingView attribution logo appears inside the price chart
  (or equity when price is absent).

These are renderer/data/ownership differences; the charts do not change workflow calculations.
