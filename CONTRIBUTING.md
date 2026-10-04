# Contributing to OptiPine

Thank you for helping. The contributions that help most are:

- **A missing builtin or a wrong number**, reported as an issue with a minimal script and what
  TradingView shows.
- **A new golden fixture** with native TradingView exports, which turns a behaviour into a tested
  one.
- **Fixes to the engine, the optimizer or the browser app**, each with its tests.

Before starting on something large, open an issue so we can agree on the approach.

## Set up

You need [Node.js](https://nodejs.org) 24.5 or newer. The repository runs TypeScript directly in
Node, so there is no separate compile step for tests.

```sh
git clone https://github.com/GammaExpansion/OptiPine.git
cd OptiPine
npm ci && npm run build
```

The [README](README.md) shows the workspace layout, and [docs/DESIGN.md](docs/DESIGN.md) and
[docs/WEB.md](docs/WEB.md) describe the engine and the browser app.

## Check a change

CI runs these on every pull request; run the ones your change touches before you push.

```sh
npm run format:check        # Prettier; `npm run format` fixes it
npm run typecheck           # every workspace
npm run test --workspaces   # Node tests, and the web app's Vitest suite; no browser needed
npm run check               # the TradingView regression gate; a few minutes
```

The browser app also has Playwright tests:

```sh
npx playwright install chromium
npm run e2e -w @pine/web
```

They start servers on ports 5174 to 5176. If those are busy, set another base port, for example
`E2E_BASE_PORT=6174 npm run e2e -w @pine/web`.

## Engine behaviour and fixtures

The engine is measured against TradingView, not against our expectations:

- A change in engine behaviour needs a fixture with native TradingView exports. The
  [collection guide](packages/golden/fixtures/docs/collecting-golden-sop.md) explains how to capture
  one, and the [fixture README](packages/golden/fixtures/README.md) defines the format.
- Expected values are never edited by hand, and tolerances are never widened to make a case pass.
- `npm run check` compares a full run with the accepted baseline
  (`packages/golden/fixtures/golden-baseline.json`). A baseline update is explicit:
  `npm run pine -- accept --reason "<why>"`, with `--measurement-change` only when the observations
  or comparison rules themselves changed. Explain the update in the pull request.

## Code style

- TypeScript is strict and uses erasable syntax only, because Node strips the types: no enums,
  namespaces or parameter properties. Relative imports carry their `.ts` or `.tsx` extension.
- Prettier formats everything (print width 100, single quotes).
- Doc comments state a rule or a reason. Leave no commented-out or dead code.
- Every module with logic has tests.
- In the browser app, framework-free modules (`apps/web/src/workflows/`) import neither React nor
  the DOM. Every user-facing string lives in the catalogs, `apps/web/src/i18n/en.ts` and `zh.ts`.
  English is the reference, and the Chinese copy is formal product language.

## Commits and pull requests

- Write the subject as `area: what the change does`, for example
  `engine: report the bar on execution diagnostics`. Name every area a change touches
  (`optimizer, web: …`), and use the body to explain what changed and why.
- Keep a pull request to one topic, and say how you tested it. For a visible change in the app,
  include screenshots, in both languages if the copy changed.

## Reporting a security issue

Please don't open a public issue. See [SECURITY.md](SECURITY.md).
