import assert from 'node:assert/strict';
import { test } from 'node:test';
import { consecutiveLossesMetric } from '@pine/optimizer';
import type { OptimizationTrial } from '@pine/workers';
import { windowSelectionRecords } from './optimize-records.ts';
import { selectionRecords } from './walk-forward.ts';

test('large window extraction yields, preserves metric semantics and reuses completed columns', async () => {
  const trials: OptimizationTrial[] = Array.from({ length: 100 }, (_, index) => ({
    trialId: String(index),
    parameters: { inputs: { Length: index } },
    metrics: {
      'Performance/Net profit/All USD': index === 0 ? null : index,
      'Performance/Net profit/All %': index / 10,
    },
    diagnostics: [],
    tradeCount: 3,
    statistics: { maxConsecutiveLosses: 2 },
  }));
  const metrics = ['Net profit', 'Performance/Net profit/All %', consecutiveLossesMetric];
  let yields = 0;
  const cache = new Map<string, readonly (number | null)[]>();
  const actual = await windowSelectionRecords(trials, metrics, cache, async () => {
    yields++;
  });
  assert.ok(yields >= 3);
  assert.deepEqual(actual, selectionRecords(trials, metrics, new Map()));
  const column = cache.get('Net profit');
  const previousYields = yields;
  await windowSelectionRecords(trials, metrics, cache, async () => {
    yields++;
  });
  assert.equal(yields, previousYields);
  assert.equal(cache.get('Net profit'), column);
  assert.equal(cache.has(consecutiveLossesMetric), false);
});

test('a small window needs no task boundary and a changed count refreshes its columns', async () => {
  const cache = new Map<string, readonly (number | null)[]>([['Net profit', [99]]]);
  const records = await windowSelectionRecords([], ['Net profit'], cache, async () => {
    assert.fail('unnecessary yield');
  });
  assert.deepEqual(records, []);
  assert.deepEqual(cache.get('Net profit'), []);
});
