import assert from 'node:assert/strict';
import { test } from 'node:test';
import { aggregateHours } from './perf-market.ts';

test('recording aggregation preserves OHLCV and omits incomplete UTC buckets', () => {
  const bars = Array.from({ length: 9 }, (_, i) => ({
    time: (i + 1) * 3600,
    open: i,
    high: i + 3,
    low: i - 2,
    close: i + 1,
    volume: i + 10,
  }));
  assert.deepEqual(aggregateHours(bars, 4), [
    { time: 14400, open: 3, high: 9, low: 1, close: 7, volume: 58 },
  ]);
  assert.deepEqual(aggregateHours(bars, 1), bars);
  assert.deepEqual(aggregateHours([bars[3], bars[3], bars[5], bars[6]], 4), []);
  assert.throws(() => aggregateHours(bars, 0));
});
