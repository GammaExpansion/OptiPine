import assert from 'node:assert/strict';
import test from 'node:test';
import { describe, type InputDescriptor, type LiteralValue } from '@pine/engine';
import { optimizerMessage, splitBars } from '@pine/optimizer';
import { fixedInputReason } from './inputs.ts';
import { workflowMessage } from './messages.ts';
import {
  dataRange,
  defaultSearchDraft,
  defaultValidation,
  estimateDurationMs,
  gridLimit,
  keepSearchDraft,
  searchSetup,
  type SamplingSettings,
  type SearchDraft,
} from './optimize-setup.ts';
import { syntheticBars } from './test-support.ts';

const descriptors = describe(`//@version=6
strategy("Search")
n = 3
a = input.int(20, "Length", minval=10, maxval=50)
b = input.float(2.0, "Multiplier", step=0.25)
c = input.source(close, "Source")
d = input.bool(false, "Use trailing stop")
e = input.string("Both", "Direction", options=["Both", "Long", "Short"])
f = input.session("0930-1600", "Trade window")
g = input.int(n * 2, "Computed")
`).inputs;
const byTitle = (title: string): InputDescriptor =>
  descriptors.find((descriptor) => descriptor.title === title)!;
const grid: SamplingSettings = { method: 'grid', count: 2000, seed: 42 };
const current: Record<string, LiteralValue> = {
  Length: 20,
  Multiplier: 2,
  Source: 'close',
  'Use trailing stop': false,
  Direction: 'Both',
  'Trade window': '0930-1600',
};
const setup = (drafts: Record<string, SearchDraft> = {}, sampling = grid) =>
  searchSetup(descriptors, new Map(Object.entries(drafts)), current, sampling);
const range = (from: number, to: number, step: number): SearchDraft => ({
  searched: true,
  values: { kind: 'range', from, to, step },
});

test('rows start around the current values and from the package defaults (O1, O4)', () => {
  const { rows, space, sampling } = setup();
  assert.deepEqual(
    rows.map((row) => [row.descriptor.title, row.status, row.values.length]),
    [
      ['Length', 'searched', 31],
      ['Multiplier', 'searched', 13],
      ['Source', 'searched', 3],
      ['Use trailing stop', 'searched', 2],
      ['Direction', 'searched', 3],
      ['Trade window', 'excluded', 1],
      ['Computed', 'excluded', 0],
    ],
  );
  assert.deepEqual(rows[0].draft, range(10, 40, 1));
  assert.deepEqual(rows[1].draft, range(1, 4, 0.25));
  assert.deepEqual(
    rows[2].choices.map((choice) => [choice.value, choice.kept]),
    [
      ['open', false],
      ['high', false],
      ['low', false],
      ['close', true],
      ['hl2', true],
      ['hlc3', false],
      ['ohlc4', true],
      ['hlcc4', false],
    ],
  );
  assert.deepEqual(
    rows[3].choices.map((choice) => choice.value),
    [false, true],
  );
  assert.deepEqual(
    rows[5].excluded,
    workflowMessage('optimize.inputNotSearchable', {
      title: 'Trade window',
      type: 'session',
    }),
  );
  assert.deepEqual(rows[5].values, ['0930-1600']);
  assert.deepEqual(rows[6].excluded, fixedInputReason(byTitle('Computed')));
  assert.equal(space?.combinationCount, 31 * 13 * 3 * 2 * 3);
  assert.deepEqual(
    space?.activeAxes.map((axis) => axis.title),
    ['Length', 'Multiplier', 'Source', 'Use trailing stop', 'Direction'],
  );
  assert.deepEqual(space?.fixedParameters, { 'Trade window': '0930-1600' });
  assert.equal(sampling?.method, 'grid');
  assert.equal(sampling?.combinations, 7_254);
});

/** Trend Breakout's inputs (O1). */
const trend = describe(`//@version=6
strategy("Trend Breakout")
length = input.int(20, "Length", minval = 5, maxval = 200)
mult = input.float(2.0, "Multiplier", minval = 0.25, maxval = 5.0, step = 0.25)
src = input.source(close, "Source")
trailing = input.bool(false, "Use trailing stop")
trail = input.float(3.0, "Trail %", minval = 0.25, maxval = 20.0, step = 0.25)
`).inputs;
const trendValues = { Length: 20, Multiplier: 2, Source: 'close', 'Use trailing stop': false };

