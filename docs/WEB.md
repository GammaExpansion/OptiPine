# Web interface design

OptiPine's browser app: a user brings their own Pine Script v5 / v6 strategy, loads market data,
backtests it, and optimizes its inputs, with every calculation on their own machine. The app,
`apps/web`, is built on the packages in this repository; this document describes its design.

The visual reference is the English page of the [market-terminal mock](web-mock-terminal/README.md):
59 boards, cited below by their codes (S1–S10, B1–B17, O1–O8, R1–R12, W1–W6, G1–G5). English is the
reference language; the Chinese boards are its translation. On layout the mock decides; on behavior
this document decides. Repository rules are in [DESIGN.md](DESIGN.md).

## 1. Product

### 1.1 Goals

- Run a strategy entirely in the browser. Scripts, inputs and results never leave the machine; the
  server only fetches public market data.
- Show one strategy run the way TradingView users read it: the price chart with the script's
  plots and trades, the strategy report, equity and the trade list.
- Optimize any of the script's inputs, numeric, boolean or option, with grid or random search and
  three validation modes: none, in-sample / out-of-sample (IS / OOS), and walk-forward.
- Make overfitting visible: out-of-sample results next to in-sample ones, parameter maps,
  sensitivity, neighbourhood means and walk-forward stability.
- Never show a partial or failed run as a result. Compile errors, unsupported features and runtime
  errors are reported with their source line.

### 1.2 Two pages

The header switches between two pages that never mix content:

- **Backtest** is about one fixed parameter set: its chart, report, equity, trades, source and
  issues, with its inputs and properties beside them.
- **Optimize** is about many parameter sets at once: the data range, a summary chart, the
  leaderboard, the parameter map and sensitivity, or the walk-forward windows and stability.

A set picked from the optimization is opened on the Backtest page as a preview (B16), never shown
in full on the Optimize page.

### 1.3 Out of scope for the first version

Accounts, saved workspaces, sharing links, alerts, live ticks, server-side computation and a light
theme.

## 2. Screens

### 2.1 Header and first launch (S1, S2)

The header holds, from left to right: the OptiPine name; the **Backtest** / **Optimize** switch;
the script file name, which opens the script menu; the symbol and provider; a timeframe switch
(15m, 1h, 4h, 1D); the date range; the last run's facts (bar count and duration, or combinations,
duration and failures on the Optimize page); the main action; and the language switch. The
Backtest page's main action is **Run backtest** (Ctrl + Enter); the Optimize page's is **Cancel**
while it runs, as its **Start** sits in the run block (2.4). The timeframe switch and the date
range refetch from the same provider, as a preview to accept (2.2); for CSV data they are
disabled.

**First launch (S1)** shows three steps on the empty workbench: open a script (**Paste code**,
**Open file**), **Select market data**, and run, with **Load example: Trend Breakout, BTCUSDT 1
hour**. Until both a script and data exist, the run action explains what is missing. While an
example's data loads, the data step and the header's data button say "Fetching BTCUSDT 1h", the
step with a progress bar and **Cancel fetch**. When the steps give way to the chart, the focus they
held moves to the page's heading.

**Script menu (S2)** shows the Pine version, input and plot counts and compile time, then **Open
.pine file** (Ctrl + O), **Paste from clipboard and replace**, **Download .pine**, and the example
strategies: Trend Breakout, RSI Reversal and MA Cross. An example loads its source and fetches the
last two years of BTCUSDT 1h through the proxy (4.7). A `.pine` file dropped anywhere on the page
opens like one chosen with **Open .pine file**; any other file is explained, never opened by the
browser in the app's place.

Replacing a script edited since it was opened, by an example, a file, a drop or pasted code, first
asks **Replace the current script?**: the edits will be lost, with **Download .pine**, **Cancel**
and **Replace script**. An unedited or empty script is replaced at once. An opened script starts
from its own input defaults, `strategy()` properties and search ranges; nothing carries over from
the previous one.

### 2.2 Market data (S3–S10)

**Select market data** is a dialog with three tabs: crypto spot and perpetuals (Binance), stocks,
ETFs, indices and forex (Yahoo Finance), and **Upload CSV**.

