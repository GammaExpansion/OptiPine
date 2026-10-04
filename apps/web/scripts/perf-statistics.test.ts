import assert from 'node:assert/strict';
import { test } from 'node:test';
import { snapshotIntervals, statistics } from './perf-statistics.ts';

test('empty samples do not claim zero latency, and percentiles use nearest ranks', () => {
  assert.deepEqual(statistics([]), { count: 0, p50: null, p95: null, max: null, over50: 0 });
  const values = [100, ...Array.from({ length: 19 }, (_, i) => i + 1)];
  assert.deepEqual(statistics(values), { count: 20, p50: 10, p95: 19, max: 100, over50: 1 });
  assert.equal(values[0], 100);
});

test('cadence excludes phase and window transitions but preserves rapid same-phase publications', () => {
  assert.deepEqual(
    snapshotIntervals([
      { at: 0, phase: 'in', window: null },
      { at: 251, phase: 'in', window: null },
      { at: 260, phase: 'out', window: null },
      { at: 510, phase: 'out', window: null },
      { at: 511, phase: 'in', window: 0 },
      { at: 520, phase: 'in', window: 0 },
      { at: 525, phase: 'in', window: 1 },
    ]),
    [251, 250, 9],
  );
});
