import assert from 'node:assert/strict';
import test from 'node:test';
import { consecutiveLossesMetric, type TrialRecord } from '@pine/optimizer';
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
  const row = (index: number, status: WindowResult['status']) =>
    ({ plan: { index }, status, trialId: status === 'done' ? `t${index}` : null }) as WindowResult;
  const rows = [row(0, 'done'), row(1, 'done'), row(2, 'flat')];
  assert.deepEqual(windowSelection(rows, null, 4), {
    window: rows[1],
    explicit: false,
    origin: { kind: 'window', optimizationId: 4, trialId: 't1', window: 1 },
  });
  assert.deepEqual(windowSelection(rows, 2, 4), { window: rows[2], explicit: true, origin: null });
  assert.equal(windowSelection([row(0, 'waiting')], null, 4), null);
});