- **Provider tabs (S3–S6).** Market (spot or USDⓈ-M perpetual), symbol search, timeframe and range
  (1M, 1Y, 2Y, All, Custom). The tab states the provider's limits: up to 100,000 bars per fetch, only
  closed bars, and Yahoo's shorter history for intraday timeframes. A fetch shows a progress bar
  with **Cancel fetch** (S4). For now the bar is simulated, because the data arrives in one
  response: it advances on a timer, slows before the end, and fills when the data arrives. Its label
  gives only the expected count ("Fetching about 20,500 bars"); S4's received count waits for real
  progress (section 7). The preview (S5) shows the bar count, the UTC range, the session (24 × 7 or
  the exchange's sessions), whether the data came from the cache, and the symbol info (tick size,
  point value, minimum order size, timezone), which is editable. For Yahoo, the preview states that
  prices are not adjusted and that the tick size is estimated because Yahoo does not publish trading
  rules (S6).
- **Upload CSV (S7).** Accepts TradingView's "Export chart data" format: `time` in Unix seconds,
  `open`, `high`, `low`, `close` and `Volume`; other columns are ignored. The user sets the symbol,
  timeframe and symbol type, enters the symbol info by hand, and may add a trading calendar JSON
  (not needed for 24 × 7 symbols). A file that fails to parse lists each error with its row and the
  rule it broke, next to the raw lines (S8).
- **Refusals (S9).** A provider error says which provider refused and why, for example HTTP 451
  from Binance in some regions, and offers **Use Yahoo Finance instead** (after a Binance refusal
  that the request itself did not cause), **Upload CSV** and, where trying again can help,
  **Retry**. Data from different providers is never stitched together.

The dataset replaces the current one only on **Use this data**. **Change date range** (S10) offers
the same presets with an estimated bar count and **Fetch again**, which opens the new range in the
market data dialog as a preview to accept.

### 2.3 Backtest page (B1–B17)

**Chart area.** Candles with the script's plots, trade entry and exit markers, and a legend with
OHLC and plot values under the cursor. Plots that are not drawn over the price chart go in a pane
under it (B7); each plot's placement comes from the engine (`PlotOutput.overlay`, section 7).

**Dock** under the chart, with five tabs:

- **Report** (B1): a row of key figures (net profit, max drawdown, profit factor, win rate, trades,
  Sharpe ratio, each with a secondary figure such as the long / short split) over the report in
  three groups, Returns, Trades and Risk, with All, Long and Short columns, and CSV export. Its max
  drawdown is TradingView's intrabar figure, labelled "Max drawdown (intrabar)": the deepest fall
  of intrabar equity below a preceding peak of realized balance.
- **Equity** (B5): key figures (ending equity, annualized return, max drawdown and when it started,
  drawdown duration, return over max drawdown, winning / losing days, best / worst day) over one
  time axis with equity and its max-drawdown period, drawdown, a daily P&L calendar (amount or
  percent) and monthly and yearly returns. These figures are measured on bar-close equity, open
  profit included, from its own running peak, so the max drawdown here is labelled "Max drawdown
  (bar close)" and can differ from the report's.
- **Trades** (B2): closed and open trades, newest first, with #, side, entry and exit time and
  price, quantity, P&L, P&L %, cumulative P&L and bars held, side and P&L filters, and CSV export.
  Hovering a trade marks it on the chart with its details; clicking moves the chart to it (B6).
- **Pine code** (B3): the source with highlighting, each input's current value beside its line,
  and diagnostics by line. The tab can be maximized over the chart (B4). Editing recompiles.
- **Issues**: compile errors, unsupported features, runtime errors, and the ignored effects of the
  latest run of the current source, each with its line; the tab shows the count.

Each tab's code loads on first use; until then the tab says it is loading results. An indicator
has no account: Report and Equity say so instead of an empty report, and the right panel lists no
strategy properties.

**Right panel.** **Inputs** in declaration order with **Reset**: a number field with stepper and
range, a select (declared options, a source, or for `input.timeframe` the chart's timeframe and the
usual ones from 1m to 1M), a toggle, a UTC date and time, or a text field (sessions and strings),
each showing its default when changed (B14). An invalid value is explained under the field. An
input the script computes is read-only with the reason. **Properties** summarizes initial capital,
order size, pyramiding, commission, slippage, script execution and limit order behavior; **All
settings** opens the full strategy properties (B13).

