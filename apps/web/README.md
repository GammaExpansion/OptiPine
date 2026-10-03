# @pine/web

Phase 1 of [WEB.md](../../docs/WEB.md): the dark desktop shell, English and Chinese catalogs,
persistent UI preferences, resizable panes, market proxy and Worker adapters. Loading scripts,
choosing data and running from the UI are inert until the workflows are connected. `Shell` accepts
`canOptimize` from the future workspace; its default blocks Optimize while the workspace is empty.

From the repository root, after installing dependencies and building packages:

```sh
npm run dev -w @pine/web
npm run build -w @pine/web
npm run start -w @pine/web
npm run typecheck -w @pine/web
npm run test -w @pine/web
npx playwright install chromium
npm run e2e -w @pine/web
```

Production serves `dist/` on `127.0.0.1:5174`, with `HOST` and `PORT` overrides. Vite development,
preview and production preserve the complete `/api/market` request path for the package middleware.
All fonts are local assets. No scripts, data or results are persisted; `optipine.ui` stores only the
language and pane sizes. Pane sizes are pixels, scoped by page; double-clicking a separator resets
its pane. Dock selection and open dialogs are session state.
Desktop minimum sizes are 600 px for the main column, 280 px for the right panel, 240 px for the
chart and 160 px for the dock. The right panel folds to a 32 px edge; the dock folds to its 36 px
tab bar. These minimums and the edge width are scaffold choices where the design gives no numbers.

The Node test launcher expands workflows, i18n and example test globs with `node:fs`, tolerating
missing directories. Vitest covers shell and store behavior and the Node server. Playwright builds
the production app plus a separate `.e2e-dist` build with `e2e/harness.html`. That entry imports the
real Worker factories and clients, checks describe/run, analysis and optimization, and renders the
shell with Optimize enabled for layout tests. Neither the entry nor its promise is in `dist/`.
The test setup owns and closes the production, preview and dev servers on ports 5174–5176 directly,
avoiding platform-specific shell process cleanup.

`src/i18n/translate.ts` is framework-free: use `translate` for `Text`, `translateId` for app ids,
and `translateError` for errors carrying `errorText`. Unknown ids retain package fallbacks. Number
formatting is always en-US; dates use UTC and take a Date or milliseconds, so convert engine Unix
seconds before calling `formatDate`. Components use `I18nProvider` and `useI18n`. The AST test scans
all `src/**/*.tsx` for literal JSX copy and accessible text attributes.

Visual review at 1440 × 900: S1 follows the reference's 48 px header, 430 px chart, 36 px dock bar
and 336 px sidebar, with a sidebar collapse control revealed on hover or keyboard focus. O1 uses
the same empty-results area and sidebar sections, but leaves the absent script's search rows,
dataset dates, filters, property values, combination count and timing unpopulated. Its Start action
is disabled. Full tablet and phone arrangements remain phase 5. Screenshots in both languages are
written under `test-results/` by the smoke tests.

No files under `src/workflows/`, `examples/` or `src/pages/backtest/code/` belong to this scaffold.
