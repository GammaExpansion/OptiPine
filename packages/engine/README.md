# @pine/engine

An offline interpreter for Pine Script v5 and v6. It compiles a script, runs it bar by bar
over caller-supplied market data, and returns plots, strategy trades, report metrics and
diagnostics. It has no filesystem or network dependency and keeps no state between runs.

## API

```ts
import { compile, describe, run, runWithEquity, sweep } from '@pine/engine';
```

| Function                            | Purpose                                                                                                                                 |
| ----------------------------------- | --------------------------------------------------------------------------------------------------------------------------------------- |
| `compile(source)`                   | Parse and type-check. Returns `{ success, diagnostics, program? }`.                                                                     |
| `run(source, input)`                | Compile and execute once. Returns a `RunResult`.                                                                                        |
| `runWithEquity(source, input)`      | Same as `run`, plus `equity`: one account value per bar for strategies.                                                                 |
| `sweep(source, common, parameters)` | Compile once, then execute every `ParameterSet` (`{ inputs?, settings? }` overrides) with fresh state. Returns `{ compilation, runs }`. |
| `describe(source)`                  | Compile without running and read literal `strategy()` settings, `input.*` descriptors and plot titles. See below.                       |

### Compile diagnostics

Parsing stops at the first syntax error, which is then the only diagnostic. Past parsing, the
checker goes on after each failing statement or expression and reports every independent
`undeclared`, `type` and `semantic` error in one pass, sorted by line and column, at most 50. A
failed expression poisons its value: a variable declared from it, arithmetic or a call on it, or a
function whose body failed report nothing more, so a misspelt name is one error at each use, not
a cascade through everything computed from it. Each error in a user function's body is reported
once, however many calls check it.

When compilation fails, the `request.*` calls the engine cannot run are listed among the errors
as `unsupported`. A script whose only problem is a request still compiles, and its run ends with
the `unsupported` diagnostic as before. `compile`, `describe`, `run`, `runWithEquity` and `sweep`
all return the whole list.

### RunInput

- `bars`: `{ time, open, high, low, close, volume }[]` in ascending order; `time` is Unix seconds.
- `syminfo`: symbol metadata. Missing keys take defaults and present keys are validated once per
  run: `mintick` 0.01, `pointvalue` 1, `mincontract` 1, `timezone` `Etc/UTC`, `session_hours`
  `0000-0000`, `currency` `USD`. Extra keys are readable from scripts as `syminfo.<key>`.
- `timeframe`: a Pine timeframe string such as `60`, `D` or `1W`.
- `inputs`: overrides keyed by input title, matched as own properties only.
- `settings`: strategy settings such as `initial_capital`, `commission_type` or `pyramiding`;
  the `strategy()` declaration supplies whatever is omitted. See `StrategySettings`.
- `sessionCalendar`, `historicalTicks`, `strategyClosePending`, `realtimeTail`: see the comments
  in [src/types.ts](src/types.ts).

### RunResult

- `plots`: `{ title, values, overlay, style?, colors? }` per plot, one value per bar. `overlay` is true when the plot
  is drawn over the price chart: the script declares `overlay = true`, or the plot call sets
  `force_overlay = true`; otherwise the plot belongs in its own pane.
- `trades` and `metrics`: strategy fills and the TradingView report metrics, keyed as
  `Section/Name/Column`.
