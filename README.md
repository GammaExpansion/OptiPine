<div align="center">

# OptiPine

**Backtest and optimize TradingView Pine Script strategies offline, with numbers verified against TradingView's own exports.**

[![Compatibility regression](https://github.com/GammaExpansion/OptiPine/actions/workflows/ci.yml/badge.svg)](https://github.com/GammaExpansion/OptiPine/actions/workflows/ci.yml)
[![MIT license](https://img.shields.io/badge/license-MIT-blue.svg)](LICENSE)

[English](README.md) · [简体中文](README.zh-CN.md)

</div>

> **Status.** This repository contains the Pine engine, the optimizer, market data, Web Worker
> execution and the TradingView verification suite as TypeScript packages. The browser app that
> puts them on screen is being rebuilt and is not included yet; its design is drawn in
> [docs/web-mock-terminal](docs/web-mock-terminal/README.md).

## Why this exists

If you write strategies in Pine Script you know the loop: change an input, wait for the Strategy
Tester, write the number down, repeat. TradingView has no parameter optimizer, and rewriting a
strategy in Python means trusting that your port behaves like the original.

OptiPine runs your Pine source as it is. Give it a v5 or v6 strategy and market data, and search
its inputs across thousands of combinations with the validation methods quants actually use.
Every part of the engine is checked against exports from TradingView itself, so the equity curve
you optimize is the one you would see on the chart.

## What you get

- **Your Pine, unchanged.** Indicators and strategies in v5 and v6: `ta.*`, `math.*`, `str.*`,
  arrays, matrices, maps, enums, orders and exits, risk limits, commission, slippage and sessions.
- **A real optimizer.** Grid or random search over every input type, booleans and option lists
  included. Constraints such as a minimum number of trades or a maximum drawdown filter the
  leaderboard.
- **Overfitting checks built in.** In-sample / out-of-sample splits, walk-forward with rolling or
  anchored windows, parameter heatmaps, sensitivity and neighbourhood averages that reward stable
  regions rather than lucky cells.
- **Numbers you can trust.** 240 fixtures captured from TradingView, more than 45 million plot
  values, trade fields and report metrics compared cell by cell on every commit.
- **Runs where JavaScript runs.** The engine has no filesystem or network dependency and works in
  Node or a browser; `@pine/workers` spreads a search across Web Workers, one per CPU core.
- **Market data included.** Binance spot and perpetuals and Yahoo Finance through a small Node
  proxy, plus CSV files.

## Quick start

Requires [Node.js](https://nodejs.org) 24.5 or newer.

```sh
git clone https://github.com/GammaExpansion/OptiPine.git
cd OptiPine
npm ci && npm run build
npm run check
```

`npm run check` replays every TradingView fixture against the engine and compares the result
with the accepted baseline; it takes a few minutes. To run a strategy of your own, use the
packages from your code as shown below.

## What is not supported yet

`request.security()` and the other `request.*` calls, Bar Magnifier, `import` of libraries and
currency conversion. Drawings (`label.*`, `line.*`, `box.*`, `table.*`) run as no-ops with a
warning. A script that depends on one of these fails with an explicit diagnostic instead of a
silently wrong number; the [compatibility notes](docs/COMPATIBILITY_NOTES.md) list exactly what
is measured.

## Use the packages in your own code

```ts
import { describe, run, runWithEquity, sweep } from '@pine/engine';
import {
  enumerateGrid,
  generateSearchSpace,
  leaderboard,
  optimizeParameters,
} from '@pine/optimizer';

const input = {
  bars,
  syminfo: { mintick: 0.01, pointvalue: 1, timezone: 'Etc/UTC' },
  timeframe: '60',
};
const result = run(source, input); // plots, trades, report metrics, diagnostics
const trials = sweep(source, input, [{ inputs: { Length: 10 } }, { inputs: { Length: 20 } }]);

// Search the script's own inputs with a 70 / 30 in-sample / out-of-sample split.
const space = generateSearchSpace(describe(source).inputs, {
  ranges: { Length: { from: 10, to: 50, step: 5 } },
});
const summary = optimizeParameters(
  enumerateGrid(space),
  bars,
  (inputs, bars) => runWithEquity(source, { ...input, bars, inputs }),
  { validation: { mode: 'in-out', splitRatio: 0.7 }, objective: { name: 'Net profit' } },
);
const top = leaderboard(summary.trials, { limit: 10 });
```

The engine has no filesystem or network dependency and keeps no state between runs; `describe`
reads a script's inputs, strategy settings and plots without running it. The optimizer adds no
DOM, Worker or network dependency either: you decide where trials run, and its errors carry stable
codes for your own interface to translate. See [packages/engine/README.md](packages/engine/README.md)
and [packages/optimizer/README.md](packages/optimizer/README.md).

To build an interface, [`@pine/workers`](packages/workers/README.md) runs the engine and the
analysis in Web Workers with cancellation and an adaptive optimization pool, and
[`@pine/market-data`](packages/market-data/README.md) loads Binance and Yahoo bars through a small
Node proxy and parses CSV files.

## For developers

| Path                   | Package             | Contents                                                                 |
| ---------------------- | ------------------- | ------------------------------------------------------------------------ |
| `packages/engine`      | `@pine/engine`      | Pine v5 / v6 compiler, interpreter and broker emulator                   |
| `packages/optimizer`   | `@pine/optimizer`   | Search spaces, validation splits, walk-forward and result analysis       |
| `packages/market-data` | `@pine/market-data` | Binance and Yahoo feeds, the proxy middleware, CSV and profile files     |
| `packages/workers`     | `@pine/workers`     | Engine and analysis Workers and the optimization pool                    |
| `packages/messages`    | `@pine/messages`    | Plain-data text and coded errors shared by the packages                  |
| `packages/golden`      | `@pine/golden`      | TradingView fixtures, the comparison harness and the regression baseline |
| `apps/cli`             | `@pine/cli`         | Fixture runner behind `npm run golden` and `npm run check`               |

```sh
npm run test --workspaces   # every package and the CLI
npm run golden              # run every TradingView fixture
npm run check               # the regression gate CI enforces
```

- [Engine design](docs/DESIGN.md) and [compatibility notes](docs/COMPATIBILITY_NOTES.md)
- [How fixtures are collected](packages/golden/fixtures/docs/collecting-golden-sop.md) and the
  [fixture documentation](packages/golden/fixtures/README.md)
- Pull requests are welcome. A change in engine behaviour needs a fixture with native TradingView
  exports; expected values are never edited by hand and tolerances are never widened to pass.

## Support the project

If OptiPine saves you an afternoon of manual re-runs, a star helps other Pine users find it.
Missing a builtin your strategy needs? Open an issue with a minimal script.

## License

[MIT](LICENSE).

TradingView and Pine Script are trademarks of TradingView, Inc. This project is independent and
not affiliated with or endorsed by TradingView. Fixture data consists of the maintainer's own
chart and report exports, used solely to verify compatibility. Nothing here is investment advice.