**Strategy properties (B13)** follow the Properties tab of TradingView's strategy dialog in three
groups: General (initial capital, currency, order size and its unit, pyramiding), Detalization and
execution (bar detalization, script execution), and Broker emulator (commission, long and short
leverage, slippage, limit order execution, order delay). Defaults come from the script's
`strategy()` call. An overridden field says so and shows the script's value; **Reset all to script
values** restores them. A setting the engine supports only partly says so under the field: only
the chart currency, and only the default bar detalization of four points per bar. The Optimize page
edits the same properties.

**States.**

- _Running_ (B8): elapsed time and **Cancel** over the previous result.
- _Inputs changed_ (B9): results stay visible, marked outdated. The banner names each changed
  input and property with the value the result used ("Initial capital 10,000"); **Restore result
  settings** puts them back, or **Reset to** that value when only one changed.
- _Compile failed_ (B10): the errors with line and column in the code and in Issues; an unsupported
  feature is explained as missing engine support, not a script bug.
- _Run failed_ (B11): "Run failed, no results" with the line and bar that failed (counted from
  one), **View issues** and **Go to line**. The previous result of the same script stays beneath,
  marked by the header; another script's result is not shown.
- _No trades_ (B12): the chart stays, with a note that the entry conditions never triggered.
- _Panel collapsed_ (B15): the right panel folds to an edge.
- _Previewing a parameter set_ (B16) and _After applying parameters_ (B17): see 3.3.

### 2.4 Optimize page: setup (O1–O8)

**Data range** is a bar above the results showing the dataset's span with the IS and OOS ranges,
or the planned walk-forward windows (O3). Before the first run the results area explains what will
appear there and that single-set details live on the Backtest page.

**Right panel**, top to bottom:

- **Search ranges.** **Grid** or **Random**, then one row per input. A numeric input has from, to
  and step and shows its value count; an option or boolean input shows its values as chips to keep
  or drop, with the full list behind "N more" (O4). A row left with one value fixes that input. When
  the grid exceeds 20,000 combinations the search switches to random sampling, says so, and shows
  the sample count (default 2,000) and seed (O5). A range that cannot be searched is marked on its
  row, and the run is blocked until it is fixed (O6). A new numeric row spans half to twice the
  input's current value within its declared bounds, on its step through that value; a step that
  would list more than 50 values there becomes 2, 5, 10… times itself. Zero and time inputs start
  at their value. New rows are searched in declaration order while the grid stays within 20,000
  combinations, so the first run is a whole grid; a row that would exceed it starts fixed with its
  range filled in (O1). A row keeps its range once it is edited or a run has used it.
- **Validation.** **None**, **IS / OOS** with the OOS share (default 30%), or **Walk-forward** with
  IS months, OOS months, step months, and an IS start that rolls forward or stays anchored
  (defaults 12, 3 and 3, rolling). With None, the panel warns that ranks only measure fit (O2).
- **Ranking and filters.** The objective and direction (O7), grouped as Returns (net profit,
  annualized return, profit factor, average P&L), Risk (max drawdown, Sharpe ratio, Sortino ratio)
  and Robustness (neighbourhood mean, ±1 step); then filter chips such as Trades ≥ 30 and Max DD ≤
  15%, and **+ Condition**. For walk-forward this section is **Per-window selection and filters**.
- **Properties.** A summary with **Edit**, the same properties as on the Backtest page.
- **Run block**, pinned to the bottom: the number of combinations (or backtests, for walk-forward),
  an estimated duration and thread count, and **Start**, which becomes **Re-optimize** after a run.
  During a run it shows progress and **Cancel** (O8).

### 2.5 Optimize page: results (R1–R12)

**Summary chart** with three views:

- **Top 20 equity** (R1): the equity of the 20 best sets in the current ranking and filters, with
  their median and #1 highlighted, over the whole data range with the IS / OOS split marked.
- **IS vs OOS** (R2): one dot per set, in-sample net against out-of-sample net, profit and loss
  coloured, the current page of the leaderboard highlighted.
