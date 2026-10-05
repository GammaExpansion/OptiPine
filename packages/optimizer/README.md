# @pine/optimizer

Parameter search and overfitting analysis for Pine strategies run by `@pine/engine`: search
spaces, grid and random sampling, in-sample / out-of-sample splits, walk-forward windows, and the
leaderboard, heatmap, sensitivity and stability views built from the trials. It has no DOM, Worker,
network or translation dependency, so a UI, a Worker or a Node script can call it directly.

The package never runs the engine on its own schedule. You evaluate parameter sets with
`sweep` or `runWithEquity` (in Workers, in a pool, or inline) and hand the results back; the
synchronous helpers `optimizeParameters` and `runWalkForward` exist for scripts and tests.

## Example

```ts
import { describe, runWithEquity } from '@pine/engine';
import {
  enumerateGrid,
  generateSearchSpace,
  leaderboard,
  optimizeParameters,
} from '@pine/optimizer';

const space = generateSearchSpace(describe(source).inputs, {
  ranges: { Length: { from: 10, to: 50, step: 5 } },
});
const summary = optimizeParameters(
  enumerateGrid(space),
  bars,
  (inputs, bars) => runWithEquity(source, { bars, syminfo, timeframe, inputs }),
  { validation: { mode: 'in-out', splitRatio: 0.7 }, objective: { name: 'Net profit' } },
);
const best = leaderboard(summary.trials, { limit: 10 });
```

## API

| Area            | Exports                                                                                                                                                                                                                                                                                                                                                                                                                                                    |
| --------------- | ---------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| Search space    | `generateSearchSpace(descriptors, options)` builds axes from engine `InputDescriptor`s, with decimal-exact numeric ranges; `enumerateGrid`, `sampleRandom(space, count, seed)`; `SearchSpaceError`.                                                                                                                                                                                                                                                        |
| Trial identity  | `trialIdForParameters`, `stableTrialId`: a 128-bit hash of the canonical parameter set, stable across key order and Workers.                                                                                                                                                                                                                                                                                                                               |
| Validation      | `splitBars` (in / out by bar count), `optimizeParameters`, `leaderboard`, `viewTrials` (re-score and apply `>=` / `<=` constraints), `scoreMetric`, `constraintValue`.                                                                                                                                                                                                                                                                                     |
| Walk-forward    | `planWalkForwardWindows` (UTC calendar months, rolling or anchored) and `planWalkForwardBounds` (the same windows from bar times, as bounds and bar indices only), `selectWalkForwardTrial`, `finalizeWalkForward` (stitched OOS equity, WFE, totals, stability), `runWalkForward`.                                                                                                                                                                        |
| Analysis        | `neighborhoodValues` / `neighborhoodTrials` (±1-step averages), `heatmap`, `meanWindowHeatmap`, `sensitivity`, `buildSensitivitySummary`, `defaultHeatmapAxes` (the two active axes with the most values, declaration-order ties), `stabilityBands`; `analyzeOptimizer` combines them and ranks by the IS objective, the OOS one (`rankBy: 'secondary'`; the neighbourhood mean for validation None) or the neighbourhood mean (`rankBy: 'neighborhood'`). |
| Summary         | `summarizeOptimizerAnalysis` reduces an analysis to what screens read: ranked positions, per-set columns of objective, neighbourhood and requested metrics as typed arrays, binned maps (full ones on request) and sensitivity, without the trials.                                                                                                                                                                                                        |
| Heatmap display | `prepareHeatmap` bins axes with more than 24 values and assigns nine rank bins, worst to best in the map's `scale` direction and split at its break-even; `buildBinDetail` opens one binned cell at full resolution.                                                                                                                                                                                                                                       |
| Metrics         | `metricRows` groups engine report keys into All / Long / Short rows in report order; `metricValue(metrics, name, scope, percent)`; `tradeStatistics` (longest losing streak).                                                                                                                                                                                                                                                                              |
| Errors          | `optimizerMessageIds`, `optimizerMessage`, `optimizerError`, `isOptimizerError`, `SearchSpaceError`.                                                                                                                                                                                                                                                                                                                                                       |

`defaultHeatmapAxes(activeAxes)` takes searched axes in declaration order and returns up to two
titles, ordered by descending `values.length`, with ties in declaration order. It does not read
trials, so defaults stay the same before, during and after a run. `analyzeOptimizer` uses them
unless axes are chosen, preserving explicit orientation when `preserveAxisOrientation` is true.
Sensitivity remains sorted by impact independently of the map defaults.

## Range profit

Optimization scoring (`scoreMetric`, `optimizeParameters`, `viewTrials` and analysis summaries)
marks account-wide Net profit to market: closed Net profit plus Open P&L at the range's last bar,
including paid entry fees but no hypothetical exit commission. Both the report name and exact
`Performance/Net profit/All` currency / percentage keys use this rule; percentages use initial
capital, not the engine's Open P&L percentage denominator. `rangeProfit(metrics, percent?)`
exposes the calculation without collecting equity per trial. This agrees with walk-forward's
ending-equity-minus-initial-capital amounts.

Original metrics are never modified. `metricValue` and `metricRows` still expose TradingView's
closed-trade report, and other objectives and side-specific metrics retain their definitions.
Compact selection records may already contain scored profit; without an Open P&L field they
are not marked a second time.

## Errors and text

Errors carry a stable `code` from `optimizerMessageIds` and its `values`, for example
`{ code: 'searchRangeReversed', values: { title: 'Length' } }`, plus the same pair as `uiText`, a
plain-data message `{ kind: 'message', id, values }` from [@pine/messages](../messages/README.md).
A UI translates the id with its own catalog; `Error.message` is an untranslated fallback such as
`searchRangeReversed: title=Length`. Trial and window `error` fields hold the same `Text` shapes,
and every result is structured-clone safe.

## Development

```sh
npm run build -w @pine/optimizer
npm run test -w @pine/optimizer
```

Tests read market data from the golden fixtures in `packages/golden/fixtures` and run the real
engine; `test/fixtures.ts` parses those files without depending on the harness.