- `diagnostics`: `{ kind, line, column?, bar?, message }`. `syntax`, `undeclared`, `type` and
  `semantic` come from compilation; `unsupported` marks a feature outside the engine's scope;
  `limit` is the per-bar step budget or broker order-processing budget; `runtime` is an error
  the script's execution raised; `internal` is a fault inside the engine itself and worth reporting.
  Diagnostics raised during a bar carry `bar`, the zero-based index into `RunInput.bars`
  (the script's `bar_index`), including tick and order-fill recalculations. Compilation,
  setup and final-report failures have no `bar`. `runWithEquity` and `sweep` preserve it.
- `warnings`: side effects the engine deliberately ignores, such as drawing calls.

### Plot declarations

`PlotOutput.style` preserves resolved arguments of `plot()`, `plotshape()` and `plotchar()`:

| Field       | Meaning                                                                                                                                                                                                                                                                                       |
| ----------- | --------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| `kind`      | `plot`, `shape` or `char`, independent of the series value type.                                                                                                                                                                                                                              |
| `style`     | `plot.style_*` suffix: `line`, `linebr`, `stepline`, `steplinebr`, `histogram`, `columns`, `circles`, `cross`, `area`, `areabr`; or `shape.*` suffix: `triangleup`, `triangledown`, `arrowup`, `arrowdown`, `circle`, `square`, `diamond`, `cross`, `xcross`, `flag`, `labelup`, `labeldown`. |
| `linewidth` | Positive declared pixel width for `plot()`.                                                                                                                                                                                                                                                   |
| `color`     | Constant colour normalized to lowercase `#rrggbb` or `#rrggbbaa`, with transparency applied; `null` means Pine `na` (invisible). Named colours respect the script's Pine version.                                                                                                             |
| `location`  | `abovebar`, `belowbar`, `absolute`, `top` or `bottom`. Absolute placement uses the numeric plot value, including zero.                                                                                                                                                                        |
| `size`      | `auto`, `tiny`, `small`, `normal`, `large` or `huge` for shapes/characters.                                                                                                                                                                                                                   |
| `text`      | Constant `plotshape()` text, unchanged.                                                                                                                                                                                                                                                       |
| `char`      | Constant `plotchar()` character, including an explicitly empty string.                                                                                                                                                                                                                        |

Only supplied, resolved, run-invariant arguments (`const`, `input` or `simple`) become scalar
fields. Omitted, unknown or series-qualified non-colour arguments are left out; the engine does not
guess declaration defaults. Colours from literals (including hex alpha), `color.new()` and
`color.rgb()` retain their transparency. `color.new(na, ...)` stays invisible.

For a series-qualified colour argument, `PlotOutput.colors` holds one normalized colour or `null`
per input bar and `style.color` is absent. Qualification comes from compilation and mutable
dependencies (including conditional reassignments and captured aliases), even if a particular
history happens to have the same colour on every bar. Constant colours never allocate this array;
all other style fields are stored once, keeping Worker clones small. Recalculations overwrite the
current bar's colour together with its value. If a series colour cannot be resolved, the whole
colour array is omitted rather than treating an unknown value as `na`.
Older callers may supply plots without metadata; numeric values, ordering and overlay placement
retain their existing contracts.

### describe

`describe(source)` returns a `ScriptDescription`: `success`, `diagnostics`, `version`, `kind`
(`strategy`, `indicator` or `library`, from the declaration; absent when the compile fails), the
literal `strategy()` `title` and `settings`, `computedSettings` (name → line) for arguments given as
expressions, `plots` (`{ title, line, isEquity }`), and `inputs`. Each `InputDescriptor` has `id`,
`title`, `type`, `defaultValue`, `min` / `max` / `step`, `options`, `group`, `tooltip` and `line`. An input
that a caller cannot override is `fixed`, with a `reason` code: `computed-default`, `computed-title`
(`computedTitle` is then true and `title` falls back to `id`), `unsupported-type`, `computed-options`
or `duplicate-title`. Nothing is evaluated; a computed default keeps its runtime value.

### Limits

- 2,000,000 evaluation and statement steps per bar.
- 100,000 elements per array, map or matrix, and 4,096 characters for a `str.repeat` result.
- `request.*`, Bar Magnifier and library imports are outside the current scope and end a run
  with an `unsupported` diagnostic.

## Subpath exports

| Import                       | Contents                                                                                      |
| ---------------------------- | --------------------------------------------------------------------------------------------- |
| `@pine/engine/calendar`      | `Calendar`, `dateParts`, `zonedTimestamp`: session calendar lookups and time zone helpers.    |
| `@pine/engine/reporting`     | `calculateMetrics`, `tradeReturn`, `monthlyReturns`, `ReportContext`: the report calculation. |
| `@pine/engine/trade-profit`  | `reportedTradeProfit`: the profit figure TradingView displays for a trade.                    |
| `@pine/engine/report-number` | `reportNumber`: the rounding applied to report values.                                        |
| `@pine/engine/verification`  | `RollingSum`: the compensated moving-sum accumulator, exposed for independent verification.   |

## Development

```sh
npm run build -w @pine/engine
npm run test -w @pine/engine
```

The golden fixtures that gate behaviour live in `packages/golden`; see the repository README
for the regression workflow.
