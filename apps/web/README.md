# @pine/web

The browser app described in [WEB.md](../../docs/WEB.md): the Backtest and Optimize pages over
framework-free workflows (`src/workflows/`), Zustand stores (`src/state/`) and the packages'
Workers, in English and Chinese, from desktop to phone widths. `Shell` opens Optimize once there
are a script and data; its `canOptimize` prop overrides that for the test harness.

**Load example** on first launch, or an example in the script menu, loads its source and market
data and automatically runs the backtest. Both use the Run button's action after compilation;
superseded loads and unavailable or refused data never trigger a run.

Optimize starts with validation **None** (unvalidated, full range), **Smooth** on (the mean of
±1-step neighbours), and filters **Trades ≥ 5** and **Max DD ≤ 35%**. Users can change each setting;
IS / OOS and walk-forward are explicit validation choices.
Optimization **Profit** includes closed and open P&L at the range end; smoothing averages those
marked-to-market amounts. The Backtest report retains closed-trade **Net profit**.

From the repository root, after installing dependencies and building packages:

```sh
npm run dev -w @pine/web
npm run build -w @pine/web
npm run preview -w @pine/web
npm run start -w @pine/web
npm run typecheck -w @pine/web
npm run test -w @pine/web
npx playwright install chromium
npm run e2e -w @pine/web
```

**Demo build.** Run `npm run build:demo -w @pine/web` to write the static `demo-dist/` bundle.
Serve it with `npm run preview -w @pine/web -- --mode demo --port 6204 --strictPort`, then open
`http://127.0.0.1:6204/OptiPine/`. Binance spot search and examples fetch directly from the public
Binance host; CSV, backtests and optimization run locally. Yahoo Finance and USDⓈ-M perpetuals
require the self-hosted server (`npm run start -w @pine/web`). There is no bundled or offline
market data. The demo client reuses `FeedClient`'s validation and five-minute `FeedCache` through
an in-memory transport; its provider module loads on demand and is eliminated from normal builds.
The page switches use local state rather than URL routes, so no SPA `404.html` is needed.

Production serves `dist/` on `127.0.0.1:5174`, with `HOST` and `PORT` overrides; `preview` uses the
same port. Vite development, preview and production preserve the complete `/api/market` request
path for the package middleware. All fonts are local assets. No scripts or results are persisted:
`optipine.ui` stores only the language and pane sizes, `optipine.marketSelection` the last accepted
provider selection, and the feed client caches datasets in IndexedDB for five minutes. Pane sizes
are pixels, scoped by page; double-clicking a separator resets its pane. Dock selection and open
dialogs are session state.
The market-data dialog loads `state/marketDataDialog.ts` with its own chunk. Its actions own the
remembered selection's existing plain JSON format and bridge `workflows/symbol-search.ts`, which
debounces queries for 180 ms, aborts superseded searches and ignores late replies. The shared
market-data store still owns dataset preview and acceptance; only acceptance from the dialog saves
its provider selection.
Desktop minimum sizes are 600 px for the main column, 280 px for the right panel, 240 px for the
chart and 160 px for the dock. The right panel folds to a 32 px edge; the dock folds to its 36 px
tab bar. These minimums and the edge width are choices where the design gives no numbers.

The test command runs Node and Vitest sequentially even when Node fails, and fails if either suite
fails. The Node test launcher expands script, workflow, i18n and example test globs with `node:fs`,
tolerating missing directories. Vitest covers the rest of `src/` (components, pages, dialogs, charts, stores
and the component sheet) and the Node server. Playwright builds the production app plus a separate
`.e2e-dist` build with `e2e/harness.html`, `sheet.html` and `charts.html`, the chart workbench in
`src/charts-dev/`. The harness imports the real Worker factories and clients, checks describe/run,
analysis and optimization, and renders the shell with Optimize enabled; its `backtestHooks` and
`optimizeHooks` load a script and synthetic data for the layout tests. The component sheet covers
keyboard behavior, both languages at three viewport sizes, and G5 layout comparisons using the
same self-hosted fonts. None of the test entries is in `dist/`.
The other specs cover data, backtests, results, the keyboard, Optimize and walk-forward, and axe
accessibility scans (`e2e/a11y.spec.ts`); the data, results, keyboard and accessibility specs use
the recorded provider responses in `e2e/fixtures/market/` with a fixed clock.
The test setup owns and closes the production, preview, dev and demo servers directly, avoiding
platform-specific shell process cleanup. They listen on four consecutive ports from
`E2E_BASE_PORT` (production, preview, dev, demo), 5174–5177 by default; set another base from 1024 to
65532, as in `E2E_BASE_PORT=6174 npm run e2e -w @pine/web -- --workers=2`, to run suites in several
worktrees at once. `e2e/ports.ts` gives the specs their origins. The `demo` project serves the real
`demo-dist/` build under `/OptiPine/`, intercepts the Binance host with the recorded market fixtures,
and checks the live-data workflow, CSV, both languages, licenses, assets and absence of proxy calls.

