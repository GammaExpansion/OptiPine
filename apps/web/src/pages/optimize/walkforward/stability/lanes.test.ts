import { expect, it } from 'vitest';
import { bandRect, nearSegments, valuePosition } from './lanes.ts';

it('uses one numeric scale for every window, including irregular searched values', () => {
  expect(valuePosition([10, 20, 50], 10)).toBe(54);
  expect(valuePosition([10, 20, 50], 20)).toBe(43);
  expect(valuePosition([10, 20, 50], 50)).toBe(10);
  expect(valuePosition([10, 20, 50], null)).toBeNull();
  expect(valuePosition([10, 20, 50], 25)).toBeNull();
  expect(valuePosition([], 0)).toBeNull();
});

it('centres a singleton and lays out options and booleans without coercing their identity', () => {
  expect(valuePosition(['close'], 'close')).toBe(32);
  expect(valuePosition(['close', 'hl2', 'ohlc4'], 'hl2')).toBe(32);
  expect(valuePosition([false, true], false)).toBe(54);
  expect(valuePosition([false, true], true)).toBe(10);
  expect(valuePosition([false, true], 0)).toBeNull();
});

it('draws disjoint near-optimal values as separate bands and keeps single values visible', () => {
  expect(nearSegments([1, 2, 3, 4, 5], [5, 1, 2])).toEqual([
    { from: 1, to: 2 },
    { from: 5, to: 5 },
  ]);
  expect(nearSegments([false, true], [true])).toEqual([{ from: true, to: true }]);
  expect(nearSegments([1, 2], [])).toEqual([]);
  expect(bandRect([1, 2, 3], 2, 2)).toEqual({ y: 29, height: 6 });
  expect(bandRect([1, 2, 3], 1, 3)).toEqual({ y: 7, height: 50 });
  expect(bandRect([1, 2, 3], 1, 4)).toBeNull();
});
