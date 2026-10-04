import assert from 'node:assert/strict';
import test from 'node:test';
import {
  consecutiveLossesMetric,
  finalizeWalkForward,
  planWalkForwardWindows,
  type TrialRecord,
} from '@pine/optimizer';
import type { OptimizationTrial } from '@pine/workers';
import { syntheticBars } from './test-support.ts';
import {
  fixedParameters,
  inTurn,
  rangeInput,
  sameMetrics,
  selectionConfig,
  selectionKey,
  selectionMetrics,
  selectionRecords,
  windowSelection,
  windowPlan,
  windowResults,
  walkForwardTotals,
  type SelectionSettings,
  type StabilityRow,
  type WindowResult,
} from './walk-forward.ts';

const settings: SelectionSettings = {
  objective: 'netProfit',
  direction: 'maximize',
  filters: [
    { metric: 'trades', operator: '>=', value: 30 },
    { metric: 'consecutiveLosses', operator: '<=', value: 6 },
  ],
  smooth: false,
};

test('display amounts include open P&L while profitable-window counts retain reported net profit', () => {
  const bars = [
    Date.UTC(2024, 0, 1),
    Date.UTC(2024, 0, 31),
    Date.UTC(2024, 1, 1),
    Date.UTC(2024, 1, 28),
  ].map((time) => ({ time: time / 1000, open: 100, high: 100, low: 100, close: 100, volume: 1 }));
  const config = { inSampleLength: 1, outOfSampleLength: 1, step: 1 };
  const [plan] = planWalkForwardWindows(bars, config);
  const result = (end: number) => ({
    plots: [],
    trades: [],
    diagnostics: [],
    equity: [1000, end],
    metrics: {
      'Performance/Initial capital/All USD': 1000,
      'Performance/Net profit/All USD': 50,
    },
  });
  const inside = result(1100),
    outside = result(950);
  const finalized = finalizeWalkForward(
    [{ ...plan, trials: [], inSampleResult: inside, outOfSampleResult: outside }],
    config,
  );
  const rows = windowResults(
    [
      {
        plan: windowPlan(plan),
        running: false,
        trials: [],
        choice: {
          key: 'net',
          records: [],
          trialId: 'chosen',
          parameters: {},
          inSample: inside,
          outOfSample: outside,
          error: null,
        },
      },
    ],
    finalized,
  );
  const totals = walkForwardTotals(rows, finalized);
  assert.equal(rows[0].inSample?.netProfit, 100);
  assert.equal(rows[0].outOfSample?.netProfit, -50);
  assert.ok(rows[0].wfe! < 0);
  assert.equal(totals.outOfSampleNet, -50);
  assert.equal(totals.wfe, rows[0].wfe);
  assert.equal(totals.profitable, 1);
  assert.equal(rows[0].outOfSampleEquity.at(-1), 1000 + totals.outOfSampleNet!);
});

test('the selection reads the objective and filter metrics, smoothed by the neighbourhood', () => {
  assert.deepEqual(selectionMetrics(settings), [
    'Net profit',
    'Total trades',
    consecutiveLossesMetric,
  ]);
  const axes = [{ title: 'Length', values: [3, 4], extra: true }];
  const config = selectionConfig(
    { inSampleMonths: 12, outOfSampleMonths: 3, stepMonths: 3, anchored: true },
    { ...settings, objective: 'neighbourhoodMean' },
    axes,
  );
  assert.deepEqual(config, {
    inSampleLength: 12,
    outOfSampleLength: 3,
    step: 3,
    mode: 'anchored',
    objective: { name: 'Net profit', direction: 'maximize' },
    neighborhood: true,
    axes: [{ title: 'Length', values: [3, 4] }],
    tolerance: 0.1,
  });
  // The neighbourhood objective ranks the net profit's mean, as Smooth does.
  assert.equal(
    selectionKey({ ...settings, objective: 'neighbourhoodMean' }),
    selectionKey({ ...settings, smooth: true }),
  );
  assert.notEqual(selectionKey(settings), selectionKey({ ...settings, direction: 'minimize' }));
});

test('records carry only the metrics the selection reads, each computed once', () => {
  const trial = (id: string, net: number, diagnostics = 0): OptimizationTrial => ({
    trialId: id,
    parameters: { inputs: { Length: 3 } },
    metrics: { 'Performance/Net profit/All': net, 'Trades analysis/Total trades/All': 40 },
    tradeCount: 40,
    statistics: { maxConsecutiveLosses: 2 },
    diagnostics: Array.from({ length: diagnostics }, () => ({
      kind: 'runtime' as const,
      line: 1,
      message: 'x',
    })),
  });
  const cache = new Map<string, readonly (number | null)[]>();
  const trials = [trial('a', 5), trial('b', -1, 1)];
  const records = selectionRecords(trials, selectionMetrics(settings), cache);
  assert.deepEqual(records[0], {
    trialId: 'a',
    parameters: { Length: 3 },
    inSampleMetrics: { 'Net profit': 5, 'Total trades': 40 },
    inSampleStatistics: { maxConsecutiveLosses: 2 },
    tradeCount: 40,
    objectiveValue: null,
    inSampleValue: null,
    outOfSampleValue: null,
    valid: true,
    excluded: false,
  });
  assert.equal(records[1].valid, false);
  const column = cache.get('Net profit');
  selectionRecords(trials, ['Net profit'], cache);
  assert.equal(cache.get('Net profit'), column);
});