- **Distribution** (R2b): histograms of net profit for IS and OOS with the count of profitable sets.

With validation None the summary ranks by full-range net and marks the results as unvalidated
(R3). During a run the views fill in as trials finish (O8).

**Leaderboard.** Sets in ranking order, 13 per page, with how many pass the filters. Every searched
input is a column while the width allows; the axis inputs come first and the rest collapse into
"+N" (R4). Then IS and OOS net, profit factor, drawdown and trades. Selecting a row moves the
parameter map to that set and opens the selection bar (3.3).

**Parameter map.** X and Y are any searched inputs, with an optional Z that draws one layer per Z
value (R4). The remaining inputs are slice chips that fix a value, take the maximum, or take the
mean. **IS** / **OOS** switches the surface; **Smooth** replaces each cell with the mean of its ±1
step neighbours in every searched input.

- Cells are square, 16 px with a 2 px gap. The input with more values runs horizontally. An axis
  with more than 24 values, or more than fit, averages adjacent values into one cell and labels the
  axis with ranges.
- Colours come in nine steps assigned by rank, so one extreme set cannot flatten the rest, on a
  ramp from loss to profit. The legend shows the minimum, zero and the maximum. Cells with no
  sampled set are marked as not sampled.
- Hovering a cell lists the values it covers with their IS and OOS results and the mean (R6).
  Clicking a binned cell opens it at full resolution with its values framed and their mean (R7).
- With only one searched input, the map becomes a curve of the objective and its neighbourhood
  mean, marking the range within 90% of the peak (R8).

**Sensitivity.** One row per searched input, sorted by the share of variance it explains
(one-way η²): the share and the mean objective per value with its spread, on one shared scale. The
X and Y rows carry markers; dragging a marker onto another row makes that input the axis, also
with the keyboard: Space to pick up, arrow keys to move, Enter to confirm (R12).

**States.**

- _No combination passes_ (R9): each filter with how many sets pass it alone; a filter nobody passes
  shows the best value reached and **Remove**.
- _Add condition_ (R10): a metric, ≥ or ≤, a value, presets (PF ≥ 1.2, Win rate ≥ 45%, Sharpe ratio
  ≥ 1.0, Avg P&L ≥ 0, Consecutive losses ≤ 6), and a preview of how many more sets it would exclude
  and which ranks on the current page would drop out.
- _Failed combinations_ (R11): failed sets are not ranked. The header counts them; the list gives
  each set's inputs and error (kind, line, bar, message), a **Backtest** action that opens the set
  with its diagnostics in Issues, and **Export list**.
- _Settings changed_ (R5): results stay, marked outdated, with **Re-optimize to update**.

### 2.6 Optimize page: walk-forward (W1–W6)

Each window optimizes on its IS range, picks a set with the current ranking and filters, and runs
that set on the following OOS range.

- **Summary**: stitched OOS equity, WFE (OOS annualized return over IS annualized return) and
  profitable windows. **Stitched** shows one equity curve; **Per window** shows each window as a
  lane with dashed IS equity, solid OOS equity, and the OOS net and running equity at the right
  (W2).
- **Per-window table**: window, OOS range, selected parameters, IS and OOS net, WFE and trades,
  ending in a total row. A window where no set passes the filters stays flat for its OOS range and
  says so with **Adjust**; a shorter final window is marked partial; the total counts profitable
  and flat windows (W5).
- **Fixed parameters for every window**: one set that holds up across all windows, with **Apply to
  inputs**.
- **Stability** / **Window map.** Stability rows show, per input and window, the values within a
  tolerance (default 10%) of that window's best when the other inputs are re-tuned, the chosen value
  as a dot, the common range across windows and a fixed value with its mean loss, for example
  "Common 26–28 · Fixed at 27, mean loss 1.6%". An input whose values are all near-optimal says so.
  The window map shows the selected window's IS surface or the mean over all windows, with each
  window's chosen set circled (W3).
- **Selecting a window** shows its ranges, set and results with **View backtest**.
- **In progress** (W4): finished windows fill the table, the rest wait, and the totals appear when
  every window is done; the run block shows the window, combinations within it, elapsed and
  remaining time, threads and **Cancel**.
