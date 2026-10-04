# @pine/web

The browser app described in [WEB.md](../../docs/WEB.md): the Backtest and Optimize pages over
framework-free workflows (`src/workflows/`), Zustand stores (`src/state/`) and the packages'
Workers, in English and Chinese, from desktop to phone widths. `Shell` opens Optimize once there
are a script and data; its `canOptimize` prop overrides that for the test harness.

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
The test setup owns and closes the production, preview and dev servers directly, avoiding
platform-specific shell process cleanup. They listen on three consecutive ports from
`E2E_BASE_PORT` (production, preview, dev), 5174–5176 by default; set another base from 1024 to
65533, as in `E2E_BASE_PORT=6174 npm run e2e -w @pine/web`, to run suites in several worktrees at
once. `e2e/ports.ts` gives the specs their origins.

`src/i18n/translate.ts` is framework-free: use `translate` for `Text`, `translateId` for app ids,
and `translateError` for errors carrying `errorText`. Unknown ids retain package fallbacks. Number
formatting is always en-US; dates use UTC and take a Date or milliseconds, so convert engine Unix
seconds before calling `formatDate`. Components use `I18nProvider` and `useI18n`. The AST test scans
all `src/**/*.tsx` for literal JSX copy and accessible text attributes.

Each language's catalog is a chunk of its own. An app entry awaits `loadActiveCatalog()` (the stored
or browser language) before its first render, and `I18nProvider` fetches the other catalog the
first time the language switches to it, keeping the current language on screen until it arrives.
Tests and the dev pages import `src/i18n/catalogs.ts`, which registers both; the app's keys stay in
`en.ts` and `zh.ts`, the component sheet's in `sheet-en.ts` and `sheet-zh.ts`.

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
the stitched equity above Windows, Stability and Settings, and a tab of the other kind opens its
counterpart (Leaderboard and Windows; Parameter map or Sensitivity and Stability). The
leaderboard uses the same 13-set pages as the desktop table, displaying all searched inputs in
declaration order at the run's step precision. The selection and preview actions, including the
window bar's, have 44 px targets. The summary's view switch and the selection actions each get
their own row so both languages fit. The B16 banner adds to the phone chart's height, leaving its
result tabs unobstructed.
`e2e/phone-optimize.spec.ts` runs 18 combinations through the real Worker pool in both languages
at 390 × 844, checks charts, cards, paging and preview/Back, and writes G4/B16 screenshots and an
overflow report for the other phone tabs, which must list no clipped text, to `test-results/`.