`src/i18n/translate.ts` is framework-free: use `translate` for `Text`, `translateId` for app ids,
and `translateError` for errors carrying `errorText`. Unknown ids retain package fallbacks. Number
formatting is always en-US; dates use UTC and take a Date or milliseconds, so convert engine Unix
seconds before calling `formatDate`. Components use `I18nProvider` and `useI18n`. The AST test scans
all `src/**/*.tsx` for literal JSX copy and accessible text attributes.

`en.ts` and `zh.ts` are the core catalogs: shell, Backtest, first launch and shared copy. An app
entry awaits `loadActiveCatalog()` before its first render. Each lazy area has an English and a
Chinese catalog: `optimize` (setup, results and walk-forward), `data` (market data, CSV and date
range), `script` (dialogs and menu), `properties`, `sheet` (including the chart workbench's dev
copy) and `licenses`. Shared ids stay in core even when their prefix names an area. Package
messages live with the area that displays them;
shared engine and feed failures remain in core for Backtest and loading an example.

Use `lazyWithCatalog(area, factory)` at a lazy UI boundary to fetch its chunk and active-language
copy together and suspend until both are ready. Its `preload(language)` supports menu prefetch.
`I18nProvider` keeps the shown language until core and every requested area's replacement catalog
arrive, including an area opened during the switch. Loaded catalogs are cached per language and
area; failed catalog loads can retry. The sheet entry uses the same loader for its own copy and
the Optimize controls it demonstrates. Tests alone import the eager `src/i18n/catalogs.ts`
aggregate. `MessageId` spans all areas via type-only imports; parity, placeholders and unique
ownership are checked in `catalogs.test.ts`, and `source-copy.test.ts` guards component copy.

Visual review at 1440 × 900: S1 follows the reference's 48 px header, 430 px chart, 36 px dock bar
and 336 px sidebar, with a sidebar collapse control revealed on hover or keyboard focus. The smoke
tests write S1 and O1 screenshots in both languages under `test-results/`; their O1 is the harness
with no script loaded, so its search rows, dataset dates and timing are empty and Start is
disabled.

The layout follows the window (WEB.md 2.7; `src/shell/layout.ts` and `useLayout`): the desktop
panes from 1280 px (G1); from 768 to 1279 px the right panel as a drawer the header's toggle
opens, with a condensed header (G2); below 768 px one column with tabs, where Inputs on the
Backtest page and Settings on the Optimize page hold the right panel (G3, G4). `e2e/layout.spec.ts`
checks S1, B1, O1, R1 and W1 (each of its phone tabs too) at 1440 × 900, 1024 × 768 and
390 × 844 in both languages for cut labels and page scroll, and drives the drawer and the phone
tabs.

The phone's Optimize results keep the summary above four tabs (G4); walk-forward results keep
the equity summary, initially Per window, above Windows, Stability and Settings. Both desktop and
phone can switch to Stitched and back. A tab of the other kind opens its counterpart (Leaderboard
and Windows; Parameter map or Sensitivity and Stability). The
leaderboard fits each page to its measured card height, displaying all searched inputs in
declaration order at the run's step precision. Desktop rows use the table's measured height.
Both share one capacity setting, updated after resizing settles, and preserve the selected or
leading set; see the [leaderboard README](src/pages/optimize/leaderboard/README.md).
The selection and preview actions, including the window bar's, have 44 px targets. The summary's
view switch and the selection actions each get
their own row so both languages fit. The B16 banner adds to the phone chart's height, leaving its
result tabs unobstructed.
`e2e/phone-optimize.spec.ts` runs 18 combinations through the real Worker pool in both languages
at 390 × 844, checks charts, cards, paging and preview/Back, and writes G4/B16 screenshots and an
overflow report for the other phone tabs, which must list no clipped text, to `test-results/`.