- **Anchored** (W6): every window starts IS at the same date.

### 2.7 Layout (G1–G5)

The desktop reference is 1440 × 900. Every gap between panes is a drag handle; dragging shows the
pane size, double-clicking resets it, panes stop at a minimum, and sizes are remembered per page
(G1). The right panel defaults to 336 px. From 768 to 1279 px wide the right panel becomes a drawer
(G2). Below 768 px each page is a single column with tabs: Report, Equity, Trades, Inputs, Code and
Issues on Backtest (G3). On Optimize the summary stays above the tabs Leaderboard, Parameter map,
Sensitivity and Settings, with leaderboard rows as cards, and the selected set's bar below them;
walk-forward results keep the stitched equity above Windows, Stability and Settings, and the
selected window's bar below (G4). The component sheet is G5.

## 3. Behavior

### 3.1 Runs and staleness

- A run is either complete or absent. A cancelled or failed run leaves the previous result in place,
  marked as such; it never shows partial numbers as a result.
- Changing the source, an input, a property or the data marks the backtest outdated (B9).
  Changing search ranges, validation, properties or the data marks optimization results outdated
  (R5). Outdated results stay visible and say what they were computed with; a backtest's can put
  those inputs and properties back (B9).
- The objective, direction and filters only change how results are viewed, so they apply at once
  and never require a re-run. The same holds for map axes, slices, Smooth and the IS / OOS switch.
- Editing the source recompiles it in the background; inputs and properties are rebuilt from the
  new compile, keeping values for inputs whose title and type did not change. Opening another
  script starts it from its own defaults instead (2.1).
- Nothing is saved (4.8), so reloading, going back or closing the tab while a backtest, a preview or
  an optimization runs asks first.

### 3.2 Live optimization

Trials arrive one by one from the Worker pool. They collect in a buffer outside React; the UI takes
a snapshot at most every 250 ms, and the derived views (summary, leaderboard, map, sensitivity) are
recomputed in the analysis Worker, with a newer request replacing a pending one. Nothing renders
per trial. Cancel stops every Worker at once.

### 3.3 Preview and apply

Selecting a leaderboard row or a walk-forward window opens a bar with **View backtest** and
**Apply to inputs**. View backtest opens the Backtest page in a preview (B16): a banner names the
set and says the current inputs are unchanged, with **Back to optimization** and **Set as current
inputs**. Applying (B17) writes the set into the inputs, notes where it came from, and keeps each
input's default visible.

### 3.4 Limits

| Limit                       | Value                      | Source                            |
| --------------------------- | -------------------------- | --------------------------------- |
| Bars per fetch              | 100,000                    | `@pine/market-data`               |
| Feed cache                  | 5 minutes, last 4 datasets | `@pine/market-data`               |
| Grid before random sampling | 20,000 combinations        | This design (O5)                  |
| Random sample count         | 2,000 by default           | This design (O5)                  |
| Values per searched input   | 100,000                    | `@pine/optimizer`                 |
| Leaderboard page            | 13 rows                    | This design (R1)                  |
| Map binning                 | above 24 values per axis   | This design and `@pine/optimizer` |
| Engine steps                | 2,000,000 per bar          | `@pine/engine`                    |

## 4. Architecture

### 4.1 Stack

| Need                               | Choice                                                                                                                                     |
| ---------------------------------- | ------------------------------------------------------------------------------------------------------------------------------------------ |
| UI framework                       | React 19 with TypeScript, built by Vite                                                                                                    |
| App state                          | Zustand stores over framework-free workflow modules (4.3)                                                                                  |
| Panes, dialogs, popovers, menus    | `react-resizable-panels` and Radix UI primitives, styled with the mock's tokens                                                            |
| Leaderboard and trade list         | TanStack Table with TanStack Virtual                                                                                                       |
| Price chart and equity time series | `lightweight-charts` (Apache-2.0)                                                                                                          |
| Parameter map, scatter, histograms | Components of our own: canvas for what updates live (map, scatter), SVG for the rest (histograms, P&L calendar, stability rows, timelines) |
| Pine code tab                      | CodeMirror 6 with a Pine highlighting mode                                                                                                 |
| Fonts                              | Barlow, Noto Sans SC and Source Code Pro, self-hosted with `@fontsource` so the app makes no third-party requests                          |
| Tests                              | Vitest with Testing Library; Playwright for end-to-end smoke tests                                                                         |