test('a new row spans half to twice the current value on its step; the grid stays whole (O1)', () => {
  const { rows, sampling } = searchSetup(trend, new Map(), { ...trendValues, 'Trail %': 3 }, grid);
  assert.deepEqual(
    rows.map((row) => [row.descriptor.title, row.status, row.draft?.values]),
    [
      ['Length', 'searched', { kind: 'range', from: 10, to: 40, step: 1 }],
      ['Multiplier', 'searched', { kind: 'range', from: 1, to: 4, step: 0.25 }],
      ['Source', 'searched', { kind: 'list', values: ['close', 'hl2', 'ohlc4'] }],
      ['Use trailing stop', 'searched', { kind: 'list', values: [false, true] }],
      // 19 more values would take the grid past 20,000: Trail % starts fixed, its range ready.
      ['Trail %', 'fixed', { kind: 'range', from: 1.5, to: 6, step: 0.25 }],
    ],
  );
  assert.deepEqual(rows[4].values, [3]);
  assert.deepEqual([sampling?.method, sampling?.combinations], ['grid', 31 * 13 * 3 * 2]);
  // An edited row counts as it is and is never fixed for the grid's sake.
  const kept = searchSetup(
    trend,
    new Map([['Length', range(5, 200, 1)]]),
    { ...trendValues, 'Trail %': 3 },
    grid,
  );
  assert.deepEqual(
    kept.rows.map((row) => row.status),
    ['searched', 'searched', 'searched', 'searched', 'fixed'],
  );
});

test('the default range follows the value, its bounds and its step', () => {
  const draft = (source: string, value: LiteralValue) =>
    defaultSearchDraft(describe(`//@version=6\nstrategy("S")\n${source}\n`).inputs[0], value);
  // The current value, not the declared one, and within the bounds; 91 values take a step of 2.
  assert.deepEqual(draft('a = input.int(20, "A", minval = 5, maxval = 200)', 60).values, {
    kind: 'range',
    from: 30,
    to: 120,
    step: 2,
  });
  assert.deepEqual(draft('a = input.int(7, "A", minval = 5)', 7).values, {
    kind: 'range',
    from: 5,
    to: 14,
    step: 1,
  });
  // On the step grid through the value, which stays among the values searched.
  assert.deepEqual(draft('a = input.float(0.3, "A", step = 0.05)', 0.3).values, {
    kind: 'range',
    from: 0.15,
    to: 0.6,
    step: 0.05,
  });
  // A step too fine for 50 values is coarsened to a round multiple of itself.
  assert.deepEqual(draft('a = input.float(100, "A", step = 0.01)', 100).values, {
    kind: 'range',
    from: 50,
    to: 200,
    step: 5,
  });
  assert.deepEqual(draft('a = input.float(-10, "A")', -10).values, {
    kind: 'range',
    from: -20,
    to: -5,
    step: 1,
  });
  // Zero and times have no scale to search around: they start fixed at their value.
  const zero = draft('a = input.int(0, "A", minval = -5, maxval = 5)', 0);
  assert.deepEqual(
    [zero.searched, zero.values],
    [false, { kind: 'range', from: 0, to: 0, step: 1 }],
  );
  assert.equal(
    draft('a = input.time(timestamp("2024-01-01"), "A")', 1_704_067_200_000).searched,
    false,
  );
});

test('row errors come from the package and block the space (O6)', () => {
  const { rows, space, errorCount } = setup({
    Length: range(50, 10, 1),
    Source: { searched: true, values: { kind: 'list', values: [] } },
  });
  assert.deepEqual(rows[0].error, optimizerMessage('searchRangeReversed', { title: 'Length' }));
  assert.deepEqual(rows[2].error, optimizerMessage('searchValueRequired', { title: 'Source' }));
  assert.deepEqual(rows[0].values, []);
  assert.equal(space, null);
  assert.equal(errorCount, 2);

  const below = setup({ Length: { ...range(10, 50, 1), searched: false, fixed: 5 } });
  assert.deepEqual(
    below.rows[0].error,
    optimizerMessage('searchMin', { title: 'Length', min: 10 }),
  );
  assert.deepEqual(
    setup({ Multiplier: range(1, 2, 0) }).rows[1].error,
    optimizerMessage('searchRangeFinite', { title: 'Multiplier' }),
  );
});

test('a row left with one value, or unchecked, fixes the input', () => {
  const { rows, space } = setup({
    Length: range(30, 30, 1),
    Multiplier: { ...range(1, 4, 0.25), searched: false },
    Source: { searched: true, values: { kind: 'list', values: ['hl2'] } },
    Direction: {
      searched: false,
      values: { kind: 'list', values: ['Both', 'Long'] },
      fixed: 'Short',
    },
    'Use trailing stop': { searched: false, values: { kind: 'list', values: [false, true] } },
  });
  assert.deepEqual(
    rows.slice(0, 5).map((row) => [row.status, row.values]),
    [
      ['fixed', [30]],
      ['fixed', [2]],
      ['fixed', ['hl2']],
      ['fixed', [false]],
      ['fixed', ['Short']],
    ],
  );
  assert.equal(space?.combinationCount, 1);
  assert.deepEqual(space?.fixedParameters, {
    Length: 30,
    Multiplier: 2,
    Source: 'hl2',
    'Use trailing stop': false,
    Direction: 'Short',
    'Trade window': '0930-1600',
  });
});

