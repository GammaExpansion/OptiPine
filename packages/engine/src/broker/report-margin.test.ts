import assert from 'node:assert/strict';
import test from 'node:test';
import { averageMarginUsed } from './report-margin.ts';

test('average margin starts at the earliest actual entry and includes flat bars within the period', () => {
  const trades = [{ entryBar: 4 }, { entryBar: 2 }];
  const margins = [0, 0, 12, 0, 24, 999];
  assert.equal(averageMarginUsed(trades, margins, 6), 12);
  assert.equal(averageMarginUsed([...trades].reverse(), margins, 6), 12);
  assert.equal(averageMarginUsed(trades, [0, 0, 12, 0, 24, 1], 6), 12);
  assert.deepEqual(trades, [{ entryBar: 4 }, { entryBar: 2 }]);
  assert.deepEqual(margins, [0, 0, 12, 0, 24, 999]);
});

test('idle history before entry does not dilute margin and scaling preserves the mean', () => {
  const margins = [0, 12, 18, 200];
  assert.equal(averageMarginUsed([{ entryBar: 1 }], margins, 4), 15);
  assert.equal(averageMarginUsed([{ entryBar: 3 }], [0, 0, ...margins], 6), 15);
  assert.equal(
    averageMarginUsed(
      [{ entryBar: 1 }],
      margins.map((value) => value * 3),
      4,
    ),
    45,
  );
  assert.equal(averageMarginUsed([{ entryBar: 1 }], [0, 0, 0, 0], 4), 0);
});

test('incomplete or invalid margin observations do not become averages', () => {
  const trades = [{ entryBar: 1 }];
  for (const margins of [
    undefined,
    [0, 10],
    [0, 10, 20, 30],
    [0, NaN, 20],
    [0, -10, 20],
    [0, 10, Infinity],
  ])
    assert.equal(averageMarginUsed(trades, margins, 3), undefined);
  const sparse = [0, 10, 20];
  delete sparse[1];
  assert.equal(averageMarginUsed(trades, sparse, 3), undefined);
  for (const entryBar of [-1, 0.5, 3, NaN, Infinity])
    assert.equal(averageMarginUsed([{ entryBar }], [0, 10, 20], 3), undefined);
  for (const barCount of [-1, 0, 2.5, NaN, Infinity])
    assert.equal(averageMarginUsed(trades, [0, 10, 20], barCount), undefined);
});

test('a complete no-trade history has zero margin while unobserved intervals stay absent', () => {
  assert.equal(averageMarginUsed([], [], 0), undefined);
  assert.equal(averageMarginUsed([], [0, 0, 0], 3), 0);
  assert.equal(averageMarginUsed([], [0, 0], 3), undefined);
  assert.equal(averageMarginUsed([], [0, 10, 0], 3), undefined);
  assert.equal(averageMarginUsed([], [0, NaN, 0], 3), undefined);
  assert.equal(averageMarginUsed([{ entryBar: 2 }], [0, 0, 10], 3), undefined);
  assert.equal(averageMarginUsed([{ entryBar: 0 }], [10], 1), undefined);
});