React gives the widest choice of mature, accessible components and is familiar to most
contributors. Its weak point, re-rendering under a fast stream of trials, is handled by keeping the
stream outside React (3.2) and drawing the live charts on canvas.

### 4.2 Workspace

The app is the workspace `apps/web` (`@pine/web`). It depends on `@pine/engine`,
`@pine/messages`, `@pine/optimizer`, `@pine/market-data` and `@pine/workers` through their public
exports, and never on `@pine/golden`. The root build adds it last.

```text
apps/web/
├── index.html
├── vite.config.ts        # React plugin; /api/market middleware for dev and preview
├── server/               # production server: built files plus /api/market
├── examples/             # the example strategies' Pine sources and data requests
├── src/
│   ├── main.tsx          # entry and providers
│   ├── shell/            # header, page switch, language switch, shortcuts
│   ├── pages/backtest/   # chart area, dock tabs, inputs and properties
│   ├── pages/optimize/   # data range, summary, leaderboard, map, sensitivity, walk-forward
│   ├── dialogs/          # market data, date range, strategy properties, script menu
│   ├── components/       # design-system primitives (G5)
│   ├── charts/           # price chart, equity, drawdown, map, scatter, histograms, timelines
│   ├── workflows/        # framework-free workflows (4.3), tested in Node
│   ├── state/            # Zustand stores and selectors over workflows/
│   ├── workers/          # Worker entry modules and factories
│   ├── i18n/             # message catalogs and number and date formatting
│   └── styles/           # tokens, base styles, fonts
└── e2e/                  # Playwright tests and recorded provider responses
```

### 4.3 Layering