test('a grid above the limit samples at random and says so (O5)', () => {
  // Edited rows can take the grid past the limit; rows left to their default then start fixed.
  const big = setup({ Multiplier: range(0.25, 200, 0.25) });
  assert.deepEqual(
    big.rows.slice(2, 5).map((row) => row.status),
    ['fixed', 'fixed', 'fixed'],
  );
  assert.equal(big.space!.combinationCount > gridLimit, true);
  assert.deepEqual(big.sampling, {
    method: 'random',
    switched: true,
    gridCombinations: big.space!.combinationCount,
    combinations: 2000,
    count: 2000,
    seed: 42,
    notice: workflowMessage('optimize.gridSwitchedToRandom', {
      count: big.space!.combinationCount,
      limit: gridLimit,
    }),
    error: null,
  });
  const random = setup({}, { method: 'random', count: 5000, seed: 7 });
  assert.equal(random.sampling?.combinations, 5000);
  assert.equal(random.sampling?.switched, false);
  assert.deepEqual(
    setup({}, { method: 'random', count: 1.5, seed: 7 }).sampling?.error,
    optimizerMessage('searchRandomIntegers'),
  );
  const none = setup({}, { method: 'random', count: 0, seed: 7 });
  assert.deepEqual(none.sampling?.error, workflowMessage('optimize.sampleCountPositive'));
  assert.equal(none.errorCount, 1);
  assert.equal(setup({}, { method: 'grid', count: 0, seed: 1.5 }).sampling?.error, null);
});

test('the search key follows what the run would search, not how it is written', () => {
  const base = setup().key;
  assert.equal(
    setup({
      Source: { searched: true, values: { kind: 'list', values: ['ohlc4', 'hl2', 'close'] } },
    }).key,
    base,
  );
  assert.notEqual(setup({ Length: range(10, 30, 1) }).key, base);
  assert.notEqual(setup({}, { ...grid, method: 'random' }).key, base);
  assert.notEqual(
    searchSetup(descriptors, new Map(), { ...current, 'Trade window': '0800-1200' }, grid).key,
    base,
  );
});

test('drafts survive a recompile while the input keeps its type and choices', () => {
  const draft = range(12, 20, 2);
  const length = byTitle('Length');
  assert.equal(keepSearchDraft(length, { descriptor: length, draft }), draft);
  assert.equal(
    keepSearchDraft({ ...length, type: 'float' }, { descriptor: length, draft }),
    undefined,
  );
  const direction = byTitle('Direction');
  const kept: SearchDraft = { searched: true, values: { kind: 'list', values: ['Long'] } };
  assert.notEqual(
    keepSearchDraft(
      { ...direction, options: ['Both', 'Long'] },
      { descriptor: direction, draft: kept },
    ),
    kept,
  );
  assert.equal(keepSearchDraft(length, undefined), undefined);
});

test('the data range splits as splitBars does, or explains why it cannot', () => {
  const bars = syntheticBars(100);
  const split = splitBars(bars, { mode: 'in-out', splitRatio: 0.7 });
  assert.deepEqual(dataRange(bars, defaultValidation), {
    all: { start: bars[0].time, end: bars[99].time, bars: 100 },
    inSample: { start: bars[0].time, end: split.inSample.at(-1)!.time, bars: 70 },
    outOfSample: { start: split.outOfSample[0].time, end: bars[99].time, bars: 30 },
    error: null,
  });
  assert.deepEqual(dataRange(bars, { ...defaultValidation, mode: 'none' }).inSample, null);
  assert.deepEqual(
    dataRange(bars, { ...defaultValidation, outOfSamplePercent: 100 }).error,
    optimizerMessage('splitRatioRange'),
  );
  assert.deepEqual(
    dataRange(bars.slice(0, 1), defaultValidation).error,
    optimizerMessage('splitNeedsBars'),
  );
});

test('the duration estimate spreads the measured cost over the threads', () => {
  assert.equal(estimateDurationMs(0.02, 10_000, 700, 7), 20_000);
  assert.equal(estimateDurationMs(null, 10_000, 700, 7), null);
  assert.equal(estimateDurationMs(0.02, 10_000, 0, 7), null);
});

test('without data only an invalid share is an error', () => {
  assert.equal(dataRange([], defaultValidation).error, null);
  assert.deepEqual(
    dataRange([], { ...defaultValidation, outOfSamplePercent: 0 }).error,
    optimizerMessage('splitRatioRange'),
  );
});
