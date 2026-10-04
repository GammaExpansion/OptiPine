# Third-party notices

OptiPine's own code is released under the [MIT License](LICENSE). This page lists the third-party
software the browser app bundles, and where the data in this repository comes from.

## Software bundled in the browser app

`npm run build -w @pine/web` packs these packages into `apps/web/dist`. Their license texts are in
`node_modules/<package>/LICENSE` after `npm ci`.

### TradingView Lightweight Charts™

[Lightweight Charts](https://github.com/tradingview/lightweight-charts) draws the price, equity and
drawdown charts. It is licensed under the Apache License 2.0, and its license requires this
attribution notice and a link to TradingView:

> TradingView Lightweight Charts™
> Copyright (с) 2025 TradingView, Inc. https://www.tradingview.com/

The app keeps the library's TradingView attribution logo, which links to
<https://www.tradingview.com/>, on the price chart, or on the equity chart when it is shown without
the price chart. The library includes parts of [tslib](https://github.com/Microsoft/tslib)
(© Microsoft Corporation) under the BSD Zero Clause License.

### Fonts

The app serves its fonts itself, from the [Fontsource](https://fontsource.org) packages. All three
are licensed under the [SIL Open Font License 1.1](https://openfontlicense.org):

| Font            | Package                       | Copyright                        |
| --------------- | ----------------------------- | -------------------------------- |
| Barlow          | `@fontsource/barlow`          | 2017 The Barlow Project Authors  |
| Noto Sans SC    | `@fontsource/noto-sans-sc`    | Google LLC and Adobe (Noto CJK)  |
| Source Code Pro | `@fontsource/source-code-pro` | Adobe, Reserved Font Name Source |

### Libraries under the MIT License

React and React DOM, Radix UI primitives, TanStack Table and TanStack Virtual, CodeMirror 6 and
Lezer, Zustand, react-resizable-panels, and their dependencies. The full production dependency tree
contains only MIT, ISC, 0BSD, Apache-2.0 and OFL-1.1 licenses; `npm ls --omit=dev --all` lists it.

## Software used by the verification suite

`@pine/golden` reads TradingView's exports with [fast-xml-parser](https://github.com/NaturalIntelligence/fast-xml-parser)
and [fflate](https://github.com/101arrowz/fflate), both under the MIT License.

## Data in this repository

The MIT License covers the code. The data below is recorded for testing only, and stays subject to
its providers' terms:

- **Golden fixtures** (`packages/golden/fixtures/`): the maintainer's own TradingView chart-data
  and Strategy Tester exports of the maintainer's own test scripts, used solely to verify
  compatibility. See the [fixture README](packages/golden/fixtures/README.md).
- **Provider responses** (`packages/market-data/test/fixtures/`, `apps/web/e2e/fixtures/market/`):
  small recorded responses from Binance's public market-data API and Yahoo Finance's chart and
  search endpoints, so the tests run offline. Each folder's README lists the requests and the
  capture dates.

TradingView and Pine Script are trademarks of TradingView, Inc. Binance and Yahoo are trademarks of
their owners. OptiPine is independent and not affiliated with or endorsed by any of them.