- `workflows/` holds every rule in section 3 and the computations the screens need beyond the
  packages (equity-tab figures, histogram bins, filter pass counts, the single-input curve's range).
  It has no React and no DOM, talks to Workers through injected factories, and returns plain data,
  so it is tested in Node with fake Workers. It starts inside `apps/web`; it would move to a package
  only if another frontend needed it.
- `state/` holds the Zustand stores. Components read state through selectors and change it through
  store actions that call `workflows/`.
- `components/` and `charts/` are presentational. A chart owns its canvas or `lightweight-charts`
  instance through a ref and updates it directly; React does not reconcile chart content.
- `pages/`, `dialogs/` and `shell/` compose them.
- The main thread never runs the engine or the heavy analysis; Workers do (4.6).
- Components contain no user-facing text; every string comes from the catalogs (section 6).

### 4.4 State

| Store          | Holds                                                                                                                                                                       |
| -------------- | --------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| `workspace`    | Source and file name, the compile result, the dataset and how it was obtained, input values, property overrides                                                             |
| `backtest`     | Run state, the latest result with its equity, whether it is outdated, and the preview set                                                                                   |
| `optimization` | Search ranges, validation, ranking and filters, run progress, the trial buffer and snapshot, view settings (axes, slices, Smooth, surface), selection, walk-forward results |
| `ui`           | Page, dock tab, pane sizes, open dialogs and language                                                                                                                       |

### 4.5 What each panel calls

| Panel                                     | Package calls                                                                                                                                                                                                                                          |
| ----------------------------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------ |
| Compile status, inputs, property defaults | `EngineWorkerClient.describe` → `describe` in `@pine/engine`                                                                                                                                                                                           |
| Chart, report, equity, trades, issues     | `EngineWorkerClient.run` → `runWithEquity`; plot panes from `PlotOutput.overlay`; report rows from `metricRows`                                                                                                                                        |
| Search ranges and combination counts      | `generateSearchSpace`; parameter lists through the analysis job `parameters` (`enumerateGrid`, `sampleRandom`)                                                                                                                                         |
| IS / OOS validation                       | `splitBars`; the pool runs both ranges; an `AnalysisRun` sends each trial once (`runOpen`, `runAppend`), the Worker joins the ranges by trial id, and `runClose` releases a replaced run                                                               |
| Optimization run and progress             | `OptimizationWorkerPool.optimize` with `onTrial` and `onProgress`; `cancel`                                                                                                                                                                            |
| Leaderboard, filters, map, sensitivity    | `runView`: a `summarizeOptimizerAnalysis` summary of the run (ranks, per-set columns, maps, sensitivity, R10's removed ranks), `rankBy: 'neighborhood'` for the neighbourhood mean; `buildBinDetail` for R7; consecutive losses from `tradeStatistics` |
| Top 20 equity                             | `OptimizationWorkerPool.reproduce`, which runs `runWithEquity`, for the 20 leading sets after a run and after a ranking change; a newer request cancels the older one                                                                                  |
| Walk-forward                              | Analysis jobs `plan` (bounds and bar indices from bar times), `choose`, `finalize` and `stability`; the pool optimizes each window and reproduces each chosen set                                                                                      |
| Market data                               | `FeedClient`, `FeedImportSession`, `parseCsv`, `parseRunMetadata`, `parseSessionCalendar`, `createSymbolProfile`                                                                                                                                       |
| Errors                                    | Coded errors and `errorText` from `@pine/messages`, translated by the catalogs                                                                                                                                                                         |

The top-20 view needs equity per set, and optimization trials carry only metrics. `runWithEquity`
returns one equity value per bar with metrics identical to the sweep's, at about 10% more time than
`run` (333 ms against 305 ms on a 20,488-bar fixture). Rerunning 20 sets therefore costs about 20
single runs spread over the pool, a second or two at typical sizes.

### 4.6 Workers

`src/workers/` holds two entry modules, `serveEngineWorker(self)` and `serveAnalysisWorker(self)`,
and factories that create them with `new Worker(new URL(…, import.meta.url), { type: 'module' })`.
The app keeps one `EngineWorkerClient` for describe and backtests, one `OptimizationWorkerPool`
(one Worker per CPU thread minus one) and one `AnalysisWorkerClient`. Editing the source raises the
source revision, which discards late replies. Cancel terminates Workers and is available whenever
something runs.

A walk-forward run plans the windows, then for each window optimizes its IS range, chooses a set
with the current ranking, filters and smoothing, reproduces that set on the IS range (its metrics
must equal the sweep's) and on the OOS range, and finally assembles the stitched result and
stability. Changing the stability tolerance recomputes only the stability.

### 4.7 Market data and serving

Provider data goes through the `/api/market` middleware from `@pine/market-data/proxy`. In
development and preview a Vite plugin mounts it; in production `server/` serves the built app and
the middleware on `127.0.0.1:5174` (`PORT` and `HOST` override). Without the middleware, as on a
static host, CSV upload still works and the provider tabs say the data service is unavailable.

The example strategies are new Pine sources written for the app, stored in `examples/`. Each runs
on BTCUSDT 1h from Binance spot over the two years ending now: the range ends at the current time
rounded down to the hour, so the last bar is the latest closed one, and starts two years earlier,
about 17,500 bars. The feed cache is keyed by both ends of the range, so loading an example again
within the same hour reuses the cached data, and later loads fetch the newer range; example results
change as new bars close. Examples fetch through the proxy like any other request. Without the data
service, the example's source still loads and the market data dialog opens with the provider tabs
marked unavailable, leaving **Upload CSV**.

### 4.8 Persistence

Local storage keeps the language, pane sizes and the last data selection (provider, symbol,
timeframe, range). IndexedDB keeps the feed cache. Scripts, results and optimization runs are not
saved in the first version.

### 4.9 Performance

Measured with `runWithEquity` over the 43 v6 strategy fixtures on a 16-thread desktop CPU, one run
takes about 0.2 s per 10,000 bars at the median and 0.35 s at the 90th percentile; real scripts can
be heavier. The pool measures the first trial to estimate the run's duration (O1, O8). While a run
streams, main-thread work stays under 50 ms per frame: tables are virtualized, live charts draw on
canvas, and derived views are computed in the analysis Worker. The Worker keeps each run's trials,
so a snapshot sends only the trials that arrived since the last one and receives a summary: at
20,000 IS / OOS sets of 170 metrics each, a snapshot costs the page about 9 ms with 500 new trials
and 5 ms to build the views, where sending every trial and receiving them back took 2.2 s
(`packages/workers/bench/live-analysis.ts`).

## 5. Visual system

**Tokens** come from the component sheet (G5) and become CSS custom properties.

| Role                           | Colour    |
| ------------------------------ | --------- |
| Canvas                         | `#0e1013` |
| Panel                          | `#14171b` |
| Fields                         | `#0f1215` |
| Menus, hover                   | `#1b1f24` |
| Dividers                       | `#23272d` |
| Control borders                | `#2f353c` |
| Body text                      | `#e8eaed` |
| Secondary text                 | `#aab1b9` |
| Captions                       | `#7f8790` |
| Primary action, selection, OOS | `#f2a33a` |
| IS                             | `#6cb6dd` |
| Profit, long                   | `#3fbf8a` |
| Loss, short, error             | `#f06a5d` |
| Script main plot               | `#2bb3a3` |
| Unsupported, indicator pane    | `#8fb8de` |

**Type.** Barlow, with Noto Sans SC for Chinese text and Source Code Pro for numbers and code: 22 /
600 for key figures, 15 / 600 for dialog titles and empty states, 13 / 600 for section titles, 13 /
400 for body text and controls, 12 for captions. The first version is dark only.

**Components.** G5 defines the primitives: segmented controls, primary and secondary buttons, icon
buttons, dock tabs, chips, number fields with steppers, selects, toggles, tables, popovers,
dialogs, toasts and empty states. Each is one React component with a CSS module, and every
interactive one works with the keyboard.

## 6. Language

English is the reference: the English boards define the copy, and the Chinese boards are its
translation. The app ships both. The language switch defaults to the browser's language (Chinese
for any `zh-*` locale, otherwise English) and remembers the choice.

- Every user-facing string lives in a catalog keyed by message id, with English and Chinese
  entries; components hold no copy, and a test fails on user-facing text outside the catalogs.
- Package errors arrive as message ids with values. A test checks that both catalogs cover
  `optimizerMessageIds`, `marketDataMessageIds` and `workerMessageIds`.
- Report metrics and strategy properties use TradingView's English names in both languages.
- Pine source, symbols, the script's own input names and numbers are never translated; numbers
  are formatted the same way in both languages.
- English copy prefers short forms where space is tight, as the mock does: IS / OOS, combos,
  Max DD, PF, Win rate.

## 7. Engine and package changes

- **Plot panes.** Done with this design: every `PlotOutput` from the engine now has `overlay`, true
  when the script declares `overlay = true` or the plot call sets `force_overlay = true`. The chart
  puts the other plots in a pane under the price (B7).
- **Top 20 equity.** No change needed (4.5).
- **Fetch progress.** Not needed yet: the fetch indicator is simulated (2.2). S4's received count
  needs real progress, which `FeedClient.load` cannot report because it returns the whole dataset at
  once; `@pine/market-data` could fetch long ranges in slices through the proxy and merge them in
  the client.

## 8. Testing

- `workflows/` and `i18n/` have Node unit tests, with Workers replaced by fake transports as in the
  package tests.
- Components and pages have Vitest tests with Testing Library for behavior: outdated results,
  filters that apply without a re-run, preview and apply, every error state, and both languages.
- Playwright tests load each page against recorded Binance and Yahoo responses, run a backtest and
  a small optimization, and check that no console errors appear. They fix the clock, so an example
  requests the same range as its recording.
- Layout is checked against the mock at 1440 × 900, 1024 × 768 and 390 × 844 in both languages: no
  clipped labels and no horizontal page scroll.

## 9. Delivery phases

1. **Scaffold**: the workspace, Vite and React, tokens and fonts, the shell with page and language
   switches and resizable panes, the Workers, the catalogs, and CI.
2. **Backtest**: market data and CSV import, the script menu and examples, the chart, the dock
   tabs, inputs and properties, and every Backtest state.
3. **Optimize without walk-forward**: setup, run block, summary, leaderboard, filters, parameter
   map, sensitivity, preview and apply.
4. **Walk-forward**.
5. **Tablet and phone layouts**, then polish: export, shortcuts, empty states.

## 10. Open points

None at present. Real fetch progress is deferred; section 7 notes what it would need.
