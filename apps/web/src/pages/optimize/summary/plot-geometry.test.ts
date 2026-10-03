import { expect, test } from 'vitest';
import { envelope, extent, nearestPoint, scale } from './plot-geometry.ts';

test('bounds ignore missing values and keep zero and constant series plottable', () => {
  expect(extent([[NaN, Infinity]])).toEqual([0, 1]);
  expect(extent([[100, 100]])).toEqual([99, 101]);
  const bounds = extent([[100, 200]], true);
  expect(bounds[0]).toBeLessThan(0);
  expect(bounds[1]).toBeGreaterThan(200);
  expect(scale([10, 20], 100, 0)(15)).toBe(50);
});

test('pixel envelopes retain spikes, chronological order and the last bar', () => {
  const values = Array.from({ length: 1000 }, (_, index) =>
    index === 51 ? -500 : index === 52 ? 900 : 0,
  );
  const points = envelope(values, 100);
  expect(points).toContainEqual({ index: 51, value: -500 });
  expect(points).toContainEqual({ index: 52, value: 900 });
  expect(points.at(-1)).toEqual({ index: 999, value: 0 });
  expect(points.length).toBeLessThanOrEqual(201);
  expect(points.map((point) => point.index)).toEqual(
    points.map((point) => point.index).sort((a, b) => a - b),
  );
  expect(envelope([], 0)).toEqual([]);
});

test('scatter hit testing chooses the nearest dot and ignores empty space', () => {
  const points = [
    { x: 10, y: 12 },
    { x: 14, y: 16 },
  ];
  expect(nearestPoint(points, 13, 15)).toBe(1);
  expect(nearestPoint(points, 100, 100)).toBeNull();
});