test('a range ending before the data has no realtime tail; the last one keeps it', () => {
  const common = { bars: syntheticBars(10), syminfo: {}, timeframe: '60', realtimeTail: true };
  assert.deepEqual(rangeInput(common, 2, 5), {
    ...common,
    bars: common.bars.slice(2, 5),
    realtimeTail: false,
    strategyClosePending: false,
  });
  assert.deepEqual(rangeInput(common, 5, 10), { ...common, bars: common.bars.slice(5) });
});

test('metrics match only with the same keys and values, NaN included', () => {
  assert.equal(sameMetrics({ a: 1, b: Number.NaN }, { b: Number.NaN, a: 1 }), true);
  assert.equal(sameMetrics({ a: 1 }, { a: 1, b: 2 }), false);
  assert.equal(sameMetrics({ a: 0 }, { a: -0 }), false);
  assert.equal(sameMetrics({ a: 'x' }, { b: 'x' }), false);
});

test('tasks run with at most the limit going, their outcomes in order', async () => {
  let going = 0;
  let most = 0;
  const task = (value: number) => async () => {
    going++;
    most = Math.max(most, going);
    await new Promise((resolve) => setTimeout(resolve, 5 - value));
    going--;
    return value;
  };
  assert.deepEqual(await inTurn([0, 1, 2, 3, 4].map(task), 2), [0, 1, 2, 3, 4]);
  assert.equal(most, 2);
  assert.deepEqual(await inTurn([], 3), []);
});

test('the fixed set takes each row fixed value; its mean loss is measured in every window', () => {
  const record = (Length: number, value: number | null, excluded = false): TrialRecord => ({
    trialId: `L${Length}`,
    parameters: { Length, Source: 'close' },
    objectiveValue: value,
    inSampleValue: value,
    outOfSampleValue: null,
    valid: true,
    excluded,
  });
  const row = (fixed: number | null): StabilityRow => ({
    title: 'Length',
    values: [3, 4],
    bands: [],
    common: [],
    fixed,
    meanLoss: null,
    allNearOptimal: false,
  });
  const windows = [
    [record(3, 100), record(4, 80)],
    [record(3, 50), record(4, 50)],
  ];
  const base = { Length: 3, Source: 'close', Stop: false };
  assert.deepEqual(fixedParameters([row(4)], windows, base, 'maximize', 7), {
    parameters: { Length: 4, Source: 'close', Stop: false },
    meanLoss: 0.1,
    origin: { kind: 'fixed', optimizationId: 7 },
  });
  // A window that filtered the set out cannot measure its loss.
  const filtered = [windows[0], [record(3, 50), record(4, 50, true)]];
  assert.equal(fixedParameters([row(4)], filtered, base, 'maximize', 7)?.meanLoss, null);
  assert.equal(fixedParameters([row(null)], windows, base, 'maximize', 7), null);
  assert.equal(fixedParameters([row(4)], [], base, 'maximize', 7), null);
});

test('the selection is the picked window, else the last that ran a set', () => {
  const month = 30 * 86_400;
  const row = (index: number, status: WindowResult['status']) =>
    ({
      plan: {
        index,
        inSampleStart: index * month,
        inSampleEnd: (index + 2) * month,
        outOfSampleStart: (index + 2) * month,
        outOfSampleEnd: (index + 3) * month,
      },
      status,
      trialId: status === 'done' ? `t${index}` : null,
    }) as WindowResult;
  const rows = [row(0, 'done'), row(1, 'done'), row(2, 'flat')];
  // The origin carries the window's ranges, for its preview to mark on the chart.
  assert.deepEqual(windowSelection(rows, null, 4), {
    window: rows[1],
    explicit: false,
    origin: {
      kind: 'window',
      optimizationId: 4,
      trialId: 't1',
      window: 1,
      ranges: {
        inSample: { start: month, end: 3 * month },
        outOfSample: { start: 3 * month, end: 4 * month },
      },
    },
  });
  assert.deepEqual(windowSelection(rows, 2, 4), { window: rows[2], explicit: true, origin: null });
  assert.equal(windowSelection([row(0, 'waiting')], null, 4), null);
});
