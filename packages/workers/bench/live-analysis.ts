/**
 * What one live snapshot of a 20,000-set IS / OOS optimization costs the page, with the one-shot
 * `records` + `view` jobs and with a run held in the analysis Worker. V8's serializer is the
 * structured clone behind postMessage: the page pays `serialize` for what it sends and
 * `deserialize` for what it receives; the Worker's side is reported apart.
 *
 *   node --max-old-space-size=8192 packages/workers/bench/live-analysis.ts
 */
import { deserialize, serialize } from 'node:v8';
import { describe, runWithEquity, type MarketBar } from '@pine/engine';
import { generateSearchSpace, trialIdForParameters } from '@pine/optimizer';
import { AnalysisRuns, handleAnalysisRequest } from '../src/analysis-dispatcher.ts';
import type { AnalysisRequest, AnalysisRunView } from '../src/analysis-protocol.ts';
import type { OptimizationTrial } from '../src/protocol.ts';

const source = `//@version=6
strategy("Bench", initial_capital=10000)
length = input.int(1, "Length", minval=1, maxval=200)
mult = input.int(1, "Mult", minval=1, maxval=100)
fast = ta.sma(close, 5)
if ta.crossover(close, fast)
    strategy.entry("L", strategy.long)
if ta.crossunder(close, fast)
    strategy.entry("S", strategy.short)`;
const bars: MarketBar[] = Array.from({ length: 500 }, (_, index) => {
  const close = 100 + 8 * Math.sin(index / 6) + index / 30;
  return {
    time: 1704067200 + index * 3600,
    open: close - 0.5,
    high: close + 1,
    low: close - 1,
    close,
    volume: 1000,
  };
});
const space = generateSearchSpace(describe(source).inputs);
const report = runWithEquity(source, { bars, syminfo: { mintick: 0.01 }, timeframe: '60' }).metrics;
let seed = 7;
const random = () => (seed = (seed * 16807) % 2147483647) / 2147483647;

/** A trial with the engine's report keys and spread-out values, as a sweep would stream it. */
function trial(inputs: Record<string, number>): OptimizationTrial {
  const metrics: Record<string, number | string | null> = {};
  for (const [key, value] of Object.entries(report))
    metrics[key] = typeof value === 'number' ? value * (0.5 + random()) - 50 * random() : value;
  return {
    trialId: trialIdForParameters({ inputs }),
    parameters: { inputs },
    metrics,
    tradeCount: 40,
    statistics: { maxConsecutiveLosses: Math.floor(10 * random()) },
    diagnostics: [],
    warnings: [],
  };
}
const sets = space.activeAxes[0].values.flatMap((length) =>
  space.activeAxes[1].values.map((mult) => ({ Length: length as number, Mult: mult as number })),
);
const inside = sets.map(trial);
const outside = sets.map(trial);
const view: AnalysisRunView = {
  resultSpace: space,
  mode: 'in-out',
  resultMode: 'in-out',
  objective: 'Net profit',
  direction: 'maximize',
  constraints: [
    { metric: 'Total trades', operator: '>=', value: 30 },
    { metric: 'Performance/Max drawdown (intrabar)/All %', operator: '<=', value: 15 },
  ],
  slices: {},
  neighborhood: false,
};
/** The metrics the Optimize page reads per set: leaderboard figures and the filters. */
const metrics = [
  'Net profit',
  'Profit factor',
  'Performance/Max drawdown (intrabar)/All %',
  'Total trades',
];
/** Trials arriving in 250 ms on a fast machine; a typical run streams far fewer. */
const perSnapshot = 500;

const time = <T>(run: () => T): [number, T] => {
  const started = performance.now();
  const value = run();
  return [performance.now() - started, value];
};
const ms = (value: number) => Math.round(value * 10) / 10;
const median = (values: number[]) => [...values].sort((a, b) => a - b)[values.length >> 1];
const answer = (request: AnalysisRequest, runs?: AnalysisRuns) => {
  const [worker, response] = time(() =>
    handleAnalysisRequest(deserialize(serialize(request)), runs),
  );
  if (response.kind === 'failed') throw new Error(response.error.message);
  return { worker, bytes: serialize(response) };
};

function oneShot() {
  const [sendRecords, recordsRequest] = time(() =>
    serialize({
      requestId: 1,
      kind: 'records',
      input: { groups: [inside, outside], objective: 'Net profit' },
    }),
  );
  const records = answer(deserialize(recordsRequest));
  const [receiveRecords, recordsResponse] = time(() => deserialize(records.bytes));
  const [sendView, viewRequest] = time(() =>
    serialize({ requestId: 2, kind: 'view', input: { ...view, trials: recordsResponse.output } }),
  );
  const analysis = answer(deserialize(viewRequest));
  const [receiveView] = time(() => deserialize(analysis.bytes));
  return {
    page: sendRecords + receiveRecords + sendView + receiveView,
    received: receiveRecords + receiveView,
    worker: records.worker + analysis.worker,
    megabytes:
      (recordsRequest.length + records.bytes.length + viewRequest.length + analysis.bytes.length) /
      1e6,
  };
}

const runs = new AnalysisRuns();
answer({ requestId: 1, kind: 'runOpen', input: { run: 1 } }, runs);
for (const [range, group] of [inside, outside].entries())
  answer(
    { requestId: 2, kind: 'runAppend', input: { run: 1, range: range as 0 | 1, trials: group } },
    runs,
  );

function heldRun(fullMaps: boolean) {
  const fresh = outside.slice(0, perSnapshot);
  const [sendAppend, appendRequest] = time(() =>
    serialize({ requestId: 3, kind: 'runAppend', input: { run: 1, range: 1, trials: fresh } }),
  );
  const appended = answer(deserialize(appendRequest), runs);
  const [sendView, viewRequest] = time(() =>
    serialize({
      requestId: 4,
      kind: 'runView',
      input: { run: 1, view, summary: { metrics, fullMaps } },
    }),
  );
  const summary = answer(deserialize(viewRequest), runs);
  const [receiveView] = time(() => deserialize(summary.bytes));
  return {
    page: sendAppend + sendView + receiveView,
    received: receiveView,
    worker: appended.worker + summary.worker,
    megabytes: (appendRequest.length + viewRequest.length + summary.bytes.length) / 1e6,
  };
}

console.log(`${sets.length} sets, ${Object.keys(report).length} metrics per trial and range`);
for (const [name, measure] of [
  ['one-shot records + view', oneShot],
  [`run: append ${perSnapshot} + summary`, () => heldRun(false)],
  ['run: summary with full maps', () => heldRun(true)],
] as const) {
  const rounds = Array.from({ length: 3 }, measure);
  console.log(
    `${name}: page ${ms(median(rounds.map((round) => round.page)))} ms (receiving ${ms(median(rounds.map((round) => round.received)))} ms), Worker ${ms(median(rounds.map((round) => round.worker)))} ms, ${ms(median(rounds.map((round) => round.megabytes)))} MB`,
  );
}
